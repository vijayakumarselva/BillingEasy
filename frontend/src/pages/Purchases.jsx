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
import { Plus, Trash2, ArrowLeft, FileDown, ScanLine, Upload } from "lucide-react";
import { inr, fmtDate, todayISO } from "@/lib/format";

function AiScanDialog({ open, onClose, onUseData }) {
  const [file, setFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);

  const scan = async () => {
    if (!file) { toast.error("Select an invoice image or PDF"); return; }
    setScanning(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/purchases/ai-scan", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setResult(data);
    } catch {
      toast.error("AI scan failed — please fill manually");
      onClose();
    } finally { setScanning(false); }
  };

  const reset = () => { setFile(null); setResult(null); };
  const handleClose = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>AI Scan Vendor Invoice</DialogTitle></DialogHeader>
        {!result ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Upload a photo or PDF of your supplier's invoice. AI will extract the details automatically.</p>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:bg-muted/30 transition-colors">
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="text-sm font-medium">{file ? file.name : "Click to upload invoice"}</span>
              <span className="text-xs text-muted-foreground mt-1">JPG, PNG, PDF — max 10 MB</span>
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={scan} disabled={scanning || !file}>
                {scanning ? "Scanning…" : "Scan with AI"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-green-600">AI extracted these details:</p>
            <div className="bg-muted/40 rounded-lg p-3 space-y-1.5">
              {result.supplier_name && <div><span className="text-muted-foreground">Supplier:</span> {result.supplier_name}</div>}
              {result.bill_no && <div><span className="text-muted-foreground">Bill #:</span> {result.bill_no}</div>}
              {result.date && <div><span className="text-muted-foreground">Date:</span> {result.date}</div>}
              {result.total && <div><span className="text-muted-foreground">Total:</span> ₹{result.total}</div>}
              {result.items?.length > 0 && (
                <div><span className="text-muted-foreground">Items:</span> {result.items.length} line(s) found</div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Review and adjust in the form before saving.</p>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>Re-scan</Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => { onUseData(result); reset(); }}>
                Use This Data
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Purchases() {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [prefill, setPrefill] = useState(null);
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAiOpen(true)} data-testid="purchase-ai-scan-button">
            <ScanLine className="h-4 w-4 mr-1.5" /> AI Scan Invoice
          </Button>
          <Button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700" data-testid="purchase-new-button">
            <Plus className="h-4 w-4 mr-1.5" /> New Purchase
          </Button>
        </div>
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

      <AiScanDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onUseData={(data) => { setAiOpen(false); setPrefill(data); setOpen(true); }}
      />
      <PurchaseDialog open={open} onClose={() => { setOpen(false); setPrefill(null); }} onSaved={load} prefill={prefill} />
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
