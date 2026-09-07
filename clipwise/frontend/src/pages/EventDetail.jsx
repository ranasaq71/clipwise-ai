import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, BACKEND_URL, withToken } from "@/lib/api";
import { fmtTime, EVENT_TYPES, confidenceColor } from "@/lib/constants";
import ConfidenceRing from "@/components/ConfidenceRing";
import FaceStudio from "@/components/FaceStudio";
import ReelPanel from "@/components/ReelPanel";
import { useToast } from "@/hooks/use-toast";
import {
  Play, Pause, Search, Download, Share2, Film, ShoppingBag,
  Users, Sparkles, ExternalLink, Tag, Clock, Volume2,
  CheckCircle2, X, FileText, Mail, Copy, AlertTriangle, BarChart3
} from "lucide-react";

const DEMO_VIDEO_MP4 = `${BACKEND_URL}/api/assets/demo_video.mp4`;

export default function EventDetail() {
  const { eventId } = useParams();
  const { toast } = useToast();

  const [event, setEvent] = useState(null);
  const [people, setPeople] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [products, setProducts] = useState([]);
  const [clips, setClips] = useState([]);
  const [appearances, setAppearances] = useState([]);
  const [activeTab, setActiveTab] = useState("highlights");
  const [personFilter, setPersonFilter] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState("");

  // Video state
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [vTime, setVTime] = useState(0);
  const [vDur, setVDur] = useState(0);
  const [userVideoFailed, setUserVideoFailed] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const streamUrl = withToken(`${BACKEND_URL}/api/events/${eventId}/stream`);
  const hasOwnVideo = !!event?.has_video && !userVideoFailed;
  const videoSrc = hasOwnVideo ? streamUrl : DEMO_VIDEO_MP4;

  const reload = useCallback(async () => {
    try {
      const ev = await api.get(`/events/${eventId}`).then((r) => r.data);
      setEvent(ev);
      const [p, h, prods, cl, ap] = await Promise.all([
        api.get(`/events/${eventId}/people`).then((r) => r.data),
        api.get(`/events/${eventId}/highlights`).then((r) => r.data),
        api.get(`/events/${eventId}/products`).then((r) => r.data).catch(() => []),
        api.get(`/events/${eventId}/clips`).then((r) => r.data).catch(() => []),
        api.get(`/events/${eventId}/appearances`).then((r) => r.data).catch(() => []),
      ]);
      setPeople(p); setHighlights(h); setProducts(prods); setClips(cl); setAppearances(ap);
    } catch (e) {
      setLoadError(e.response?.data?.detail || e.message);
    }
  }, [eventId]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { setUserVideoFailed(false); setVideoError(false); }, [event?.id]);

  // Poll processing status; refresh highlights when it finishes.
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    let last = null;
    async function tick() {
      try {
        const { data } = await api.get(`/events/${eventId}/status`);
        if (cancelled) return;
        setStatus(data);
        if (last && last !== data.status && data.status === "ready") await reload();
        last = data.status;
        if (data.status === "ready" || data.status === "error") return;
      } catch {}
      if (!cancelled) setTimeout(tick, 5000);
    }
    tick();
    return () => { cancelled = true; };
  }, [eventId, reload]);

  const meta = useMemo(
    () => EVENT_TYPES.find((x) => x.id === event?.event_type) || EVENT_TYPES[0],
    [event]
  );

  const appearancesByPerson = useMemo(() => {
    const map = {};
    for (const a of appearances) (map[a.person_id] = map[a.person_id] || []).push(a);
    return map;
  }, [appearances]);

  const filteredHighlights = useMemo(() => {
    if (!personFilter) return highlights;
    const times = (appearancesByPerson[personFilter] || []).map((a) => a.timestamp);
    return highlights.filter(
      (h) =>
        h.people_ids?.includes(personFilter) ||
        times.some((t) => t >= h.timestamp - 3 && t <= h.timestamp + (h.duration || 8) + 3)
    );
  }, [highlights, personFilter, appearancesByPerson]);

  function seek(ts) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(ts, Math.max(0, (v.duration || ts) - 0.1));
    v.play().catch(() => {});
  }
  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  }

  async function runSearch(q) {
    setSearchQ(q);
    setSearchError("");
    if (!q.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const { data } = await api.get(`/events/${eventId}/search`, { params: { q } });
      setSearchResults(data);
    } catch (e) {
      setSearchResults([]);
      setSearchError(e.response?.data?.detail || e.message);
    } finally { setSearching(false); }
  }

  async function generateClip(highlightId, format) {
    try {
      const { data } = await api.post(`/events/${eventId}/clips`, { highlight_id: highlightId, format });
      setClips((cur) => [data, ...cur]);
      setActiveTab("clips");
    } catch (e) {
      toast({ title: "Clip failed", description: e.response?.data?.detail || e.message, variant: "destructive" });
    }
  }

  async function toggleProductApprove(p) {
    await api.post(`/events/${eventId}/products/${p.id}/approve`, { approved: !p.approved });
    setProducts((cur) => cur.map((x) => (x.id === p.id ? { ...x, approved: !p.approved } : x)));
  }

  async function copyPortalLink() {
    const url = `${window.location.origin}/portal/${eventId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Portal link copied", description: url });
    } catch {
      toast({ title: "Portal link", description: url });
    }
  }

  async function invite() {
    const email = window.prompt("Send the client portal invite to which email?");
    if (!email) return;
    try {
      await api.post(`/events/${eventId}/portal/invite`, { email });
      toast({ title: "Invite sent", description: `Portal link emailed to ${email}.` });
    } catch (e) {
      toast({ title: "Could not send invite", description: e.response?.data?.detail || e.message, variant: "destructive" });
    }
  }

  if (loadError) {
    return (
      <div className="card-soft border-[#EF4444]/50 p-6 text-[#EF4444] flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 mt-0.5" /> <div>{loadError}</div>
      </div>
    );
  }
  if (!event) return <div className="text-[#8F8F9D]">Loading…</div>;

  return (
    <div className="space-y-8" data-testid="event-detail-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <Link to="/app" data-testid="back-to-events" className="text-xs font-mono tracking-widest text-[#8F8F9D] hover:text-white inline-flex items-center gap-2">
            ← BACK TO EVENTS
          </Link>
          <div className="flex items-center gap-3 mt-3">
            <span className="px-2 py-1 rounded-sm font-mono text-[10px] font-bold tracking-widest" style={{ background: meta.accent, color: "#050505" }}>
              {meta.label.toUpperCase()}
            </span>
            <span className="text-xs font-mono text-[#565666]">{event.duration_min} MIN · {event.studio_name}</span>
          </div>
          <h1 className="font-heading text-4xl font-medium tracking-tight mt-3">{event.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={copyPortalLink} data-testid="copy-portal-link" className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2.5 rounded-md text-sm transition">
            <Copy className="w-4 h-4" /> Copy link
          </button>
          <button onClick={invite} data-testid="invite-client" className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2.5 rounded-md text-sm transition">
            <Mail className="w-4 h-4" /> Invite client
          </button>
          <a
            href={`/portal/${event.id}`}
            target="_blank"
            rel="noreferrer"
            data-testid="open-portal"
            className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2.5 rounded-md text-sm transition"
          >
            <Share2 className="w-4 h-4" /> Client portal <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Status banners — real state only, never a silent mock fallback */}
      {status && status.status === "processing" && (
        <Banner tone="gold" testid="processing-banner" spinner
          title={status.message || "Processing…"}
          detail={`STAGE: ${status.stage || "—"} · ${Math.round(status.progress || 0)}%`} />
      )}
      {status && status.status === "error" && (
        <Banner tone="red" testid="processing-error-banner"
          title="Processing failed" detail={status.message || "Unknown error"} />
      )}
      {status && status.status === "ready" && status.twelvelabs_video_id && (
        <Banner tone="green" testid="ai-ready-badge"
          title="TwelveLabs index is live for this video."
          detail={`VIDEO ID: ${status.twelvelabs_video_id}`} />
      )}
      {event.has_video === false && status?.status === "ready" && !event.is_demo && (
        <Banner tone="red" testid="no-video-banner"
          title="No playable master for this event."
          detail="Transcoding did not produce an H.264/AAC MP4 — the demo clip is shown instead." />
      )}
      {event.is_demo && (
        <Banner tone="gold" testid="demo-banner"
          title="This is the seeded demo event."
          detail="ITS HIGHLIGHTS ARE SAMPLE DATA · UPLOAD YOUR OWN FOOTAGE TO SEE REAL TWELVELABS OUTPUT" />
      )}

      {/* Player + side panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <div className="relative aspect-video card-soft overflow-hidden bg-black">
            {!videoError ? (
              <video
                ref={videoRef}
                key={videoSrc}
                src={videoSrc}
                crossOrigin="anonymous"
                preload="metadata"
                playsInline
                poster={event.thumbnail_url ? withToken(event.thumbnail_url) : undefined}
                className="w-full h-full"
                onTimeUpdate={(e) => setVTime(e.target.currentTime)}
                onLoadedMetadata={(e) => setVDur(e.target.duration || 0)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onError={() => {
                  if (hasOwnVideo) setUserVideoFailed(true);
                  else { setVideoError(true); setPlaying(false); }
                }}
                data-testid="event-video"
              />
            ) : (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center text-center p-8"
                style={{
                  backgroundImage: `linear-gradient(rgba(5,5,5,0.7), rgba(5,5,5,0.85)), url(${meta.image})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
                data-testid="video-preview-fallback"
              >
                <Film className="w-10 h-10 text-[#FFB000] mb-3" strokeWidth={1.5} />
                <div className="font-heading text-lg">Preview unavailable</div>
                <div className="text-xs font-mono text-[#8F8F9D] mt-1 max-w-sm">
                  The master could not be decoded. Highlight markers below stay active.
                </div>
              </div>
            )}

            {hasOwnVideo && !videoError && (
              <div className="absolute top-3 left-3 z-10 px-2 py-1 rounded-sm font-mono text-[10px] font-bold tracking-widest bg-[#00F298] text-black" data-testid="user-footage-badge">
                YOUR FOOTAGE
              </div>
            )}
            {!hasOwnVideo && !videoError && (
              <div className="absolute top-3 left-3 z-10 px-2 py-1 rounded-sm font-mono text-[10px] font-bold tracking-widest bg-white/15 text-white" data-testid="demo-footage-badge">
                DEMO CLIP
              </div>
            )}

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {!playing && !videoError && (
                <button
                  onClick={togglePlay}
                  data-testid="video-play"
                  className="pointer-events-auto w-20 h-20 rounded-full bg-[#FFB000] glow-gold-strong flex items-center justify-center hover:scale-110 transition"
                >
                  <Play className="w-8 h-8 text-black fill-current ml-1" />
                </button>
              )}
            </div>

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4">
              <div className="flex items-center gap-3 mb-2">
                <button onClick={togglePlay} data-testid="video-toggle" className="text-white hover:text-[#FFB000]">
                  {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>
                <span className="font-mono text-xs text-white">{fmtTime(vTime)} / {fmtTime(vDur || 0)}</span>
                <div className="ml-auto flex items-center gap-2 text-[#8F8F9D]"><Volume2 className="w-4 h-4" /></div>
              </div>
              <Scrubber
                vDur={vDur}
                vTime={vTime}
                highlights={highlights}
                appearances={personFilter ? appearancesByPerson[personFilter] || [] : []}
                onSeek={(t) => { if (videoRef.current) videoRef.current.currentTime = t; }}
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-white/5 overflow-x-auto">
            {[
              { id: "highlights", label: "Highlights", icon: Sparkles, count: filteredHighlights.length },
              { id: "clips", label: "Social clips", icon: Film, count: clips.length },
              { id: "shop", label: "Shoppable", icon: ShoppingBag, count: products.length },
              { id: "people", label: "People", icon: Users, count: people.length },
              { id: "report", label: "Report", icon: BarChart3, count: null },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                data-testid={`tab-${t.id}`}
                className={`inline-flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition whitespace-nowrap ${activeTab === t.id ? "border-[#FFB000] text-white" : "border-transparent text-[#8F8F9D] hover:text-white"}`}
              >
                <t.icon className="w-4 h-4" /> {t.label}
                {t.count !== null && <span className="text-[10px] font-mono text-[#565666]">{t.count}</span>}
              </button>
            ))}
          </div>

          {activeTab === "highlights" && (
            <HighlightsList
              highlights={filteredHighlights}
              people={people}
              appearancesByPerson={appearancesByPerson}
              onSeek={seek}
              onClip={generateClip}
              eventId={eventId}
              processing={status?.status === "processing"}
            />
          )}
          {activeTab === "clips" && <ClipsList clips={clips} eventId={eventId} />}
          {activeTab === "shop" && <ProductsList products={products} people={people} onToggle={toggleProductApprove} />}
          {activeTab === "people" && (
            <FaceStudio
              eventId={eventId}
              videoRef={videoRef}
              people={people}
              duration={vDur}
              onPeopleChange={setPeople}
              onAppearances={(a) => setAppearances(a)}
            />
          )}
          {activeTab === "report" && <ReportPanel eventId={eventId} event={event} people={people} highlights={highlights} />}
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <ReelPanel eventId={eventId} eventTitle={event.title} highlightCount={highlights.length} />

          <SearchPanel
            query={searchQ}
            results={searchResults}
            people={people}
            onSearch={runSearch}
            onSeek={seek}
            searching={searching}
            error={searchError}
          />

          <div className="card-soft p-5" data-testid="people-filter">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading text-base">Filter by person</h3>
              {personFilter && (
                <button onClick={() => setPersonFilter(null)} data-testid="clear-person-filter" className="text-xs text-[#FFB000] hover:underline">Clear</button>
              )}
            </div>
            {people.length === 0 ? (
              <div className="text-xs text-[#565666]">No one enrolled yet — use the People tab.</div>
            ) : (
              <div className="space-y-2">
                {people.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPersonFilter(personFilter === p.id ? null : p.id)}
                    data-testid={`filter-person-${p.id}`}
                    className={`w-full flex items-center gap-3 p-2 rounded-md transition ${personFilter === p.id ? "bg-[#FFB000]/10 border border-[#FFB000]/40" : "hover:bg-white/5"}`}
                  >
                    <ConfidenceRing pct={p.confidence} size={40} src={p.photos?.[0]} label={p.name?.[0]} />
                    <div className="text-left flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{p.name}</div>
                      <div className="text-[10px] font-mono text-[#565666] uppercase tracking-widest">
                        {p.role || "Guest"} · {(appearancesByPerson[p.id] || []).length} appearances
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Banner ---------- */
function Banner({ tone, title, detail, testid, spinner }) {
  const border = tone === "red" ? "border-[#EF4444]/50" : tone === "green" ? "border-[#00F298]/40" : "border-[#FFB000]/40";
  const accent = tone === "red" ? "#EF4444" : tone === "green" ? "#00F298" : "#FFB000";
  return (
    <div className={`card-glass p-3 flex items-start gap-3 ${border}`} data-testid={testid}>
      {spinner ? (
        <div className="relative w-6 h-6 flex-shrink-0 mt-0.5">
          <span className="absolute inset-0 rounded-full border-2" style={{ borderColor: `${accent}33` }} />
          <span className="absolute inset-0 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: accent }} />
        </div>
      ) : tone === "red" ? (
        <X className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: accent }} />
      ) : (
        <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: accent }} />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white">{title}</div>
        <div className="text-[10px] font-mono mt-0.5 uppercase tracking-widest break-words" style={{ color: accent }}>{detail}</div>
      </div>
    </div>
  );
}

