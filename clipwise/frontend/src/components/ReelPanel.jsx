import React, { useEffect, useRef, useState } from "react";
import { api, BACKEND_URL, getToken, withToken } from "@/lib/api";
import { Film, Download, Loader2, AlertTriangle, Smartphone, Monitor, Sparkles } from "lucide-react";

/**
 * Highlight reel generator.
 * Kicks off a background ffmpeg job on the API, follows it over SSE, and hands
 * back a download when the finished MP4 lands in storage.
 */
export default function ReelPanel({ eventId, eventTitle, highlightCount }) {
  const [reel, setReel] = useState(null);
  const [vertical, setVertical] = useState(false);
  const [maxClips, setMaxClips] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const esRef = useRef(null);

  useEffect(() => {
    api.get(`/events/${eventId}/reel`).then(({ data }) => setReel(data)).catch(() => {});
    return () => esRef.current?.close();
  }, [eventId]);

  useEffect(() => {
    if (!reel || reel.status !== "processing") return;
    const token = getToken();
    const es = new EventSource(`${BACKEND_URL}/api/events/${eventId}/reel/progress?token=${encodeURIComponent(token || "")}`);
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        setReel(data);
        if (data.status === "ready" || data.status === "error") es.close();
      } catch {}
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [reel?.status, eventId]);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/events/${eventId}/reel`, {
        vertical,
        max_clips: Number(maxClips),
      });
      setReel(data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setBusy(false);
    }
  }

  const progress = Math.round(reel?.progress || 0);
  const filename = `${(eventTitle || "event").replace(/[^\w\-]+/g, "_")}_highlights.mp4`;

  return (
    <div className="card-glass p-5" data-testid="reel-panel">
      <div className="text-xs font-mono tracking-widest text-[#FFB000] mb-2">HIGHLIGHT REEL</div>
      <h3 className="font-heading text-lg">Cut the whole story into one file.</h3>
      <p className="text-xs text-[#8F8F9D] mt-1">
        Takes the top-scoring moments from TwelveLabs, cuts them with ffmpeg, and concatenates
        to H.264/AAC MP4 with faststart.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <div className="flex rounded-md overflow-hidden border border-white/10">
          <button
            onClick={() => setVertical(false)}
            data-testid="reel-format-wide"
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs transition ${!vertical ? "bg-[#FFB000] text-black" : "bg-white/5 text-[#C6C6D0] hover:bg-white/10"}`}
          >
            <Monitor className="w-3.5 h-3.5" /> 16:9
          </button>
          <button
            onClick={() => setVertical(true)}
            data-testid="reel-format-vertical"
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs transition ${vertical ? "bg-[#FFB000] text-black" : "bg-white/5 text-[#C6C6D0] hover:bg-white/10"}`}
          >
            <Smartphone className="w-3.5 h-3.5" /> 9:16 vertical
          </button>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-[#8F8F9D]">
          Clips
          <input
            type="number" min={1} max={30} value={maxClips}
            onChange={(e) => setMaxClips(e.target.value)}
            data-testid="reel-max-clips"
            className="w-16 bg-[#0A0A0E] border border-white/10 rounded px-2 py-1.5 text-white focus:border-[#FFB000] focus:outline-none"
          />
          <span className="font-mono text-[10px] text-[#565666]">of {highlightCount}</span>
        </label>
      </div>

      {reel?.status === "processing" ? (
        <div className="mt-4" data-testid="reel-progress">
          <div className="flex justify-between items-baseline text-xs font-mono">
            <span className="text-[#FFB000]">{reel.message || "cutting clips…"}</span>
            <span className="text-[#FFB000]">{progress}%</span>
          </div>
          <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#FFB000] to-[#00F298] transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : reel?.status === "ready" ? (
        <a
          href={withToken(`${BACKEND_URL}/api/events/${eventId}/reel/download`)}
          download={filename}
          data-testid="reel-download"
          className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-[#00F298] text-black font-medium px-5 py-3 rounded-md hover:brightness-110 transition glow-sage"
        >
          <Download className="w-4 h-4" /> Download {reel.vertical ? "9:16" : "16:9"} reel
        </a>
      ) : (
        <button
          onClick={generate}
          disabled={busy || highlightCount === 0}
          data-testid="generate-reel"
          className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-[#FFB000] text-black font-medium px-5 py-3 rounded-md hover:bg-[#E69E00] transition glow-gold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate highlight reel
        </button>
      )}

      {reel?.status === "ready" && (
        <button
          onClick={generate}
          disabled={busy}
          data-testid="regenerate-reel"
          className="mt-2 w-full inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-2.5 rounded-md text-xs transition"
        >
          <Film className="w-3.5 h-3.5" /> Regenerate with current settings
        </button>
      )}

      {(error || reel?.status === "error") && (
        <div className="mt-3 flex items-start gap-2 text-xs text-[#EF4444]" data-testid="reel-error">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="font-mono break-words">{error || reel?.message}</span>
        </div>
      )}
    </div>
  );
}
