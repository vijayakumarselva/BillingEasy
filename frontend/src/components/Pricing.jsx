// Shared pricing block — used on the public Landing page and the in-app Billing page.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function inr(amount) {
  return "\u20B9" + Number(amount || 0).toLocaleString("en-IN");
}

export function usePricing() {
  const [data, setData] = useState(null);
  useEffect(() => {
    axios.get(`${API}/public/pricing`).then(r => setData(r.data)).catch(() => setData({ tiers: [], addons: [], launch_offer: { active: false } }));
  }, []);
  return data;
}

export function LaunchOfferBanner({ offer }) {
  if (!offer?.active) return null;
  return (
    <div
      className="rounded-2xl border border-amber-300/60 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 px-5 py-4 flex items-center gap-3 shadow-sm"
      data-testid="launch-offer-banner"
    >
      <Sparkles className="h-5 w-5 text-amber-600 shrink-0" />
      <div className="text-sm">
        <span className="font-semibold text-amber-900 dark:text-amber-200">{offer.title || "Launch Offer"}</span>
        <span className="text-amber-800/80 dark:text-amber-200/80 ml-2">
          {offer.description || `${offer.discount_pct}% off for ${offer.duration_months} months`}
        </span>
      </div>
    </div>
  );
}

export function PricingGrid({ pricing, onChoose, currentCode = null, ownerOnly = false, billingCycle, setBillingCycle }) {
  if (!pricing) return <div className="text-sm text-muted-foreground">Loading pricing…</div>;
  const { tiers, launch_offer: offer } = pricing;

  return (
    <div className="space-y-6">
      {/* Billing-cycle toggle */}
      <div className="flex justify-center">
        <div className="inline-flex items-center bg-muted rounded-full p-1" data-testid="billing-cycle-toggle">
          <button
            onClick={() => setBillingCycle("monthly")}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${billingCycle === "monthly" ? "bg-white dark:bg-slate-800 shadow text-foreground" : "text-muted-foreground"}`}
            data-testid="cycle-monthly"
          >Monthly</button>
          <button
            onClick={() => setBillingCycle("yearly")}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 ${billingCycle === "yearly" ? "bg-white dark:bg-slate-800 shadow text-foreground" : "text-muted-foreground"}`}
            data-testid="cycle-yearly"
          >
            Yearly
            <Badge className="bg-emerald-600 text-[10px] py-0 px-1.5">2 months free</Badge>
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
        {tiers.map(t => {
          const isYearly = billingCycle === "yearly";
          const code = isYearly ? t.yearly_code : t.monthly_code;
          const price = isYearly ? t.yearly_amount : t.monthly_amount;
          const monthlyEquivalent = isYearly && t.yearly_amount ? Math.round(t.yearly_amount / 12) : null;
          const fullYearPrice = t.monthly_amount * 12;
          const yearlySaving = fullYearPrice - t.yearly_amount;
          const isCurrent = currentCode === code;
          const isLaunchTarget = offer?.active && offer.plan_codes?.includes(code);
          const discountedPrice = isLaunchTarget && offer.discount_pct
            ? Math.round(price * (100 - offer.discount_pct) / 100)
            : null;

          return (
            <div
              key={t.tier}
              className={`relative rounded-2xl p-6 flex flex-col bg-card border transition-all hover:-translate-y-0.5 hover:shadow-lg ${t.highlight
                ? "border-blue-600 ring-2 ring-blue-600/30 shadow-md md:scale-[1.03] lg:scale-[1.05] z-10"
                : "border-border"}`}
              data-testid={`pricing-card-${t.tier.toLowerCase()}`}
            >
              {t.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow px-3 py-1">
                    <Sparkles className="h-3 w-3 mr-1" /> {t.badge}
                  </Badge>
                </div>
              )}
              {isLaunchTarget && (
                <div className="absolute -top-3 right-4">
                  <Badge className="bg-amber-500 text-white shadow">Launch Offer</Badge>
                </div>
              )}

              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t.name}</div>
              <p className="text-xs text-muted-foreground mt-1 mb-3 min-h-[2.5em]">{t.tagline}</p>

              <div className="flex items-baseline gap-1.5 mt-1">
                {t.is_custom ? (
                  <span className="text-3xl font-bold tracking-tight">Custom</span>
                ) : (
                  <>
                    {discountedPrice !== null ? (
                      <>
                        <span className="text-4xl font-bold tracking-tight">{inr(discountedPrice)}</span>
                        <span className="text-sm text-muted-foreground line-through">{inr(price)}</span>
                      </>
                    ) : (
                      <span className="text-4xl font-bold tracking-tight">{inr(price)}</span>
                    )}
                    <span className="text-sm text-muted-foreground">/ {isYearly ? "year" : "month"}</span>
                  </>
                )}
              </div>
              {!t.is_custom && isYearly && monthlyEquivalent && (
                <div className="text-xs text-emerald-600 mt-1">
                  ≈ {inr(monthlyEquivalent)}/mo · save {inr(yearlySaving)}
                </div>
              )}
              {!t.is_custom && isLaunchTarget && offer.discount_pct > 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  {offer.discount_pct}% off for {offer.duration_months} {offer.duration_months === 1 ? "month" : "months"}
                </div>
              )}

              <ul className="mt-5 space-y-2.5 text-sm flex-1">
                {t.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className={`h-4 w-4 shrink-0 mt-0.5 ${t.highlight ? "text-blue-600" : "text-emerald-600"}`} />
                    <span className="text-foreground/90">{f}</span>
                  </li>
                ))}
              </ul>

              {t.best_for?.length > 0 && (
                <div className="mt-5 pt-4 border-t border-border/60">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Best for</div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.best_for.map(b => (
                      <span key={b} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{b}</span>
                    ))}
                  </div>
                </div>
              )}

              <Button
                className={`w-full mt-5 ${t.highlight ? "bg-blue-600 hover:bg-blue-700" : ""}`}
                variant={t.highlight ? "default" : "outline"}
                disabled={isCurrent || (ownerOnly === false ? false : !ownerOnly /* always allow on landing */ ? false : false)}
                onClick={() => onChoose?.(t, code)}
                data-testid={`pricing-cta-${t.tier.toLowerCase()}`}
              >
                {t.is_custom ? "Contact Sales" : isCurrent ? "Current plan" : (
                  <>Choose {t.name} <ArrowRight className="h-3.5 w-3.5 ml-1" /></>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AddonsBlock({ addons }) {
  if (!addons?.length) return null;
  return (
    <div className="rounded-2xl border bg-card p-6" data-testid="addons-block">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg">Power-ups & add-ons</h3>
          <p className="text-xs text-muted-foreground">Bolt these on top of any plan. Available on request — contact support to enable.</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {addons.map(a => (
          <div key={a.code} className="rounded-lg border bg-background p-4" data-testid={`addon-${a.code}`}>
            <div className="flex items-baseline justify-between">
              <div className="font-medium text-sm">{a.name}</div>
              <div className="text-sm font-mono-fin text-blue-600">{inr(a.amount)}<span className="text-[10px] text-muted-foreground">/mo</span></div>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{a.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrustSection() {
  const blocks = [
    {
      title: "Bank-Level Security",
      icon: "🛡️",
      points: ["AES-256 encryption at rest", "Secure cloud infrastructure", "Daily automated backups", "Role-based access control", "Activity audit logs", "Multi-device access"],
    },
    {
      title: "Data Protection",
      icon: "🔐",
      points: ["Encrypted data storage", "Bcrypt password hashing", "HTTPS everywhere", "Regular security updates", "Tenant-isolated databases", "PII minimisation"],
    },
    {
      title: "Reliability",
      icon: "⚡",
      points: ["99.9% uptime target", "Automatic backups", "Disaster recovery", "Fast customer support", "GST-law compliant updates", "Active monitoring 24×7"],
    },
  ];
  return (
    <section className="space-y-6" data-testid="trust-section">
      <div className="text-center">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">Why Businesses Trust Us</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">
          We handle your books, GST and customer data. We take that responsibility seriously — every layer is hardened.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {blocks.map(b => (
          <div key={b.title} className="rounded-2xl border bg-card p-6" data-testid={`trust-${b.title.toLowerCase().replace(/\s+/g, '-')}`}>
            <div className="text-3xl mb-2">{b.icon}</div>
            <div className="font-semibold mb-3">{b.title}</div>
            <ul className="space-y-2 text-sm">
              {b.points.map((p, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="text-foreground/85">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
