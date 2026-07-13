import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Trash2, Plus, ArrowLeft, UserPlus, Landmark } from "lucide-react";
import PartySelect from "@/components/PartySelect";
import { inr, todayISO, addDaysISO } from "@/lib/format";

export default function InvoiceCreate() {
  const nav = useNavigate();
  const [biz, setBiz] = useState({});
  const [parties, setParties] = useState([]);
  const [products, setProducts] = useState([]);
  const [partyId, setPartyId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(addDaysISO(30));
  const [type, setType] = useState("sale");
  const [status, setStatus] = useState("finalized");
  const [invoiceCategory, setInvoiceCategory] = useState("stock"); // "stock" | "service"
  const [taxMode, setTaxMode] = useState("exclusive"); // "exclusive" | "inclusive"
  const [items, setItems] = useState([blankItem()]);
  const [notes, setNotes] = useState("Thank you for your business!");
  const [saving, setSaving] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [banks, setBanks] = useState([]);
  const [bankId, setBankId] = useState("");
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");

  const loadParties = () => api.get("/parties", { params: { type: "customer" } }).then(r => setParties(r.data));

  useEffect(() => {
    api.get("/business").then(r => setBiz(r.data || {}));
    loadParties();
    const orgId = localStorage.getItem("be_org_id") || "";
    const mode = localStorage.getItem(`biz_mode_${orgId}`) || "b2b";
    api.get("/products", { params: { mode } }).then(r => setProducts(r.data));
    api.get("/bank-accounts").then(r => setBanks(r.data));
    api.get("/orgs/current/branches").then(r => setBranches((r.data || []).filter(b => b.active))).catch(() => {});
  }, []);

  function blankItem() {
    return { product_id: "", name: "", hsn: "", qty: 1, unit: "NOS", rate: 0, discount_pct: 0, gst_rate: 18 };
  }

  const party = parties.find(p => p.id === partyId);
  const selectedBranch = branches.find(b => b.id === branchId);
  const sellerStateCode = selectedBranch ? selectedBranch.state_code : (biz.state_code || "33");
  const sameState = sellerStateCode === (party?.state_code || "33");

  const totals = useMemo(() => {
    let subtotal = 0, discount = 0, taxable = 0, cgst = 0, sgst = 0, igst = 0;
    items.forEach(it => {
      if (taxMode === "inclusive") {
        const divisor = 1 + it.gst_rate / 100;
        const grossExcl = (it.qty * it.rate) / divisor;
        const d = grossExcl * (it.discount_pct / 100);
        const tx = grossExcl - d;
        const tax = tx * (it.gst_rate / 100);
        subtotal += grossExcl; discount += d; taxable += tx;
        if (sameState) { cgst += tax / 2; sgst += tax / 2; } else igst += tax;
      } else {
        const gross = it.qty * it.rate;
        const d = gross * (it.discount_pct / 100);
        const tx = gross - d;
        const tax = tx * (it.gst_rate / 100);
        subtotal += gross; discount += d; taxable += tx;
        if (sameState) { cgst += tax / 2; sgst += tax / 2; } else igst += tax;
      }
    });
    const grand = taxable + cgst + sgst + igst;
    const roundOff = Math.round(grand) - grand;
    return {
      subtotal, discount, taxable_amount: taxable,
      cgst, sgst, igst, round_off: roundOff, grand_total: grand + roundOff,
    };
  }, [items, sameState, taxMode]);

  const setItem = (i, patch) => setItems(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const pickProduct = (i, pid) => {
    const p = products.find(x => x.id === pid);
    if (!p) return;
    setItem(i, {
      product_id: p.id, name: p.name, hsn: p.hsn, unit: p.unit,
      rate: p.sale_price, gst_rate: p.gst_rate,
    });
  };

  const save = async () => {
    if (!partyId) { toast.error("Select a customer"); return; }
    if (!items.length || items.some(it => !it.name)) { toast.error("Add at least one item"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/invoices", {
        party_id: partyId, invoice_date: invoiceDate, due_date: dueDate,
        items, notes, status, type, is_recurring: false,
        bank_account_id: (bankId && bankId !== "__none__") ? bankId : null,
        branch_id: (branchId && branchId !== "__none__") ? branchId : "",
        invoice_category: invoiceCategory,
        tax_mode: taxMode,
      });
      toast.success("Invoice created");
      nav(`/sales/${data.id}`);
    } catch (e) {
      toast.error("Failed to create");
    } finally { setSaving(false); }
  };

  const TYPE_LABEL = { sale: "Sale Invoice", quotation: "Quotation", credit_note: "Credit Note", sales_return: "Sales Return" };

  return (
    <div className="space-y-6" data-testid="invoice-create-page">
      <Button variant="ghost" onClick={() => nav(-1)} data-testid="invoice-create-back"><ArrowLeft className="h-4 w-4 mr-1.5" /> Back</Button>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">New {TYPE_LABEL[type]}</h1>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex rounded-md border overflow-hidden text-xs">
            <button type="button" onClick={() => setInvoiceCategory("stock")}
              className={`px-3 py-1.5 font-medium transition-colors ${invoiceCategory === "stock" ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted/50"}`}>
              Stock Invoice
            </button>
            <button type="button" onClick={() => setInvoiceCategory("service")}
              className={`px-3 py-1.5 font-medium transition-colors border-l ${invoiceCategory === "service" ? "bg-violet-600 text-white" : "text-muted-foreground hover:bg-muted/50"}`}>
              Service Invoice
            </button>
          </div>
          <div className="flex rounded-md border overflow-hidden text-xs">
            <button type="button" onClick={() => setTaxMode("exclusive")}
              className={`px-3 py-1.5 font-medium transition-colors ${taxMode === "exclusive" ? "bg-gray-700 text-white" : "text-muted-foreground hover:bg-muted/50"}`}>
              + Tax
            </button>
            <button type="button" onClick={() => setTaxMode("inclusive")}
              className={`px-3 py-1.5 font-medium transition-colors border-l ${taxMode === "inclusive" ? "bg-gray-700 text-white" : "text-muted-foreground hover:bg-muted/50"}`}>
              Incl. Tax
            </button>
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-44" data-testid="inv-type-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sale">Sale Invoice</SelectItem>
              <SelectItem value="quotation">Quotation</SelectItem>
              <SelectItem value="credit_note">Credit Note</SelectItem>
              <SelectItem value="sales_return">Sales Return</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-32" data-testid="inv-status-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="finalized">Finalize</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="p-5 grid sm:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label>Customer *</Label>
          <PartySelect
            parties={parties} value={partyId} onChange={setPartyId}
            role="customer" testId="inv-customer-select"
            onCreated={(p) => { setParties(prev => [...prev, p]); }} />
          {party && (
            <div className="text-xs text-muted-foreground mt-1">
              {party.state} · GSTIN: {party.gstin || "—"} · {sameState ? "Intra-state (CGST+SGST)" : "Inter-state (IGST)"}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Invoice Date</Label>
          <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} data-testid="inv-date-input" />
        </div>
        <div className="space-y-1.5">
          <Label>Due Date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} data-testid="inv-due-input" />
        </div>
        <div className="space-y-1.5">
          <Label>Payment Bank</Label>
          <Select value={bankId} onValueChange={setBankId}>
            <SelectTrigger data-testid="inv-bank-select"><SelectValue placeholder="No bank / cash" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No bank / cash</SelectItem>
              {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.bank_name} — {b.account_no}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {branches.length > 0 && (
          <div className="space-y-1.5">
            <Label>Billing Branch / GSTIN</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger data-testid="inv-branch-select"><SelectValue placeholder={`HO — ${biz.state || "Primary"} (default)`} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">HO — {biz.state} (primary GSTIN)</SelectItem>
                {branches.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} — {b.state} {b.gstin ? `· ${b.gstin}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBranch && (
              <p className="text-xs text-muted-foreground">
                Selling from <strong>{selectedBranch.state}</strong> → buyer in <strong>{party?.state || "?"}</strong> →{" "}
                <span className={sameState ? "text-green-600" : "text-amber-600"}>
                  {sameState ? "CGST + SGST (intra-state)" : "IGST (inter-state)"}
                </span>
              </p>
            )}
          </div>
        )}
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="app-table">
            <thead><tr>
              <th>{invoiceCategory === "stock" ? "Product" : "Service / Description"}</th>
              {invoiceCategory === "stock" && <th>HSN</th>}
              <th>Qty</th><th>Unit</th>
              <th>Rate</th><th>Disc%</th><th>GST%</th><th className="text-right">Total</th><th></th>
            </tr></thead>
            <tbody>
              {items.map((it, i) => {
                const gross = it.qty * it.rate;
                const d = gross * (it.discount_pct / 100);
                const tx = gross - d;
                const total = taxMode === "inclusive"
                  ? tx  // rate already includes tax
                  : tx + tx * (it.gst_rate / 100);
                return (
                  <tr key={i} data-testid={`inv-item-row-${i}`}>
                    <td>
                      {invoiceCategory === "stock" && (
                        <Select value={it.product_id} onValueChange={(v) => pickProduct(i, v)}>
                          <SelectTrigger className="h-9 w-56" data-testid={`inv-item-product-${i}`}><SelectValue placeholder="Pick product or type" /></SelectTrigger>
                          <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                      <Input className={`h-8 ${invoiceCategory === "stock" ? "mt-1" : ""}`} value={it.name} placeholder={invoiceCategory === "stock" ? "Description" : "Service description"} onChange={(e) => setItem(i, { name: e.target.value })} data-testid={`inv-item-name-${i}`} />
                    </td>
                    {invoiceCategory === "stock" && <td><Input className="w-20 h-9" value={it.hsn} onChange={(e) => setItem(i, { hsn: e.target.value })} data-testid={`inv-item-hsn-${i}`} /></td>}
                    <td><Input className="w-16 h-9" type="number" value={it.qty} onChange={(e) => setItem(i, { qty: parseFloat(e.target.value || 0) })} data-testid={`inv-item-qty-${i}`} /></td>
                    <td><Input className="w-16 h-9" value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} data-testid={`inv-item-unit-${i}`} /></td>
                    <td><Input className="w-24 h-9" type="number" value={it.rate} onChange={(e) => setItem(i, { rate: parseFloat(e.target.value || 0) })} data-testid={`inv-item-rate-${i}`} /></td>
                    <td><Input className="w-16 h-9" type="number" value={it.discount_pct} onChange={(e) => setItem(i, { discount_pct: parseFloat(e.target.value || 0) })} data-testid={`inv-item-disc-${i}`} /></td>
                    <td>
                      <Select value={String(it.gst_rate)} onValueChange={(v) => setItem(i, { gst_rate: parseFloat(v) })}>
                        <SelectTrigger className="h-9 w-20" data-testid={`inv-item-gst-${i}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{[0,5,12,18,28].map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="num">{inr(total)}</td>
                    <td>
                      <Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_, idx) => idx !== i))} data-testid={`inv-item-del-${i}`}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="p-3 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setItems([...items, blankItem()])} data-testid="inv-add-line-button">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add line
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <Label>Notes / Terms</Label>
          <Textarea className="mt-1.5" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="inv-notes-input" />
        </Card>
        <Card className="p-5 space-y-2">
          <Row label="Subtotal" value={totals.subtotal} />
          <Row label="Discount" value={-totals.discount} />
          <Row label="Taxable Amount" value={totals.taxable_amount} bold />
          {sameState ? (<>
            <Row label="CGST" value={totals.cgst} />
            <Row label="SGST" value={totals.sgst} />
          </>) : <Row label="IGST" value={totals.igst} />}
          <Row label="Round Off" value={totals.round_off} />
          <div className="border-t border-border pt-2 flex justify-between">
            <span className="font-semibold text-lg">Grand Total</span>
            <span className="font-mono-fin text-2xl font-semibold text-blue-600" data-testid="inv-grand-total">{inr(totals.grand_total)}</span>
          </div>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => nav(-1)}>Cancel</Button>
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} disabled={saving} data-testid="inv-save-button">
          {saving ? "Saving…" : "Save Invoice"}
        </Button>
      </div>

      <QuickAddCustomerDialog
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onSaved={async (newParty) => {
          await loadParties();
          setPartyId(newParty.id);
        }}
      />
    </div>
  );
}

