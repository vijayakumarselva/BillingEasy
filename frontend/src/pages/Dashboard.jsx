import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { inr, inrShort, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar,
} from "recharts";
import {
  TrendingUp, ShoppingCart, ArrowDownToLine, ArrowUpFromLine,
  Plus, FileText, Wallet, Receipt, Landmark, PiggyBank,
  Users, Package, ChevronDown, ChevronUp, X, Lightbulb,
} from "lucide-react";

const metrics = [
  { key: "sales_total", label: "Sales this month", hint: "Money earned from customers", icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { key: "purchase_total", label: "Purchases", hint: "Bought from suppliers", icon: ShoppingCart, color: "text-blue-500", bg: "bg-blue-500/10" },
  { key: "receivable", label: "Money to receive", hint: "Pending from customers", icon: ArrowDownToLine, color: "text-amber-500", bg: "bg-amber-500/10" },
  { key: "payable", label: "Money to pay", hint: "Owed to suppliers", icon: ArrowUpFromLine, color: "text-rose-500", bg: "bg-rose-500/10" },
  { key: "gst_payable", label: "GST to pay", hint: "Tax due this month", icon: Landmark, color: "text-purple-500", bg: "bg-purple-500/10" },
  { key: "net_profit", label: "Estimated profit", hint: "Sales − Purchases − Expenses", icon: PiggyBank, color: "text-blue-600", bg: "bg-blue-600/10" },
];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    api.get("/dashboard").then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);
  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Your business at a glance — this month's numbers.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => nav("/sales/new")} className="bg-blue-600 hover:bg-blue-700" data-testid="quick-new-invoice">
            <Plus className="h-4 w-4 mr-1.5" /> Create Invoice
          </Button>
          <Button variant="outline" onClick={() => nav("/purchases")} data-testid="quick-new-purchase">
            <ShoppingCart className="h-4 w-4 mr-1.5" /> Record Purchase
          </Button>
          <Button variant="outline" onClick={() => nav("/expenses")} data-testid="quick-new-expense">
            <Receipt className="h-4 w-4 mr-1.5" /> Add Expense
          </Button>
          <Button variant="outline" onClick={() => nav("/payments")} data-testid="quick-new-payment">
            <Wallet className="h-4 w-4 mr-1.5" /> Receive Payment
          </Button>
        </div>
      </div>

      <QuickStartGuide />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {metrics.map(m => (
          <div key={m.key} className="metric-card" data-testid={`metric-${m.key}`} title={m.hint}>
            <div className={`h-9 w-9 rounded-md ${m.bg} ${m.color} grid place-items-center mb-3`}>
              <m.icon className="h-4 w-4" />
            </div>
            <div className="text-xs font-medium">{m.label}</div>
            <div className="text-[10px] text-muted-foreground">{m.hint}</div>
            <div className="font-mono-fin text-lg sm:text-xl font-semibold mt-1">
              {loading ? <Skeleton className="h-6 w-20" /> : inrShort(data?.[m.key] || 0)}
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-lg">Sales — Last 6 months</h3>
              <p className="text-xs text-muted-foreground">Monthly revenue trend</p>
            </div>
          </div>
          <div className="h-64 w-full min-h-[256px]">
            {loading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.chart || []}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1D4ED8" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#1D4ED8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tickFormatter={(v) => inrShort(v).replace("₹", "")} tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))" />
                  <Tooltip formatter={(v) => inr(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Area type="monotone" dataKey="sales" stroke="#1D4ED8" strokeWidth={2} fill="url(#g1)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-lg mb-1">Top customers</h3>
          <p className="text-xs text-muted-foreground mb-4">By revenue (all-time)</p>
          <div className="space-y-3">
            {loading ? [1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />) :
              (data?.top_customers || []).map((c, i) => (
                <div key={i} className="flex items-center justify-between" data-testid={`top-cust-${i}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-md bg-blue-600/10 text-blue-600 grid place-items-center text-xs font-semibold">{i+1}</div>
                    <div className="text-sm font-medium truncate">{c.name}</div>
                  </div>
                  <div className="font-mono-fin text-sm">{inrShort(c.amount)}</div>
                </div>
              ))
            }
            {!loading && (data?.top_customers || []).length === 0 && <div className="text-sm text-muted-foreground">No sales yet.</div>}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">Recent invoices</h3>
            <Link to="/sales" className="text-xs text-blue-600 hover:underline" data-testid="view-all-invoices">View all →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="app-table">
              <thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {loading ? [1,2,3].map(i => <tr key={i}><td colSpan={5}><Skeleton className="h-8 w-full" /></td></tr>) :
                  (data?.recent_invoices || []).map(inv => (
                    <tr key={inv.id} className="cursor-pointer" onClick={() => nav(`/sales/${inv.id}`)} data-testid={`recent-inv-${inv.invoice_no}`}>
                      <td className="font-mono-fin text-blue-600">{inv.invoice_no}</td>
                      <td className="font-medium">{inv.party_name}</td>
                      <td className="text-muted-foreground">{fmtDate(inv.invoice_date)}</td>
                      <td className="num">{inr(inv.totals.grand_total)}</td>
                      <td><Badge variant={inv.status === "finalized" ? "default" : "secondary"}>{inv.status}</Badge></td>
                    </tr>
                  ))
                }
                {!loading && (data?.recent_invoices || []).length === 0 && (
                  <tr><td colSpan={5} className="text-center text-muted-foreground py-8">No invoices yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-lg mb-1">Top products</h3>
          <p className="text-xs text-muted-foreground mb-4">By sales value</p>
          <div className="h-56 w-full min-h-[224px]">
            {loading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.top_products || []} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => inrShort(v).replace("₹","")} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip formatter={(v) => inr(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="amount" fill="#1D4ED8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function QuickStartGuide() {
  const nav = useNavigate();
  const [hidden, setHidden] = useState(() => localStorage.getItem("be_qsg_hidden") === "1");
  const [open, setOpen] = useState(true);
  if (hidden) return null;
  const dismiss = (e) => { e.stopPropagation(); localStorage.setItem("be_qsg_hidden", "1"); setHidden(true); };

  const steps = [
    { icon: Users, label: "Add customer", hint: "Add who you sell to. Phone + GSTIN is enough.", to: "/parties" },
    { icon: Package, label: "Add product", hint: "Name, sale price, GST %. HSN is optional.", to: "/products" },
    { icon: FileText, label: "Create first invoice", hint: "GST auto-calculated. PDF & WhatsApp ready.", to: "/sales/new" },
  ];

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-500/5 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-3 text-left" data-testid="qsg-toggle">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-blue-600" />
          <span className="font-semibold text-sm">Quick start — 3 simple steps to your first GST invoice</span>
        </div>
        <div className="flex items-center gap-2">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span onClick={dismiss} role="button" tabIndex={0} className="p-1 hover:bg-blue-100 dark:hover:bg-blue-500/10 rounded" data-testid="qsg-dismiss">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </div>
      </button>
      {open && (
        <div className="grid sm:grid-cols-3 gap-3 px-5 pb-4">
          {steps.map((s, i) => (
            <button key={i} onClick={() => nav(s.to)} data-testid={`qsg-step-${i+1}`}
              className="text-left rounded-lg border border-blue-200/60 dark:border-blue-500/20 bg-white dark:bg-slate-900 p-4 hover:border-blue-500 hover:shadow-sm transition">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="h-6 w-6 rounded-full bg-blue-600 text-white text-xs font-semibold grid place-items-center">{i+1}</div>
                <s.icon className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-sm">{s.label}</span>
              </div>
              <div className="text-xs text-muted-foreground pl-8">{s.hint}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

