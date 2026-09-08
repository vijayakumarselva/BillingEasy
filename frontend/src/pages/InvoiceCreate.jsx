import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Trash2, Plus, ArrowLeft, Search, Paperclip, ChevronRight, BarChart2, RefreshCw, Warehouse } from "lucide-react";
import { inr, todayISO, addDaysISO } from "@/lib/format";

// ── helpers ─────────────────────────────────────────────────────────────────
function blankItem() {
  return { product_id: "", name: "", description: "", hsn: "", qty: 1, unit: "NOS", rate: 0, discount_pct: 0, gst_rate: 5, stock: null };
}

const TERMS_OPTIONS = [
  { label: "Due on Receipt", days: 0 },
  { label: "Net 15",         days: 15 },
  { label: "Net 30",         days: 30 },
  { label: "Net 45",         days: 45 },
  { label: "Net 60",         days: 60 },
  { label: "Custom",         days: null },
];

const STATES = [
  { name:"Andhra Pradesh",code:"37"}, { name:"Arunachal Pradesh",code:"12"},
  { name:"Assam",code:"18"}, { name:"Bihar",code:"10"}, { name:"Chhattisgarh",code:"22"},
  { name:"Goa",code:"30"}, { name:"Gujarat",code:"24"}, { name:"Haryana",code:"06"},
  { name:"Himachal Pradesh",code:"02"}, { name:"Jharkhand",code:"20"}, { name:"Karnataka",code:"29"},
  { name:"Kerala",code:"32"}, { name:"Madhya Pradesh",code:"23"}, { name:"Maharashtra",code:"27"},
  { name:"Manipur",code:"14"}, { name:"Meghalaya",code:"17"}, { name:"Mizoram",code:"15"},
  { name:"Nagaland",code:"13"}, { name:"Odisha",code:"21"}, { name:"Punjab",code:"03"},
  { name:"Rajasthan",code:"08"}, { name:"Sikkim",code:"11"}, { name:"Tamil Nadu",code:"33"},
  { name:"Telangana",code:"36"}, { name:"Tripura",code:"16"}, { name:"Uttar Pradesh",code:"09"},
  { name:"Uttarakhand",code:"05"}, { name:"West Bengal",code:"19"},
  { name:"Delhi",code:"07"}, { name:"Jammu & Kashmir",code:"01"}, { name:"Ladakh",code:"38"},
  { name:"Puducherry",code:"34"}, { name:"Chandigarh",code:"04"},
];

function calcLine(it, taxMode, sameState) {
  const gross = it.qty * it.rate;
  const d = gross * ((it.discount_pct || 0) / 100);
  let taxable, gstAmt;
  if (taxMode === "inclusive") {
    taxable = gross / (1 + it.gst_rate / 100) - d;
  } else {
    taxable = gross - d;
  }
  gstAmt = taxable * (it.gst_rate / 100);
  const lineTotal = taxMode === "inclusive" ? gross - d : taxable + gstAmt;
  return { taxable, gstAmt, lineTotal };
}

// ── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children, className = "" }) {
  return (
    <div className={`bg-white dark:bg-zinc-900 border border-border rounded-md ${className}`}>
      {title && (
        <div className="px-6 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
        </div>
      )}
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}

