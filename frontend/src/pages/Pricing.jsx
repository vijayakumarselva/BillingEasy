// Public pricing page — reads the live catalogue from /api/pricing so a price
// change by the super admin shows up here without a deploy.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "@/lib/api";
import { Check, X, Star, Sparkles, ChevronDown, ArrowRight, Zap } from "lucide-react";

const BRAND = "#2563EB";
const NAVY = "#030817";

const inr = (paise) =>
  "₹" + Math.round((paise || 0) / 100).toLocaleString("en-IN");

const FAQS = [
  {
    q: "Can I run more than one business on one login?",
    a: "Yes — that is the whole idea. Starter covers 2 businesses, Business covers 5 and Pro is unlimited. One login, one bill, separate books.",
  },
  {
    q: "What is an AI scan?",
    a: "Point your camera at a supplier bill, or drop in a PDF, and we read the supplier, bill number, every line item and the GST for you. Each plan includes a number of scans per year. Everything else — invoices, reports, payments — is unlimited and costs nothing extra.",
  },
  {
    q: "Is there a free trial?",
    a: "Every new signup gets 14 days of the Business plan, no card needed. After that you stay on Free unless you choose to pay. Nothing is ever deleted.",
  },
  {
    q: "Can I switch plans later?",
    a: "Upgrade whenever you like and pay only the difference for the days left. Downgrades start at your next renewal, so you keep what you paid for.",
  },
  {
    q: "Do I get a GST invoice?",
    a: "Yes — with our GSTIN and yours, so you can claim input tax credit. Add your GSTIN at checkout and download it any time.",
  },
];

