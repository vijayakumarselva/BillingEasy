import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Zap, CheckCircle2, Coins, TrendingDown, Info, Shield } from "lucide-react";

const COLOR = {
  slate:  { ring: "ring-slate-200",  btn: "bg-slate-800 hover:bg-slate-900",   badge: "bg-slate-100 text-slate-700" },
  blue:   { ring: "ring-blue-300",   btn: "bg-blue-600 hover:bg-blue-700",     badge: "bg-blue-100 text-blue-700" },
  violet: { ring: "ring-violet-300", btn: "bg-violet-600 hover:bg-violet-700", badge: "bg-violet-100 text-violet-700" },
};

const ACTION_ROWS = [
  { action: "invoice.create",        label: "Create Invoice",           icon: "📄", note: "Per invoice generated" },
  { action: "purchase.create",       label: "Record Purchase",          icon: "🛒", note: "Per bill from supplier" },
  { action: "payment.create",        label: "Record Payment",           icon: "💳", note: "Per payment entry" },
  { action: "expense.create",        label: "Log Expense",              icon: "🧾", note: "Per expense entry" },
  { action: "ai.query",              label: "Ask AI (Bookkeeper)",      icon: "🤖", note: "Per AI conversation turn" },
  { action: "bank_statement.upload", label: "Upload Bank Statement",    icon: "🏦", note: "Per CSV upload & auto-match" },
  { action: "report.export",         label: "Export Report",            icon: "📊", note: "Per PDF / Excel export" },
  { action: "gst.export",            label: "Export GST Return",        icon: "🇮🇳", note: "GSTR-1 or GSTR-3B export" },
  { action: "einvoice.generate",     label: "Generate e-Invoice (IRN)", icon: "⚡", note: "Per IRN generated" },
];

