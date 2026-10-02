// The menu, for a restaurant. Not a stock list: a dish has a course, a price,
// a photo, whether it is veg, and whether it is on today. No SKUs, no barcodes,
// no quantities — a kitchen does not count dosas in a warehouse.
//
// This is the same `products` collection underneath, tagged for restaurant mode,
// so counter billing and the guest's phone both read one list.
import { useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr } from "@/lib/format";
import { COURSES } from "@/lib/catalogue";
import {
  Plus, Search, Leaf, Drumstick, ImagePlus, Trash2, Pencil, EyeOff, Eye,
  UtensilsCrossed, Loader2, X, Sparkles,
} from "lucide-react";

const blank = {
  name: "", menu_course: "Main Course", sale_price: 0, gst_rate: 5,
  hsn: "996331", unit: "NOS", category: "Main Course",
  menu_veg: true, menu_description: "", menu_out_of_stock: false, menu_hidden: false,
  image_b64: "", modes: ["restaurant"], stock: 0, purchase_price: 0, low_stock_alert: 0,
  sku: "", upc: "", barcode: "", unit_qty: "",
};

function VegDot({ veg }) {
  if (veg === null || veg === undefined) return null;
  const color = veg ? "border-green-600 text-green-600" : "border-rose-600 text-rose-600";
  return (
    <span className={`inline-grid place-items-center h-4 w-4 border-2 rounded-sm shrink-0 ${color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${veg ? "bg-green-600" : "bg-rose-600"}`} />
    </span>
  );
}