function Toggle({ yearly, setYearly, savePct }) {
  return (
    <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur rounded-full p-1.5 border border-white/15">
      {[["Monthly", false], ["Yearly", true]].map(([label, val]) => (
        <button
          key={label}
          onClick={() => setYearly(val)}
          className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
            yearly === val ? "bg-white text-slate-900 shadow" : "text-white/70 hover:text-white"
          }`}
        >
          {label}
          {val && savePct > 0 && (
            <span className="ml-2 text-[11px] font-bold text-emerald-300">
              Save up to {savePct}%
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function PlanCard({ tier, yearly, founding, onPick }) {
  const isFree = tier.tier === "FREE";
  const price = yearly ? tier.yearly_paise : tier.monthly_paise;
  const foundingHere =
    founding && founding.tier === tier.tier && yearly && founding.spots_left > 0;
  const shown = foundingHere ? founding.yearly_paise : price;
  const popular = tier.highlight;

  return (
    <div
      className={`relative flex flex-col rounded-2xl p-6 border transition-all ${
        popular
          ? "bg-white border-blue-600 shadow-2xl shadow-blue-100 lg:scale-[1.04] z-10"
          : "bg-white border-slate-200 hover:border-slate-300"
      }`}
    >
      {popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1 whitespace-nowrap">
          <Star className="h-3 w-3 fill-white" /> {tier.badge}
        </span>
      )}
      <h3 className="text-lg font-bold text-slate-900">{tier.name}</h3>
      <p className="text-[13px] text-slate-500 mt-1 min-h-[36px]">{tier.tagline}</p>

      <div className="mt-5 mb-1 flex items-end gap-1.5 flex-wrap">
        <span className="text-4xl font-extrabold text-slate-900">
          {isFree ? "₹0" : inr(shown)}
        </span>
        {!isFree && (
          <span className="text-slate-400 text-sm mb-1">/{yearly ? "year" : "month"}</span>
        )}
        {foundingHere && (
          <span className="text-sm text-slate-400 line-through mb-1">{inr(price)}</span>
        )}
      </div>
      <p className="text-[11px] text-slate-400 mb-4">
        {isFree ? "Free forever" : "+ 18% GST"}
        {foundingHere && (
          <span className="text-emerald-600 font-semibold"> · founding price, locked on renewal</span>
        )}
      </p>

      <button
        onClick={() => onPick(tier, yearly)}
        className={`w-full font-semibold py-2.5 rounded-xl text-sm transition-colors ${
          popular
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "border border-slate-300 text-slate-700 hover:border-blue-400 hover:text-blue-600"
        }`}
      >
        {isFree ? "Start free" : `Choose ${tier.name}`}
      </button>

      <ul className="space-y-2.5 mt-6">
        <li className="flex items-start gap-2 text-[13px] text-slate-700 font-medium">
          <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
          {tier.limits.businesses === -1
            ? "Unlimited businesses"
            : `${tier.limits.businesses} business${tier.limits.businesses > 1 ? "es" : ""}`}
        </li>
        <li className="flex items-start gap-2 text-[13px] text-slate-700 font-medium">
          <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
          {tier.limits.users} user{tier.limits.users > 1 ? "s" : ""} (incl. you)
        </li>
        <li className="flex items-start gap-2 text-[13px] text-slate-700 font-medium">
          <Sparkles className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" />
          {tier.credits_per_year
            ? `${tier.credits_per_year.toLocaleString("en-IN")} AI invoice scans / year`
            : `${tier.signup_credits} AI invoice scans to try`}
        </li>
        {tier.feature_labels.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[13px] text-slate-600">
            <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            {f}
          </li>
        ))}
        <li className="flex items-start gap-2 text-[13px] text-slate-600">
          <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
          {tier.support}
        </li>
      </ul>
    </div>
  );
}

export default function Pricing() {
  const [data, setData] = useState(null);
  const [yearly, setYearly] = useState(true);
  const [err, setErr] = useState("");
  const [openFaq, setOpenFaq] = useState(0);
  const nav = useNavigate();

  useEffect(() => {
    axios
      .get(`${API_BASE}/pricing`)
      .then((r) => setData(r.data))
      .catch(() => setErr("Could not load pricing just now — please refresh."));
  }, []);

  const pick = (tier, isYearly) => {
    const code = isYearly ? tier.yearly_code : tier.monthly_code;
    nav(`/register?plan=${code || "FREE"}`);
  };

  const rows = useMemo(() => {
    if (!data) return [];
    // "GST invoices" already has its own row above the feature matrix.
    return data.feature_order.filter((k) => k !== "gst_invoices").map((key) => ({
      key,
      label: data.features[key],
      by: data.tiers.map((t) => t.features.includes(key)),
    }));
  }, [data]);

  if (err) return <div className="p-10 text-center text-slate-500">{err}</div>;
  if (!data) return <div className="p-10 text-center text-slate-400">Loading pricing…</div>;

  const founding = data.founding;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <section style={{ background: NAVY }} className="text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24">
          <nav className="flex items-center justify-between mb-14">
            <Link to="/" className="flex items-center gap-2">
              <span
                className="h-8 w-8 rounded-lg grid place-items-center font-bold text-sm"
                style={{ background: BRAND }}
              >
                BE
              </span>
              <span className="font-bold">BillingsEasy</span>
            </Link>
            <div className="flex items-center gap-3 text-sm">
              <Link to="/login" className="text-white/70 hover:text-white px-3 py-2">
                Sign in
              </Link>
              <Link
                to="/register"
                className="rounded-lg px-4 py-2 font-semibold"
                style={{ background: BRAND }}
              >
                Start free
              </Link>
            </div>
          </nav>

          <div className="text-center max-w-3xl mx-auto">
            {founding && founding.spots_left > 0 && (
              <div className="inline-flex items-center gap-2 bg-amber-400/15 border border-amber-400/30 text-amber-200 rounded-full px-4 py-1.5 text-xs font-semibold mb-6">
                <Zap className="h-3.5 w-3.5" />
                Founding offer — {founding.spots_left} of {founding.seats} spots left at{" "}
                {founding.label_price}/year
              </div>
            )}
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
              One login. All your businesses.
              <br />
              <span style={{ color: "#60A5FA" }}>From ₹1,499/year.</span>
            </h1>
            <p className="mt-5 text-white/60 text-lg">
              GST billing, inventory and accounting for Indian businesses — on Android, iPhone,
              Windows, Mac and the web, always in sync.
            </p>
            <div className="mt-8">
              <Toggle
                yearly={yearly}
                setYearly={setYearly}
                savePct={data.max_yearly_save_pct}
              />
            </div>
            <p className="mt-3 text-white/40 text-xs">
              All prices exclude {data.gst_pct}% GST · {data.trial_days}-day free trial of
              Business, no card needed
            </p>
          </div>
        </div>
      </section>

      {/* Plan cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-16 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
          {data.tiers.map((t) => (
            <PlanCard
              key={t.tier}
              tier={t}
              yearly={yearly}
              founding={founding}
              onPick={pick}
            />
          ))}
        </div>

        {/* Add-ons — a side note, not part of the main choice */}
        <div className="mt-12">
          <p className="text-center text-xs uppercase tracking-wide text-slate-400 mb-3">
            Need just a bit more? Add it to any plan
          </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
          {data.addons.map((a) => (
            <div
              key={a.code}
              className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-4"
            >
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">{a.name}</h4>
                <p className="text-[13px] text-slate-500 mt-1">{a.description}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold text-slate-900">{inr(a.yearly_paise)}</div>
                <div className="text-[11px] text-slate-400">per year</div>
              </div>
            </div>
          ))}
        </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <h2 className="text-2xl font-extrabold text-slate-900 mb-6 text-center">
          Compare every plan
        </h2>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-5 py-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                  Feature
                </th>
                {data.tiers.map((t) => (
                  <th
                    key={t.tier}
                    className={`px-4 py-4 text-center font-bold ${
                      t.highlight ? "text-blue-600" : "text-slate-900"
                    }`}
                  >
                    {t.name}
                    <div className="text-[11px] font-normal text-slate-400 mt-0.5">
                      {t.tier === "FREE"
                        ? "₹0"
                        : `${inr(yearly ? t.yearly_paise : t.monthly_paise)}/${yearly ? "yr" : "mo"}`}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Businesses per login", data.tiers.map((t) =>
                  t.limits.businesses === -1 ? "Unlimited" : t.limits.businesses)],
                ["Users (incl. owner)", data.tiers.map((t) => t.limits.users)],
                ["Signed-in devices", data.tiers.map((t) =>
                  t.limits.devices === -1 ? "Unlimited" : t.limits.devices)],
                ["GST invoices", data.tiers.map(() => "Unlimited")],
                ["AI invoice scans", data.tiers.map((t) =>
                  t.credits_per_year
                    ? `${t.credits_per_year.toLocaleString("en-IN")} / year`
                    : `${t.signup_credits} to try`)],
                ["Support", data.tiers.map((t) => t.support)],
              ].map(([label, values]) => (
                <tr key={label} className="border-b border-slate-100">
                  <td className="px-5 py-3 text-slate-700 font-medium">{label}</td>
                  {values.map((v, i) => (
                    <td key={i} className="px-4 py-3 text-center text-slate-600">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-3 text-slate-700 font-medium">{r.label}</td>
                  {r.by.map((yes, i) => (
                    <td key={i} className="px-4 py-3 text-center">
                      {yes ? (
                        <Check className="h-4 w-4 text-emerald-500 mx-auto" />
                      ) : (
                        <X className="h-4 w-4 text-slate-300 mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="px-5 py-3 text-slate-700 font-medium">
                  “Made with BillingsEasy” on invoices
                </td>
                {data.tiers.map((t) => (
                  <td key={t.tier} className="px-4 py-3 text-center text-[13px] text-slate-500">
                    {t.features.includes("remove_branding") ? "Removed" : "Shown"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Credit packs */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-extrabold text-slate-900">Need more scans?</h2>
          <p className="text-slate-500 mt-2 text-[15px]">
            Run out of scans? Top up on any plan. Scans you buy never expire.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {data.packs.map((p) => (
            <div
              key={p.code}
              className={`relative bg-white rounded-xl p-6 text-center border ${
                p.badge ? "border-violet-400 shadow-lg shadow-violet-50" : "border-slate-200"
              }`}
            >
              {p.badge && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap">
                  {p.badge}
                </span>
              )}
              <div className="text-3xl font-extrabold text-slate-900">
                {p.credits.toLocaleString("en-IN")}
              </div>
              <div className="text-xs text-slate-400 mb-3">AI scans</div>
              <div className="text-xl font-bold" style={{ color: BRAND }}>
                {inr(p.paise)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
₹{(p.paise / 100 / p.credits).toFixed(2)} a scan
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <h2 className="text-2xl font-extrabold text-slate-900 mb-6 text-center">
          Questions, answered
        </h2>
        <div className="space-y-2">
          {FAQS.map((f, i) => (
            <div key={f.q} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="font-semibold text-slate-900 text-[15px]">{f.q}</span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${
                    openFaq === i ? "rotate-180" : ""
                  }`}
                />
              </button>
              {openFaq === i && (
                <p className="px-5 pb-4 text-[14px] text-slate-600 leading-relaxed">{f.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: NAVY }} className="text-white">
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h2 className="text-3xl font-extrabold">Start billing in five minutes</h2>
          <p className="text-white/60 mt-3">
            {data.trial_days} days of Business, free. No card, no lock-in.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 mt-7 rounded-xl px-6 py-3 font-semibold"
            style={{ background: BRAND }}
          >
            Create your free account <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="bg-slate-900 text-white/40 text-xs text-center py-6">
        © {new Date().getFullYear()} Nammahut Services Private Limited · Made in India
      </footer>
    </div>
  );
}
