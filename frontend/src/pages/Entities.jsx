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
import { Plus, Pencil, Trash2, Building2, Check } from "lucide-react";

const BIZ_TYPE_LABELS = {
  b2b: { label: "B2B", color: "bg-blue-100 text-blue-700", emoji: "🏢" },
  b2c: { label: "B2C", color: "bg-green-100 text-green-700", emoji: "🛒" },
  restaurant: { label: "Restaurant", color: "bg-orange-100 text-orange-700", emoji: "🍽️" },
  pos: { label: "POS", color: "bg-purple-100 text-purple-700", emoji: "🖥️" },
};

const empty = {
  name: "", biz_type: "b2b", gstin: "", pan: "",
  address: "", state: "", state_code: "", phone: "", email: "",
  invoice_prefix: "",
};

export default function Entities() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeEntityId, setActiveEntityId] = useState(() => {
    const orgId = localStorage.getItem("be_org_id");
    return orgId ? localStorage.getItem(`active_entity_${orgId}`) : null;
  });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/orgs/current/entities");
      setList(data);
    } catch {
      toast.error("Failed to load entities");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startCreate = () => {
    setForm({ ...empty });
    setEditId(null);
    setOpen(true);
  };

  const startEdit = (e) => {
    setForm({ ...empty, ...e });
    setEditId(e.id);
    setOpen(true);
  };

  const f = (k) => (v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { toast.error("Entity name required"); return; }
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/orgs/current/entities/${editId}`, form);
        toast.success("Entity updated");
      } else {
        await api.post("/orgs/current/entities", form);
        toast.success("Entity created");
      }
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save");
    }
    setSaving(false);
  };

  const remove = async (id) => {
    try {
      await api.delete(`/orgs/current/entities/${id}`);
      toast.success("Entity deleted");
      // Clear active entity if it was the deleted one
      const orgId = localStorage.getItem("be_org_id");
      if (orgId && localStorage.getItem(`active_entity_${orgId}`) === id) {
        localStorage.removeItem(`active_entity_${orgId}`);
        setActiveEntityId(null);
        window.dispatchEvent(new CustomEvent("be:entity-changed", { detail: { entityId: null } }));
      }
      load();
    } catch { toast.error("Failed to delete"); }
  };

  const switchTo = (id) => {
    const orgId = localStorage.getItem("be_org_id");
    if (!orgId) return;
    if (id === activeEntityId) {
      // Deselect — go back to biz_type mode
      localStorage.removeItem(`active_entity_${orgId}`);
      setActiveEntityId(null);
      window.dispatchEvent(new CustomEvent("be:entity-changed", { detail: { entityId: null } }));
      toast.success("Entity deselected — using default business mode");
    } else {
      localStorage.setItem(`active_entity_${orgId}`, id);
      setActiveEntityId(id);
      window.dispatchEvent(new CustomEvent("be:entity-changed", { detail: { entityId: id } }));
      const ent = list.find(e => e.id === id);
      toast.success(`Switched to entity: ${ent?.name}`);
    }
  };

  return (
    <div className="space-y-6" data-testid="entities-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Business Entities</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Separate business units within your organization — each with its own GSTIN, invoices, and data.
          </p>
        </div>
        <Button onClick={startCreate} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-1.5" /> New Entity
        </Button>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-4 text-sm text-blue-800 dark:text-blue-300">
        <strong>How entities work:</strong> Click <em>Activate</em> on any entity to switch all data views (invoices, purchases, payments, products) to that entity only.
        Entities are isolated — data tagged to one entity won't appear in another.
        Leave all entities inactive to use the global business-mode filter instead.
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : list.length === 0 ? (
        <Card className="p-12 text-center">
          <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-40" />
          <p className="text-muted-foreground text-sm">No entities yet. Create one to separate your B2B and B2C businesses.</p>
          <Button className="mt-4 bg-blue-600 hover:bg-blue-700" onClick={startCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> Create First Entity
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(ent => {
            const bt = BIZ_TYPE_LABELS[ent.biz_type] || BIZ_TYPE_LABELS.b2b;
            const isActive = activeEntityId === ent.id;
            return (
              <div key={ent.id} className={`rounded-xl border p-4 flex flex-col gap-3 transition-all ${
                isActive ? "border-blue-400 bg-blue-50/50 dark:bg-blue-950/20 ring-2 ring-blue-300" : "border-border bg-card hover:border-blue-200"
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-base truncate">{ent.name}</span>
                      {isActive && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-600 text-white font-bold flex items-center gap-1">
                          <Check className="h-2.5 w-2.5" /> Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${bt.color}`}>
                        {bt.emoji} {bt.label}
                      </span>
                      {ent.gstin && (
                        <span className="text-[11px] text-muted-foreground font-mono">{ent.gstin}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(ent)} className="h-7 w-7">
                      <Pencil className="h-3.5 w-3.5 text-blue-500" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7">
                          <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{ent.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This only removes the entity definition. Existing data tagged to this entity will still exist but won't be filtered.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(ent.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {(ent.address || ent.phone || ent.email) && (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {ent.address && <div className="truncate">📍 {ent.address}</div>}
                    {ent.phone && <div>📞 {ent.phone}</div>}
                    {ent.email && <div>✉️ {ent.email}</div>}
                  </div>
                )}

                {ent.invoice_prefix && (
                  <div className="text-xs text-muted-foreground">
                    Invoice prefix: <span className="font-mono font-semibold">{ent.invoice_prefix}</span>
                  </div>
                )}

                <Button
                  size="sm"
                  variant={isActive ? "outline" : "default"}
                  className={isActive ? "border-blue-300 text-blue-700 hover:bg-blue-50" : "bg-blue-600 hover:bg-blue-700 text-white"}
                  onClick={() => switchTo(ent.id)}
                >
                  {isActive ? "✓ Active — Click to deselect" : "Activate"}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Entity" : "New Business Entity"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Entity Name *</Label>
                <Input value={form.name} onChange={e => f("name")(e.target.value)}
                  placeholder="e.g. Nammahut B2B or Nammahut Retail" />
              </div>
              <div className="space-y-1.5">
                <Label>Business Type</Label>
                <Select value={form.biz_type} onValueChange={f("biz_type")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="b2b">🏢 B2B Billing</SelectItem>
                    <SelectItem value="b2c">🛒 B2C Retail</SelectItem>
                    <SelectItem value="restaurant">🍽️ Restaurant</SelectItem>
                    <SelectItem value="pos">🖥️ POS / Counter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Invoice Prefix</Label>
                <Input value={form.invoice_prefix} onChange={e => f("invoice_prefix")(e.target.value)}
                  placeholder="e.g. B2B/ or RETAIL/" />
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">GST / Tax Info</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>GSTIN</Label>
                  <Input value={form.gstin} onChange={e => f("gstin")(e.target.value.toUpperCase())}
                    placeholder="22AAAAA0000A1Z5" className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>PAN</Label>
                  <Input value={form.pan} onChange={e => f("pan")(e.target.value.toUpperCase())}
                    placeholder="AAAAA0000A" className="font-mono" />
                </div>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contact</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={e => f("phone")(e.target.value)} placeholder="9876543210" />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input value={form.email} onChange={e => f("email")(e.target.value)} placeholder="billing@example.com" type="email" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Address</Label>
                  <Input value={form.address} onChange={e => f("address")(e.target.value)}
                    placeholder="Street, City, PIN" />
                </div>
                <div className="space-y-1.5">
                  <Label>State</Label>
                  <Input value={form.state} onChange={e => f("state")(e.target.value)} placeholder="Tamil Nadu" />
                </div>
                <div className="space-y-1.5">
                  <Label>State Code</Label>
                  <Input value={form.state_code} onChange={e => f("state_code")(e.target.value)} placeholder="33" className="font-mono" />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} disabled={saving}>
              {saving ? "Saving…" : editId ? "Save Changes" : "Create Entity"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