export default function MenuManager({ profile }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [course, setCourse] = useState("All");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/products", { params: { mode: "restaurant" } });
      setList(data?.data ?? data ?? []);
    } catch {
      toast.error("Could not load the menu");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const courses = useMemo(() => {
    const used = Array.from(new Set(list.map((d) => d.menu_course || d.category).filter(Boolean)));
    return ["All", ...used];
  }, [list]);

  const shown = useMemo(
    () =>
      list.filter(
        (d) =>
          (course === "All" || (d.menu_course || d.category) === course) &&
          (!q || d.name?.toLowerCase().includes(q.toLowerCase()))),
    [list, course, q]);

  const openNew = () => {
    setForm({ ...blank, menu_course: course === "All" ? "Main Course" : course,
              category: course === "All" ? "Main Course" : course });
    setEditId(null);
    setOpen(true);
  };

  const openEdit = (d) => {
    setForm({ ...blank, ...d, menu_course: d.menu_course || d.category || "Main Course" });
    setEditId(d.id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Give the dish a name");
    if (!(Number(form.sale_price) > 0)) return toast.error("Set a price for the dish");
    setSaving(true);
    const body = {
      ...form,
      name: form.name.trim(),
      sale_price: Number(form.sale_price),
      gst_rate: Number(form.gst_rate),
      // The course doubles as the category so counter billing groups it the same way.
      category: form.menu_course,
      modes: ["restaurant"],
    };
    try {
      if (editId) await api.put(`/products/${editId}`, body);
      else await api.post("/products", body);
      toast.success(editId ? "Dish updated" : `${body.name} added to the menu`);
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not save that dish");
    } finally {
      setSaving(false);
    }
  };

  // "86" — off the menu for today, without deleting it.
  const toggle86 = async (d) => {
    const next = !d.menu_out_of_stock;
    setList((l) => l.map((x) => (x.id === d.id ? { ...x, menu_out_of_stock: next } : x)));
    try {
      await api.put("/dining/menu", { product_id: d.id, menu_out_of_stock: next });
      toast.success(next ? `${d.name} marked finished for today` : `${d.name} is back on`);
    } catch {
      toast.error("Could not update that");
      load();
    }
  };

  const remove = async (d) => {
    if (!window.confirm(`Remove ${d.name} from the menu? Past bills keep it.`)) return;
    try {
      await api.delete(`/products/${d.id}`);
      toast.success("Removed from the menu");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not remove that dish");
    }
  };

  const pickImage = (file) => {
    if (!file?.type?.startsWith("image/")) return toast.error("Pick an image file");
    if (file.size > 2 * 1024 * 1024) return toast.error("Keep the photo under 2 MB");
    const reader = new FileReader();
    reader.onload = (e) => setForm((f) => ({ ...f, image_b64: e.target.result }));
    reader.readAsDataURL(file);
  };

  const onMenu = list.filter((d) => !d.menu_out_of_stock && !d.menu_hidden).length;
  const off = list.filter((d) => d.menu_out_of_stock).length;

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{profile.title}</h1>
          <p className="text-sm text-muted-foreground">{profile.subtitle}</p>
        </div>
        <Button onClick={openNew} className="gap-1.5">
          <Plus className="h-4 w-4" /> {profile.addLabel}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "On the menu", value: onMenu },
          { label: "Finished today", value: off, warn: off > 0 },
          { label: "Courses", value: Math.max(0, courses.length - 1) },
        ].map((m) => (
          <Card key={m.label} className={`p-4 ${m.warn ? "border-amber-300 bg-amber-50" : ""}`}>
            <div className="text-xs text-muted-foreground">{m.label}</div>
            <div className="text-xl font-bold">{m.value}</div>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={`Search the ${profile.itemWord}es`}
                 value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {courses.map((c) => (
            <button
              key={c}
              onClick={() => setCourse(c)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                course === c ? "bg-slate-900 text-white border-slate-900"
                             : "bg-background text-muted-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground">Loading the menu…</div>
      ) : list.length === 0 ? (
        <Card className="p-10 text-center">
          <UtensilsCrossed className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-semibold">Your menu is empty</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Add your dishes here and they appear instantly on every table's QR page and at
            the counter.
          </p>
          <Button className="mt-4" onClick={openNew}>{profile.addLabel}</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {shown.map((d) => (
            <Card key={d.id} className={`p-3 flex gap-3 ${d.menu_out_of_stock ? "opacity-60" : ""}`}>
              {d.image_b64 ? (
                <img src={d.image_b64} alt="" className="h-20 w-20 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="h-20 w-20 rounded-lg bg-muted grid place-items-center shrink-0">
                  <UtensilsCrossed className="h-6 w-6 text-muted-foreground/40" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-1.5">
                  <VegDot veg={d.menu_veg} />
                  <h3 className="font-semibold text-sm leading-tight truncate">{d.name}</h3>
                </div>
                <p className="text-[11px] text-muted-foreground">{d.menu_course || d.category}</p>
                {d.menu_description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {d.menu_description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="font-bold">{inr(d.sale_price)}</span>
                  <span className="text-[11px] text-muted-foreground">GST {d.gst_rate}%</span>
                  {d.menu_out_of_stock && (
                    <Badge className="bg-amber-500 text-white text-[10px]">Finished today</Badge>
                  )}
                  {d.menu_hidden && (
                    <Badge variant="outline" className="text-[10px]">Hidden</Badge>
                  )}
                </div>
                <div className="flex gap-1 mt-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                          onClick={() => openEdit(d)}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
                          onClick={() => toggle86(d)}>
                    {d.menu_out_of_stock ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {d.menu_out_of_stock ? "Back on" : "86"}
                  </Button>
                  <Button size="sm" variant="ghost"
                          className="h-7 text-xs text-rose-600 hover:text-rose-700"
                          onClick={() => remove(d)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit dish" : "Add a dish"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Dish name</label>
              <Input autoFocus value={form.name} placeholder="Masala Dosa"
                     onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Course</label>
                <Select value={form.menu_course}
                        onValueChange={(v) => setForm((f) => ({ ...f, menu_course: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COURSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Price on the menu
                </label>
                <Input type="number" inputMode="decimal" value={form.sale_price}
                       onChange={(e) => setForm((f) => ({ ...f, sale_price: e.target.value }))} />
                <p className="text-[11px] text-muted-foreground mt-1">
                  GST is inside this price — it is what the guest pays.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Veg or non-veg</label>
                <div className="flex gap-2 mt-1.5">
                  {[["Veg", true], ["Non-veg", false]].map(([label, val]) => (
                    <button
                      key={label}
                      onClick={() => setForm((f) => ({ ...f, menu_veg: val }))}
                      className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold inline-flex items-center justify-center gap-1.5 ${
                        form.menu_veg === val
                          ? val ? "border-green-600 bg-green-50 text-green-700"
                                : "border-rose-600 bg-rose-50 text-rose-700"
                          : "border-slate-200 text-muted-foreground"
                      }`}
                    >
                      {val ? <Leaf className="h-3.5 w-3.5" /> : <Drumstick className="h-3.5 w-3.5" />}
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">GST rate</label>
                <Select value={String(form.gst_rate)}
                        onValueChange={(v) => setForm((f) => ({ ...f, gst_rate: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[0, 5, 12, 18].map((r) => (
                      <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Restaurant supply is normally 5%.
                </p>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Description <span className="font-normal">(optional)</span>
              </label>
              <textarea
                rows={2}
                value={form.menu_description}
                onChange={(e) => setForm((f) => ({ ...f, menu_description: e.target.value }))}
                placeholder="Crisp rice crêpe with spiced potato, served with sambar and chutney"
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Photo <span className="font-normal">(guests order far more with one)</span>
              </label>
              <div className="flex items-center gap-3 mt-1.5">
                {form.image_b64 ? (
                  <div className="relative">
                    <img src={form.image_b64} alt="" className="h-20 w-20 rounded-lg object-cover" />
                    <button
                      onClick={() => setForm((f) => ({ ...f, image_b64: "" }))}
                      className="absolute -top-1.5 -right-1.5 bg-slate-900 text-white rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="h-20 w-20 rounded-lg border-2 border-dashed grid place-items-center text-muted-foreground hover:border-blue-400"
                  >
                    <ImagePlus className="h-5 w-5" />
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                       onChange={(e) => pickImage(e.target.files?.[0])} />
                <p className="text-xs text-muted-foreground">
                  Square photos look best on a phone.
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.menu_out_of_stock}
                onChange={(e) => setForm((f) => ({ ...f, menu_out_of_stock: e.target.checked }))}
              />
              Finished for today — guests can see it but not order it
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="flex-1 gap-1.5" disabled={saving} onClick={save}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editId ? "Save dish" : "Add to menu"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