/* ---------- Scrubber ---------- */
function Scrubber({ vDur, vTime, highlights, appearances, onSeek }) {
  const dur = Math.max(vDur, 1);
  const pct = (vTime / dur) * 100;
  return (
    <div className="relative h-2 bg-white/10 rounded-full overflow-visible cursor-pointer group" data-testid="scrubber">
      <div
        className="absolute inset-0 rounded-full"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - rect.left) / rect.width) * dur);
        }}
      />
      {highlights.map((h) => {
        const mp = (h.timestamp / dur) * 100;
        if (mp < 0 || mp > 100) return null;
        return (
          <span
            key={h.id}
            title={`${h.moment_type} · score ${h.score}`}
            data-testid={`marker-${h.id}`}
            className="absolute -top-1 h-4 w-[3px] bg-[#00F298] cursor-pointer hover:scale-y-150 transition glow-sage"
            style={{ left: `${mp}%` }}
            onClick={() => onSeek(h.timestamp)}
          />
        );
      })}
      {appearances.map((a, i) => {
        const mp = (a.timestamp / dur) * 100;
        if (mp < 0 || mp > 100) return null;
        return (
          <span
            key={`${a.person_id}-${i}`}
            title={`Appearance · ${a.confidence}%`}
            className="absolute top-2.5 h-2 w-[2px] bg-[#FFB000]"
            style={{ left: `${mp}%` }}
          />
        );
      })}
      <div className="absolute top-0 left-0 h-full bg-[#FFB000] rounded-full" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------- Highlights List ---------- */
