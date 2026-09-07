import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { PLANS, PER_EVENT_PRICE } from "@/lib/constants";
import { useAuth } from "@/lib/auth";
import { Check, Loader2, Sparkles, CheckCircle2, ArrowRight, ExternalLink } from "lucide-react";

export default function Billing() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    api.get("/billing/usage").then(({ data }) => setUsage(data)).catch(() => {});
  }, []);

  async function subscribe(planId) {
    setBusy(planId);
    setError("");
    try {
      const { data } = await api.post("/billing/checkout", {
        plan_id: planId,
        origin_url: window.location.origin,
      });
      window.location.href = data.url;
    } catch (e) {
      setError(e.response?.data?.detail || "Could not start checkout.");
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy("portal");
    setError("");
    try {
      const { data } = await api.post("/billing/portal", { origin_url: window.location.origin });
      window.location.href = data.url;
    } catch (e) {
      setError(e.response?.data?.detail || "Could not open the Stripe customer portal.");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8" data-testid="billing-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-mono tracking-widest text-[#FFB000] mb-2">BILLING</div>
          <h1 className="font-heading text-4xl tracking-tight">Choose your studio plan</h1>
          <p className="text-[#8F8F9D] mt-1">
            You're currently on <span className="text-white capitalize">{user?.plan || "starter"}</span>. Upgrade any time.
          </p>
        </div>
        <button
          onClick={openPortal}
          disabled={busy === "portal"}
          data-testid="open-customer-portal"
          className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-2.5 rounded-md text-sm transition disabled:opacity-60"
        >
          {busy === "portal" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
          Manage subscription & invoices
        </button>
      </div>

      {usage && (
        <div className="card-glass p-5 grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="usage-panel">
          <Usage label="Events this month" value={`${usage.events_this_month} / ${usage.event_limit ?? "∞"}`} />
          <Usage label="Event credits" value={usage.event_credits} />
          <Usage label="Named people cap" value={usage.people_limit ?? "∞"} />
          <Usage label="Renews" value={usage.current_period_end ? new Date(usage.current_period_end).toLocaleDateString() : "—"} />
        </div>
      )}

      {error && <div className="card-soft border-[#EF4444]/50 text-[#EF4444] p-3" data-testid="billing-error">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((p) => {
          const current = user?.plan === p.id;
          return (
            <div
              key={p.id}
              data-testid={`plan-card-${p.id}`}
              className={`relative p-6 rounded-xl border ${p.featured ? "border-[#FFB000] bg-[#0E0E12] glow-gold" : "border-white/10 bg-[#0A0A0E]"}`}
            >
              {p.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#FFB000] text-black text-[10px] font-mono font-bold tracking-widest">MOST POPULAR</span>
              )}
              <div className="font-heading text-xl">{p.label}</div>
              <div className="mt-3 font-heading text-4xl font-semibold">
                ${p.price}<span className="text-base text-[#8F8F9D] font-normal">/mo</span>
              </div>
              <div className="text-sm text-[#8F8F9D] mt-2 min-h-[40px]">{p.blurb}</div>
              <ul className="mt-5 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2 text-[#C6C6D0]"><Check className="w-4 h-4 text-[#00F298] mt-0.5 flex-shrink-0" /> {f}</li>
                ))}
              </ul>
              <button
                disabled={busy === p.id || current}
                onClick={() => subscribe(p.id)}
                data-testid={`subscribe-${p.id}`}
                className={`mt-6 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md font-medium transition disabled:opacity-60 ${current ? "bg-white/10 text-white cursor-default" : p.featured ? "bg-[#FFB000] text-black hover:bg-[#E69E00]" : "bg-white/5 text-white hover:bg-white/10 border border-white/10"}`}
              >
                {current ? <><CheckCircle2 className="w-4 h-4" /> Current plan</> : busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{p.cta} <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
          );
        })}
      </div>

      <div className="card-glass p-6 flex items-center justify-between">
        <div>
          <div className="font-heading text-lg">Pay per event</div>
          <div className="text-sm text-[#8F8F9D] mt-1">One-time ${PER_EVENT_PRICE} — perfect for occasional studios.</div>
        </div>
        <button
          onClick={() => subscribe("pay_per_job")}
          disabled={busy === "pay_per_job"}
          data-testid="subscribe-pay_per_job"
          className="bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-2.5 rounded-md text-sm inline-flex items-center gap-2 transition"
        >
          {busy === "pay_per_job" ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Buy event credit <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}

function Usage({ label, value }) {
  return (
    <div>
      <div className="text-[10px] font-mono tracking-widest text-[#565666] uppercase">{label}</div>
      <div className="font-heading text-2xl mt-1">{value}</div>
    </div>
  );
}

export function BillingSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [status, setStatus] = useState("checking");
  const [details, setDetails] = useState(null);
  const sessionId = params.get("session_id");

  useEffect(() => {
    if (!sessionId) { setStatus("error"); return; }
    let attempts = 0;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const { data } = await api.get(`/billing/status/${sessionId}`);
        setDetails(data);
        if (data.payment_status === "paid") {
          setStatus("paid");
          await refresh();
          return;
        }
        if (data.status === "expired") { setStatus("expired"); return; }
      } catch {
        if (attempts >= 5) { setStatus("error"); return; }
      }
      if (attempts >= 8) { setStatus("timeout"); return; }
      setTimeout(poll, 2000);
    };
    poll();
    return () => { cancelled = true; };
  }, [sessionId, refresh]);

  return (
    <div className="max-w-xl mx-auto card-glass p-12 text-center" data-testid="billing-success-page">
      {status === "checking" && (
        <>
          <Loader2 className="w-10 h-10 text-[#FFB000] animate-spin mx-auto" />
          <h1 className="font-heading text-3xl mt-6">Confirming your payment…</h1>
          <p className="text-[#8F8F9D] mt-2">This usually takes a few seconds.</p>
        </>
      )}
      {status === "paid" && (
        <>
          <div className="w-16 h-16 rounded-full bg-[#00F298] glow-sage mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-black" />
          </div>
          <h1 className="font-heading text-3xl mt-6">Welcome to <span className="text-[#FFB000]">{details?.plan_id?.toUpperCase()}</span>!</h1>
          <p className="text-[#8F8F9D] mt-2">Your subscription is active. Time to ship some reels.</p>
          <button
            onClick={() => navigate("/app")}
            data-testid="success-continue"
            className="mt-8 inline-flex items-center gap-2 bg-[#FFB000] text-black font-medium px-6 py-3 rounded-md hover:bg-[#E69E00] transition glow-gold"
          >
            <Sparkles className="w-4 h-4" /> Open studio
          </button>
        </>
      )}
      {(status === "expired" || status === "error" || status === "timeout") && (
        <>
          <h1 className="font-heading text-3xl">Hmm, payment not confirmed</h1>
          <p className="text-[#8F8F9D] mt-2">If you were charged, refresh in a minute — the webhook may still be in flight.</p>
          <button onClick={() => navigate("/app/billing")} className="mt-6 text-[#FFB000] hover:underline">← Back to billing</button>
        </>
      )}
    </div>
  );
}

