// Forgot password — generates dev token (SMTP not configured).
import { useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { LogoMark } from "@/components/Logo";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [devToken, setDevToken] = useState(null);

  const submit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      if (data.dev_token) {
        setDevToken(data.dev_token);
        toast.success("Reset link generated. Copy the token below.");
      } else {
        toast.success("If that email exists, a reset link has been sent.");
      }
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || "Failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <Card className="w-full max-w-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <LogoMark size={36} />
          <span className="font-semibold" style={{ fontFamily: "Outfit, sans-serif" }}>Bill<span className="text-blue-600">Easy</span></span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">Forgot password</h2>
        <p className="text-sm text-muted-foreground mb-4">Enter your email — we'll generate a reset link.</p>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="forgot-email-input" />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700" data-testid="forgot-submit-button">
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </form>
        {devToken && (
          <div className="mt-4 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 p-3 text-xs">
            <div className="font-semibold mb-1 text-amber-700 dark:text-amber-300">DEV mode (no SMTP configured)</div>
            <div className="text-amber-800 dark:text-amber-200 break-all font-mono-fin">{devToken}</div>
            <Link to={`/reset-password?token=${devToken}`} className="text-blue-600 hover:underline mt-2 inline-block" data-testid="dev-reset-link">
              → Open reset page with this token
            </Link>
          </div>
        )}
        <div className="mt-4 text-center text-sm">
          <Link to="/login" className="text-blue-600 hover:underline" data-testid="back-to-login">Back to sign in</Link>
        </div>
      </Card>
    </div>
  );
}
