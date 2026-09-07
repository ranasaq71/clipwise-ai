import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, BACKEND_URL, getToken } from "@/lib/api";
import { EVENT_TYPES, HIGHLIGHT_PREFERENCES, fmtBytes } from "@/lib/constants";
import {
  Upload as UploadIcon, FileVideo, ArrowRight, ArrowLeft,
  CheckCircle2, Loader2, Sparkles, AlertTriangle, Calendar
} from "lucide-react";

const STEPS = [
  { n: 1, t: "Upload" },
  { n: 2, t: "Details" },
  { n: 3, t: "Highlights" },
  { n: 4, t: "AI Processing" },
  { n: 5, t: "Finish" },
];

// Chunked upload — keeps each request small enough for proxies/ingress limits.
const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB
const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB per the spec

async function chunkedUpload(eventId, file, onProgress) {
  const { data: init } = await api.post(`/events/${eventId}/upload/init`, {
    filename: file.name,
    size: file.size,
    content_type: file.type || "video/mp4",
  });
  const uploadId = init.upload_id;
  const total = Math.ceil(file.size / CHUNK_SIZE);
  let uploaded = 0;

  for (let i = 0; i < total; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const blob = file.slice(start, end);
    const form = new FormData();
    // Send the real content type so storage receives a correct Content-Type.
    form.append("chunk", new File([blob], `chunk-${i}`, { type: "application/octet-stream" }));

    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await api.post(
          `/events/${eventId}/upload/chunk?upload_id=${encodeURIComponent(uploadId)}&chunk_index=${i}&total_chunks=${total}`,
          form,
          { headers: { "Content-Type": "multipart/form-data" }, timeout: 180000 }
        );
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    if (lastErr) throw lastErr;
    uploaded += blob.size;
    if (onProgress) onProgress(Math.min(99, Math.round((uploaded / file.size) * 100)));
  }

  const params = new URLSearchParams({
    upload_id: uploadId,
    filename: file.name,
    total_chunks: String(total),
    content_type: file.type || "video/mp4",
  });
  const { data } = await api.post(`/events/${eventId}/upload/complete?${params.toString()}`, {}, { timeout: 600000 });
  if (onProgress) onProgress(100);
  return data;
}