// ── Required label ───────────────────────────────────────────────────────────
function RLabel({ children, required }) {
  return (
    <label className="block text-sm font-medium mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

// ── Item row ─────────────────────────────────────────────────────────────────
function ItemRow({ it, i, products, taxMode, sameState, onchange, onDelete }) {
  const { taxable, gstAmt, lineTotal } = calcLine(it, taxMode, sameState);
  const gstLabel = sameState
    ? `CGST${it.gst_rate / 2}% + SGST${it.gst_rate / 2}%`
    : `IGST ${it.gst_rate}%`;

  return (
    <tr className="border-b border-border group">
      {/* Item Details */}
      <td className="px-3 py-2 min-w-[260px]">
        <Select value={it.product_id} onValueChange={(v) => {
          const p = products.find(x => x.id === v);
          if (p) onchange({ product_id: p.id, name: p.name, hsn: p.hsn || "", unit: p.unit || "NOS", rate: p.sale_price || 0, gst_rate: p.gst_rate ?? 5, stock: p.stock ?? null });
        }}>
          <SelectTrigger className="h-8 text-sm border-dashed mb-1" data-testid={`inv-item-product-${i}`}>
            <SelectValue placeholder="Select an Item" />
          </SelectTrigger>
          <SelectContent>
            {products.map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
                {p.stock != null && <span className="ml-2 text-muted-foreground text-xs">({p.stock} in stock)</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="h-8 text-sm" placeholder="Description"
          value={it.name} onChange={e => onchange({ name: e.target.value })}
          data-testid={`inv-item-name-${i}`}
        />
        {(it.stock != null || it.hsn) && (
          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
            {it.stock != null && <span>Stock on Hand: <strong>{it.stock}</strong></span>}
            {it.hsn && <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">HSN {it.hsn}</span>}
          </div>
        )}
      </td>
      {/* Qty */}
      <td className="px-2 py-2 w-20">
        <Input className="h-8 text-sm text-right" type="number" min="0" value={it.qty}
          onChange={e => onchange({ qty: parseFloat(e.target.value) || 0 })} data-testid={`inv-item-qty-${i}`} />
        <div className="text-xs text-muted-foreground text-center mt-0.5">{it.unit}</div>
      </td>
      {/* Rate */}
      <td className="px-2 py-2 w-28">
        <Input className="h-8 text-sm text-right" type="number" min="0" value={it.rate}
          onChange={e => onchange({ rate: parseFloat(e.target.value) || 0 })} data-testid={`inv-item-rate-${i}`} />
        {it.discount_pct > 0 && (
          <div className="text-xs text-muted-foreground text-right mt-0.5">Disc {it.discount_pct}%</div>
        )}
      </td>
      {/* Tax */}
      <td className="px-2 py-2 w-36">
        <Select value={String(it.gst_rate)} onValueChange={v => onchange({ gst_rate: parseFloat(v) })}>
          <SelectTrigger className="h-8 text-sm" data-testid={`inv-item-gst-${i}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[0, 5, 12, 18, 28].map(r => (
              <SelectItem key={r} value={String(r)}>GST{r} [{r}%]</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground mt-0.5">{gstLabel}</div>
      </td>
      {/* Amount */}
      <td className="px-3 py-2 text-right font-mono text-sm w-28">
        {inr(lineTotal)}
      </td>
      {/* Delete */}
      <td className="px-1 py-2 w-8">
        <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 p-1">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function InvoiceCreate() {
  const nav = useNavigate();
  const { id: editId } = useParams();
  const isEdit = !!editId;

  const [biz, setBiz]           = useState({});
  const [parties, setParties]   = useState([]);
  const [products, setProducts] = useState([]);
  const [banks, setBanks]       = useState([]);
  const [branches, setBranches] = useState([]);

  // Header fields
  const [partyId, setPartyId]           = useState("");
  const [partySearch, setPartySearch]   = useState("");
  const [showPartyDD, setShowPartyDD]   = useState(false);
  const [invoiceNo, setInvoiceNo]       = useState("");
  const [orderNo, setOrderNo]           = useState("");
  const [invoiceDate, setInvoiceDate]   = useState(todayISO());
  const [terms, setTerms]               = useState("Due on Receipt");
  const [dueDate, setDueDate]           = useState(todayISO());
  const [placeOfSupply, setPlaceOfSupply] = useState("33");
  const [subject, setSubject]           = useState("");
  const [type, setType]                 = useState("sale");
  const [status, setStatus]             = useState("finalized");
  const [invoiceCategory, setInvoiceCategory] = useState("stock");
  const [warehouses, setWarehouses]           = useState([]);
  const [warehouseId, setWarehouseId]         = useState("");
  const [taxMode, setTaxMode]           = useState("exclusive");
  const [branchId, setBranchId]         = useState("");
  const [bankId, setBankId]             = useState("");

  // Items
  const [items, setItems] = useState([blankItem()]);

  // Totals extras
  const [shippingCharges, setShippingCharges] = useState(0);
  const [adjustment, setAdjustment]           = useState(0);
  const [tdsMode, setTdsMode]                 = useState("none"); // "none" | "tds" | "tcs"
  const [tdsRate, setTdsRate]                 = useState(0.1);

  // Notes / T&C
  const [customerNotes, setCustomerNotes]     = useState("");
  const [termsConditions, setTermsConditions] = useState("");

  const [saving, setSaving] = useState(false);
  const partyRef = useRef(null);

  // Close dropdown when clicking outside the customer search widget
  useEffect(() => {
    const handler = (e) => {
      if (partyRef.current && !partyRef.current.contains(e.target)) {
        setShowPartyDD(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadParties = () => api.get("/parties", { params: { type: "customer" } }).then(r => setParties(r.data));

  useEffect(() => {
    api.get("/business").then(r => setBiz(r.data || {}));
    loadParties();
    const orgId = localStorage.getItem("be_org_id") || "";
    const mode = localStorage.getItem(`biz_mode_${orgId}`) || "b2b";
    api.get("/products", { params: { mode } }).then(r => setProducts(r.data));
    api.get("/bank-accounts").then(r => setBanks(r.data));
    api.get("/orgs/current/branches").then(r => setBranches((r.data || []).filter(b => b.active))).catch(() => {});
    api.get("/warehouses").then(r => setWarehouses((r.data || []).filter(w => w.active !== false))).catch(() => {});
    // Generate invoice number
    if (!isEdit) {
      api.get("/invoices/next-number").then(r => setInvoiceNo(r.data?.next || "")).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!editId) return;
    api.get(`/invoices/${editId}`).then(r => {
      const inv = r.data;
      setPartyId(inv.party_id || "");
      setInvoiceDate(inv.invoice_date || todayISO());
      setDueDate(inv.due_date || todayISO());
      setType(inv.type || "sale");
      setStatus(inv.status || "finalized");
      setInvoiceCategory(inv.invoice_category || "stock");
      setWarehouseId(inv.warehouse_id || "");
      setCustomerNotes(inv.notes || "");
      setOrderNo(inv.po_number || "");
      setBranchId(inv.branch_id || "");
      setItems((inv.items || []).map(it => ({
        product_id: it.product_id || "", name: it.name, description: "",
        hsn: it.hsn || "", qty: it.qty, unit: it.unit || "NOS",
        rate: it.rate, discount_pct: it.discount_pct || 0, gst_rate: it.gst_rate ?? 5, stock: null,
      })));
    }).catch(() => toast.error("Failed to load invoice"));
  }, [editId]);

  // Handle terms change → auto-set due date
  const handleTermsChange = (t) => {
    setTerms(t);
    const opt = TERMS_OPTIONS.find(o => o.label === t);
    if (opt && opt.days !== null) setDueDate(addDaysISO(opt.days, invoiceDate));
  };

  const party = parties.find(p => p.id === partyId);
  const selectedBranch = branches.find(b => b.id === branchId);
  const sellerStateCode = selectedBranch?.state_code || biz.state_code || "33";
  const sameState = sellerStateCode === (party?.state_code || placeOfSupply || "33");

  const filteredParties = partySearch
    ? parties.filter(p => p.name.toLowerCase().includes(partySearch.toLowerCase()))
    : parties;

  const totals = useMemo(() => {
    let subtotal = 0, discount = 0, taxable = 0, cgst = 0, sgst = 0, igst = 0;
    items.forEach(it => {
      const gross = it.qty * it.rate;
      const d = gross * ((it.discount_pct || 0) / 100);
      let tx;
      if (taxMode === "inclusive") {
        tx = gross / (1 + it.gst_rate / 100) - d;
      } else {
        tx = gross - d;
      }
      const tax = tx * (it.gst_rate / 100);
      subtotal += taxMode === "inclusive" ? gross - d : gross;
      discount += taxMode === "inclusive" ? 0 : d;
      taxable  += tx;
      if (sameState) { cgst += tax / 2; sgst += tax / 2; } else igst += tax;
    });
    const shipping = shippingCharges || 0;
    const adj      = adjustment || 0;
    const beforeRound = taxable + cgst + sgst + igst + shipping + adj;
    const roundOff = Math.round(beforeRound) - beforeRound;
    const grand = beforeRound + roundOff;
    // TDS/TCS
    const tdsAmt = tdsMode === "tds" ? Math.round(taxable * tdsRate / 100 * 100) / 100 : 0;
    const tcsAmt = tdsMode === "tcs" ? Math.round(taxable * tdsRate / 100 * 100) / 100 : 0;
    return { subtotal, discount, taxable, cgst, sgst, igst, shipping, adj, roundOff, grand, tdsAmt, tcsAmt };
  }, [items, sameState, taxMode, shippingCharges, adjustment, tdsMode, tdsRate]);

  const setItem = (i, patch) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  const save = async () => {
    if (!partyId) { toast.error("Select a customer"); return; }
    if (!items.length || items.some(it => !it.name)) { toast.error("Add at least one item with a name"); return; }
    setSaving(true);
    try {
      // For inclusive GST: convert each item's rate to the exclusive taxable base
      // so the backend (which always calculates GST on top of rate) produces correct totals.
      // inclusive: rate already contains GST → taxable_base = rate / (1 + gst_rate/100)
      const normalizedItems = items.map(({ stock, description, ...it }) => {
        if (taxMode === "inclusive" && it.gst_rate > 0) {
          const grossInclusive = it.qty * it.rate * (1 - (it.discount_pct || 0) / 100);
          const taxableTotal = grossInclusive / (1 + it.gst_rate / 100);
          const baseRate = taxableTotal / (it.qty || 1);
          return { ...it, rate: parseFloat(baseRate.toFixed(6)), discount_pct: 0 };
        }
        return it;
      });
      const payload = {
        party_id: partyId, invoice_date: invoiceDate, due_date: dueDate,
        items: normalizedItems,
        notes: customerNotes, status, type, is_recurring: false,
        bank_account_id: (bankId && bankId !== "__none__") ? bankId : null,
        branch_id: (branchId && branchId !== "__none__") ? branchId : "",
        invoice_category: invoiceCategory,
        tax_mode: taxMode,
        shipping_address: "",
        po_number: orderNo,
        subject,
        tds_rate: tdsMode !== "none" ? tdsRate : 0,
        tds_amount: tdsMode === "tds" ? totals.tdsAmt : 0,
        warehouse_id: invoiceCategory === "stock" && warehouseId !== "__none__" ? warehouseId : "",
      };
      const { data } = isEdit
        ? await api.put(`/invoices/${editId}`, payload)
        : await api.post("/invoices", payload);
      toast.success(isEdit ? "Invoice updated" : "Invoice created");
      nav(`/sales/${data.id}`);
    } catch { toast.error(isEdit ? "Failed to update" : "Failed to create invoice"); }
    finally { setSaving(false); }
  };

  const TYPE_OPTS = [
    { value: "sale", label: "Sale Invoice" },
    { value: "quotation", label: "Quotation" },
    { value: "credit_note", label: "Credit Note" },
    { value: "sales_return", label: "Sales Return" },
  ];

  return (
    <div className="min-h-screen bg-muted/30 dark:bg-zinc-950 pb-16">
      {/* Top action bar */}
      <div className="sticky top-0 z-30 bg-white dark:bg-zinc-900 border-b border-border px-6 py-3 flex items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => nav(-1)} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold">
            {isEdit ? "Edit" : "New"} {TYPE_OPTS.find(t => t.value === type)?.label || "Invoice"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 w-40 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{TYPE_OPTS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-28 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="finalized">Finalize</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => nav(-1)}>Cancel</Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={save} disabled={saving} data-testid="inv-save-button">
            {saving ? "Saving…" : isEdit ? "Update" : "Save"}
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">

        {/* ── Customer + Header fields ─────────────────────────────── */}
        <Section>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
            {/* Left column */}
            <div className="space-y-4">
              {/* Customer Name */}
              <div>
                <RLabel required>Customer Name</RLabel>
                <div className="relative" ref={partyRef}>
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      <Input
                        className="pr-8 border-blue-400 focus:border-blue-600"
                        placeholder="Search customer…"
                        value={partySearch || party?.name || ""}
                        onFocus={() => setShowPartyDD(true)}
                        onChange={e => { setPartySearch(e.target.value); setShowPartyDD(true); }}
                        data-testid="inv-customer-search"
                      />
                      <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    </div>
                    <button className="border border-border rounded-md px-2 text-xs text-muted-foreground hover:bg-muted transition-colors">INR</button>
                  </div>
                  {showPartyDD && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-zinc-900 border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {filteredParties.length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No customers found</div>
                      )}
                      {filteredParties.map(p => (
                        <div key={p.id} className="px-3 py-2 text-sm hover:bg-muted cursor-pointer"
                          onClick={() => { setPartyId(p.id); setPartySearch(""); setShowPartyDD(false); setPlaceOfSupply(p.state_code || "33"); }}>
                          <div className="font-medium">{p.name}</div>
                          {p.gstin && <div className="text-xs text-muted-foreground">{p.gstin}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Addresses */}
                {party && (
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                        BILLING ADDRESS <button className="text-blue-500 hover:underline ml-1">✏</button>
                      </div>
                      <div className="text-xs text-foreground leading-relaxed">
                        {party.name}<br/>
                        {party.billing_address || party.state || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                        SHIPPING ADDRESS <button className="text-blue-500 hover:underline ml-1">✏</button>
                      </div>
                      <div className="text-xs text-foreground leading-relaxed">
                        {party.shipping_address || party.billing_address || "Same as billing"}
                      </div>
                    </div>
                  </div>
                )}
                {/* GST details */}
                {party && (
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">BILLING GST DETAILS</div>
                      <div className="text-xs space-y-0.5">
                        <div>GST Treatment: <span className="text-foreground">{party.gstin ? "Registered Business - Regular" : "Unregistered"}</span></div>
                        {party.gstin && <div>GSTIN: <span className="font-mono text-foreground">{party.gstin}</span></div>}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">GST TYPE</div>
                      <div className="text-xs">
                        <span className={`font-medium ${sameState ? "text-green-600" : "text-amber-600"}`}>
                          {sameState ? "CGST + SGST (Intra-state)" : "IGST (Inter-state)"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Place of Supply */}
              <div>
                <RLabel required>Place of Supply</RLabel>
                <Select value={placeOfSupply} onValueChange={setPlaceOfSupply}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATES.map(s => <SelectItem key={s.code} value={s.code}>[{s.code}] {s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground mt-1">Source of Supply: {biz.state || "—"}</div>
              </div>

              {/* Location / Branch */}
              {branches.length > 0 && (
                <div>
                  <RLabel>Location</RLabel>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Head Office" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Head Office</SelectItem>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {/* Invoice # */}
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <RLabel required>Invoice #</RLabel>
                  <Input className="h-9 text-sm font-mono" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} data-testid="inv-number-input" />
                </div>
                {party && (
                  <div className="mt-6 flex items-center gap-2 bg-gray-800 text-white text-sm px-3 py-1.5 rounded-md min-w-[140px] justify-between">
                    <span className="truncate max-w-[110px] text-xs">{party.name}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  </div>
                )}
              </div>

              {/* Order Number */}
              <div>
                <RLabel>Order Number</RLabel>
                <Input className="h-9 text-sm" value={orderNo} onChange={e => setOrderNo(e.target.value)} placeholder="e.g. PO-001" data-testid="inv-order-input" />
              </div>

              {/* Invoice Date + Terms + Due Date */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <RLabel required>Invoice Date</RLabel>
                  <Input type="date" className="h-9 text-sm" value={invoiceDate}
                    onChange={e => { setInvoiceDate(e.target.value); handleTermsChange(terms); }}
                    data-testid="inv-date-input" />
                </div>
                <div>
                  <RLabel>Terms</RLabel>
                  <Select value={terms} onValueChange={handleTermsChange}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TERMS_OPTIONS.map(o => <SelectItem key={o.label} value={o.label}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <RLabel>Due Date</RLabel>
                  <Input type="date" className="h-9 text-sm" value={dueDate}
                    onChange={e => { setDueDate(e.target.value); setTerms("Custom"); }}
                    data-testid="inv-due-input" />
                </div>
              </div>

              {/* Subject */}
              <div>
                <RLabel>Subject</RLabel>
                <div className="relative">
                  <Input className="h-9 text-sm pr-8" placeholder="Let your customer know what this Invoice is for"
                    value={subject} onChange={e => setSubject(e.target.value)} />
                  <button className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">✏</button>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* ── Item Table ───────────────────────────────────────────── */}
        <Section>
          {/* Table options row */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              {branches.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-muted-foreground">Warehouse Location</span>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger className="h-7 text-xs border-dashed"><SelectValue placeholder="Head Office" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Head Office</SelectItem>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-sm border rounded-md overflow-hidden">
                <button
                  onClick={() => setTaxMode("exclusive")}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${taxMode === "exclusive" ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted"}`}>
                  Tax Exclusive
                </button>
                <button
                  onClick={() => setTaxMode("inclusive")}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${taxMode === "inclusive" ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted"}`}>
                  Tax Inclusive
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex items-center gap-1.5 text-sm border rounded-md overflow-hidden">
                <button
                  onClick={() => setInvoiceCategory("stock")}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${invoiceCategory === "stock" ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted"}`}>
                  Stock / Inventory
                </button>
                <button
                  onClick={() => setInvoiceCategory("service")}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${invoiceCategory === "service" ? "bg-violet-600 text-white" : "text-muted-foreground hover:bg-muted"}`}>
                  Service / Expense
                </button>
              </div>
              {invoiceCategory === "stock" && (
                <div className="flex items-center gap-1.5">
                  <Warehouse className="h-3.5 w-3.5 text-muted-foreground" />
                  <Select value={warehouseId} onValueChange={setWarehouseId}>
                    <SelectTrigger className="h-7 text-xs w-44 border-dashed">
                      <SelectValue placeholder="Dispatch from warehouse…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— No specific warehouse —</SelectItem>
                      {warehouses.map(w => (
                        <SelectItem key={w.id} value={w.id}>{w.name}{w.branch_name ? ` · ${w.branch_name}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <th className="px-3 py-2.5 text-left">ITEM DETAILS</th>
                  <th className="px-2 py-2.5 text-right">QUANTITY</th>
                  <th className="px-2 py-2.5 text-right">RATE ☰</th>
                  <th className="px-2 py-2.5 text-left">TAX</th>
                  <th className="px-3 py-2.5 text-right">AMOUNT</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <ItemRow key={i} it={it} i={i} products={products} taxMode={taxMode} sameState={sameState}
                    onchange={patch => setItem(i, patch)}
                    onDelete={() => setItems(prev => prev.filter((_, idx) => idx !== i))}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 mt-3">
            <Button variant="outline" size="sm" onClick={() => setItems(prev => [...prev, blankItem()])} data-testid="inv-add-line-button">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add New Row
            </Button>
          </div>
        </Section>

        {/* ── Notes + Totals ───────────────────────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          {/* Customer Notes */}
          <Section title="Customer Notes">
            <Textarea rows={3} placeholder="Enter any notes to be displayed on the invoice…"
              value={customerNotes} onChange={e => setCustomerNotes(e.target.value)}
              data-testid="inv-notes-input" className="text-sm resize-none" />
            <p className="text-xs text-muted-foreground mt-1">Will be displayed on the invoice</p>
          </Section>

          {/* Totals summary */}
          <div className="bg-white dark:bg-zinc-900 border border-border rounded-md overflow-hidden text-sm">
            <div className="divide-y divide-border">
              <div className="flex justify-between px-5 py-2.5">
                <span className="text-muted-foreground">Sub Total {taxMode === "inclusive" && <span className="text-xs">(Tax Inclusive)</span>}</span>
                <span className="font-mono">{inr(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between items-center px-5 py-2.5">
                <span className="text-muted-foreground">Shipping Charges</span>
                <div className="flex items-center gap-2">
                  <Input type="number" min="0" className="h-7 w-24 text-right text-sm font-mono"
                    value={shippingCharges || ""} placeholder="0" onChange={e => setShippingCharges(parseFloat(e.target.value) || 0)} />
                </div>
              </div>
              {sameState ? (<>
                <div className="flex justify-between px-5 py-2.5">
                  <span className="text-muted-foreground">CGST {totals.cgst > 0 ? `[${items[0]?.gst_rate/2 || 0}%]` : ""}</span>
                  <span className="font-mono">{inr(totals.cgst)}</span>
                </div>
                <div className="flex justify-between px-5 py-2.5">
                  <span className="text-muted-foreground">SGST {totals.sgst > 0 ? `[${items[0]?.gst_rate/2 || 0}%]` : ""}</span>
                  <span className="font-mono">{inr(totals.sgst)}</span>
                </div>
              </>) : (
                <div className="flex justify-between px-5 py-2.5">
                  <span className="text-muted-foreground">IGST</span>
                  <span className="font-mono">{inr(totals.igst)}</span>
                </div>
              )}
              {/* TDS / TCS */}
              <div className="px-5 py-2.5">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="radio" name="tdstcs" value="none" checked={tdsMode === "none"} onChange={() => setTdsMode("none")} />
                    None
                  </label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="radio" name="tdstcs" value="tds" checked={tdsMode === "tds"} onChange={() => setTdsMode("tds")} />
                    TDS
                  </label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="radio" name="tdstcs" value="tcs" checked={tdsMode === "tcs"} onChange={() => setTdsMode("tcs")} />
                    TCS
                  </label>
                  {tdsMode !== "none" && (
                    <div className="flex items-center gap-1.5 ml-auto">
                      <span className="text-xs text-muted-foreground">Rate %</span>
                      <Input type="number" step="0.01" className="h-7 w-20 text-sm text-right"
                        value={tdsRate} onChange={e => setTdsRate(parseFloat(e.target.value) || 0)} />
                      <span className="font-mono text-amber-600">− {inr(tdsMode === "tds" ? totals.tdsAmt : totals.tcsAmt)}</span>
                    </div>
                  )}
                </div>
              </div>
              {/* Adjustment */}
              <div className="flex justify-between items-center px-5 py-2.5">
                <span className="text-muted-foreground">Adjustment</span>
                <Input type="number" className="h-7 w-24 text-right text-sm font-mono"
                  value={adjustment || ""} placeholder="0" onChange={e => setAdjustment(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="flex justify-between px-5 py-2.5">
                <span className="text-muted-foreground">Round Off</span>
                <span className="font-mono">{inr(totals.roundOff)}</span>
              </div>
              <div className="flex justify-between px-5 py-3.5 bg-muted/30">
                <span className="font-bold text-base">Total (₹)</span>
                <span className="font-mono font-bold text-xl text-blue-600" data-testid="inv-grand-total">
                  {inr(totals.grand)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Terms & Conditions ───────────────────────────────────── */}
        <Section title="Terms & Conditions">
          <Textarea rows={3} placeholder="Enter the terms and conditions of your business to be displayed in your transaction"
            value={termsConditions} onChange={e => setTermsConditions(e.target.value)}
            className="text-sm resize-none" />
        </Section>

        {/* ── Attach Files ─────────────────────────────────────────── */}
        <Section title="Attach File(s) to Invoice">
          <label className="flex items-center gap-2 text-sm cursor-pointer border border-dashed border-border rounded-md px-4 py-3 hover:bg-muted/30 transition-colors w-fit">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Upload File</span>
            <input type="file" className="hidden" multiple accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx" />
          </label>
          <p className="text-xs text-muted-foreground mt-2">You can upload a maximum of 10 files, 10 MB each</p>
        </Section>

        {/* ── Payment Bank ─────────────────────────────────────────── */}
        {banks.length > 0 && (
          <Section title="Payment Bank">
            <Select value={bankId} onValueChange={setBankId}>
              <SelectTrigger className="max-w-xs h-9 text-sm" data-testid="inv-bank-select">
                <SelectValue placeholder="No bank / cash" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No bank / cash</SelectItem>
                {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.bank_name} — {b.account_no}</SelectItem>)}
              </SelectContent>
            </Select>
          </Section>
        )}

        {/* ── Bottom save bar ──────────────────────────────────────── */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => nav(-1)}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white px-8" onClick={save} disabled={saving} data-testid="inv-save-button-bottom">
            {saving ? "Saving…" : isEdit ? "Update Invoice" : "Save Invoice"}
          </Button>
        </div>

      </div>

      {/* Click outside to close party dropdown */}
      {showPartyDD && <div className="fixed inset-0 z-40" onClick={() => setShowPartyDD(false)} />}
    </div>
  );
}
