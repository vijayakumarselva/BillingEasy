import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Search, Trash2, Edit, ScrollText, Users, MapPin, Sparkles, Loader2, Upload, ImagePlus, X } from "lucide-react";
import { inr, fmtDate } from "@/lib/format";
import GstinField from "@/components/GstinField";
import { useNavigate } from "react-router-dom";

const emptyForm = {
  type: "customer", name: "", phone: "", email: "", gstin: "", pan: "",
  state: "Tamil Nadu", state_code: "33",
  billing_address: "", shipping_address: "", shipping_addresses: [],
  opening_balance: 0, credit_limit: 0,
  tds_opening_balance: 0,
};

export default function Parties() {
  const [tab, setTab] = useState("customer");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const nav = useNavigate();

  const [aiFile, setAiFile] = useState(null); // { name, type, dataUrl }

  const applyParsed = (data) => {
    if (!data || Object.keys(data).length === 0) return false;
    setForm(f => ({
      ...f,
      name: data.name || f.name,
      phone: data.phone || f.phone,
      email: data.email || f.email,
      gstin: data.gstin ? data.gstin.toUpperCase() : f.gstin,
      pan: data.pan ? data.pan.toUpperCase() : f.pan,
      billing_address: data.billing_address || f.billing_address,
      state: data.state || f.state,
      state_code: data.state_code || f.state_code,
    }));
    return true;
  };

  const runAiParse = async (text = aiText, file = aiFile) => {
    if (!text?.trim() && !file) return;
    setAiLoading(true);
    try {
      const { data } = await api.post("/parties/ai-parse", {
        text: text || "",
        file_b64: file?.dataUrl || "",
        media_type: file?.type || "",
      });
      if (!applyParsed(data)) { toast.error("AI couldn't find contact details — try a clearer image or add text."); return; }
      toast.success("✨ AI filled in the details — review and save!");
      setAiText(""); setAiFile(null);
    } catch (e) { toast.error(e?.response?.data?.detail || "AI parse failed"); }
    finally { setAiLoading(false); }
  };

  // Downscale large photos (phone camera shots) so upload + AI are fast
  const toDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      if (!file.type.startsWith("image/") || file.size < 1.5 * 1024 * 1024) return resolve(reader.result);
      const img = new Image();
      img.onerror = () => resolve(reader.result);
      img.onload = () => {
        const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  const handleFile = async (file) => {
    if (!file) return;
    const isImg = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImg && !isPdf) {
      if (file.type.startsWith("text/") || file.name.endsWith(".txt")) {
        const text = await file.text(); setAiText(text); runAiParse(text, null);
      } else toast.error("Use an image (JPG/PNG), PDF, or text file");
      return;
    }
    if (isPdf && file.size > 5 * 1024 * 1024) { toast.error("PDF too large (max 5 MB)"); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error("Image too large (max 20 MB)"); return; }
    const dataUrl = await toDataUrl(file);
    const f = { name: file.name || "pasted-image.png", type: dataUrl.startsWith("data:image/jpeg") ? "image/jpeg" : file.type, dataUrl };
    setAiFile(f);
    runAiParse(aiText, f); // extract immediately
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  // Ctrl/Cmd+V a screenshot straight into the AI box
  const handlePaste = (e) => {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith("image/"));
    if (item) { e.preventDefault(); handleFile(item.getAsFile()); }
  };

  const load = async () => {
    setLoading(true);
    const { data } = await api.get("/parties", { params: { type: tab, search } });
    setList(data); setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab, search]);

  const startCreate = () => { setForm({ ...emptyForm, type: tab }); setEditId(null); setOpen(true); };
  const startEdit = (p) => {
    // migrate legacy single shipping_address to array if needed
    const addrs = Array.isArray(p.shipping_addresses) && p.shipping_addresses.length
      ? p.shipping_addresses
      : p.shipping_address ? [{ label: "Default", address: p.shipping_address }] : [];
    setForm({ ...p, shipping_addresses: addrs });
    setEditId(p.id); setOpen(true);
  };
  const save = async () => {
    try {
      if (editId) await api.put(`/parties/${editId}`, form);
      else await api.post("/parties", form);
      toast.success("Saved");
      setOpen(false); load();
    } catch (e) { toast.error("Failed to save"); }
  };
  const remove = async (id) => {
    await api.delete(`/parties/${id}`);
    toast.success("Deleted"); load();
  };

  return (
    <div className="space-y-0 md:space-y-6" data-testid="parties-page">

      {/* ── Mobile header ── */}
      <div className="mobile-page-header mobile-only">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          <h2>{tab === "customer" ? "Customers" : "Suppliers"}</h2>
        </div>
        <Button size="sm" onClick={startCreate} className="bg-blue-600 hover:bg-blue-700 h-9 px-3" data-testid="party-new-button">
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {/* ── Desktop header ── */}
      <div className="desktop-only flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Customers & Suppliers</h1>
          <p className="text-sm text-muted-foreground mt-1">Save contact details once — used in every invoice and bill.</p>
        </div>
        <Button onClick={startCreate} className="bg-blue-600 hover:bg-blue-700" data-testid="party-new-button-desktop">
          <Plus className="h-4 w-4 mr-1.5" /> Add {tab === "customer" ? "Customer" : "Supplier"}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        {/* Tab switcher + search */}
        <div className="mobile-search md:px-0 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <TabsList className="w-full md:w-auto">
            <TabsTrigger value="customer" className="flex-1 md:flex-none" data-testid="tab-customer">Customers</TabsTrigger>
            <TabsTrigger value="supplier" className="flex-1 md:flex-none" data-testid="tab-supplier">Suppliers</TabsTrigger>
          </TabsList>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-3 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search by name…" value={search}
              onChange={(e) => setSearch(e.target.value)} data-testid="party-search-input" />
          </div>
        </div>

        <TabsContent value={tab} className="mt-3 md:mt-4">
          {/* Mobile cards */}
          <div className="mobile-only mobile-list-gap">
            {loading
              ? [1,2,3].map(i => <div key={i} className="mobile-list-card"><Skeleton className="h-10 w-full" /></div>)
              : list.length === 0
                ? <div className="text-center text-muted-foreground py-12 text-sm">No {tab}s yet. Add one!</div>
                : list.map(p => (
                  <div key={p.id} className="mobile-list-card" onClick={() => nav(`/parties/${p.id}`)}>
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 font-bold text-blue-600 text-base">
                      {(p.name || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.phone || p.email || (p.gstin ? `GST: ${p.gstin}` : "No contact")}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {p.balance > 0
                        ? <p className="text-xs font-semibold text-rose-500">Due {inr(p.balance)}</p>
                        : p.balance < 0
                          ? <p className="text-xs font-semibold text-emerald-600">Advance {inr(Math.abs(p.balance))}</p>
                          : <p className="text-xs text-muted-foreground">Settled</p>
                      }
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); startEdit(p); }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-muted hover:bg-muted/80">
                        <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                ))
            }
          </div>

          {/* Desktop table */}
          <Card className="desktop-only">
            <div className="overflow-x-auto">
              <table className="app-table">
                <thead><tr>
                  <th>Name</th><th>Phone</th><th>GSTIN</th><th>State</th>
                  <th className="text-right">Balance</th><th className="text-right">Credit Limit</th><th></th>
                </tr></thead>
                <tbody>
                  {loading ? [1,2,3,4].map(i => <tr key={i}><td colSpan={7}><Skeleton className="h-8 w-full" /></td></tr>) :
                    list.length === 0 ? <tr><td colSpan={7} className="text-center text-muted-foreground py-8">No parties yet.</td></tr> :
                    list.map(p => (
                      <tr key={p.id} data-testid={`party-row-${p.name}`}>
                        <td><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.email || "—"}</div></td>
                        <td className="text-muted-foreground">{p.phone || "—"}</td>
                        <td className="font-mono-fin text-xs">{p.gstin || <Badge variant="secondary">No GST</Badge>}</td>
                        <td className="text-xs">{p.state}</td>
                        <td className="num">{inr(p.balance)}</td>
                        <td className="num text-muted-foreground">{inr(p.credit_limit)}</td>
                        <td className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => nav(`/parties/${p.id}`)} data-testid={`party-ledger-${p.name}`}><ScrollText className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => startEdit(p)} data-testid={`party-edit-${p.name}`}><Edit className="h-4 w-4" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" data-testid={`party-delete-${p.name}`}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader><AlertDialogTitle>Delete {p.name}?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(p.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" data-testid="party-form-dialog">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit" : "New"} {form.type === "customer" ? "Customer" : "Supplier"}</DialogTitle>
          </DialogHeader>
          {/* ── AI Quick Entry ── */}
          <div
            className={`rounded-xl border-2 border-dashed p-3 mb-1 transition-colors ${dragOver ? "border-blue-400 bg-blue-50 dark:bg-blue-950/20" : "border-purple-200 bg-purple-50/50 dark:bg-purple-950/10 dark:border-purple-800"}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">AI Quick Entry</span>
              <span className="text-xs text-muted-foreground ml-1">Paste text or drop a visiting card / PDF</span>
            </div>
            <div className="flex gap-2">
              <textarea
                className="flex-1 text-sm rounded-lg border border-purple-200 dark:border-purple-700 bg-white dark:bg-background px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-purple-400 min-h-[56px]"
                placeholder={'e.g. "Jamkhandi Sugars Ltd, GSTIN: 29AABCJ1234D1Z5, Ph: 9876543210, Bengaluru" — or drop a visiting card here'}
                value={aiText}
                onChange={e => setAiText(e.target.value)}
                onPaste={handlePaste}
                onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runAiParse(); }}
              />
              <div className="flex flex-col gap-1.5">
                <Button size="sm" disabled={aiLoading || (!aiText.trim() && !aiFile)}
                  onClick={() => runAiParse()}
                  className="bg-purple-600 hover:bg-purple-700 text-white h-8 px-3 text-xs">
                  {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Sparkles className="h-3.5 w-3.5 mr-1" />Parse</>}
                </Button>
                <label className="cursor-pointer" title="Upload or take a photo of a visiting card">
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { handleFile(e.target.files[0]); e.target.value = ""; }} />
                  <span className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-50 border border-purple-200 dark:border-purple-700 rounded px-2 h-8 bg-white dark:bg-background">
                    <ImagePlus className="h-3.5 w-3.5" /> Image
                  </span>
                </label>
                <label className="cursor-pointer" title="Upload a PDF or text file">
                  <input type="file" accept="application/pdf,.txt" className="hidden" onChange={e => { handleFile(e.target.files[0]); e.target.value = ""; }} />
                  <span className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-50 border border-purple-200 dark:border-purple-700 rounded px-2 h-8 bg-white dark:bg-background">
                    <Upload className="h-3 w-3" /> PDF
                  </span>
                </label>
              </div>
            </div>
            {aiFile && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-purple-200 dark:border-purple-700 bg-white dark:bg-background p-1.5">
                {aiFile.type.startsWith("image/")
                  ? <img src={aiFile.dataUrl} alt="" className="h-12 w-20 object-cover rounded" />
                  : <div className="h-12 w-12 rounded bg-rose-50 text-rose-600 text-[10px] font-bold flex items-center justify-center">PDF</div>}
                <span className="text-xs truncate flex-1">{aiFile.name}</span>
                {aiLoading
                  ? <span className="flex items-center gap-1 text-xs text-purple-600 pr-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading…</span>
                  : <button type="button" className="p-1 text-muted-foreground hover:text-rose-600" onClick={() => setAiFile(null)}><X className="h-3.5 w-3.5" /></button>}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-1.5">Ctrl+Enter to parse · Drop, paste (Ctrl+V) or snap a visiting card / GST certificate image</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name *" v={form.name} on={(v) => setForm({ ...form, name: v })} tid="party-name-input" />
            <Field label="Phone" v={form.phone} on={(v) => setForm({ ...form, phone: v })} tid="party-phone-input" />
            <Field label="Email" v={form.email} on={(v) => setForm({ ...form, email: v })} tid="party-email-input" />
            <div className="space-y-1.5">
              <Label>GSTIN</Label>
              <GstinField value={form.gstin}
                          onChange={(v) => setForm({ ...form, gstin: v.toUpperCase() })}
                          onValid={(info) => {
                            setForm(f => {
                              const updates = {};
                              if (info?.state_code) {
                                const st = STATES.find(s => s.code === info.state_code);
                                if (st) { updates.state = st.name; updates.state_code = st.code; }
                              }
                              return { ...f, ...updates };
                            });
                          }}
                          onLookup={(info) => {
                            if (!info || info.error) return;
                            setForm(f => {
                              const updates = {};
                              // Fill name if empty
                              const fetchedName = info.trade_name || info.legal_name || "";
                              if (fetchedName && !f.name) updates.name = fetchedName;
                              // Fill address if empty
                              if (info.address && !f.billing_address) updates.billing_address = info.address;
                              // Always update state from GSTIN
                              if (info.state_code) {
                                const st = STATES.find(s => s.code === info.state_code);
                                if (st) { updates.state = st.name; updates.state_code = st.code; }
                              }
                              return { ...f, ...updates };
                            });
                          }} />
            </div>
            <Field label="PAN" v={form.pan} on={(v) => setForm({ ...form, pan: v.toUpperCase() })} tid="party-pan-input" />
            <div className="space-y-1.5">
              <Label>State</Label>
              <Select value={form.state_code} onValueChange={(v) => {
                const st = STATES.find(s => s.code === v);
                setForm({ ...form, state: st.name, state_code: v });
              }}>
                <SelectTrigger data-testid="party-state-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATES.map(s => <SelectItem key={s.code} value={s.code}>{s.name} ({s.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="Opening Balance (₹)" type="number" v={form.opening_balance} on={(v) => setForm({ ...form, opening_balance: parseFloat(v||0) })} tid="party-opening-input" />
            <Field label="Credit Limit (₹)" type="number" v={form.credit_limit} on={(v) => setForm({ ...form, credit_limit: parseFloat(v||0) })} tid="party-credit-input" />
            {/* TDS 194Q migration field — for both supplier and customer */}
            <div className="sm:col-span-2 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3">
              <Label className="text-amber-800 dark:text-amber-300 font-semibold">
                TDS Opening Balance — Sec 194Q (Migration) ₹
              </Label>
              <Input
                type="number" min="0" step="1000"
                value={form.tds_opening_balance || 0}
                onChange={(e) => setForm({ ...form, tds_opening_balance: parseFloat(e.target.value||0) })}
                className="max-w-[200px]"
              />
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                {form.type === "supplier"
                  ? "Total purchases already made to this vendor in the current FY before migrating to this system. Added to purchases recorded here when checking the ₹50 Lakh TDS threshold."
                  : "Total sales already made to this customer in the current FY before migrating to this system. Added to invoices recorded here when checking the ₹50 Lakh TDS threshold."}
              </p>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Billing Address</Label>
              <Input value={form.billing_address} onChange={(e) => setForm({ ...form, billing_address: e.target.value })} data-testid="party-billing-input" />
            </div>
            {/* Multiple Shipping Addresses */}
            <div className="sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Shipping Addresses</Label>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={() => setForm(f => ({ ...f, shipping_addresses: [...(f.shipping_addresses || []), { label: "", address: "" }] }))}>
                  <Plus className="h-3 w-3" /> Add Address
                </Button>
              </div>
              {(form.shipping_addresses || []).length === 0 && (
                <p className="text-xs text-muted-foreground">No shipping addresses yet. Click "Add Address" to add one.</p>
              )}
              {(form.shipping_addresses || []).map((sa, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-2 bg-muted/20">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Label (e.g. Warehouse, Site 1)"
                      className="h-8 text-sm w-44 shrink-0"
                      value={sa.label}
                      onChange={e => setForm(f => {
                        const a = [...f.shipping_addresses];
                        a[i] = { ...a[i], label: e.target.value };
                        return { ...f, shipping_addresses: a };
                      })}
                    />
                    <button type="button" className="ml-auto text-rose-400 hover:text-rose-600 p-1"
                      onClick={() => setForm(f => ({ ...f, shipping_addresses: f.shipping_addresses.filter((_, idx) => idx !== i) }))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Input
                    placeholder="Full shipping address"
                    className="text-sm"
                    value={sa.address}
                    onChange={e => setForm(f => {
                      const a = [...f.shipping_addresses];
                      a[i] = { ...a[i], address: e.target.value };
                      return { ...f, shipping_addresses: a };
                    })}
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="party-cancel-button">Cancel</Button>
            <Button onClick={save} className="bg-blue-600 hover:bg-blue-700" data-testid="party-save-button">Save</Button>
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

export const STATES = [
  { code: "27", name: "Maharashtra" }, { code: "29", name: "Karnataka" },
  { code: "33", name: "Tamil Nadu" }, { code: "36", name: "Telangana" },
  { code: "07", name: "Delhi" }, { code: "06", name: "Haryana" },
  { code: "09", name: "Uttar Pradesh" }, { code: "19", name: "West Bengal" },
  { code: "24", name: "Gujarat" }, { code: "32", name: "Kerala" },
  { code: "08", name: "Rajasthan" }, { code: "23", name: "Madhya Pradesh" },
  { code: "21", name: "Odisha" }, { code: "03", name: "Punjab" },
  { code: "37", name: "Andhra Pradesh" },
];
