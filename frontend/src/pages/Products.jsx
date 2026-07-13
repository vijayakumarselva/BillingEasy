import { useCallback, useEffect, useRef, useState } from "react";
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
import { Plus, Search, Trash2, Edit, AlertTriangle, QrCode, Upload, Package, RefreshCw, Barcode, DollarSign, Layers, Camera, Sparkles, Loader2 } from "lucide-react";
import { inr } from "@/lib/format";
import HsnSuggestButton from "@/components/HsnSuggestButton";
import JsBarcode from "jsbarcode";

const ALL_MODES = [
  { value: "b2b", label: "B2B", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  { value: "b2c", label: "B2C", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  { value: "restaurant", label: "Restaurant", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  { value: "pos", label: "POS", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
];

const empty = {
  name: "", sku: "", hsn: "", unit: "NOS", category: "General",
  purchase_price: 0, sale_price: 0, gst_rate: 18, stock: 0, low_stock_alert: 5,
  barcode: "", modes: ["b2b", "b2c", "restaurant", "pos"], image_b64: "",
};

export default function Products() {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(""); const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty); const [editId, setEditId] = useState(null);
  const [barcodeProduct, setBarcodeProduct] = useState(null);
  const [modeFilter, setModeFilter] = useState("all");
  const barcodeDialogRef = useRef(null);

  const load = async () => {
    setLoading(true);
    const params = { search };
    if (modeFilter !== "all") params.mode = modeFilter;
    const { data } = await api.get("/products", { params });
    setList(data); setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [search, modeFilter]);

  const genSku = () => `PRD-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const startCreate = () => { setForm({ ...empty, sku: genSku() }); setEditId(null); setOpen(true); };
  const startEdit = (p) => { setForm({ ...empty, ...p }); setEditId(p.id); setOpen(true); };
  const save = async () => {
    try {
      if (editId) await api.put(`/products/${editId}`, form);
      else await api.post("/products", form);
      toast.success("Saved"); setOpen(false); load();
    } catch (err) {
      const detail = err?.response?.data?.detail || "";
      if (err?.response?.status === 400 && /sku/i.test(detail)) {
        toast.error("SKU already exists — a new one has been generated");
        setForm(f => ({ ...f, sku: genSku() }));
      } else {
        toast.error("Failed");
      }
    }
  };
  const remove = async (id) => { await api.delete(`/products/${id}`); toast.success("Deleted"); load(); };

  const printBarcode = () => {
    const svg = barcodeDialogRef.current;
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const win = window.open("", "_blank");
    win.document.write(`<html><body style="margin:0;display:flex;justify-content:center;align-items:center;height:100vh">${svgData}</body></html>`);
    win.document.close(); win.print();
  };

  const downloadPng = () => {
    const svg = barcodeDialogRef.current;
    if (!svg) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const data = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width; canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const a = document.createElement("a");
      a.download = `barcode-${barcodeProduct?.sku}.png`;
      a.href = canvas.toDataURL(); a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(data);
  };

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

      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex rounded-md border overflow-hidden text-xs">
          {[{ value: "all", label: "All" }, ...ALL_MODES].map(m => (
            <button key={m.value} type="button"
              onClick={() => setModeFilter(m.value)}
              className={`px-3 py-1.5 font-medium transition-colors border-l first:border-l-0 ${modeFilter === m.value ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted/50"}`}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search products…" value={search}
            onChange={(e) => setSearch(e.target.value)} data-testid="product-search-input" />
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="app-table">
            <thead><tr><th>Product</th><th>HSN</th><th>Category</th><th>Used In</th><th className="text-right">Purchase</th><th className="text-right">Sale</th><th className="text-right">GST%</th><th className="text-right">Stock</th><th></th></tr></thead>
            <tbody>
              {loading ? [1,2,3].map(i => <tr key={i}><td colSpan={9}><Skeleton className="h-8 w-full" /></td></tr>) :
                list.length === 0 ? <tr><td colSpan={9} className="text-center text-muted-foreground py-8">No products yet.</td></tr> :
                list.map(p => (
                  <tr key={p.id} data-testid={`product-row-${p.name}`}>
                    <td>
                      <div className="flex items-center gap-2">
                        {p.image_b64
                          ? <img src={p.image_b64} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0 border" />
                          : <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0"><Package className="h-4 w-4 text-muted-foreground" /></div>
                        }
                        <div>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground font-mono-fin">{p.sku || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="font-mono-fin text-xs">{p.hsn || "—"}</td>
                    <td><Badge variant="secondary">{p.category}</Badge></td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        {(p.modes || ["b2b","b2c","restaurant","pos"]).map(m => {
                          const def = ALL_MODES.find(x => x.value === m);
                          return def ? <span key={m} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${def.color}`}>{def.label}</span> : null;
                        })}
                      </div>
                    </td>
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
                      <Button size="icon" variant="ghost" onClick={() => setBarcodeProduct(p)} title="Show Barcode"><QrCode className="h-4 w-4" /></Button>
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

      <BarcodeDialog product={barcodeProduct} svgRef={barcodeDialogRef} onClose={() => setBarcodeProduct(null)} onPrint={printBarcode} onDownload={downloadPng} />

      <ProductFormDialog open={open} onOpenChange={setOpen} form={form} setForm={setForm} editId={editId} onSave={save} genSku={genSku} />
    </div>
  );
}

/* ─── Advanced Product Form Dialog ─── */
function ProductFormDialog({ open, onOpenChange, form, setForm, editId, onSave, genSku }) {
  const inlineBarcodeRef = useRef(null);
  const imageInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [imgDrag, setImgDrag] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Render barcode live as SKU changes
  useEffect(() => {
    if (!open) return;
    const val = form.barcode || form.sku;
    if (inlineBarcodeRef.current && val) {
      try {
        JsBarcode(inlineBarcodeRef.current, val, {
          format: "CODE128", width: 2, height: 50,
          displayValue: true, fontSize: 12, margin: 6,
        });
      } catch {
        // invalid barcode value
      }
    }
  }, [form.barcode, form.sku, open]);

  const handleImageFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Image must be under 2 MB"); return; }
    const reader = new FileReader();
    reader.onload = (e) => setForm(f => ({ ...f, image_b64: e.target.result }));
    reader.readAsDataURL(file);
  }, [setForm]);

  const runAiSuggest = async () => {
    if (!form.name && !form.image_b64) {
      toast.error("Enter a product name or upload an image first");
      return;
    }
    setAiLoading(true);
    try {
      const { data } = await api.post("/ai/product-suggest", {
        name: form.name,
        image_b64: form.image_b64,
      });
      setForm(prev => ({
        ...prev,
        name: data.name || prev.name,
        category: data.category || prev.category,
        hsn: data.hsn || prev.hsn,
        gst_rate: data.gst_rate ?? prev.gst_rate,
        unit: data.unit || prev.unit,
      }));
      toast.success("AI filled in product details");
    } catch {
      toast.error("AI suggest failed — try again");
    } finally {
      setAiLoading(false);
    }
  };

  const f = (key) => (v) => setForm(prev => ({ ...prev, [key]: v }));

  const barcodeVal = form.barcode || form.sku;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="product-form-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl">{editId ? "Edit Product" : "New Product"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── Row 1: Image + Core Info ── */}
          <div className="flex gap-4">
            {/* Image Upload */}
            <div className="flex-shrink-0 flex flex-col items-center gap-1.5">
              <Label className="mb-0.5 block text-xs text-muted-foreground uppercase tracking-wide self-start">Product Image</Label>
              <div
                className={`w-28 h-28 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors relative overflow-hidden
                  ${imgDrag ? "border-blue-400 bg-blue-50 dark:bg-blue-950" : "border-border hover:border-blue-400 hover:bg-muted/30"}`}
                onDragOver={(e) => { e.preventDefault(); setImgDrag(true); }}
                onDragLeave={() => setImgDrag(false)}
                onDrop={(e) => { e.preventDefault(); setImgDrag(false); handleImageFile(e.dataTransfer.files[0]); }}
                onClick={() => imageInputRef.current?.click()}
              >
                {form.image_b64
                  ? <img src={form.image_b64} alt="Product" className="absolute inset-0 w-full h-full object-cover" />
                  : <>
                      <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                      <span className="text-[10px] text-muted-foreground text-center px-1">Drop or click</span>
                    </>
                }
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => handleImageFile(e.target.files[0])} />
                {/* Camera capture — mobile only */}
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => handleImageFile(e.target.files[0])} />
              </div>

              {/* Camera + Remove buttons */}
              <div className="flex gap-1.5 w-full justify-center">
                <button type="button" title="Take Photo"
                  onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-border hover:border-blue-400 hover:text-blue-600 text-muted-foreground transition-colors">
                  <Camera className="h-3 w-3" /> Camera
                </button>
                {form.image_b64 && (
                  <button type="button" className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-rose-200 text-rose-500 hover:bg-rose-50 transition-colors"
                    onClick={() => setForm(f => ({ ...f, image_b64: "" }))}>Remove</button>
                )}
              </div>

              {/* AI Suggest button */}
              <button type="button" onClick={runAiSuggest} disabled={aiLoading}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg
                  bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                {aiLoading
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Filling…</>
                  : <><Sparkles className="h-3.5 w-3.5" /> AI Fill</>
                }
              </button>
              <p className="text-[9px] text-muted-foreground text-center">AI fills name, HSN, GST &amp; unit</p>
            </div>

            {/* Name + SKU + Category */}
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Product Name *</Label>
                <Input value={form.name} onChange={(e) => f("name")(e.target.value)}
                  placeholder="e.g. Basmati Rice 1kg" data-testid="product-name-input" />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center justify-between">
                  SKU
                  <button type="button" title="Auto-generate SKU"
                    onClick={() => setForm(prev => ({ ...prev, sku: genSku() }))}
                    className="text-blue-500 hover:text-blue-700">
                    <RefreshCw className="h-3 w-3" />
                  </button>
                </Label>
                <Input value={form.sku} onChange={(e) => f("sku")(e.target.value)}
                  placeholder="PRD-XXXX" className="font-mono text-sm" data-testid="product-sku-input" />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input value={form.category} onChange={(e) => f("category")(e.target.value)}
                  placeholder="General" data-testid="product-category-input" />
              </div>
            </div>
          </div>

          {/* ── Section: Tax & Pricing ── */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" /> Pricing & Tax
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input value={form.unit} onChange={(e) => f("unit")(e.target.value)}
                  placeholder="NOS" data-testid="product-unit-input" />
              </div>
              <div className="space-y-1.5">
                <Label>GST Rate</Label>
                <Select value={String(form.gst_rate)} onValueChange={(v) => setForm(prev => ({ ...prev, gst_rate: parseFloat(v) }))}>
                  <SelectTrigger data-testid="product-gst-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[0,5,12,18,28].map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Purchase Price (₹)</Label>
                <Input type="number" value={form.purchase_price}
                  onChange={(e) => setForm(prev => ({ ...prev, purchase_price: parseFloat(e.target.value||0) }))}
                  data-testid="product-pp-input" />
              </div>
              <div className="space-y-1.5">
                <Label>Sale Price (₹)</Label>
                <Input type="number" value={form.sale_price}
                  onChange={(e) => setForm(prev => ({ ...prev, sale_price: parseFloat(e.target.value||0) }))}
                  data-testid="product-sp-input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center justify-between">
                  HSN Code
                  <HsnSuggestButton
                    description={form.name}
                    onPick={(hit) => setForm(prev => ({ ...prev, hsn: hit.code, gst_rate: hit.gst_rate }))} />
                </Label>
                <Input value={form.hsn || ""} onChange={(e) => f("hsn")(e.target.value)}
                  className="font-mono" placeholder="e.g. 1006" data-testid="product-hsn-input" />
              </div>
              <div className="bg-muted/40 rounded-md p-2.5 text-xs text-muted-foreground flex flex-col justify-center">
                <div>Margin: <span className="font-semibold text-foreground">{form.sale_price > 0 && form.purchase_price > 0
                  ? `${(((form.sale_price - form.purchase_price) / form.purchase_price) * 100).toFixed(1)}%`
                  : "—"}</span></div>
                <div>Tax on sale: <span className="font-semibold text-foreground">{inr(form.sale_price * (form.gst_rate / 100))}</span></div>
              </div>
            </div>
          </div>

          {/* ── Section: Stock ── */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
              <Layers className="h-4 w-4" /> Stock Management
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Current Stock</Label>
                <Input type="number" value={form.stock}
                  onChange={(e) => setForm(prev => ({ ...prev, stock: parseFloat(e.target.value||0) }))}
                  data-testid="product-stock-input" />
              </div>
              <div className="space-y-1.5">
                <Label>Low-Stock Alert</Label>
                <Input type="number" value={form.low_stock_alert}
                  onChange={(e) => setForm(prev => ({ ...prev, low_stock_alert: parseFloat(e.target.value||0) }))}
                  data-testid="product-low-input" />
              </div>
            </div>
          </div>

          {/* ── Section: Barcode ── */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
              <Barcode className="h-4 w-4" /> Barcode
            </div>
            <div className="grid sm:grid-cols-2 gap-4 items-center">
              <div className="space-y-1.5">
                <Label>Barcode Value</Label>
                <div className="flex gap-2">
                  <Input value={form.barcode} onChange={(e) => f("barcode")(e.target.value)}
                    placeholder={`Leave empty to use SKU (${form.sku})`} className="font-mono text-sm"
                    data-testid="product-barcode-input" />
                </div>
                <p className="text-[10px] text-muted-foreground">Leave empty to auto-use the SKU as barcode</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                {barcodeVal
                  ? <svg ref={inlineBarcodeRef} className="max-w-full" />
                  : <div className="h-16 flex items-center text-xs text-muted-foreground">Enter a SKU to preview</div>
                }
              </div>
            </div>
          </div>

          {/* ── Section: Availability ── */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="text-sm font-medium text-muted-foreground mb-2">Available In</div>
            <div className="flex flex-wrap gap-3">
              {ALL_MODES.map(m => {
                const checked = (form.modes || []).includes(m.value);
                return (
                  <label key={m.value} className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={checked}
                      onChange={() => {
                        const cur = form.modes || [];
                        setForm(prev => ({ ...prev, modes: checked ? cur.filter(x => x !== m.value) : [...cur, m.value] }));
                      }} className="rounded" />
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${m.color}`}>{m.label}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Controls which business mode's product picker shows this item.</p>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} className="bg-blue-600 hover:bg-blue-700" data-testid="product-save-button">
            {editId ? "Update Product" : "Add Product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Barcode View Dialog ─── */
function BarcodeDialog({ product, svgRef, onClose, onPrint, onDownload }) {
  const sku = product?.sku || "";
  useEffect(() => {
    if (product && svgRef.current && sku) {
      try {
        JsBarcode(svgRef.current, sku, { format: "CODE128", width: 2, height: 60, displayValue: true });
      } catch {}
    }
  }, [product, sku]);

  return (
    <Dialog open={!!product} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Product Barcode</DialogTitle></DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          <svg ref={svgRef} />
          <div className="text-center">
            <div className="font-medium">{product?.name}</div>
            <div className="text-xs text-muted-foreground font-mono">{sku}</div>
          </div>
        </div>
        <DialogFooter className="flex gap-2 sm:justify-center">
          <Button variant="outline" onClick={onPrint}>Print</Button>
          <Button onClick={onDownload} className="bg-blue-600 hover:bg-blue-700">Download PNG</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
