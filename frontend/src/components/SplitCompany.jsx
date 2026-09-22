import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Split, Plus, Trash2, AlertTriangle, Undo2, CheckCircle2 } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { BUSINESS_MODES, modeInfo } from "@/components/BusinessSwitcher";

const blank = () => ({ biz_type: "b2b", name: "" });

export default function SplitCompany({ onDone }) {
  const [rows, setRows] = useState([blank()]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);

  const loadHistory = () => api.get("/businesses/split/history").then(r => setHistory(r.data)).catch(() => {});
  useEffect(() => { loadHistory(); }, []);

  const valid = rows.filter(r => r.name.trim().length > 1);
  const runPreview = async () => {
    if (!valid.length) { toast.error("Name at least one new business"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/businesses/split/preview", { targets: valid });
      setPreview(data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Preview failed"); }
    finally { setBusy(false); }
  };
  const execute = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/businesses/split/execute", { targets: valid });
      toast.success(`Split done — ${data.targets.length} businesses created, ${data.moved} records moved`, { duration: 8000 });
      setPreview(null); setRows([blank()]); loadHistory();
      if (onDone) onDone();
    } catch (e) { toast.error(e?.response?.data?.detail || "Split failed"); }
    finally { setBusy(false); }
  };
  const undo = async (id) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/businesses/split/${id}/undo`);
      toast.success(`Undone — ${data.restored} records back in this company`);
      loadHistory();
      if (onDone) onDone();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not undo", { duration: 9000 }); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <span className="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center"><Split className="h-5 w-5 text-violet-600" /></span>
        <div>
          <h3 className="font-semibold">Split this company into separate businesses</h3>
          <p className="text-xs text-muted-foreground">Moves tagged records into new standalone businesses — e.g. NammaHut (B2B), Mom &amp; Cub (B2C), Seyon Stay. Preview first; it can be undone.</p>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <select className="h-10 rounded-md border bg-background px-2 text-sm" value={r.biz_type}
                onChange={e => setRows(x => x.map((y, j) => j === i ? { ...y, biz_type: e.target.value } : y))}>
                {BUSINESS_MODES.map(m => <option key={m.value} value={m.value}>{m.emoji} {m.label}</option>)}
              </select>
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">New business name</Label>
              <Input value={r.name} placeholder={r.biz_type === "stay" ? "Seyon Stay" : r.biz_type === "b2c" ? "Mom & Cub" : "NammaHut B2B"}
                onChange={e => setRows(x => x.map((y, j) => j === i ? { ...y, name: e.target.value } : y))} />
            </div>
            <Button variant="ghost" size="icon" onClick={() => setRows(x => x.filter((_, j) => j !== i))} disabled={rows.length === 1}>
              <Trash2 className="h-4 w-4 text-rose-500" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setRows(x => [...x, blank()])}><Plus className="h-4 w-4 mr-1" />Add another</Button>
      </div>

      <Button onClick={runPreview} disabled={busy} className="bg-violet-600 hover:bg-violet-700">Preview the split</Button>

      {preview && (
        <div className="space-y-3 rounded-xl border p-4">
          <p className="text-sm font-semibold">What would move — nothing has changed yet</p>
          <div className="overflow-x-auto">
            <table className="app-table">
              <thead><tr><th>New business</th><th className="text-right">Invoices</th><th className="text-right">Bills</th><th className="text-right">Payments</th><th className="text-right">Expenses</th><th className="text-right">Parties copied</th><th className="text-right">Products copied</th></tr></thead>
              <tbody>
                {preview.targets.map(t => (
                  <tr key={t.biz_type}>
                    <td className="font-medium">{modeInfo(t.biz_type)?.emoji} {t.name}{t.bookings != null ? <span className="text-xs text-muted-foreground"> · {t.bookings} bookings, {t.rooms} rooms</span> : null}</td>
                    <td className="num">{t.invoices}</td><td className="num">{t.purchases}</td><td className="num">{t.payments}</td>
                    <td className="num">{t.expenses}</td><td className="num">{t.parties_copied}</td><td className="num">{t.products_copied}</td>
                  </tr>
                ))}
                <tr className="bg-muted/30">
                  <td className="font-medium">Stays in {preview.source.name}</td>
                  <td className="num">{preview.stays_in_source.invoices}</td><td className="num">{preview.stays_in_source.purchases}</td>
                  <td className="num">—</td><td className="num">{preview.stays_in_source.expenses}</td>
                  <td className="num">{preview.stays_in_source.parties}</td><td className="num">{preview.stays_in_source.products}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">{preview.notes.map(n => <li key={n}>{n}</li>)}</ul>
          {!preview.can_create
            ? <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />Your limit allows {preview.businesses_free} more business(es). Raise it in the platform console first.</p>
            : <AlertDialog>
                <AlertDialogTrigger asChild><Button disabled={busy} className="bg-violet-600 hover:bg-violet-700">Split now</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Split {preview.source.name} into {preview.targets.length} businesses?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tagged invoices, bills, payments and expenses move to the new businesses. Nothing is deleted, and you can undo this from here as long as the new businesses have no new records. Take a backup of anything critical first.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={execute}>Yes, split</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>}
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Past splits</p>
          {history.map(h => (
            <div key={h.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
              <Badge variant={h.status === "done" ? "default" : "secondary"} className={h.status === "done" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : ""}>
                {h.status === "done" ? <><CheckCircle2 className="h-3 w-3 mr-1" />Done</> : h.status}
              </Badge>
              <span className="flex-1">{h.targets.map(t => t.name).join(", ")} <span className="text-xs text-muted-foreground">· {fmtDate(h.created_at)}</span></span>
              {h.status === "done" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => undo(h.id)}><Undo2 className="h-3.5 w-3.5 mr-1" />Undo</Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
