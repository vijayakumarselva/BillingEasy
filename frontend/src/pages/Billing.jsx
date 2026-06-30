// In-app billing page — uses the same Pricing component as the public landing.
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShieldCheck, X, AlertTriangle, RefreshCcw } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { PricingGrid, LaunchOfferBanner, AddonsBlock, TrustSection } from "@/components/Pricing";

export default function Billing() {
  const { currentOrg, currentRole, refreshOrgs } = useAuth();
  const [pricing, setPricing] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [params] = useSearchParams();
  const nav = useNavigate();

  const load = async () => {
    const [pub, st] = await Promise.all([
      api.get("/public/pricing"),
      api.get("/billing/status"),
    ]);
    setPricing(pub.data);
    setStatus(st.data);
  };
  useEffect(() => { load(); }, []);

  // Auto-trigger subscribe if ?plan=... was passed (from signup/landing CTA)
  useEffect(() => {
    const code = params.get("plan");
    if (code && status && pricing && currentRole === "owner") {
      const tier = pricing.tiers.find(t => t.monthly_code === code || t.yearly_code === code);
      if (tier && !tier.is_custom) {
        if (tier.yearly_code === code) setBillingCycle("yearly");
        startCheckout(code);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricing, status]);

  const startCheckout = async (planCode) => {
    if (currentRole !== "owner") { toast.error("Only the owner can manage billing"); return; }
    setBusy(planCode);
    try {
      const { data } = await api.post("/billing/subscribe", { plan_code: planCode });
      if (data.auth_link) window.location.href = data.auth_link;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to start checkout");
    } finally { setBusy(null); }
  };

  const cancel = async () => {
    if (!window.confirm("Cancel your subscription? You'll keep access until the current period ends.")) return;
    try {
      await api.post("/billing/cancel");
      toast.success("Subscription cancelled");
      await load(); refreshOrgs();
    } catch { toast.error("Failed"); }
  };

  if (!status || !currentOrg) return null;
  const isOwner = currentRole === "owner";

  return (
    <div className="space-y-8" data-testid="billing-page">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Billing & Plan</h1>
        <p className="text-sm text-muted-foreground mt-1">Subscription for <span className="font-medium text-foreground">{currentOrg.name}</span></p>
      </div>

      {/* Legacy plan banner — force re-pick */}
      {status.needs_replan && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-5 flex items-start gap-3" data-testid="needs-replan-banner">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-amber-900 dark:text-amber-200">Your plan needs an update</div>
            <p className="text-sm text-amber-800/85 dark:text-amber-200/85 mt-1">
              We've moved to a new pricing structure. Your current plan <span className="font-mono">{status.plan_code || "—"}</span> is no longer offered. Please pick a new plan below to keep using premium features.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => document.getElementById("plans")?.scrollIntoView({ behavior: "smooth" })} data-testid="replan-cta">
            <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Choose plan
          </Button>
        </div>
      )}

      {/* Status card */}
      <Card className="p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Current status</div>
            <div className="flex items-center gap-3">
              <StatusBadge status={status.status} />
              {status.plan_code && (
                <span className="text-sm text-muted-foreground">
                  on plan <span className="font-mono-fin">{status.plan_code}</span>
                  {status.needs_replan && <Badge variant="outline" className="ml-2 text-[10px] border-amber-500 text-amber-700">legacy</Badge>}
                </span>
              )}
            </div>
            <div className="mt-3 text-sm">
              {status.status === "trialing" && (
                <>Trial ends <span className="font-mono-fin">{fmtDate(status.trial_ends_at)}</span> — <span className="text-amber-600 font-semibold">{status.days_left} day(s) left</span></>
              )}
              {status.status === "active" && (
                <>Renews on <span className="font-mono-fin">{fmtDate(status.current_period_end)}</span></>
              )}
              {status.status === "trial_expired" && <span className="text-rose-600 font-semibold">Trial expired — please subscribe to continue.</span>}
              {status.status === "expired" && <span className="text-rose-600 font-semibold">Subscription expired — please renew.</span>}
              {status.status === "past_due" && <span className="text-rose-600 font-semibold">Last payment failed — please retry.</span>}
              {status.status === "cancelled" && <span className="text-muted-foreground">Subscription cancelled.</span>}
            </div>
          </div>
          {status.status === "active" && isOwner && !status.needs_replan && (
            <Button variant="outline" onClick={cancel} data-testid="cancel-sub-button">
              <X className="h-4 w-4 mr-1.5" /> Cancel subscription
            </Button>
          )}
        </div>

        {status.limits && status.usage && (
          <div className="grid sm:grid-cols-3 gap-3 mt-5 pt-5 border-t border-border" data-testid="usage-bars">
            <UsageBar label="Team members" used={status.usage.users} cap={status.limits.users} />
            <UsageBar label="Invoices this month" used={status.usage.invoices_this_month} cap={status.limits.invoices_per_month} />
            <UsageBar label="Products" used={status.usage.products} cap={status.limits.products} />
          </div>
        )}
      </Card>

      {/* Launch offer banner */}
      {pricing?.launch_offer?.active && <LaunchOfferBanner offer={pricing.launch_offer} />}

      {/* Plans */}
      <div id="plans" className="space-y-4">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Choose your plan</h2>
          <p className="text-sm text-muted-foreground mt-1">All plans include the 10 core modules. Upgrade for more users, branches & integrations.</p>
        </div>
        <PricingGrid
          pricing={pricing}
          billingCycle={billingCycle}
          setBillingCycle={setBillingCycle}
          currentCode={status.plan_code}
          ownerOnly={!isOwner}
          onChoose={(tier, code) => {
            if (tier.is_custom) { window.location.href = "mailto:sales@billingseasy.com?subject=Enterprise%20enquiry"; return; }
            if (!isOwner) { toast.error("Only the owner can manage billing"); return; }
            startCheckout(code);
          }}
        />
        {!isOwner && <p className="text-center text-xs text-muted-foreground">Only the owner can change the plan.</p>}
        {busy && <p className="text-center text-xs text-blue-600">Redirecting to checkout…</p>}
      </div>

      {/* Add-ons */}
      <AddonsBlock addons={pricing?.addons || []} />

      {/* Trust */}
      <TrustSection />

      <Card className="p-5">
        <div className="flex items-start gap-3 text-sm text-muted-foreground">
          <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-foreground mb-1">Secure payments via Cashfree</div>
            UPI · Cards · Netbanking · Wallets. Auto-renewing mandate. Cancel anytime; access continues until the current period ends.
          </div>
        </div>
      </Card>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    trialing: { label: "Trial", className: "bg-amber-500" },
    active: { label: "Active", className: "bg-emerald-600" },
    pending_authorisation: { label: "Pending auth", className: "bg-slate-500" },
    past_due: { label: "Past due", className: "bg-rose-600" },
    trial_expired: { label: "Trial expired", className: "bg-rose-600" },
    expired: { label: "Expired", className: "bg-rose-600" },
    cancelled: { label: "Cancelled", className: "bg-slate-500" },
    suspended: { label: "Suspended", className: "bg-rose-700" },
  };
  const v = map[status] || map.cancelled;
  return <Badge className={v.className}>{v.label}</Badge>;
}

function UsageBar({ label, used, cap }) {
  const unlimited = cap === -1;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(cap, 1)) * 100));
  const overWarn = pct >= 80;
  return (
    <div className="rounded-md border border-border p-3" data-testid={`usage-${label.replace(/\s+/g, '-').toLowerCase()}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono-fin">{used} {unlimited ? <span className="text-emerald-600">/ ∞</span> : <span className="text-muted-foreground">/ {cap}</span>}</span>
      </div>
      <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full transition-all ${overWarn ? "bg-rose-500" : "bg-blue-600"}`} style={{ width: `${unlimited ? 8 : pct}%` }} />
      </div>
      {overWarn && !unlimited && <div className="text-[10px] text-rose-600 mt-1">{pct}% used — consider upgrading.</div>}
    </div>
  );
}
