import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { inr, fmtDate, todayISO } from "@/lib/format";
import { AlertTriangle } from "lucide-react";

export default function Reports() {
  return (
    <div className="space-y-6" data-testid="reports-page">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Reports & Books</h1>
        <p className="text-sm text-muted-foreground mt-1">Profit/Loss, Trial Balance (account summary), Day Book (today's entries), and Stock report.</p>
      </div>
      <Tabs defaultValue="pl">
        <TabsList>
          <TabsTrigger value="pl" data-testid="rep-tab-pl">P&L</TabsTrigger>
          <TabsTrigger value="bs" data-testid="rep-tab-bs">Balance Sheet</TabsTrigger>
          <TabsTrigger value="cf" data-testid="rep-tab-cf">Cash Flow</TabsTrigger>
          <TabsTrigger value="tb" data-testid="rep-tab-tb">Trial Balance</TabsTrigger>
          <TabsTrigger value="db" data-testid="rep-tab-db">Day Book</TabsTrigger>
          <TabsTrigger value="stock" data-testid="rep-tab-stock">Stock</TabsTrigger>
        </TabsList>
        <TabsContent value="pl"><PLReport /></TabsContent>
        <TabsContent value="bs"><BalanceSheet /></TabsContent>
        <TabsContent value="cf"><CashFlow /></TabsContent>
        <TabsContent value="tb"><TBReport /></TabsContent>
        <TabsContent value="db"><DayBook /></TabsContent>
        <TabsContent value="stock"><StockReport /></TabsContent>
      </Tabs>
    </div>
  );
}

function PLReport() {
  const [month, setMonth] = useState("");
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/reports/pl", { params: month ? { month } : {} }).then(r => setData(r.data)); }, [month]);
  if (!data) return <Skeleton className="h-40 w-full mt-4" />;
  return (
    <Card className="p-5 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg">Profit &amp; Loss</h2>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" placeholder="All time" />
      </div>
      <div className="space-y-2 text-sm max-w-md">
        <Row label="Sales (taxable)" value={data.sales} />
        <Row label="Cost of Goods" value={-data.cost_of_goods} />
        <Row label="Gross Profit" value={data.gross_profit} bold />
        <Row label="Operating Expenses" value={-data.expenses} />
        <div className="border-t border-border pt-2 flex justify-between">
          <span className="font-semibold text-lg">Net Profit</span>
          <span className={`font-mono-fin text-2xl font-semibold ${data.net_profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{inr(data.net_profit)}</span>
        </div>
      </div>
    </Card>
  );
}

function TBReport() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/reports/trial-balance").then(r => setData(r.data)); }, []);
  if (!data) return <Skeleton className="h-40 w-full mt-4" />;
  return (
    <Card className="mt-4"><div className="overflow-x-auto"><table className="app-table">
      <thead><tr><th>Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
      <tbody>
        {data.rows.map((r, i) => (
          <tr key={i}><td className="font-medium">{r.account}</td><td className="num">{r.debit ? inr(r.debit) : "—"}</td><td className="num">{r.credit ? inr(r.credit) : "—"}</td></tr>
        ))}
        <tr><td className="font-semibold">Total</td><td className="num font-semibold">{inr(data.total_debit)}</td><td className="num font-semibold">{inr(data.total_credit)}</td></tr>
      </tbody>
    </table></div></Card>
  );
}

function DayBook() {
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/reports/day-book", { params: { date } }).then(r => setData(r.data)); }, [date]);

  return (
    <Card className="mt-4">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="font-semibold">Day Book — {fmtDate(date)}</div>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
      </div>
      <div className="overflow-x-auto"><table className="app-table">
        <thead><tr><th>Type</th><th>Reference</th><th className="text-right">Amount</th></tr></thead>
        <tbody>
          {!data ? <tr><td colSpan={3}><Skeleton className="h-8 w-full" /></td></tr> :
            data.entries.length === 0 ? <tr><td colSpan={3} className="text-center text-muted-foreground py-8">No entries on this day.</td></tr> :
            data.entries.map((e, i) => (
              <tr key={i}><td><Badge variant="secondary">{e.type}</Badge></td><td className="font-mono-fin text-xs">{e.ref}</td><td className="num">{inr(e.amount)}</td></tr>
            ))}
        </tbody>
      </table></div>
    </Card>
  );
}

function StockReport() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/reports/stock").then(r => setData(r.data)); }, []);
  if (!data) return <Skeleton className="h-40 w-full mt-4" />;
  return (
    <Card className="mt-4"><div className="overflow-x-auto"><table className="app-table">
      <thead><tr><th>Product</th><th>HSN</th><th>Category</th><th className="text-right">Stock</th><th className="text-right">Value</th><th></th></tr></thead>
      <tbody>
        {data.map(p => (
          <tr key={p.id}>
            <td className="font-medium">{p.name}</td>
            <td className="font-mono-fin text-xs">{p.hsn}</td>
            <td><Badge variant="secondary">{p.category}</Badge></td>
            <td className="num">{p.stock} {p.unit}</td>
            <td className="num">{inr(p.value)}</td>
            <td>{p.low && <span className="text-rose-600 text-xs inline-flex items-center"><AlertTriangle className="h-3.5 w-3.5 mr-1" />Low</span>}</td>
          </tr>
        ))}
      </tbody>
    </table></div></Card>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={`font-mono-fin ${bold ? "font-semibold" : ""}`}>{inr(value)}</span>
    </div>
  );
}

function BalanceSheet() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/reports/balance-sheet").then(r => setData(r.data)); }, []);
  if (!data) return <Skeleton className="h-40 w-full mt-4" />;
  return (
    <div className="grid md:grid-cols-2 gap-4 mt-4" data-testid="balance-sheet">
      <Card className="p-5">
        <h3 className="font-semibold mb-3 text-blue-600">Assets</h3>
        <div className="space-y-2 text-sm">
          {data.assets.map((a, i) => <Row key={i} label={a.label} value={a.amount} />)}
          <div className="border-t border-border pt-2 mt-2"><Row label="Total Assets" value={data.total_assets} bold /></div>
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="font-semibold mb-3 text-rose-600">Liabilities &amp; Equity</h3>
        <div className="space-y-2 text-sm">
          {data.liabilities.map((l, i) => <Row key={i} label={l.label} value={l.amount} />)}
          <Row label="Total Liabilities" value={data.total_liabilities} bold />
          <div className="border-t border-border pt-2 mt-2"><Row label="Equity (net worth)" value={data.equity} bold /></div>
        </div>
      </Card>
    </div>
  );
}

function CashFlow() {
  const [month, setMonth] = useState("");
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/reports/cash-flow", { params: month ? { month } : {} }).then(r => setData(r.data)); }, [month]);
  if (!data) return <Skeleton className="h-40 w-full mt-4" />;
  return (
    <Card className="p-5 mt-4" data-testid="cash-flow">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h3 className="font-semibold">Cash Flow</h3>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" placeholder="All time" />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/30 p-4">
          <div className="text-xs text-muted-foreground">Cash In</div>
          <div className="font-mono-fin text-2xl font-semibold text-emerald-600 mt-1">{inr(data.in_total)}</div>
          <div className="space-y-1 mt-3 text-xs">
            {Object.entries(data.in_by_mode).map(([m, v]) => <div key={m} className="flex justify-between"><span className="text-muted-foreground">{m}</span><span className="font-mono-fin">{inr(v)}</span></div>)}
          </div>
        </div>
        <div className="rounded-lg border border-rose-200 dark:border-rose-500/30 p-4">
          <div className="text-xs text-muted-foreground">Cash Out</div>
          <div className="font-mono-fin text-2xl font-semibold text-rose-600 mt-1">{inr(data.out_total + data.expenses)}</div>
          <div className="space-y-1 mt-3 text-xs">
            {Object.entries(data.out_by_mode).map(([m, v]) => <div key={m} className="flex justify-between"><span className="text-muted-foreground">Paid · {m}</span><span className="font-mono-fin">{inr(v)}</span></div>)}
            <div className="flex justify-between"><span className="text-muted-foreground">Expenses</span><span className="font-mono-fin">{inr(data.expenses)}</span></div>
          </div>
        </div>
      </div>
      <div className="border-t border-border pt-3 mt-4 flex justify-between items-center">
        <span className="font-semibold">Net Cash Flow</span>
        <span className={`font-mono-fin text-2xl font-semibold ${data.net_cash_flow >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{inr(data.net_cash_flow)}</span>
      </div>
    </Card>
  );
}
