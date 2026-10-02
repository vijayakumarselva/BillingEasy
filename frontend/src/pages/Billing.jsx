// Plan & Billing — current plan, what it covers, AI credits, invoices,
// referrals. Everything here is driven by /subscription and /pricing, so it
// follows whatever the super admin has priced.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { API_BASE } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import {
  Sparkles, Check, Star, AlertTriangle, Clock, Download, Copy, Gift,
  Building2, Users, Smartphone, Lock, ArrowRight, Loader2,
} from "lucide-react";

const inr = (paise) => "₹" + Math.round((paise || 0) / 100).toLocaleString("en-IN");
const inrExact = (paise) =>
  "₹" + ((paise || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });

function Stat({ icon: Icon, label, used, cap, hint }) {
  const unlimited = cap === -1;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, cap)) * 100));
  const full = !unlimited && used >= cap;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="text-xl font-bold">
        {used}
        <span className="text-sm font-normal text-muted-foreground">
          {unlimited ? " / unlimited" : ` of ${cap}`}
        </span>
      </div>
      {!unlimited && (
        <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
          <div
            className={`h-full rounded-full ${full ? "bg-amber-500" : "bg-blue-600"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {hint && <p className="text-[11px] text-muted-foreground mt-1.5">{hint}</p>}
    </Card>
  );
}

export default function Billing() {
  const [sub, setSub] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [yearly, setYearly] = useState(true);
  const [coupon, setCoupon] = useState("");
  const [gstin, setGstin] = useState("");
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState("plan");
  const [params, setParams] = useSearchParams();

  const load = async () => {
    const [s, p, l] = await Promise.all([
      api.get("/subscription"),
      api.get("/pricing"),
      api.get("/subscription/credits").catch(() => ({ data: { ledger: [] } })),
    ]);
    setSub(s.data);
    setPricing(p.data);
    setLedger(l.data.ledger || []);
    if (!gstin) setGstin(s.data.gstin || "");
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Coming back from the gateway: confirm the payment, then refresh.
  useEffect(() => {
    const orderId = params.get("order_id");
    if (!orderId) return;
    (async () => {
      setBusy("verify");
      try {
        const { data } = await api.post(`/billing/verify/${orderId}`);
        if (data.status === "paid") {
          toast.success(
            data.tax_invoice_no
              ? `Payment received — tax invoice ${data.tax_invoice_no}`
              : "Payment received");
        } else {
          toast.info("That payment has not completed yet.");
        }
      } catch (e) {
        toast.error(e.response?.data?.detail || "Could not confirm the payment");
      } finally {
        setBusy("");
        params.delete("order_id");
        setParams(params, { replace: true });
        load();
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (params.get("tab") === "credits") setTab("credits");
  }, [params]);

  const getQuote = async (body) => {
    try {
      const { data } = await api.post("/billing/quote", { ...body, coupon, gstin });
      setQuote({ ...data, _request: body });
      return data;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not price that");
      return null;
    }
  };

  const checkout = async (body) => {
    setBusy("checkout");
    try {
      const { data } = await api.post("/billing/checkout", { ...body, coupon, gstin });
      if (data.mock) {
        // No live gateway configured — confirm straight away so testing works.
        const v = await api.post(`/billing/verify/${data.order_id}`);
        toast.success(
          v.data.tax_invoice_no
            ? `Activated — tax invoice ${v.data.tax_invoice_no}`
            : "Activated");
        setQuote(null);
        await load();
      } else if (data.pay_url) {
        window.location.href = data.pay_url;
      } else if (data.session_id) {
        toast.info("Opening the payment page…");
        window.location.href = `${API_BASE}/billing/redirect/${data.order_id}`;
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not start the payment");
    } finally {
      setBusy("");
    }
  };

  const downgrade = async (code) => {
    try {
      const { data } = await api.post("/billing/downgrade", { plan_code: code });
      toast.success(data.message);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not schedule that change");
    }
  };

  if (!sub || !pricing)
    return <div className="p-8 text-center text-muted-foreground">Loading your plan…</div>;

  const currentTier = sub.plan.tier;
  const credits = sub.credits;
  const founding = pricing.founding;

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold">Plan &amp; Billing</h1>
        <p className="text-sm text-muted-foreground">
          One plan covers every business under this login.
        </p>
      </div>

      {/* Status banners */}
      {sub.in_grace && (
        <Card className="p-4 border-amber-300 bg-amber-50 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900 text-sm">
              Your plan expired — you have {sub.days_left} day
              {sub.days_left === 1 ? "" : "s"} of full access left.
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Renew before {fmtDate(sub.grace_ends_at)} and nothing changes. After that the
              account moves to Free; your data stays, but businesses beyond the Free limit
              become read-only.
            </p>
          </div>
        </Card>
      )}
      {sub.status === "trialing" && (
        <Card className="p-4 border-blue-200 bg-blue-50 flex items-start gap-3">
          <Clock className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-900">
            <span className="font-semibold">
              {sub.days_left} day{sub.days_left === 1 ? "" : "s"} left of your free{" "}
              {sub.plan.name} trial.
            </span>{" "}
            No card needed — pick a plan whenever you are ready.
          </p>
        </Card>
      )}
      {sub.pending_plan_code && (
        <Card className="p-4 border-slate-300 bg-slate-50 flex items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-semibold">
              {pricing.tiers.find((t) => t.yearly_code === sub.pending_plan_code)?.name ||
                sub.pending_plan_code}
            </span>{" "}
            starts on {fmtDate(sub.current_period_end)}.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await api.post("/billing/cancel-downgrade");
              toast.success("Change called off — you stay on your current plan");
              load();
            }}
          >
            Call it off
          </Button>
        </Card>
      )}
      {sub.readonly_businesses?.length > 0 && (
        <Card className="p-4 border-rose-200 bg-rose-50">
          <p className="text-sm font-semibold text-rose-900">
            {sub.readonly_businesses.length} business
            {sub.readonly_businesses.length === 1 ? " is" : "es are"} read-only on this plan
          </p>
          <p className="text-xs text-rose-700 mt-1">
            {sub.readonly_businesses.map((b) => b.name).join(", ")} — nothing has been deleted.
            Upgrade, buy the extra-business add-on, or choose which ones stay active.
          </p>
        </Card>
      )}

      {/* Current plan */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{sub.plan.name}</h2>
              {sub.founding_member && (
                <Badge className="bg-amber-100 text-amber-800 border-amber-300 gap-1">
                  <Star className="h-3 w-3" /> Founding member
                </Badge>
              )}
              <Badge variant="outline" className="capitalize">{sub.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {sub.plan.paise
                ? `${inr(sub.plan.renewal_paise ?? sub.plan.paise)} / ${sub.plan.interval} + ${pricing.gst_pct}% GST`
                : "Free forever"}
              {sub.current_period_end &&
                ` · ${sub.cancel_at_period_end ? "access until" : "renews"} ${fmtDate(sub.current_period_end)}`}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">AI credits</div>
            <div className="text-2xl font-bold">{credits.total.toLocaleString("en-IN")}</div>
            <div className="text-[11px] text-muted-foreground">
              {credits.plan.toLocaleString("en-IN")} from plan ·{" "}
              {credits.pack.toLocaleString("en-IN")} purchased
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          <Stat icon={Building2} label="Businesses" used={sub.usage.businesses}
                cap={sub.limits.businesses} />
          <Stat icon={Users} label="Users" used={sub.usage.users} cap={sub.limits.users} />
          <Stat icon={Smartphone} label="Devices" used={sub.usage.devices}
                cap={sub.limits.devices} />
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
              <Sparkles className="h-3.5 w-3.5" /> AI credits
            </div>
            <div className="text-xl font-bold">{credits.total.toLocaleString("en-IN")}</div>
            {credits.low && (
              <p className="text-[11px] text-amber-600 font-medium mt-1.5">
                Running low — top up below
              </p>
            )}
          </Card>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {[["plan", "Plans"], ["credits", "AI credits"], ["invoices", "Billing history"],
          ["referral", "Refer & earn"]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "plan" && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="inline-flex bg-muted rounded-lg p-1">
              {[["Monthly", false], ["Yearly", true]].map(([l, v]) => (
                <button
                  key={l}
                  onClick={() => setYearly(v)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    yearly === v ? "bg-background shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  {l}
                  {v && (
                    <span className="ml-1.5 text-[11px] text-emerald-600 font-semibold">
                      save {pricing.max_yearly_save_pct}%
                    </span>
                  )}
                </button>
              ))}
            </div>
            {founding?.spots_left > 0 && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                Founding offer — {founding.spots_left} of {founding.seats} spots left
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {pricing.tiers.map((t) => {
              // On a trial or on Free nothing has been bought yet, so every paid
              // tier is a purchase — including the one being trialled.
              const onPaidPlan = sub.is_paid;
              const isCurrent = t.tier === currentTier && onPaidPlan;
              const isTrialOfThis = t.tier === currentTier && sub.status === "trialing";
              const price = yearly ? t.yearly_paise : t.monthly_paise;
              const code = yearly ? t.yearly_code : t.monthly_code;
              const foundingHere =
                founding && founding.tier === t.tier && yearly && founding.spots_left > 0;
              const tierOrder = pricing.tiers.map((x) => x.tier);
              // A downgrade is only possible from a plan actually paid for.
              const isDown = onPaidPlan &&
                tierOrder.indexOf(t.tier) < tierOrder.indexOf(currentTier);
              const isFree = t.tier === "FREE";
              return (
                <Card
                  key={t.tier}
                  className={`p-5 flex flex-col ${
                    t.highlight ? "border-blue-500 shadow-lg" : ""
                  } ${isCurrent ? "ring-2 ring-blue-600" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold">{t.name}</h3>
                    {isCurrent && <Badge variant="outline">Current</Badge>}
                    {isTrialOfThis && <Badge variant="outline">On trial</Badge>}
                    {!isCurrent && !isTrialOfThis && t.badge && (
                      <Badge className="bg-blue-600 text-white">{t.badge}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 min-h-[32px]">{t.tagline}</p>
                  <div className="mt-3 mb-4">
                    <span className="text-2xl font-extrabold">
                      {foundingHere ? inr(founding.yearly_paise) : inr(price)}
                    </span>
                    {t.tier !== "FREE" && (
                      <span className="text-xs text-muted-foreground">
                        {" "}/{yearly ? "yr" : "mo"} + GST
                      </span>
                    )}
                  </div>
                  <ul className="space-y-1.5 text-[13px] flex-1">
                    <li className="flex gap-1.5">
                      <Check className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                      {t.limits.businesses === -1 ? "Unlimited" : t.limits.businesses} business
                      {t.limits.businesses !== 1 ? "es" : ""}
                    </li>
                    <li className="flex gap-1.5">
                      <Check className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                      {t.limits.users} user{t.limits.users !== 1 ? "s" : ""}
                    </li>
                    <li className="flex gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-violet-500 mt-0.5 shrink-0" />
                      {t.credits_per_year
                        ? `${t.credits_per_year.toLocaleString("en-IN")} credits/yr`
                        : `${t.signup_credits} credits once`}
                    </li>
                    {t.feature_labels.slice(3).map((f) => (
                      <li key={f} className="flex gap-1.5 text-muted-foreground">
                        <Check className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {!isCurrent && (
                    <Button
                      className="w-full mt-4"
                      variant={t.highlight || isTrialOfThis ? "default" : "outline"}
                      disabled={busy === "checkout" || (isFree && !onPaidPlan)}
                      onClick={() =>
                        isFree || isDown
                          ? downgrade(code)
                          : getQuote({ plan_code: code, kind: "plan" })
                      }
                    >
                      {isFree
                        ? onPaidPlan
                          ? "Move to Free"
                          : "You are on Free"
                        : isDown
                        ? "Switch at renewal"
                        : isTrialOfThis
                        ? `Keep ${t.name}`
                        : `Choose ${t.name}`}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Add-ons */}
          <Card className="p-5">
            <h3 className="font-semibold mb-3">Add-ons</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pricing.addons.map((a) => {
                const allowed = a.available_on.includes(currentTier);
                const owned = sub.addons?.[a.code] || 0;
                return (
                  <div
                    key={a.code}
                    className="border rounded-lg p-4 flex items-start justify-between gap-3"
                  >
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        {a.name}
                        {owned > 0 && <Badge variant="outline">{owned} active</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
                      {!allowed && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Available on {a.available_on.join(" and ")}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-sm">{inr(a.yearly_paise)}</div>
                      <div className="text-[10px] text-muted-foreground mb-1.5">per year</div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!allowed}
                        onClick={() => getQuote({ kind: "addon", addon_code: a.code, quantity: 1 })}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      {tab === "credits" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {pricing.packs.map((p) => (
              <Card key={p.code} className="p-5 text-center">
                {p.badge && <Badge className="bg-violet-600 text-white mb-2">{p.badge}</Badge>}
                <div className="text-3xl font-extrabold">
                  {p.credits.toLocaleString("en-IN")}
                </div>
                <div className="text-xs text-muted-foreground">credits · never expire</div>
                <div className="text-lg font-bold text-blue-600 mt-2">{inr(p.paise)}</div>
                <div className="text-[11px] text-muted-foreground">
                  ₹{(p.paise / 100 / p.credits).toFixed(2)} per scan
                </div>
                <Button
                  className="w-full mt-3"
                  size="sm"
                  onClick={() => getQuote({ kind: "pack", pack_code: p.code, quantity: 1 })}
                >
                  Buy
                </Button>
              </Card>
            ))}
          </div>
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b font-semibold text-sm">Credit history</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">When</th>
                    <th className="px-4 py-2 text-left">What</th>
                    <th className="px-4 py-2 text-left">From</th>
                    <th className="px-4 py-2 text-right">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                        Nothing yet — your first AI scan will show up here.
                      </td>
                    </tr>
                  )}
                  {ledger.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                        {fmtDate(r.created_at)}
                      </td>
                      <td className="px-4 py-2">{r.reason}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground capitalize">
                        {r.source === "plan" ? "Plan allowance" : "Purchased"}
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-medium ${
                          r.delta > 0 ? "text-emerald-600" : "text-slate-600"
                        }`}
                      >
                        {r.delta > 0 ? "+" : ""}
                        {r.delta}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {tab === "invoices" && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b font-semibold text-sm">
            GST tax invoices for your subscription
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Invoice</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">For</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(sub.payments || []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                      No payments yet.
                    </td>
                  </tr>
                )}
                {(sub.payments || []).map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{p.tax_invoice_no || "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {fmtDate(p.paid_at || p.created_at)}
                    </td>
                    <td className="px-4 py-2">{p.description}</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {inrExact(p.total_paise)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {p.tax_invoice_id && (
                        <a
                          href={`${API_BASE}/billing/invoices/${p.tax_invoice_id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline inline-flex items-center gap-1 text-xs"
                        >
                          <Download className="h-3 w-3" /> PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "referral" && (
        <Card className="p-6 text-center">
          <Gift className="h-8 w-8 text-violet-500 mx-auto mb-3" />
          <h3 className="font-bold text-lg">Give 200 credits, get 200 credits</h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
            Share your code. When someone signs up with it and makes their first payment, you
            both get 200 AI credits that never expire.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 bg-muted rounded-lg px-4 py-2.5">
            <code className="font-mono font-bold tracking-wider">{sub.referral_code}</code>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                navigator.clipboard?.writeText(
                  `${window.location.origin}/register?ref=${sub.referral_code}`);
                toast.success("Invite link copied");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Card>
      )}

      {/* Checkout summary */}
      {quote && (
        <Card className="p-5 border-blue-300 bg-blue-50/40">
          <h3 className="font-semibold mb-3">{quote.description}</h3>
          <div className="space-y-1.5 text-sm max-w-md">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span>{inrExact(quote.base_paise)}</span>
            </div>
            {quote.lines.map((l, i) => (
              <div key={i} className="flex justify-between text-xs text-emerald-700">
                <span>{l.label}</span>
                <span>{l.note}</span>
              </div>
            ))}
            {quote.discount_paise > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount</span>
                <span>−{inrExact(quote.discount_paise)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>GST ({quote.gst_pct}%)</span>
              <span>{inrExact(quote.gst_paise)}</span>
            </div>
            <div className="flex justify-between font-bold text-base pt-2 border-t">
              <span>Total</span>
              <span>{inrExact(quote.total_paise)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4 max-w-md">
            <Input
              placeholder="Coupon code"
              value={coupon}
              onChange={(e) => setCoupon(e.target.value.toUpperCase())}
              onBlur={() => getQuote(quote._request)}
              className="w-40"
            />
            <Input
              placeholder="Your GSTIN (for input credit)"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              className="flex-1 min-w-[220px]"
            />
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="ghost" onClick={() => setQuote(null)}>Cancel</Button>
            <Button
              className="gap-1.5"
              disabled={busy === "checkout"}
              onClick={() => checkout(quote._request)}
            >
              {busy === "checkout" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Pay {inrExact(quote.total_paise)} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
