import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
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
import MockCheckout from "@/pages/MockCheckout";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import SuperAdmin from "@/pages/SuperAdmin";
import PublicInvoice from "@/pages/PublicInvoice";
import CouplesGame from "@/pages/CouplesGame";
import Tools from "@/pages/Tools";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import Refund from "@/pages/Refund";
import Security from "@/pages/Security";
import Contact from "@/pages/Contact";
import AskAi from "@/pages/AskAi";
import BankStatement from "@/pages/BankStatement";
import Wallet from "@/pages/Wallet";
import Credits from "@/pages/Credits";
import RetailPOS from "@/pages/RetailPOS";
import Restaurant from "@/pages/Restaurant";
import RestaurantAdmin from "@/pages/RestaurantAdmin";
import POSAdmin from "@/pages/POSAdmin";
import QuickUpload from "@/pages/QuickUpload";

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading…</div>;
  if (!user) {
    // Tools page is publicly accessible — redirect to free version instead of login
    if (location.pathname === "/tools") return <Navigate to="/free/tools" replace />;
    return <Navigate to="/login" replace />;
  }
  return children;
}

function POSOnlyRoute({ children }) {
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
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      {/* Minimal nav */}
      <nav className="border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <a href="/" className="font-bold text-lg text-foreground flex items-center gap-1">
            <span className="text-blue-600">Billings</span>Easy
          </a>
          <div className="flex items-center gap-3">
            <a href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Login</a>
            <a href="/register" className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg font-medium transition-colors">Start Free</a>
          </div>
        </div>
      </nav>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {/* Sign-up nudge banner */}
        <div className="mb-6 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">These tools are 100% free — no login needed.</p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Want GST invoicing, AI billing, POS and more? <a href="/register" className="underline font-medium">Create a free account →</a></p>
          </div>
          <a href="/register" className="shrink-0 text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-center">Start Free — 50 Credits</a>
        </div>
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
            <Route path="/play/sv2026" element={<CouplesGame />} />{/* couples-game-v1 */}
            <Route path="/free/tools" element={<PublicTools />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/refund" element={<Refund />} />
            <Route path="/security" element={<Security />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/quick-upload" element={<QuickUpload />} />
            <Route path="/super" element={<SuperOnly><SuperAdmin /></SuperOnly>} />
            <Route path="/billing/mock-checkout" element={<Protected><MockCheckout /></Protected>} />
            {/* Fullscreen POS for pos-staff — no sidebar */}
            <Route path="/pos-screen" element={<POSOnlyRoute><RetailPOS /></POSOnlyRoute>} />
            <Route element={<Protected><AppLayout /></Protected>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/ask-ai" element={<AskAi />} />
              <Route path="/tools" element={<Tools />} />
              <Route path="/parties" element={<Parties />} />
              <Route path="/parties/:id" element={<PartyLedger />} />
              <Route path="/products" element={<Products />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/sales/new" element={<InvoiceCreate />} />
              <Route path="/sales/:id/edit" element={<InvoiceCreate />} />
              <Route path="/sales/:id" element={<InvoiceDetail />} />
              <Route path="/purchases" element={<Purchases />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/bank-statement" element={<BankStatement />} />
              <Route path="/wallet" element={<Wallet />} />
              <Route path="/credits" element={<Credits />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/gst" element={<GST />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/tds" element={<TDS />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/pos" element={<RetailPOS />} />
              <Route path="/pos/admin" element={<POSAdmin />} />
              <Route path="/restaurant" element={<Restaurant />} />
              <Route path="/restaurant/admin" element={<RestaurantAdmin />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" richColors closeButton />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
