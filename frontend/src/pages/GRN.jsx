import { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, PackageCheck, Warehouse, ArrowLeft } from "lucide-react";
import { inr, todayISO } from "@/lib/format";

function blankItem() {
  return { product_id: "", name: "", hsn: "", qty: 1, unit: "NOS", rate: 0, gst_rate: 18 };
}

export default function GRN() {
  const nav = useNavigate();
  const location = useLocation();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);   // every profile — used to match names
  const [creating, setCreating] = useState(false);

  // Form
  const [warehouseId, setWarehouseId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [grnDate, setGrnDate] = useState(todayISO());
  const [refNo, setRefNo] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([blankItem()]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await api.get("/grns");
    setList(data);
    setLoading(false);
  };

  const loadMeta = async () => {
    const [wh, sup, prod, all] = await Promise.all([
      api.get("/warehouses"),
      api.get("/parties", { params: { type: "supplier" } }),
      api.get("/products"),
      api.get("/products", { params: { mode: "all" } }).catch(() => ({ data: [] })),
    ]);
    setWarehouses(wh.data.filter(w => w.active !== false));
    setSuppliers(sup.data);
    setProducts(prod.data);
    setAllProducts(all.data?.length ? all.data : prod.data);
    return all.data?.length ? all.data : prod.data;
  };

  useEffect(() => { load(); loadMeta(); }, []);

  const norm = (v) => (v || "").toString().trim().toLowerCase();

  // Auto-open with data from purchase bill (navigate from Purchases page)
  useEffect(() => {
    const po = location.state?.fromPurchase;
    if (!po) return;
    // Wait for meta to load, then prefill
    const tryPrefill = (catalogue = allProducts) => {
      const findMatch = (it) => {
        if (it.product_id) return it.product_id;
        const byName = catalogue.find(p => norm(p.name) === norm(it.name));
        if (byName) return byName.id;
        const bySku = it.sku ? catalogue.find(p => norm(p.sku) === norm(it.sku)) : null;
        return bySku ? bySku.id : "";
      };
      setVendorId(po.party_id || "");
      setGrnDate(po.purchase_date || todayISO());
      setRefNo(po.bill_no || "");
      setNotes(`From Purchase Bill: ${po.bill_no || ""}`);
      if (po.warehouse_id) setWarehouseId(po.warehouse_id);
      if (po.items?.length) {
        setItems(po.items.map(it => ({
          product_id: findMatch(it),
          name: it.name || "",
          hsn: it.hsn || "",
          qty: it.qty || 1,
          unit: it.unit || "NOS",
          rate: it.rate || 0,
          gst_rate: it.gst_rate ?? 18,
        })));
      }
      setOpen(true);
    };
    // Small delay to let loadMeta finish
    loadMeta().then(cat => tryPrefill(cat)).catch(() => setTimeout(tryPrefill, 400));
    // Clear state so refresh doesn't re-open
    window.history.replaceState({}, "");
  }, [location.state]);

  const setItem = (i, patch) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  const mode = () => {
    const orgId = localStorage.getItem("be_org_id") || "";
    return localStorage.getItem(`biz_mode_${orgId}`) || "b2b";
  };

  const createProductFor = async (i) => {
    const it = items[i];
    if (!it?.name?.trim()) { toast.error("This row has no item name — pick a product instead"); return null; }
    try {
      const { data } = await api.post("/products", {
        name: it.name.trim(), hsn: it.hsn || "", unit: it.unit || "NOS",
        purchase_price: it.rate || 0, sale_price: 0, gst_rate: it.gst_rate ?? 5,
        stock: 0, low_stock_alert: 5, category: "General", modes: [mode()],
      });
      setProducts(ps => [...ps, data]);
      setAllProducts(ps => [...ps, data]);
      setItem(i, { product_id: data.id });
      return data;
    } catch (e) {
      toast.error(e?.response?.data?.detail || `Could not create “${it.name}”`);
      return null;
    }
  };

  const missingCount = items.filter(it => !it.product_id && it.name?.trim()).length;

  const createAllMissing = async () => {
    setCreating(true);
    let made = 0;
    for (let i = 0; i < items.length; i++) {
      if (!items[i].product_id && items[i].name?.trim()) {
        // eslint-disable-next-line no-await-in-loop
        if (await createProductFor(i)) made += 1;
      }
    }
    setCreating(false);
    if (made) toast.success(`${made} product${made > 1 ? "s" : ""} added to your catalogue`);
  };

  const totals = useMemo(() => {
    return items.reduce((acc, it) => {
      const taxable = it.qty * it.rate;
      const gst = taxable * (it.gst_rate / 100);
      return { taxable: acc.taxable + taxable, gst: acc.gst + gst, total: acc.total + taxable + gst };
    }, { taxable: 0, gst: 0, total: 0 });
  }, [items]);

  const save = async () => {
    if (!warehouseId) { toast.error("Select a warehouse"); return; }
    if (!vendorId)    { toast.error("Select a vendor"); return; }
    if (!items.length || items.some(it => !it.product_id)) { toast.error("Select product for all rows"); return; }
    setSaving(true);
    try {
      await api.post("/grns", {
        warehouse_id: warehouseId, vendor_id: vendorId,
        grn_date: grnDate, ref_no: refNo, notes, items,
      });
      toast.success("GRN created — stock updated");
      setOpen(false);
      setItems([blankItem()]); setRefNo(""); setNotes("");
      setWarehouseId(""); setVendorId(""); setGrnDate(todayISO());
      load();
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Failed to save GRN");
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this GRN? Stock will be reversed.")) return;
    await api.delete(`/grns/${id}`);
    toast.success("GRN deleted — stock reversed");
    load();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-blue-600" />
            <h1 className="text-2xl font-semibold">Goods Receipt Notes (GRN)</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Record stock received from vendors into a warehouse.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-1.5" /> New GRN
        </Button>
      </div>

      {/* List */}
      <div className="rounded-md border bg-card overflow-x-auto">
        <table className="app-table">
          <thead><tr>
            <th>GRN #</th><th>Date</th><th>Vendor</th><th>Warehouse</th>
            <th>Ref #</th><th className="text-right">Value</th><th></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="text-center text-muted-foreground py-8">Loading…</td></tr>}
            {!loading && list.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted-foreground py-12">
                No GRNs yet. Create one when goods arrive from a vendor.
              </td></tr>
            )}
            {list.map(g => (
              <tr key={g.id}>
                <td className="font-mono text-sm font-semibold text-blue-600">{g.grn_no}</td>
                <td>{g.grn_date}</td>
                <td>{g.vendor_name}</td>
                <td><span className="flex items-center gap-1"><Warehouse className="h-3.5 w-3.5 text-muted-foreground" />{g.warehouse_name}</span></td>
                <td className="text-muted-foreground">{g.ref_no || "—"}</td>
                <td className="text-right font-mono">
                  {inr(g.items?.reduce((s, it) => s + it.qty * it.rate * (1 + it.gst_rate / 100), 0) || 0)}
                </td>
                <td className="text-right">
                  <button onClick={() => remove(g.id)} className="text-rose-400 hover:text-rose-600 p-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="h-4 w-4" /> New Goods Receipt Note
            </DialogTitle>
          </DialogHeader>

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Warehouse *</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  {warehouses.length === 0
                    ? <SelectItem value="_none" disabled>No warehouses — add in Settings</SelectItem>
                    : warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vendor *</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>GRN Date *</Label>
              <Input type="date" value={grnDate} onChange={e => setGrnDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Vendor DC / Challan Ref #</Label>
              <Input placeholder="e.g. DC-2024-001" value={refNo} onChange={e => setRefNo(e.target.value)} />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Input placeholder="Optional notes" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          {/* Items table */}
          <div className="mt-4 overflow-x-auto rounded-md border">
            {missingCount > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                <span>
                  {missingCount} item{missingCount > 1 ? "s aren't" : " isn't"} in your product list yet — stock can only be
                  updated for items that exist there.
                </span>
                <Button type="button" size="sm" className="h-7 text-xs ml-auto bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={creating} onClick={createAllMissing}>
                  {creating ? "Adding…" : `Add ${missingCount} to catalogue`}
                </Button>
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-2 py-2 text-right w-20">Qty</th>
                  <th className="px-2 py-2 text-right w-24">Rate ₹</th>
                  <th className="px-2 py-2 text-left w-28">GST %</th>
                  <th className="px-2 py-2 text-right w-28">Amount</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const amt = it.qty * it.rate * (1 + it.gst_rate / 100);
                  // A bill raised under another business profile carries products that
                  // aren't in this profile's catalogue — keep showing their name.
                  const inList = products.some(p => p.id === it.product_id);
                  const rowOptions = (!inList && it.product_id)
                    ? [{ id: it.product_id, name: it.name || "Item from the bill", _external: true }, ...products]
                    : products;
                  return (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">
                        <Select value={it.product_id} onValueChange={v => {
                          const p = products.find(x => x.id === v);
                          if (p) setItem(i, { product_id: p.id, name: p.name, hsn: p.hsn || "", unit: p.unit || "NOS", rate: p.purchase_price || 0, gst_rate: p.gst_rate ?? 18 });
                        }}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select product" /></SelectTrigger>
                          <SelectContent>
                            {!it.product_id && it.name?.trim() && (
                              <button type="button"
                                className="w-full text-left px-2 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 border-b"
                                onMouseDown={e => { e.preventDefault(); createProductFor(i); }}>
                                + Create “{it.name}”
                              </button>
                            )}
                            {rowOptions.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}{p._external ? " (from the bill)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="text-xs ml-1 mt-0.5 flex flex-wrap gap-x-2 items-center">
                          {it.name && <span className="font-medium text-foreground/70">{it.name}</span>}
                          {it.hsn && <span className="text-muted-foreground">HSN {it.hsn}</span>}
                          {!it.product_id && it.name?.trim() && (
                            <button type="button" className="text-blue-600 hover:underline font-medium"
                              onClick={() => createProductFor(i)}>+ create this product</button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <Input className="h-8 text-sm text-right" type="number" min="0"
                          value={it.qty} onChange={e => setItem(i, { qty: parseFloat(e.target.value) || 0 })} />
                      </td>
                      <td className="px-2 py-2">
                        <Input className="h-8 text-sm text-right" type="number" min="0"
                          value={it.rate} onChange={e => setItem(i, { rate: parseFloat(e.target.value) || 0 })} />
                      </td>
                      <td className="px-2 py-2">
                        <Select value={String(it.gst_rate)} onValueChange={v => setItem(i, { gst_rate: parseFloat(v) })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[0, 5, 12, 18, 28].map(r => <SelectItem key={r} value={String(r)}>GST {r}%</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-sm">{inr(amt)}</td>
                      <td className="px-1 py-2">
                        <button onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-rose-400 hover:text-rose-600 p-1">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-3 py-2">
              <Button variant="ghost" size="sm" onClick={() => setItems(prev => [...prev, blankItem()])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
              </Button>
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
            <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? "Saving…" : "Create GRN & Update Stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
