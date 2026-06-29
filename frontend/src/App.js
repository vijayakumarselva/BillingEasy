import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Landing from "@/pages/Landing";
import AppLayout from "@/layouts/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Parties from "@/pages/Parties";
import PartyLedger from "@/pages/PartyLedger";
import Products from "@/pages/Products";
import Sales from "@/pages/Sales";
import InvoiceCreate from "@/pages/InvoiceCreate";
import InvoiceDetail from "@/pages/InvoiceDetail";
import Purchases from "@/pages/Purchases";
import Payments from "@/pages/Payments";
import Expenses from "@/pages/Expenses";
import GST from "@/pages/GST";
import Reports from "@/pages/Reports";
import TDS from "@/pages/TDS";
import Settings from "@/pages/Settings";
import Billing from "@/pages/Billing";
import MockCheckout from "@/pages/MockCheckout";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import SuperAdmin from "@/pages/SuperAdmin";
import PublicInvoice from "@/pages/PublicInvoice";
import Tools from "@/pages/Tools";
import AskAi from "@/pages/AskAi";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function SuperOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_super_admin) return <Navigate to="/dashboard" replace />;
  return children;
}

function Public({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function LandingOrDashboard() {
  // Logged-out users see the marketing landing page; logged-in users go to dashboard.
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Landing />;
}

function PublicTools() {
  // Public (no-auth) wrapper around the Tools page — only shows GSTIN + HSN tabs.
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <Tools publicMode={true} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingOrDashboard />} />
            <Route path="/login" element={<Public><Login /></Public>} />
            <Route path="/register" element={<Public><Register /></Public>} />
            <Route path="/forgot-password" element={<Public><ForgotPassword /></Public>} />
            <Route path="/reset-password" element={<Public><ResetPassword /></Public>} />
            <Route path="/p/invoice/:token" element={<PublicInvoice />} />
            <Route path="/free/tools" element={<PublicTools />} />
            <Route path="/super" element={<SuperOnly><SuperAdmin /></SuperOnly>} />
            <Route path="/billing/mock-checkout" element={<Protected><MockCheckout /></Protected>} />
            <Route element={<Protected><AppLayout /></Protected>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/ask-ai" element={<AskAi />} />
              <Route path="/tools" element={<Tools />} />
              <Route path="/parties" element={<Parties />} />
              <Route path="/parties/:id" element={<PartyLedger />} />
              <Route path="/products" element={<Products />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/sales/new" element={<InvoiceCreate />} />
              <Route path="/sales/:id" element={<InvoiceDetail />} />
              <Route path="/purchases" element={<Purchases />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/gst" element={<GST />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/tds" element={<TDS />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" richColors closeButton />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
