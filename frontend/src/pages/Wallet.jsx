import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { Wallet as WalletIcon, Zap, TrendingDown, TrendingUp, RefreshCw, ShoppingCart } from "lucide-react";
import { inr } from "@/lib/format";

const ACTION_LABELS = {
  "invoice.create":        "Create Invoice",
  "purchase.create":       "Record Purchase",
  "payment.create":        "Record Payment",
  "expense.create":        "Log Expense",
  "ai.query":              "Ask AI",
  "bank_statement.upload": "Upload Bank Statement",
  "report.export":         "Export Report",
  "gst.export":            "Export GST Return",
  "einvoice.generate":     "Generate e-Invoice",
  "topup":                 "Top Up",
};

export default function Wallet() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get("/wallet");
      setData(d);
    } catch { /* silently ignore — wallet may not be set up yet */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Wallet & Credits</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Credits are consumed per action. New orgs start with 100 free credits.
        </p>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 flex items-center gap-4">
          <div className="rounded-full bg-blue-100 dark:bg-blue-500/10 p-3">
            <WalletIcon className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Current Balance</p>
            <p className="text-3xl font-bold text-blue-600">{data.balance}</p>
            <p className="text-xs text-muted-foreground">credits</p>
          </div>
        </Card>
        <Card className="p-5 flex items-center gap-4">
          <div className="rounded-full bg-green-100 dark:bg-green-500/10 p-3">
            <TrendingUp className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Earned</p>
            <p className="text-2xl font-bold text-green-600">{data.total_earned}</p>
          </div>
        </Card>
        <Card className="p-5 flex items-center gap-4">
          <div className="rounded-full bg-red-100 dark:bg-red-500/10 p-3">
            <TrendingDown className="h-6 w-6 text-red-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Spent</p>
            <p className="text-2xl font-bold text-red-500">{data.total_spent}</p>
          </div>
        </Card>
      </div>

      {/* Buy credits CTA */}
      <Card className="p-5 flex items-center justify-between flex-wrap gap-4"
        style={{ background: "hsl(var(--tally-green-light))", borderColor: "hsl(var(--tally-green) / 0.3)" }}>
        <div>
          <h2 className="font-semibold" style={{ color: "hsl(var(--tally-green))" }}>Need more credits?</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Buy credit packs via Cashfree — UPI, Cards, Net Banking. Pay ₹149 onwards.
          </p>
        </div>
        <Button onClick={() => nav("/credits")}
          style={{ background: "hsl(var(--tally-green))", color: "white" }}
          className="gap-2 shrink-0">
          <ShoppingCart className="h-4 w-4" /> Buy Credits
        </Button>
      </Card>

      {/* Credit costs table */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <span className="font-semibold text-sm">Credit Cost per Action</span>
        </div>
        <div className="divide-y">
          {Object.entries(data.costs).map(([action, cost]) => (
            <div key={action} className="px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {ACTION_LABELS[action] || action}
              </span>
              <Badge variant="outline" className="font-mono text-blue-600 border-blue-200">
                {cost} cr
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* Transaction history */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <span className="font-semibold text-sm">Transaction History</span>
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>
        {data.transactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No transactions yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Action</th>
                  <th className="px-4 py-2 text-left">Reference</th>
                  <th className="px-4 py-2 text-right">Credits</th>
                  <th className="px-4 py-2 text-right">Balance After</th>
                  <th className="px-4 py-2 text-left">Time</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((t, i) => (
                  <tr key={i} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2 font-medium">
                      {t.action === "topup" ? (
                        <span className="text-green-600">↑ Top Up</span>
                      ) : (
                        <span className="text-gray-700 dark:text-gray-300">
                          {ACTION_LABELS[t.action] || t.action}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-400 text-xs">{t.ref || "—"}</td>
                    <td className={`px-4 py-2 text-right font-mono font-semibold ${t.cost < 0 ? "text-green-600" : "text-red-500"}`}>
                      {t.cost < 0 ? `+${Math.abs(t.cost)}` : `-${t.cost}`}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-gray-600">{t.balance_after ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-gray-400">
                      {new Date(t.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
