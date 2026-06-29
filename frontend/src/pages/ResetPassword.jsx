import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { LogoMark } from "@/components/Logo";
import { toast } from "sonner";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [token, setToken] = useState(params.get("token") || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Password reset. Please sign in.");
      nav("/login");
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
        <h2 className="text-2xl font-semibold tracking-tight mb-1">Reset password</h2>
        <p className="text-sm text-muted-foreground mb-4">Enter the token from your email and choose a new password.</p>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Reset token</Label>
            <Input required value={token} onChange={(e) => setToken(e.target.value)} data-testid="reset-token-input" />
          </div>
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} data-testid="reset-password-input" />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700" data-testid="reset-submit-button">
            {loading ? "Resetting…" : "Reset password"}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm">
          <Link to="/login" className="text-blue-600 hover:underline">Back to sign in</Link>
        </div>
      </Card>
    </div>
  );
}
