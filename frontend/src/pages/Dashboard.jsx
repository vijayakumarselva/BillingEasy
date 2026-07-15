import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { inr, inrShort, fmtDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  TrendingUp, ShoppingCart, ArrowDownToLine, ArrowUpFromLine,
  Plus, FileText, Wallet, Receipt, Landmark, PiggyBank,
  Users, Package, ChevronRight, Scan,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();
  const { currentOrg } = useAuth();
  const role = currentOrg?.role;

  // POS staff should never see the dashboard — send them to their screen
  useEffect(() => {
    if (role === "pos-staff" || role === "restaurant-staff") {
      nav(role === "pos-staff" ? "/pos-screen" : "/restaurant", { replace: true });
    }
  }, [role, nav]);

  useEffect(() => {
    api.get("/dashboard").then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  const metrics = [
    { key: "sales_total",    label: "Sales",      icon: TrendingUp,      color: "bg-emerald-500", light: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-600 dark:text-emerald-400" },
    { key: "purchase_total", label: "Purchases",  icon: ShoppingCart,    color: "bg-blue-500",    light: "bg-blue-50 dark:bg-blue-950/40",       text: "text-blue-600 dark:text-blue-400" },
    { key: "receivable",     label: "Receivable", icon: ArrowDownToLine, color: "bg-amber-500",   light: "bg-amber-50 dark:bg-amber-950/40",     text: "text-amber-600 dark:text-amber-400" },
    { key: "payable",        label: "Payable",    icon: ArrowUpFromLine, color: "bg-red-500",     light: "bg-red-50 dark:bg-red-950/40",         text: "text-red-600 dark:text-red-400" },
    { key: "gst_payable",    label: "GST",        icon: Landmark,        color: "bg-violet-500",  light: "bg-violet-50 dark:bg-violet-950/40",   text: "text-violet-600 dark:text-violet-400" },
    { key: "net_profit",     label: "Net Profit", icon: PiggyBank,       color: "bg-cyan-500",    light: "bg-cyan-50 dark:bg-cyan-950/40",       text: "text-cyan-600 dark:text-cyan-400" },
  ];

  const quickActions = [
    { label: "New Invoice", icon: FileText,   to: "/sales/new",  color: "bg-emerald-500" },
    { label: "Purchase",    icon: ShoppingCart,to: "/purchases",  color: "bg-blue-500" },
    { label: "Expense",     icon: Receipt,    to: "/expenses",   color: "bg-amber-500" },
    { label: "POS / Counter",icon: Scan,      to: "/pos",        color: "bg-indigo-500" },
  ];

  return (
    <div data-testid="dashboard-page">

      {/* ══════════ MOBILE LAYOUT ══════════ */}
      <div className="md:hidden space-y-4 pb-2">

        {/* Greeting header */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 text-white">
          <p className="text-sm opacity-80">{greeting} 👋</p>
          <h1 className="text-xl font-bold mt-0.5 leading-tight">{currentOrg?.name || "Your Business"}</h1>
          <p className="text-xs opacity-60 mt-1">{today}</p>
        </div>

        {/* Metric cards 2x2 */}
        <div className="grid grid-cols-2 gap-3">
          {metrics.slice(0, 4).map(m => (
            <div key={m.key} className={`rounded-2xl p-4 ${m.light}`}>
              <div className={`w-9 h-9 rounded-xl ${m.color} flex items-center justify-center mb-3`}>
                <m.icon className="h-4 w-4 text-white" />
              </div>
              {loading
                ? <Skeleton className="h-6 w-20 mb-1" />
                : <p className="text-lg font-bold text-gray-900 dark:text-white">{inrShort(data?.[m.key] || 0)}</p>
              }
              <p className={`text-xs font-medium ${m.text}`}>{m.label}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">This month</p>
            </div>
          ))}
        </div>

        {/* GST + Net Profit row */}
        <div className="grid grid-cols-2 gap-3">
          {metrics.slice(4).map(m => (
            <div key={m.key} className={`rounded-2xl p-4 ${m.light}`}>
              <div className={`w-9 h-9 rounded-xl ${m.color} flex items-center justify-center mb-3`}>
                <m.icon className="h-4 w-4 text-white" />
              </div>
              {loading
                ? <Skeleton className="h-6 w-20 mb-1" />
                : <p className="text-lg font-bold text-gray-900 dark:text-white">{inrShort(data?.[m.key] || 0)}</p>
              }
              <p className={`text-xs font-medium ${m.text}`}>{m.label}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">This month</p>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div>
          <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Quick Actions</p>
          <div className="grid grid-cols-4 gap-2">
            {quickActions.map(a => (
              <button key={a.to} onClick={() => nav(a.to)}
                className="flex flex-col items-center gap-2 py-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm active:scale-95 transition-transform">
                <div className={`w-10 h-10 rounded-xl ${a.color} flex items-center justify-center`}>
                  <a.icon className="h-5 w-5 text-white" />
                </div>
                <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-200 leading-tight text-center">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Sales chart */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-800 dark:text-white">Sales Trend</p>
            <Link to="/sales" className="text-xs text-blue-600 dark:text-blue-400 font-medium">View all →</Link>
          </div>
          <div style={{ height: 140 }}>
            {loading ? <Skeleton className="h-full w-full rounded-xl" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.chart || []}>
                  <defs>
                    <linearGradient id="mg1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tickFormatter={v => inrShort(v).replace("₹", "")} tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip formatter={v => inr(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                  <Area type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} fill="url(#mg1)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent invoices — card style */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <p className="text-sm font-bold text-gray-800 dark:text-white">Recent Invoices</p>
            <Link to="/sales" className="text-xs text-blue-600 dark:text-blue-400 font-medium">View all →</Link>
          </div>
          {loading ? (
            <div className="p-4 space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
            </div>
          ) : (data?.recent_invoices || []).length === 0 ? (
            <div className="py-10 text-center text-gray-400 dark:text-gray-500">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No invoices yet</p>
              <button onClick={() => nav("/sales/new")} className="mt-3 text-sm text-blue-600 font-semibold">+ Create first invoice</button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-700">
              {(data?.recent_invoices || []).map(inv => (
                <button key={inv.id} onClick={() => nav(`/sales/${inv.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-750 active:bg-gray-100 transition-colors text-left">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{inv.party_name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{inv.invoice_no} · {fmtDate(inv.invoice_date)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-800 dark:text-white">{inrShort(inv.totals.grand_total)}</p>
                    <Badge variant={inv.status === "finalized" ? "default" : "secondary"} className="text-[9px] px-1.5 py-0 mt-0.5">
                      {inv.status}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700">
            <button onClick={() => nav("/sales/new")}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold">
              <Plus className="h-4 w-4" /> New Invoice
            </button>
          </div>
        </div>

        {/* Top customers */}
        {(data?.top_customers || []).length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <p className="text-sm font-bold text-gray-800 dark:text-white">Top Customers</p>
              <Link to="/parties" className="text-xs text-blue-600 dark:text-blue-400 font-medium">All parties →</Link>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-700">
              {(data.top_customers || []).map((c, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{i + 1}</span>
                  </div>
                  <p className="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate">{c.name}</p>
                  <p className="text-sm font-bold text-gray-800 dark:text-white">{inrShort(c.amount)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ══════════ DESKTOP LAYOUT (unchanged) ══════════ */}
      <div className="hidden md:block space-y-3">
        <div className="flex items-center justify-between px-3 py-1.5 rounded text-white text-xs font-semibold"
          style={{ background: "hsl(158 64% 26%)" }}>
          <span className="uppercase tracking-widest">Gateway of Tally · {currentOrg?.name || "Your Company"}</span>
          <span className="opacity-75 font-normal">{today}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Sales Invoice",   icon: FileText,    to: "/sales/new",  shortcut: "F8" },
            { label: "Purchase Entry",  icon: ShoppingCart,to: "/purchases",  shortcut: "F9" },
            { label: "Receipt",         icon: Wallet,      to: "/payments",   shortcut: "F6" },
            { label: "Expense Entry",   icon: Receipt,     to: "/expenses",   shortcut: "" },
          ].map(btn => (
            <button key={btn.to} onClick={() => nav(btn.to)}
              className="flex items-center gap-2 px-3 py-2 rounded border text-left text-xs font-medium transition-colors hover:bg-emerald-700 hover:text-white hover:border-emerald-700"
              style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
              <btn.icon className="h-4 w-4 shrink-0" />
              <div>
                {btn.shortcut && <div className="text-[10px] opacity-50 font-bold">{btn.shortcut}</div>}
                <div>{btn.label}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {metrics.map(m => (
            <div key={m.key} data-testid={`metric-${m.key}`} className="rounded border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
              <div className={`px-2 py-1 text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${m.color}`}>
                <m.icon className="h-3 w-3" />{m.label}
              </div>
              <div className="px-2 py-2 bg-card">
                {loading ? <Skeleton className="h-5 w-16" /> : <div className="font-mono text-sm font-bold">{inrShort(data?.[m.key] || 0)}</div>}
                <div className="text-[10px] text-muted-foreground mt-0.5">This month</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-5 gap-3">
          <div className="lg:col-span-3 data-grid">
            <div className="data-grid-header">
              <span>SALES TREND — LAST 6 MONTHS</span>
              <Link to="/sales" className="text-[11px] opacity-75 hover:opacity-100">View All →</Link>
            </div>
            <div className="p-3 bg-card" style={{ height: 180 }}>
              {loading ? <Skeleton className="h-full w-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.chart || []}>
                    <defs>
                      <linearGradient id="tg1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(158 64% 26%)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="hsl(158 64% 26%)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tickFormatter={v => inrShort(v).replace("₹", "")} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip formatter={v => inr(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 4, fontSize: 11 }} />
                    <Area type="monotone" dataKey="sales" stroke="hsl(158 64% 26%)" strokeWidth={2} fill="url(#tg1)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 data-grid">
            <div className="data-grid-header">
              <span>TOP CUSTOMERS</span>
              <Link to="/parties" className="text-[11px] opacity-75 hover:opacity-100">Parties →</Link>
            </div>
            {loading
              ? [1,2,3,4,5].map(i => <div key={i} className="data-grid-row"><Skeleton className="h-4 w-full" /></div>)
              : (data?.top_customers || []).length === 0
                ? <div className="px-3 py-6 text-center text-xs text-muted-foreground">No sales yet</div>
                : (data?.top_customers || []).map((c, i) => (
                    <div key={i} className="data-grid-row">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold w-4 shrink-0 text-emerald-700">{i + 1}</span>
                        <span className="text-xs truncate">{c.name}</span>
                      </div>
                      <span className="font-mono text-xs font-semibold">{inrShort(c.amount)}</span>
                    </div>
                  ))
            }
            <div className="data-grid-footer">
              <span>All Parties</span>
              <Link to="/parties" className="text-xs text-emerald-700"><Users className="h-3 w-3" /></Link>
            </div>
          </div>
        </div>

        <div className="data-grid">
          <div className="data-grid-header">
            <span>RECENT INVOICES</span>
            <Link to="/sales" className="text-[11px] opacity-75 hover:opacity-100">View All Vouchers →</Link>
          </div>
          <div className="overflow-x-auto bg-card">
            <table className="app-table">
              <thead><tr><th>#</th><th>Party Name</th><th>Date</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {loading
                  ? [1,2,3].map(i => <tr key={i}><td colSpan={5}><Skeleton className="h-5 w-full" /></td></tr>)
                  : (data?.recent_invoices || []).length === 0
                    ? <tr><td colSpan={5} className="text-center text-muted-foreground py-6 text-xs">No invoices yet</td></tr>
                    : (data?.recent_invoices || []).map(inv => (
                        <tr key={inv.id} className="cursor-pointer" onClick={() => nav(`/sales/${inv.id}`)}>
                          <td className="font-mono text-xs text-emerald-700">{inv.invoice_no}</td>
                          <td className="text-xs font-medium">{inv.party_name}</td>
                          <td className="text-xs text-muted-foreground">{fmtDate(inv.invoice_date)}</td>
                          <td className="num text-xs font-semibold">{inr(inv.totals.grand_total)}</td>
                          <td><Badge variant={inv.status === "finalized" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 rounded-sm">{inv.status}</Badge></td>
                        </tr>
                      ))
                }
              </tbody>
            </table>
          </div>
          <div className="data-grid-footer">
            <button onClick={() => nav("/sales/new")} className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
              <Plus className="h-3.5 w-3.5" /> New Sales Voucher
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