function HighlightsList({ highlights, people, appearancesByPerson, onSeek, onClip, eventId, processing }) {
  if (highlights.length === 0) {
    return (
      <div className="card-soft p-10 text-center text-[#565666]" data-testid="highlights-empty">
        {processing
          ? "TwelveLabs is still analyzing this video — highlights appear here as soon as it finishes."
          : "No highlights for this filter."}
      </div>
    );
  }
  return (
    <div className="space-y-2" data-testid="highlights-list">
      {highlights.map((h) => {
        const tagged = people.filter(
          (p) =>
            h.people_ids?.includes(p.id) ||
            (appearancesByPerson[p.id] || []).some((a) => a.timestamp >= h.timestamp - 3 && a.timestamp <= h.timestamp + (h.duration || 8) + 3)
        );
        return (
          <div key={h.id} className="card-soft p-4 flex items-center gap-4 hover:border-white/20 transition group" data-testid={`highlight-${h.id}`}>
            <button
              onClick={() => onSeek(h.timestamp)}
              data-testid={`seek-${h.id}`}
              className="w-16 h-16 rounded-lg flex flex-col items-center justify-center bg-[#0A0A0E] border border-white/10 hover:border-[#FFB000] transition flex-shrink-0"
            >
              <span className="font-mono text-xs text-[#FFB000]">{fmtTime(h.timestamp)}</span>
              <span className="font-heading text-lg font-bold mt-0.5" style={{ color: confidenceColor(h.score) }}>{h.score}</span>
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-heading font-semibold">{h.moment_type}</span>
                <span className="text-[10px] font-mono text-[#565666] uppercase tracking-widest">{h.duration}s</span>
              </div>
              <div className="text-xs text-[#8F8F9D] mt-1 line-clamp-2">{h.description}</div>
              {tagged.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {tagged.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-[#C6C6D0] bg-white/5 px-2 py-1 rounded">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00F298]" /> {p.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1 items-end">
              <a
                href={withToken(`${BACKEND_URL}/api/events/${eventId}/highlights/${h.id}/download`)}
                className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-[#00F298] hover:text-black transition inline-flex items-center gap-1"
                data-testid={`download-highlight-${h.id}`}
              >
                <Download className="w-3 h-3" /> Clip
              </a>
              <div className="opacity-0 group-hover:opacity-100 transition flex gap-1">
                {["reels", "tiktok", "shorts"].map((f) => (
                  <button
                    key={f}
                    onClick={() => onClip(h.id, f)}
                    data-testid={`clip-${f}-${h.id}`}
                    className="text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-[#FFB000] hover:text-black transition capitalize"
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Clips List ---------- */
function ClipsList({ clips, eventId }) {
  if (clips.length === 0) {
    return (
      <div className="card-soft p-10 text-center text-[#565666]" data-testid="clips-empty">
        Generate a social clip from any highlight (hover → Reels / TikTok / Shorts).
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="clips-list">
      {clips.map((c) => (
        <div key={c.id} className="card-soft p-4" data-testid={`clip-${c.id}`}>
          <div className={`relative ${c.aspect === "9:16" ? "aspect-[9/16]" : "aspect-video"} rounded-md bg-black overflow-hidden`}>
            {c.status === "ready" ? (
              <video src={withToken(`${BACKEND_URL}/api/events/${eventId}/clips/${c.id}/stream`)} controls className="w-full h-full object-contain" preload="metadata" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#FFB000]/20 to-[#00F298]/10">
                <Film className="w-10 h-10 text-[#FFB000]" strokeWidth={1.2} />
              </div>
            )}
            <div className="absolute bottom-2 left-2 right-2 flex justify-between pointer-events-none">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/60">{c.aspect}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/60">{c.duration}s</span>
            </div>
          </div>
          <div className="mt-3 flex justify-between items-center">
            <div className="font-heading text-sm">{c.label}</div>
            {c.status === "ready" ? (
              <a
                href={withToken(`${BACKEND_URL}/api/events/${eventId}/clips/${c.id}/download`)}
                className="text-[10px] font-mono text-[#00F298] inline-flex items-center gap-1"
                data-testid={`clip-download-${c.id}`}
              >
                <Download className="w-3 h-3" /> MP4
              </a>
            ) : (
              <span className="text-[10px] font-mono text-[#FFB000]">{(c.status || "processing").toUpperCase()}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Products List ---------- */
function ProductsList({ products, people, onToggle }) {
  if (products.length === 0) {
    return <div className="card-soft p-10 text-center text-[#565666]" data-testid="products-empty">No products detected for this event.</div>;
  }
  return (
    <div className="space-y-2" data-testid="products-list">
      {products.map((p) => {
        const matched = people.find((x) => x.id === p.matched_person_id);
        return (
          <div key={p.id} className="card-soft p-4 flex items-center gap-4" data-testid={`product-${p.id}`}>
            <div className="w-16 h-16 rounded-md bg-[#0A0A0E] border border-white/10 flex items-center justify-center flex-shrink-0">
              <ShoppingBag className="w-6 h-6 text-[#FFB000]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-heading font-semibold truncate">{p.name}</div>
              <div className="text-xs text-[#8F8F9D] mt-0.5">
                {p.category} · ~${p.estimated_value_usd} · {p.appearances}× on screen
              </div>
              {matched && (
                <div className="text-[10px] font-mono text-[#00F298] mt-1 uppercase tracking-widest">WORN BY {matched.name}</div>
              )}
            </div>
            <div className="font-mono text-sm px-2 py-1 rounded" style={{ background: confidenceColor(p.confidence) + "22", color: confidenceColor(p.confidence) }}>
              {p.confidence}%
            </div>
            <button
              onClick={() => onToggle(p)}
              data-testid={`approve-product-${p.id}`}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition ${p.approved ? "bg-[#00F298] text-black" : "bg-white/5 hover:bg-white/10"}`}
            >
              {p.approved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Approved</> : <><Tag className="w-3.5 h-3.5" /> Approve</>}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Report ---------- */
function ReportPanel({ eventId, event, people, highlights }) {
  const [report, setReport] = useState(null);
  useEffect(() => {
    api.get(`/events/${eventId}/report`).then(({ data }) => setReport(data)).catch(() => setReport(false));
  }, [eventId]);

  return (
    <div className="space-y-4" data-testid="report-panel">
      <div className="card-glass p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-mono tracking-widest text-[#FFB000] mb-1">EVENT REPORT</div>
          <h3 className="font-heading text-lg">Highlights, people, and key moments.</h3>
        </div>
        <div className="flex gap-2">
          <a
            href={withToken(`${BACKEND_URL}/api/events/${eventId}/report.pdf`)}
            data-testid="report-pdf"
            className="inline-flex items-center gap-2 bg-[#FFB000] text-black font-medium px-4 py-2.5 rounded-md hover:bg-[#E69E00] transition"
          >
            <FileText className="w-4 h-4" /> PDF
          </a>
          <a
            href={withToken(`${BACKEND_URL}/api/events/${eventId}/report.csv`)}
            data-testid="report-csv"
            className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2.5 rounded-md text-sm transition"
          >
            <Download className="w-4 h-4" /> CSV
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Highlights" value={highlights.length} />
        <Metric label="People identified" value={people.length} />
        <Metric label="Avg score" value={report?.avg_score ?? "—"} />
        <Metric label="Duration" value={`${event.duration_min} min`} />
      </div>

      <div className="card-soft p-5">
        <div className="text-xs font-mono tracking-widest text-[#8F8F9D] mb-3 uppercase">TOP MOMENTS</div>
        <div className="space-y-2">
          {(report?.top_moments || highlights.slice(0, 5)).map((h) => (
            <div key={h.id} className="flex items-center gap-3 text-sm">
              <span className="font-mono text-xs text-[#FFB000] w-16 flex-shrink-0">{fmtTime(h.timestamp)}</span>
              <span className="flex-1 truncate">{h.moment_type}</span>
              <span className="font-mono text-xs" style={{ color: confidenceColor(h.score) }}>{h.score}</span>
            </div>
          ))}
          {highlights.length === 0 && <div className="text-sm text-[#565666]">Nothing to report yet.</div>}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="card-soft p-4">
      <div className="text-[10px] font-mono tracking-widest text-[#565666] uppercase">{label}</div>
      <div className="font-heading text-2xl mt-1">{value}</div>
    </div>
  );
}

/* ---------- Search Panel ---------- */
function SearchPanel({ query, results, people, onSearch, onSeek, searching, error }) {
  const chips = ["First kiss", "Speech", "First dance", "Goal", "Applause", "Encore"];
  return (
    <div className="card-glass p-5" data-testid="search-panel">
      <div className="text-xs font-mono tracking-widest text-[#FFB000] mb-2">SEMANTIC SEARCH · MARENGO</div>
      <h3 className="font-heading text-lg mb-3">Find any moment.</h3>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8F8F9D]" />
        <input
          type="text"
          data-testid="search-input"
          placeholder="Type a moment, emotion, or object…"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full bg-[#0A0A0E] border border-white/10 rounded-md pl-10 pr-3 py-2.5 text-sm text-white focus:border-[#FFB000] focus:outline-none transition"
        />
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => onSearch(c)}
            data-testid={`chip-${c}`}
            className="text-[10px] font-mono px-2 py-1 rounded-sm bg-white/5 hover:bg-[#FFB000] hover:text-black transition tracking-widest uppercase"
          >
            {c}
          </button>
        ))}
        {people.slice(0, 3).map((p) => (
          <button
            key={p.id}
            onClick={() => onSearch(p.name)}
            data-testid={`chip-person-${p.id}`}
            className="text-[10px] font-mono px-2 py-1 rounded-sm bg-[#00F298]/10 text-[#00F298] hover:bg-[#00F298] hover:text-black transition tracking-widest uppercase"
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="mt-4 max-h-72 overflow-auto space-y-2">
        {searching && <div className="text-xs text-[#8F8F9D]">Searching…</div>}
        {error && <div className="text-xs text-[#EF4444] font-mono break-words">{error}</div>}
        {!searching && !error && results && results.length === 0 && <div className="text-xs text-[#565666]">No matches.</div>}
        {!searching && results && results.map((r) => (
          <button
            key={r.id}
            onClick={() => onSeek(r.timestamp)}
            data-testid={`search-result-${r.id}`}
            className="w-full text-left card-soft p-2.5 hover:border-[#FFB000] transition flex items-center gap-3"
          >
            <Clock className="w-3.5 h-3.5 text-[#8F8F9D] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-white truncate">{r.moment_type}</div>
              <div className="text-[10px] font-mono text-[#565666]">{fmtTime(r.timestamp)}</div>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: confidenceColor(r.match_score) + "22", color: confidenceColor(r.match_score) }}>
              {r.match_score}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
