import { useEffect, useRef, useState } from "react";
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
import { Plus, Trash2, KeyRound, Building2, Pencil, Upload, X, Eye, Palette } from "lucide-react";
import { STATES } from "@/pages/Parties";
import { useAuth } from "@/context/AuthContext";
import RolesPanel from "@/components/RolesPanel";
import AuditLogPanel from "@/components/AuditLogPanel";
import DropZone from "@/components/DropZone";

export default function Settings() {
  const { currentOrg, currentRole } = useAuth();
  const [biz, setBiz] = useState({
    name: "", address: "", state: "Tamil Nadu", state_code: "33", gstin: "", pan: "",
    phone: "", email: "", logo_url: "", logo_b64: "", bank_name: "", bank_account: "", bank_ifsc: "",
    bank_branch: "", terms: "", invoice_theme: {},
  });
  const [theme, setTheme] = useState({
    primary_color: "#1D4ED8", accent_color: "#1D4ED8",
    show_logo: true, show_ship_to: true, show_bank: true, show_terms: true,
    show_signature: true, watermark: "",
  });
  const [logoUploading, setLogoUploading] = useState(false);
  const logoRef = useRef(null);
  const [members, setMembers] = useState([]);
  const [banks, setBanks] = useState([]);
  const [bankForm, setBankForm] = useState({ bank_name: "", account_no: "", ifsc: "", branch: "", opening_balance: 0 });
  const [composition, setComposition] = useState(false);
  const [language, setLanguage] = useState("English");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [changingRole, setChangingRole] = useState(null); // { membership_id, current_role, name }
  const [branches, setBranches] = useState([]);
  const [branchDialog, setBranchDialog] = useState({ open: false, branch: null });
  const EMPTY_BRANCH = { name: "", gstin: "", state: "Tamil Nadu", state_code: "33", address: "", active: true };
  const [branchForm, setBranchForm] = useState(EMPTY_BRANCH);

  const load = async () => {
    const [b, m, ba, br] = await Promise.all([
      api.get("/business"),
      api.get("/orgs/current/members"),
      api.get("/bank-accounts"),
      api.get("/orgs/current/branches"),
    ]);
    if (b.data) {
      setBiz(s => ({ ...s, ...b.data }));
      if (b.data.invoice_theme) setTheme(t => ({ ...t, ...b.data.invoice_theme }));
    }
    setMembers(m.data); setBanks(ba.data); setBranches(br.data || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentOrg?.id]);

  const saveBiz = async () => { await api.put("/business", biz); toast.success("Saved"); };

  const saveTheme = async () => {
    await api.put("/business", { ...biz, invoice_theme: theme });
    toast.success("Invoice theme saved");
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Logo must be under 2 MB"); return; }
    setLogoUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/business/logo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setBiz(b => ({ ...b, logo_b64: data.logo_b64 }));
      toast.success("Logo uploaded");
    } catch (e) { toast.error(e?.response?.data?.detail || "Upload failed"); }
    finally { setLogoUploading(false); }
  };

  const removeLogo = async () => {
    await api.delete("/business/logo");
    setBiz(b => ({ ...b, logo_b64: "" }));
    toast.success("Logo removed");
  };
  const addBank = async () => {
    if (!bankForm.bank_name || !bankForm.account_no) { toast.error("Bank & A/c required"); return; }
    await api.post("/bank-accounts", { ...bankForm, opening_balance: parseFloat(bankForm.opening_balance || 0) });
    toast.success("Added");
    setBankForm({ bank_name: "", account_no: "", ifsc: "", branch: "", opening_balance: 0 });
    load();
  };
  const delBank = async (id) => { await api.delete(`/bank-accounts/${id}`); load(); };
  const openAddBranch = () => { setBranchForm(EMPTY_BRANCH); setBranchDialog({ open: true, branch: null }); };
  const openEditBranch = (br) => { setBranchForm({ name: br.name, gstin: br.gstin || "", state: br.state, state_code: br.state_code, address: br.address || "", active: br.active }); setBranchDialog({ open: true, branch: br }); };
  const saveBranch = async () => {
    try {
      if (branchDialog.branch) await api.put(`/orgs/current/branches/${branchDialog.branch.id}`, branchForm);
      else await api.post("/orgs/current/branches", branchForm);
      toast.success(branchDialog.branch ? "Branch updated" : "Branch added");
      setBranchDialog({ open: false, branch: null }); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const delBranch = async (id) => { await api.delete(`/orgs/current/branches/${id}`); toast.success("Deleted"); load(); };
  const changeRole = async (membership_id, newRole) => {
    try {
      await api.patch(`/orgs/current/members/${membership_id}/role`, { role: newRole });
      toast.success("Role updated"); setChangingRole(null); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

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
        <TabsList className="flex-wrap">
          <TabsTrigger value="biz" data-testid="settings-tab-biz">Business</TabsTrigger>
          <TabsTrigger value="invoice" data-testid="settings-tab-invoice">Invoice Theme</TabsTrigger>
          <TabsTrigger value="branches" data-testid="settings-tab-branches">Branches & GSTINs</TabsTrigger>
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

        <TabsContent value="branches">
          <Card className="p-5 mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-blue-600" /> Branches & GSTINs</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Add one entry per state where your company is registered. Each branch gets its own GSTIN and is used to auto-calculate IGST vs CGST+SGST on invoices.</p>
              </div>
              <Button onClick={openAddBranch} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="h-4 w-4" /> Add Branch</Button>
            </div>
            <div className="rounded-md border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <strong>How GST state determination works:</strong> When you select a branch on an invoice, the system compares <em>that branch's state</em> with the customer's state. Same state → CGST + SGST. Different state → IGST. If no branch is selected, the org's primary state (configured in Business tab) is used.
            </div>
            {branches.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <Building2 className="h-10 w-10 mx-auto mb-2 opacity-20" />
                No branches yet. Add branches for each state you operate in.
              </div>
            ) : (
              <div className="space-y-3">
                {branches.map(br => (
                  <div key={br.id} className={`flex items-start justify-between p-4 rounded-lg border ${br.active ? "bg-card" : "opacity-50 bg-muted"}`}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{br.name}</span>
                        {!br.active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                      </div>
                      <div className="text-sm text-muted-foreground">{br.state} (State code: {br.state_code})</div>
                      {br.gstin && <div className="font-mono text-xs text-blue-600 dark:text-blue-400">GSTIN: {br.gstin}</div>}
                      {br.address && <div className="text-xs text-muted-foreground">{br.address}</div>}
                    </div>
                    <div className="flex gap-1 shrink-0 ml-4">
                      <Button variant="ghost" size="icon" onClick={() => openEditBranch(br)}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete branch "{br.name}"?</AlertDialogTitle><AlertDialogDescription>Existing invoices linked to this branch are unaffected.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => delBranch(br.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Dialog open={branchDialog.open} onOpenChange={o => setBranchDialog(d => ({ ...d, open: o }))}>
            <DialogContent>
              <DialogHeader><DialogTitle>{branchDialog.branch ? "Edit Branch" : "Add Branch"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <F2 label="Branch / Facility Name *" v={branchForm.name} on={v => setBranchForm(f => ({ ...f, name: v }))} />
                <F2 label="GSTIN" v={branchForm.gstin} on={v => setBranchForm(f => ({ ...f, gstin: v.toUpperCase() }))} />
                <div className="space-y-1.5">
                  <Label>State *</Label>
                  <Select value={branchForm.state_code} onValueChange={v => { const st = STATES.find(s => s.code === v); setBranchForm(f => ({ ...f, state: st.name, state_code: v })); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATES.map(s => <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <F2 label="Address" v={branchForm.address} on={v => setBranchForm(f => ({ ...f, address: v }))} />
                <div className="flex items-center justify-between p-3 rounded border">
                  <Label>Active</Label>
                  <Switch checked={branchForm.active} onCheckedChange={v => setBranchForm(f => ({ ...f, active: v }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBranchDialog({ open: false, branch: null })}>Cancel</Button>
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={saveBranch}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
                    <td className="text-muted-foreground text-sm">{u.email}</td>
                    <td>
                      <Badge variant={u.role === "owner" ? "default" : "secondary"} className="uppercase text-[10px]">{u.role}</Badge>
                    </td>
                    <td className="text-right">
                      {currentRole === "owner" && u.role !== "owner" && (
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" title="Change role"
                            onClick={() => setChangingRole({ membership_id: u.membership_id, current_role: u.role, name: u.name })}>
                            <Pencil className="h-4 w-4 text-blue-500" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" data-testid={`remove-member-${u.email}`}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader><AlertDialogTitle>Remove {u.name}?</AlertDialogTitle><AlertDialogDescription>They'll lose access to {currentOrg?.name}.</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => removeMember(u.membership_id)}>Remove</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
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

        <TabsContent value="invoice">
          <div className="mt-4 grid lg:grid-cols-2 gap-6">

            {/* ── LEFT: Controls ── */}
            <div className="space-y-5">

              {/* Logo upload */}
              <Card className="p-5 space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Palette className="h-4 w-4" style={{ color: "hsl(var(--tally-green))" }} /> Company Logo
                </h3>
                {biz.logo_b64 ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <img src={biz.logo_b64} alt="Logo" className="h-14 max-w-[140px] object-contain rounded" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Logo uploaded</p>
                        <p className="text-xs text-muted-foreground">Appears in the top-left of every invoice</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={removeLogo} className="text-rose-500 shrink-0">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={theme.show_logo} onCheckedChange={v => setTheme(t => ({ ...t, show_logo: v }))} />
                      <Label className="text-sm">Show logo on invoices</Label>
                    </div>
                  </div>
                ) : (
                  <DropZone
                    accept="image/*"
                    onFile={uploadLogo}
                    label={logoUploading ? "Uploading…" : "Click or drag & drop logo here"}
                    hint="PNG, JPG, WebP — max 2 MB · Recommended: 400×120 px"
                    icon={Upload}
                    disabled={logoUploading}
                  />
                )}
              </Card>

              {/* Colours */}
              <Card className="p-5 space-y-4">
                <h3 className="font-semibold">Colour Scheme</h3>
                <p className="text-xs text-muted-foreground">The primary colour is used for the table header row, grand total banner, and the divider line.</p>

                {/* Preset swatches */}
                <div className="space-y-2">
                  <Label className="text-xs">Quick Presets</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "Classic Blue",  hex: "#1D4ED8" },
                      { label: "Forest Green", hex: "#15803D" },
                      { label: "Royal Purple", hex: "#7C3AED" },
                      { label: "Crimson Red",  hex: "#DC2626" },
                      { label: "Slate Grey",   hex: "#374151" },
                      { label: "Teal",         hex: "#0D9488" },
                      { label: "Amber",        hex: "#B45309" },
                      { label: "Indigo",       hex: "#4338CA" },
                    ].map(({ label, hex }) => (
                      <button key={hex} type="button" title={label}
                        onClick={() => setTheme(t => ({ ...t, primary_color: hex, accent_color: hex }))}
                        className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                        style={{
                          background: hex,
                          borderColor: theme.primary_color === hex ? "#000" : "transparent",
                          boxShadow: theme.primary_color === hex ? `0 0 0 2px ${hex}55` : "none",
                        }} />
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Primary Colour</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={theme.primary_color}
                        onChange={e => setTheme(t => ({ ...t, primary_color: e.target.value, accent_color: e.target.value }))}
                        className="h-9 w-14 rounded border cursor-pointer p-0.5" />
                      <Input value={theme.primary_color}
                        onChange={e => setTheme(t => ({ ...t, primary_color: e.target.value }))}
                        className="font-mono uppercase text-sm" maxLength={7} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Preview</Label>
                    <div className="h-9 rounded flex items-center justify-center text-white text-xs font-bold"
                      style={{ background: theme.primary_color }}>
                      GRAND TOTAL
                    </div>
                  </div>
                </div>
              </Card>

              {/* Section toggles */}
              <Card className="p-5 space-y-3">
                <h3 className="font-semibold">Invoice Sections</h3>
                {[
                  { key: "show_logo",      label: "Company Logo",             desc: "Show logo in header" },
                  { key: "show_ship_to",   label: "Ship To Column",            desc: "Show delivery address box" },
                  { key: "show_bank",      label: "Bank Details",              desc: "Show bank account at bottom" },
                  { key: "show_terms",     label: "Terms & Conditions",        desc: "Show T&C section" },
                  { key: "show_signature", label: "Authorized Signatory Box",  desc: "Space for signature at bottom" },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div>
                      <div className="text-sm font-medium">{label}</div>
                      <div className="text-xs text-muted-foreground">{desc}</div>
                    </div>
                    <Switch checked={!!theme[key]} onCheckedChange={v => setTheme(t => ({ ...t, [key]: v }))} />
                  </div>
                ))}
              </Card>

              {/* Watermark */}
              <Card className="p-5 space-y-3">
                <h3 className="font-semibold">Watermark</h3>
                <p className="text-xs text-muted-foreground">Text printed diagonally across every invoice page (e.g. ORIGINAL, DUPLICATE). Leave blank for none.</p>
                <div className="flex gap-2">
                  {["", "ORIGINAL", "DUPLICATE", "DRAFT", "CANCELLED"].map(w => (
                    <button key={w || "__none"} type="button"
                      onClick={() => setTheme(t => ({ ...t, watermark: w }))}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${theme.watermark === w
                        ? "text-white border-transparent"
                        : "text-muted-foreground hover:bg-muted/50"}`}
                      style={theme.watermark === w ? { background: theme.primary_color } : {}}>
                      {w || "None"}
                    </button>
                  ))}
                </div>
              </Card>

              <Button onClick={saveTheme} style={{ background: "hsl(var(--tally-green))", color: "white" }}>
                Save Invoice Theme
              </Button>
            </div>

            {/* ── RIGHT: Live preview ── */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Eye className="h-4 w-4" /> Invoice Preview
              </h3>
              <div className="rounded-xl border bg-white shadow-sm overflow-hidden" style={{ fontFamily: "sans-serif", fontSize: "11px" }}>
                {/* Header */}
                <div className="flex items-start justify-between p-4 pb-2">
                  <div className="space-y-1">
                    {theme.show_logo && biz.logo_b64 && (
                      <img src={biz.logo_b64} alt="Logo" className="h-10 max-w-[120px] object-contain mb-1" />
                    )}
                    <div className="font-bold text-base" style={{ color: theme.primary_color }}>
                      {biz.name || "Your Company Name"}
                    </div>
                    <div className="text-gray-500 text-[10px]">{biz.address || "Company Address"}</div>
                    <div className="text-gray-500 text-[10px]">GSTIN: {biz.gstin || "27AAACR5055K1Z7"}</div>
                  </div>
                  <div className="text-right space-y-0.5">
                    <div className="font-bold text-sm" style={{ color: theme.primary_color }}>TAX INVOICE</div>
                    <div className="text-[10px] text-gray-600">Invoice #: INV-2026-0001</div>
                    <div className="text-[10px] text-gray-600">Date: 04/07/2026</div>
                    {!theme.show_ship_to && <div className="text-[10px] text-gray-600">Due: 03/08/2026</div>}
                  </div>
                </div>

                {/* Divider */}
                <div className="h-0.5 mx-4" style={{ background: theme.primary_color }} />

                {/* Bill to / Ship to */}
                <div className={`grid ${theme.show_ship_to ? "grid-cols-2" : "grid-cols-1"} gap-0 mx-4 mt-3 border border-gray-200 rounded text-[10px]`}>
                  <div className="p-2 border-r border-gray-200">
                    <div className="text-gray-400 text-[9px] uppercase mb-0.5">Bill To</div>
                    <div className="font-semibold">63IDEAS INFOLABS PVT LTD</div>
                    <div className="text-gray-500">Chennai, Tamil Nadu 600032</div>
                    <div className="text-gray-500">GSTIN: 33AAACZ8597L1ZJ</div>
                  </div>
                  {theme.show_ship_to && (
                    <div className="p-2">
                      <div className="text-gray-400 text-[9px] uppercase mb-0.5">Ship To</div>
                      <div className="font-semibold">63IDEAS INFOLABS PVT LTD</div>
                      <div className="text-gray-500">Chennai, Tamil Nadu 600032</div>
                    </div>
                  )}
                </div>

                {/* Items table */}
                <div className="mx-4 mt-3">
                  <table className="w-full text-[10px] border-collapse">
                    <thead>
                      <tr style={{ background: theme.primary_color, color: "white" }}>
                        <th className="px-2 py-1.5 text-left">#</th>
                        <th className="px-2 py-1.5 text-left">Description</th>
                        <th className="px-2 py-1.5 text-right">HSN</th>
                        <th className="px-2 py-1.5 text-right">Qty</th>
                        <th className="px-2 py-1.5 text-right">Rate</th>
                        <th className="px-2 py-1.5 text-right">GST%</th>
                        <th className="px-2 py-1.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-100" style={{ background: "#EFF6FF" }}>
                        <td className="px-2 py-1.5">1</td>
                        <td className="px-2 py-1.5">Sugar 50 KGS</td>
                        <td className="px-2 py-1.5 text-right">1701</td>
                        <td className="px-2 py-1.5 text-right">700</td>
                        <td className="px-2 py-1.5 text-right">2,000.00</td>
                        <td className="px-2 py-1.5 text-right">5%</td>
                        <td className="px-2 py-1.5 text-right">14,70,000</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div className="flex justify-end mx-4 mt-2">
                  <table className="text-[10px] border-collapse">
                    <tbody>
                      <tr><td className="px-3 py-1 text-gray-500">Taxable Amount</td><td className="px-3 py-1 text-right">₹14,00,000.00</td></tr>
                      <tr><td className="px-3 py-1 text-gray-500">CGST</td><td className="px-3 py-1 text-right">₹35,000.00</td></tr>
                      <tr><td className="px-3 py-1 text-gray-500">SGST</td><td className="px-3 py-1 text-right">₹35,000.00</td></tr>
                      <tr style={{ background: theme.primary_color, color: "white" }}>
                        <td className="px-3 py-1.5 font-bold">GRAND TOTAL</td>
                        <td className="px-3 py-1.5 font-bold text-right">₹14,70,000.00</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Bank + Terms */}
                <div className={`grid ${theme.show_bank && theme.show_terms ? "grid-cols-2" : "grid-cols-1"} gap-3 mx-4 mt-3 mb-3 text-[10px]`}>
                  {theme.show_bank && (
                    <div>
                      <div className="font-semibold mb-0.5">Bank Details</div>
                      <div className="text-gray-500">Bank: {biz.bank_name || "HDFC Bank"}</div>
                      <div className="text-gray-500">A/c: {biz.bank_account || "XXXXXX1234"}</div>
                      <div className="text-gray-500">IFSC: {biz.bank_ifsc || "HDFC0001234"}</div>
                    </div>
                  )}
                  {theme.show_terms && (
                    <div>
                      <div className="font-semibold mb-0.5">Terms & Conditions</div>
                      <div className="text-gray-500">1. Payment due within 30 days.</div>
                      <div className="text-gray-500">2. Subject to local jurisdiction.</div>
                    </div>
                  )}
                </div>

                {theme.show_signature && (
                  <div className="flex justify-end mx-4 mb-3 text-[10px] text-gray-600">
                    <div className="text-right">
                      <div className="font-semibold">For {biz.name || "Your Company"}</div>
                      <div className="mt-5 border-t border-gray-300 pt-1">Authorized Signatory</div>
                    </div>
                  </div>
                )}

                {/* Watermark preview */}
                {theme.watermark && (
                  <div className="flex justify-center pb-2">
                    <span className="text-[9px] font-bold opacity-30 tracking-widest rotate-45 inline-block" style={{ color: theme.primary_color }}>
                      {theme.watermark}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
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

      {/* Change Role Dialog */}
      <ChangeRoleDialog
        target={changingRole}
        onClose={() => setChangingRole(null)}
        onSave={changeRole}
      />
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

function ChangeRoleDialog({ target, onClose, onSave }) {
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (target) {
      api.get("/roles").then(r => setRoles(r.data.filter(x => x.slug !== "owner")));
      setSelectedRole(target.current_role);
    }
  }, [target]);

  const handleSave = async () => {
    if (!selectedRole || selectedRole === target?.current_role) { onClose(); return; }
    setSaving(true);
    await onSave(target.membership_id, selectedRole);
    setSaving(false);
  };

  return (
    <Dialog open={!!target} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Role — {target?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>New Role</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                {roles.map(r => (
                  <SelectItem key={r.slug} value={r.slug}>
                    <div className="flex flex-col">
                      <span className="font-medium">{r.name}</span>
                      {(r.allowed_modes || []).length > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          Locked to: {r.allowed_modes.join(", ")}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedRole && selectedRole !== target?.current_role && (
            <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded px-3 py-2">
              Changing from <strong>{target?.current_role}</strong> → <strong>{selectedRole}</strong>. This takes effect on their next login.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={saving || selectedRole === target?.current_role}>
            {saving ? "Saving…" : "Update Role"}
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
