// GSTIN input with live validation + auto-fill from GST portal.
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Loader2, Search } from "lucide-react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Props:
 *   value      – current GSTIN string
 *   onChange   – (str) => void
 *   onValid    – (validationResult) => void  — called when format is valid
 *   onLookup   – (lookupResult) => void  — called with full details from GST portal
 *   placeholder
 */
export default function GstinField({ value, onChange, onValid, onLookup, placeholder = "22AAAAA0000A1Z5" }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState(null);

  // Structural validation on every keystroke
  useEffect(() => {
    const g = (value || "").trim().toUpperCase();
    if (g.length === 0) { setStatus(null); setLookupResult(null); return; }
    if (g.length !== 15) { setStatus({ valid: false, reason: `${g.length}/15 characters` }); return; }

    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await axios.get(`${API}/public/gstin/validate`, { params: { gstin: g } });
        if (cancelled) return;
        setStatus(data);
        if (data.valid && onValid) onValid(data);
        // Auto-trigger lookup when 15-char valid GSTIN entered
        if (data.valid) doLookup(g);
      } catch {
        if (!cancelled) setStatus({ valid: false, reason: "could not verify" });
      } finally { if (!cancelled) setLoading(false); }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const doLookup = async (g) => {
    const gstin = (g || value || "").trim().toUpperCase();
    if (gstin.length !== 15) return;
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const { data } = await axios.get(`${API}/public/gstin/lookup`, { params: { gstin } });
      setLookupResult(data);
      if (onLookup) onLookup(data);
    } catch (e) {
      const msg = e?.response?.data?.detail || "Lookup failed";
      setLookupResult({ error: msg });
    } finally { setLookupLoading(false); }
  };

  const isValid15 = (value || "").trim().length === 15 && status?.valid;

  return (
    <div className="space-y-1.5">
      {/* Input row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={value || ""}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
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
        {/* Manual fetch button */}
        {isValid15 && (
          <Button type="button" variant="outline" size="sm"
            onClick={() => doLookup()} disabled={lookupLoading}
            title="Fetch business details from GST portal"
            className="shrink-0 gap-1.5 text-xs">
            {lookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {lookupLoading ? "Fetching…" : "Auto-fill"}
          </Button>
        )}
      </div>

      {/* Validation message */}
      {status?.valid && !lookupResult && (
        <div className="text-[11px] text-emerald-700 dark:text-emerald-400" data-testid="gstin-valid-msg">
          ✓ Valid · {status.state}
        </div>
      )}
      {status && !status.valid && (value || "").trim().length > 0 && (
        <div className="text-[11px] text-rose-600" data-testid="gstin-invalid-msg">{status.reason}</div>
      )}

      {/* Lookup result card */}
      {lookupResult && !lookupResult.error && (
        <div className="rounded border px-3 py-2 text-xs space-y-0.5"
          style={{ background: "hsl(var(--tally-green-light))", borderColor: "hsl(var(--tally-green) / 0.3)" }}>
          <div className="flex items-center gap-1.5 font-semibold" style={{ color: "hsl(var(--tally-green))" }}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {lookupResult.trade_name || lookupResult.legal_name ||
              (lookupResult.source === "structural_only" ? "GSTIN verified — state auto-filled" : "Details fetched")}
            {lookupResult.status && lookupResult.source !== "structural_only" && (
              <span className="ml-auto font-normal opacity-60">{lookupResult.status}</span>
            )}
          </div>
          {lookupResult.legal_name && lookupResult.legal_name !== lookupResult.trade_name && (
            <div className="text-muted-foreground">Legal: {lookupResult.legal_name}</div>
          )}
          {lookupResult.address && <div className="text-muted-foreground">{lookupResult.address}</div>}
          {lookupResult.state && <div className="text-muted-foreground">State: {lookupResult.state}</div>}
          {lookupResult.business_type && (
            <div className="text-muted-foreground">Type: {lookupResult.business_type}</div>
          )}
          {lookupResult.source === "structural_only" && (
            <div className="text-amber-600 mt-1">
              Business name unavailable — GST portal blocks external servers. State & type decoded from GSTIN.
            </div>
          )}
        </div>
      )}
      {lookupResult?.error && (
        <div className="text-[11px] text-amber-600">{lookupResult.error}</div>
      )}
    </div>
  );
}
