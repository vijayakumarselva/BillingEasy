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
import { Plus, Search, Trash2, Edit, ScrollText } from "lucide-react";
import { inr, fmtDate } from "@/lib/format";
import GstinField from "@/components/GstinField";
import { useNavigate } from "react-router-dom";

const emptyForm = {
  type: "customer", name: "", phone: "", email: "", gstin: "", pan: "",
  state: "Tamil Nadu", state_code: "33",
  billing_address: "", shipping_address: "", opening_balance: 0, credit_limit: 0,
};

export default function Parties() {
  const [tab, setTab] = useState("customer");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    const { data } = await api.get("/parties", { params: { type: tab, search } });
    setList(data); setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab, search]);

  const startCreate = () => { setForm({ ...emptyForm, type: tab }); setEditId(null); setOpen(true); };
  const startEdit = (p) => { setForm(p); setEditId(p.id); setOpen(true); };
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
    <div className="space-y-6" data-testid="parties-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Customers & Suppliers</h1>
          <p className="text-sm text-muted-foreground mt-1">Save contact details once — used in every invoice and bill. Track outstanding money per party.</p>
        </div>
        <Button onClick={startCreate} className="bg-blue-600 hover:bg-blue-700" data-testid="party-new-button">
          <Plus className="h-4 w-4 mr-1.5" /> Add {tab === "customer" ? "Customer" : "Supplier"}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList>
            <TabsTrigger value="customer" data-testid="tab-customer">Customers</TabsTrigger>
            <TabsTrigger value="supplier" data-testid="tab-supplier">Suppliers</TabsTrigger>
          </TabsList>
          <div className="relative w-full sm:w-64">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search by name…" value={search}
              onChange={(e) => setSearch(e.target.value)} data-testid="party-search-input" />
          </div>
        </div>

        <TabsContent value={tab} className="mt-4">
          <Card>
            <div className="overflow-x-auto">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>Name</th><th>Phone</th><th>GSTIN</th><th>State</th>
                    <th className="text-right">Balance</th><th className="text-right">Credit Limit</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? [1,2,3,4].map(i => <tr key={i}><td colSpan={7}><Skeleton className="h-8 w-full" /></td></tr>) :
                    list.length === 0 ? <tr><td colSpan={7} className="text-center text-muted-foreground py-8">No parties yet.</td></tr> :
                    list.map(p => (
                      <tr key={p.id} data-testid={`party-row-${p.name}`}>
                        <td>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.email || "—"}</div>
                        </td>
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
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {p.name}?</AlertDialogTitle>
                                <AlertDialogDescription>This cannot be undone. Historical transactions will remain.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove(p.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
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
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Billing Address</Label>
              <Input value={form.billing_address} onChange={(e) => setForm({ ...form, billing_address: e.target.value })} data-testid="party-billing-input" />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Shipping Address</Label>
              <Input value={form.shipping_address} onChange={(e) => setForm({ ...form, shipping_address: e.target.value })} data-testid="party-shipping-input" />
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
