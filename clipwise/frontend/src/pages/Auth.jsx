import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Sparkles, ArrowRight, Loader2 } from "lucide-react";

export default function Login() {
  const { login, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("demo@clipwise.ai");
  const [password, setPassword] = useState("ClipWise2026!");
  const [loading, setLoading] = useState(false);
  const next = location.state?.from || "/app";

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    const ok = await login(email, password);
    setLoading(false);
    if (ok) navigate(next, { replace: true });
  }

  return (
    <AuthFrame
      title="Welcome back."
      subtitle="Sign in to your ClipWise studio."
      testid="login-page"
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <Field label="Email" testid="login-email">
          <input
            type="email"
            required
            data-testid="login-email-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-[#0A0A0E] border border-white/10 rounded-md px-4 py-3 text-white focus:border-[#FFB000] focus:outline-none transition"
          />
        </Field>
        <Field label="Password" testid="login-password">
          <input
            type="password"
            required
            data-testid="login-password-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-[#0A0A0E] border border-white/10 rounded-md px-4 py-3 text-white focus:border-[#FFB000] focus:outline-none transition"
          />
        </Field>
        {error && <div data-testid="login-error" className="text-sm text-[#EF4444]">{error}</div>}
        <button
          type="submit"
          disabled={loading}
          data-testid="login-submit"
          className="w-full inline-flex items-center justify-center gap-2 bg-[#FFB000] text-black hover:bg-[#E69E00] font-medium px-6 py-3 rounded-md transition glow-gold disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Sign in <ArrowRight className="w-4 h-4" /></>}
        </button>
      </form>
      <div className="mt-6 text-sm text-[#8F8F9D] text-center">
        New here?{" "}
        <Link to="/signup" data-testid="login-to-signup" className="text-[#FFB000] hover:underline">Create an account</Link>
      </div>
      <div className="mt-8 card-soft p-4 text-xs text-[#8F8F9D] font-mono">
        <div className="text-[#FFB000] tracking-widest mb-2">DEMO CREDENTIALS</div>
        demo@clipwise.ai · ClipWise2026!
      </div>
    </AuthFrame>
  );
}

export function Signup() {
  const { register, error } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    const ok = await register(name, email, password);
    setLoading(false);
    if (ok) navigate("/app", { replace: true });
  }

  return (
    <AuthFrame title="Open your studio." subtitle="Start free. No credit card." testid="signup-page">
      <form onSubmit={onSubmit} className="space-y-5">
        <Field label="Studio / Your name" testid="signup-name">
          <input
            type="text" required minLength={1}
            data-testid="signup-name-input"
            value={name} onChange={(e) => setName(e.target.value)}
            className="w-full bg-[#0A0A0E] border border-white/10 rounded-md px-4 py-3 text-white focus:border-[#FFB000] focus:outline-none transition"
          />
        </Field>
        <Field label="Email" testid="signup-email">
          <input
            type="email" required
            data-testid="signup-email-input"
            value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-[#0A0A0E] border border-white/10 rounded-md px-4 py-3 text-white focus:border-[#FFB000] focus:outline-none transition"
          />
        </Field>
        <Field label="Password" testid="signup-password">
          <input
            type="password" required minLength={6}
            data-testid="signup-password-input"
            value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-[#0A0A0E] border border-white/10 rounded-md px-4 py-3 text-white focus:border-[#FFB000] focus:outline-none transition"
          />
        </Field>
        {error && <div data-testid="signup-error" className="text-sm text-[#EF4444]">{error}</div>}
        <button
          type="submit"
          disabled={loading}
          data-testid="signup-submit"
          className="w-full inline-flex items-center justify-center gap-2 bg-[#FFB000] text-black hover:bg-[#E69E00] font-medium px-6 py-3 rounded-md transition glow-gold disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Create studio <ArrowRight className="w-4 h-4" /></>}
        </button>
      </form>
      <div className="mt-6 text-sm text-[#8F8F9D] text-center">
        Already have an account?{" "}
        <Link to="/login" data-testid="signup-to-login" className="text-[#FFB000] hover:underline">Sign in</Link>
      </div>
    </AuthFrame>
  );
}

function Field({ label, children, testid }) {
  return (
    <label className="block" data-testid={testid}>
      <div className="text-xs font-mono tracking-widest text-[#8F8F9D] mb-2 uppercase">{label}</div>
      {children}
    </label>
  );
}

function AuthFrame({ title, subtitle, children, testid }) {
  return (
    <div className="min-h-screen grain bg-[#050505] flex" data-testid={testid}>
      {/* Left visual */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1519741497674-611481863552?w=1600"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050505]/30 via-transparent to-[#050505]" />
        <div className="relative p-16 flex flex-col justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="auth-brand-link">
            <div className="w-9 h-9 rounded-md bg-[#FFB000] glow-gold flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-black" strokeWidth={2.5} />
            </div>
            <span className="font-heading text-xl font-semibold">ClipWise</span>
          </Link>
          <div>
            <h2 className="font-heading text-4xl font-medium tracking-tight leading-tight max-w-md">
              Find anyone. <span className="text-[#FFB000]">In any footage.</span>
            </h2>
            <p className="mt-4 text-[#C6C6D0] max-w-sm">
              The AI video intelligence platform trusted by 600+ studios.
            </p>
          </div>
        </div>
      </div>
      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md fade-up">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-10" data-testid="auth-brand-link-mobile">
            <div className="w-8 h-8 rounded-md bg-[#FFB000] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-black" strokeWidth={2.5} />
            </div>
            <span className="font-heading text-lg font-semibold">ClipWise</span>
          </Link>
          <h1 className="font-heading text-4xl font-medium tracking-tight">{title}</h1>
          <p className="mt-2 text-[#8F8F9D]">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
