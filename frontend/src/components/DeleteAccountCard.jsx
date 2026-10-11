import { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, AlertTriangle } from "lucide-react";

/** Deleting your own login, from inside the app.
 *  Apple requires this of any app with a sign-up (Review Guideline 5.1.1(v)),
 *  and it has to actually delete, not open a support ticket. */
export default function DeleteAccountCard() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/delete-account", { password, confirm });
      toast.success(data.message || "Account deleted");
      localStorage.clear();
      window.location.href = "/";
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not delete the account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 mt-4 max-w-md space-y-3 border-rose-200 dark:border-rose-900/50"
          data-testid="delete-account-card">
      <div className="flex items-center gap-2">
        <Trash2 className="h-4 w-4 text-rose-600" />
        <h3 className="font-semibold text-rose-700 dark:text-rose-400">Delete my account</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        This closes your login for good — you will be signed out of every device and
        cannot sign back in. Businesses where you are the only member are closed too.
      </p>
      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 p-3 text-xs text-amber-800 dark:text-amber-300 flex gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Invoices, purchases and GST records are kept for 72 months after closure, as
          section 36 of the CGST Act requires, and are then removed. Download anything
          you need from Reports first.
        </span>
      </div>

      {!open ? (
        <Button variant="outline" onClick={() => setOpen(true)}
                className="border-rose-300 text-rose-700 hover:bg-rose-50"
                data-testid="delete-account-start">
          Delete my account
        </Button>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Your password</Label>
            <Input type="password" value={password} autoComplete="current-password"
                   onChange={(e) => setPassword(e.target.value)}
                   placeholder="Leave blank if you sign in with an OTP"
                   data-testid="delete-account-password" />
          </div>
          <div className="space-y-1.5">
            <Label>Type DELETE to confirm</Label>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())}
                   placeholder="DELETE" data-testid="delete-account-confirm" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || confirm !== "DELETE"}
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                    data-testid="delete-account-submit">
              {busy ? "Deleting…" : "Delete permanently"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Keep my account</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
