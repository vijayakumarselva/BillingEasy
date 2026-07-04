import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2, Sparkles } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { formatApiErrorDetail } from "@/lib/api";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const planCode = params.get("plan");
  const [form, setForm] = useState({ name: "", email: "", password: "", org_name: "", phone: "" });
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.org_name) { toast.error("Business name is required"); return; }
    setLoading(true);
    try {
      await register(form);
      toast.success("Welcome! You have 50 free credits to get started.");
      nav(planCode ? `/billing?plan=${encodeURIComponent(planCode)}` : "/dashboard");
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Registration failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <LogoMark size={36} />
          <span className="font-semibold text-lg" style={{ fontFamily: "Outfit, sans-serif" }}>
            Billings<span className="text-blue-600">Easy</span>
          </span>
        </div>
        <h2 className="text-3xl font-semibold tracking-tight mb-1">Create your account</h2>
        <p className="text-sm text-muted-foreground mb-6">Start managing your business books in minutes.</p>

        <div className="rounded-md border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs mb-5 flex gap-2">
          <Sparkles className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-700 dark:text-amber-300">50 free credits on signup — no card required</div>
            <div className="text-amber-700/80 dark:text-amber-300/80">Credits power every feature. Top up anytime. No monthly lock-in.</div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Your full name</Label>
            <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              required data-testid="register-name-input" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org_name">Business name</Label>
            <Input id="org_name" value={form.org_name} onChange={(e) => setForm({ ...form, org_name: e.target.value })}
              placeholder="e.g. Sharma Enterprises" required data-testid="register-org-input" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Mobile number</Label>
            <Input id="phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="e.g. 9876543210" data-testid="register-phone-input" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} required
              data-testid="register-email-input" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6}
              data-testid="register-password-input" />
          </div>
          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}
            data-testid="register-submit-button">
            {loading ? "Creating…" : "Create account — get 50 free credits"}
          </Button>
        </form>
        <div className="mt-6 text-sm text-center text-muted-foreground">
          Already have an account? <Link to="/login" className="text-blue-600 hover:underline" data-testid="register-login-link">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