export default function Wizard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(1);
  const [eventId, setEventId] = useState(params.get("event") || null);

  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState("wedding");
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [prefs, setPrefs] = useState(["emotional", "speeches", "action"]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState(null); // { progress, stage, status, message }

  // ---------- Step 1 → create the event shell and upload the file ----------
  async function uploadAndContinue() {
    if (!file) { setError("Pick a video file first."); return; }
    if (file.size > MAX_FILE_BYTES) {
      setError(`That file is ${fmtBytes(file.size)}. The limit is 500 MB.`);
      return;
    }
    setError("");
    setBusy(true);
    try {
      let id = eventId;
      if (!id) {
        const { data } = await api.post("/events", {
          title: file.name.replace(/\.[^.]+$/, ""),
          event_type: "wedding",
        });
        id = data.id;
        setEventId(id);
      }
      setUploading(true);
      await chunkedUpload(id, file, setUploadProgress);
      setUploading(false);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
      setStep(2);
    } catch (e) {
      setUploading(false);
      setError(errText(e, "Upload failed."));
    } finally {
      setBusy(false);
    }
  }

  // ---------- Step 2 → save details ----------
  async function saveDetails() {
    if (!title.trim()) { setError("Please give this event a name."); return; }
    setError("");
    setBusy(true);
    try {
      await api.patch(`/events/${eventId}`, {
        title,
        event_type: eventType,
        event_date: eventDate,
        step: 3,
      });
      setStep(3);
    } catch (e) {
      setError(errText(e, "Could not save event details."));
    } finally {
      setBusy(false);
    }
  }

  // ---------- Step 3 → save preferences and start processing ----------
  async function startProcessing() {
    if (prefs.length === 0) { setError("Pick at least one kind of moment to look for."); return; }
    setError("");
    setBusy(true);
    try {
      await api.patch(`/events/${eventId}`, { highlight_preferences: prefs, step: 4 });
      await api.post(`/events/${eventId}/process`);
      setStep(4);
    } catch (e) {
      setError(errText(e, "Could not start processing."));
    } finally {
      setBusy(false);
    }
  }

  // ---------- Step 4 → follow real progress over SSE ----------
  useEffect(() => {
    if (step !== 4 || !eventId) return;
    let closed = false;
    const token = getToken();
    const url = `${BACKEND_URL}/api/events/${eventId}/progress?token=${encodeURIComponent(token || "")}`;
    const es = new EventSource(url);

    es.onmessage = (ev) => {
      if (closed) return;
      try {
        const data = JSON.parse(ev.data);
        setJob(data);
        if (data.status === "ready") { es.close(); setTimeout(() => setStep(5), 600); }
        if (data.status === "error") { es.close(); setError(data.message || "Processing failed."); }
      } catch {}
    };
    es.onerror = () => {
      // Fall back to polling if the SSE stream drops.
      es.close();
      if (closed) return;
      const t = setInterval(async () => {
        try {
          const { data } = await api.get(`/events/${eventId}/status`);
          setJob(data);
          if (data.status === "ready") { clearInterval(t); setStep(5); }
          if (data.status === "error") { clearInterval(t); setError(data.message || "Processing failed."); }
        } catch {}
      }, 4000);
      return () => clearInterval(t);
    };
    return () => { closed = true; es.close(); };
  }, [step, eventId]);

  return (
    <div className="max-w-5xl mx-auto" data-testid="wizard-page">
      {/* Stepper */}
      <div className="card-soft p-4 mb-8 flex items-center justify-between">
        {STEPS.map((s, i) => {
          const active = step === s.n;
          const done = step > s.n;
          return (
            <React.Fragment key={s.n}>
              <div className="flex items-center gap-3" data-testid={`wizard-step-${s.n}`}>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold transition
                    ${active ? "bg-[#FFB000] text-black glow-gold" : done ? "bg-[#00F298] text-black" : "bg-white/5 text-[#8F8F9D]"}`}
                >
                  {done ? <CheckCircle2 className="w-4 h-4" /> : s.n}
                </div>
                <span className={`hidden sm:block text-sm ${active ? "text-white" : "text-[#8F8F9D]"}`}>{s.t}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 ${done ? "bg-[#00F298]" : "bg-white/10"}`} />}
            </React.Fragment>
          );
        })}
      </div>

      {error && (
        <div className="card-soft border-[#EF4444]/50 text-[#EF4444] p-3 mb-4 flex items-start gap-2" data-testid="wizard-error">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === 1 && (
        <StepUpload
          file={file} setFile={setFile}
          uploading={uploading} uploadProgress={uploadProgress}
          onNext={uploadAndContinue} busy={busy}
        />
      )}
      {step === 2 && (
        <StepDetails
          title={title} setTitle={setTitle}
          eventType={eventType} setEventType={setEventType}
          eventDate={eventDate} setEventDate={setEventDate}
          onBack={() => setStep(1)} onNext={saveDetails} busy={busy}
        />
      )}
      {step === 3 && (
        <StepPreferences
          prefs={prefs} setPrefs={setPrefs}
          onBack={() => setStep(2)} onNext={startProcessing} busy={busy}
        />
      )}
      {step === 4 && <StepProcessing job={job} title={title} />}
      {step === 5 && <StepDone onFinish={() => navigate(`/app/events/${eventId}`)} title={title} />}
    </div>
  );
}

function errText(e, fallback) {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join(" ");
  return e?.message || fallback;
}

