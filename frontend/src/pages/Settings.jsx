import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Trash2, KeyRound } from "lucide-react";
import { STATES } from "@/pages/Parties";
import { useAuth } from "@/context/AuthContext";
import RolesPanel from "@/components/RolesPanel";
import AuditLogPanel from "@/components/AuditLogPanel";

export default function Settings() {
  const { currentOrg, currentRole } = useAuth();
  const [biz, setBiz] = useState({
    name: "", address: "", state: "Tamil Nadu", state_code: "33", gstin: "", pan: "",
    phone: "", email: "", logo_url: "", bank_name: "", bank_account: "", bank_ifsc: "",
    bank_branch: "", terms: "",
  });
  const [members, setMembers] = useState([]);
  const [banks, setBanks] = useState([]);
  const [bankForm, setBankForm] = useState({ bank_name: "", account_no: "", ifsc: "", branch: "", opening_balance: 0 });
  const [composition, setComposition] = useState(false);
  const [language, setLanguage] = useState("English");
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = async () => {
    const [b, m, ba] = await Promise.all([
      api.get("/business"),
      api.get("/orgs/current/members"),
      api.get("/bank-accounts"),
    ]);
    if (b.data) setBiz(s => ({ ...s, ...b.data }));
    setMembers(m.data); setBanks(ba.data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentOrg?.id]);

  const saveBiz = async () => { await api.put("/business", biz); toast.success("Saved"); };
  const addBank = async () => {
    if (!bankForm.bank_name || !bankForm.account_no) { toast.error("Bank & A/c required"); return; }
    await api.post("/bank-accounts", { ...bankForm, opening_balance: parseFloat(bankForm.opening_balance || 0) });
    toast.success("Added");
    setBankForm({ bank_name: "", account_no: "", ifsc: "", branch: "", opening_balance: 0 });
    load();
  };
  const delBank = async (id) => { await api.delete(`/bank-accounts/${id}`); load(); };
  const removeMember = async (mid) => {
    try { await api.delete(`/orgs/current/members/${mid}`); toast.success("Removed"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage <span className="font-medium text-foreground">{currentOrg?.name}</span> — profile, team & preferences.</p>
      </div>

      <Tabs defaultValue="biz">
        <TabsList>
          <TabsTrigger value="biz" data-testid="settings-tab-biz">Business</TabsTrigger>
          <TabsTrigger value="bank" data-testid="settings-tab-bank">Banking</TabsTrigger>
          <TabsTrigger value="users" data-testid="settings-tab-users">Team</TabsTrigger>
          <TabsTrigger value="roles" data-testid="settings-tab-roles">Roles</TabsTrigger>
          <TabsTrigger value="audit" data-testid="settings-tab-audit">Audit Log</TabsTrigger>
          <TabsTrigger value="security" data-testid="settings-tab-security">Security</TabsTrigger>
          <TabsTrigger value="prefs" data-testid="settings-tab-prefs">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="biz">
          <Card className="p-5 mt-4 space-y-4">
            <h3 className="font-semibold">Business Profile</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <F label="Business Name" v={biz.name} on={(v) => setBiz({ ...biz, name: v })} tid="set-biz-name" />
              <F label="GSTIN" v={biz.gstin} on={(v) => setBiz({ ...biz, gstin: v.toUpperCase() })} tid="set-biz-gstin" />
              <F label="PAN" v={biz.pan} on={(v) => setBiz({ ...biz, pan: v.toUpperCase() })} tid="set-biz-pan" />
              <F label="Phone" v={biz.phone} on={(v) => setBiz({ ...biz, phone: v })} tid="set-biz-phone" />
              <F label="Email" v={biz.email} on={(v) => setBiz({ ...biz, email: v })} tid="set-biz-email" />
              <div className="space-y-1.5">
                <Label>State</Label>
                <Select value={biz.state_code} onValueChange={(v) => {
                  const st = STATES.find(s => s.code === v); setBiz({ ...biz, state: st.name, state_code: v });
                }}>
                  <SelectTrigger data-testid="set-biz-state"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATES.map(s => <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Address</Label>
                <Textarea value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} rows={2} data-testid="set-biz-address" />
              </div>
              <F label="Bank Name" v={biz.bank_name} on={(v) => setBiz({ ...biz, bank_name: v })} />
              <F label="Bank A/c" v={biz.bank_account} on={(v) => setBiz({ ...biz, bank_account: v })} />
              <F label="IFSC" v={biz.bank_ifsc} on={(v) => setBiz({ ...biz, bank_ifsc: v.toUpperCase() })} />
              <F label="Branch" v={biz.bank_branch} on={(v) => setBiz({ ...biz, bank_branch: v })} />
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Invoice Terms & Conditions</Label>
                <Textarea value={biz.terms} onChange={(e) => setBiz({ ...biz, terms: e.target.value })} rows={3} data-testid="set-biz-terms" />
              </div>
            </div>
            <Button onClick={saveBiz} className="bg-blue-600 hover:bg-blue-700" disabled={currentRole !== "owner"} data-testid="set-biz-save">Save Business</Button>
            {currentRole !== "owner" && <div className="text-xs text-muted-foreground">Only the owner can edit business profile.</div>}
          </Card>
        </TabsContent>

        <TabsContent value="bank">
          <Card className="p-5 mt-4 space-y-4">
            <h3 className="font-semibold">Bank Accounts</h3>
            <div className="grid sm:grid-cols-5 gap-3">
              <F label="Bank" v={bankForm.bank_name} on={(v) => setBankForm({ ...bankForm, bank_name: v })} />
              <F label="A/c No" v={bankForm.account_no} on={(v) => setBankForm({ ...bankForm, account_no: v })} />
              <F label="IFSC" v={bankForm.ifsc} on={(v) => setBankForm({ ...bankForm, ifsc: v })} />
              <F label="Branch" v={bankForm.branch} on={(v) => setBankForm({ ...bankForm, branch: v })} />
              <F label="Opening" type="number" v={bankForm.opening_balance} on={(v) => setBankForm({ ...bankForm, opening_balance: v })} />
            </div>
            <Button onClick={addBank} className="bg-blue-600 hover:bg-blue-700" data-testid="add-bank-button">Add Bank</Button>
            <div className="overflow-x-auto"><table className="app-table">
              <thead><tr><th>Bank</th><th>A/c No</th><th>IFSC</th><th>Branch</th><th></th></tr></thead>
              <tbody>
                {banks.length === 0 ? <tr><td colSpan={5} className="text-center text-muted-foreground py-6">No banks yet.</td></tr> :
                  banks.map(b => (
                    <tr key={b.id}>
                      <td className="font-medium">{b.bank_name}</td>
                      <td className="font-mono-fin">{b.account_no}</td>
                      <td className="font-mono-fin text-xs">{b.ifsc}</td>
                      <td>{b.branch}</td>
                      <td className="text-right"><Button variant="ghost" size="sm" onClick={() => delBank(b.id)}>Remove</Button></td>
                    </tr>
                  ))}
              </tbody>
            </table></div>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card className="p-5 mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Team Members</h3>
              {currentRole === "owner" && (
                <Button onClick={() => setInviteOpen(true)} className="bg-blue-600 hover:bg-blue-700" data-testid="invite-member-button">
                  <Plus className="h-4 w-4 mr-1.5" /> Invite member
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Members of <span className="font-medium text-foreground">{currentOrg?.name}</span>. Roles control what they can do.</p>
            <div className="overflow-x-auto"><table className="app-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
              <tbody>
                {members.map(u => (
                  <tr key={u.id} data-testid={`member-row-${u.email}`}>
                    <td className="font-medium">{u.name}</td>
                    <td className="text-muted-foreground">{u.email}</td>
                    <td><Badge variant={u.role === "owner" ? "default" : "secondary"} className="uppercase text-[10px]">{u.role}</Badge></td>
                    <td className="text-right">
                      {currentRole === "owner" && u.role !== "owner" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" data-testid={`remove-member-${u.email}`}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Remove {u.name}?</AlertDialogTitle><AlertDialogDescription>They'll lose access to {currentOrg?.name}.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => removeMember(u.membership_id)}>Remove</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <RolesPanel canManage={currentRole === "owner"} />
        </TabsContent>

        <TabsContent value="audit">
          <AuditLogPanel />
        </TabsContent>

        <TabsContent value="security">
          <ChangePasswordCard />
        </TabsContent>

        <TabsContent value="prefs">
          <Card className="p-5 mt-4 space-y-4">
            <h3 className="font-semibold">Preferences</h3>
            <div className="flex items-center justify-between max-w-md">
              <div><Label>Composition Scheme</Label><div className="text-xs text-muted-foreground">For turnover under ₹1.5 Cr.</div></div>
              <Switch checked={composition} onCheckedChange={setComposition} data-testid="composition-switch" />
            </div>
            <div className="max-w-md space-y-1.5">
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger data-testid="language-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Hindi">हिंदी (Hindi)</SelectItem>
                  <SelectItem value="Tamil">தமிழ் (Tamil)</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">Hindi/Tamil labels coming soon.</div>
            </div>
            <div className="max-w-md space-y-1.5">
              <Label>Financial Year</Label>
              <Input value="April 2025 – March 2026" disabled />
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} onSaved={load} />
    </div>
  );
}

function InviteDialog({ open, onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "sales" });
  const [roles, setRoles] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) api.get("/roles").then(r => setRoles(r.data.filter(x => x.slug !== "owner")));
  }, [open]);
  const save = async () => {
    setSaving(true);
    try {
      await api.post("/orgs/current/members", form);
      toast.success(`${form.name} added`);
      onSaved(); onClose();
      setForm({ name: "", email: "", password: "", role: "sales" });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent data-testid="invite-dialog">
        <DialogHeader><DialogTitle>Invite team member</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <F2 label="Full name" v={form.name} on={(v) => setForm({ ...form, name: v })} tid="invite-name" />
          <F2 label="Email" v={form.email} on={(v) => setForm({ ...form, email: v })} type="email" tid="invite-email" />
          <F2 label="Initial password" v={form.password} on={(v) => setForm({ ...form, password: v })} type="password" tid="invite-password" />
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger data-testid="invite-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.map(r => (
                  <SelectItem key={r.slug} value={r.slug}>
                    {r.name} {r.is_system ? "" : "(custom)"} — {r.description?.slice(0, 40) || ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground">Share the email + password with the new user. They can change the password after first login.</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} disabled={saving} data-testid="invite-save">
            {saving ? "Adding…" : "Add member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, v, on, type = "text", tid }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={v ?? ""} onChange={(e) => on(e.target.value)} data-testid={tid} />
    </div>
  );
}
function F2(props) { return <F {...props} />; }

function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (next !== confirm) { toast.error("Passwords don't match"); return; }
    if (next.length < 6) { toast.error("Min 6 characters"); return; }
    setSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: next });
      toast.success("Password updated"); setCurrent(""); setNext(""); setConfirm("");
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  };
  return (
    <Card className="p-5 mt-4 max-w-md space-y-3" data-testid="change-password-card">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-blue-600" />
        <h3 className="font-semibold">Change password</h3>
      </div>
      <p className="text-xs text-muted-foreground">For your own account. Other users can reset theirs via Forgot Password.</p>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5"><Label>Current password</Label>
          <Input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} data-testid="cp-current-input" /></div>
        <div className="space-y-1.5"><Label>New password</Label>
          <Input type="password" required minLength={6} value={next} onChange={(e) => setNext(e.target.value)} data-testid="cp-new-input" /></div>
        <div className="space-y-1.5"><Label>Confirm new password</Label>
          <Input type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="cp-confirm-input" /></div>
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={saving} data-testid="cp-submit-button">
          {saving ? "Updating…" : "Update password"}
        </Button>
      </form>
    </Card>
  );
}
