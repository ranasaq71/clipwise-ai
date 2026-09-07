import React, { useState } from "react";
import { api } from "@/lib/api";
import { detectFaces, grabFrame, matchPerson, seekTo } from "@/lib/face";
import ConfidenceRing from "@/components/ConfidenceRing";
import { ScanFace, Loader2, UserPlus, X, Radar, AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Face recognition workspace.
 *
 * 1. "Detect faces in this frame" runs a browser-side detector on the frame the
 *    player is currently showing and lets you name anyone it finds.
 * 2. Naming a face stores its 128-float descriptor against the event.
 * 3. "Scan the video" walks the timeline, matches every face it sees against the
 *    enrolled descriptors, and writes the appearances back so the timeline shows
 *    where each named person turns up.
 */
export default function FaceStudio({ eventId, videoRef, people, onPeopleChange, onAppearances, duration }) {
  const [detecting, setDetecting] = useState(false);
  const [faces, setFaces] = useState([]);
  const [names, setNames] = useState({});
  const [roles, setRoles] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [scan, setScan] = useState(null); // { done, total, found }

  async function detectCurrentFrame() {
    setError("");
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError("Start the video first so there's a frame to look at.");
      return;
    }
    setDetecting(true);
    try {
      video.pause();
      const found = await detectFaces(grabFrame(video));
      setFaces(found.map((f) => ({ ...f, timestamp: video.currentTime })));
      if (found.length === 0) setError("No faces found in this frame. Try a closer shot.");
    } catch (e) {
      setError(`Face detection failed: ${e.message}. Check that the model files are reachable.`);
    } finally {
      setDetecting(false);
    }
  }

  async function enroll(face) {
    const name = (names[face.index] || "").trim();
    if (!name) return;
    setBusy(face.index);
    setError("");
    try {
      const existing = people.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        const { data } = await api.post(`/events/${eventId}/people/${existing.id}/descriptors`, {
          descriptor: face.descriptor,
          photo: face.thumbnail,
        });
        onPeopleChange(people.map((p) => (p.id === data.id ? data : p)));
      } else {
        const { data } = await api.post(`/events/${eventId}/people`, {
          name,
          role: (roles[face.index] || "").trim() || null,
          photos: [face.thumbnail],
          descriptors: [face.descriptor],
        });
        onPeopleChange([...people, data]);
      }
      // Record this frame as a confirmed appearance.
      await api.post(`/events/${eventId}/appearances`, {
        items: [{ name, timestamp: face.timestamp, confidence: 99 }],
      });
      setFaces((cur) => cur.filter((f) => f.index !== face.index));
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setBusy(null);
    }
  }

  async function removePerson(pid) {
    await api.delete(`/events/${eventId}/people/${pid}`);
    onPeopleChange(people.filter((p) => p.id !== pid));
  }

  async function scanVideo() {
    const video = videoRef.current;
    const enrolled = people.filter((p) => (p.descriptors || []).length > 0);
    if (!video || !video.duration) { setError("The video needs to be loaded first."); return; }
    if (enrolled.length === 0) { setError("Enroll at least one person before scanning."); return; }

    setError("");
    const dur = video.duration;
    const stepCount = Math.min(120, Math.max(20, Math.round(dur / 5)));
    const step = dur / stepCount;
    const wasMuted = video.muted;
    video.muted = true;
    video.pause();

    const found = [];
    setScan({ done: 0, total: stepCount, found: 0 });
    try {
      for (let i = 0; i < stepCount; i++) {
        const t = Math.min(dur - 0.05, i * step);
        await seekTo(video, t);
        const detections = await detectFaces(grabFrame(video, 640));
        for (const d of detections) {
          const m = matchPerson(d.descriptor, enrolled);
          if (m) found.push({ person_id: m.person.id, timestamp: t, confidence: m.confidence });
        }
        setScan({ done: i + 1, total: stepCount, found: found.length });
      }
      if (found.length) {
        const { data } = await api.post(`/events/${eventId}/appearances`, { items: found });
        onAppearances(data);
      }
    } catch (e) {
      setError(`Scan stopped: ${e.message}`);
    } finally {
      video.muted = wasMuted;
      setTimeout(() => setScan(null), 2500);
    }
  }

  return (
    <div className="space-y-4" data-testid="face-studio">
      <div className="card-glass p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-mono tracking-widest text-[#FFB000] mb-1">FACE RECOGNITION</div>
            <h3 className="font-heading text-lg">Name someone, find them everywhere.</h3>
            <p className="text-xs text-[#8F8F9D] mt-1 max-w-lg">
              Detection and matching run in your browser. Only the numeric descriptor is stored,
              scoped to this event — no face images leave the page unless you enroll them.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={detectCurrentFrame}
              disabled={detecting}
              data-testid="detect-faces"
              className="inline-flex items-center gap-2 bg-[#FFB000] text-black font-medium px-4 py-2.5 rounded-md hover:bg-[#E69E00] transition disabled:opacity-60"
            >
              {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanFace className="w-4 h-4" />}
              Detect faces in this frame
            </button>
            <button
              onClick={scanVideo}
              disabled={!!scan}
              data-testid="scan-video"
              className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2.5 rounded-md text-sm transition disabled:opacity-60"
            >
              {scan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radar className="w-4 h-4" />}
              Scan the video
            </button>
          </div>
        </div>

        {scan && (
          <div className="mt-4" data-testid="scan-progress">
            <div className="flex justify-between text-xs font-mono text-[#8F8F9D]">
              <span>Scanning frame {scan.done}/{scan.total}</span>
              <span className="text-[#00F298]">{scan.found} appearances</span>
            </div>
            <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#FFB000] to-[#00F298] transition-all" style={{ width: `${(scan.done / scan.total) * 100}%` }} />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 text-sm text-[#EF4444]" data-testid="face-error">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
          </div>
        )}
      </div>

      {faces.length > 0 && (
        <div className="card-soft p-5" data-testid="detected-faces">
          <div className="text-xs font-mono tracking-widest text-[#8F8F9D] mb-3 uppercase">
            {faces.length} FACE{faces.length > 1 ? "S" : ""} DETECTED — NAME THEM TO ENROLL
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {faces.map((f) => (
              <div key={f.index} className="card-glass p-3 flex gap-3" data-testid={`detected-face-${f.index}`}>
                <img src={f.thumbnail} alt="" className="w-20 h-20 rounded-md object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <input
                    value={names[f.index] || ""}
                    onChange={(e) => setNames({ ...names, [f.index]: e.target.value })}
                    placeholder="Name"
                    data-testid={`face-name-${f.index}`}
                    className="w-full bg-[#0A0A0E] border border-white/10 rounded px-2 py-1.5 text-sm focus:border-[#FFB000] focus:outline-none"
                  />
                  <input
                    value={roles[f.index] || ""}
                    onChange={(e) => setRoles({ ...roles, [f.index]: e.target.value })}
                    placeholder="Role (optional)"
                    className="w-full bg-[#0A0A0E] border border-white/10 rounded px-2 py-1.5 text-xs focus:border-[#FFB000] focus:outline-none"
                  />
                  <button
                    onClick={() => enroll(f)}
                    disabled={busy === f.index || !(names[f.index] || "").trim()}
                    data-testid={`face-enroll-${f.index}`}
                    className="w-full inline-flex items-center justify-center gap-1.5 text-xs bg-[#FFB000] text-black font-medium px-3 py-1.5 rounded hover:bg-[#E69E00] transition disabled:opacity-50"
                  >
                    {busy === f.index ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />} Enroll
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-soft p-5">
        <div className="text-xs font-mono tracking-widest text-[#8F8F9D] mb-4 uppercase">{people.length} ENROLLED</div>
        {people.length === 0 ? (
          <div className="text-sm text-[#565666]">No one enrolled yet — pause on a face and hit “Detect faces in this frame”.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {people.map((p) => (
              <div key={p.id} className="card-glass p-4 relative group" data-testid={`person-card-${p.id}`}>
                <button
                  onClick={() => removePerson(p.id)}
                  data-testid={`remove-person-${p.id}`}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/5 hover:bg-[#EF4444] flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="flex justify-center mb-3">
                  <ConfidenceRing
                    pct={p.confidence}
                    size={64}
                    src={p.photos?.[0]}
                    label={p.name?.[0]}
                    sublabel={`${p.confidence}%`}
                    testid={`ring-${p.id}`}
                  />
                </div>
                <div className="font-heading text-sm text-center font-semibold truncate mt-2">{p.name}</div>
                <div className="text-[10px] font-mono text-[#8F8F9D] text-center mt-0.5 uppercase tracking-widest truncate">
                  {p.role || "Guest"}
                </div>
                <div className="text-[10px] font-mono text-center mt-1 text-[#565666] inline-flex items-center gap-1 w-full justify-center">
                  <CheckCircle2 className="w-3 h-3 text-[#00F298]" />
                  {(p.descriptors || []).length} REF · {p.appearance_count || 0} SEEN
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
