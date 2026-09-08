import { useEffect, useState, useMemo } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Truck, Warehouse } from "lucide-react";
import { inr, todayISO } from "@/lib/format";

function blankItem() {
  return { product_id: "", name: "", hsn: "", qty: 1, unit: "NOS", rate: 0, gst_rate: 18 };
}

const ORDER_TYPES = ["Sales", "Sales Return", "Job Work", "Transfer"];
const TERMS_OPTS  = ["Due on Receipt", "Net 15", "Net 30", "Net 45", "Net 60"];

export default function DeliveryOrders() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  // Form
  const [warehouseId, setWarehouseId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [doDate, setDoDate] = useState(todayISO());
  const [shipDate, setShipDate] = useState(todayISO());
  const [refNo, setRefNo] = useState("");
  const [orderType, setOrderType] = useState("Sales");
  const [payTerms, setPayTerms] = useState("Due on Receipt");
  const [broker, setBroker] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([blankItem()]);
  const [saving, setSaving] = useState(false);
  const [whStock, setWhStock] = useState({});  // product_id → qty in selected warehouse

  const load = async () => {
    setLoading(true);
    const { data } = await api.get("/delivery-orders");
    setList(data);
    setLoading(false);
  };

  const loadMeta = async () => {
    const [wh, cust, prod] = await Promise.all([
      api.get("/warehouses"),
      api.get("/parties", { params: { type: "customer" } }),
      api.get("/products"),
    ]);
    setWarehouses(wh.data.filter(w => w.active !== false));
    setCustomers(cust.data);
    setProducts(prod.data);
  };

  useEffect(() => { load(); loadMeta(); }, []);

  // Load per-warehouse stock when warehouse changes
  useEffect(() => {
    if (!warehouseId) { setWhStock({}); return; }
    api.get(`/warehouses/${warehouseId}/stock`)
      .then(r => {
        const m = {};
        r.data.forEach(s => { m[s.product_id] = s.qty; });
        setWhStock(m);
      })
      .catch(() => setWhStock({}));
  }, [warehouseId]);

  const setItem = (i, patch) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  const totals = useMemo(() => {
    return items.reduce((acc, it) => {
      const taxable = it.qty * it.rate;
      const gst = taxable * (it.gst_rate / 100);
      return { taxable: acc.taxable + taxable, gst: acc.gst + gst, total: acc.total + taxable + gst };
    }, { taxable: 0, gst: 0, total: 0 });
  }, [items]);

  const save = async () => {
    if (!warehouseId)  { toast.error("Select a warehouse"); return; }
    if (!customerId)   { toast.error("Select a customer"); return; }
    if (!items.length || items.some(it => !it.product_id)) { toast.error("Select product for all rows"); return; }
    setSaving(true);
    try {
      await api.post("/delivery-orders", {
        warehouse_id: warehouseId, customer_id: customerId,
        do_date: doDate, shipment_date: shipDate,
        ref_no: refNo, order_type: orderType,
        payment_terms: payTerms, broker, notes, items,
      });
      toast.success("Delivery Order created — stock dispatched");
      setOpen(false);
      setItems([blankItem()]); setRefNo(""); setNotes(""); setBroker("");
      setWarehouseId(""); setCustomerId(""); setDoDate(todayISO()); setShipDate(todayISO());
      load();
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Failed — check stock availability");
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this Delivery Order? Stock will be restored.")) return;
    await api.delete(`/delivery-orders/${id}`);
    toast.success("Deleted — stock restored");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-emerald-600" />
            <h1 className="text-2xl font-semibold">Delivery Orders</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Dispatch goods from warehouse to customer.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-1.5" /> New Delivery Order
        </Button>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <table className="app-table">
          <thead><tr>
            <th>DO #</th><th>Date</th><th>Customer</th><th>Warehouse</th>
            <th>Type</th><th>Ref #</th><th className="text-right">Value</th><th></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="text-center text-muted-foreground py-8">Loading…</td></tr>}
            {!loading && list.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-12">
                No delivery orders yet.
              </td></tr>
            )}
            {list.map(d => (
              <tr key={d.id}>
                <td className="font-mono text-sm font-semibold text-emerald-600">{d.do_no}</td>
                <td>{d.do_date}</td>
                <td>{d.customer_name}</td>
                <td><span className="flex items-center gap-1"><Warehouse className="h-3.5 w-3.5 text-muted-foreground" />{d.warehouse_name}</span></td>
                <td>{d.order_type}</td>
                <td className="text-muted-foreground">{d.ref_no || "—"}</td>
                <td className="text-right font-mono">
                  {inr(d.items?.reduce((s, it) => s + it.qty * it.rate * (1 + it.gst_rate / 100), 0) || 0)}
                </td>
                <td className="text-right">
                  <button onClick={() => remove(d.id)} className="text-rose-400 hover:text-rose-600 p-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-emerald-600" /> New Delivery Order
              <span className="text-sm font-normal text-muted-foreground ml-2">Create a new delivery order for inventory</span>
            </DialogTitle>
          </DialogHeader>

          {/* Header grid — like the screenshot */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border rounded-md p-3">
            <div className="space-y-1.5">
              <Label>Warehouse *</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Type to search" /></SelectTrigger>
                <SelectContent>
                  {warehouses.length === 0
                    ? <SelectItem value="_none" disabled>No warehouses — add in Settings</SelectItem>
                    : warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Counter Sales" /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference #</Label>
              <Input className="h-8 text-sm" placeholder="Reference #" value={refNo} onChange={e => setRefNo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Order Date *</Label>
              <Input type="date" className="h-8 text-sm" value={doDate} onChange={e => setDoDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Shipment Date *</Label>
              <Input type="date" className="h-8 text-sm" value={shipDate} onChange={e => setShipDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Order Type</Label>
              <Select value={orderType} onValueChange={setOrderType}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORDER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Terms</Label>
              <Select value={payTerms} onValueChange={setPayTerms}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TERMS_OPTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Broker</Label>
              <Input className="h-8 text-sm" placeholder="Select..." value={broker} onChange={e => setBroker(e.target.value)} />
            </div>
          </div>

          {/* Items table */}
          <div className="mt-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Items</h3>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs w-8">SN#</th>
                    <th className="px-3 py-2 text-left text-xs">Item Name</th>
                    <th className="px-2 py-2 text-right text-xs w-24">Qty</th>
                    <th className="px-2 py-2 text-right text-xs w-28">Offer Price</th>
                    <th className="px-2 py-2 text-left text-xs w-28">HSN Code</th>
                    <th className="px-2 py-2 text-left text-xs w-20">UOM</th>
                    <th className="px-2 py-2 text-left text-xs w-20">GST %</th>
                    <th className="px-2 py-2 text-right text-xs w-28">Total Amount</th>
                    <th className="px-1 py-2 text-xs w-16">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const amt = it.qty * it.rate * (1 + it.gst_rate / 100);
                    const available = it.product_id ? (whStock[it.product_id] ?? null) : null;
                    const insufficient = available !== null && it.qty > available;
                    return (
                      <tr key={i} className={`border-t ${insufficient ? "bg-rose-50 dark:bg-rose-950/20" : ""}`}>
                        <td className="px-2 py-2 text-muted-foreground text-center">{i + 1}</td>
                        <td className="px-3 py-2 min-w-[200px]">
                          <Select value={it.product_id} onValueChange={v => {
                            const p = products.find(x => x.id === v);
                            if (p) setItem(i, { product_id: p.id, name: p.name, hsn: p.hsn || "", unit: p.unit || "NOS", rate: p.sale_price || 0, gst_rate: p.gst_rate ?? 18 });
                          }}>
                            <SelectTrigger className="h-8 text-sm border-dashed">
                              <SelectValue placeholder="No available items found" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map(p => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                  {warehouseId && <span className="ml-2 text-muted-foreground text-xs">({whStock[p.id] ?? 0} in WH)</span>}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {insufficient && (
                            <p className="text-xs text-rose-600 mt-0.5">⚠ Only {available} available in this warehouse</p>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <Input className="h-8 text-sm text-right" type="number" min="0"
                            value={it.qty} onChange={e => setItem(i, { qty: parseFloat(e.target.value) || 0 })} />
                        </td>
                        <td className="px-2 py-2">
                          <Input className="h-8 text-sm text-right" type="number" min="0"
                            value={it.rate} onChange={e => setItem(i, { rate: parseFloat(e.target.value) || 0 })} />
                        </td>
                        <td className="px-2 py-2 text-muted-foreground text-sm">{it.hsn || "—"}</td>
                        <td className="px-2 py-2 text-muted-foreground text-sm">{it.unit}</td>
                        <td className="px-2 py-2">
                          <Select value={String(it.gst_rate)} onValueChange={v => setItem(i, { gst_rate: parseFloat(v) })}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {[0, 5, 12, 18, 28].map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-sm">{inr(amt)}</td>
                        <td className="px-2 py-2 text-center">
                          <button onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))}
                            className="text-rose-400 hover:text-rose-600 p-1">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setItems(prev => [...prev.slice(0, i + 1), blankItem(), ...prev.slice(i + 1)])}
                            className="text-emerald-500 hover:text-emerald-700 p-1">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-3 py-2 border-t">
                <Button variant="ghost" size="sm" onClick={() => setItems(prev => [...prev, blankItem()])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
                </Button>
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end mt-2">
            <div className="text-sm space-y-1 min-w-[220px]">
              <div className="flex justify-between text-muted-foreground">
                <span>Taxable Value</span><span className="font-mono">{inr(totals.taxable)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Total GST</span><span className="font-mono">{inr(totals.gst)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-1">
                <span>Grand Total</span><span className="font-mono">{inr(totals.total)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Saving…" : "Create Delivery Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