function QuickAddCustomerDialog({ open, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");
  const [state, setState] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setName(""); setPhone(""); setGstin(""); setState(""); setStateCode(""); };

  const handleClose = () => { reset(); onClose(); };

  const save = async () => {
    if (!name.trim()) { toast.error("Customer name is required"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/parties", {
        type: "customer", name: name.trim(), phone, gstin, state, state_code: stateCode,
      });
      toast.success(`Customer "${data.name}" added`);
      reset();
      onClose();
      onSaved(data);
    } catch {
      toast.error("Failed to add customer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" data-testid="quick-add-customer-dialog">
        <DialogHeader>
          <DialogTitle>Quick-add Customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" data-testid="qac-name" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" data-testid="qac-phone" />
          </div>
          <div className="space-y-1.5">
            <Label>GSTIN</Label>
            <Input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="e.g. 29AABCU9603R1ZX" data-testid="qac-gstin" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>State</Label>
              <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="e.g. Tamil Nadu" data-testid="qac-state" />
            </div>
            <div className="space-y-1.5">
              <Label>State Code</Label>
              <Input value={stateCode} onChange={(e) => setStateCode(e.target.value)} placeholder="e.g. 33" data-testid="qac-state-code" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} disabled={saving} data-testid="qac-save">
            {saving ? "Saving…" : "Add Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={bold ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className="font-mono-fin">{inr(value)}</span>
    </div>
  );
}
