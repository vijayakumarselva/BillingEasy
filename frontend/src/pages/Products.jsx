import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Search, Trash2, Edit, AlertTriangle } from "lucide-react";
import { inr } from "@/lib/format";
import HsnSuggestButton from "@/components/HsnSuggestButton";

const empty = {
  name: "", sku: "", hsn: "", unit: "NOS", category: "General",
  purchase_price: 0, sale_price: 0, gst_rate: 18, stock: 0, low_stock_alert: 5, barcode: "",
};

export default function Products() {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(""); const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty); const [editId, setEditId] = useState(null);

  const load = async () => {
    setLoading(true);
    const { data } = await api.get("/products", { params: { search } });
    setList(data); setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [search]);

  const startCreate = () => { setForm(empty); setEditId(null); setOpen(true); };
  const startEdit = (p) => { setForm(p); setEditId(p.id); setOpen(true); };
  const save = async () => {
    try {
      if (editId) await api.put(`/products/${editId}`, form);
      else await api.post("/products", form);
      toast.success("Saved"); setOpen(false); load();
    } catch { toast.error("Failed"); }
  };
  const remove = async (id) => { await api.delete(`/products/${id}`); toast.success("Deleted"); load(); };

  return (
    <div className="space-y-6" data-testid="products-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Products & Stock</h1>
          <p className="text-sm text-muted-foreground mt-1">What you sell — with GST rate and current stock. We'll warn you when stock runs low.</p>
        </div>
        <Button onClick={startCreate} className="bg-blue-600 hover:bg-blue-700" data-testid="product-new-button">
          <Plus className="h-4 w-4 mr-1.5" /> Add Product
        </Button>
      </div>

      <div className="flex justify-end">
        <div className="relative w-full sm:w-64">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search products…" value={search}
            onChange={(e) => setSearch(e.target.value)} data-testid="product-search-input" />
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="app-table">
            <thead><tr><th>Name</th><th>HSN</th><th>Category</th><th className="text-right">Purchase</th><th className="text-right">Sale</th><th className="text-right">GST%</th><th className="text-right">Stock</th><th></th></tr></thead>
            <tbody>
              {loading ? [1,2,3].map(i => <tr key={i}><td colSpan={8}><Skeleton className="h-8 w-full" /></td></tr>) :
                list.length === 0 ? <tr><td colSpan={8} className="text-center text-muted-foreground py-8">No products yet.</td></tr> :
                list.map(p => (
                  <tr key={p.id} data-testid={`product-row-${p.name}`}>
                    <td>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground font-mono-fin">{p.sku || "—"}</div>
                    </td>
                    <td className="font-mono-fin text-xs">{p.hsn || "—"}</td>
                    <td><Badge variant="secondary">{p.category}</Badge></td>
                    <td className="num text-muted-foreground">{inr(p.purchase_price)}</td>
                    <td className="num">{inr(p.sale_price)}</td>
                    <td className="num">{p.gst_rate}%</td>
                    <td className="num">
                      <span className={p.stock <= p.low_stock_alert ? "text-rose-600 font-semibold" : ""}>
                        {p.stock} {p.unit}
                      </span>
                      {p.stock <= p.low_stock_alert && <AlertTriangle className="inline h-3 w-3 text-rose-500 ml-1" />}
                    </td>
                    <td className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(p)} data-testid={`product-edit-${p.name}`}><Edit className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" data-testid={`product-delete-${p.name}`}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete {p.name}?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" data-testid="product-form-dialog">
          <DialogHeader><DialogTitle>{editId ? "Edit Product" : "New Product"}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name *" v={form.name} on={(v) => setForm({ ...form, name: v })} tid="product-name-input" />
            <Field label="SKU" v={form.sku} on={(v) => setForm({ ...form, sku: v })} tid="product-sku-input" />
            <div className="space-y-1.5">
              <Label className="flex items-center justify-between">
                HSN Code
                <HsnSuggestButton
                  description={form.name}
                  onPick={(hit) => setForm(f => ({ ...f, hsn: hit.code, gst_rate: hit.gst_rate }))} />
              </Label>
              <Input value={form.hsn || ""} onChange={(e) => setForm({ ...form, hsn: e.target.value })}
                     className="font-mono" data-testid="product-hsn-input" />
            </div>
            <Field label="Category" v={form.category} on={(v) => setForm({ ...form, category: v })} tid="product-category-input" />
            <Field label="Unit" v={form.unit} on={(v) => setForm({ ...form, unit: v })} tid="product-unit-input" />
            <div className="space-y-1.5">
              <Label>GST Rate (%)</Label>
              <Select value={String(form.gst_rate)} onValueChange={(v) => setForm({ ...form, gst_rate: parseFloat(v) })}>
                <SelectTrigger data-testid="product-gst-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[0,5,12,18,28].map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="Purchase Price (₹)" type="number" v={form.purchase_price} on={(v) => setForm({ ...form, purchase_price: parseFloat(v||0) })} tid="product-pp-input" />
            <Field label="Sale Price (₹)" type="number" v={form.sale_price} on={(v) => setForm({ ...form, sale_price: parseFloat(v||0) })} tid="product-sp-input" />
            <Field label="Current Stock" type="number" v={form.stock} on={(v) => setForm({ ...form, stock: parseFloat(v||0) })} tid="product-stock-input" />
            <Field label="Low-Stock Alert" type="number" v={form.low_stock_alert} on={(v) => setForm({ ...form, low_stock_alert: parseFloat(v||0) })} tid="product-low-input" />
            <Field label="Barcode" v={form.barcode} on={(v) => setForm({ ...form, barcode: v })} tid="product-barcode-input" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="bg-blue-600 hover:bg-blue-700" data-testid="product-save-button">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, v, on, type = "text", tid }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={v} onChange={(e) => on(e.target.value)} data-testid={tid} />
    </div>
  );
}
