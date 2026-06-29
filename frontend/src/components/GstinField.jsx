// Reusable GSTIN input with live validation via /api/public/gstin/validate.
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function GstinField({ value, onChange, onValid, placeholder = "22AAAAA0000A1Z5" }) {
  const [status, setStatus] = useState(null); // { valid, reason, state, ... } | null
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const g = (value || "").trim();
    if (g.length === 0) { setStatus(null); return; }
    if (g.length !== 15) { setStatus({ valid: false, reason: `${g.length}/15 characters` }); return; }

    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await axios.get(`${API}/public/gstin/validate`, { params: { gstin: g } });
        if (cancelled) return;
        setStatus(data);
        if (data.valid && onValid) onValid(data);
      } catch {
        if (!cancelled) setStatus({ valid: false, reason: "could not verify" });
      } finally { if (!cancelled) setLoading(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div>
      <div className="relative">
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={15}
          className="font-mono uppercase tracking-wider pr-8"
          data-testid="party-gstin-input"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          {loading ? <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
           : status?.valid ? <CheckCircle2 className="h-4 w-4 text-emerald-600" data-testid="gstin-valid-icon" />
           : status && !status.valid ? <AlertCircle className="h-4 w-4 text-rose-500" data-testid="gstin-invalid-icon" />
           : null}
        </div>
      </div>
      {status?.valid && (
        <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1" data-testid="gstin-valid-msg">
          ✓ Valid · {status.state}
        </div>
      )}
      {status && !status.valid && (value || "").trim().length > 0 && (
        <div className="text-[11px] text-rose-600 mt-1" data-testid="gstin-invalid-msg">{status.reason}</div>
      )}
    </div>
  );
}
