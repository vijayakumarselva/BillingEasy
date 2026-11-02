import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import StatTile, { compactInr } from "@/components/StatTile";
import { inr, inrShort, fmtDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  TrendingUp, ShoppingCart, ArrowDownToLine, ArrowUpFromLine,
  Plus, FileText, Wallet, Receipt, Landmark, PiggyBank,
  Users, Package, ChevronRight, Scan, Banknote, Smartphone,
  AlertTriangle, ShoppingBag, TrendingDown, Minus,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const nav = useNavigate();
  const { currentOrg } = useAuth();
  const role = currentOrg?.role;
  const orgId = currentOrg?.id || localStorage.getItem("be_org_id");
  const [bizMode, setBizMode] = useState(() => localStorage.getItem(`biz_mode_${orgId}`) || "b2b");

  // Keep bizMode in sync when AppLayout changes it
  useEffect(() => {
    const handler = (e) => {
      const newMode = e.detail?.mode || localStorage.getItem(`biz_mode_${orgId}`) || "b2b";
      setBizMode(newMode);
    };
    window.addEventListener("be:mode-changed", handler);
    return () => window.removeEventListener("be:mode-changed", handler);
  }, [orgId]);

  // POS staff should never see the dashboard — send them to their screen
  useEffect(() => {
    if (role === "pos-staff" || role === "restaurant-staff") {
      nav(role === "pos-staff" ? "/pos-screen" : "/restaurant", { replace: true });
    }
  }, [role, nav]);

  // A dashboard that cannot load must say so. Rendering `data?.x || 0` on a
  // failed request paints a confident ₹0 across every card, which reads as
  // "you have no business" rather than "this did not load".
  const load = useCallback(() => {
    const endpoint = bizMode === "pos" ? "/dashboard/pos" : "/dashboard";
    setLoading(true);
    setError("");
    api.get(endpoint)
      .then((r) => { setData(r.data); setError(""); })
      .catch((e) => {
        const status = e?.response?.status;
        const detail = e?.response?.data?.detail;
        setData(null);
        setError(
          !e?.response ? "No connection to the server."
          : status === 403 ? "You do not have access to these figures."
          : typeof detail === "string" ? detail
          : `The server returned an error (${status || "unknown"}).`);
      })
      .finally(() => setLoading(false));
  }, [bizMode]);

  useEffect(() => { load(); }, [load]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  // Six months of sales from the chart the server already returns, so the
  // sparkline costs nothing extra.
  const salesSeries = (data?.chart || []).map((c) => c.sales);
  const prev = data?.previous || {};
  const prevLabel = prev.label || "last month";

  const tiles = [
    { key: "sales_total",    label: "Sales",      period: "This month", upIsGood: true,
      previous: prev.sales_total, series: salesSeries, to: "/sales" },
    { key: "receivable",     label: "Receivable", period: "Outstanding", upIsGood: false,
      to: "/parties" },
    { key: "cash_bank",      label: "Cash & bank", period: "Today", upIsGood: true,
      to: "/accounting" },
    { key: "purchase_total", label: "Purchases",  period: "This month", upIsGood: false,
      previous: prev.purchase_total, to: "/purchases" },
    { key: "payable",        label: "Payable",    period: "Outstanding", upIsGood: false,
      to: "/parties" },
    { key: "gst_payable",    label: "GST payable", period: "This month", upIsGood: false,
      previous: prev.gst_payable, to: "/gst" },
  ];

  const metrics = [
    { key: "sales_total",    period: "This month", label: "Sales",      icon: TrendingUp,      color: "bg-emerald-500", light: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-600 dark:text-emerald-400" },
    { key: "purchase_total", period: "This month", label: "Purchases",  icon: ShoppingCart,    color: "bg-blue-500",    light: "bg-blue-50 dark:bg-blue-950/40",       text: "text-blue-600 dark:text-blue-400" },
    { key: "receivable",     period: "Outstanding", label: "Receivable", icon: ArrowDownToLine, color: "bg-amber-500",   light: "bg-amber-50 dark:bg-amber-950/40",     text: "text-amber-600 dark:text-amber-400" },
    { key: "payable",        period: "Outstanding", label: "Payable",    icon: ArrowUpFromLine, color: "bg-red-500",     light: "bg-red-50 dark:bg-red-950/40",         text: "text-red-600 dark:text-red-400" },
    { key: "gst_payable",    period: "This month", label: "GST",        icon: Landmark,        color: "bg-violet-500",  light: "bg-violet-50 dark:bg-violet-950/40",   text: "text-violet-600 dark:text-violet-400" },
    { key: "net_profit",     period: "This month", label: "Net Profit", icon: PiggyBank,       color: "bg-cyan-500",    light: "bg-cyan-50 dark:bg-cyan-950/40",       text: "text-cyan-600 dark:text-cyan-400" },
  ];

  const quickActions = [
    { label: "New Invoice", icon: FileText,   to: "/sales/new",  color: "bg-emerald-500" },
    { label: "Purchase",    icon: ShoppingCart,to: "/purchases",  color: "bg-blue-500" },
    { label: "Expense",     icon: Receipt,    to: "/expenses",   color: "bg-amber-500" },
    { label: "POS / Counter",icon: Scan,      to: "/pos",        color: "bg-indigo-500" },
  ];

  if (bizMode === "pos") return <POSDashboard data={data} loading={loading} orgName={currentOrg?.name} today={today} greeting={greeting} nav={nav} />;

  // Shown above both layouts, so a failure is never mistaken for zero takings.
  const errorBanner = error ? (
    <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950/20 p-4"
         data-testid="dashboard-error">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-rose-800 dark:text-rose-300 text-sm">
            Your figures could not be loaded
          </p>
          <p className="text-xs text-rose-700/80 dark:text-rose-300/80 mt-0.5">
            {error} The ₹0 below is not your real position — your invoices and
            payments are untouched.
          </p>
          <button onClick={load}
            className="mt-2.5 text-xs font-semibold bg-rose-600 text-white rounded-lg px-3 py-1.5 hover:bg-rose-700">
            Try again
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div data-testid="dashboard-page">
      {errorBanner}

      {/* ══════════ MOBILE LAYOUT ══════════ */}
      <div className="md:hidden space-y-4 pb-2">

        {/* Greeting header */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 text-white">
          <p className="text-sm opacity-80">{greeting} 👋</p>
          <h1 className="text-xl font-bold mt-0.5 leading-tight">{currentOrg?.name || "Your Business"}</h1>
          <p className="text-xs opacity-60 mt-1">{today}</p>
        </div>

        {/* The one number the month turns on. Exactly one hero per view. */}
        <HeroProfit data={data} loading={loading} prev={prev} prevLabel={prevLabel} />

        {/* What needs doing today, ahead of the figures that merely report. */}
        {!loading && data?.overdue > 0 && (
          <button onClick={() => nav("/sales?status=unpaid")}
            className="w-full flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-left"
            data-testid="overdue-banner">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {compactInr(data.overdue)} overdue
              </p>
              <p className="text-xs text-amber-800/70 dark:text-amber-300/70">
                {data.overdue_count} invoice{data.overdue_count === 1 ? "" : "s"} past their due date
              </p>
            </div>
          </button>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          {tiles.map((t) => (
            <StatTile key={t.key} label={t.label} period={t.period}
                      value={data?.[t.key] || 0} previous={t.previous}
                      prevLabel={prevLabel} upIsGood={t.upIsGood}
                      series={t.series} loading={loading}
                      onClick={() => nav(t.to)} />
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

        <div className="grid lg:grid-cols-3 gap-3">
          <HeroProfit data={data} loading={loading} prev={prev} prevLabel={prevLabel} />
          <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {tiles.slice(0, 6).map((t) => (
              <StatTile key={t.key} label={t.label} period={t.period}
                        value={data?.[t.key] || 0} previous={t.previous}
                        prevLabel={prevLabel} upIsGood={t.upIsGood}
                        series={t.series} loading={loading}
                        onClick={() => nav(t.to)} />
            ))}
          </div>
        </div>

        {!loading && data?.overdue > 0 && (
          <button onClick={() => nav("/sales")}
            className="w-full flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5 text-left">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-sm text-amber-900 dark:text-amber-200">
              <strong>{compactInr(data.overdue)}</strong> overdue across {data.overdue_count}{" "}
              invoice{data.overdue_count === 1 ? "" : "s"} — chase these first.
            </span>
          </button>
        )}

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

/* ─── POS Dashboard ─── */
function POSDashboard({ data, loading, orgName, today, greeting, nav }) {
  const skel = <Skeleton className="h-7 w-24" />;

  return (
    <div className="space-y-5" data-testid="pos-dashboard">

      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-5 text-white flex items-center justify-between">
        <div>
          <p className="text-sm opacity-80">{greeting} 👋</p>
          <h1 className="text-xl font-bold mt-0.5">{orgName || "POS Counter"}</h1>
          <p className="text-xs opacity-60 mt-1">{today}</p>
        </div>
        <button onClick={() => nav("/pos")}
          className="bg-white/20 hover:bg-white/30 transition px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2">
          <Scan className="h-4 w-4" /> Open POS
        </button>
      </div>

      {/* Today's stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Bills Today",   value: loading ? skel : <span className="text-2xl font-bold">{data?.today_count ?? 0}</span>,     icon: ShoppingBag, color: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-600" },
          { label: "Today's Sales", value: loading ? skel : <span className="text-2xl font-bold">{inrShort(data?.today_total ?? 0)}</span>, icon: TrendingUp,  color: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-600" },
          { label: "Cash Collected",value: loading ? skel : <span className="text-2xl font-bold">{inrShort(data?.cash_today ?? 0)}</span>,  icon: Banknote,    color: "bg-amber-50 dark:bg-amber-950/40",   text: "text-amber-600" },
          { label: "UPI Collected", value: loading ? skel : <span className="text-2xl font-bold">{inrShort(data?.upi_today ?? 0)}</span>,   icon: Smartphone,  color: "bg-blue-50 dark:bg-blue-950/40",     text: "text-blue-600" },
        ].map(({ label, value, icon: Icon, color, text }) => (
          <div key={label} className={`rounded-2xl p-4 ${color}`}>
            <Icon className={`h-5 w-5 mb-2 ${text}`} />
            {value}
            <p className={`text-xs font-medium mt-1 ${text}`}>{label}</p>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Top products today */}
        <div className="rounded-2xl border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Package className="h-4 w-4 text-indigo-500" /> Top Products Today</h3>
          {loading ? [1,2,3].map(i => <Skeleton key={i} className="h-8 w-full mb-2" />) :
            !data?.top_products?.length
              ? <p className="text-sm text-muted-foreground py-4 text-center">No sales yet today</p>
              : data.top_products.map((p, i) => (
                <div key={i} className="flex justify-between items-center py-1.5 border-b last:border-0 text-sm">
                  <span className="truncate max-w-[60%]">{p.name}</span>
                  <div className="text-right shrink-0">
                    <div className="font-semibold">{inr(p.amount)}</div>
                    <div className="text-[10px] text-muted-foreground">{p.qty} units</div>
                  </div>
                </div>
              ))
          }
        </div>

        {/* Recent bills */}
        <div className="rounded-2xl border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Receipt className="h-4 w-4 text-violet-500" /> Recent Bills</h3>
          {loading ? [1,2,3].map(i => <Skeleton key={i} className="h-8 w-full mb-2" />) :
            !data?.recent_bills?.length
              ? <p className="text-sm text-muted-foreground py-4 text-center">No bills today</p>
              : data.recent_bills.map((b, i) => (
                <div key={i} className="flex justify-between items-center py-1.5 border-b last:border-0 text-sm cursor-pointer hover:bg-muted/30 rounded px-1"
                  onClick={() => nav(`/sales/${b.id}`)}>
                  <div>
                    <div className="font-medium">{b.party_name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{b.invoice_number}</div>
                  </div>
                  <span className="font-semibold">{inr(b.totals?.grand_total)}</span>
                </div>
              ))
          }
        </div>
      </div>

      {/* Low stock */}
      {(data?.low_stock?.length > 0) && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" /> Low Stock Alert
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.low_stock.map((p, i) => (
              <span key={i} className="text-xs bg-white dark:bg-zinc-900 border border-amber-200 rounded-full px-3 py-1 font-medium">
                {p.name} — {p.stock} {p.unit}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


/** The one figure a month turns on. Exactly one hero per view, >=48px. */
function HeroProfit({ data, loading, prev, prevLabel }) {
  const value = data?.net_profit || 0;
  const previous = prev?.net_profit;
  const hasPrev = Number.isFinite(previous) && previous !== 0;
  const delta = hasPrev ? ((value - previous) / Math.abs(previous)) * 100 : null;
  const up = delta !== null && delta > 0.5;
  const down = delta !== null && delta < -0.5;

  // What the profit is made of. The hero card stretches to the height of the
  // tile grid beside it, and empty space in a card is wasted space — this is
  // the arithmetic behind the number, which is what an owner asks next.
  const parts = [
    { label: "Sales", amount: data?.sales_total || 0, sign: "+" },
    { label: "Purchases", amount: data?.purchase_total || 0, sign: "−" },
    { label: "Expenses", amount: data?.expenses_total || 0, sign: "−" },
  ];

  return (
    <div className="rounded-xl border bg-card px-5 py-4 flex flex-col" data-testid="hero-profit">
      <p className="text-[13px] font-medium text-muted-foreground">Net profit · this month</p>
      {loading ? (
        <div className="h-12 w-40 mt-2 rounded bg-muted animate-pulse" />
      ) : (
        <p className={`mt-1 text-[48px] leading-[1.05] font-semibold tracking-tight ${
          value < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
          {compactInr(value)}
        </p>
      )}
      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
        {delta !== null ? (
          <>
            {up ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                : down ? <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
                       : <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className={`font-semibold ${
              up ? "text-emerald-600 dark:text-emerald-400"
                 : down ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>
              {Math.abs(delta) >= 1000 ? ">999" : Math.abs(delta).toFixed(0)}%
            </span>
            <span className="text-muted-foreground">vs {prevLabel}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Sales less purchases and expenses</span>
        )}
      </div>

      <div className="mt-auto pt-4 space-y-1.5">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center justify-between text-[13px]">
            <span className="text-muted-foreground">
              <span className="inline-block w-3 text-muted-foreground/50">{p.sign}</span>
              {p.label}
            </span>
            <span className="font-mono tabular-nums text-foreground/80">
              {loading ? "—" : compactInr(p.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
