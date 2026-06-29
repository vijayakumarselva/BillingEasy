import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import Logo, { LogoMark } from "@/components/Logo";
import { formatApiErrorDetail } from "@/lib/api";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("owner@vijaytraders.in");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      // Super admin → redirect to /super
      try {
        const me = await (await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("be_token")}` }
        })).json();
        if (me?.is_super_admin) { window.location.href = "/super"; return; }
      } catch {}
      toast.success("Welcome back!");
      nav("/dashboard");
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-slate-950 text-white">
        <div className="flex items-center gap-2.5">
          <LogoMark size={40} />
          <span className="font-semibold text-lg" style={{ fontFamily: "Outfit, sans-serif" }}>
            Bill<span className="text-blue-400">Easy</span>
          </span>
        </div>
        <div>
          <h1 className="text-5xl font-semibold tracking-tight mb-4">Run your business.<br/>Not your books.</h1>
          <p className="text-slate-400 max-w-md text-base">GST-compliant billing, inventory, payments, and accounting for Indian SMBs — built for speed, designed for clarity.</p>
          <div className="grid grid-cols-3 gap-4 mt-10 max-w-md">
            <div><div className="font-mono-fin text-2xl text-blue-400">10+</div><div className="text-xs text-slate-500">Modules</div></div>
            <div><div className="font-mono-fin text-2xl text-blue-400">GSTR</div><div className="text-xs text-slate-500">1 & 3B</div></div>
            <div><div className="font-mono-fin text-2xl text-blue-400">₹</div><div className="text-xs text-slate-500">INR · Lakhs/Cr</div></div>
          </div>
        </div>
        <div className="text-xs text-slate-500">© 2026 BillEasy · Made in India</div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-2.5">
            <LogoMark size={36} />
            <span className="font-semibold text-lg" style={{ fontFamily: "Outfit, sans-serif" }}>
              Bill<span className="text-blue-600">Easy</span>
            </span>
          </div>
          <h2 className="text-3xl font-semibold tracking-tight mb-1">Sign in</h2>
          <p className="text-sm text-muted-foreground mb-6">Welcome back. Enter your credentials.</p>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} required data-testid="login-email-input" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} required data-testid="login-password-input" />
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}
              data-testid="login-submit-button">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div className="mt-6 text-sm text-center text-muted-foreground">
            New here? <Link to="/register" className="text-blue-600 hover:underline" data-testid="login-register-link">Create an account</Link>
            <span className="mx-2 text-muted-foreground">·</span>
            <Link to="/forgot-password" className="text-blue-600 hover:underline" data-testid="login-forgot-link">Forgot password?</Link>
          </div>
          <div className="mt-8 rounded-lg border border-border bg-muted/30 p-4 text-xs">
            <div className="font-semibold mb-1">Demo credentials</div>
            <div className="font-mono-fin">owner@vijaytraders.in / admin123</div>
            <div className="font-mono-fin">accountant@vijaytraders.in / accountant123</div>
            <div className="font-mono-fin">sales@vijaytraders.in / sales123</div>
          </div>
        </div>
      </div>
    </div>
  );
}
