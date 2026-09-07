import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { BACKEND_URL } from "@/lib/api";
import { Search, Sparkles, Loader2, ScanFace, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const publicApi = axios.create({ baseURL: `${BACKEND_URL}/api/public` });

const PERSON_PHOTOS = {
  "Sarah Chen": "https://images.unsplash.com/photo-1758598304332-94b40ce7c7b4?w=400",
  "Marcus Rivera": "https://images.unsplash.com/photo-1769636930451-e8df6d839e4d?w=400",
  "Elena Chen": "https://images.unsplash.com/photo-1609371497456-3a55a205d5eb?w=400",
  "David Rivera": "https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=400",
};

function fmt(s) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export default function LiveDemo() {
  const [demo, setDemo] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const debounceRef = useRef(null);

  // Load demo on mount
  useEffect(() => {
    publicApi.get("/demo").then((r) => setDemo(r.data)).catch(() => setDemo(false));
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults(null); setScanning(false); return; }
    clearTimeout(debounceRef.current);
    setScanning(true);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await publicApi.get("/demo/find_me", { params: { name: query } });
        // Add small "scan" delay so the effect feels intentional
        setTimeout(() => {
          setResults(data);
          setSearching(false);
          setScanning(false);
        }, 650);
      } catch {
        setSearching(false); setScanning(false);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  if (demo === false) return null;
  if (demo === null) {
    return (
      <section className="py-24 px-6 sm:px-8">
        <div className="max-w-5xl mx-auto text-center text-[#565666]">Loading live demo…</div>
      </section>
    );
  }

  const eventDurS = demo.event.duration_min * 60;

  return (
    <section id="live-demo" className="py-24 sm:py-32 px-6 sm:px-8 relative overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1100px] h-[1100px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(closest-side, rgba(0,242,152,0.08), transparent 70%)" }}
      />

      <div className="relative max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#00F298]/30 bg-[#00F298]/5 text-xs font-mono text-[#00F298] mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00F298] pulse-gold" />
            LIVE · NO SIGNUP REQUIRED
          </div>
          <h2 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-medium tracking-tight leading-tight">
            Try it on a real wedding.
            <br />
            <span className="text-gradient-gold">Find someone in seconds.</span>
          </h2>
          <p className="mt-6 text-[#C6C6D0] max-w-xl mx-auto">
            This is a real ClipWise event with {demo.people.length} people indexed and {demo.total_highlights} AI-generated moments.
            Type a name — or click a face — and watch the timeline light up.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT: face index visual */}
          <div className="lg:col-span-2 card-glass p-6">
            <div className="text-xs font-mono tracking-widest text-[#FFB000] mb-4">FACE INDEX · {demo.people.length} ENROLLED</div>
            <div className="grid grid-cols-2 gap-3">
              {demo.people.map((p) => {
                const isMatch = results?.matches?.some((m) => m.id === p.id);
                const dim = results && !isMatch;
                return (
                  <button
                    key={p.id}
                    data-testid={`demo-person-${p.id}`}
                    onClick={() => setQuery(p.name.split(" ")[0])}
                    className={`relative rounded-xl overflow-hidden text-left transition-all ${dim ? "opacity-30" : ""} ${isMatch ? "ring-2 ring-[#00F298] glow-sage" : "hover:ring-2 hover:ring-white/20"}`}
                  >
                    <div className="aspect-[3/4] relative">
                      <img
                        src={p.photo_url || PERSON_PHOTOS[p.name] || `https://i.pravatar.cc/300?u=${p.id}`}
                        alt={p.name}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent" />
                      {scanning && !dim && (
                        <span className="absolute inset-x-0 h-0.5 bg-[#00F298] glow-sage" style={{ animation: "scan-y 1.2s ease-in-out infinite" }} />
                      )}
                      <div
                        className="absolute top-2 right-2 px-1.5 py-0.5 rounded-sm font-mono text-[10px] font-bold"
                        style={{ background: isMatch ? "#00F298" : "rgba(255,176,0,0.9)", color: "#050505" }}
                      >
                        {p.confidence}%
                      </div>
                      <div className="absolute bottom-2 left-2 right-2">
                        <div className="font-heading text-sm font-semibold text-white truncate">{p.name}</div>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-[#C6C6D0] truncate">{p.role}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <style>{`
              @keyframes scan-y {
                0%   { top: 0%;   opacity: 0; }
                10%  { opacity: 1; }
                90%  { opacity: 1; }
                100% { top: 100%; opacity: 0; }
              }
            `}</style>
          </div>

          {/* RIGHT: search + timeline + results */}
          <div className="lg:col-span-3 space-y-4">
            {/* Search bar */}
            <div className="card-glass p-2 flex items-center gap-2">
              <Search className="w-5 h-5 text-[#8F8F9D] ml-3 flex-shrink-0" />
              <input
                type="text"
                placeholder="Type a name (try 'Sarah' or 'Marcus')…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                data-testid="livedemo-input"
                className="flex-1 bg-transparent border-0 outline-none px-2 py-3.5 text-white placeholder-[#565666] text-lg"
                aria-label="Find a person"
              />
              {searching && <Loader2 className="w-5 h-5 text-[#FFB000] animate-spin mr-3" />}
            </div>

            {/* Suggestion chips */}
            <div className="flex flex-wrap gap-2">
              {demo.people.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setQuery(p.name.split(" ")[0])}
                  data-testid={`livedemo-chip-${p.id}`}
                  className="text-xs font-mono px-3 py-1.5 rounded-full bg-[#00F298]/10 text-[#00F298] hover:bg-[#00F298] hover:text-black transition tracking-widest"
                >
                  {p.name}
                </button>
              ))}
            </div>

            {/* Timeline + results */}
            <div className="card-glass p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ScanFace className="w-4 h-4 text-[#00F298]" />
                  <span className="text-xs font-mono tracking-widest text-[#8F8F9D]">
                    {results?.matches?.length > 0
                      ? `${results.total_highlights} MOMENTS WITH ${results.matches.map((m) => m.name.toUpperCase()).join(" + ")}`
                      : query.trim()
                        ? "NO MATCH"
                        : `4-HOUR TIMELINE · ${demo.total_highlights} HIGHLIGHTS`}
                  </span>
                </div>
                {results?.matches?.length > 0 && (
                  <span className="text-xs font-mono text-[#00F298]" data-testid="livedemo-confidence">
                    {results.matches[0].confidence}% CONFIDENCE
                  </span>
                )}
              </div>

              {/* Timeline */}
              <div className="relative h-3 bg-white/5 rounded-full overflow-visible" data-testid="livedemo-timeline">
                {/* base markers — dimmed when there's a search */}
                {!results &&
                  Array.from({ length: 13 }).map((_, i) => (
                    <span
                      key={i}
                      className="absolute top-0 h-full w-[2px] bg-white/15"
                      style={{ left: `${(i + 0.5) * (100 / 13)}%` }}
                    />
                  ))}
                {/* matched highlight markers */}
                {results?.highlights?.map((h, i) => {
                  const pct = (h.timestamp / eventDurS) * 100;
                  return (
                    <span
                      key={h.id}
                      className="absolute -top-1 h-5 w-[3px] bg-[#00F298] glow-sage rounded-sm"
                      style={{
                        left: `${pct}%`,
                        animation: `pop-marker 0.4s ease-out ${i * 0.06}s both`,
                      }}
                      data-testid={`livedemo-marker-${h.id}`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] font-mono text-[#565666] mt-2">
                <span>00:00</span>
                <span>{Math.floor(eventDurS / 3600)}:{String(Math.floor((eventDurS % 3600) / 60)).padStart(2, "0")}:00</span>
              </div>
              <style>{`
                @keyframes pop-marker {
                  0%   { transform: scaleY(0); opacity: 0; }
                  60%  { transform: scaleY(1.4); opacity: 1; }
                  100% { transform: scaleY(1); opacity: 1; }
                }
              `}</style>

              {/* Result cards */}
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                {results?.highlights?.length > 0 ? (
                  results.highlights.slice(0, 9).map((h, i) => (
                    <div
                      key={h.id}
                      className="card-soft p-3 hover:border-[#00F298]/40 transition"
                      data-testid={`livedemo-result-${h.id}`}
                      style={{ animation: `fade-up 0.5s ease-out ${0.1 + i * 0.05}s both` }}
                    >
                      <div className="font-mono text-xs text-[#00F298]">{fmt(h.timestamp)}</div>
                      <div className="text-sm text-white mt-1 truncate">{h.moment_type}</div>
                      <div className="text-[10px] font-mono text-[#565666] uppercase tracking-widest mt-1">
                        AI · {h.score}/100
                      </div>
                    </div>
                  ))
                ) : results && query.trim() && !searching ? (
                  <div className="col-span-full text-sm text-[#565666] py-6 text-center" data-testid="livedemo-nomatch">
                    No matches. Try <button onClick={() => setQuery("Sarah")} className="text-[#00F298] underline">Sarah</button> or <button onClick={() => setQuery("Marcus")} className="text-[#00F298] underline">Marcus</button>.
                  </div>
                ) : !query.trim() ? (
                  <div className="col-span-full text-sm text-[#8F8F9D] py-6 text-center">
                    👆 Type a name above or tap a face to see ClipWise find them.
                  </div>
                ) : null}
              </div>
            </div>

            {/* Conversion CTA */}
            {results?.matches?.length > 0 && (
              <div className="card-glass p-5 flex items-center justify-between fade-up" data-testid="livedemo-cta-banner">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-[#FFB000]" />
                  <div>
                    <div className="font-heading text-sm font-semibold">Want this on your own footage?</div>
                    <div className="text-xs text-[#8F8F9D]">Free signup. Demo event included.</div>
                  </div>
                </div>
                <Link
                  to="/signup"
                  data-testid="livedemo-cta"
                  className="inline-flex items-center gap-2 bg-[#FFB000] text-black hover:bg-[#E69E00] font-medium px-4 py-2.5 rounded-md transition glow-gold whitespace-nowrap"
                >
                  Open studio <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
