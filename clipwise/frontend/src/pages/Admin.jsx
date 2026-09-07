import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { fmtBytes } from "@/lib/constants";
import { Shield, Users, Film, Sparkles, HardDrive, AlertTriangle, Loader2, RefreshCw } from "lucide-react";

const STATUS_COLOR = {
  ready: "text-[#00F298]",
  processing: "text-[#FFB000]",
  error: "text-[#EF4444]",
  draft: "text-[#8F8F9D]",
};

export default function Admin() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("events");

  async function load() {
    try {
      const { data } = await api.get("/admin/overview");
      setData(data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    }
  }
  useEffect(() => { load(); }, []);

  if (error) {
    return (
      <div className="card-soft border-[#EF4444]/50 p-6 text-[#EF4444] flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 mt-0.5" /> <div>{error}</div>
      </div>
    );
  }
  if (!data) return <div className="text-[#8F8F9D] inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-8" data-testid="admin-page">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs font-mono tracking-widest text-[#FFB000] mb-2 inline-flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" /> ADMIN
          </div>
          <h1 className="font-heading text-4xl font-medium tracking-tight">Platform overview</h1>
          <p className="text-[#8F8F9D] mt-1">Every event, every client, and what they're consuming.</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2.5 rounded-md text-sm transition">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat icon={Film} label="Events" value={data.stats.events_total} />
        <Stat icon={Sparkles} label="Highlights" value={data.stats.highlights_total} />
        <Stat icon={Users} label="Clients" value={data.stats.users_total} />
        <Stat icon={HardDrive} label="Storage" value={fmtBytes(data.stats.storage_bytes)} />
        <Stat icon={AlertTriangle} label="Errored" value={data.stats.events_error} tone={data.stats.events_error ? "#EF4444" : undefined} />
      </div>

      <div className="flex gap-1 border-b border-white/5">
        {[["events", "Events"], ["clients", "Clients"]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            data-testid={`admin-tab-${id}`}
            className={`px-4 py-3 text-sm border-b-2 transition ${tab === id ? "border-[#FFB000] text-white" : "border-transparent text-[#8F8F9D] hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "events" && (
        <div className="card-soft overflow-x-auto" data-testid="admin-events">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-mono uppercase tracking-widest text-[#565666] border-b border-white/5">
                <th className="p-4">Event</th>
                <th className="p-4">Owner</th>
                <th className="p-4">Type</th>
                <th className="p-4">Status</th>
                <th className="p-4">Highlights</th>
                <th className="p-4">Size</th>
                <th className="p-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e) => (
                <tr key={e.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]" data-testid={`admin-event-${e.id}`}>
                  <td className="p-4">
                    <Link to={`/app/events/${e.id}`} className="hover:text-[#FFB000] transition">{e.title}</Link>
                  </td>
                  <td className="p-4 text-[#8F8F9D] font-mono text-xs">{e.owner_email}</td>
                  <td className="p-4 text-[#8F8F9D] capitalize">{e.event_type}</td>
                  <td className={`p-4 font-mono text-xs uppercase ${STATUS_COLOR[e.status] || ""}`}>
                    {e.status}
                    {e.status === "error" && e.error_message && (
                      <div className="text-[10px] text-[#EF4444]/70 normal-case mt-1 max-w-xs truncate">{e.error_message}</div>
                    )}
                  </td>
                  <td className="p-4 font-mono">{e.highlight_count}</td>
                  <td className="p-4 font-mono text-xs text-[#8F8F9D]">{fmtBytes(e.size_bytes)}</td>
                  <td className="p-4 text-xs text-[#565666]">{new Date(e.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {data.events.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-[#565666]">No events yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "clients" && (
        <div className="card-soft overflow-x-auto" data-testid="admin-clients">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-mono uppercase tracking-widest text-[#565666] border-b border-white/5">
                <th className="p-4">Name</th>
                <th className="p-4">Email</th>
                <th className="p-4">Role</th>
                <th className="p-4">Plan</th>
                <th className="p-4">Events</th>
                <th className="p-4">Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]" data-testid={`admin-user-${u.id}`}>
                  <td className="p-4">{u.name}</td>
                  <td className="p-4 font-mono text-xs text-[#8F8F9D]">{u.email}</td>
                  <td className="p-4 font-mono text-xs uppercase">{u.role}</td>
                  <td className="p-4 capitalize">{u.plan}</td>
                  <td className="p-4 font-mono">{u.event_count}</td>
                  <td className="p-4 text-xs text-[#565666]">{new Date(u.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="card-soft p-5">
      <div className="flex justify-between items-start">
        <Icon className="w-5 h-5" strokeWidth={1.5} style={{ color: tone || "#FFB000" }} />
        <div className="text-[10px] font-mono tracking-widest text-[#565666]">{label.toUpperCase()}</div>
      </div>
      <div className="font-heading text-3xl mt-4" style={tone ? { color: tone } : undefined}>{value}</div>
    </div>
  );
}
