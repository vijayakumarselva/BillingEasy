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
import { Plus, Trash2, FileDown, ScanLine, Upload, Loader2, Smartphone, Copy, CheckCircle2, Bell } from "lucide-react";
import DropZone from "@/components/DropZone";
import PartySelect from "@/components/PartySelect";
import { inr, fmtDate, todayISO } from "@/lib/format";

/* ─────────────────────────────────────────────
   GST calculation helpers
───────────────────────────────────────────── */
function calcLine(it, gstMode) {
  const gross = it.qty * it.rate;
  const discount = gross * (it.discount_pct / 100);
  if (gstMode === "inclusive") {
    // Rate already includes GST → back-calculate taxable
    const base = (gross - discount) / (1 + it.gst_rate / 100);
    const gst = base * (it.gst_rate / 100);
    return { taxable: base, gst, total: base + gst };
  }
  // Exclusive — rate is pre-GST
  const taxable = gross - discount;
  const gst = taxable * (it.gst_rate / 100);
  return { taxable, gst, total: taxable + gst };
}

/* ─────────────────────────────────────────────
   AI Scan dialog (inline, rendered inside PurchaseDialog)
───────────────────────────────────────────── */
function AiScanPanel({ onUseData, onCancel }) {
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
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || "";
      if (msg.includes("credit balance") || msg.includes("billing")) {
        toast.error("Anthropic API credits exhausted — contact admin to top up at console.anthropic.com");
      } else if (msg.includes("CORS") || msg.includes("Network")) {
        toast.error("Could not reach AI service — please try again in a moment");
      } else {
        toast.error("AI scan failed — please fill the form manually");
      }
      onCancel();
    } finally { setScanning(false); }
  };

  if (result) {
    return (
      <div className="rounded-xl border p-4 space-y-3 text-sm"
        style={{ background: "hsl(var(--tally-green-light))", borderColor: "hsl(var(--tally-green) / 0.3)" }}>
        <p className="font-semibold" style={{ color: "hsl(var(--tally-green))" }}>AI extracted these details — review before using:</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {result.supplier_name && <div><span className="text-muted-foreground">Supplier:</span> <strong>{result.supplier_name}</strong></div>}
          {result.gstin && <div><span className="text-muted-foreground">GSTIN:</span> {result.gstin}</div>}
          {result.bill_no && <div><span className="text-muted-foreground">Bill #:</span> {result.bill_no}</div>}
          {result.date && <div><span className="text-muted-foreground">Date:</span> {result.date}</div>}
          {result.total && <div><span className="text-muted-foreground">Total:</span> ₹{result.total}</div>}
          {result.items?.length > 0 && <div><span className="text-muted-foreground">Items:</span> {result.items.length} line(s)</div>}
        </div>
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={() => { setFile(null); setResult(null); }}>Re-scan</Button>
          <Button size="sm" style={{ background: "hsl(var(--tally-green))", color: "white" }}
            onClick={() => onUseData(result)}>Use This Data</Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ScanLine className="h-4 w-4" style={{ color: "hsl(var(--tally-green))" }} />
        Upload supplier invoice — AI will fill the form automatically
      </div>
      <DropZone
        accept="image/*,.pdf"
        onFile={setFile}
        file={file}
        icon={ScanLine}
        label="Click or drag & drop invoice here"
        hint="JPG, PNG, PDF — max 10 MB"
        compact
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={scan} disabled={scanning || !file}
          style={file ? { background: "hsl(var(--tally-green))", color: "white" } : {}}>
          {scanning ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Scanning…</> : "Scan with AI"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main page
───────────────────────────────────────────── */
export default function Purchases() {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const [pendingUploads, setPendingUploads] = useState([]);
  const [showUploadLink, setShowUploadLink] = useState(false);
  const [uploadToken, setUploadToken] = useState("");
  const [copied, setCopied] = useState(false);
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    const { data } = await api.get("/purchases");
    setList(data);
    setLoading(false);
  };

  const loadPendingUploads = async () => {
    try {
      const { data } = await api.get("/purchase-uploads");
      setPendingUploads(data || []);
    } catch {}
  };

  const getUploadToken = async () => {
    try {
      const { data } = await api.get("/business/upload-token");
      setUploadToken(data.token);
      setShowUploadLink(true);
    } catch (e) {
      toast.error("Could not generate upload link — please try again in a moment");
    }
  };

  const copyLink = () => {
    const url = `${window.location.origin}/quick-upload?token=${uploadToken}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const applyPendingUpload = (upload) => {
    setPrefill(upload.ai_data);
    setOpen(true);
    api.delete(`/purchase-uploads/${upload.id}`).catch(() => {});
    setPendingUploads(prev => prev.filter(u => u.id !== upload.id));
  };

  const dismissUpload = async (id) => {
    await api.delete(`/purchase-uploads/${id}`).catch(() => {});
    setPendingUploads(prev => prev.filter(u => u.id !== id));
  };

  useEffect(() => { load(); loadPendingUploads(); }, []);
  const remove = async (id) => { await api.delete(`/purchases/${id}`); toast.success("Deleted"); load(); };
  const downloadPdf = async (p) => {
    try {
      const res = await api.get(`/purchases/${p.id}/pdf`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `PB-${(p.bill_no || "purchase").replace(/[\/\s]+/g, "_")}.pdf`;
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
          <Button variant="outline" size="sm" onClick={getUploadToken} className="gap-1.5 text-xs">
            <Smartphone className="h-3.5 w-3.5" /> Mobile Upload Link
          </Button>
          <Button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700" data-testid="purchase-new-button">
            <Plus className="h-4 w-4 mr-1.5" /> New Purchase
          </Button>
        </div>
      </div>

      {/* Pending mobile uploads notification */}
      {pendingUploads.length > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300 text-sm">
            <Bell className="h-4 w-4" />
            {pendingUploads.length} bill{pendingUploads.length > 1 ? "s" : ""} waiting from mobile upload
          </div>
          {pendingUploads.map(u => (
            <div key={u.id} className="flex items-center justify-between gap-3 rounded-lg bg-white dark:bg-black/20 border border-amber-200 px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium">{u.ai_data?.supplier_name || "Unknown supplier"}</span>
                <span className="text-muted-foreground ml-2">#{u.ai_data?.bill_no || "—"}</span>
                {u.ai_data?.total > 0 && <span className="text-muted-foreground ml-2">₹{u.ai_data.total}</span>}
                <div className="text-xs text-muted-foreground truncate">{u.filename}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white h-7 text-xs"
                  onClick={() => applyPendingUpload(u)}>
                  Fill Form
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                  onClick={() => dismissUpload(u.id)}>
                  Dismiss
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mobile upload link modal */}
      {showUploadLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm border border-border p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-green-600 grid place-items-center shrink-0">
                <Smartphone className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold">Mobile Upload Link</h3>
                <p className="text-xs text-muted-foreground">Bookmark this on your phone</p>
              </div>
            </div>
            <div className="rounded-lg bg-muted p-3 text-xs font-mono break-all text-muted-foreground">
              {window.location.origin}/quick-upload?token={uploadToken}
            </div>
            <Button className="w-full gap-2" onClick={copyLink}>
              {copied ? <><CheckCircle2 className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy Link</>}
            </Button>
            <div className="text-xs text-muted-foreground space-y-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 p-3">
              <p className="font-semibold text-blue-800 dark:text-blue-300">How to use from WhatsApp:</p>
              <p>1. Open the bill PDF in WhatsApp</p>
              <p>2. Tap the share icon → <strong>Copy to…</strong> or <strong>Open in Browser</strong></p>
              <p>3. Or just open your bookmark and select the PDF</p>
              <p>4. AI scans it instantly → bill appears here ready to save</p>
            </div>
            <Button variant="outline" className="w-full" onClick={() => setShowUploadLink(false)}>Close</Button>
          </div>
        </div>
      )}

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
                      <Button size="icon" variant="ghost" onClick={() => downloadPdf(p)} title="Download PDF">
                        <FileDown className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-rose-500" /></Button>
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

      <PurchaseDialog
        open={open}
        onClose={() => { setOpen(false); setPrefill(null); }}
        onSaved={load}
        prefill={prefill}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Purchase form dialog
───────────────────────────────────────────── */
function PurchaseDialog({ open, onClose, onSaved, prefill }) {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [banks, setBanks] = useState([]);
  const [branches, setBranches] = useState([]);

  const [partyId, setPartyId] = useState("");
  const [billNo, setBillNo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState("purchase");
  const [items, setItems] = useState([blank()]);
  const [notes, setNotes] = useState("");
  const [bankId, setBankId] = useState("__none__");
  const [branchId, setBranchId] = useState("__none__");
  const [gstMode, setGstMode] = useState("exclusive"); // "exclusive" | "inclusive"
  const [showScan, setShowScan] = useState(false);
  const [ewayBillNo, setEwayBillNo] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [purchaseCategory, setPurchaseCategory] = useState("stock"); // "stock" | "service"

  useEffect(() => {
    if (!open) return;
    api.get("/parties", { params: { type: "supplier" } }).then(r => setSuppliers(r.data));
    const orgId = localStorage.getItem("be_org_id") || "";
    const mode = localStorage.getItem(`biz_mode_${orgId}`) || "b2b";
    api.get("/products", { params: { mode } }).then(r => setProducts(r.data));
    api.get("/bank-accounts").then(r => setBanks(r.data));
    api.get("/orgs/current/branches").then(r => setBranches((r.data || []).filter(b => b.active))).catch(() => {});
  }, [open]);

  // Apply prefill from AI scan
  useEffect(() => {
    if (!prefill) return;
    if (prefill.bill_no) setBillNo(prefill.bill_no);
    if (prefill.date) setDate(prefill.date);
    if (prefill.notes) setNotes(prefill.notes);
    if (prefill.items?.length) {
      setItems(prefill.items.map(it => ({
        product_id: "",
        name: it.name || "",
        hsn: it.hsn || "",
        qty: parseFloat(it.qty) || 1,
        unit: it.unit || "NOS",
        rate: parseFloat(it.rate) || 0,
        discount_pct: 0,
        gst_rate: parseFloat(it.gst_rate) || 18,
      })));
    }
  }, [prefill]);

  function blank() {
    return { product_id: "", name: "", hsn: "", qty: 1, unit: "NOS", rate: 0, discount_pct: 0, gst_rate: 18 };
  }

  const setItem = (i, patch) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  const pickProduct = (i, pid) => {
    const p = products.find(x => x.id === pid);
    if (!p) return;
    setItem(i, { product_id: p.id, name: p.name, hsn: p.hsn, unit: p.unit, rate: p.purchase_price, gst_rate: p.gst_rate });
  };

  const totals = useMemo(() => {
    return items.reduce((acc, it) => {
      const { taxable, gst, total } = calcLine(it, gstMode);
      return { taxable: acc.taxable + taxable, gst: acc.gst + gst, total: acc.total + total };
    }, { taxable: 0, gst: 0, total: 0 });
  }, [items, gstMode]);

  const applyAiData = (data) => {
    if (data.bill_no) setBillNo(data.bill_no);
    if (data.date) setDate(data.date);
    if (data.notes) setNotes(data.notes);
    if (data.eway_bill_no) setEwayBillNo(data.eway_bill_no);
    if (data.vehicle_no) setVehicleNo(data.vehicle_no);
    if (data.items?.length) {
      setItems(data.items.map(it => ({
        product_id: "",
        name: it.name || "",
        hsn: it.hsn || "",
        qty: parseFloat(it.qty) || 1,
        unit: it.unit || "NOS",
        rate: parseFloat(it.rate) || 0,
        discount_pct: 0,
        gst_rate: parseFloat(it.gst_rate) || 18,
      })));
    }
    setShowScan(false);
    toast.success("Bill data filled from AI scan — review and save");
  };

  const save = async () => {
    if (!partyId || !billNo) { toast.error("Supplier and bill # required"); return; }
    // Always save taxable rates to backend (convert if inclusive)
    const normalizedItems = items.map(it => {
      if (gstMode === "inclusive") {
        const base = (it.qty * it.rate) / (1 + it.gst_rate / 100);
        return { ...it, rate: base / (it.qty || 1) };
      }
      return it;
    });
    try {
      await api.post("/purchases", {
        party_id: partyId, bill_no: billNo, purchase_date: date,
        items: normalizedItems, notes, type,
        bank_account_id: (bankId && bankId !== "__none__") ? bankId : null,
        branch_id: (branchId && branchId !== "__none__") ? branchId : "",
        eway_bill_no: ewayBillNo || "",
        vehicle_no: vehicleNo || "",
        purchase_category: purchaseCategory,
      });
      toast.success("Purchase bill saved");
      handleClose();
      onSaved();
    } catch { toast.error("Failed to save"); }
  };

  const handleClose = () => {
    setPartyId(""); setBillNo(""); setDate(todayISO()); setType("purchase");
    setItems([blank()]); setNotes(""); setBankId("__none__"); setBranchId("__none__");
    setGstMode("exclusive"); setShowScan(false);
    setEwayBillNo(""); setVehicleNo(""); setPurchaseCategory("stock");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="purchase-dialog">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>New Purchase Bill</DialogTitle>
            {!showScan && (
              <Button size="sm" variant="outline" onClick={() => setShowScan(true)} className="gap-1.5 text-xs mr-6">
                <ScanLine className="h-3.5 w-3.5" /> Upload & Scan Bill
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* AI Scan panel — shown inline when triggered */}
        {showScan && (
          <AiScanPanel onUseData={applyAiData} onCancel={() => setShowScan(false)} />
        )}

        {/* Header fields */}
        <div className="grid sm:grid-cols-4 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Supplier *</Label>
            <PartySelect
              parties={suppliers} value={partyId} onChange={setPartyId}
              role="supplier" testId="purchase-supplier-select"
              onCreated={(p) => setSuppliers(prev => [...prev, p])} />
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
          <div className="space-y-1.5">
            <Label>Payment Bank</Label>
            <Select value={bankId} onValueChange={setBankId}>
              <SelectTrigger data-testid="purchase-bank-select"><SelectValue placeholder="No bank / cash" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No bank / cash</SelectItem>
                {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.bank_name} — {b.account_no}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {branches.length > 0 && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Receiving Branch / GSTIN</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger data-testid="purchase-branch-select"><SelectValue placeholder="HO — Primary GSTIN (default)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">HO — Primary GSTIN</SelectItem>
                  {branches.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name} — {b.state}{b.gstin ? ` · ${b.gstin}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {purchaseCategory === "stock" && (<>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>e-Way Bill No</Label>
              <Input value={ewayBillNo} onChange={(e) => setEwayBillNo(e.target.value)} placeholder="e.g. 282235713434" data-testid="purchase-eway-input" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Vehicle No</Label>
              <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} placeholder="e.g. TN34MB4437" data-testid="purchase-vehicle-input" />
            </div>
          </>)}
        </div>

        {/* Line items */}
        <div>
          {/* Category + GST mode toggles */}
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Line Items</span>
              <div className="flex rounded-md border overflow-hidden text-xs">
                <button type="button" onClick={() => setPurchaseCategory("stock")}
                  className={`px-3 py-1.5 font-medium transition-colors ${purchaseCategory === "stock" ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted/50"}`}>
                  Stock / Inventory
                </button>
                <button type="button" onClick={() => setPurchaseCategory("service")}
                  className={`px-3 py-1.5 font-medium transition-colors border-l ${purchaseCategory === "service" ? "bg-violet-600 text-white" : "text-muted-foreground hover:bg-muted/50"}`}>
                  Service / Expense
                </button>
              </div>
            </div>
            <div className="flex rounded-md border overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setGstMode("exclusive")}
                className={`px-3 py-1.5 font-medium transition-colors ${gstMode === "exclusive"
                  ? "text-white"
                  : "text-muted-foreground hover:bg-muted/50"}`}
                style={gstMode === "exclusive" ? { background: "hsl(var(--tally-green))" } : {}}>
                GST Exclusive
              </button>
              <button
                type="button"
                onClick={() => setGstMode("inclusive")}
                className={`px-3 py-1.5 font-medium transition-colors border-l ${gstMode === "inclusive"
                  ? "text-white"
                  : "text-muted-foreground hover:bg-muted/50"}`}
                style={gstMode === "inclusive" ? { background: "hsl(var(--tally-green))" } : {}}>
                GST Inclusive
              </button>
            </div>
          </div>
          {purchaseCategory === "stock" && (
            <p className="text-xs text-muted-foreground mb-2">Stock levels will be updated when this bill is saved.</p>
          )}
          {purchaseCategory === "service" && (
            <p className="text-xs text-muted-foreground mb-2">Service / expense purchase — no stock movement.</p>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <table className="app-table">
              <thead>
                <tr>
                  <th>{purchaseCategory === "stock" ? "Product" : "Description"}</th>
                  {purchaseCategory === "stock" && <th>HSN</th>}
                  <th>Qty</th>
                  <th>Rate {gstMode === "inclusive" ? <span className="font-normal opacity-60">(incl. GST)</span> : <span className="font-normal opacity-60">(excl. GST)</span>}</th>
                  <th>GST %</th>
                  <th className="text-right">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const { taxable, gst, total } = calcLine(it, gstMode);
                  return (
                    <tr key={i}>
                      <td>
                        {purchaseCategory === "stock" && (
                          <Select value={it.product_id} onValueChange={(v) => pickProduct(i, v)}>
                            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Pick product" /></SelectTrigger>
                            <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                          </Select>
                        )}
                        <Input className={`h-8 text-xs ${purchaseCategory === "stock" ? "mt-1" : ""}`} placeholder={purchaseCategory === "stock" ? "Or type name" : "Service / expense description"} value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
                      </td>
                      {purchaseCategory === "stock" && <td><Input className="w-20 h-9" value={it.hsn} onChange={(e) => setItem(i, { hsn: e.target.value })} /></td>}
                      <td><Input className="w-20 h-9" type="number" value={it.qty} onChange={(e) => setItem(i, { qty: parseFloat(e.target.value || 0) })} /></td>
                      <td>
                        <Input className="w-28 h-9" type="number" value={it.rate} onChange={(e) => setItem(i, { rate: parseFloat(e.target.value || 0) })} />
                        {gstMode === "inclusive" && it.gst_rate > 0 && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            Taxable: ₹{taxable.toFixed(2)} | GST: ₹{gst.toFixed(2)}
                          </div>
                        )}
                      </td>
                      <td>
                        <Select value={String(it.gst_rate)} onValueChange={(v) => setItem(i, { gst_rate: parseFloat(v) })}>
                          <SelectTrigger className="h-9 w-20"><SelectValue /></SelectTrigger>
                          <SelectContent>{[0, 5, 12, 18, 28].map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="text-right font-mono-fin text-sm">{inr(total)}</td>
                      <td>
                        <Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_, idx) => idx !== i))}>
                          <Trash2 className="h-4 w-4 text-rose-500" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" onClick={() => setItems([...items, blank()])} className="mt-2" data-testid="purchase-add-line">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add line
          </Button>
        </div>

        {/* Notes + Bill breakdown */}
        <div className="flex justify-between items-start gap-4">
          <Textarea placeholder="Notes" rows={2} className="max-w-xs text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />

          <div className="min-w-[220px] rounded-lg border text-sm overflow-hidden">
            <div className="flex justify-between px-4 py-2 border-b">
              <span className="text-muted-foreground">Taxable Amount</span>
              <span className="font-mono-fin">{inr(totals.taxable)}</span>
            </div>
            <div className="flex justify-between px-4 py-2 border-b">
              <span className="text-muted-foreground">GST</span>
              <span className="font-mono-fin">{inr(totals.gst)}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5 font-semibold"
              style={{ background: "hsl(var(--tally-green-light))" }}>
              <span style={{ color: "hsl(var(--tally-green))" }}>Bill Total</span>
              <span className="font-mono-fin text-lg" style={{ color: "hsl(var(--tally-green))" }}>{inr(totals.total)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} data-testid="purchase-save-button">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
