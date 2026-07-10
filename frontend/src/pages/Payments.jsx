import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import PartySelect from "@/components/PartySelect";
import { inr, fmtDate, todayISO } from "@/lib/format";

export default function Payments() {
  const [tab, setTab] = useState("received");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => { setLoading(true); const { data } = await api.get("/payments", { params: { direction: tab } }); setList(data); setLoading(false); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);
  const remove = async (id) => { await api.delete(`/payments/${id}`); toast.success("Deleted"); load(); };

  return (
    <div className="space-y-6" data-testid="payments-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Money In / Out</h1>
          <p className="text-sm text-muted-foreground mt-1">Record payments received from customers and payments made to suppliers — Cash, UPI, Bank, Cheque or Card.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700" data-testid="payment-new-button">
          <Plus className="h-4 w-4 mr-1.5" /> New Payment
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="received" data-testid="tab-received">Money In</TabsTrigger>
          <TabsTrigger value="paid" data-testid="tab-paid">Money Out</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <div className="overflow-x-auto">
          <table className="app-table">
            <thead><tr><th>Date</th><th>Party</th><th>Mode</th><th>Reference</th><th className="text-right">Amount</th><th></th></tr></thead>
            <tbody>
              {loading ? [1,2,3].map(i => <tr key={i}><td colSpan={6}><Skeleton className="h-8 w-full" /></td></tr>) :
                list.length === 0 ? <tr><td colSpan={6} className="text-center text-muted-foreground py-8">No payments.</td></tr> :
                list.map(p => (
                  <tr key={p.id} data-testid={`payment-row-${p.id}`}>
                    <td className="text-muted-foreground">{fmtDate(p.date)}</td>
                    <td className="font-medium">{p.party_name}</td>
                    <td><Badge variant="secondary">{p.mode}</Badge></td>
                    <td className="font-mono-fin text-xs">{p.reference || "—"}</td>
                    <td className="num font-semibold">{inr(p.amount)}</td>
                    <td className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-rose-500" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete payment?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(p.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <PaymentDialog open={open} onClose={() => setOpen(false)} direction={tab} onSaved={load} />
    </div>
  );
}

function PaymentDialog({ open, onClose, direction, onSaved }) {
  const [parties, setParties] = useState([]);
  const [form, setForm] = useState({ party_id: "", amount: 0, mode: "Cash", date: todayISO(), reference: "" });
  useEffect(() => {
    if (open) api.get("/parties", { params: { type: direction === "received" ? "customer" : "supplier" } }).then(r => setParties(r.data));
  }, [open, direction]);

  const save = async () => {
    if (!form.party_id || !form.amount) { toast.error("Party and amount required"); return; }
    try {
      await api.post("/payments", { ...form, direction, amount: parseFloat(form.amount) });
      toast.success("Saved"); onClose(); onSaved();
      setForm({ party_id: "", amount: 0, mode: "Cash", date: todayISO(), reference: "" });
    } catch { toast.error("Failed"); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent data-testid="payment-form-dialog">
        <DialogHeader><DialogTitle>New {direction === "received" ? "Money In" : "Money Out"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{direction === "received" ? "Customer" : "Supplier"} *</Label>
            <PartySelect
              parties={parties}
              value={form.party_id}
              onChange={(v) => setForm({ ...form, party_id: v })}
              role={direction === "received" ? "customer" : "supplier"}
              testId="pay-party-select"
              onCreated={(p) => setParties(prev => [...prev, p])} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Amount</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} data-testid="pay-amount-input" /></div>
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="pay-date-input" /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
              <SelectTrigger data-testid="pay-mode-select"><SelectValue /></SelectTrigger>
              <SelectContent>{["Cash","Bank Transfer","UPI","Cheque","Card"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Reference</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} data-testid="pay-ref-input" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} data-testid="pay-save-button">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
