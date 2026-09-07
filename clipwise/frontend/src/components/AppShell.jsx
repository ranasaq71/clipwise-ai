import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { LogOut, LayoutDashboard, Plus, CreditCard, Settings, Sparkles, Search, Shield } from "lucide-react";

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#050505] grain text-white">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-[260px] border-r border-white/5 bg-[#0A0A0E] p-5 flex flex-col">
        <Link to="/app" data-testid="brand-link" className="flex items-center gap-2 mb-10">
          <div className="w-9 h-9 rounded-lg bg-[#FFB000] glow-gold flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-black" strokeWidth={2.2} />
          </div>
          <div>
            <div className="font-heading text-lg leading-none font-semibold">ClipWise</div>
            <div className="text-[10px] font-mono tracking-widest text-[#8F8F9D]">VIDEO INTEL</div>
          </div>
        </Link>

        <nav className="flex flex-col gap-1">
          <NavItem to="/app" icon={<LayoutDashboard className="w-4 h-4" />} testid="nav-dashboard">Events</NavItem>
          <NavItem to="/app/wizard" icon={<Plus className="w-4 h-4" />} testid="nav-wizard">New Event</NavItem>
          <NavItem to="/app/billing" icon={<CreditCard className="w-4 h-4" />} testid="nav-billing">Billing</NavItem>
          <NavItem to="/app/settings" icon={<Settings className="w-4 h-4" />} testid="nav-settings">Settings</NavItem>
          {user?.role === "admin" && (
            <NavItem to="/app/admin" icon={<Shield className="w-4 h-4" />} testid="nav-admin">Admin</NavItem>
          )}
        </nav>

        <div className="mt-auto">
          <div className="card-soft p-3 mb-3">
            <div className="text-[10px] tracking-widest font-mono text-[#8F8F9D]">CURRENT PLAN</div>
            <div className="font-heading text-lg capitalize">{user?.plan || "starter"}</div>
            <Link to="/app/billing" data-testid="upgrade-cta" className="text-xs text-[#FFB000] hover:underline">Manage plan →</Link>
          </div>
          <button
            onClick={async () => { await logout(); navigate("/"); }}
            data-testid="logout-btn"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/5 text-sm text-[#8F8F9D] hover:text-white transition"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-[260px] min-h-screen">
        <header className="h-16 border-b border-white/5 bg-[#0A0A0E]/70 backdrop-blur sticky top-0 z-30 flex items-center justify-between px-8">
          <div className="flex items-center gap-3 text-sm text-[#8F8F9D]">
            <Search className="w-4 h-4" />
            <span>Welcome back, <span className="text-white">{user?.name || "Studio"}</span></span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-[#565666]">{user?.email}</span>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FFB000] to-[#B27800] flex items-center justify-center text-black font-semibold text-sm">
              {(user?.name || "?")[0]}
            </div>
          </div>
        </header>
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}

function NavItem({ to, icon, children, testid }) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link
      to={to}
      data-testid={testid}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition group ${active ? "bg-white/5 text-white" : "text-[#C6C6D0] hover:text-white hover:bg-white/5"}`}
    >
      <span className={`transition ${active ? "text-[#FFB000]" : "text-[#8F8F9D] group-hover:text-[#FFB000]"}`}>{icon}</span>
      <span className="text-sm">{children}</span>
    </Link>
  );
}
