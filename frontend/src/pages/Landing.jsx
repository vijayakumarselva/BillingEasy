// Public marketing landing page — AI-powered GST billing SaaS for India
import { useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Menu,
  X,
  Check,
  ArrowRight,
  Sparkles,
  ScanLine,
  UtensilsCrossed,
  Bot,
  FileText,
  Package,
  BarChart3,
  Landmark,
  Building2,
  Receipt,
  TrendingUp,
  Star,
} from "lucide-react";

export default function Landing() {
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  const scrollTo = (id) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const goSignup = () => nav("/register");
  const goLogin = () => nav("/login");

  const features = [
    {
      icon: <Receipt className="h-6 w-6 text-blue-600" />,
      name: "GST Invoicing",
      desc: "Professional invoices with CGST/SGST/IGST auto-calculated based on customer state.",
    },
    {
      icon: <Bot className="h-6 w-6 text-blue-600" />,
      name: "AI Bookkeeper",
      desc: "Ask anything about your finances in plain English. Powered by Claude AI.",
    },
    {
      icon: <ScanLine className="h-6 w-6 text-blue-600" />,
      name: "Retail POS",
      desc: "Barcode scanner, quick billing, thermal receipt printing. Works online & offline.",
    },
    {
      icon: <UtensilsCrossed className="h-6 w-6 text-blue-600" />,
      name: "Restaurant Billing",
      desc: "Table management, KOT printing, split GST bills — all from one screen.",
    },
    {
      icon: <FileText className="h-6 w-6 text-blue-600" />,
      name: "GST Returns",
      desc: "GSTR-1 and GSTR-3B ready in one click. Auto-formatted for GST portal upload.",
    },
    {
      icon: <Landmark className="h-6 w-6 text-blue-600" />,
      name: "Bank Statement",
      desc: "Upload CSV, auto-match transactions to invoices and expenses effortlessly.",
    },
    {
      icon: <Package className="h-6 w-6 text-blue-600" />,
      name: "Inventory",
      desc: "Track stock levels, auto-deduct on sale, get low-stock alerts.",
    },
    {
      icon: <BarChart3 className="h-6 w-6 text-blue-600" />,
      name: "Expenses & TDS",
      desc: "Log expenses, manage TDS deductions, keep books clean.",
    },
    {
      icon: <Building2 className="h-6 w-6 text-blue-600" />,
      name: "Multi-Branch",
      desc: "Multiple GSTINs & states in one account. Perfect for distributors.",
    },
  ];

  const faqs = [
    {
      q: "Is BillingsEasy free to start?",
      a: "Yes! Every new account gets 50 free credits — enough for about 16 invoices. No credit card required.",
    },
    {
      q: "Is it GST compliant?",
      a: "Absolutely. We auto-calculate IGST, CGST, and SGST based on customer state. GSTR-1 and GSTR-3B reports are ready in one click.",
    },
    {
      q: "Can I use it for restaurant and retail?",
      a: "Yes — we have dedicated modules for both. Retail POS with barcode scanning and Restaurant Billing with table & KOT management.",
    },
    {
      q: "What payment methods are accepted?",
      a: "UPI, credit/debit cards, and net banking via Cashfree — a PCI-DSS certified payment gateway.",
    },
    {
      q: "Is my data safe?",
      a: "Your data is encrypted at rest and in transit. We're hosted on Railway cloud with daily automated backups.",
    },
    {
      q: "Can I have multiple GSTINs?",
      a: "Yes. Add branches for each state, each with their own GSTIN. Manage all from a single login.",
    },
  ];

  const creditCosts = [
    { action: "Create Invoice", credits: "3 cr" },
    { action: "Record Purchase", credits: "2 cr" },
    { action: "Log Expense", credits: "1 cr" },
    { action: "Ask AI", credits: "10 cr" },
    { action: "Export Report", credits: "5 cr" },
  ];

  return (
    <div className="min-h-screen bg-white font-sans antialiased">
      {/* ── NAVBAR ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="flex items-center gap-1 text-xl font-bold tracking-tight"
            >
              <span className="text-gray-900">Billings</span>
              <span className="text-blue-600">Easy</span>
            </button>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
              <button
                onClick={() => scrollTo("features")}
                className="hover:text-blue-600 transition-colors"
              >
                Features
              </button>
              <button
                onClick={() => scrollTo("modules")}
                className="hover:text-blue-600 transition-colors"
              >
                Modules
              </button>
              <button
                onClick={() => scrollTo("pricing")}
                className="hover:text-blue-600 transition-colors"
              >
                Pricing
              </button>
              <Link
                to="/contact"
                className="hover:text-blue-600 transition-colors"
              >
                Contact
              </Link>
            </nav>

            {/* Desktop CTA */}
            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={goLogin}
                className="text-sm font-medium text-gray-700 border border-gray-300 rounded-lg px-4 py-2 hover:border-blue-500 hover:text-blue-600 transition-colors"
              >
                Login
              </button>
              <button
                onClick={goSignup}
                className="text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 transition-colors"
              >
                Start Free
              </button>
            </div>

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 space-y-3">
            {["features", "modules", "pricing"].map((id) => (
              <button
                key={id}
                onClick={() => {
                  scrollTo(id);
                  setMobileOpen(false);
                }}
                className="block w-full text-left text-sm font-medium text-gray-700 py-2 capitalize hover:text-blue-600"
              >
                {id}
              </button>
            ))}
            <Link
              to="/contact"
              onClick={() => setMobileOpen(false)}
              className="block text-sm font-medium text-gray-700 py-2 hover:text-blue-600"
            >
              Contact
            </Link>
            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={goLogin}
                className="w-full border border-gray-300 rounded-lg py-2 text-sm font-medium text-gray-700"
              >
                Login
              </button>
              <button
                onClick={goSignup}
                className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold"
              >
                Start Free
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="bg-gradient-to-br from-slate-50 via-blue-50 to-white pt-16 pb-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            {/* Left */}
            <div className="flex-1 lg:max-w-xl">
              <span className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
                🇮🇳 Made for Indian Businesses
              </span>
              <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
                GST Billing, Invoicing &amp; Accounting —{" "}
                <span className="text-blue-600">All in One Place</span>
              </h1>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                BillingsEasy handles your GST invoices, purchases, expenses, TDS, and bookkeeping.
                With AI that understands your business.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mb-7">
                <button
                  onClick={goSignup}
                  className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base px-7 py-3.5 rounded-xl shadow-lg shadow-blue-200 transition-all hover:shadow-blue-300"
                >
                  Start Free — 50 Credits
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => scrollTo("modules")}
                  className="flex items-center justify-center gap-2 border border-gray-300 text-gray-700 font-semibold text-base px-7 py-3.5 rounded-xl hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  Watch Demo
                </button>
              </div>
              {/* Trust row */}
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-500">
                {[
                  "No credit card",
                  "Free 50 credits",
                  "GST compliant",
                  "Made in India",
                ].map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-green-500" />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Right — mock dashboard */}
            <div className="flex-shrink-0 w-full max-w-sm lg:max-w-md">
              <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
                {/* App bar */}
                <div className="bg-blue-600 px-5 py-3 flex items-center justify-between">
                  <span className="text-white font-bold text-sm">
                    BillingsEasy
                  </span>
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-300" />
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  {/* Invoice card */}
                  <div className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-xs text-gray-400 font-medium">
                          Invoice #INV-001
                        </p>
                        <p className="font-semibold text-gray-800 text-sm mt-0.5">
                          Sharma Enterprises
                        </p>
                      </div>
                      <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full">
                        PAID
                      </span>
                    </div>

                    <div className="border-t border-gray-200 pt-3 space-y-1.5">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Subtotal</span>
                        <span>₹10,560.00</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>CGST (9%)</span>
                        <span>₹950.40</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>SGST (9%)</span>
                        <span>₹950.40</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold text-gray-800 pt-1 border-t border-gray-200">
                        <span>Total</span>
                        <span>₹12,460.80</span>
                      </div>
                    </div>
                  </div>

                  {/* Mini bar chart */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">
                      This Month's Revenue
                    </p>
                    <div className="flex items-end gap-1.5 h-16">
                      {[40, 65, 50, 80, 60, 90, 75].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-t"
                          style={{
                            height: `${h}%`,
                            background:
                              i === 5
                                ? "#2563EB"
                                : i === 6
                                ? "#93C5FD"
                                : "#DBEAFE",
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                      <span>Mon</span>
                      <span>Tue</span>
                      <span>Wed</span>
                      <span>Thu</span>
                      <span>Fri</span>
                      <span className="text-blue-600 font-semibold">Sat</span>
                      <span>Sun</span>
                    </div>
                  </div>

                  {/* Quick stats */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-[10px] text-blue-500 font-medium">
                        Today's Sales
                      </p>
                      <p className="text-sm font-bold text-blue-700 mt-0.5">
                        ₹24,800
                      </p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-[10px] text-green-500 font-medium">
                        Outstanding
                      </p>
                      <p className="text-sm font-bold text-green-700 mt-0.5">
                        ₹8,200
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="bg-blue-600 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center text-white">
            {[
              { value: "10,000+", label: "Invoices Generated" },
              { value: "₹50Cr+", label: "Billed" },
              { value: "500+", label: "Businesses" },
              { value: "99.9%", label: "Uptime" },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-3xl font-extrabold">{s.value}</p>
                <p className="text-blue-200 text-sm mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              Everything your business needs
            </h2>
            <p className="mt-3 text-gray-500 text-lg">
              Built for Indian SMBs — from kirana shops to multi-branch distributors.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.name}
                className="group border border-gray-100 rounded-2xl p-6 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-50 transition-all"
              >
                <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                  {f.icon}
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5">{f.name}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MODULES SHOWCASE ── */}
      <section id="modules" className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              Specialized modules for every business
            </h2>
            <p className="mt-3 text-gray-500 text-lg">
              Purpose-built tools, not generic software.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Retail POS */}
            <div className="bg-white rounded-2xl border border-gray-100 p-7 flex flex-col shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-5">
                <ScanLine className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Retail POS</h3>
              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                Scan barcodes, build cart, apply discounts, print thermal receipts.
                Works with USB &amp; Bluetooth scanners.
              </p>
              <ul className="space-y-2 mb-6 flex-1">
                {[
                  "Barcode / SKU scanner",
                  "Category filters",
                  "Discount rules",
                  "Customer selection",
                  "GST auto-calc",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={goSignup}
                className="text-blue-600 font-semibold text-sm hover:text-blue-700 flex items-center gap-1"
              >
                Try Retail POS <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {/* Restaurant Billing */}
            <div className="bg-white rounded-2xl border border-gray-100 p-7 flex flex-col shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center mb-5">
                <UtensilsCrossed className="h-6 w-6 text-orange-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Restaurant Billing
              </h3>
              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                Manage tables across floors, send KOT to kitchen, generate split GST
                bills — all from one screen.
              </p>
              <ul className="space-y-2 mb-6 flex-1">
                {[
                  "Table & section management",
                  "KOT printing",
                  "CGST + SGST split",
                  "Menu categories",
                  "Bill customization",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={goSignup}
                className="text-orange-500 font-semibold text-sm hover:text-orange-600 flex items-center gap-1"
              >
                Try Restaurant Billing <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {/* AI Bookkeeper */}
            <div className="bg-white rounded-2xl border border-gray-100 p-7 flex flex-col shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center mb-5">
                <Sparkles className="h-6 w-6 text-violet-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">AI Bookkeeper</h3>
              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                Ask "What's my profit this month?" or "Who owes me money?" — get
                instant answers powered by Claude AI.
              </p>
              <ul className="space-y-2 mb-6 flex-1">
                {[
                  "Plain English queries",
                  "P&L summaries",
                  "Outstanding analysis",
                  "GST insights",
                  "Zero setup",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={goSignup}
                className="text-violet-600 font-semibold text-sm hover:text-violet-700 flex items-center gap-1"
              >
                Ask AI <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              Up and running in 3 steps
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {[
              {
                step: "1",
                title: "Create Account",
                desc: "Sign up free, get 50 credits instantly. No credit card needed.",
              },
              {
                step: "2",
                title: "Add Your Business",
                desc: "Enter your GSTIN, business name, and start adding products and customers.",
              },
              {
                step: "3",
                title: "Start Billing",
                desc: "Create your first GST invoice in under 2 minutes.",
              },
            ].map((s) => (
              <div key={s.step} className="text-center relative">
                <div className="w-14 h-14 bg-blue-600 text-white text-xl font-extrabold rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg shadow-blue-200">
                  {s.step}
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-4">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              Pay only for what you use
            </h2>
            <p className="mt-3 text-gray-500 text-lg">
              Credits-based pricing. No monthly subscription. No lock-in.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
            {/* Try It */}
            <div className="bg-white border border-gray-200 rounded-2xl p-7 flex flex-col">
              <h3 className="text-lg font-bold text-gray-900">Try It</h3>
              <p className="text-sm text-gray-400 mt-1">~33 invoices</p>
              <div className="my-5">
                <span className="text-4xl font-extrabold text-gray-900">₹149</span>
                <span className="text-gray-400 text-sm ml-2">/ 100 credits</span>
              </div>
              <ul className="space-y-2 flex-1 mb-6">
                {["100 credits", "All features", "Email support", "Credits never expire"].map(
                  (f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="h-4 w-4 text-green-500" />
                      {f}
                    </li>
                  )
                )}
              </ul>
              <button
                onClick={goSignup}
                className="w-full border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl hover:border-blue-400 hover:text-blue-600 transition-colors text-sm"
              >
                Get Started
              </button>
            </div>

            {/* Starter — Popular */}
            <div className="bg-blue-600 border-2 border-blue-600 rounded-2xl p-7 flex flex-col transform scale-105 shadow-2xl shadow-blue-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Starter</h3>
                <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Star className="h-3 w-3" /> Most Popular
                </span>
              </div>
              <p className="text-sm text-blue-200 mt-1">~166 invoices</p>
              <div className="my-5">
                <span className="text-4xl font-extrabold text-white">₹649</span>
                <span className="text-blue-200 text-sm ml-2">/ 500 credits</span>
              </div>
              <ul className="space-y-2 flex-1 mb-6">
                {[
                  "500 credits",
                  "All features",
                  "Priority support",
                  "Credits never expire",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-blue-100">
                    <Check className="h-4 w-4 text-blue-200" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={goSignup}
                className="w-full bg-white text-blue-600 font-bold py-2.5 rounded-xl hover:bg-blue-50 transition-colors text-sm"
              >
                Buy Starter
              </button>
            </div>

            {/* Growth */}
            <div className="bg-white border border-gray-200 rounded-2xl p-7 flex flex-col">
              <h3 className="text-lg font-bold text-gray-900">Growth</h3>
              <p className="text-sm text-violet-500 font-semibold mt-1">
                ~666 invoices · Save 46%
              </p>
              <div className="my-5">
                <span className="text-4xl font-extrabold text-gray-900">₹2,299</span>
                <span className="text-gray-400 text-sm ml-2">/ 2000 credits</span>
              </div>
              <ul className="space-y-2 flex-1 mb-6">
                {[
                  "2000 credits",
                  "All features",
                  "Dedicated support",
                  "Credits never expire",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="h-4 w-4 text-green-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={goSignup}
                className="w-full border border-violet-300 text-violet-700 font-semibold py-2.5 rounded-xl hover:bg-violet-50 transition-colors text-sm"
              >
                Buy Growth
              </button>
            </div>
          </div>

          {/* Credit cost table */}
          <div className="mt-10 max-w-lg mx-auto">
            <h4 className="text-center text-sm font-bold text-gray-700 mb-3">
              Credit Cost Breakdown
            </h4>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {creditCosts.map((row, i) => (
                <div
                  key={row.action}
                  className={`flex justify-between px-5 py-3 text-sm ${
                    i % 2 === 0 ? "bg-white" : "bg-gray-50"
                  }`}
                >
                  <span className="text-gray-600">{row.action}</span>
                  <span className="font-semibold text-blue-600">{row.credits}</span>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-gray-400 mt-3">
              50 free credits on every new account · Credits never expire
            </p>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              Trusted by Indian businesses
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                quote:
                  "BillingsEasy saved us hours every week on GST filing. The AI bookkeeper is incredible!",
                name: "Rajesh Kumar",
                role: "Wholesale Trader, Chennai",
              },
              {
                quote:
                  "Restaurant billing with table management is exactly what we needed. KOT printing works perfectly.",
                name: "Priya Sharma",
                role: "Restaurant Owner, Bangalore",
              },
              {
                quote:
                  "Finally an app that handles both our Delhi and Mumbai offices with different GSTINs!",
                name: "Amit Patel",
                role: "Distributor, Mumbai",
              },
            ].map((t) => (
              <div
                key={t.name}
                className="bg-slate-50 border border-gray-100 rounded-2xl p-7"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className="h-4 w-4 text-yellow-400 fill-yellow-400"
                    />
                  ))}
                </div>
                <p className="text-gray-700 text-sm leading-relaxed mb-5">
                  "{t.quote}"
                </p>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{t.name}</p>
                  <p className="text-gray-400 text-xs">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-20 bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              Frequently asked questions
            </h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left"
                >
                  <span className="font-semibold text-gray-900 text-sm pr-4">
                    {faq.q}
                  </span>
                  {openFaq === i ? (
                    <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  )}
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4 text-sm text-gray-500 leading-relaxed border-t border-gray-100 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-700 py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">
            Ready to simplify your GST billing?
          </h2>
          <p className="text-blue-200 text-lg mb-8">
            Join 500+ businesses already using BillingsEasy
          </p>
          <button
            onClick={goSignup}
            className="bg-white text-blue-600 font-bold text-lg px-10 py-4 rounded-xl hover:bg-blue-50 transition-colors shadow-xl"
          >
            Start Free — Get 50 Credits
          </button>
          <p className="text-blue-300 text-sm mt-4">
            No credit card · Setup in 2 minutes · Cancel anytime
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-gray-900 text-gray-400 pt-14 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div className="col-span-2 lg:col-span-1">
              <div className="flex items-center gap-1 text-xl font-bold mb-3">
                <span className="text-white">Billings</span>
                <span className="text-blue-400">Easy</span>
              </div>
              <p className="text-sm leading-relaxed text-gray-500">
                AI-powered GST billing for India. Built for SMBs, kirana stores,
                restaurants, and distributors.
              </p>
              <p className="text-xs text-gray-600 mt-3 leading-relaxed">
                BillingsEasy is a product of<br />
                <span className="text-gray-400 font-medium">Nammahut Services Private Limited</span>
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Product</h4>
              <ul className="space-y-2.5 text-sm">
                {[
                  { label: "Features", action: () => scrollTo("features") },
                  { label: "Pricing", action: () => scrollTo("pricing") },
                  { label: "Retail POS", action: () => scrollTo("modules") },
                  { label: "Restaurant Billing", action: () => scrollTo("modules") },
                  { label: "GST Returns", action: () => scrollTo("features") },
                  { label: "AI Bookkeeper", action: () => scrollTo("modules") },
                ].map((item) => (
                  <li key={item.label}>
                    <button
                      onClick={item.action}
                      className="hover:text-white transition-colors text-left"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Legal</h4>
              <ul className="space-y-2.5 text-sm">
                {[
                  { label: "Contact Us", to: "/contact" },
                  { label: "Privacy Policy", to: "/privacy" },
                  { label: "Terms & Conditions", to: "/terms" },
                  { label: "Refunds & Cancellations", to: "/refund" },
                  { label: "Security", to: "/security" },
                ].map((item) => (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      className="hover:text-white transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Company</h4>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <button
                    onClick={goSignup}
                    className="hover:text-white transition-colors"
                  >
                    About
                  </button>
                </li>
                <li>
                  <span className="text-gray-600 cursor-not-allowed">
                    Blog{" "}
                    <span className="text-xs text-gray-600">(coming soon)</span>
                  </span>
                </li>
                <li>
                  <span className="text-gray-600 cursor-not-allowed">
                    Careers{" "}
                    <span className="text-xs text-gray-600">(coming soon)</span>
                  </span>
                </li>
                <li>
                  <a
                    href="https://twitter.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    Twitter / X
                  </a>
                </li>
                <li>
                  <a
                    href="https://linkedin.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    LinkedIn
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-600">
            <span>© 2026 Nammahut Services Private Limited. All rights reserved.</span>
            <span>BillingsEasy · Made with ❤️ in India · Tamil Nadu</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
