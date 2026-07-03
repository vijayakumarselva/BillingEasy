// Public marketing landing page — AI-powered GST billing SaaS for India
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import {
  ArrowRight,
  Check,
  Zap,
  Shield,
  Cloud,
  Smartphone,
  Bot,
  FileText,
  Package,
  BarChart3,
  CreditCard,
  Users,
  Wifi,
  Globe,
  MessageSquare,
  QrCode,
  ScanLine,
  TrendingUp,
  Landmark,
  HardDrive,
  ChevronDown,
} from "lucide-react";

export default function Landing() {
  const nav = useNavigate();
  const [openFaq, setOpenFaq] = useState(null);

  const goSignup = () => nav("/register");
  const goLogin = () => nav("/login");

  const features = [
    {
      icon: <Bot className="h-5 w-5 text-blue-600" />,
      name: "AI Invoice Creation",
      desc: "Generate accurate GST invoices in seconds with AI assistance.",
    },
    {
      icon: <TrendingUp className="h-5 w-5 text-blue-600" />,
      name: "AI Sales Insights",
      desc: "Understand your business trends with intelligent AI analytics.",
    },
    {
      icon: <FileText className="h-5 w-5 text-blue-600" />,
      name: "One-click GST Reports",
      desc: "GSTR-1 and GSTR-3B reports ready in a single click.",
    },
    {
      icon: <Package className="h-5 w-5 text-blue-600" />,
      name: "Smart Inventory",
      desc: "Real-time stock tracking with low-stock alerts.",
    },
    {
      icon: <MessageSquare className="h-5 w-5 text-blue-600" />,
      name: "WhatsApp Invoice Sharing",
      desc: "Send invoices to customers directly via WhatsApp.",
    },
    {
      icon: <Landmark className="h-5 w-5 text-blue-600" />,
      name: "Bank Statement Auto-match",
      desc: "Automatically reconcile payments against bank statements.",
    },
    {
      icon: <Users className="h-5 w-5 text-blue-600" />,
      name: "Multi-user Access",
      desc: "Invite team members with granular role-based permissions.",
    },
    {
      icon: <ScanLine className="h-5 w-5 text-blue-600" />,
      name: "Barcode Support",
      desc: "Generate and scan barcodes for fast billing at the counter.",
    },
    {
      icon: <QrCode className="h-5 w-5 text-blue-600" />,
      name: "QR Payments",
      desc: "Accept UPI QR code payments instantly on invoices.",
    },
    {
      icon: <CreditCard className="h-5 w-5 text-blue-600" />,
      name: "Purchase Management",
      desc: "Track vendor purchases and manage payables effortlessly.",
    },
    {
      icon: <BarChart3 className="h-5 w-5 text-blue-600" />,
      name: "Expense Tracking",
      desc: "Log and categorise business expenses in one place.",
    },
    {
      icon: <HardDrive className="h-5 w-5 text-blue-600" />,
      name: "Cloud Backup",
      desc: "Your data is encrypted and backed up to the cloud 24/7.",
    },
  ];

  const platforms = [
    { name: "Web App", icon: <Globe className="h-6 w-6" />, live: true },
    { name: "Android", icon: <Smartphone className="h-6 w-6" />, live: false },
    { name: "iOS", icon: <Smartphone className="h-6 w-6" />, live: false },
    { name: "Windows", icon: <Wifi className="h-6 w-6" />, live: false },
    { name: "Mac", icon: <Cloud className="h-6 w-6" />, live: false },
  ];

  const industries = [
    "Retail Store",
    "Wholesale",
    "Supermarket",
    "Restaurant",
    "Café",
    "Medical Store",
    "Electronics",
    "Fashion",
    "Footwear",
    "Mobile Shop",
    "Hardware",
    "Grocery",
    "Department Store",
    "Automobile",
    "Distributor",
    "Manufacturer",
    "Service Business",
    "Pharmacy",
  ];

  const pricingPacks = [
    {
      name: "Try It",
      credits: 100,
      price: "₹149",
      perCredit: "₹1.49/credit",
      popular: false,
      bestValue: false,
    },
    {
      name: "Starter",
      credits: 500,
      price: "₹649",
      perCredit: "₹1.30/credit",
      popular: true,
      bestValue: false,
    },
    {
      name: "Growth",
      credits: 2000,
      price: "₹2,299",
      perCredit: "₹1.15/credit",
      popular: false,
      bestValue: true,
    },
  ];

  const actionCosts = [
    { action: "Create Invoice", credits: 3 },
    { action: "Create Purchase", credits: 2 },
    { action: "AI Query", credits: 10 },
    { action: "GST Export", credits: 5 },
  ];

  const testimonials = [
    {
      quote:
        "Switched from Tally and never looked back. BillingEasy's AI features save me 2 hours every day.",
      name: "Rajesh Kumar",
      role: "Wholesale Trader, Mumbai",
    },
    {
      quote:
        "Perfect for my restaurant. GST reports are auto-generated and WhatsApp sharing is a game changer.",
      name: "Priya Sharma",
      role: "Restaurant Owner, Chennai",
    },
    {
      quote:
        "Very affordable compared to other billing software. The AI invoice scanning is brilliant.",
      name: "Amit Patel",
      role: "Electronics Retailer, Ahmedabad",
    },
  ];

  const faqs = [
    {
      q: "What is BillingEasy?",
      a: "BillingEasy is an AI-powered GST billing software built for Indian businesses. It helps you create invoices, manage inventory, track expenses, and generate GST reports — all from one place.",
    },
    {
      q: "Is BillingEasy suitable for retail shops?",
      a: "Yes! BillingEasy works for retail, wholesale, restaurants, medical stores, and many more business types. It adapts to your workflow automatically.",
    },
    {
      q: "Can I use BillingEasy on Android?",
      a: "The Android app is coming soon. In the meantime, the web app works perfectly on any mobile browser — just open it in Chrome on your phone.",
    },
    {
      q: "Is my data safe?",
      a: "Absolutely. Your data is protected with 256-bit encryption and automatically backed up to the cloud, so you never lose anything.",
    },
    {
      q: "Does it support GST?",
      a: "Full GST support is built-in — CGST, SGST, IGST, GSTR-1, and GSTR-3B. Export your reports with one click.",
    },
    {
      q: "What are credits?",
      a: "Credits are the currency of BillingEasy. You spend a small number of credits each time you create an invoice, purchase, or run an AI query. You start with 50 free credits on signup — no card required.",
    },
    {
      q: "Can I migrate from Tally?",
      a: "Yes! We support importing your data via Excel/CSV files. Contact our support team and we'll guide you through the migration.",
    },
    {
      q: "Does it support barcode billing?",
      a: "Yes. You can generate barcodes for your products and scan them at billing time for fast, accurate checkouts.",
    },
    {
      q: "Can multiple users access it?",
      a: "Yes. You can invite team members and assign them roles (admin, cashier, etc.) with role-based access control.",
    },
    {
      q: "Is there a free trial?",
      a: "Yes — you get 50 free credits when you sign up. No credit card required. Start billing immediately.",
    },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* ── 1. NAVBAR ── */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/80 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="font-bold text-lg text-slate-900 dark:text-white">BillingEasy</span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
            <a
              href="#features"
              className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              Features
            </a>
            <a
              href="#pricing"
              className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              Pricing
            </a>
            <a
              href="#industries"
              className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              Industries
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={goLogin} data-testid="header-signin">
              Login
            </Button>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={goSignup}
              data-testid="header-start-free"
            >
              Start Free <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </header>

      {/* ── 2. HERO ── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 40%, #F0F9FF 100%)",
        }}
      >
        <div className="dark:hidden absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-sky-50 -z-10" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-24 md:py-36 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-sm font-medium mb-6">
            🇮🇳 Made for Indian Businesses
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight mb-5">
            AI-Powered GST Billing Software
            <span className="text-blue-600"> for Every Business</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            The smartest, most affordable billing solution for Retail, Wholesale,
            Restaurants &amp; SMEs. GST-ready, cloud-synced, works on all devices.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
            <Button
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-base font-semibold shadow-lg shadow-blue-200 dark:shadow-blue-900/40"
              onClick={goSignup}
              data-testid="hero-cta-signup"
            >
              Start Free — 50 Credits <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="px-8 py-6 text-base font-semibold border-slate-300 dark:border-slate-700"
            >
              Watch Demo
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-green-500" /> No credit card needed
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-green-500" /> GST compliant
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-green-500" /> Setup in 2 minutes
            </span>
          </div>
        </div>
      </section>

      {/* ── 3. TRUST BADGES ── */}
      <section className="border-y border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 overflow-x-auto">
          <div className="flex items-center gap-6 min-w-max mx-auto justify-center">
            {[
              { icon: "🤖", label: "AI Powered" },
              { icon: "🔒", label: "256-bit Secure" },
              { icon: "📄", label: "GST Ready" },
              { icon: "☁️", label: "Cloud Sync" },
              { icon: "📱", label: "All Devices" },
              { icon: "⚡", label: "Fast Setup" },
              { icon: "💰", label: "Affordable" },
            ].map((b) => (
              <div
                key={b.label}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm whitespace-nowrap"
              >
                <span>{b.icon}</span>
                {b.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. FEATURES ── */}
      <section id="features" className="py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              Everything your business needs
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-lg max-w-xl mx-auto">
              From AI-powered invoicing to GST reports — built for the Indian market.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {features.map((f) => (
              <div
                key={f.name}
                className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-200"
              >
                <div className="mb-3 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/50">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-sm text-slate-900 dark:text-white mb-1">
                  {f.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. PLATFORM ── */}
      <section className="py-20 px-4 sm:px-6 bg-slate-50 dark:bg-slate-900/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-3">
              Use BillingEasy everywhere
            </h2>
            <p className="text-slate-500 dark:text-slate-400">
              Start on web today. More platforms coming soon.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {platforms.map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl border p-6 text-center flex flex-col items-center gap-3 transition-all ${
                  p.live
                    ? "bg-white dark:bg-slate-900 border-blue-500 shadow-md shadow-blue-100 dark:shadow-blue-900/30"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                }`}
              >
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                    p.live
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {p.icon}
                </div>
                <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                  {p.name}
                </span>
                {p.live ? (
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs w-full"
                    onClick={goSignup}
                  >
                    Use Now
                  </Button>
                ) : (
                  <span className="inline-block text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium">
                    Coming Soon
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. INDUSTRIES ── */}
      <section id="industries" className="py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Built for every type of business
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg mb-12 max-w-xl mx-auto">
            From grocery stores to manufacturers — BillingEasy adapts to your
            business.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {industries.map((ind) => (
              <span
                key={ind}
                className="px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-sm font-medium hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors cursor-default"
              >
                {ind}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. PRICING ── */}
      <section id="pricing" className="py-24 px-4 sm:px-6 bg-slate-50 dark:bg-slate-900/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-3">
              Pay only for what you use
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-lg">
              Credits never expire. No monthly lock-in.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-10">
            {pricingPacks.map((pack) => (
              <div
                key={pack.name}
                className={`relative bg-white dark:bg-slate-900 rounded-2xl border p-7 flex flex-col gap-4 shadow-sm transition-all ${
                  pack.popular
                    ? "border-blue-500 shadow-blue-100 dark:shadow-blue-900/30 shadow-md"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                {pack.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-blue-600 text-white text-xs font-semibold shadow">
                    Popular
                  </div>
                )}
                {pack.bestValue && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-600 text-white text-xs font-semibold shadow">
                    Best Value
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-lg">{pack.name}</h3>
                  <p className="text-3xl font-bold text-blue-600 mt-2">{pack.price}</p>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
                    {pack.credits} credits · {pack.perCredit}
                  </p>
                </div>
                <Button
                  className={`w-full mt-2 ${
                    pack.popular
                      ? "bg-blue-600 hover:bg-blue-700 text-white"
                      : "bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900"
                  }`}
                  onClick={goSignup}
                >
                  Get Started
                </Button>
              </div>
            ))}
          </div>

          <p className="text-center text-slate-500 dark:text-slate-400 text-sm mb-10">
            Start with{" "}
            <strong className="text-slate-700 dark:text-slate-300">50 free credits</strong> on signup.
            No card required.
          </p>

          {/* Action costs table */}
          <div className="max-w-sm mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
              <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                What costs credits?
              </p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {actionCosts.map((a) => (
                <div
                  key={a.action}
                  className="flex items-center justify-between px-5 py-3 text-sm"
                >
                  <span className="text-slate-600 dark:text-slate-400">{a.action}</span>
                  <span className="font-semibold text-blue-600">
                    {a.credits} credits
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. TESTIMONIALS ── */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-3">
              Loved by Indian businesses
            </h2>
            <p className="text-slate-500 dark:text-slate-400">
              Real businesses. Real results.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-7 shadow-sm"
              >
                <div className="text-yellow-400 text-lg mb-4">★★★★★</div>
                <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed mb-6">
                  "{t.quote}"
                </p>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">{t.name}</p>
                  <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 9. FAQ ── */}
      <section id="faq" className="py-24 px-4 sm:px-6 bg-slate-50 dark:bg-slate-900/40">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-3">
              Frequently asked questions
            </h2>
            <p className="text-slate-500 dark:text-slate-400">
              Got more questions? Contact us at{" "}
              <a
                href="mailto:hello@billingseasy.com"
                className="text-blue-600 hover:underline"
              >
                hello@billingseasy.com
              </a>
            </p>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
              >
                <button
                  className="w-full flex items-center justify-between px-6 py-4 text-left font-semibold text-slate-800 dark:text-slate-200 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-400 transition-transform flex-shrink-0 ml-4 ${
                      openFaq === i ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 10. FINAL CTA ── */}
      <section className="py-20 px-4 sm:px-6">
        <div
          className="max-w-3xl mx-auto rounded-3xl p-12 text-center text-white shadow-xl"
          style={{
            background: "linear-gradient(135deg, #1D4ED8 0%, #1E40AF 50%, #1E3A8A 100%)",
          }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ready to grow your business?
          </h2>
          <p className="text-blue-200 text-lg mb-8 max-w-xl mx-auto">
            Join thousands of Indian businesses already using BillingEasy.
          </p>
          <Button
            size="lg"
            className="bg-white hover:bg-blue-50 text-blue-700 font-semibold px-8 py-6 text-base shadow-lg"
            onClick={goSignup}
            data-testid="final-cta"
          >
            Get Started Free <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          <p className="text-blue-300 text-sm mt-4">
            50 free credits · No credit card required
          </p>
        </div>
      </section>

      {/* ── 11. FOOTER ── */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-14 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto grid sm:grid-cols-3 gap-10">
          {/* Col 1 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Logo />
              <span className="font-bold text-slate-900 dark:text-white">BillingEasy</span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-4">
              India's AI-powered GST billing software for every business. Credits-based pricing. No lock-in.
            </p>
            <p className="text-slate-400 dark:text-slate-600 text-xs">
              © {new Date().getFullYear()} BillingEasy. All rights reserved.
            </p>
          </div>
          {/* Col 2 */}
          <div>
            <h4 className="font-semibold text-slate-900 dark:text-white text-sm mb-4">Product</h4>
            <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
              <li>
                <a href="#features" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#industries" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Industries
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  FAQ
                </a>
              </li>
              <li>
                <a
                  href="mailto:hello@billingseasy.com"
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>
          {/* Col 3 */}
          <div>
            <h4 className="font-semibold text-slate-900 dark:text-white text-sm mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
              <li>
                <a href="/privacy" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="/terms" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="/refund" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Refund Policy
                </a>
              </li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
