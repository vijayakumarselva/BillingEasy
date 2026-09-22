import { useEffect, useState } from "react";
import api, { API_BASE } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Copy, KeyRound, Code2, CheckCircle2 } from "lucide-react";

const sample = (base, key) => `# Create an invoice from your website (idempotent on external_id)
curl -X POST ${base}/v1/invoices \\
  -H "X-API-Key: ${key || "YOUR_KEY"}" -H "Content-Type: application/json" \\
  -d '{
    "external_id": "WEB-1042",
    "customer": {"name": "Anita Rao", "phone": "9000011111", "state": "Karnataka"},
    "items": [{"sku": "COORD-1", "qty": 2, "price_incl_gst": 1050}],
    "shipping": 50,
    "paid_amount": 2150
  }'

GET  ${base}/v1/ping                 # check the key
GET  ${base}/v1/products?search=…    # catalogue with prices, GST and stock
GET  ${base}/v1/parties?search=…     # find a customer
POST ${base}/v1/parties              # create/find a customer
GET  ${base}/v1/invoices/WEB-1042    # status, paid and balance (your id or ours)
POST ${base}/v1/payments             # record money in/out {external_id, invoice_id, amount}`;

export default function WebsiteApiKey({ canEdit }) {
  const [st, setSt] = useState(null);
  const [newKey, setNewKey] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/integrations/api-key").then(r => setSt(r.data)).catch(() => setSt({ connected: false }));
  useEffect(() => { load(); }, []);
  if (!st) return <Card className="p-6 h-32 animate-pulse" />;

  const generate = async () => {
    setBusy(true);
    try { const { data } = await api.post("/integrations/api-key"); setNewKey(data.key); toast.success("Key created — copy it now, it won't be shown again"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not create key"); }
    finally { setBusy(false); }
  };
  const copy = (v, l) => { navigator.clipboard.writeText(v); toast.success(`${l} copied`); };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center"><Code2 className="h-5 w-5 text-slate-700" /></span>
          <div>
            <h3 className="font-semibold">Website API</h3>
            <p className="text-xs text-muted-foreground">Let your own site or app create invoices, customers and payments in this business.</p>
          </div>
        </div>
        {st.connected
          ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3 mr-1" />Key active</Badge>
          : <Badge variant="secondary">No key</Badge>}
      </div>

      {st.connected && <p className="text-xs text-muted-foreground">{st.invoices_via_api} invoice(s) created through the API. Current key ends in <code>…{st.key_hint}</code>.</p>}

      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-xs">{API_BASE}/v1</code>
        <Button size="sm" variant="outline" onClick={() => copy(`${API_BASE}/v1`, "API URL")}><Copy className="h-3.5 w-3.5" /></Button>
      </div>
      {newKey && (
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-xs text-emerald-700 font-semibold">{newKey}</code>
          <Button size="sm" variant="outline" onClick={() => copy(newKey, "API key")}><Copy className="h-3.5 w-3.5" /></Button>
        </div>
      )}

      <details className="rounded-lg border p-3">
        <summary className="text-sm font-medium cursor-pointer">Endpoints &amp; example</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-muted/40 p-3 text-[11px] leading-relaxed">{sample(API_BASE, newKey || (st.connected ? "be_api_…" : ""))}</pre>
      </details>

      {canEdit && (st.connected ? (
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="outline" disabled={busy}><KeyRound className="h-4 w-4 mr-1.5" />Regenerate key</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Regenerate the API key?</AlertDialogTitle>
              <AlertDialogDescription>The current key stops working immediately and your website will get 401 errors until the new key is in place.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={generate}>Regenerate</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : <Button onClick={generate} disabled={busy}><KeyRound className="h-4 w-4 mr-1.5" />Generate API key</Button>)}
    </Card>
  );
}
