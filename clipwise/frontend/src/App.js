import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import Landing from "@/pages/Landing";
import Login, { Signup } from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Wizard from "@/pages/Wizard";
import EventDetail from "@/pages/EventDetail";
import Billing, { BillingSuccess, Settings } from "@/pages/Billing";
import Portal from "@/pages/Portal";
import Admin from "@/pages/Admin";
import AppShell from "@/components/AppShell";
import { Toaster } from "@/components/ui/toaster";
import { Loader2 } from "lucide-react";

function Protected({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#FFB000] animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function PublicOnly({ children }) {
  const { user } = useAuth();
  if (user === undefined) return null;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />

            {/* Public portal */}
            <Route path="/portal/:eventId" element={<Portal />} />
            <Route path="/billing/success" element={<Protected><AppShell><BillingSuccess /></AppShell></Protected>} />

            {/* Authenticated app */}
            <Route path="/app" element={<Protected><AppShell><Dashboard /></AppShell></Protected>} />
            <Route path="/app/wizard" element={<Protected><AppShell><Wizard /></AppShell></Protected>} />
            <Route path="/app/events/:eventId" element={<Protected><AppShell><EventDetail /></AppShell></Protected>} />
            <Route path="/app/billing" element={<Protected><AppShell><Billing /></AppShell></Protected>} />
            <Route path="/app/settings" element={<Protected><AppShell><Settings /></AppShell></Protected>} />
            <Route path="/app/admin" element={<Protected><AppShell><Admin /></AppShell></Protected>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
