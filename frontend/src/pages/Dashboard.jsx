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
  Users, Package,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const TALLY_GREEN = "hsl(158 64% 26%)";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();
  const { currentOrg } = useAuth();

  useEffect(() => {
    api.get("/dashboard").then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="space-y-3" data-testid="dashboard-page">

      {/* ── Tally-style top title bar ── */}
      <div className="flex items-center justify-between px-3 py-1.5 rounded text-white text-xs font-semibold"
        style={{ background: TALLY_GREEN }}>
        <span className="uppercase tracking-widest">Gateway of Tally · {currentOrg?.name || "Your Company"}</span>
        <span className="opacity-75 font-normal">{today}</span>
      </div>

      {/* ── Quick action buttons (like Tally's voucher buttons) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "F8: Sales Invoice", icon: FileText, to: "/sales/new", shortcut: "F8", tid: "quick-new-invoice" },
          { label: "F9: Purchase Entry", icon: ShoppingCart, to: "/purchases", shortcut: "F9", tid: "quick-new-purchase" },
          { label: "F6: Receipt", icon: Wallet, to: "/payments", shortcut: "F6", tid: "quick-new-payment" },
          { label: "Expense Entry", icon: Receipt, to: "/expenses", shortcut: "", tid: "quick-new-expense" },
        ].map(btn => (
          <button key={btn.to} onClick={() => nav(btn.to)} data-testid={btn.tid}
            className="flex items-center gap-2 px-3 py-2 rounded border text-left text-xs font-medium transition-colors hover:text-white"
            style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
            onMouseEnter={e => { e.currentTarget.style.background = TALLY_GREEN; e.currentTarget.style.borderColor = TALLY_GREEN; }}
            onMouseLeave={e => { e.currentTarget.style.background = "hsl(var(--card))"; e.currentTarget.style.borderColor = "hsl(var(--border))"; }}>
            <btn.icon className="h-4 w-4 shrink-0" />
            <div>
              {btn.shortcut && <div className="text-[10px] opacity-50 font-bold">{btn.shortcut}</div>}
              <div>{btn.label.replace(/^F\d: /, "")}</div>
            </div>
          </button>
        ))}
      </div>

      {/* ── Metrics in Tally ledger-style panels ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { key: "sales_total",    label: "Sales",       icon: TrendingUp,      color: "#16a34a" },
          { key: "purchase_total", label: "Purchases",   icon: ShoppingCart,    color: "#2563eb" },
          { key: "receivable",     label: "Receivable",  icon: ArrowDownToLine, color: "#d97706" },
          { key: "payable",        label: "Payable",     icon: ArrowUpFromLine, color: "#dc2626" },
          { key: "gst_payable",    label: "GST Payable", icon: Landmark,        color: "#7c3aed" },
          { key: "net_profit",     label: "Net Profit",  icon: PiggyBank,       color: "#0891b2" },
        ].map(m => (
          <div key={m.key} data-testid={`metric-${m.key}`}
            className="rounded border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
            <div className="px-2 py-1 text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
              style={{ background: m.color }}>
              <m.icon className="h-3 w-3" />{m.label}
            </div>
            <div className="px-2 py-2 bg-card">
              {loading
                ? <Skeleton className="h-5 w-16" />
                : <div className="font-mono-fin text-sm font-bold">{inrShort(data?.[m.key] || 0)}</div>
              }
              <div className="text-[10px] text-muted-foreground mt-0.5">This month</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Two-column Tally-style panels ── */}
      <div className="grid lg:grid-cols-5 gap-3">

        {/* Sales chart */}
        <div className="lg:col-span-3 data-grid">
          <div className="data-grid-header">
            <span>SALES TREND — LAST 6 MONTHS</span>
            <Link to="/sales" className="text-[11px] opacity-75 hover:opacity-100" data-testid="view-all-invoices">View All →</Link>
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

        {/* Top customers ledger */}
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
                  <div key={i} className="data-grid-row" data-testid={`top-cust-${i}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold w-4 shrink-0" style={{ color: TALLY_GREEN }}>{i + 1}</span>
                      <span className="text-xs truncate">{c.name}</span>
                    </div>
                    <span className="font-mono-fin text-xs font-semibold">{inrShort(c.amount)}</span>
                  </div>
                ))
          }
          <div className="data-grid-footer">
            <span>All Parties</span>
            <Link to="/parties" className="text-xs" style={{ color: TALLY_GREEN }}>
              <Users className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Recent invoices ledger ── */}
      <div className="data-grid">
        <div className="data-grid-header">
          <span>RECENT INVOICES</span>
          <Link to="/sales" className="text-[11px] opacity-75 hover:opacity-100" data-testid="view-all-invoices-2">View All Vouchers →</Link>
        </div>
        <div className="overflow-x-auto bg-card">
          <table className="app-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Party Name</th>
                <th>Date</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? [1,2,3].map(i => <tr key={i}><td colSpan={5}><Skeleton className="h-5 w-full" /></td></tr>)
                : (data?.recent_invoices || []).length === 0
                  ? <tr><td colSpan={5} className="text-center text-muted-foreground py-6 text-xs">No invoices yet — create your first Sales Voucher</td></tr>
                  : (data?.recent_invoices || []).map(inv => (
                      <tr key={inv.id} className="cursor-pointer"
                        onClick={() => nav(`/sales/${inv.id}`)}
                        data-testid={`recent-inv-${inv.invoice_no}`}>
                        <td className="font-mono-fin text-xs" style={{ color: TALLY_GREEN }}>{inv.invoice_no}</td>
                        <td className="text-xs font-medium">{inv.party_name}</td>
                        <td className="text-xs text-muted-foreground">{fmtDate(inv.invoice_date)}</td>
                        <td className="num text-xs font-semibold">{inr(inv.totals.grand_total)}</td>
                        <td>
                          <Badge variant={inv.status === "finalized" ? "default" : "secondary"}
                            className="text-[10px] px-1.5 py-0 rounded-sm">
                            {inv.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
              }
            </tbody>
          </table>
        </div>
        <div className="data-grid-footer">
          <button onClick={() => nav("/sales/new")} className="flex items-center gap-1 text-xs font-semibold"
            style={{ color: TALLY_GREEN }}>
            <Plus className="h-3.5 w-3.5" /> New Sales Voucher
          </button>
          <span className="text-xs text-muted-foreground font-normal">
            {data?.recent_invoices?.length || 0} recent entries
          </span>
        </div>
      </div>

      {/* ── Quick masters row ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="data-grid">
          <div className="data-grid-header">
            <span>QUICK MASTERS</span>
          </div>
          {[
            { label: "Customers / Suppliers", icon: Users, to: "/parties", shortcut: "Alt+P" },
            { label: "Products & Stock",      icon: Package, to: "/products", shortcut: "Alt+I" },
          ].map(item => (
            <div key={item.to} className="data-grid-row cursor-pointer" onClick={() => nav(item.to)}>
              <div className="flex items-center gap-2 text-xs">
                <item.icon className="h-3.5 w-3.5" style={{ color: TALLY_GREEN }} />
                {item.label}
              </div>
              <span className="kbd">{item.shortcut}</span>
            </div>
          ))}
        </div>

        <div className="data-grid">
          <div className="data-grid-header">
            <span>QUICK REPORTS</span>
          </div>
          {[
            { label: "Profit & Loss",  to: "/reports", shortcut: "Alt+R" },
            { label: "GST Returns",    to: "/gst",     shortcut: "Alt+G" },
            { label: "Trial Balance",  to: "/reports", shortcut: "" },
            { label: "Day Book",       to: "/reports", shortcut: "" },
          ].map(item => (
            <div key={item.label} className="data-grid-row cursor-pointer" onClick={() => nav(item.to)}>
              <span className="text-xs" style={{ color: TALLY_GREEN }}>{item.label}</span>
              {item.shortcut && <span className="kbd">{item.shortcut}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
