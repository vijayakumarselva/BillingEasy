import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import PartySelect from "@/components/PartySelect";
import { inr, fmtDate, todayISO } from "@/lib/format";

const SECTIONS = [
  { code: "194C", rate: 1.0, desc: "Contractors / Subcontractors" },
  { code: "194J", rate: 10.0, desc: "Professional / Technical fees" },
  { code: "194H", rate: 5.0, desc: "Commission / Brokerage" },
  { code: "194I", rate: 10.0, desc: "Rent" },
  { code: "194A", rate: 10.0, desc: "Interest other than securities" },
];

export default function TDS() {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true);
  const [parties, setParties] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ party_id: "", section: "194C", rate: 1.0, amount: 0, tds_amount: 0, date: todayISO(), notes: "" });

  const load = async () => { setLoading(true); const { data } = await api.get("/tds"); setList(data); setLoading(false); };
  useEffect(() => { load(); api.get("/parties", { params: { type: "supplier" } }).then(r => setParties(r.data)); }, []);

  const onAmount = (v) => { const a = parseFloat(v || 0); setForm({ ...form, amount: a, tds_amount: +(a * (form.rate / 100)).toFixed(2) }); };
  const onSection = (code) => { const s = SECTIONS.find(s => s.code === code); setForm({ ...form, section: code, rate: s.rate, tds_amount: +(form.amount * (s.rate / 100)).toFixed(2) }); };
  const save = async () => {
    try { await api.post("/tds", form); toast.success("Saved"); setOpen(false); load(); }
    catch { toast.error("Failed"); }
  };

  const total = list.reduce((s, t) => s + (t.tds_amount || 0), 0);

  return (
    <div className="space-y-6" data-testid="tds-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">TDS</h1>
          <p className="text-sm text-muted-foreground mt-1">Tax Deducted at Source — when you pay vendors (rent, contractors, professionals), you deduct a small percentage and deposit it with the Government.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700" data-testid="tds-new-button">
          <Plus className="h-4 w-4 mr-1.5" /> New TDS Entry
        </Button>
      </div>

      <Card className="p-5 grid sm:grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-muted-foreground">TDS Deducted (all-time)</div>
          <div className="font-mono-fin text-2xl font-semibold">{inr(total)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Entries</div>
          <div className="font-mono-fin text-2xl font-semibold">{list.length}</div>
        </div>
        <div className="text-xs text-muted-foreground">Note: Reconcile against Form 26AS quarterly. File quarterly TDS returns (Form 26Q).</div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="app-table">
            <thead><tr><th>Date</th><th>Party</th><th>Section</th><th className="text-right">Rate</th><th className="text-right">Amount</th><th className="text-right">TDS</th><th>Notes</th></tr></thead>
            <tbody>
              {loading ? [1,2].map(i => <tr key={i}><td colSpan={7}><Skeleton className="h-8 w-full" /></td></tr>) :
                list.length === 0 ? <tr><td colSpan={7} className="text-center text-muted-foreground py-8">No TDS entries.</td></tr> :
                list.map(t => (
                  <tr key={t.id}>
                    <td className="text-muted-foreground">{fmtDate(t.date)}</td>
                    <td className="font-medium">{t.party_name}</td>
                    <td><Badge>{t.section}</Badge></td>
                    <td className="num">{t.rate}%</td>
                    <td className="num">{inr(t.amount)}</td>
                    <td className="num font-semibold text-blue-600">{inr(t.tds_amount)}</td>
                    <td className="text-xs text-muted-foreground">{t.notes}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="tds-dialog">
          <DialogHeader><DialogTitle>New TDS Entry</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Vendor (Supplier)</Label>
              <PartySelect
                parties={parties}
                value={form.party_id}
                onChange={(v) => setForm({ ...form, party_id: v })}
                role="supplier"
                testId="tds-party-select"
                onCreated={(p) => setParties(prev => [...prev, p])} />
            </div>
            <div className="space-y-1.5">
              <Label>Section</Label>
              <Select value={form.section} onValueChange={onSection}>
                <SelectTrigger data-testid="tds-section-select"><SelectValue /></SelectTrigger>
                <SelectContent>{SECTIONS.map(s => <SelectItem key={s.code} value={s.code}>{s.code} — {s.desc} ({s.rate}%)</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Amount</Label><Input type="number" value={form.amount} onChange={(e) => onAmount(e.target.value)} data-testid="tds-amount-input" /></div>
              <div className="space-y-1.5"><Label>Rate %</Label><Input type="number" value={form.rate} disabled /></div>
              <div className="space-y-1.5"><Label>TDS</Label><Input type="number" value={form.tds_amount} onChange={(e) => setForm({ ...form, tds_amount: parseFloat(e.target.value || 0) })} data-testid="tds-tds-input" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} data-testid="tds-save-button">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
