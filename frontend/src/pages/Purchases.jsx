import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Trash2, ArrowLeft, FileDown } from "lucide-react";
import { inr, fmtDate, todayISO } from "@/lib/format";

export default function Purchases() {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  const load = async () => { setLoading(true); const { data } = await api.get("/purchases"); setList(data); setLoading(false); };
  useEffect(() => { load(); }, []);
  const remove = async (id) => { await api.delete(`/purchases/${id}`); toast.success("Deleted"); load(); };
  const downloadPdf = async (p) => {
    try {
      const res = await api.get(`/purchases/${p.id}/pdf`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = (p.bill_no || "purchase").replace(/[\/\s]+/g, "_");
      a.href = url; a.download = `PB-${safe}.pdf`;
      document.body.appendChild(a); a.click();
      a.remove(); window.URL.revokeObjectURL(url);
    } catch { toast.error("PDF download failed"); }
  };

  return (
    <div className="space-y-6" data-testid="purchases-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Purchases / Bills</h1>
          <p className="text-sm text-muted-foreground mt-1">Record bills you get from suppliers. Stock and Input GST update automatically.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700" data-testid="purchase-new-button">
          <Plus className="h-4 w-4 mr-1.5" /> New Purchase
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="app-table">
            <thead><tr><th>Bill #</th><th>Supplier</th><th>Date</th><th>Type</th><th className="text-right">Taxable</th><th className="text-right">GST</th><th className="text-right">Total</th><th></th></tr></thead>
            <tbody>
              {loading ? [1,2,3].map(i => <tr key={i}><td colSpan={8}><Skeleton className="h-8 w-full" /></td></tr>) :
                list.length === 0 ? <tr><td colSpan={8} className="text-center text-muted-foreground py-8">No purchases yet.</td></tr> :
                list.map(p => (
                  <tr key={p.id} data-testid={`purchase-row-${p.bill_no}`}>
                    <td className="font-mono-fin text-blue-600 font-medium">{p.bill_no}</td>
                    <td className="font-medium">{p.party_name}</td>
                    <td className="text-muted-foreground">{fmtDate(p.purchase_date)}</td>
                    <td><Badge variant="secondary">{p.type}</Badge></td>
                    <td className="num">{inr(p.totals.taxable_amount)}</td>
                    <td className="num">{inr(p.totals.cgst + p.totals.sgst + p.totals.igst)}</td>
                    <td className="num font-semibold">{inr(p.totals.grand_total)}</td>
                    <td className="text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" onClick={() => downloadPdf(p)} data-testid={`purchase-pdf-${p.bill_no}`} title="Download PDF">
                        <FileDown className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" data-testid={`purchase-del-${p.bill_no}`}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete {p.bill_no}?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
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

      <PurchaseDialog open={open} onClose={() => setOpen(false)} onSaved={load} />
    </div>
  );
}

function PurchaseDialog({ open, onClose, onSaved }) {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [partyId, setPartyId] = useState("");
  const [billNo, setBillNo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState("purchase");
  const [items, setItems] = useState([blank()]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      api.get("/parties", { params: { type: "supplier" } }).then(r => setSuppliers(r.data));
      api.get("/products").then(r => setProducts(r.data));
    }
  }, [open]);

  function blank() { return { product_id: "", name: "", hsn: "", qty: 1, unit: "NOS", rate: 0, discount_pct: 0, gst_rate: 18 }; }
  const setItem = (i, patch) => setItems(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const pickProduct = (i, pid) => {
    const p = products.find(x => x.id === pid); if (!p) return;
    setItem(i, { product_id: p.id, name: p.name, hsn: p.hsn, unit: p.unit, rate: p.purchase_price, gst_rate: p.gst_rate });
  };

  const total = useMemo(() => items.reduce((sum, it) => {
    const gross = it.qty * it.rate; const d = gross * (it.discount_pct / 100); const tx = gross - d;
    return sum + tx + tx * (it.gst_rate / 100);
  }, 0), [items]);

  const save = async () => {
    if (!partyId || !billNo) { toast.error("Supplier and bill # required"); return; }
    try {
      await api.post("/purchases", { party_id: partyId, bill_no: billNo, purchase_date: date, items, notes, type });
      toast.success("Saved"); onClose(); onSaved();
      setPartyId(""); setBillNo(""); setItems([blank()]);
    } catch { toast.error("Failed"); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl" data-testid="purchase-dialog">
        <DialogHeader><DialogTitle>New Purchase Bill</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-4 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Supplier *</Label>
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger data-testid="purchase-supplier-select"><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Bill #</Label>
            <Input value={billNo} onChange={(e) => setBillNo(e.target.value)} data-testid="purchase-bill-input" />
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="purchase-date-input" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger data-testid="purchase-type-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="purchase">Purchase</SelectItem>
                <SelectItem value="debit_note">Debit Note</SelectItem>
                <SelectItem value="purchase_return">Purchase Return</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="app-table">
            <thead><tr><th>Product</th><th>HSN</th><th>Qty</th><th>Rate</th><th>GST</th><th></th></tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td>
                    <Select value={it.product_id} onValueChange={(v) => pickProduct(i, v)}>
                      <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Pick or type" /></SelectTrigger>
                      <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input className="mt-1 h-8" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
                  </td>
                  <td><Input className="w-20 h-9" value={it.hsn} onChange={(e) => setItem(i, { hsn: e.target.value })} /></td>
                  <td><Input className="w-20 h-9" type="number" value={it.qty} onChange={(e) => setItem(i, { qty: parseFloat(e.target.value || 0) })} /></td>
                  <td><Input className="w-24 h-9" type="number" value={it.rate} onChange={(e) => setItem(i, { rate: parseFloat(e.target.value || 0) })} /></td>
                  <td>
                    <Select value={String(it.gst_rate)} onValueChange={(v) => setItem(i, { gst_rate: parseFloat(v) })}>
                      <SelectTrigger className="h-9 w-20"><SelectValue /></SelectTrigger>
                      <SelectContent>{[0,5,12,18,28].map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td><Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4 text-rose-500" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button variant="outline" size="sm" onClick={() => setItems([...items, blank()])} className="m-3" data-testid="purchase-add-line"><Plus className="h-3.5 w-3.5 mr-1" /> Add line</Button>
        </div>

        <div className="flex justify-between items-center px-3">
          <Textarea placeholder="Notes" rows={2} className="max-w-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Bill Total</div>
            <div className="font-mono-fin text-2xl font-semibold">{inr(total)}</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} data-testid="purchase-save-button">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