export default function Credits() {
  const [packs, setPacks]     = useState([]);
  const [wallet, setWallet]   = useState(null);
  const [buying, setBuying]   = useState(null);

  useEffect(() => {
    api.get("/wallet/packs").then(r => setPacks(r.data)).catch(() => {});
    api.get("/wallet").then(r => setWallet(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!document.getElementById("cashfree-sdk")) {
      const s = document.createElement("script");
      s.id = "cashfree-sdk";
      s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
      document.head.appendChild(s);
    }
  }, []);

  const buy = async (pack) => {
    setBuying(pack.id);
    try {
      const { data } = await api.post("/wallet/create-order", { pack_id: pack.id });

      if (data.mock) {
        // Mock mode — verify immediately without opening payment UI
        const verify = await api.post("/wallet/verify-order", { order_id: data.order_id });
        toast.success(`${pack.credits.toLocaleString()} credits added! Balance: ${verify.data.balance}`);
        setWallet(w => ({ ...w, balance: verify.data.balance }));
        return;
      }

      // Real Cashfree payment — open checkout modal
      const cashfree = window.Cashfree({ mode: data.env === "sandbox" ? "sandbox" : "production" });
      const checkoutOptions = {
        paymentSessionId: data.payment_session_id,
        redirectTarget: "_modal",
      };
      const result = await cashfree.checkout(checkoutOptions);

      if (result.error) {
        toast.error(result.error.message || "Payment failed");
        return;
      }
      if (result.paymentDetails) {
        const verify = await api.post("/wallet/verify-order", { order_id: data.order_id });
        toast.success(`${pack.credits.toLocaleString()} credits added! Balance: ${verify.data.balance}`);
        setWallet(w => ({ ...w, balance: verify.data.balance }));
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Payment failed");
    } finally { setBuying(null); }
  };

  const crPerRupee = (pack) => (pack.credits / pack.price).toFixed(2);

  return (
    <div className="space-y-10 pb-12">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Credit Plans</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pay only for what you use. Buy credits, spend them on actions. No monthly lock-in.
          </p>
        </div>
        {wallet && (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20">
            <Coins className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-xs text-blue-500">Current Balance</p>
              <p className="text-xl font-bold text-blue-600">{wallet.balance.toLocaleString()} credits</p>
            </div>
          </div>
        )}
      </div>

      {/* Welcome bonus banner */}
      <div className="rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 p-5 text-white flex items-center gap-4">
        <div className="text-3xl">🎁</div>
        <div>
          <div className="font-semibold text-lg">50 Free Credits on Signup</div>
          <div className="text-sm text-blue-100">Every new account starts with 50 free credits — enough to create ~16 invoices or try the AI bookkeeper.</div>
        </div>
      </div>

      {/* Credit packs */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Buy Credits</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {packs.map((pack) => {
            const c = COLOR[pack.color] || COLOR.blue;
            const isPopular = pack.badge === "Most Popular";
            return (
              <div key={pack.id}
                className={`relative rounded-2xl border-2 p-5 flex flex-col bg-white dark:bg-gray-900 ring-2 ${c.ring} ${isPopular ? "shadow-lg scale-[1.02]" : ""} transition-all`}>
                {pack.badge && (
                  <span className={`absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full ${c.badge}`}>
                    {pack.badge}
                  </span>
                )}

                <div className="mb-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{pack.name}</p>
                  <p className="text-3xl font-bold mt-1">
                    {pack.credits.toLocaleString()}
                    <span className="text-base font-normal text-muted-foreground ml-1">credits</span>
                  </p>
                </div>

                <div className="mb-4 space-y-1">
                  <p className="text-2xl font-bold">₹{pack.price.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">₹{pack.per_credit.toFixed(2)} per credit</p>
                  {pack.savings_pct > 0 && (
                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs">
                      <TrendingDown className="h-3 w-3 mr-1" /> Save {pack.savings_pct}%
                    </Badge>
                  )}
                </div>

                <div className="text-xs text-muted-foreground mb-4 space-y-1">
                  <div className="flex justify-between"><span>Credits/₹</span><span className="font-medium text-foreground">{crPerRupee(pack)}</span></div>
                  <div className="flex justify-between"><span>~Invoices</span><span className="font-medium text-foreground">{Math.floor(pack.credits / 3).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>~AI queries</span><span className="font-medium text-foreground">{Math.floor(pack.credits / 10).toLocaleString()}</span></div>
                </div>

                <Button className={`w-full mt-auto ${c.btn} text-white`}
                  onClick={() => buy(pack)} disabled={buying === pack.id}>
                  {buying === pack.id ? "Processing…" : `Pay ₹${pack.price.toLocaleString()} · Cashfree`}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" /> Secured by Cashfree Payments · PCI-DSS compliant · UPI, Cards, Net Banking accepted
        </p>
      </div>

      {/* What credits cost — action table */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Credit Cost per Action</h2>
        <p className="text-sm text-muted-foreground mb-4">Every action on BillingsEasy costs a fixed number of credits. Super admin can adjust these at any time.</p>
        {wallet ? (
          <div className="rounded-2xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Credits</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">~₹ Cost</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Note</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your balance covers</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ACTION_ROWS.map((row) => {
                  const cost = wallet.costs?.[row.action] ?? "—";
                  const rupee = cost !== "—" ? (cost * 1.30).toFixed(2) : "—";
                  const canDo = cost !== "—" ? Math.floor(wallet.balance / cost) : "∞";
                  return (
                    <tr key={row.action} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="text-lg">{row.icon}</span>
                          <span className="font-medium">{row.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className="font-mono text-blue-600 border-blue-200 bg-blue-50">
                          {cost} cr
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground text-xs">₹{rupee}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">{row.note}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-semibold text-green-600">
                          {canDo.toLocaleString()} times
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
        )}
      </div>

      {/* Cost transparency section */}
      <div className="rounded-2xl border p-6 bg-gray-50 dark:bg-gray-900/50">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" /> Transparent Pricing
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="font-medium">What we spend</p>
            <ul className="mt-1.5 space-y-1 text-muted-foreground text-xs">
              <li>☁️ Cloud hosting (Railway)</li>
              <li>🗄️ Database (MongoDB)</li>
              <li>🤖 AI API (Claude by Anthropic)</li>
              <li>🌐 CDN & edge (Netlify)</li>
              <li>🔒 SSL, domain, security</li>
            </ul>
          </div>
          <div>
            <p className="font-medium">Why credits?</p>
            <ul className="mt-1.5 space-y-1 text-muted-foreground text-xs">
              <li>✅ Pay only for what you use</li>
              <li>✅ No surprise monthly bill</li>
              <li>✅ AI usage stays fair-cost</li>
              <li>✅ Credits never expire</li>
              <li>✅ Volume packs save up to 46%</li>
            </ul>
          </div>
          <div>
            <p className="font-medium">Typical monthly usage</p>
            <ul className="mt-1.5 space-y-1 text-muted-foreground text-xs">
              <li>📄 100 invoices = 300 credits</li>
              <li>🧾 50 expenses = 50 credits</li>
              <li>🤖 20 AI queries = 200 credits</li>
              <li>📊 4 exports = 20 credits</li>
              <li className="font-semibold text-foreground pt-1">≈ 570 credits/month → ₹741*</li>
            </ul>
            <p className="text-[10px] text-muted-foreground mt-1">*at Starter pack rate of ₹1.30/credit</p>
          </div>
        </div>
      </div>

    </div>
  );
}
