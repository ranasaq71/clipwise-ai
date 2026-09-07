import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, ScanFace, Wand2, Film, ShoppingBag, Share2, Check, Play, Zap } from "lucide-react";
import { PLANS, EVENT_TYPES } from "@/lib/constants";
import LiveDemo from "@/components/LiveDemo";

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#050505] text-white grain overflow-x-hidden">
      <NavBar />
      <Hero />
      <LogoStrip />
      <FaceFeature />
      <LiveDemo />
      <EventTypes />
      <Workflow />
      <FeatureGrid />
      <Pricing />
      <CTA />
      <Footer />
    </div>
  );
}

function NavBar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#050505]/60 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2" data-testid="nav-brand">
          <div className="w-8 h-8 rounded-md bg-[#FFB000] glow-gold flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-black" strokeWidth={2.5} />
          </div>
          <span className="font-heading text-lg font-semibold tracking-tight">ClipWise</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-[#C6C6D0]">
          <a href="#live-demo" data-testid="nav-livedemo" className="hover:text-white transition">Try it live</a>
          <a href="#features" data-testid="nav-features" className="hover:text-white transition">Features</a>
          <a href="#workflow" data-testid="nav-workflow" className="hover:text-white transition">How it works</a>
          <a href="#pricing" data-testid="nav-pricing" className="hover:text-white transition">Pricing</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link to="/login" data-testid="nav-login" className="text-sm text-[#C6C6D0] hover:text-white transition">Sign in</Link>
          <Link
            to="/signup"
            data-testid="nav-cta"
            className="bg-[#FFB000] text-black hover:bg-[#E69E00] font-medium px-4 py-2 rounded-md text-sm transition glow-gold"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative pt-40 pb-24 px-6 sm:px-8">
      {/* Background image */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1601228552459-f648744df0d4?w=2000)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/40 via-[#050505]/80 to-[#050505]" />
        {/* Halo */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full" style={{
          background: "radial-gradient(closest-side, rgba(255,176,0,0.18), transparent 70%)"
        }}/>
      </div>

      <div className="relative max-w-6xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs font-mono text-[#C6C6D0] mb-8 fade-up">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00F298] pulse-gold" />
          NEW · Named-person search via face recognition
        </div>
        <h1 className="font-heading text-5xl sm:text-7xl lg:text-8xl font-medium tracking-tighter leading-[0.95] fade-up" style={{animationDelay:"0.1s"}}>
          Find <span className="text-gradient-gold">anyone</span>.
          <br/>
          In <em className="not-italic">any</em> footage.
          <br/>
          <span className="text-[#8F8F9D]">In seconds.</span>
        </h1>
        <p className="mt-8 text-lg sm:text-xl text-[#C6C6D0] max-w-2xl leading-relaxed fade-up" style={{animationDelay:"0.2s"}}>
          ClipWise turns raw wedding, sports, and event footage into
          <span className="text-white"> AI-edited highlights</span>, person-by-person reels, social clips, and shoppable video — without ever opening a timeline.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4 fade-up" style={{animationDelay:"0.3s"}}>
          <a
            href="#live-demo"
            data-testid="hero-cta-primary"
            className="bg-[#FFB000] text-black hover:bg-[#E69E00] font-medium px-7 py-3.5 rounded-md transition glow-gold inline-flex items-center gap-2 group"
          >
            Try the live demo <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition" />
          </a>
          <a
            href="#workflow"
            data-testid="hero-cta-secondary"
            className="text-white hover:text-[#FFB000] transition inline-flex items-center gap-2 px-5 py-3"
          >
            <span className="w-9 h-9 rounded-full border border-white/20 flex items-center justify-center group-hover:border-[#FFB000]">
              <Play className="w-3.5 h-3.5 fill-current" />
            </span>
            See how it works
          </a>
        </div>

        {/* Hero stats */}
        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/10 fade-up" style={{animationDelay:"0.4s"}}>
          {[
            ["< 5 min", "to first AI highlight"],
            ["94%+", "face match accuracy"],
            ["6 event", "AI profiles built-in"],
            ["$15", "API cost per wedding"],
          ].map(([k, v]) => (
            <div key={v} className="bg-[#0A0A0E] px-6 py-5">
              <div className="font-heading text-3xl text-white">{k}</div>
              <div className="text-xs font-mono tracking-widest text-[#8F8F9D] mt-1 uppercase">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LogoStrip() {
  const items = ["VOGUE STUDIOS", "ATHLETIC.FC", "ENCORE LIVE", "MERIDIAN EVENTS", "GOLDEN HOUR CO.", "VINEYARD FILMS"];
  return (
    <section className="py-10 border-y border-white/5">
      <div className="max-w-7xl mx-auto px-6 sm:px-8">
        <p className="text-center text-xs font-mono tracking-widest text-[#565666] mb-6">TRUSTED BY 600+ STUDIOS · 12,000+ EVENTS PROCESSED</p>
        <div className="flex flex-wrap justify-center gap-x-12 gap-y-4 text-[#8F8F9D] font-heading text-sm tracking-widest">
          {items.map((x) => <span key={x}>{x}</span>)}
        </div>
      </div>
    </section>
  );
}

function FaceFeature() {
  return (
    <section className="py-24 sm:py-32 px-6 sm:px-8 relative">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-5">
          <div className="text-xs font-mono tracking-widest text-[#FFB000] mb-4">★ THE CORE DIFFERENTIATOR</div>
          <h2 className="font-heading text-4xl sm:text-5xl font-medium tracking-tight leading-tight">
            Type a name.
            <br/>
            Find every moment.
          </h2>
          <p className="mt-6 text-[#C6C6D0] text-lg leading-relaxed">
            Upload 1–10 reference photos per person. ClipWise builds a private,
            per-event face index. Then anyone — the videographer, the bride, the
            coach — can find every appearance with one click.
          </p>
          <ul className="mt-8 space-y-3 text-[#C6C6D0]">
            {[
              "Per-event face collection — never shared, GDPR Article 9 compliant",
              "Confidence rings on every match (94%+ with 3+ photos)",
              "One-click personal highlight reel per named guest",
              "Face-matched shoppable products",
            ].map((t) => (
              <li key={t} className="flex gap-3 items-start">
                <Check className="w-5 h-5 text-[#00F298] mt-0.5 flex-shrink-0" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right: face stack visual */}
        <div className="lg:col-span-7">
          <div className="relative card-glass p-8 sm:p-12 overflow-hidden">
            <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(255,176,0,0.25), transparent)" }} />
            <div className="grid grid-cols-3 gap-6 relative">
              {[
                { src: "https://images.unsplash.com/photo-1758598304332-94b40ce7c7b4?w=400", name: "Sarah Chen", role: "Bride", pct: 97 },
                { src: "https://images.unsplash.com/photo-1769636930451-e8df6d839e4d?w=400", name: "Marcus Rivera", role: "Groom", pct: 95 },
                { src: "https://images.unsplash.com/photo-1609371497456-3a55a205d5eb?w=400", name: "Elena Chen", role: "Mother", pct: 89 },
              ].map((p, i) => (
                <FaceTile key={p.name} {...p} delay={i * 0.15} />
              ))}
            </div>

            {/* Timeline strip */}
            <div className="mt-10 card-soft p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono tracking-widest text-[#8F8F9D]">SEARCH "SARAH CHEN" → 14 RESULTS</span>
                <span className="text-xs font-mono text-[#00F298]">97% CONFIDENCE</span>
              </div>
              <div className="relative h-3 bg-white/5 rounded-full overflow-hidden">
                {[5, 18, 25, 38, 47, 56, 71, 82, 91].map((p) => (
                  <span
                    key={p}
                    className="absolute top-0 h-full w-1 bg-[#00F298] glow-sage"
                    style={{ left: `${p}%` }}
                  />
                ))}
                <span className="absolute top-0 h-full bg-[#FFB000]/30" style={{ left: "0%", width: "12%" }} />
              </div>
              <div className="mt-3 flex justify-between text-[10px] font-mono text-[#565666]">
                <span>00:00</span>
                <span>02:13:48</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FaceTile({ src, name, role, pct, delay = 0 }) {
  const color = pct >= 90 ? "#00F298" : "#FFB000";
  return (
    <div className="fade-up" style={{ animationDelay: `${delay}s` }}>
      <div className="relative aspect-[3/4] rounded-xl overflow-hidden border border-white/10 group">
        <img src={src} alt={name} className="w-full h-full object-cover transition group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent" />
        <div
          className="absolute top-3 right-3 px-2 py-1 rounded-sm font-mono text-[10px] font-bold"
          style={{ background: color, color: "#050505", boxShadow: `0 0 12px ${color}66` }}
        >
          {pct}%
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          <div className="font-heading text-sm font-semibold text-white">{name}</div>
          <div className="text-[10px] font-mono tracking-widest text-[#C6C6D0] uppercase">{role}</div>
        </div>
      </div>
    </div>
  );
}

function EventTypes() {
  return (
    <section id="features" className="py-24 px-6 sm:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="max-w-2xl mb-12">
          <div className="text-xs font-mono tracking-widest text-[#FFB000] mb-4">EVENT PROFILES</div>
          <h2 className="font-heading text-4xl sm:text-5xl font-medium tracking-tight leading-tight">
            Six AI profiles. <span className="text-[#8F8F9D]">One workflow.</span>
          </h2>
          <p className="mt-4 text-[#C6C6D0]">
            ClipWise ships with pre-tuned highlight scoring, keyword libraries, and brand-detection focus for every event you shoot.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {EVENT_TYPES.map((e, i) => (
            <div
              key={e.id}
              className="relative aspect-[4/5] rounded-xl overflow-hidden card-soft group fade-up"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <img src={e.image} alt={e.label} className="absolute inset-0 w-full h-full object-cover opacity-70 transition group-hover:scale-105 group-hover:opacity-90" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/40 to-transparent" />
              <div className="absolute inset-0 p-5 flex flex-col justify-end">
                <div className="font-heading text-2xl font-semibold">{e.label}</div>
                <div className="text-sm text-[#C6C6D0] mt-1">{e.tagline}</div>
              </div>
              <div className="absolute top-4 right-4 w-2 h-2 rounded-full" style={{ background: e.accent, boxShadow: `0 0 10px ${e.accent}` }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Workflow() {
  const steps = [
    { n: "01", t: "Upload", d: "Drag a file or paste a YouTube / Drive / Dropbox link. Up to 10GB, resumable." },
    { n: "02", t: "Pick event type", d: "Wedding, Football, Concert… ClipWise loads the right AI profile." },
    { n: "03", t: "AI processing", d: "Highlights, captions, brand detection — under 5 minutes." },
    { n: "04", t: "Face enrollment", d: "Drop in 1–10 photos per person. Confidence rings appear instantly." },
    { n: "05", t: "Ship & share", d: "Download social cuts, send the client portal, or hand over the ROI report." },
  ];
  return (
    <section id="workflow" className="py-24 px-6 sm:px-8 bg-gradient-to-b from-[#050505] to-[#0A0A0E]">
      <div className="max-w-7xl mx-auto">
        <div className="text-xs font-mono tracking-widest text-[#FFB000] mb-4 text-center">FIVE-STEP WIZARD</div>
        <h2 className="font-heading text-4xl sm:text-5xl text-center font-medium tracking-tight leading-tight">
          From raw footage to a delivered reel — <span className="text-[#8F8F9D]">in one screen.</span>
        </h2>
        <div className="mt-16 grid grid-cols-1 md:grid-cols-5 gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/10">
          {steps.map((s) => (
            <div key={s.n} className="bg-[#0A0A0E] p-6 hover:bg-[#11111A] transition">
              <div className="font-mono text-[#FFB000] text-xs tracking-widest">STEP {s.n}</div>
              <div className="font-heading text-lg font-semibold mt-3">{s.t}</div>
              <div className="text-sm text-[#8F8F9D] mt-2 leading-relaxed">{s.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureGrid() {
  const features = [
    { icon: ScanFace, title: "Named-person search", text: "Type a name → see every appearance with confidence." },
    { icon: Wand2, title: "AI highlight scoring", text: "Emotion + audio + crowd energy ranked 0–100." },
    { icon: Film, title: "Social clip generator", text: "TikTok 15s · Reels 30s · Shorts 60s, 9:16 + 16:9." },
    { icon: ShoppingBag, title: "Shoppable video", text: "Detect brands, face-match to wearers, drive revenue." },
    { icon: Share2, title: "Client delivery portal", text: "Branded, private, 'Find me' enabled. Send a link." },
    { icon: Zap, title: "API-first architecture", text: "TwelveLabs + AWS Rekognition + Google Vision under the hood." },
  ];
  return (
    <section className="py-24 px-6 sm:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="card-soft p-7 hover:border-white/20 hover:-translate-y-1 transition-all duration-300">
              <Icon className="w-7 h-7 text-[#FFB000]" strokeWidth={1.5} />
              <div className="mt-5 font-heading text-xl">{title}</div>
              <div className="mt-2 text-sm text-[#8F8F9D] leading-relaxed">{text}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="py-24 px-6 sm:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="text-xs font-mono tracking-widest text-[#FFB000] mb-4">PRICING</div>
          <h2 className="font-heading text-4xl sm:text-5xl font-medium tracking-tight">Studios start at <span className="text-gradient-gold">$79</span>.</h2>
          <p className="mt-4 text-[#C6C6D0]">No setup fees. No timeline software required. Cancel anytime.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={`relative p-7 rounded-xl border ${p.featured ? "border-[#FFB000] bg-[#0E0E12] glow-gold" : "border-white/10 bg-[#0A0A0E]"}`}
              data-testid={`landing-plan-${p.id}`}
            >
              {p.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#FFB000] text-black text-[10px] font-mono font-bold tracking-widest">MOST POPULAR</span>
              )}
              <div className="font-heading text-xl">{p.label}</div>
              <div className="mt-4 font-heading text-5xl font-semibold">${p.price}<span className="text-base text-[#8F8F9D] font-normal">/mo</span></div>
              <div className="text-sm text-[#8F8F9D] mt-3 min-h-[40px]">{p.blurb}</div>
              <ul className="mt-6 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2 text-[#C6C6D0]"><Check className="w-4 h-4 text-[#00F298] mt-0.5 flex-shrink-0" /> {f}</li>
                ))}
              </ul>
              <Link
                to="/signup"
                data-testid={`landing-plan-cta-${p.id}`}
                className={`mt-8 inline-flex items-center justify-center w-full px-5 py-3 rounded-md font-medium transition ${p.featured ? "bg-[#FFB000] text-black hover:bg-[#E69E00]" : "bg-white/5 text-white hover:bg-white/10 border border-white/10"}`}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
        <div className="text-center mt-8 text-xs font-mono text-[#565666]">Or pay per event — $49 / one-time. Agency white-label from $500/mo.</div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="py-24 px-6 sm:px-8">
      <div className="max-w-5xl mx-auto card-glass p-12 sm:p-16 text-center relative overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full pointer-events-none" style={{ background: "radial-gradient(closest-side, rgba(255,176,0,0.25), transparent)" }} />
        <h2 className="font-heading text-4xl sm:text-5xl font-medium tracking-tight relative">Stop scrubbing. <span className="text-gradient-gold">Start shipping.</span></h2>
        <p className="mt-5 text-[#C6C6D0] max-w-xl mx-auto relative">Try ClipWise free with a live, pre-processed wedding event the moment you sign in. No credit card.</p>
        <Link
          to="/signup"
          data-testid="footer-cta"
          className="mt-8 inline-flex items-center gap-2 bg-[#FFB000] text-black hover:bg-[#E69E00] font-medium px-7 py-3.5 rounded-md transition glow-gold relative"
        >
          Open the studio <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 py-12 px-6 sm:px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between gap-6 text-sm text-[#565666]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#FFB000]" />
          <span>© 2026 ClipWise AI · Built for videographers</span>
        </div>
        <div className="flex gap-6 font-mono text-xs tracking-widest">
          <span>PRIVACY</span>
          <span>TERMS</span>
          <span>GDPR ARTICLE 9</span>
        </div>
      </div>
    </footer>
  );
}
