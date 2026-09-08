import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { inr, fmtDate, todayISO } from "@/lib/format";
import { TrendingUp, TrendingDown, AlertTriangle, Package, Warehouse, ArrowUpCircle, ArrowDownCircle, SlidersHorizontal, RefreshCw } from "lucide-react";

const TYPE_COLOR = {
  grn:             "bg-emerald-100 text-emerald-700",
  sale:            "bg-rose-100 text-rose-700",
  delivery:        "bg-blue-100 text-blue-700",
  purchase_return: "bg-amber-100 text-amber-700",
  adjustment:      "bg-violet-100 text-violet-700",
};
const TYPE_LABEL = {
  grn:             "📦 GRN",
  sale:            "🛒 Sale",
  delivery:        "🚚 Delivery",
  purchase_return: "↩ Return",
  adjustment:      "⚙ Adjust",
};

export default function Inventory() {
  const [tab, setTab] = useState("summary");
  const [summary, setSummary] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/inventory/summary");
      setSummary(data);
    } catch { toast.error("Failed to load inventory"); }
    setLoading(false);
  };

  const loadMovements = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/inventory/movements");
      setMovements(data);
    } catch { toast.error("Failed to load movements"); }
    setLoading(false);
  };

  useEffect(() => {
    if (tab === "summary") loadSummary();
    else loadMovements();
  }, [tab]);

  const syncHistory = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/inventory/sync-history");
      toast.success(`Synced! ${data.added} movement record(s) backfilled from GRN & Sales history.`);
      loadSummary(); loadMovements();
    } catch { toast.error("Sync failed"); }
    setSyncing(false);
  };

  const filtered = tab === "summary"
    ? summary.filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase()))
    : movements.filter(m => {
        const matchSearch = !search || m.product_name?.toLowerCase().includes(search.toLowerCase()) || m.ref_no?.toLowerCase().includes(search.toLowerCase()) || m.party_name?.toLowerCase().includes(search.toLowerCase());
        const matchType = filterType === "all" || m.movement_type === filterType
          || (filterType === "in" && m.qty > 0) || (filterType === "out" && m.qty < 0);
        return matchSearch && matchType;
      });

  const lowStockCount = summary.filter(p => p.is_low_stock).length;
  const totalIn  = movements.filter(m => m.qty > 0).reduce((s, m) => s + m.qty, 0);
  const totalOut = movements.filter(m => m.qty < 0).reduce((s, m) => s + Math.abs(m.qty), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">Track stock levels, movements in &amp; out — GRN, Sales, Returns, Manual adjustments.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={syncHistory} variant="outline" className="gap-2" disabled={syncing} title="Backfill movement history from existing GRNs and Sales">
            {syncing ? <><RefreshCw className="h-4 w-4 animate-spin" /> Syncing…</> : <><RefreshCw className="h-4 w-4" /> Sync History</>}
          </Button>
          <Button onClick={() => setAdjustOpen(true)} variant="outline" className="gap-2">
            <SlidersHorizontal className="h-4 w-4" /> Manual Adjustment
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <Package className="h-8 w-8 text-blue-500 shrink-0" />
          <div>
            <div className="text-2xl font-bold">{summary.length}</div>
            <div className="text-xs text-muted-foreground">Products</div>
          </div>
        </Card>
        <Card className={`p-4 flex items-center gap-3 ${lowStockCount > 0 ? "border-amber-300 bg-amber-50/50" : ""}`}>
          <AlertTriangle className={`h-8 w-8 shrink-0 ${lowStockCount > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
          <div>
            <div className={`text-2xl font-bold ${lowStockCount > 0 ? "text-amber-600" : ""}`}>{lowStockCount}</div>
            <div className="text-xs text-muted-foreground">Low Stock</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <TrendingUp className="h-8 w-8 text-emerald-500 shrink-0" />
          <div>
            <div className="text-2xl font-bold text-emerald-600">+{totalIn.toLocaleString("en-IN")}</div>
            <div className="text-xs text-muted-foreground">Total In (units)</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <TrendingDown className="h-8 w-8 text-rose-500 shrink-0" />
          <div>
            <div className="text-2xl font-bold text-rose-600">-{totalOut.toLocaleString("en-IN")}</div>
            <div className="text-xs text-muted-foreground">Total Out (units)</div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="summary">📦 Stock Summary</TabsTrigger>
          <TabsTrigger value="movements">📋 Movement Ledger</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search + filter bar */}
      <div className="flex gap-2 flex-wrap">
        <Input className="max-w-xs h-8 text-sm" placeholder={tab === "summary" ? "Search product…" : "Search product, ref, party…"}
          value={search} onChange={e => setSearch(e.target.value)} />
        {tab === "movements" && (
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-8 text-sm w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="in">↑ Stock In</SelectItem>
              <SelectItem value="out">↓ Stock Out</SelectItem>
              <SelectItem value="grn">GRN</SelectItem>
              <SelectItem value="sale">Sale</SelectItem>
              <SelectItem value="delivery">Delivery</SelectItem>
              <SelectItem value="purchase_return">Return</SelectItem>
              <SelectItem value="adjustment">Adjustment</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Summary table */}
      {tab === "summary" && (
        <Card>
          <div className="overflow-x-auto">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Product</th><th>SKU</th><th>Unit</th>
                  <th className="text-right">Total In</th>
                  <th className="text-right">Total Out</th>
                  <th className="text-right">Current Stock</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? [1,2,3,4].map(i => <tr key={i}><td colSpan={7}><Skeleton className="h-8 w-full" /></td></tr>) :
                  filtered.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No products found.</td></tr> :
                  filtered.map(p => (
                    <tr key={p.id} className={p.is_low_stock ? "bg-amber-50/40" : ""}>
                      <td className="font-medium">
                        {p.name}
                        {p.category && <span className="text-xs text-muted-foreground ml-1.5">· {p.category}</span>}
                      </td>
                      <td className="text-muted-foreground font-mono text-xs">{p.sku || "—"}</td>
                      <td className="text-muted-foreground text-xs">{p.unit || "—"}</td>
                      <td className="text-right">
                        <span className="flex items-center justify-end gap-1 text-emerald-700 font-semibold">
                          <ArrowUpCircle className="h-3.5 w-3.5" />{p.total_in}
                        </span>
                      </td>
                      <td className="text-right">
                        <span className="flex items-center justify-end gap-1 text-rose-600 font-semibold">
                          <ArrowDownCircle className="h-3.5 w-3.5" />{p.total_out}
                        </span>
                      </td>
                      <td className="text-right font-bold text-lg">{p.stock ?? 0}</td>
                      <td>
                        {p.is_low_stock
                          ? <span className="flex items-center gap-1 text-xs text-amber-700 font-semibold"><AlertTriangle className="h-3 w-3" /> Low Stock</span>
                          : <span className="text-xs text-emerald-600 font-medium">✓ OK</span>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Movements table */}
      {tab === "movements" && (
        <Card>
          <div className="overflow-x-auto">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Date</th><th>Type</th><th>Product</th><th>Party / Ref</th>
                  <th>Warehouse</th><th className="text-right">Qty In</th><th className="text-right">Qty Out</th>
                </tr>
              </thead>
              <tbody>
                {loading ? [1,2,3,4].map(i => <tr key={i}><td colSpan={7}><Skeleton className="h-8 w-full" /></td></tr>) :
                  filtered.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No stock movements yet.<br /><span className="text-xs">Movements are recorded automatically when you create GRNs and finalize Sale Invoices.</span></td></tr> :
                  filtered.map(m => (
                    <tr key={m.id}>
                      <td className="text-muted-foreground">{fmtDate(m.date)}</td>
                      <td>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${TYPE_COLOR[m.movement_type] || "bg-muted text-muted-foreground"}`}>
                          {TYPE_LABEL[m.movement_type] || m.movement_type}
                        </span>
                      </td>
                      <td>
                        <div className="font-medium text-sm">{m.product_name}</div>
                        {m.product_sku && <div className="text-xs text-muted-foreground">{m.product_sku}</div>}
                      </td>
                      <td>
                        {m.party_name && <div className="text-sm font-medium">{m.party_name}</div>}
                        {m.ref_no && <div className="text-xs text-muted-foreground font-mono">{m.ref_no}</div>}
                      </td>
                      <td>
                        {m.warehouse_name
                          ? <span className="flex items-center gap-1 text-xs"><Warehouse className="h-3 w-3" />{m.warehouse_name}</span>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="text-right">
                        {m.qty > 0
                          ? <span className="text-emerald-700 font-bold">+{m.qty} <span className="text-xs font-normal text-muted-foreground">{m.unit}</span></span>
                          : "—"}
                      </td>
                      <td className="text-right">
                        {m.qty < 0
                          ? <span className="text-rose-600 font-bold">{m.qty} <span className="text-xs font-normal text-muted-foreground">{m.unit}</span></span>
                          : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AdjustDialog open={adjustOpen} onClose={() => setAdjustOpen(null)} products={summary}
        onSaved={() => { loadSummary(); loadMovements(); setAdjustOpen(false); }} />
    </div>
  );
}

function AdjustDialog({ open, onClose, products, onSaved }) {
  const [warehouses, setWarehouses] = useState([]);
  const [form, setForm] = useState({ product_id: "", qty: 0, reason: "", warehouse_id: "", date: todayISO() });

  useEffect(() => {
    if (open) {
      api.get("/warehouses").then(r => setWarehouses(r.data)).catch(() => {});
      setForm({ product_id: "", qty: 0, reason: "", warehouse_id: "", date: todayISO() });
    }
  }, [open]);

  const save = async () => {
    if (!form.product_id || form.qty === 0) { toast.error("Product and quantity required"); return; }
    try {
      await api.post("/inventory/adjust", { ...form, qty: parseFloat(form.qty) });
      toast.success(`Stock ${form.qty > 0 ? "added" : "removed"} successfully`);
      onSaved();
    } catch { toast.error("Failed"); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>⚙ Manual Stock Adjustment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Product *</Label>
            <Select value={form.product_id} onValueChange={v => setForm({ ...form, product_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select product…" /></SelectTrigger>
              <SelectContent>
                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} (stock: {p.stock ?? 0})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Qty change * <span className="text-muted-foreground text-xs">(+add / −remove)</span></Label>
              <Input type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="+10 or -5" />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Warehouse (optional)</Label>
            <Select value={form.warehouse_id} onValueChange={v => setForm({ ...form, warehouse_id: v })}>
              <SelectTrigger><SelectValue placeholder="No specific warehouse" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Global stock —</SelectItem>
                {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Damaged goods, opening stock, count correction…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save Adjustment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
