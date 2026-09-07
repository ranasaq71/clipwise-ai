import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, withToken } from "@/lib/api";
import { EVENT_TYPES, fmtBytes } from "@/lib/constants";
import { Plus, ArrowRight, Sparkles, Activity, Users, Film, AlertTriangle, Loader2 } from "lucide-react";

const STATUS_STYLES = {
  ready: "bg-[#00F298] text-black",
  processing: "bg-[#FFB000] text-black",
  error: "bg-[#EF4444] text-white",
  draft: "bg-white/10 text-white",
};

export default function Dashboard() {
  const [events, setEvents] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/events").then(({ data }) => setEvents(data)).catch(() => setEvents([]));
    api.get("/stats/overview").then(({ data }) => setStats(data)).catch(() => setStats(null));
  }, []);

  // Poll while anything is processing so status badges stay live.
  useEffect(() => {
    if (!events || !events.some((e) => e.status === "processing")) return;
    const t = setInterval(() => {
      api.get("/events").then(({ data }) => setEvents(data)).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [events]);

  const s = stats || fallbackStats(events || []);

  return (
    <div className="space-y-10" data-testid="dashboard-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs font-mono tracking-widest text-[#FFB000] mb-2">STUDIO OVERVIEW</div>
          <h1 className="font-heading text-4xl font-medium tracking-tight">Your events</h1>
          <p className="text-[#8F8F9D] mt-1">Process, search, and ship video — all in one place.</p>
        </div>
        <Link
          to="/app/wizard"
          data-testid="new-event-btn"
          className="inline-flex items-center gap-2 bg-[#FFB000] text-black font-medium px-5 py-3 rounded-md hover:bg-[#E69E00] transition glow-gold"
        >
          <Plus className="w-4 h-4" /> New event
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="Active events" value={s.events_total} testid="stat-active" />
        <StatCard icon={Sparkles} label="Highlights generated" value={s.highlights_total} testid="stat-ready" />
        <StatCard icon={Users} label="Named people" value={s.people_total} testid="stat-people" />
        <StatCard icon={Film} label="Storage used" value={fmtBytes(s.storage_bytes)} testid="stat-hours" />
      </div>

      {/* Events grid */}
      <section>
        <h2 className="font-heading text-xl mb-4">Recent events</h2>
        {events === null ? (
          <div className="card-soft p-12 text-center text-[#8F8F9D]">Loading…</div>
        ) : events.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {events.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, testid }) {
  return (
    <div className="card-soft p-5" data-testid={testid}>
      <div className="flex justify-between items-start">
        <Icon className="w-5 h-5 text-[#FFB000]" strokeWidth={1.5} />
        <div className="text-[10px] font-mono tracking-widest text-[#565666]">{label.toUpperCase()}</div>
      </div>
      <div className="font-heading text-3xl mt-4">{value ?? 0}</div>
    </div>
  );
}

function EventCard({ event }) {
  const meta = EVENT_TYPES.find((x) => x.id === event.event_type) || EVENT_TYPES[0];
  const badge = STATUS_STYLES[event.status] || STATUS_STYLES.draft;
  const label =
    event.status === "ready" ? "READY"
    : event.status === "processing" ? `${Math.round(event.progress || 0)}%`
    : event.status === "error" ? "ERROR"
    : `STEP ${event.step}/5`;
  return (
    <Link
      to={`/app/events/${event.id}`}
      data-testid={`event-card-${event.id}`}
      className="card-soft overflow-hidden group hover:border-white/20 hover:-translate-y-1 transition-all duration-300"
    >
      <div className="relative aspect-video">
        <img
          src={event.thumbnail_url ? withToken(event.thumbnail_url) : meta.image}
          alt={meta.label}
          className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent" />
        <span
          className="absolute top-3 left-3 px-2 py-1 rounded-sm font-mono text-[10px] font-bold tracking-widest"
          style={{ background: meta.accent, color: "#050505" }}
        >
          {meta.label.toUpperCase()}
        </span>
        <span className={`absolute top-3 right-3 px-2 py-1 rounded-sm font-mono text-[10px] font-bold tracking-widest inline-flex items-center gap-1 ${badge}`}>
          {event.status === "processing" && <Loader2 className="w-3 h-3 animate-spin" />}
          {event.status === "error" && <AlertTriangle className="w-3 h-3" />}
          {label}
        </span>
      </div>
      <div className="p-5">
        <div className="font-heading text-lg font-semibold truncate">{event.title}</div>
        <div className="mt-1 text-xs font-mono text-[#8F8F9D]">
          {event.duration_min}min · {event.studio_name}
        </div>
        <div className="mt-4 flex justify-between items-center">
          <div className="text-xs text-[#565666]">{new Date(event.created_at).toLocaleDateString()}</div>
          <ArrowRight className="w-4 h-4 text-[#FFB000] group-hover:translate-x-1 transition" />
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="card-glass p-16 text-center" data-testid="empty-state">
      <Sparkles className="w-8 h-8 text-[#FFB000] mx-auto" />
      <div className="font-heading text-2xl mt-4">Your first event is one click away.</div>
      <p className="text-[#8F8F9D] mt-2 max-w-md mx-auto">Upload a video to spin up your first AI-edited event.</p>
      <Link
        to="/app/wizard"
        data-testid="empty-create"
        className="inline-flex items-center gap-2 mt-6 bg-[#FFB000] text-black font-medium px-5 py-3 rounded-md hover:bg-[#E69E00] transition glow-gold"
      >
        <Plus className="w-4 h-4" /> Create event
      </Link>
    </div>
  );
}

function fallbackStats(events) {
  return {
    events_total: events.length,
    highlights_total: 0,
    people_total: 0,
    storage_bytes: 0,
  };
}
