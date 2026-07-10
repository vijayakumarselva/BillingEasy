// Super-Admin platform console.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ShieldAlert, Building2, Users as UsersIcon, Activity, Ban, CheckCircle2, Trash2, UserCog, LogOut, CreditCard, Eye, EyeOff, AlertTriangle, Save, Plug, Sparkles } from "lucide-react";
import { inr, inrShort, fmtDate } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";

export default function SuperAdmin() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [users, setUsers] = useState([]);
  const nav = useNavigate();

  const load = async () => {
    try {
      const [s, o, u] = await Promise.all([
        api.get("/super/stats"), api.get("/super/orgs"), api.get("/super/users"),
      ]);
      setStats(s.data); setOrgs(o.data); setUsers(u.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Super admin access required");
      nav("/dashboard");
    }
  };
  useEffect(() => { load(); }, []);

  const suspend = async (id) => { await api.post(`/super/orgs/${id}/suspend`); toast.success("Suspended"); load(); };
  const activate = async (id) => { await api.post(`/super/orgs/${id}/activate`); toast.success("Activated"); load(); };
  const remove = async (id) => { await api.delete(`/super/orgs/${id}`); toast.success("Deleted"); load(); };
  const impersonate = async (uid) => {
    const { data } = await api.post(`/super/impersonate/${uid}`);
    localStorage.setItem("be_token", data.token);
    if (data.org_id) localStorage.setItem("be_org_id", data.org_id);
    toast.success(`Impersonating ${data.user.email}`);
    window.location.href = "/dashboard";
  };
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPw, setResetPw] = useState("");
  const doReset = async () => {
    if (!resetPw || resetPw.length < 6) { toast.error("Min 6 characters"); return; }
    try {
      await api.post(`/super/users/${resetTarget.id}/reset-password`, { password: resetPw });
      toast.success(`Password reset for ${resetTarget.email}`);
      setResetTarget(null); setResetPw("");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const exitSuper = async () => { await logout(); nav("/login"); };

  if (!stats) return null;
  const cards = [
    { label: "Organizations", value: stats.organizations, icon: Building2, color: "text-blue-600 bg-blue-600/10" },
    { label: "Users", value: stats.users, icon: UsersIcon, color: "text-emerald-600 bg-emerald-600/10" },
    { label: "Active subs", value: stats.active_subscriptions, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-600/10" },
    { label: "Trialing", value: stats.trialing, icon: Activity, color: "text-amber-600 bg-amber-600/10" },
    { label: "Suspended", value: stats.suspended, icon: Ban, color: "text-rose-600 bg-rose-600/10" },
    { label: "Audit events", value: stats.audit_events, icon: ShieldAlert, color: "text-purple-600 bg-purple-600/10" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950" data-testid="super-admin-page">
      <header className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-400" />
          <div>
            <div className="font-semibold">BillingsEasy · Platform Console</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Super admin · {user?.email}</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={exitSuper} className="text-slate-300 hover:text-white hover:bg-white/5" data-testid="super-logout">
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {cards.map(c => (
            <div key={c.label} className="metric-card" data-testid={`super-metric-${c.label}`}>
              <div className={`h-9 w-9 rounded-md ${c.color} grid place-items-center mb-3`}><c.icon className="h-4 w-4" /></div>
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="font-mono-fin text-2xl font-semibold mt-1">{c.value}</div>
            </div>
          ))}
        </div>

        <Tabs defaultValue="orgs">
          <TabsList>
            <TabsTrigger value="orgs" data-testid="super-tab-orgs">Organizations ({orgs.length})</TabsTrigger>
            <TabsTrigger value="users" data-testid="super-tab-users">All users ({users.length})</TabsTrigger>
            <TabsTrigger value="payment" data-testid="super-tab-payment">
              <CreditCard className="h-3.5 w-3.5 mr-1.5" /> Payment Gateway
            </TabsTrigger>
            <TabsTrigger value="offer" data-testid="super-tab-offer">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Launch Offer
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orgs">
            <Card className="mt-3"><div className="overflow-x-auto"><table className="app-table">
              <thead><tr><th>Organization</th><th>Owner</th><th>Plan</th><th>Status</th><th className="text-right">Users</th><th className="text-right">Inv/mo</th><th>Trial / Period</th><th></th></tr></thead>
              <tbody>
                {orgs.map(o => (
                  <tr key={o.id} data-testid={`super-org-row-${o.name}`}>
                    <td>
                      <div className="font-medium">{o.name}</div>
                      <div className="text-xs text-muted-foreground">{o.gstin || "No GSTIN"}</div>
                    </td>
                    <td>
                      <div className="text-sm">{o.owner?.name || "—"}</div>
                      <div className="text-[10px] text-muted-foreground">{o.owner?.email}</div>
                    </td>
                    <td className="text-xs font-mono-fin">{o.plan_code || "FREE"}</td>
                    <td><StatusBadge s={o.subscription_status} /></td>
                    <td className="num">{o.usage.users}</td>
                    <td className="num">{o.usage.invoices_this_month}</td>
                    <td className="text-xs text-muted-foreground">{fmtDate(o.subscription.current_period_end || o.subscription.trial_ends_at)}</td>
                    <td className="text-right whitespace-nowrap">
                      {o.subscription_status === "suspended" ? (
                        <Button size="sm" variant="outline" onClick={() => activate(o.id)} data-testid={`activate-org-${o.name}`}><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Activate</Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => suspend(o.id)} data-testid={`suspend-org-${o.name}`}><Ban className="h-3.5 w-3.5 mr-1" /> Suspend</Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button size="icon" variant="ghost" data-testid={`del-org-${o.name}`}><Trash2 className="h-4 w-4 text-rose-500" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete {o.name}?</AlertDialogTitle><AlertDialogDescription>All invoices, parties, products, audit logs for this org will be permanently removed.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(o.id)}>Delete permanently</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div></Card>
          </TabsContent>

          <TabsContent value="users">
            <Card className="mt-3"><div className="overflow-x-auto"><table className="app-table">
              <thead><tr><th>Name</th><th>Email</th><th>Orgs</th><th>Last login</th><th></th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} data-testid={`super-user-row-${u.email}`}>
                    <td>
                      <div className="font-medium">{u.name}</div>
                      {u.is_super_admin && <Badge className="bg-amber-500 text-[10px] mt-0.5"><ShieldAlert className="h-2.5 w-2.5 mr-1" /> Super</Badge>}
                    </td>
                    <td className="text-muted-foreground">{u.email}</td>
                    <td><Badge variant="secondary">{u.org_count}</Badge></td>
                    <td className="text-xs text-muted-foreground">{u.last_login ? fmtDate(u.last_login) : "Never"}</td>
                    <td className="text-right flex gap-1 justify-end">
                      {!u.is_super_admin && (
                        <Button size="sm" variant="outline" onClick={() => impersonate(u.id)} data-testid={`impersonate-${u.email}`}>
                          <UserCog className="h-3.5 w-3.5 mr-1" /> Impersonate
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-amber-600 hover:text-amber-700"
                        onClick={() => { setResetTarget(u); setResetPw(""); }}>
                        Reset PW
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div></Card>
          </TabsContent>

          <TabsContent value="payment">
            <PaymentGatewaySettings />
          </TabsContent>

          <TabsContent value="offer">
            <LaunchOfferSettings />
          </TabsContent>
        </Tabs>
      </main>

      {/* Reset Password Dialog */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <h3 className="font-semibold text-lg">Reset Password</h3>
            <p className="text-sm text-muted-foreground">Setting new password for <strong>{resetTarget.email}</strong></p>
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <Input type="password" value={resetPw} onChange={e => setResetPw(e.target.value)}
                placeholder="Min 6 characters" autoFocus />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => { setResetTarget(null); setResetPw(""); }}>Cancel</Button>
              <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={doReset}>Reset Password</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ s }) {
  const map = {
    active: "bg-emerald-600", trialing: "bg-amber-500",
    suspended: "bg-rose-600", expired: "bg-rose-600",
    trial_expired: "bg-rose-600", cancelled: "bg-slate-500",
    pending_authorisation: "bg-slate-500",
  };
  return <Badge className={map[s] || "bg-slate-500"}>{s}</Badge>;
}

function PaymentGatewaySettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  // Form state
  const [environment, setEnvironment] = useState("MOCK");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [enabled, setEnabled] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/super/settings/payment");
      setSettings(data);
      setEnvironment(data.environment || "MOCK");
      setClientId(data.client_id || "");
      setClientSecret("");
      setEnabled(!!data.enabled);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load payment settings");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        environment,
        client_id: clientId.trim(),
        client_secret: clientSecret ? clientSecret : null, // null = keep existing
        enabled,
      };
      const { data } = await api.post("/super/settings/payment", payload);
      setSettings(data);
      setClientSecret("");
      toast.success("Payment gateway settings saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const { data } = await api.post("/super/settings/payment/test");
      toast.success(data.message || `Cashfree reachable (${data.mode}, ${data.status_code || "ok"})`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Test failed");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <Card className="mt-3 p-6 text-sm text-muted-foreground">Loading…</Card>;
  }

  const isLive = environment !== "MOCK" && enabled;

  return (
    <div className="mt-3 grid gap-6 lg:grid-cols-3" data-testid="payment-gateway-section">
      <Card className="lg:col-span-2 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-emerald-600" />
              <h3 className="font-semibold text-lg">Cashfree subscriptions</h3>
              <Badge className={isLive ? "bg-emerald-600" : "bg-slate-500"} data-testid="payment-mode-badge">
                {isLive ? environment : "Mock mode"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Configure your Cashfree gateway credentials. Stored encrypted in the database;
              never written back to .env. Reads at request time so changes take effect immediately.
            </p>
          </div>
        </div>

        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 mb-5 flex gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-xs leading-relaxed">
            <div className="font-medium text-amber-900 dark:text-amber-200">
              Important — rotate any leaked keys
            </div>
            <div className="text-amber-800/80 dark:text-amber-200/80 mt-0.5">
              If you ever shared production keys in chat, in screenshots, or in commits, rotate them in your
              Cashfree dashboard (<span className="font-mono">Developers → API keys</span>) before saving here.
              Then paste the fresh keys into this form.
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <div>
            <Label className="text-xs">Environment</Label>
            <Select value={environment} onValueChange={setEnvironment}>
              <SelectTrigger className="mt-1.5" data-testid="payment-env-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MOCK">Mock (no real money — local testing)</SelectItem>
                <SelectItem value="SANDBOX">Sandbox (Cashfree test environment)</SelectItem>
                <SelectItem value="PROD">Production (live payments)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              {environment === "MOCK" && "No live calls are made. /api/billing/subscribe returns a fake auth link."}
              {environment === "SANDBOX" && "Uses sandbox.cashfree.com. Use test card numbers from Cashfree docs."}
              {environment === "PROD" && "Live mode — real customers will be charged. Verify keys via Test first."}
            </p>
          </div>

          <div>
            <Label className="text-xs" htmlFor="cf-client-id">Cashfree Client ID</Label>
            <Input
              id="cf-client-id"
              data-testid="payment-client-id-input"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="e.g. TEST123abc456..."
              className="mt-1.5 font-mono text-sm"
            />
          </div>

          <div>
            <Label className="text-xs" htmlFor="cf-client-secret">
              Cashfree Client Secret
              {settings?.has_client_secret && (
                <span className="ml-2 text-muted-foreground font-normal">
                  (current: <span className="font-mono">{settings.client_secret_preview}</span> — leave blank to keep)
                </span>
              )}
            </Label>
            <div className="relative mt-1.5">
              <Input
                id="cf-client-secret"
                data-testid="payment-client-secret-input"
                type={showSecret ? "text" : "password"}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={settings?.has_client_secret ? "•••• (unchanged)" : "Paste secret here"}
                className="font-mono text-sm pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowSecret(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                data-testid="toggle-secret-visibility"
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2.5">
            <div>
              <div className="text-sm font-medium">Enable gateway</div>
              <div className="text-[11px] text-muted-foreground">
                When off, BillingsEasy stays in mock mode regardless of environment.
              </div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="payment-enabled-switch" />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button onClick={save} disabled={saving} data-testid="payment-save-btn">
              <Save className="h-4 w-4 mr-1.5" /> {saving ? "Saving…" : "Save settings"}
            </Button>
            <Button variant="outline" onClick={test} disabled={testing} data-testid="payment-test-btn">
              <Plug className="h-4 w-4 mr-1.5" /> {testing ? "Testing…" : "Test connection"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5 h-fit">
        <h4 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
          <ShieldAlert className="h-4 w-4 text-amber-500" /> Current status
        </h4>
        <dl className="text-xs space-y-2.5">
          <Row label="Provider" value={settings?.provider || "cashfree"} />
          <Row label="Environment">
            <Badge className={isLive ? "bg-emerald-600" : "bg-slate-500"}>
              {settings?.environment || "MOCK"}
            </Badge>
          </Row>
          <Row label="Enabled">
            <Badge className={settings?.enabled ? "bg-emerald-600" : "bg-slate-400"}>
              {settings?.enabled ? "Yes" : "No"}
            </Badge>
          </Row>
          <Row label="Client ID" value={settings?.client_id || "—"} mono />
          <Row label="Secret stored" value={settings?.has_client_secret ? settings.client_secret_preview : "Not set"} mono />
          <Row label="Last updated">
            <div className="text-right">
              <div>{settings?.updated_at ? fmtDate(settings.updated_at) : "Never"}</div>
              {settings?.updated_by && (
                <div className="text-[10px] text-muted-foreground">{settings.updated_by}</div>
              )}
            </div>
          </Row>
        </dl>
        <div className="mt-4 pt-3 border-t text-[11px] text-muted-foreground leading-relaxed">
          The secret is encrypted with Fernet using a key derived from the server&apos;s
          <span className="font-mono"> JWT_SECRET</span>. It is never returned in plaintext through the API.
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, children, mono }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-right break-all" : "text-right"}>
        {children ?? value}
      </dd>
    </div>
  );
}

function LaunchOfferSettings() {
  const [data, setData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // form state
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [planCodes, setPlanCodes] = useState([]);
  const [discountPct, setDiscountPct] = useState(0);
  const [durationMonths, setDurationMonths] = useState(0);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const load = async () => {
    try {
      const [o, p] = await Promise.all([
        api.get("/super/settings/launch-offer"),
        api.get("/billing/plans"),
      ]);
      setData(o.data); setPlans(p.data.plans || []);
      setEnabled(!!o.data.enabled);
      setTitle(o.data.title || "");
      setDescription(o.data.description || "");
      setPlanCodes(o.data.plan_codes || []);
      setDiscountPct(o.data.discount_pct || 0);
      setDurationMonths(o.data.duration_months || 0);
      setStartsAt(o.data.starts_at ? o.data.starts_at.slice(0, 10) : "");
      setEndsAt(o.data.ends_at ? o.data.ends_at.slice(0, 10) : "");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const togglePlan = (code) => {
    setPlanCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        enabled, title: title.trim(), description: description.trim(),
        plan_codes: planCodes, discount_pct: parseInt(discountPct || 0),
        duration_months: parseInt(durationMonths || 0),
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt + "T23:59:59").toISOString() : null,
      };
      const { data: d } = await api.post("/super/settings/launch-offer", body);
      setData(d);
      toast.success(d.currently_active ? "Launch offer is now live" : "Launch offer saved (inactive)");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to save");
    } finally { setSaving(false); }
  };

  if (loading) return <Card className="mt-3 p-6 text-sm text-muted-foreground">Loading…</Card>;

  return (
    <div className="mt-3 grid gap-6 lg:grid-cols-3" data-testid="launch-offer-section">
      <Card className="lg:col-span-2 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <h3 className="font-semibold text-lg">Launch / Promotional offer</h3>
              <Badge className={data?.currently_active ? "bg-emerald-600" : "bg-slate-500"}>
                {data?.currently_active ? "LIVE" : "OFF"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Show a discount banner on the public landing &amp; in-app billing pages.
              Outside the start/end window the offer is hidden automatically.
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2.5">
            <div>
              <div className="text-sm font-medium">Enable offer</div>
              <div className="text-[11px] text-muted-foreground">Master toggle. Window dates still apply.</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="offer-enabled-switch" />
          </div>

          <div>
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Launch Offer 🎉"
                   className="mt-1.5" data-testid="offer-title-input" />
          </div>

          <div>
            <Label className="text-xs">Description / banner text</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)}
                   placeholder="Growth Plan ₹699/month for the first 3 months"
                   className="mt-1.5" data-testid="offer-description-input" />
          </div>

          <div>
            <Label className="text-xs">Applies to plans</Label>
            <div className="mt-1.5 grid sm:grid-cols-2 gap-1.5">
              {plans.filter(p => p.amount > 0).map(p => (
                <label key={p.code} className="flex items-center gap-2 text-sm rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/40">
                  <input type="checkbox"
                         checked={planCodes.includes(p.code)}
                         onChange={() => togglePlan(p.code)}
                         data-testid={`offer-plan-${p.code}`} />
                  <span className="font-mono text-xs">{p.code}</span>
                  <span className="text-muted-foreground text-xs ml-auto">{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Discount %</Label>
              <Input type="number" min={0} max={100} value={discountPct}
                     onChange={(e) => setDiscountPct(e.target.value)}
                     className="mt-1.5" data-testid="offer-discount-input" />
            </div>
            <div>
              <Label className="text-xs">Duration (billing cycles)</Label>
              <Input type="number" min={0} value={durationMonths}
                     onChange={(e) => setDurationMonths(e.target.value)}
                     className="mt-1.5" data-testid="offer-duration-input" />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Starts</Label>
              <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)}
                     className="mt-1.5" data-testid="offer-starts-input" />
            </div>
            <div>
              <Label className="text-xs">Ends</Label>
              <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)}
                     className="mt-1.5" data-testid="offer-ends-input" />
            </div>
          </div>

          <div className="pt-2">
            <Button onClick={save} disabled={saving} data-testid="offer-save-btn">
              <Save className="h-4 w-4 mr-1.5" /> {saving ? "Saving…" : "Save offer"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5 h-fit">
        <h4 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-amber-500" /> Live preview
        </h4>
        {(enabled && (title || description)) ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
            <div className="font-semibold text-amber-900 dark:text-amber-200">{title || "Launch Offer"}</div>
            <div className="text-amber-800/80 dark:text-amber-200/80 mt-1 text-xs leading-relaxed">
              {description || `${discountPct}% off for ${durationMonths} months`}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No banner — toggle on and add a title/description.</div>
        )}
        <dl className="text-xs space-y-2 mt-4 pt-3 border-t">
          <Row label="Status">
            <Badge className={data?.currently_active ? "bg-emerald-600" : "bg-slate-500"}>
              {data?.currently_active ? "Live" : "Off"}
            </Badge>
          </Row>
          <Row label="Plans" value={data?.plan_codes?.length ? data.plan_codes.join(", ") : "—"} mono />
          <Row label="Discount" value={`${data?.discount_pct || 0}%`} />
          <Row label="Duration" value={`${data?.duration_months || 0} cycles`} />
          <Row label="Updated" value={data?.updated_at ? fmtDate(data.updated_at) : "Never"} />
        </dl>
      </Card>
    </div>
  );
}
