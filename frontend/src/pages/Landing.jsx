// Public marketing landing page — SEO-optimised, no auth required.
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ShieldCheck, Sparkles, Receipt, Boxes, Wallet, FileSpreadsheet, Users, BarChart3, IndianRupee, CheckCircle2 } from "lucide-react";
import Logo from "@/components/Logo";
import { usePricing, PricingGrid, LaunchOfferBanner, AddonsBlock, TrustSection } from "@/components/Pricing";
import { useState } from "react";

export default function Landing() {
  const nav = useNavigate();
  const pricing = usePricing();
  const [billingCycle, setBillingCycle] = useState("monthly");

  const goSignup = (code) => {
    // Land on register with the chosen plan code so we can pick it up post-signup
    nav(`/register${code ? `?plan=${encodeURIComponent(code)}` : ""}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900" data-testid="landing-page">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur bg-background/80 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Logo withWordmark />
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition">Features</a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition">Pricing</a>
            <a href="#trust" className="text-muted-foreground hover:text-foreground transition">Security</a>
            <a href="#faq" className="text-muted-foreground hover:text-foreground transition">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => nav("/login")} data-testid="header-signin">Sign in</Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => goSignup()} data-testid="header-start-free">
              Start free <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-radial from-blue-100/40 via-transparent to-transparent dark:from-blue-950/30" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 md:py-28 text-center">
          {pricing?.launch_offer?.active && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs font-medium mb-6" data-testid="hero-offer-pill">
              <Sparkles className="h-3.5 w-3.5" />
              {pricing.launch_offer.title || `Launch offer — ${pricing.launch_offer.discount_pct}% off`}
            </div>
          )}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight max-w-4xl mx-auto leading-[1.1]">
            Professional Billing Software for Indian Businesses —
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent"> Secure, Simple, Affordable.</span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            GST invoices, inventory, expenses, GSTR-1 / GSTR-3B reports, multi-branch and role-based access — everything an Indian SMB needs to run its books from day one.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 h-12 px-6 text-base shadow-lg shadow-blue-600/20" onClick={() => goSignup()} data-testid="hero-cta-start">
              Start 7-day free trial <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-6 text-base" onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })} data-testid="hero-cta-pricing">
              See pricing
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> No credit card needed</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Set up in under 2 minutes</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Cancel anytime</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 py-16 md:py-20">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">Everything you need to run your books</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">From your first invoice to your hundredth GSTR-1 filing — BillEasy grows with you.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <div key={f.title} className="rounded-2xl border bg-card p-5 hover:shadow-md transition" data-testid={`feature-${f.title.toLowerCase().replace(/\s+/g, '-')}`}>
              <div className={`h-10 w-10 rounded-lg ${f.color} grid place-items-center mb-3`}>
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Free Tools — drives SEO + leadgen */}
      <section className="bg-gradient-to-b from-violet-50/70 to-fuchsia-50/70 dark:from-violet-950/20 dark:to-fuchsia-950/10 border-y border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 md:py-20">
          <div className="text-center mb-10">
            <Badge className="bg-emerald-600 mb-3">100% Free · No signup</Badge>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">Free GST tools every Indian business should bookmark</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl mx-auto">
              Quick, public utilities — use them as much as you want, no login, no rate limits. Powered by the same engine that runs inside BillEasy.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { title: "GSTIN Validator", desc: "Check any GSTIN's format, state, and official checksum in 1 second.", icon: ShieldCheck, color: "from-emerald-500 to-teal-500" },
              { title: "HSN/SAC Code Finder", desc: "Type your product or service → get the correct HSN code + GST rate.", icon: Receipt, color: "from-violet-500 to-fuchsia-500" },
              { title: "AI HSN Suggestor", desc: "Stuck on a product description? Our AI gives you the most likely code + reasoning.", icon: Sparkles, color: "from-amber-500 to-orange-500", aiBadge: true },
            ].map(t => (
              <div key={t.title} className="rounded-2xl border bg-card p-6 hover:shadow-md transition" data-testid={`free-tool-${t.title.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
                <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${t.color} grid place-items-center text-white mb-3`}>
                  <t.icon className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{t.title}</h3>
                  {t.aiBadge && <Badge className="bg-violet-600 text-[9px] px-1.5 py-0">AI</Badge>}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button size="lg" className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 h-12 px-6 shadow-lg shadow-violet-600/20"
                    onClick={() => nav("/free/tools")} data-testid="free-tools-cta">
              Open free tools <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-muted/30 border-y border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 md:py-20">
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">Simple, transparent pricing</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">
              Start free for 7 days. Upgrade when you're ready. No setup fees, no hidden charges.
            </p>
          </div>

          {pricing?.launch_offer?.active && (
            <div className="max-w-3xl mx-auto mb-8">
              <LaunchOfferBanner offer={pricing.launch_offer} />
            </div>
          )}

          <PricingGrid
            pricing={pricing}
            billingCycle={billingCycle}
            setBillingCycle={setBillingCycle}
            onChoose={(tier, code) => tier.is_custom ? window.location.href = "mailto:sales@billeasy.in?subject=Enterprise%20enquiry" : goSignup(code)}
          />

          <div className="mt-10">
            <AddonsBlock addons={pricing?.addons || []} />
          </div>

          <p className="text-center text-xs text-muted-foreground mt-8">
            All prices exclude GST. Payments via Cashfree — UPI, cards, netbanking, wallets.
          </p>
        </div>
      </section>

      {/* Trust */}
      <section id="trust" className="max-w-7xl mx-auto px-4 sm:px-6 py-16 md:py-20">
        <TrustSection />
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-muted/30 border-t border-border/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 md:py-20">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-center mb-10">Frequently asked</h2>
          <div className="space-y-3">
            {FAQ.map((f, i) => (
              <details key={i} className="rounded-xl border bg-card p-4 group" data-testid={`faq-${i}`}>
                <summary className="font-medium cursor-pointer flex items-center justify-between text-sm">
                  {f.q}
                  <span className="text-muted-foreground group-open:rotate-180 transition">▾</span>
                </summary>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 md:py-20">
        <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-10 md:p-14 text-center shadow-xl shadow-blue-600/20">
          <h2 className="text-3xl sm:text-4xl font-semibold">Ready to professionalise your books?</h2>
          <p className="mt-3 text-blue-100 max-w-xl mx-auto">
            Join hundreds of Indian businesses already running on BillEasy. Free for 7 days, no card needed.
          </p>
          <Button size="lg" className="mt-6 bg-white text-blue-700 hover:bg-blue-50 h-12 px-6 text-base shadow" onClick={() => goSignup()} data-testid="footer-cta-start">
            Start free trial <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </section>

      <footer className="border-t border-border/50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Logo size={24} />
            <span>© {new Date().getFullYear()} BillEasy. Built for Indian businesses.</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#trust" className="hover:text-foreground">Security</a>
            <a href="mailto:hello@billeasy.in" className="hover:text-foreground">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  { title: "GST Invoices",       desc: "Create CGST/SGST/IGST invoices with HSN, e-invoice ready, and beautiful PDFs in seconds.", icon: Receipt,         color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  { title: "Inventory & Stock",  desc: "Track stock with low-stock alerts, barcode lookup and per-product cost & margin reporting.",     icon: Boxes,           color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  { title: "Expenses & Bank",    desc: "Capture every business expense, reconcile bank statements, and never miss an input GST claim.", icon: Wallet,          color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  { title: "GSTR Reports",       desc: "One-click GSTR-1, GSTR-3B, HSN summary, and 26AS-friendly TDS reports.",                         icon: FileSpreadsheet, color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  { title: "Team & Permissions", desc: "Invite accountants and sales staff with custom roles. Granular RBAC + audit log on every action.", icon: Users,        color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
  { title: "Analytics & Reports",desc: "P&L, Balance Sheet, Trial Balance, Day Book and Cash Flow — board-ready in seconds.",          icon: BarChart3,       color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" },
];

const FAQ = [
  { q: "Is there a free trial?", a: "Yes — every new organisation gets a 7-day free trial of all features, with no credit card required." },
  { q: "Can I switch plans later?", a: "Absolutely. Upgrade or downgrade any time from Billing & Plan inside the app. Prorated charges apply." },
  { q: "What payment methods do you accept?", a: "UPI, debit & credit cards, netbanking and major wallets via Cashfree's secure subscription gateway." },
  { q: "Is my data safe?", a: "Yes. Data is encrypted in transit (HTTPS) and at rest (AES-256). Each tenant runs in an isolated database namespace with daily backups." },
  { q: "Do you support GSTR filing directly to the GST portal?", a: "We generate GSTR-1, GSTR-3B and HSN summary in the format the GST portal accepts. Direct API filing is on our roadmap for the Business plan." },
  { q: "Can I cancel any time?", a: "Yes. Cancellation is one click — you continue to have access until the end of the period you've paid for." },
];
