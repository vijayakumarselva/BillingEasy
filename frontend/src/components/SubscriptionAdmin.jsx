// Super-admin view of the subscription business: who is on what, what they
// have paid, manual grants, coupons and the revenue dashboard.
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { Search, Gift, Ticket, TrendingUp, Loader2, Unlock, X } from "lucide-react";

const inr = (paise) => "₹" + Math.round((paise || 0) / 100).toLocaleString("en-IN");

function Metric({ label, value, sub }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}

export function RevenueDashboard() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/super/revenue").then((r) => setD(r.data)); }, []);
  if (!d) return <div className="p-6 text-muted-foreground text-sm">Loading…</div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="MRR" value={d.mrr_label} sub="recurring, monthly equivalent" />
        <Metric label="ARR" value={d.arr_label} />
        <Metric label="Paying accounts" value={d.paid_accounts}
                sub={`${d.trialing} trialing · ${d.free} free`} />
        <Metric label="Free → paid" value={`${d.conversion_pct}%`}
                sub={`${d.total_accounts} accounts in total`} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Subscription revenue" value={d.subscription_revenue_label}
                sub="plans and add-ons, all time" />
        <Metric label="Credit-pack revenue" value={d.pack_revenue_label} sub="all time" />
        <Metric label="Churn" value={`${d.churn_pct}%`}
                sub={`${d.churn_pending} set to not renew`} />
        <Metric label="Founding spots left" value={d.founding_spots_left ?? "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Paying accounts by plan
          </h4>
          {Object.keys(d.by_plan).length === 0 && (
            <p className="text-sm text-muted-foreground">No paid accounts yet.</p>
          )}
          {Object.entries(d.by_plan).map(([name, n]) => (
            <div key={name} className="flex justify-between text-sm py-1 border-b last:border-0">
              <span>{name}</span>
              <span className="font-medium">{n}</span>
            </div>
          ))}
        </Card>
        <Card className="p-4">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Gift className="h-4 w-4" /> Top referrers
          </h4>
          {d.top_referrers.length === 0 && (
            <p className="text-sm text-muted-foreground">No conversions yet.</p>
          )}
          {d.top_referrers.map((r) => (
            <div key={r.code} className="flex justify-between text-sm py-1 border-b last:border-0">
              <span>{r.name || r.email || r.code}</span>
              <span className="text-muted-foreground">
                {r.converted} paid · {r.credits_awarded} credits
              </span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

export function SubscriptionList() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [grant, setGrant] = useState(null);
  const [override, setOverride] = useState(null);
  // The plan list comes from the live catalogue, so nobody has to remember codes.
  const [plans, setPlans] = useState([]);
  useEffect(() => {
    api.get("/pricing")
      .then((r) => {
        const out = [];
        for (const t of r.data.tiers || []) {
          if (t.yearly_code && t.tier !== "FREE")
            out.push({ code: t.yearly_code, label: `${t.name} — yearly (${t.yearly_label})` });
          if (t.monthly_code)
            out.push({ code: t.monthly_code, label: `${t.name} — monthly (${t.monthly_label})` });
        }
        out.push({ code: "FREE", label: "Free" });
        setPlans(out);
      })
      .catch(() => setPlans([]));
  }, []);

  const load = async (query = "") => {
    setBusy(true);
    const { data } = await api.get("/super/subscriptions", { params: { q: query } });
    setRows(data.rows);
    setBusy(false);
  };
  useEffect(() => { load(); }, []);

  const submitGrant = async () => {
    if (!grant.reason || grant.reason.length < 3)
      return toast.error("Please say why — it goes in the audit log");
    try {
      await api.post("/super/subscriptions/grant", {
        account_id: grant.account_id,
        plan_code: grant.plan_code || null,
        months: grant.months ? Number(grant.months) : null,
        credits: grant.credits ? Number(grant.credits) : null,
        reason: grant.reason,
      });
      toast.success("Granted");
      setGrant(null);
      load(q);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not apply that");
    }
  };

  // Unlock one feature or raise one cap for this account, free, without moving
  // them onto a plan they are not paying for.
  const openOverride = async (row) => {
    const { data } = await api.get(`/super/accounts/${row.account_id}/override`);
    setOverride({
      account_id: row.account_id,
      name: row.name || row.email,
      plan: data.plan,
      all: data.all_features,
      features: data.override?.features || [],
      limits: data.override?.limits || {},
      reason: data.override?.reason || "",
      expires_at: (data.override?.expires_at || "").slice(0, 10),
      existing: !!data.override,
    });
  };

  const saveOverride = async () => {
    if (!override.reason || override.reason.length < 3)
      return toast.error("Say why — it goes in the audit log");
    setBusy(true);
    try {
      await api.put(`/super/accounts/${override.account_id}/override`, {
        features: override.features,
        limits: Object.fromEntries(
          Object.entries(override.limits).filter(([, v]) => v !== "" && v != null)
            .map(([k, v]) => [k, Number(v)])),
        reason: override.reason,
        expires_at: override.expires_at ? `${override.expires_at}T23:59:59+00:00` : null,
      });
      toast.success(`Unlocked for ${override.name}`);
      setOverride(null);
      load(q);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not apply that");
    } finally {
      setBusy(false);
    }
  };

  const clearOverride = async () => {
    await api.delete(`/super/accounts/${override.account_id}/override`);
    toast.success("Override removed — back to their plan");
    setOverride(null);
    load(q);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name or email" value={q}
                 onChange={(e) => setQ(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && load(q)} />
        </div>
        <Button variant="outline" onClick={() => load(q)} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </Button>
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Customer</th>
              <th className="px-4 py-2 text-left">Plan</th>
              <th className="px-4 py-2 text-left">Renews</th>
              <th className="px-4 py-2 text-right">Businesses</th>
              <th className="px-4 py-2 text-right">Users</th>
              <th className="px-4 py-2 text-right">Credits</th>
              <th className="px-4 py-2 text-right">Paid</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                No accounts match.
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.account_id} className="border-t">
                <td className="px-4 py-2">
                  <div className="font-medium">{r.name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.email}</div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    {r.plan_name}
                    {r.founding_member && (
                      <Badge variant="outline" className="text-[10px]">Founding</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">{r.status}</div>
                </td>
                <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                  {r.current_period_end ? fmtDate(r.current_period_end) : "—"}
                  {r.days_left > 0 && (
                    <span className="text-xs"> · {r.days_left}d</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">{r.usage.businesses}</td>
                <td className="px-4 py-2 text-right">{r.usage.users}</td>
                <td className="px-4 py-2 text-right">{r.credits.toLocaleString("en-IN")}</td>
                <td className="px-4 py-2 text-right font-medium">{inr(r.revenue_paise)}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" className="gap-1"
                          onClick={() => openOverride(r)} title="Unlock a feature for free">
                    <Unlock className="h-3.5 w-3.5" /> Unlock
                  </Button>
                  <Button size="sm" variant="outline"
                          onClick={() => setGrant({ account_id: r.account_id, reason: "",
                                                    name: r.name || r.email })}>
                    Grant plan
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {override && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4"
             onClick={() => setOverride(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <Card className="relative w-full max-w-lg p-5 max-h-[88vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg">Unlock for free</h3>
                <p className="text-sm text-muted-foreground">
                  {override.name} · on {override.plan?.name}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setOverride(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              This adds to their plan without changing it, so their renewal price stays the
              same. It can only give more, never less.
            </p>

            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Features</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {Object.entries(override.all || {}).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={override.features.includes(key)}
                      onChange={(e) =>
                        setOverride((o) => ({
                          ...o,
                          features: e.target.checked
                            ? [...o.features, key]
                            : o.features.filter((f) => f !== key),
                        }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Raise a limit (leave blank to keep the plan's)
              </p>
              <div className="grid grid-cols-3 gap-2">
                {["businesses", "users", "devices"].map((k) => (
                  <div key={k}>
                    <label className="text-[11px] text-muted-foreground capitalize">{k}</label>
                    <Input
                      type="number"
                      placeholder="—"
                      value={override.limits[k] ?? ""}
                      onChange={(e) =>
                        setOverride((o) => ({ ...o, limits: { ...o.limits, [k]: e.target.value } }))}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Use -1 for unlimited.</p>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Ends on (optional)
                </label>
                <Input type="date" value={override.expires_at}
                       onChange={(e) => setOverride((o) => ({ ...o, expires_at: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Reason (logged)</label>
                <Input value={override.reason} placeholder="Pilot customer, agreed with owner"
                       onChange={(e) => setOverride((o) => ({ ...o, reason: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              {override.existing && (
                <Button variant="ghost" className="text-rose-600" onClick={clearOverride}>
                  Remove override
                </Button>
              )}
              <div className="flex-1" />
              <Button variant="ghost" onClick={() => setOverride(null)}>Cancel</Button>
              <Button disabled={busy} onClick={saveOverride} className="gap-1.5">
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Unlock
              </Button>
            </div>
          </Card>
        </div>
      )}

      {grant && (
        <Card className="p-4 border-blue-300">
          <h4 className="font-semibold text-sm mb-3">Grant to {grant.name}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground">Plan</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background h-10"
                value={grant.plan_code || ""}
                onChange={(e) => setGrant({ ...grant, plan_code: e.target.value })}
              >
                <option value="">No plan change</option>
                {plans.map((p) => (
                  <option key={p.code} value={p.code}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">
                For how long
              </label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background h-10"
                value={grant.months || ""}
                onChange={(e) => setGrant({ ...grant, months: e.target.value })}
              >
                <option value="">Plan's own period</option>
                {[1, 3, 6, 12, 24].map((m) => (
                  <option key={m} value={m}>{m} month{m === 1 ? "" : "s"}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">AI scans</label>
              <Input placeholder="e.g. 500" type="number" value={grant.credits || ""}
                     onChange={(e) => setGrant({ ...grant, credits: e.target.value })} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Reason (logged)</label>
              <Input placeholder="Pilot customer, agreed with owner" value={grant.reason}
                     onChange={(e) => setGrant({ ...grant, reason: e.target.value })} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            A granted plan costs the customer nothing and renews at the normal price when it
            runs out. To unlock just one feature instead, use Unlock.
          </p>
          <div className="flex gap-2 mt-3">
            <Button variant="ghost" size="sm" onClick={() => setGrant(null)}>Cancel</Button>
            <Button size="sm" onClick={submitGrant}>Apply grant</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

export function CouponAdmin() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ code: "", kind: "percent", value: 10,
                                     usage_cap: "", first_purchase_only: false });
  const load = () => api.get("/super/coupons").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await api.post("/super/coupons", {
        code: form.code, kind: form.kind, value: Number(form.value),
        usage_cap: form.usage_cap ? Number(form.usage_cap) : null,
        first_purchase_only: form.first_purchase_only,
        applies_to: ["plan", "addon", "pack"],
      });
      toast.success(`Coupon ${form.code.toUpperCase()} created`);
      setForm({ ...form, code: "" });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not create that coupon");
    }
  };

  const toggle = async (c) => {
    await api.put(`/super/coupons/${c.code}`, { active: !c.active });
    load();
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Ticket className="h-4 w-4" /> New coupon
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Input placeholder="CODE" value={form.code}
                 onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          <select className="border rounded-md px-3 text-sm bg-background" value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="percent">% off</option>
            <option value="flat">₹ off (paise)</option>
          </select>
          <Input type="number" placeholder="Value" value={form.value}
                 onChange={(e) => setForm({ ...form, value: e.target.value })} />
          <Input type="number" placeholder="Max uses" value={form.usage_cap}
                 onChange={(e) => setForm({ ...form, usage_cap: e.target.value })} />
          <Button onClick={create} disabled={!form.code}>Create</Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
          <input type="checkbox" checked={form.first_purchase_only}
                 onChange={(e) => setForm({ ...form, first_purchase_only: e.target.checked })} />
          First purchase only
        </label>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Code</th>
              <th className="px-4 py-2 text-left">Discount</th>
              <th className="px-4 py-2 text-left">Used</th>
              <th className="px-4 py-2 text-left">Valid to</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                No coupons yet.
              </td></tr>
            )}
            {rows.map((c) => (
              <tr key={c.code} className="border-t">
                <td className="px-4 py-2 font-mono font-medium">
                  {c.code}{" "}
                  {!c.active && <Badge variant="outline" className="ml-1">off</Badge>}
                </td>
                <td className="px-4 py-2">
                  {c.kind === "percent" ? `${c.value}%` : inr(c.value)}
                  {c.first_purchase_only && (
                    <span className="text-xs text-muted-foreground"> · first purchase</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {c.used_count}{c.usage_cap ? ` / ${c.usage_cap}` : ""}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {c.valid_to ? fmtDate(c.valid_to) : "no expiry"}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => toggle(c)}>
                    {c.active ? "Turn off" : "Turn on"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
