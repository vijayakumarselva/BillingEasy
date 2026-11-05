// Personal finance — a person's own money, kept apart from the business.
//
// Written for someone who is not an accountant: the dashboard answers "what
// is left after everything I already owe this month", which is the question
// a salaried person actually asks, and the detail is a tab away.
import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogDescription, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { inr, fmtDate } from "@/lib/format";
import StatTile, { compactInr } from "@/components/StatTile";
import {
  Wallet, TrendingUp, TrendingDown, Plus, Target, Landmark, CalendarClock, MessageSquare,
  AlertTriangle, PiggyBank, Trash2, CreditCard, ArrowLeftRight, Repeat, Check,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from "recharts";

const todayISO = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);

// One hue per slice, assigned in a fixed order — never recycled, so a
// category keeps its colour when the list changes.
const SLICE = ["#2563eb", "#0891b2", "#7c3aed", "#db2777", "#ea580c", "#65a30d",
               "#0d9488", "#4f46e5", "#c026d3", "#78716c"];

const ACCOUNT_LABEL = {
  savings: "Savings", cash: "Cash", current: "Current",
  credit_card: "Credit card", wallet: "Wallet", other: "Other",
};

export default function Personal() {
  const [tab, setTab] = useState("overview");
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cats, setCats] = useState({ income: [], expense: [] });
  const [accounts, setAccounts] = useState([]);
  const [quick, setQuick] = useState(null);       // "income" | "expense" | "transfer"
  const [importOpen, setImportOpen] = useState(false);
  const [loans, setLoans] = useState([]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [d, a, c] = await Promise.all([
        api.get("/personal/dashboard", { params: { month } }),
        api.get("/personal/accounts"),
        api.get("/personal/categories"),
      ]);
      setData(d.data); setAccounts(a.data || []); setCats(c.data || {});
      api.get("/personal/loans").then((l) => setLoans(l.data?.loans || [])).catch(() => {});
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not load your personal finances.");
      setData(null);
    } finally { setLoading(false); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const prev = data?.previous || {};
  const noData = !loading && !error && accounts.length === 0;

  return (
    <div className="space-y-5" data-testid="personal-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wallet className="h-6 w-6 text-blue-600" /> Personal Finance
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your own money. Kept entirely separate from the business books.
          </p>
        </div>
        {/* On a phone these wrapped one-per-row and looked accidental. The
            month spans the width, the two actions sit side by side under it,
            and on a wider screen they return to a single row. */}
        <div className="w-full sm:w-auto grid grid-cols-2 sm:flex sm:items-end gap-2">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                 className="col-span-2 sm:w-[150px]" data-testid="pf-month" />
          <Button onClick={() => setQuick("income")} variant="outline"
                  className="h-11 sm:h-10 border-emerald-500/50 text-emerald-700 hover:bg-emerald-50"
                  data-testid="pf-add-income">
            <TrendingUp className="h-4 w-4 mr-1.5" /> Income
          </Button>
          <Button onClick={() => setQuick("expense")}
                  className="h-11 sm:h-10 bg-blue-600 hover:bg-blue-700"
                  data-testid="pf-add-expense">
            <Plus className="h-4 w-4 mr-1.5" /> Expense
          </Button>
          <Button onClick={() => setImportOpen(true)} variant="outline"
                  className="col-span-2 sm:col-auto h-11 sm:h-10"
                  data-testid="pf-import-messages">
            <MessageSquare className="h-4 w-4 mr-1.5" /> Read bank SMS
          </Button>
        </div>
      </div>

      {error && (
        <Card className="p-4 border-rose-200 bg-rose-50 dark:bg-rose-950/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-rose-800 dark:text-rose-300">
                Your personal finances could not be loaded
              </p>
              <p className="text-xs text-rose-700/80 mt-0.5">{error}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={load}>Try again</Button>
            </div>
          </div>
        </Card>
      )}

      {/* The tabs are always rendered. They used to be swapped out for the
          empty state, so the "Add an account" button switched to a tab that
          was not on screen — leaving no way to add the first account at all. */}
      <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full justify-start overflow-x-auto no-scrollbar sm:w-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="loans">Loans &amp; EMI</TabsTrigger>
            <TabsTrigger value="recurring">Recurring</TabsTrigger>
            <TabsTrigger value="budgets">Budgets</TabsTrigger>
            <TabsTrigger value="goals">Goals</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {noData ? (
              <Card className="p-8 text-center">
                <PiggyBank className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <h3 className="font-semibold">Start with an account</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  Add your salary account, cash in hand, or a credit card. Everything else —
                  income, spending, EMIs, budgets — hangs off that.
                </p>
                <Button className="mt-4" onClick={() => setTab("accounts")}
                        data-testid="pf-empty-add-account">
                  <Plus className="h-4 w-4 mr-1.5" /> Add an account
                </Button>
              </Card>
            ) : (
              <Overview data={data} loading={loading} prev={prev} />
            )}
          </TabsContent>
          <TabsContent value="transactions" className="mt-4">
            <Transactions accounts={accounts} cats={cats} onChange={load} />
          </TabsContent>
          <TabsContent value="loans" className="mt-4">
            <Loans accounts={accounts} onChange={load} />
          </TabsContent>
          <TabsContent value="recurring" className="mt-4">
            <Recurring accounts={accounts} cats={cats} onChange={load} />
          </TabsContent>
          <TabsContent value="budgets" className="mt-4">
            <Budgets month={month} cats={cats} onChange={load} />
          </TabsContent>
          <TabsContent value="goals" className="mt-4">
            <Goals onChange={load} />
          </TabsContent>
          <TabsContent value="accounts" className="mt-4">
            <Accounts accounts={accounts} onChange={load} openOnMount={noData} />
          </TabsContent>
      </Tabs>

      <TxnDialog kind={quick} onClose={() => setQuick(null)}
                 accounts={accounts} cats={cats} onSaved={load} />

      <MessageImport open={importOpen} onClose={() => setImportOpen(false)}
                     accounts={accounts} cats={cats} loans={loans} onImported={load} />
    </div>
  );
}