export function Settings() {
  const { user } = useAuth();
  const [integrations, setIntegrations] = useState(null);

  useEffect(() => {
    api.get("/settings/integrations").then(({ data }) => setIntegrations(data)).catch(() => setIntegrations([]));
  }, []);

  return (
    <div className="max-w-3xl space-y-6" data-testid="settings-page">
      <div>
        <div className="text-xs font-mono tracking-widest text-[#FFB000] mb-2">SETTINGS</div>
        <h1 className="font-heading text-4xl tracking-tight">Account</h1>
      </div>
      <div className="card-soft p-6 space-y-4">
        <Row label="Studio name" value={user?.name} />
        <Row label="Email" value={user?.email} />
        <Row label="Plan" value={(user?.plan || "starter").toUpperCase()} />
        <Row label="Role" value={(user?.role || "user").toUpperCase()} />
      </div>
      <div className="card-soft p-6">
        <div className="font-heading text-lg">API integration status</div>
        <p className="text-sm text-[#8F8F9D] mt-1">
          Live status is read from the server environment. Anything not configured will return a clear error
          instead of falling back to placeholder data.
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(integrations || []).map((it) => (
            <div key={it.key} className="card-glass p-3 flex justify-between items-center" data-testid={`integration-${it.key}`}>
              <div>
                <div className="font-heading text-sm">{it.name}</div>
                <div className="text-[10px] font-mono text-[#565666] uppercase tracking-widest">{it.detail}</div>
              </div>
              <span className={`text-[10px] font-mono px-2 py-1 rounded ${it.configured ? "bg-[#00F298] text-black" : "bg-[#EF4444]/20 text-[#EF4444]"}`}>
                {it.configured ? "CONFIGURED" : "MISSING"}
              </span>
            </div>
          ))}
          {integrations === null && <div className="text-sm text-[#8F8F9D]">Loading…</div>}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-white/5 last:border-b-0">
      <span className="text-xs font-mono text-[#8F8F9D] uppercase tracking-widest">{label}</span>
      <span className="text-sm text-white">{value}</span>
    </div>
  );
}
