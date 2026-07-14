import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LogoMark } from "@/components/Logo";
import { formatApiErrorDetail } from "@/lib/api";
import api from "@/lib/api";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();

  const [tab, setTab]           = useState("password"); // "password" | "otp"
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp]           = useState("");
  const [otpSent, setOtpSent]   = useState(false);
  const [loading, setLoading]   = useState(false);

  const goToDashboard = async () => {
    try {
      const me = await (await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("be_token")}` }
      })).json();
      if (me?.is_super_admin) { window.location.href = "/super"; return; }
    } catch {}
    toast.success("Welcome back!");
    nav("/dashboard");
  };

  const setToken = (data) => {
    localStorage.setItem("be_token", data.token);
    if (data.refresh_token) localStorage.setItem("be_refresh", data.refresh_token);
  };

  const onPasswordSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      await goToDashboard();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const status = err?.response?.status;
      if (status === 401 || detail === "Invalid credentials") toast.error("Wrong email or password. Please try again.");
      else if (status === 429) toast.error("Too many attempts. Wait 15 minutes and try again.");
      else toast.error(detail || "Cannot reach server. Check your internet connection.");
    } finally { setLoading(false); }
  };

  const onRequestOtp = async (e) => {
    e.preventDefault();
    if (!email) { toast.error("Enter your email first"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/otp/request", { email });
      setOtpSent(true);
      if (data.dev_otp) {
        toast.info(`OTP: ${data.dev_otp}`, { duration: 60000 });
      } else {
        toast.success(data.message || "OTP sent! Check your email.");
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to send OTP");
    } finally { setLoading(false); }
  };

  const onOtpSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/otp/verify", { email, otp });
      setToken(data);
      await goToDashboard();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Invalid OTP");
    } finally { setLoading(false); }
  };

  const switchTab = (t) => { setTab(t); setOtpSent(false); setOtp(""); };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-slate-950 text-white">
        <div className="flex items-center gap-2.5">
          <LogoMark size={40} />
          <span className="font-semibold text-lg" style={{ fontFamily: "Outfit, sans-serif" }}>
            Billings<span className="text-blue-400">Easy</span>
          </span>
        </div>
        <div>
          <h1 className="text-5xl font-semibold tracking-tight mb-4">Run your business.<br/>Not your books.</h1>
          <p className="text-slate-400 max-w-md text-base">GST-compliant billing, inventory, payments, and accounting for Indian SMBs — built for speed, designed for clarity.</p>
          <div className="grid grid-cols-3 gap-4 mt-10 max-w-md">
            <div><div className="font-mono text-2xl text-blue-400">10+</div><div className="text-xs text-slate-500">Modules</div></div>
            <div><div className="font-mono text-2xl text-blue-400">GSTR</div><div className="text-xs text-slate-500">1 & 3B</div></div>
            <div><div className="font-mono text-2xl text-blue-400">₹</div><div className="text-xs text-slate-500">INR · Lakhs/Cr</div></div>
          </div>
        </div>
        <div className="text-xs text-slate-500">© 2026 Nammahut Services Private Limited · Made in India</div>
      </div>

      {/* Right panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-2.5">
            <LogoMark size={36} />
            <span className="font-semibold text-lg" style={{ fontFamily: "Outfit, sans-serif" }}>
              Billings<span className="text-blue-600">Easy</span>
            </span>
          </div>

          <h2 className="text-3xl font-semibold tracking-tight mb-1">Sign in</h2>
          <p className="text-sm text-muted-foreground mb-6">Welcome back.</p>

          {/* Tab switcher */}
          <div className="flex rounded-lg border border-border overflow-hidden mb-6">
            <button
              className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === "password" ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => switchTab("password")}>
              Password
            </button>
            <button
              className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === "otp" ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => switchTab("otp")}>
              OTP / Passwordless
            </button>
          </div>

          {/* ── PASSWORD ── */}
          {tab === "password" && (
            <form onSubmit={onPasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" value={password}
                  onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          )}

          {/* ── EMAIL OTP ── */}
          {tab === "otp" && !otpSent && (
            <form onSubmit={onRequestOtp} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email-otp">Email</Label>
                <Input id="email-otp" type="email" autoComplete="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
              <p className="text-xs text-muted-foreground">We'll send a 6-digit OTP to your email. No password needed.</p>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                {loading ? "Sending OTP…" : "Send OTP"}
              </Button>
            </form>
          )}

          {tab === "otp" && otpSent && (
            <form onSubmit={onOtpSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="otp">Enter 6-digit OTP</Label>
                <Input id="otp" type="text" inputMode="numeric" maxLength={6}
                  value={otp} onChange={(e) => setOtp(e.target.value)}
                  placeholder="• • • • • •" className="text-center text-2xl tracking-[0.5em] font-mono" autoFocus />
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                {loading ? "Verifying…" : "Verify & Sign in"}
              </Button>
              <button type="button" className="w-full text-xs text-muted-foreground hover:text-foreground"
                onClick={() => { setOtpSent(false); setOtp(""); }}>
                ← Resend OTP
              </button>
            </form>
          )}

          <div className="mt-6 text-sm text-center text-muted-foreground">
            New here? <Link to="/register" className="text-blue-600 hover:underline">Create an account</Link>
            {tab === "password" && (
              <>
                <span className="mx-2">·</span>
                <Link to="/forgot-password" className="text-blue-600 hover:underline">Forgot password?</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
