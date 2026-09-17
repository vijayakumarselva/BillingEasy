import { useEffect, useState } from "react";
import api, { API_BASE } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Copy, KeyRound, Store, CheckCircle2 } from "lucide-react";
import { fmtDate } from "@/lib/format";

function CopyRow({ label, value, secret }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className={`flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-xs ${secret ? "text-emerald-700 font-semibold" : ""}`}>{value}</code>
        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(value); toast.success(`${label} copied`); }}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function MomCubIntegration({ canEdit }) {
  const [st, setSt] = useState(null);
  const [newKey, setNewKey] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/integrations/momcub").then(r => setSt(r.data)).catch(() => setSt({ connected: false }));
  useEffect(() => { load(); }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/integrations/momcub/key");
      setNewKey(data.key);
      toast.success("Key created — copy it now, it won't be shown again");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not create key"); }
    finally { setBusy(false); }
  };

  if (!st) return <Card className="p-6 h-40 animate-pulse" />;

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 rounded-lg bg-rose-50 flex items-center justify-center"><Store className="h-5 w-5 text-rose-600" /></span>
          <div>
            <h3 className="font-semibold">Mom &amp; Cub website</h3>
            <p className="text-xs text-muted-foreground">B2C purchase orders appear in the website admin for GRN; website orders arrive here as sales invoices.</p>
          </div>
        </div>
        {st.connected
          ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3 mr-1" />Key active</Badge>
          : <Badge variant="secondary">Not connected</Badge>}
      </div>

      {st.connected && (
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Website orders recorded</p><p className="text-lg font-semibold">{st.orders_synced}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Website GRNs received</p><p className="text-lg font-semibold">{st.grns_received}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Last contact</p><p className="text-sm font-medium">{st.last_used_at ? fmtDate(st.last_used_at) : "Never"}</p></div>
        </div>
      )}

      <div className="space-y-3">
        <CopyRow label="BillingsEasy API URL" value={API_BASE} />
        {newKey
          ? <CopyRow label="Integration key (shown once)" value={newKey} secret />
          : st.connected && <p className="text-xs text-muted-foreground">Current key ends in <code>…{st.key_hint}</code>. Keys are stored encrypted and can't be shown again.</p>}
      </div>

      <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-1">
        <li>Generate a key below and copy the URL and key.</li>
        <li>In Mom &amp; Cub admin → Integrations → <b>BillingsEasy</b>, paste both and click <b>Save &amp; test connection</b>.</li>
        <li>Create purchase orders here in <b>B2C</b> mode. Use the same SKU (or UPC) as the website product.</li>
      </ol>

      {canEdit && (
        st.connected ? (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="outline" disabled={busy}><KeyRound className="h-4 w-4 mr-1.5" />Regenerate key</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Regenerate the Mom &amp; Cub key?</AlertDialogTitle>
                <AlertDialogDescription>The current key stops working immediately. Website orders won't reach BillingsEasy until you paste the new key into Mom &amp; Cub.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={generate}>Regenerate</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button onClick={generate} disabled={busy} className="bg-blue-600 hover:bg-blue-700"><KeyRound className="h-4 w-4 mr-1.5" />Generate integration key</Button>
        )
      )}
    </Card>
  );
}