/* ───────────────────────────── overview ───────────────────────────── */

function Overview({ data, loading, prev }) {
  const left = (data?.available_balance || 0) - (data?.upcoming?.total || 0);
  return (
    <>
      <div className="grid lg:grid-cols-3 gap-3">
        {/* The question a salaried person actually asks. */}
        <Card className="px-5 py-4 flex flex-col">
          <p className="text-[13px] font-medium text-muted-foreground">
            Left after this month's commitments
          </p>
          {loading ? <div className="h-12 w-40 mt-2 rounded bg-muted animate-pulse" /> : (
            <p className={`mt-1 text-[48px] leading-[1.05] font-semibold tracking-tight ${
              left < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
              {compactInr(left)}
            </p>
          )}
          <div className="mt-auto pt-4 space-y-1.5 text-[13px]">
            <Row label="Available now" value={data?.available_balance} />
            <Row label="Already committed" value={-(data?.upcoming?.total || 0)} />
            <Row label="Net worth" value={data?.net_worth?.net_worth} bold />
          </div>
        </Card>

        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <StatTile label="Income" period="This month" value={data?.income || 0}
                    previous={prev.income} prevLabel={prev.label} upIsGood loading={loading} />
          <StatTile label="Expenses" period="This month" value={data?.expenses || 0}
                    previous={prev.expenses} prevLabel={prev.label} upIsGood={false} loading={loading} />
          <StatTile label="Saved" period="This month" value={data?.savings || 0}
                    previous={prev.savings} prevLabel={prev.label} upIsGood loading={loading} />
          <StatTile label="Monthly EMI" period="Commitment" value={data?.monthly_emi || 0}
                    upIsGood={false} loading={loading} />
          <StatTile label="Loans outstanding" period="Total owed"
                    value={data?.loan_outstanding || 0} upIsGood={false} loading={loading} />
          <StatTile label="Due in 30 days" period={`${data?.upcoming?.items?.length || 0} payments`}
                    value={data?.upcoming?.total || 0} upIsGood={false} loading={loading} />
        </div>
      </div>

      {data?.upcoming?.overdue_total > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-900 dark:text-amber-200">
            <strong>{inr(data.upcoming.overdue_total)}</strong> is already past its due date.
          </span>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <div className="px-5 py-3 border-b font-semibold text-sm">Income vs expenses</div>
          <div className="p-4" style={{ height: 240 }}>
            {loading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.series || []}>
                  <defs>
                    <linearGradient id="pfIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#16a34a" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="pfOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="0" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
                         tickFormatter={(v) => compactInr(v)} width={60} />
                  <Tooltip formatter={(v) => inr(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Area type="monotone" dataKey="income" name="Income" stroke="#16a34a"
                        strokeWidth={2} fill="url(#pfIn)" />
                  <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#2563eb"
                        strokeWidth={2} fill="url(#pfOut)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="px-5 pb-3 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: "#16a34a" }} /> Income
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: "#2563eb" }} /> Expenses
            </span>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="px-5 py-3 border-b font-semibold text-sm">Where it went</div>
          {loading ? <div className="p-4"><Skeleton className="h-40 w-full" /></div>
            : !data?.by_category?.length ? (
              <p className="p-6 text-sm text-muted-foreground text-center">No spending this month.</p>
            ) : (
              <>
                <div className="p-2" style={{ height: 170 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.by_category.slice(0, 8)} dataKey="amount" nameKey="category"
                           innerRadius={42} outerRadius={70} paddingAngle={2} stroke="var(--card-surface)"
                           strokeWidth={2}>
                        {data.by_category.slice(0, 8).map((_, i) => (
                          <Cell key={i} fill={SLICE[i % SLICE.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => inr(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="px-5 pb-4 space-y-1.5">
                  {data.by_category.slice(0, 6).map((c, i) => (
                    <div key={c.category} className="flex items-center gap-2 text-[13px]">
                      <span className="h-2 w-2 rounded-full shrink-0"
                            style={{ background: SLICE[i % SLICE.length] }} />
                      <span className="flex-1 truncate text-muted-foreground">{c.category}</span>
                      <span className="font-mono tabular-nums">{inr(c.amount)}</span>
                      <span className="w-10 text-right text-muted-foreground">{c.share}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <div className="px-5 py-3 border-b font-semibold text-sm flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" /> Coming up
          </div>
          <div className="divide-y">
            {(data?.upcoming?.items || []).slice(0, 7).map((i) => (
              <div key={`${i.kind}-${i.id}-${i.due_date}`} className="px-5 py-2.5 flex items-center gap-3">
                {i.kind === "emi" ? <Landmark className="h-4 w-4 text-violet-600 shrink-0" />
                                  : <Repeat className="h-4 w-4 text-blue-600 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{i.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(i.due_date)}
                    {i.overdue ? <span className="text-rose-600 font-semibold"> · overdue</span>
                               : ` · in ${i.days_away} day${i.days_away === 1 ? "" : "s"}`}
                  </p>
                </div>
                <span className="font-mono tabular-nums text-sm">{inr(i.amount)}</span>
              </div>
            ))}
            {!data?.upcoming?.items?.length && (
              <p className="px-5 py-6 text-sm text-muted-foreground text-center">
                Nothing due in the next 30 days.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <div className="px-5 py-3 border-b font-semibold text-sm">Recent</div>
          <div className="divide-y">
            {(data?.recent || []).map((t) => (
              <div key={t.id} className="px-5 py-2.5 flex items-center gap-3">
                <span className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
                  t.kind === "income" ? "bg-emerald-50 dark:bg-emerald-950/40"
                  : t.kind === "transfer" ? "bg-slate-100 dark:bg-slate-800"
                  : "bg-blue-50 dark:bg-blue-950/40"}`}>
                  {t.kind === "income" ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                   : t.kind === "transfer" ? <ArrowLeftRight className="h-3.5 w-3.5 text-slate-500" />
                   : <TrendingDown className="h-3.5 w-3.5 text-blue-600" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {t.category || (t.kind === "transfer" ? "Transfer" : "—")}
                  </p>
                  <p className="text-xs text-muted-foreground">{fmtDate(t.date)}</p>
                </div>
                <span className={`font-mono tabular-nums text-sm ${
                  t.kind === "income" ? "text-emerald-600" : ""}`}>
                  {t.kind === "income" ? "+" : t.kind === "expense" ? "−" : ""}{inr(t.amount)}
                </span>
              </div>
            ))}
            {!data?.recent?.length && (
              <p className="px-5 py-6 text-sm text-muted-foreground text-center">Nothing recorded yet.</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono tabular-nums ${bold ? "font-semibold" : "text-foreground/80"} ${
        (value || 0) < 0 ? "text-rose-600" : ""}`}>
        {inr(value || 0)}
      </span>
    </div>
  );
}

/* ───────────────────────── add / edit a transaction ───────────────────────── */

function TxnDialog({ kind, onClose, accounts, cats, onSaved, existing }) {
  const blank = () => ({
    kind: kind || "expense", amount: "", date: todayISO(), account_id: "",
    to_account_id: "", category: "", payment_mode: "", notes: "",
  });
  const [form, setForm] = useState(blank());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (kind) setForm(existing ? { ...blank(), ...existing } : { ...blank(), kind });
  }, [kind, existing]);   // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const isTransfer = form.kind === "transfer";
  const list = form.kind === "income" ? cats.income : cats.expense;

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form, amount: parseFloat(form.amount) || 0 };
      if (existing?.id) await api.put(`/personal/transactions/${existing.id}`, payload);
      else await api.post("/personal/transactions", payload);
      toast.success(isTransfer ? "Transfer recorded"
                    : form.kind === "income" ? "Income added" : "Expense added");
      onSaved?.(); onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save that");
    } finally { setSaving(false); }
  };

  const valid = parseFloat(form.amount) > 0 && form.date && form.account_id &&
                (!isTransfer || (form.to_account_id && form.to_account_id !== form.account_id));

  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="pf-txn-dialog">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit" : isTransfer ? "Move money"
              : form.kind === "income" ? "Add income" : "Add expense"}
          </DialogTitle>
            <DialogDescription>Record money in, money out, or a move between your own accounts.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {["expense", "income", "transfer"].map((k) => (
            <button key={k} onClick={() => set("kind")(k)}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium capitalize transition-colors ${
                form.kind === k ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              {k}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Amount (₹)</Label>
            <Input type="number" inputMode="decimal" value={form.amount} autoFocus
                   onChange={(e) => set("amount")(e.target.value)} data-testid="pf-amount" />
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={form.date} onChange={(e) => set("date")(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{isTransfer ? "From account" : "Account"}</Label>
            <Select value={form.account_id} onValueChange={set("account_id")}>
              <SelectTrigger data-testid="pf-account"><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} · {inr(a.balance || 0)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isTransfer ? (
            <div className="space-y-1.5">
              <Label>To account</Label>
              <Select value={form.to_account_id} onValueChange={set("to_account_id")}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {accounts.filter((a) => a.id !== form.account_id).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={set("category")}>
                <SelectTrigger data-testid="pf-category"><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {(list || []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {isTransfer && (
          <p className="text-xs text-muted-foreground -mt-1">
            Moving your own money is neither income nor an expense, so it will not
            appear in either total. Paying a credit-card bill is a transfer.
          </p>
        )}

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => set("notes")(e.target.value)}
                    placeholder="Optional" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!valid || saving} data-testid="pf-save-txn">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── transactions ───────────────────────────── */

function Transactions({ accounts, cats, onChange }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ kind: "all", category: "all", q: "" });
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/personal/transactions", {
        params: {
          kind: filters.kind === "all" ? "" : filters.kind,
          category: filters.category === "all" ? "" : filters.category,
          q: filters.q,
        },
      });
      setRows(data.rows || []);
    } catch { toast.error("Could not load transactions"); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    try {
      await api.delete(`/personal/transactions/${id}`);
      toast.success("Deleted"); load(); onChange?.();
    } catch { toast.error("Could not delete"); }
  };

  const accName = (id) => accounts.find((a) => a.id === id)?.name || "—";
  const allCats = [...(cats.expense || []), ...(cats.income || [])];

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-3">
        <Input placeholder="Search notes or category..." className="flex-1 min-w-[200px]"
               value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <Select value={filters.kind} onValueChange={(v) => setFilters({ ...filters, kind: v })}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.category} onValueChange={(v) => setFilters({ ...filters, category: v })}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {allCats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">Date</th>
              <th className="text-left px-4 py-2.5 font-semibold">Category</th>
              <th className="text-left px-4 py-2.5 font-semibold">Account</th>
              <th className="text-left px-4 py-2.5 font-semibold">Notes</th>
              <th className="text-right px-4 py-2.5 font-semibold">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? [1,2,3].map(i => <tr key={i}><td colSpan={6} className="px-4 py-2"><Skeleton className="h-6 w-full" /></td></tr>)
              : !rows.length ? <tr><td colSpan={6} className="text-center text-muted-foreground py-10">Nothing here yet.</td></tr>
              : rows.map((t) => (
                <tr key={t.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{fmtDate(t.date)}</td>
                  <td className="px-4 py-2">
                    {t.kind === "transfer"
                      ? <span className="text-muted-foreground">Transfer → {accName(t.to_account_id)}</span>
                      : t.category || "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{accName(t.account_id)}</td>
                  <td className="px-4 py-2 text-muted-foreground truncate max-w-[220px]">{t.notes}</td>
                  <td className={`px-4 py-2 text-right font-mono tabular-nums ${
                    t.kind === "income" ? "text-emerald-600" : ""}`}>
                    {t.kind === "income" ? "+" : t.kind === "expense" ? "−" : ""}{inr(t.amount)}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(t)} title="Edit">
                      <Check className="h-3.5 w-3.5 text-blue-500" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(t.id)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>

      <TxnDialog kind={editing ? editing.kind : null} existing={editing}
                 onClose={() => setEditing(null)} accounts={accounts} cats={cats}
                 onSaved={() => { load(); onChange?.(); }} />
    </>
  );
}

/* ───────────────────────────── loans & EMI ───────────────────────────── */

function Loans({ accounts, onChange }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({
    name: "", loan_type: "home", lender: "", principal: "", interest_rate: "",
    tenure_months: "", first_due_date: todayISO(), installments_paid: 0, account_id: "",
  });

  const load = useCallback(async () => {
    try { setData((await api.get("/personal/loans")).data); }
    catch { toast.error("Could not load loans"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // The EMI the bank would quote, shown before anything is saved.
  const preview = useMemo(() => {
    const p = parseFloat(form.principal) || 0;
    const r = (parseFloat(form.interest_rate) || 0) / 12 / 100;
    const n = parseInt(form.tenure_months, 10) || 0;
    if (!p || !n) return 0;
    if (!r) return p / n;
    const f = Math.pow(1 + r, n);
    return (p * r * f) / (f - 1);
  }, [form.principal, form.interest_rate, form.tenure_months]);

  const save = async () => {
    try {
      await api.post("/personal/loans", {
        ...form,
        principal: parseFloat(form.principal) || 0,
        interest_rate: parseFloat(form.interest_rate) || 0,
        tenure_months: parseInt(form.tenure_months, 10) || 0,
        installments_paid: parseInt(form.installments_paid, 10) || 0,
      });
      toast.success("Loan added"); setOpen(false); load(); onChange?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
  };

  const remove = async (id) => {
    try { await api.delete(`/personal/loans/${id}`); toast.success("Removed"); load(); onChange?.(); }
    catch { toast.error("Could not remove"); }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-6 text-sm">
          <span className="text-muted-foreground">Outstanding{" "}
            <strong className="text-foreground font-mono">{inr(data?.total_outstanding || 0)}</strong></span>
          <span className="text-muted-foreground">Monthly EMI{" "}
            <strong className="text-foreground font-mono">{inr(data?.monthly_emi || 0)}</strong></span>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="pf-add-loan">
          <Plus className="h-4 w-4 mr-1.5" /> Add loan
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {(data?.loans || []).map((l) => (
          <Card key={l.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold truncate">{l.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {l.loan_type} loan{l.lender ? ` · ${l.lender}` : ""} · {l.interest_rate}%
                </p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(l.id)}>
                <Trash2 className="h-3.5 w-3.5 text-rose-500" />
              </Button>
            </div>
            <p className="text-2xl font-semibold tracking-tight mt-2">{inr(l.outstanding)}</p>
            <p className="text-xs text-muted-foreground">still owed</p>
            <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-blue-600"
                   style={{ width: `${Math.min(100, (l.installments_paid / Math.max(1, l.tenure_months)) * 100)}%` }} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <Mini label="EMI" value={inr(l.emi)} />
              <Mini label="Paid" value={`${l.installments_paid}/${l.tenure_months}`} />
              <Mini label="Next due" value={l.next_due ? fmtDate(l.next_due) : "—"} />
            </div>
            {l.overdue_count > 0 && (
              <p className="mt-2 text-xs font-semibold text-rose-600">
                {l.overdue_count} instalment{l.overdue_count === 1 ? "" : "s"} overdue
              </p>
            )}
            <Button variant="outline" size="sm" className="mt-3 w-full"
                    onClick={async () => setDetail((await api.get(`/personal/loans/${l.id}`)).data)}>
              Repayment schedule
            </Button>
          </Card>
        ))}
        {!data?.loans?.length && (
          <Card className="p-8 text-center md:col-span-2">
            <Landmark className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No loans yet. Add one and the EMI, schedule and outstanding balance are worked out for you.
            </p>
          </Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add a loan</DialogTitle>
            <DialogDescription>The EMI, repayment schedule and outstanding balance are worked out from these.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" v={form.name} on={(v) => setForm({ ...form, name: v })} />
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.loan_type} onValueChange={(v) => setForm({ ...form, loan_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["home","personal","vehicle","gold","business","other"].map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field label="Lender" v={form.lender} on={(v) => setForm({ ...form, lender: v })} />
            <Field label="Amount (₹)" type="number" v={form.principal} on={(v) => setForm({ ...form, principal: v })} />
            <Field label="Interest rate (% p.a.)" type="number" v={form.interest_rate} on={(v) => setForm({ ...form, interest_rate: v })} />
            <Field label="Tenure (months)" type="number" v={form.tenure_months} on={(v) => setForm({ ...form, tenure_months: v })} />
            <Field label="First EMI date" type="date" v={form.first_due_date} on={(v) => setForm({ ...form, first_due_date: v })} />
            <Field label="Instalments already paid" type="number" v={form.installments_paid} on={(v) => setForm({ ...form, installments_paid: v })} />
          </div>
          {preview > 0 && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 px-4 py-2.5 text-sm">
              Monthly EMI will be{" "}
              <strong className="font-mono">{inr(Math.round(preview * 100) / 100)}</strong>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.name || !form.principal || !form.tenure_months}>Add loan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{detail?.name} · repayment schedule</DialogTitle>
            <DialogDescription>Every instalment, split into interest and principal.</DialogDescription></DialogHeader>
          <div className="flex gap-5 text-xs text-muted-foreground">
            <span>Interest paid <strong className="font-mono text-foreground">{inr(detail?.interest_paid || 0)}</strong></span>
            <span>Interest left <strong className="font-mono text-foreground">{inr(detail?.interest_remaining || 0)}</strong></span>
          </div>
          <div className="max-h-[55vh] overflow-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">#</th><th className="text-left px-3 py-2">Due</th>
                  <th className="text-right px-3 py-2">EMI</th><th className="text-right px-3 py-2">Interest</th>
                  <th className="text-right px-3 py-2">Principal</th><th className="text-right px-3 py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {(detail?.schedule || []).map((r) => (
                  <tr key={r.no} className={`border-t ${r.no <= (detail?.installments_paid || 0) ? "opacity-45" : ""}`}>
                    <td className="px-3 py-1.5">{r.no}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{fmtDate(r.due_date)}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{inr(r.emi)}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-muted-foreground">{inr(r.interest)}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{inr(r.principal)}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{inr(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Mini({ label, value }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium font-mono tabular-nums">{value}</p>
    </div>
  );
}

function Field({ label, v, on, type = "text" }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={v} onChange={(e) => on(e.target.value)} />
    </div>
  );
}

/* ───────────────────────── recurring payments ───────────────────────── */

function Recurring({ accounts, cats, onChange }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", amount: "", frequency: "monthly", category: "", kind: "expense",
    start_date: todayISO(), next_due: todayISO(), account_id: "", active: true,
  });

  const load = useCallback(async () => {
    try { setRows((await api.get("/personal/recurring")).data || []); }
    catch { toast.error("Could not load recurring payments"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      await api.post("/personal/recurring", { ...form, amount: parseFloat(form.amount) || 0 });
      toast.success("Scheduled"); setOpen(false); load(); onChange?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
  };

  const pay = async (r) => {
    try {
      const { data } = await api.post(`/personal/recurring/${r.id}/pay`);
      toast.success(data.already ? "Already recorded for this due date"
                                 : `${r.name} recorded · next ${fmtDate(data.next_due)}`);
      load(); onChange?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not record it"); }
  };

  const remove = async (id) => {
    try { await api.delete(`/personal/recurring/${id}`); load(); onChange?.(); }
    catch { toast.error("Could not remove"); }
  };

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button onClick={() => setOpen(true)} data-testid="pf-add-recurring">
          <Plus className="h-4 w-4 mr-1.5" /> Add recurring payment
        </Button>
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">What</th>
              <th className="text-left px-4 py-2.5 font-semibold">Every</th>
              <th className="text-left px-4 py-2.5 font-semibold">Next due</th>
              <th className="text-right px-4 py-2.5 font-semibold">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr><td colSpan={5} className="text-center text-muted-foreground py-10">
                Nothing scheduled. Rent, EMIs, insurance and subscriptions go here.
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className={`border-t ${r.active ? "" : "opacity-50"}`}>
                <td className="px-4 py-2.5">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.category}</p>
                </td>
                <td className="px-4 py-2.5 capitalize text-muted-foreground">{r.frequency}</td>
                <td className="px-4 py-2.5 font-mono text-xs">
                  {r.next_due_computed ? fmtDate(r.next_due_computed) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{inr(r.amount)}</td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  {r.active && (
                    <Button size="sm" variant="outline" onClick={() => pay(r)} data-testid="pf-pay-recurring">
                      Mark paid
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add a recurring payment</DialogTitle>
            <DialogDescription>Rent, EMIs, insurance and subscriptions that repeat on a schedule.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" v={form.name} on={(v) => setForm({ ...form, name: v })} />
            <Field label="Amount (₹)" type="number" v={form.amount} on={(v) => setForm({ ...form, amount: v })} />
            <div className="space-y-1.5">
              <Label>Repeats</Label>
              <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["daily","weekly","monthly","quarterly","yearly"].map((f) => (
                    <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {(cats.expense || []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="Next due" type="date" v={form.next_due} on={(v) => setForm({ ...form, next_due: v, start_date: v })} />
            <div className="space-y-1.5">
              <Label>Account</Label>
              <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.name || !form.amount || !form.account_id}>Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ───────────────────────────── budgets ───────────────────────────── */

function Budgets({ month, cats, onChange }) {
  const [data, setData] = useState(null);
  const [cat, setCat] = useState("");
  const [amount, setAmount] = useState("");

  const load = useCallback(async () => {
    try { setData((await api.get("/personal/budgets", { params: { month } })).data); }
    catch { toast.error("Could not load budgets"); }
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!cat || !(parseFloat(amount) > 0)) return;
    try {
      await api.post("/personal/budgets", { category: cat, amount: parseFloat(amount) });
      setCat(""); setAmount(""); load(); onChange?.();
      toast.success("Budget set");
    } catch { toast.error("Could not set that budget"); }
  };

  const TONE = { ok: "bg-emerald-500", warning: "bg-amber-500", over: "bg-rose-500" };

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-3">
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-[220px]" data-testid="pf-budget-cat">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {(cats.expense || []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="number" placeholder="Monthly limit (₹)" className="w-[180px]"
               value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Button onClick={add} data-testid="pf-set-budget">Set budget</Button>
        {data?.over_count > 0 && (
          <span className="ml-auto self-center text-sm text-rose-600 font-semibold">
            {data.over_count} budget{data.over_count === 1 ? "" : "s"} overspent
          </span>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {(data?.rows || []).map((r) => (
          <Card key={r.category} className="p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">{r.category}</p>
              <span className={`text-xs font-semibold ${
                r.state === "over" ? "text-rose-600"
                : r.state === "warning" ? "text-amber-600" : "text-muted-foreground"}`}>
                {r.used_pct}%
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${TONE[r.state]}`}
                   style={{ width: `${Math.min(100, r.used_pct)}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span className="font-mono">{inr(r.spent)} of {inr(r.budget)}</span>
              <span className={r.over_by > 0 ? "text-rose-600 font-semibold" : ""}>
                {r.over_by > 0 ? `${inr(r.over_by)} over` : `${inr(r.remaining)} left`}
              </span>
            </div>
          </Card>
        ))}
        {!data?.rows?.length && (
          <Card className="p-8 text-center md:col-span-2">
            <p className="text-sm text-muted-foreground">
              No budgets set for this month. Pick a category and a limit above.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}

/* ───────────────────────────── goals ───────────────────────────── */

function Goals({ onChange }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", target_amount: "", saved_amount: "", monthly_contribution: "", target_date: "",
  });

  const load = useCallback(async () => {
    try { setData((await api.get("/personal/goals")).data); }
    catch { toast.error("Could not load goals"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      await api.post("/personal/goals", {
        ...form,
        target_amount: parseFloat(form.target_amount) || 0,
        saved_amount: parseFloat(form.saved_amount) || 0,
        monthly_contribution: parseFloat(form.monthly_contribution) || 0,
      });
      toast.success("Goal added"); setOpen(false); load(); onChange?.();
    } catch { toast.error("Could not save"); }
  };

  const remove = async (id) => {
    try { await api.delete(`/personal/goals/${id}`); load(); onChange?.(); }
    catch { toast.error("Could not remove"); }
  };

  const PRESETS = ["Emergency Fund", "Buy a Car", "Buy a House", "Child Education",
                   "Holiday", "Retirement", "General Savings"];

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button onClick={() => setOpen(true)} data-testid="pf-add-goal">
          <Plus className="h-4 w-4 mr-1.5" /> Add goal
        </Button>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {(data?.goals || []).map((g) => (
          <Card key={g.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold flex items-center gap-1.5">
                  <Target className="h-4 w-4 text-blue-600" /> {g.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {inr(g.saved_amount)} of {inr(g.target_amount)}
                </p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(g.id)}>
                <Trash2 className="h-3.5 w-3.5 text-rose-500" />
              </Button>
            </div>
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${g.complete ? "bg-emerald-500" : "bg-blue-600"}`}
                   style={{ width: `${Math.min(100, g.progress_pct)}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs">
              <span className="text-muted-foreground">{g.progress_pct}% there</span>
              {g.complete ? <span className="text-emerald-600 font-semibold">Reached</span>
               : g.on_track === false ? (
                  <span className="text-amber-600 font-semibold">
                    Needs {inr(g.required_monthly)}/month
                  </span>
               ) : g.months_needed != null ? (
                  <span className="text-muted-foreground">{g.months_needed} months to go</span>
               ) : null}
            </div>
          </Card>
        ))}
        {!data?.goals?.length && (
          <Card className="p-8 text-center md:col-span-2">
            <Target className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No goals yet — an emergency fund is the usual first one.
            </p>
          </Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add a savings goal</DialogTitle>
            <DialogDescription>Set a target and a monthly contribution to see whether it arrives on time.</DialogDescription></DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p} onClick={() => setForm({ ...form, name: p })}
                className={`text-xs rounded-full border px-2.5 py-1 ${
                  form.name === p ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700" : ""}`}>
                {p}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Goal" v={form.name} on={(v) => setForm({ ...form, name: v })} />
            <Field label="Target (₹)" type="number" v={form.target_amount} on={(v) => setForm({ ...form, target_amount: v })} />
            <Field label="Saved so far (₹)" type="number" v={form.saved_amount} on={(v) => setForm({ ...form, saved_amount: v })} />
            <Field label="Monthly contribution (₹)" type="number" v={form.monthly_contribution} on={(v) => setForm({ ...form, monthly_contribution: v })} />
            <Field label="Target date" type="date" v={form.target_date} on={(v) => setForm({ ...form, target_date: v })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.name || !form.target_amount}>Add goal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ───────────────────────────── accounts ───────────────────────────── */

function Accounts({ accounts, onChange, openOnMount }) {
  // Arriving here from the empty state means the person has already said
  // they want to add one — so the form is open when they land.
  const [open, setOpen] = useState(!!openOnMount);
  const [form, setForm] = useState({ name: "", account_type: "savings", opening_balance: "", bank_name: "" });

  const save = async () => {
    try {
      await api.post("/personal/accounts", {
        ...form, opening_balance: parseFloat(form.opening_balance) || 0,
      });
      toast.success("Account added"); setOpen(false);
      setForm({ name: "", account_type: "savings", opening_balance: "", bank_name: "" });
      onChange?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
  };

  const remove = async (id) => {
    try { await api.delete(`/personal/accounts/${id}`); toast.success("Removed"); onChange?.(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not remove"); }
  };

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button onClick={() => setOpen(true)} data-testid="pf-add-account">
          <Plus className="h-4 w-4 mr-1.5" /> Add account
        </Button>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        {accounts.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {a.is_liability ? <CreditCard className="h-4 w-4 text-violet-600" />
                                : <Wallet className="h-4 w-4 text-blue-600" />}
                <div>
                  <p className="font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ACCOUNT_LABEL[a.account_type] || a.account_type}
                  </p>
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(a.id)}>
                <Trash2 className="h-3.5 w-3.5 text-rose-500" />
              </Button>
            </div>
            <p className={`text-2xl font-semibold tracking-tight mt-2 ${
              a.is_liability && a.balance > 0 ? "text-rose-600" : ""}`}>
              {inr(a.balance || 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {a.is_liability ? "owed on this card" : "available"}
            </p>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add an account</DialogTitle>
            <DialogDescription>A bank account, cash in hand, a wallet or a credit card.</DialogDescription></DialogHeader>
          <Field label="Name" v={form.name} on={(v) => setForm({ ...form, name: v })} />
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.account_type} onValueChange={(v) => setForm({ ...form, account_type: v })}>
              <SelectTrigger data-testid="pf-account-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ACCOUNT_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field label={form.account_type === "credit_card" ? "Amount currently owed (₹)" : "Opening balance (₹)"}
                 type="number" v={form.opening_balance}
                 on={(v) => setForm({ ...form, opening_balance: v })} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.name}>Add account</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─────────────────────── reading bank messages ─────────────────────── */

/** Paste the SMS your bank already sends you, and keep what it got right.
 *
 *  Nothing is saved until Import. Anything the parser could not read is
 *  shown rather than dropped, because a silent skip is how a month's
 *  spending goes missing without anyone noticing. */
function MessageImport({ open, onClose, accounts, cats, loans, onImported }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);

  const read = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/personal/parse-messages", { text });
      setResult(data);
      setRows((data.parsed || []).map((r) => ({ ...r, include: true })));
      if (!data.parsed?.length) toast.error("Nothing in that looked like a transaction");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not read those messages");
    } finally { setBusy(false); }
  };

  const set = (i, patch) => setRows((p) => p.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const chosen = rows.filter((r) => r.include && r.account_id);
  const missingAccount = rows.filter((r) => r.include && !r.account_id).length;

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/personal/import-messages", {
        rows: chosen.map((r) => ({
          kind: r.kind, amount: r.amount, date: r.date, account_id: r.account_id,
          category: r.category, notes: r.notes, loan_id: r.loan_id || "",
          reference: r.reference || "",
        })),
      });
      toast.success(
        `${data.imported} imported` +
        (data.skipped_duplicates ? ` · ${data.skipped_duplicates} already there` : ""));
      setText(""); setResult(null); setRows([]);
      onImported?.(); onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not import");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl" data-testid="pf-import-dialog">
        <DialogHeader>
          <DialogTitle>Read bank messages</DialogTitle>
          <DialogDescription>
            Paste the SMS alerts from your bank. Nothing is saved until you press Import,
            and anything already recorded is skipped.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <>
            <Textarea rows={9} value={text} onChange={(e) => setText(e.target.value)}
                      data-testid="pf-message-text"
                      placeholder={"Rs.1,250.00 debited from A/c XX4521 on 03-11-26 to SWIGGY. UPI Ref 412398765432.\n\nYour A/c XX4521 is credited with INR 85,000.00 on 01-Nov-26 by SALARY NOV.\n\nRs 10497.30 debited from A/c XX4521 towards EMI for Loan A/c 60123456 on 05-11-26."}
                      className="font-mono text-xs" />
            <p className="text-xs text-muted-foreground">
              One message per paragraph. OTPs and balance alerts are ignored.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={read} disabled={!text.trim() || busy} data-testid="pf-read-messages">
                {busy ? "Reading…" : "Read messages"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-muted-foreground">Read{" "}
                <strong className="text-foreground">{result.counts.read}</strong></span>
              <span className="text-muted-foreground">In{" "}
                <strong className="text-emerald-600 font-mono">{inr(result.total_in)}</strong></span>
              <span className="text-muted-foreground">Out{" "}
                <strong className="font-mono">{inr(result.total_out)}</strong></span>
              {result.counts.skipped > 0 && (
                <span className="text-muted-foreground">Skipped{" "}
                  <strong className="text-foreground">{result.counts.skipped}</strong></span>
              )}
            </div>

            {missingAccount > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                {missingAccount} message{missingAccount === 1 ? "" : "s"} could not be matched to
                an account — choose one, or untick the row.
              </div>
            )}

            <div className="max-h-[45vh] overflow-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase sticky top-0">
                  <tr>
                    <th className="px-2 py-2"></th>
                    <th className="text-left px-2 py-2">Date</th>
                    <th className="text-left px-2 py-2">Details</th>
                    <th className="text-left px-2 py-2">Account</th>
                    <th className="text-left px-2 py-2">Category</th>
                    <th className="text-right px-2 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-t ${r.include ? "" : "opacity-40"}`}>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={r.include}
                               onChange={(e) => set(i, { include: e.target.checked })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="date" value={r.date} className="h-8 w-[135px] text-xs"
                               onChange={(e) => set(i, { date: e.target.value })} />
                      </td>
                      <td className="px-2 py-1.5 max-w-[220px]">
                        <p className="truncate font-medium">{r.merchant || "—"}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{r.notes}</p>
                        {r.loan_id && (
                          <span className="text-[10px] font-semibold text-violet-600">
                            matched to a loan — the instalment will be marked paid
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <Select value={r.account_id} onValueChange={(v) => set(i, { account_id: v })}>
                          <SelectTrigger className={`h-8 w-[150px] text-xs ${
                            r.account_id ? "" : "border-amber-500"}`}>
                            <SelectValue placeholder="Choose" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map((a) => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Select value={r.category} onValueChange={(v) => set(i, { category: v })}>
                          <SelectTrigger className="h-8 w-[150px] text-xs">
                            <SelectValue placeholder="Choose" />
                          </SelectTrigger>
                          <SelectContent>
                            {(r.kind === "income" ? cats.income : cats.expense || []).map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${
                        r.kind === "income" ? "text-emerald-600" : ""}`}>
                        {r.kind === "income" ? "+" : "−"}{inr(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.unparsed?.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  {result.unparsed.length} line{result.unparsed.length === 1 ? "" : "s"} were not
                  transactions — show them
                </summary>
                <ul className="mt-2 space-y-1 text-muted-foreground font-mono">
                  {result.unparsed.map((u, i) => <li key={i} className="truncate">{u}</li>)}
                </ul>
              </details>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => { setResult(null); setRows([]); }}>
                Back
              </Button>
              <Button onClick={save} disabled={!chosen.length || busy} data-testid="pf-import-rows">
                {busy ? "Importing…" : `Import ${chosen.length}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
