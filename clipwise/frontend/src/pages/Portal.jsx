import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { BACKEND_URL } from "@/lib/api";
import { fmtTime, confidenceColor } from "@/lib/constants";
import ConfidenceRing from "@/components/ConfidenceRing";
import { Search, Sparkles, Heart, ShoppingBag, ArrowRight, Download, Play } from "lucide-react";

const portalApi = axios.create({ baseURL: `${BACKEND_URL}/api/portal` });

export default function Portal() {
  const { eventId } = useParams();
  const [data, setData] = useState(null);
  const [findName, setFindName] = useState("");
  const [findResults, setFindResults] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    portalApi.get(`/${eventId}`).then((r) => setData(r.data)).catch(() => setData(false));
  }, [eventId]);

  async function findMe(e) {
    e.preventDefault();
    if (!findName.trim()) return;
    const { data: r } = await portalApi.get(`/${eventId}/find_me`, { params: { name: findName } });
    setFindResults(r);
  }

  function seekTo(t) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    v.play().catch(() => {});
    v.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (data === null) return <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">Loading…</div>;
  if (data === false) return <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">Portal not available.</div>;

  const { event, people, highlights, products } = data;
  const streamUrl = `${BACKEND_URL}/api/portal/${eventId}/stream`;

  return (
    <div className="min-h-screen bg-[#050505] text-white grain" data-testid="portal-page">
      {/* Branded header */}
      <header className="border-b border-white/5 bg-[#0A0A0E]/70 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ background: event.brand_color }}>
              <Heart className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="font-heading text-lg font-semibold">{event.studio_name}</div>
              <div className="text-[10px] font-mono tracking-widest text-[#8F8F9D]">CLIENT PORTAL</div>
            </div>
          </div>
          <div className="text-xs font-mono text-[#565666]">Powered by ClipWise</div>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 py-20 max-w-5xl mx-auto text-center">
        <div className="text-xs font-mono tracking-widest mb-4" style={{ color: event.brand_color }}>YOUR EVENT</div>
        <h1 className="font-heading text-5xl sm:text-6xl tracking-tight">{event.title}</h1>
        <p className="mt-4 text-[#C6C6D0]">{event.duration_min} minutes captured · {highlights.length} highlights · {people.length} people indexed</p>

        {/* Find me */}
        <form onSubmit={findMe} className="mt-10 max-w-xl mx-auto" data-testid="find-me-form">
          <div className="card-glass p-2 flex items-center gap-2">
            <Search className="w-5 h-5 text-[#8F8F9D] ml-3" />
            <input
              type="text"
              placeholder="Find me — type a name…"
              value={findName}
              onChange={(e) => setFindName(e.target.value)}
              data-testid="find-me-input"
              className="flex-1 bg-transparent border-0 outline-none px-2 py-3 text-white placeholder-[#565666]"
            />
            <button
              type="submit"
              data-testid="find-me-submit"
              className="font-medium px-5 py-2.5 rounded-md transition"
              style={{ background: event.brand_color, color: "#050505" }}
            >
              Find me
            </button>
          </div>
          {findResults && (
            <div className="mt-6 card-soft p-4 text-left">
              {findResults.matches.length === 0 ? (
                <div className="text-sm text-[#8F8F9D]">No matches found.</div>
              ) : (
                <>
                  <div className="text-xs font-mono tracking-widest text-[#00F298] mb-3">
                    {findResults.highlights.length} MOMENTS WITH {findResults.matches.map((m) => m.name).join(", ").toUpperCase()}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {findResults.highlights.map((h) => (
                      <div key={h.id} className="card-soft p-3" data-testid={`find-highlight-${h.id}`}>
                        <div className="font-mono text-xs text-[#FFB000]">{fmtTime(h.timestamp)}</div>
                        <div className="text-sm mt-1">{h.moment_type}</div>
                        <div className="mt-2 flex gap-2">
                          <button onClick={() => seekTo(h.timestamp)} className="text-[10px] font-mono text-[#00F298] inline-flex items-center gap-1">
                            <Play className="w-3 h-3" /> PLAY
                          </button>
                          <a
                            href={`${BACKEND_URL}/api/portal/${eventId}/highlights/${h.id}/download`}
                            className="text-[10px] font-mono text-[#FFB000] inline-flex items-center gap-1"
                            data-testid={`find-download-${h.id}`}
                          >
                            <Download className="w-3 h-3" /> CLIP
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </form>
      </section>

      {/* Player */}
      {event.has_video && (
        <section className="px-6 max-w-5xl mx-auto">
          <div className="card-glass p-3">
            <video
              ref={videoRef}
              src={streamUrl}
              controls
              playsInline
              preload="metadata"
              poster={event.thumbnail_url || undefined}
              className="w-full rounded-lg bg-black aspect-video"
              data-testid="portal-video"
            />
          </div>
        </section>
      )}

      {/* People */}
      <section className="px-6 max-w-6xl mx-auto py-12">
        <h2 className="font-heading text-2xl mb-6 flex items-center gap-2"><Sparkles className="w-5 h-5 text-[#FFB000]" /> Cast</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
          {people.map((p) => (
            <div key={p.id} className="text-center" data-testid={`portal-person-${p.id}`}>
              <ConfidenceRing
                pct={p.confidence}
                size={84}
                src={p.photos?.[0] || `https://i.pravatar.cc/120?u=${p.id}`}
                onClick={() => { setFindName(p.name); }}
              />
              <div className="mt-3 font-heading text-sm truncate">{p.name}</div>
              <div className="text-[10px] font-mono text-[#8F8F9D] uppercase tracking-widest truncate">{p.role}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Highlights */}
      <section className="px-6 max-w-6xl mx-auto py-12">
        <h2 className="font-heading text-2xl mb-6">All moments</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {highlights.map((h) => (
            <div key={h.id} className="card-soft p-4 flex items-center gap-4" data-testid={`portal-highlight-${h.id}`}>
              <button
                onClick={() => seekTo(h.timestamp)}
                className="w-16 h-16 rounded-md flex flex-col items-center justify-center bg-[#0A0A0E] border border-white/10 flex-shrink-0 hover:border-white/30 transition"
              >
                <span className="font-mono text-xs" style={{ color: event.brand_color }}>{fmtTime(h.timestamp)}</span>
                <span className="font-heading text-lg" style={{ color: confidenceColor(h.score) }}>{h.score}</span>
              </button>
              <div className="flex-1 min-w-0">
                <div className="font-heading font-semibold truncate">{h.moment_type}</div>
                <div className="text-xs text-[#8F8F9D] truncate">{h.description}</div>
              </div>
              <a
                href={`${BACKEND_URL}/api/portal/${eventId}/highlights/${h.id}/download`}
                className="flex-shrink-0 p-2 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 transition"
                title="Download this clip"
                data-testid={`portal-download-${h.id}`}
              >
                <Download className="w-4 h-4 text-[#FFB000]" />
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Products */}
      {products.length > 0 && (
        <section className="px-6 max-w-6xl mx-auto py-12">
          <h2 className="font-heading text-2xl mb-6 flex items-center gap-2"><ShoppingBag className="w-5 h-5 text-[#FFB000]" /> Shop the look</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.map((p) => (
              <div key={p.id} className="card-soft p-4" data-testid={`portal-product-${p.id}`}>
                <div className="aspect-square bg-[#0A0A0E] border border-white/5 rounded-md flex items-center justify-center">
                  <ShoppingBag className="w-10 h-10 text-[#FFB000]" />
                </div>
                <div className="mt-3 font-heading text-sm truncate">{p.name}</div>
                <div className="text-xs text-[#8F8F9D]">{p.category}</div>
                <div className="mt-2 flex justify-between items-center">
                  <span className="font-mono text-sm" style={{ color: event.brand_color }}>${p.estimated_value_usd}</span>
                  <ArrowRight className="w-4 h-4 text-[#FFB000]" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t border-white/5 py-8 px-6 text-center text-xs font-mono text-[#565666]">
        © 2026 {event.studio_name} · Built on ClipWise AI
      </footer>
    </div>
  );
}
