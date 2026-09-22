import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileCheck2, CheckCircle2, ExternalLink } from "lucide-react";

export default function GstFilingSettings({ canEdit }) {
  const [st, setSt] = useState(null);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/gst/filing-settings").then(r => { setSt(r.data); setF(r.data.settings); }).catch(() => setSt(null));
  useEffect(() => { load(); }, []);
  if (!st || !f) return <Card className="p-6 h-40 animate-pulse" />;

  const save = async () => {
    setBusy(true);
    try { const { data } = await api.put("/gst/filing-settings", f); setSt(data); setF(data.settings); toast.success("GST filing settings saved"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try { const { data } = await api.post("/gst/filing-settings/test"); toast.success(data.message, { duration: 8000 }); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not reach the GSP", { duration: 9000 }); }
    finally { setBusy(false); }
  };
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center"><FileCheck2 className="h-5 w-5 text-indigo-600" /></span>
          <div>
            <h3 className="font-semibold">GST filing — e-invoice &amp; e-way bill</h3>
            <p className="text-xs text-muted-foreground">Connect your GSP/ASP account to pull real IRNs and e-way bill numbers into invoices. GSTR-1 export below needs nothing.</p>
          </div>
        </div>
        {f.enabled ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3 mr-1" />On</Badge> : <Badge variant="secondary">Off</Badge>}
      </div>

      {st.irn_generated > 0 && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">IRNs generated</p><p className="text-lg font-semibold">{st.irn_generated}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">E-way bills</p><p className="text-lg font-semibold">{st.eway_bills}</p></div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Provider</Label>
          <Select value={f.provider} onValueChange={v => { set("provider", v); const p = st.presets[v] || {}; set("base_url", p.base_url || ""); set("einvoice_path", p.einvoice_path || ""); set("ewaybill_path", p.ewaybill_path || ""); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(st.presets).map(([k, p]) => <SelectItem key={k} value={k}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">GSTIN used for filing</Label>
          <Input value={f.gstin} onChange={e => set("gstin", e.target.value.toUpperCase())} placeholder="29AABCU9603R1ZJ" /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">API base URL</Label>
          <Input value={f.base_url} onChange={e => set("base_url", e.target.value)} placeholder="https://api.your-gsp.com" className="font-mono text-sm" /></div>
        <div className="space-y-1.5"><Label className="text-xs">E-invoice path</Label>
          <Input value={f.einvoice_path} onChange={e => set("einvoice_path", e.target.value)} placeholder="/v1/einvoice" className="font-mono text-sm" /></div>
        <div className="space-y-1.5"><Label className="text-xs">E-way bill path</Label>
          <Input value={f.ewaybill_path} onChange={e => set("ewaybill_path", e.target.value)} placeholder="/v1/ewaybill" className="font-mono text-sm" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Client ID</Label>
          <Input value={f.client_id} onChange={e => set("client_id", e.target.value)} className="font-mono text-sm" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Client secret</Label>
          <Input type="password" value={f.client_secret} onChange={e => set("client_secret", e.target.value)} className="font-mono text-sm" /></div>
        <div className="space-y-1.5"><Label className="text-xs">API username</Label>
          <Input value={f.username} onChange={e => set("username", e.target.value)} className="font-mono text-sm" /></div>
        <div className="space-y-1.5"><Label className="text-xs">API password</Label>
          <Input type="password" value={f.password} onChange={e => set("password", e.target.value)} className="font-mono text-sm" /></div>
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <div><p className="text-sm font-medium">Enable filing</p><p className="text-xs text-muted-foreground">Until this is on, the IRN buttons stay disabled.</p></div>
          <Switch checked={!!f.enabled} onCheckedChange={v => set("enabled", v)} />
        </div>
        <div className="flex items-center justify-between">
          <div><p className="text-sm font-medium">Raise the IRN automatically</p><p className="text-xs text-muted-foreground">As soon as an invoice is finalized, including ones from your website API.</p></div>
          <Switch checked={!!f.auto_einvoice} onCheckedChange={v => set("auto_einvoice", v)} />
        </div>
        {f.auto_einvoice && (
          <div className="space-y-1.5"><Label className="text-xs">Only for invoices at or above (₹)</Label>
            <Input type="number" className="max-w-[200px]" value={f.einvoice_threshold} onChange={e => set("einvoice_threshold", +e.target.value || 0)} /></div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        E-invoicing is mandatory above the turnover limit notified by CBIC, and the IRP only accepts requests with credentials registered to your GSTIN.
        Get them from a GSP/ASP, or from <a className="underline inline-flex items-center gap-0.5" href="https://einvoice1.gst.gov.in" target="_blank" rel="noreferrer">einvoice1.gst.gov.in <ExternalLink className="h-3 w-3" /></a> if you have direct API access. Test on the NIC sandbox first.
      </p>

      {canEdit && (
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy} className="bg-indigo-600 hover:bg-indigo-700">Save</Button>
          <Button variant="outline" onClick={test} disabled={busy || !f.base_url}>Test connection</Button>
        </div>
      )}
    </Card>
  );
}
