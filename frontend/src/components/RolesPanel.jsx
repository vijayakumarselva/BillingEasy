// Roles & Permissions tab — list system + custom roles, create/edit custom roles.
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Edit, Trash2, ShieldCheck, Lock } from "lucide-react";

export default function RolesPanel({ canManage }) {
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState({ grouped: {}, permissions: [] });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", permissions: [], slug: null });

  const load = async () => {
    const [r, c] = await Promise.all([api.get("/roles"), api.get("/permissions")]);
    setRoles(r.data); setCatalog(c.data);
  };
  useEffect(() => { load(); }, []);

  const expand = (perms) => {
    const set = new Set();
    perms.forEach(p => {
      if (p === "*") catalog.permissions.forEach(x => set.add(x));
      else if (p.endsWith(".*")) catalog.permissions.filter(x => x.startsWith(p.slice(0, -1))).forEach(x => set.add(x));
      else set.add(p);
    });
    return Array.from(set);
  };

  const startCreate = () => { setForm({ name: "", description: "", permissions: [], slug: null }); setOpen(true); };
  const startEdit = (r) => { setForm({ name: r.name, description: r.description || "", permissions: expand(r.permissions), slug: r.slug }); setOpen(true); };
  const togglePerm = (p) => {
    setForm(f => ({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter(x => x !== p) : [...f.permissions, p] }));
  };
  const toggleGroup = (modulePerms) => {
    const allIn = modulePerms.every(p => form.permissions.includes(p));
    setForm(f => ({
      ...f,
      permissions: allIn ? f.permissions.filter(x => !modulePerms.includes(x)) : Array.from(new Set([...f.permissions, ...modulePerms])),
    }));
  };
  const save = async () => {
    if (!form.name) { toast.error("Role name is required"); return; }
    try {
      if (form.slug) await api.put(`/roles/${form.slug}`, { name: form.name, description: form.description, permissions: form.permissions });
      else await api.post("/roles", { name: form.name, description: form.description, permissions: form.permissions });
      toast.success("Saved"); setOpen(false); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const remove = async (slug) => {
    try { await api.delete(`/roles/${slug}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <Card className="p-5 mt-4 space-y-4" data-testid="roles-panel">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Roles & Permissions</h3>
          <p className="text-xs text-muted-foreground">System roles can't be edited. Create custom roles to fine-tune what each team member can do.</p>
        </div>
        {canManage && (
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={startCreate} data-testid="new-role-button">
            <Plus className="h-4 w-4 mr-1.5" /> New role
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {roles.map(r => (
          <div key={r.slug} className="rounded-lg border border-border p-4 flex items-start justify-between" data-testid={`role-row-${r.slug}`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{r.name}</span>
                {r.is_system && <Badge variant="secondary" className="text-[10px]"><Lock className="h-2.5 w-2.5 mr-1" /> System</Badge>}
                <Badge variant="outline" className="text-[10px]">{r.member_count} member(s)</Badge>
                <Badge variant="outline" className="text-[10px]">{expand(r.permissions).length} permissions</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{r.description}</div>
            </div>
            {canManage && !r.is_system && (
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" onClick={() => startEdit(r)} data-testid={`role-edit-${r.slug}`}><Edit className="h-4 w-4" /></Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button size="icon" variant="ghost" data-testid={`role-del-${r.slug}`}><Trash2 className="h-4 w-4 text-rose-500" /></Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Delete role {r.name}?</AlertDialogTitle><AlertDialogDescription>Members using this role must be reassigned first.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(r.slug)}>Delete</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="role-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-blue-600" /> {form.slug ? "Edit role" : "New custom role"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Billing Operator" data-testid="role-name-input" /></div>
              <div className="space-y-1.5"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this role does" data-testid="role-desc-input" /></div>
            </div>
            <div>
              <Label>Permissions ({form.permissions.length} selected)</Label>
              <div className="mt-2 space-y-3">
                {Object.entries(catalog.grouped).map(([module, perms]) => {
                  const allIn = perms.every(p => form.permissions.includes(p));
                  return (
                    <div key={module} className="rounded-md border border-border p-3">
                      <label className="flex items-center gap-2 font-semibold capitalize text-sm cursor-pointer">
                        <Checkbox checked={allIn} onCheckedChange={() => toggleGroup(perms)} data-testid={`perm-group-${module}`} />
                        {module}
                        <span className="text-[10px] text-muted-foreground">({perms.length})</span>
                      </label>
                      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 mt-2 pl-6">
                        {perms.map(p => (
                          <label key={p} className="flex items-center gap-2 text-xs cursor-pointer">
                            <Checkbox checked={form.permissions.includes(p)} onCheckedChange={() => togglePerm(p)} data-testid={`perm-${p}`} />
                            <span className="font-mono-fin">{p}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} data-testid="role-save-button">Save role</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
