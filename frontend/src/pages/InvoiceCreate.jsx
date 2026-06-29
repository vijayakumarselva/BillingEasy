import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Trash2, Plus, ArrowLeft } from "lucide-react";
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
  const [items, setItems] = useState([blankItem()]);
  const [notes, setNotes] = useState("Thank you for your business!");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/business").then(r => setBiz(r.data || {}));
    api.get("/parties", { params: { type: "customer" } }).then(r => setParties(r.data));
    api.get("/products").then(r => setProducts(r.data));
  }, []);

  function blankItem() {
    return { product_id: "", name: "", hsn: "", qty: 1, unit: "NOS", rate: 0, discount_pct: 0, gst_rate: 18 };
  }

  const party = parties.find(p => p.id === partyId);
  const sameState = (biz.state_code || "33") === (party?.state_code || "33");

  const totals = useMemo(() => {
    let subtotal = 0, discount = 0, taxable = 0, cgst = 0, sgst = 0, igst = 0;
    items.forEach(it => {
      const gross = it.qty * it.rate;
      const d = gross * (it.discount_pct / 100);
      const tx = gross - d;
      const tax = tx * (it.gst_rate / 100);
      subtotal += gross; discount += d; taxable += tx;
      if (sameState) { cgst += tax / 2; sgst += tax / 2; }
      else igst += tax;
    });
    const grand = taxable + cgst + sgst + igst;
    const roundOff = Math.round(grand) - grand;
    return {
      subtotal, discount, taxable_amount: taxable,
      cgst, sgst, igst, round_off: roundOff, grand_total: grand + roundOff,
    };
  }, [items, sameState]);

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
        <div className="flex gap-2">
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

      <Card className="p-5 grid sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Customer *</Label>
          <Select value={partyId} onValueChange={setPartyId}>
            <SelectTrigger data-testid="inv-customer-select"><SelectValue placeholder="Select customer" /></SelectTrigger>
            <SelectContent>
              {parties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
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
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="app-table">
            <thead><tr>
              <th>Product / Description</th><th>HSN</th><th>Qty</th><th>Unit</th>
              <th>Rate</th><th>Disc%</th><th>GST%</th><th className="text-right">Total</th><th></th>
            </tr></thead>
            <tbody>
              {items.map((it, i) => {
                const gross = it.qty * it.rate;
                const d = gross * (it.discount_pct / 100);
                const tx = gross - d;
                const total = tx + tx * (it.gst_rate / 100);
                return (
                  <tr key={i} data-testid={`inv-item-row-${i}`}>
                    <td>
                      <Select value={it.product_id} onValueChange={(v) => pickProduct(i, v)}>
                        <SelectTrigger className="h-9 w-56" data-testid={`inv-item-product-${i}`}><SelectValue placeholder="Pick product or type" /></SelectTrigger>
                        <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input className="mt-1 h-8" value={it.name} placeholder="Description" onChange={(e) => setItem(i, { name: e.target.value })} data-testid={`inv-item-name-${i}`} />
                    </td>
                    <td><Input className="w-20 h-9" value={it.hsn} onChange={(e) => setItem(i, { hsn: e.target.value })} data-testid={`inv-item-hsn-${i}`} /></td>
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
    </div>
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