/* ---------- Step 1: Upload ---------- */
function StepUpload({ file, setFile, uploading, uploadProgress, onNext, busy }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl">Upload your raw footage.</h1>
        <p className="text-[#8F8F9D] mt-1">
          Up to 500 MB, H.264/MP4 preferred. The file is uploaded in 8 MB chunks and transcoded server-side.
        </p>
      </div>

      <label
        htmlFor="filepick"
        data-testid="filepicker"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`block card-glass p-12 text-center cursor-pointer transition ${dragging ? "border-[#FFB000] glow-gold" : "hover:border-[#FFB000]/60"}`}
      >
        {file ? <FileVideo className="w-10 h-10 text-[#00F298] mx-auto" strokeWidth={1.2} />
              : <UploadIcon className="w-10 h-10 text-[#FFB000] mx-auto" strokeWidth={1.2} />}
        <div className="font-heading text-lg mt-4">{file ? file.name : "Drop your video file or click to browse"}</div>
        <div className="text-xs text-[#565666] mt-2 font-mono">
          {file ? `${fmtBytes(file.size)} · ${file.type || "video"}` : "MP4 · MOV · WebM · M4V · AVI · MKV — up to 500 MB · chunked"}
        </div>
        <input
          id="filepick" ref={inputRef} type="file" accept="video/*" className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          data-testid="filepicker-input"
        />
      </label>

      {uploading && (
        <div className="card-glass p-5" data-testid="upload-progress">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-[#FFB000] animate-spin" />
            <div className="flex-1">
              <div className="flex justify-between items-baseline">
                <span className="font-heading text-base">Uploading <span className="text-[#FFB000]">{file?.name}</span></span>
                <span className="font-mono text-sm text-[#FFB000]">{uploadProgress}%</span>
              </div>
              <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#FFB000] to-[#00F298] transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
              <div className="text-[10px] font-mono text-[#565666] mt-1.5">{file ? fmtBytes(file.size) : ""} · do not close this tab</div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={busy || uploading || !file}
          data-testid="wizard-step1-next"
          className="inline-flex items-center gap-2 bg-[#FFB000] text-black font-medium px-6 py-3 rounded-md hover:bg-[#E69E00] transition glow-gold disabled:opacity-60"
        >
          {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading {uploadProgress}%</>
            : busy ? <Loader2 className="w-4 h-4 animate-spin" />
            : <>Continue <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}

/* ---------- Step 2: Details ---------- */
function StepDetails({ title, setTitle, eventType, setEventType, eventDate, setEventDate, onBack, onNext, busy }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl">What did you film?</h1>
        <p className="text-[#8F8F9D] mt-1">ClipWise loads the right AI profile — highlight scoring, search keywords, brand focus.</p>
      </div>

      <div className="card-soft p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-xs font-mono tracking-widest text-[#8F8F9D] mb-2 uppercase">EVENT NAME</label>
          <input
            type="text"
            data-testid="wizard-title-input"
            value={title}
            placeholder="e.g. Anya & James — Vineyard Wedding"
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-[#0A0A0E] border border-white/10 rounded-md px-4 py-3 text-white focus:border-[#FFB000] focus:outline-none transition"
          />
        </div>
        <div>
          <label className="block text-xs font-mono tracking-widest text-[#8F8F9D] mb-2 uppercase">EVENT DATE</label>
          <div className="relative">
            <Calendar className="w-4 h-4 text-[#8F8F9D] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              data-testid="wizard-date-input"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full bg-[#0A0A0E] border border-white/10 rounded-md pl-11 pr-4 py-3 text-white focus:border-[#FFB000] focus:outline-none transition"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {EVENT_TYPES.map((e) => (
          <button
            key={e.id}
            data-testid={`event-type-${e.id}`}
            onClick={() => setEventType(e.id)}
            className={`relative text-left aspect-[4/3] rounded-xl overflow-hidden border transition group
              ${eventType === e.id ? "border-[#FFB000] glow-gold" : "border-white/10 hover:border-white/20"}`}
          >
            <img src={e.image} alt={e.label} className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:scale-105 transition" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/40 to-transparent" />
            <div className="absolute inset-0 p-5 flex flex-col justify-end">
              <div className="font-heading text-xl font-semibold">{e.label}</div>
              <div className="text-xs text-[#C6C6D0] mt-1">{e.tagline}</div>
            </div>
            {eventType === e.id && (
              <span className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#FFB000] flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-black" />
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} data-testid="wizard-step2-back" className="text-[#8F8F9D] hover:text-white transition inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={onNext}
          disabled={busy}
          data-testid="wizard-step2-next"
          className="inline-flex items-center gap-2 bg-[#FFB000] text-black font-medium px-6 py-3 rounded-md hover:bg-[#E69E00] transition glow-gold disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}

/* ---------- Step 3: Highlight preferences ---------- */
function StepPreferences({ prefs, setPrefs, onBack, onNext, busy }) {
  function toggle(id) {
    setPrefs((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl">Which moments matter?</h1>
        <p className="text-[#8F8F9D] mt-1">These steer the prompts sent to TwelveLabs Pegasus when it scores your footage.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {HIGHLIGHT_PREFERENCES.map((p) => {
          const on = prefs.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              data-testid={`pref-${p.id}`}
              className={`text-left p-4 rounded-xl border transition ${on ? "border-[#FFB000] bg-[#0E0E12] glow-gold" : "border-white/10 bg-[#0A0A0E] hover:border-white/20"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-heading">{p.label}</div>
                <span className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center ${on ? "bg-[#FFB000]" : "bg-white/5"}`}>
                  {on && <CheckCircle2 className="w-3.5 h-3.5 text-black" />}
                </span>
              </div>
              <div className="text-xs text-[#565666] mt-2 font-mono">{p.hint}</div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} data-testid="wizard-step3-back" className="text-[#8F8F9D] hover:text-white transition inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={onNext}
          disabled={busy}
          data-testid="wizard-step3-next"
          className="inline-flex items-center gap-2 bg-[#FFB000] text-black font-medium px-6 py-3 rounded-md hover:bg-[#E69E00] transition glow-gold disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Start AI processing <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}

/* ---------- Step 4: AI processing (real progress) ---------- */
const STAGES = [
  { key: "transcode", t: "Transcoding to H.264/AAC with faststart" },
  { key: "upload_storage", t: "Storing the master in object storage" },
  { key: "index", t: "Indexing with TwelveLabs" },
  { key: "highlights", t: "Detecting moments with Pegasus" },
  { key: "finalize", t: "Compiling the timeline" },
];

function StepProcessing({ job, title }) {
  const progress = Math.round(job?.progress ?? 0);
  const currentIdx = Math.max(0, STAGES.findIndex((s) => s.key === job?.stage));
  return (
    <div className="space-y-6" data-testid="wizard-processing">
      <div>
        <h1 className="font-heading text-3xl">Processing <span className="text-[#FFB000]">{title || "your event"}</span></h1>
        <p className="text-[#8F8F9D] mt-1">Running as a background job — you can leave this page and come back.</p>
      </div>
      <div className="card-glass p-8">
        <div className="flex items-center gap-4">
          <Loader2 className="w-8 h-8 text-[#FFB000] animate-spin" />
          <div className="flex-1">
            <div className="flex justify-between items-baseline">
              <span className="font-heading text-2xl" data-testid="processing-pct">{progress}%</span>
              <span className="text-xs font-mono text-[#8F8F9D]">{job?.message || "starting…"}</span>
            </div>
            <div className="mt-3 h-2 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#FFB000] to-[#00F298] transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
        <ul className="mt-8 space-y-3">
          {STAGES.map((s, i) => {
            const done = i < currentIdx || job?.status === "ready";
            const current = i === currentIdx && job?.status !== "ready";
            return (
              <li key={s.key} className="flex items-center gap-3 text-sm">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center ${done ? "bg-[#00F298] text-black" : current ? "bg-[#FFB000] text-black" : "bg-white/5 text-[#565666]"}`}>
                  {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : current ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : ""}
                </span>
                <span className={done ? "text-white" : current ? "text-[#FFB000]" : "text-[#565666]"}>{s.t}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ---------- Step 5: Done ---------- */
function StepDone({ onFinish, title }) {
  return (
    <div className="card-glass p-16 text-center" data-testid="wizard-done">
      <div className="w-16 h-16 rounded-full bg-[#00F298] glow-sage mx-auto flex items-center justify-center">
        <Sparkles className="w-7 h-7 text-black" />
      </div>
      <h1 className="font-heading text-4xl mt-6">Your event is ready.</h1>
      <p className="text-[#8F8F9D] mt-2 max-w-md mx-auto">
        Highlights detected and scored. Open "{title}" to scrub the timeline, enroll faces, and generate a reel.
      </p>
      <button
        onClick={onFinish}
        data-testid="wizard-finish"
        className="mt-8 inline-flex items-center gap-2 bg-[#FFB000] text-black font-medium px-7 py-3.5 rounded-md hover:bg-[#E69E00] transition glow-gold"
      >
        Open event dashboard <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
