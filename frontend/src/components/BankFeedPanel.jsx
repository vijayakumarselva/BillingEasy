import { useEffect, useState } from "react";
import api, { API_BASE } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Copy, Radio, CheckCircle2, ExternalLink } from "lucide-react";
import { fmtDate } from "@/lib/format";

const sample = (base) => `POST ${base}/v1/bank-transactions
X-API-Key: be_api_…            # Settings → Integrations → Website API
{
  "account_no": "9962",                    // last 4 digits of the bank account
  "source": "hdfc-aa",
  "transactions": [
    {"external_id": "TXN-88213",           // the bank's own id — resends are ignored
     "date": "2026-09-22",
     "description": "NEFT CR UTR123456 63IDEAS",
     "amount": 118000,                     // + money in, − money out
     "balance": 542000}
  ]
}`;

export default function BankFeedPanel() {
  const [st, setSt] = useState(null);
  const load = () => api.get("/bank-feed/status").then(r => setSt(r.data)).catch(() => setSt(null));
  useEffect(() => { load(); }, []);
  if (!st) return null;

  const toggle = async (v) => {
    try { const { data } = await api.put("/bank-feed/status", { auto_create_payment: v }); setSt(data); toast.success(v ? "Matched transactions will now create receipts/payments" : "Auto-creation off"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 rounded-lg bg-sky-50 flex items-center justify-center"><Radio className="h-5 w-5 text-sky-600" /></span>
          <div>
            <h3 className="font-semibold">Live bank feed</h3>
            <p className="text-xs text-muted-foreground">Transactions can arrive here automatically instead of uploading a statement every time.</p>
          </div>
        </div>
        {st.last_received_at
          ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3 mr-1" />Last received {fmtDate(st.last_received_at)}</Badge>
          : <Badge variant="secondary">Not receiving yet</Badge>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Fed transactions</p><p className="text-lg font-semibold">{st.fed_rows}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Receipts created</p><p className="text-lg font-semibold">{st.auto_payments}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Source</p><p className="text-sm font-medium">{st.last_source || "—"}</p></div>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">Create the receipt / payment automatically</p>
          <p className="text-xs text-muted-foreground">Only when the amount matches an open invoice or bill. Off by default — everything still lands here for you to match by hand.</p>
        </div>
        <Switch checked={!!st.auto_create_payment} onCheckedChange={toggle} />
      </div>

      {!st.api_key_present && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          Generate an API key first: Settings → Integrations → Website API.
        </p>
      )}

      <details className="rounded-lg border p-3">
        <summary className="text-sm font-medium cursor-pointer">How to connect your bank</summary>
        <div className="mt-2 space-y-2">
          <pre className="overflow-x-auto rounded bg-muted/40 p-3 text-[11px] leading-relaxed">{sample(API_BASE)}</pre>
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(`${API_BASE}/v1/bank-transactions`); toast.success("Feed URL copied"); }}>
            <Copy className="h-3.5 w-3.5 mr-1" />Copy feed URL
          </Button>
          <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
            <li><b>Account Aggregator / fintech provider</b> (Setu, Finvu, Perfios, Decentro): point their webhook at this URL — closest to real-time.</li>
            <li><b>Your bank's corporate API</b> (ICICI, HDFC, Kotak connected banking): a small script posts each new line.</li>
            <li><b>No API?</b> Zapier / Make / n8n can read your bank alert emails and post them here.</li>
            <li>The account is matched on the last 4 digits; resending the same transaction is always safe.</li>
          </ul>
          <p className="text-xs text-muted-foreground">
            India's Account Aggregator framework is the sanctioned route for bank data — see{" "}
            <a className="underline inline-flex items-center gap-0.5" href="https://sahamati.org.in" target="_blank" rel="noreferrer">sahamati.org.in <ExternalLink className="h-3 w-3" /></a>.
          </p>
        </div>
      </details>
    </Card>
  );
}
