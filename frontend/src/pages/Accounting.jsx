// The books, read straight from the double-entry ledger.
//
// Everything here is derived from journal entries rather than re-aggregated
// from invoices and bills, which is why the trial balance can be relied on to
// balance — and says so plainly when it does not.
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
import { inr, fmtDate } from "@/lib/format";
import {
  Scale, BookOpen, Landmark, TrendingUp, RefreshCw, Plus, Trash2,
  CheckCircle2, AlertTriangle, ArrowLeft,
} from "lucide-react";

const todayISO = () => new Date().toISOString().slice(0, 10);
const fyStart = () => {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-04-01`;
};

/** Says whether the books agree with themselves, in words an owner can act on. */
function BalanceBadge({ balanced, difference }) {
  if (balanced) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 rounded-full px-3 py-1">
        <CheckCircle2 className="h-3.5 w-3.5" /> Balanced
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 dark:bg-rose-950/30 rounded-full px-3 py-1">
      <AlertTriangle className="h-3.5 w-3.5" /> Out by {inr(Math.abs(difference))}
    </span>
  );
}

function Money({ value, bold = false }) {
  return (
    <span className={`font-mono tabular-nums ${bold ? "font-bold" : ""}`}>
      {value ? inr(value) : "—"}
    </span>
  );
}

export default function Accounting() {
  const [tab, setTab] = useState("trial");
  const [since, setSince] = useState(fyStart());
  const [upto, setUpto] = useState(todayISO());
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rebuilding, setRebuilding] = useState(false);
  const [account, setAccount] = useState(null);      // drilled-into account
  const [accounts, setAccounts] = useState([]);
  const [journalOpen, setJournalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [tb, pl, bs, jr] = await Promise.all([
        api.get("/ledger/trial-balance", { params: { upto } }),
        api.get("/ledger/profit-loss", { params: { since, upto } }),
        api.get("/ledger/balance-sheet", { params: { upto } }),
        api.get("/ledger/journal", { params: { since, upto, limit: 200 } }),
      ]);
      setData({ tb: tb.data, pl: pl.data, bs: bs.data, journal: jr.data });
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not load the books.");
      setData({});
    } finally {
      setLoading(false);
    }
  }, [since, upto]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/ledger/accounts").then((r) => setAccounts(r.data || [])).catch(() => {});
  }, []);

  const rebuild = async () => {
    setRebuilding(true);
    try {
      const { data: r } = await api.post("/ledger/rebuild");
      const p = r.posted || {};
      toast.success(
        `Books rebuilt — ${p.invoices || 0} invoices, ${p.purchases || 0} bills, ` +
        `${p.payments || 0} payments, ${p.expenses || 0} expenses.` +
        (r.balanced ? " Trial balance agrees." : ` Out by ${inr(r.difference)}.`),
        { duration: 8000 });
      if ((r.problems || []).length) {
        toast.warning(`${r.problems.length} document(s) could not be posted — see the Day Book.`);
      }
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Rebuild failed");
    } finally {
      setRebuilding(false);
    }
  };

  const openAccount = async (code) => {
    try {
      const { data: v } = await api.get(`/ledger/account/${encodeURIComponent(code)}`,
                                        { params: { since, upto } });
      setAccount(v);
    } catch { toast.error("Could not open that account"); }
  };

  const empty = !loading && !error && (data.tb?.entries ?? 0) === 0;

  return (
    <div className="space-y-5" data-testid="accounting-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Scale className="h-6 w-6 text-blue-600" /> Books of Account
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Double-entry ledger. Every invoice, bill, receipt and payment posts here.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={since} onChange={(e) => setSince(e.target.value)}
                   className="w-[150px]" data-testid="ledger-from" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={upto} onChange={(e) => setUpto(e.target.value)}
                   className="w-[150px]" data-testid="ledger-to" />
          </div>
          <Button variant="outline" onClick={() => setJournalOpen(true)} data-testid="new-journal">
            <Plus className="h-4 w-4 mr-1.5" /> Journal Entry
          </Button>
          <Button variant="outline" onClick={rebuild} disabled={rebuilding}
                  data-testid="rebuild-ledger">
            <RefreshCw className={`h-4 w-4 mr-1.5 ${rebuilding ? "animate-spin" : ""}`} />
            {rebuilding ? "Rebuilding…" : "Rebuild"}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="p-4 border-rose-200 bg-rose-50 dark:bg-rose-950/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-rose-800 dark:text-rose-300">
                Your books could not be loaded
              </p>
              <p className="text-xs text-rose-700/80 mt-0.5">{error}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={load}>Try again</Button>
            </div>
          </div>
        </Card>
      )}

      {empty && (
        <Card className="p-8 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-semibold">Your ledger is empty</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Press <strong>Rebuild</strong> to post the invoices, bills, payments and expenses
            already in your account. Nothing is changed or deleted — the entries are derived
            from documents you have already saved, and can be rebuilt at any time.
          </p>
          <Button className="mt-4" onClick={rebuild} disabled={rebuilding}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${rebuilding ? "animate-spin" : ""}`} />
            Build my books
          </Button>
        </Card>
      )}

      {!empty && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="trial" data-testid="tab-trial">Trial Balance</TabsTrigger>
            <TabsTrigger value="pl" data-testid="tab-pl">Profit &amp; Loss</TabsTrigger>
            <TabsTrigger value="bs" data-testid="tab-bs">Balance Sheet</TabsTrigger>
            <TabsTrigger value="journal" data-testid="tab-journal">Day Book</TabsTrigger>
          </TabsList>

          {/* ── Trial balance ── */}
          <TabsContent value="trial">
            <Card className="mt-4">
              <div className="px-5 py-3 border-b flex items-center justify-between">
                <h3 className="font-semibold text-sm">Trial Balance as at {fmtDate(upto)}</h3>
                {data.tb && <BalanceBadge balanced={data.tb.balanced} difference={data.tb.difference} />}
              </div>
              {loading ? <div className="p-5 space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-7 w-full" />)}</div> : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left px-5 py-2 font-semibold">Account</th>
                      <th className="text-right px-5 py-2 font-semibold">Debit</th>
                      <th className="text-right px-5 py-2 font-semibold">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.tb?.rows || []).map((r) => (
                      <tr key={r.code} onClick={() => openAccount(r.code)}
                          className="border-t hover:bg-muted/40 cursor-pointer">
                        <td className="px-5 py-2">
                          <span className="text-muted-foreground font-mono text-xs mr-2">{r.code}</span>
                          {r.name}
                        </td>
                        <td className="px-5 py-2 text-right"><Money value={r.debit} /></td>
                        <td className="px-5 py-2 text-right"><Money value={r.credit} /></td>
                      </tr>
                    ))}
                    <tr className="border-t-2 bg-muted/30 font-bold">
                      <td className="px-5 py-2.5">Total</td>
                      <td className="px-5 py-2.5 text-right"><Money value={data.tb?.total_debit} bold /></td>
                      <td className="px-5 py-2.5 text-right"><Money value={data.tb?.total_credit} bold /></td>
                    </tr>
                  </tbody>
                </table>
              )}
            </Card>
          </TabsContent>

          {/* ── Profit & loss ── */}
          <TabsContent value="pl">
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <Card>
                <div className="px-5 py-3 border-b font-semibold text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" /> Income
                </div>
                <Rows rows={data.pl?.income} total={data.pl?.total_income} onPick={openAccount} />
              </Card>
              <Card>
                <div className="px-5 py-3 border-b font-semibold text-sm">Expenses</div>
                <Rows rows={data.pl?.expenses} total={data.pl?.total_expenses} onPick={openAccount} />
              </Card>
            </div>
            <Card className="mt-4 p-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Net profit · {fmtDate(since)} to {fmtDate(upto)}
                </p>
                <p className={`text-3xl font-bold mt-1 ${(data.pl?.net_profit || 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {inr(data.pl?.net_profit || 0)}
                </p>
              </div>
              <TrendingUp className="h-10 w-10 text-muted-foreground/20" />
            </Card>
          </TabsContent>

          {/* ── Balance sheet ── */}
          <TabsContent value="bs">
            <div className="flex justify-end mt-4">
              {data.bs && <BalanceBadge balanced={data.bs.balanced} difference={data.bs.difference} />}
            </div>
            <div className="grid md:grid-cols-2 gap-4 mt-2">
              <Card>
                <div className="px-5 py-3 border-b font-semibold text-sm">Assets</div>
                <Rows rows={data.bs?.assets} total={data.bs?.total_assets} onPick={openAccount} />
              </Card>
              <div className="space-y-4">
                <Card>
                  <div className="px-5 py-3 border-b font-semibold text-sm">Liabilities</div>
                  <Rows rows={data.bs?.liabilities} total={data.bs?.total_liabilities} onPick={openAccount} />
                </Card>
                <Card>
                  <div className="px-5 py-3 border-b font-semibold text-sm">Equity</div>
                  <Rows rows={data.bs?.equity} total={data.bs?.total_equity} onPick={openAccount} />
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ── Day book ── */}
          <TabsContent value="journal">
            <Card className="mt-4">
              <div className="px-5 py-3 border-b font-semibold text-sm">
                Day Book · {data.journal?.count || 0} entries
              </div>
              <div className="divide-y">
                {(data.journal?.entries || []).map((e) => (
                  <div key={e.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-mono text-xs text-muted-foreground">{fmtDate(e.date)}</span>
                        <span className="text-[10px] uppercase font-bold tracking-wide bg-muted rounded px-1.5 py-0.5">
                          {e.voucher_type}
                        </span>
                        <span className="font-medium">{e.voucher_no || e.narration}</span>
                      </div>
                      <Money value={e.total} bold />
                    </div>
                    <div className="mt-2 ml-1 space-y-0.5">
                      {e.lines.map((l, i) => (
                        <div key={i} className="flex items-center text-xs text-muted-foreground">
                          <span className={`flex-1 ${l.credit ? "pl-8" : ""}`}>
                            {l.account_name}
                          </span>
                          <span className="w-28 text-right font-mono">{l.debit ? inr(l.debit) : ""}</span>
                          <span className="w-28 text-right font-mono">{l.credit ? inr(l.credit) : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* ── One account's ledger ── */}
      <Dialog open={!!account} onOpenChange={(o) => !o && setAccount(null)}>
        <DialogContent className="max-w-4xl" data-testid="account-ledger">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-blue-600" />
              {account?.name}
              <span className="text-xs font-normal text-muted-foreground">({account?.account})</span>
            </DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground flex gap-4">
            <span>Opening <strong className="font-mono">{inr(account?.opening || 0)}</strong></span>
            <span>Closing <strong className="font-mono">{inr(account?.closing || 0)}</strong></span>
          </div>
          <div className="max-h-[55vh] overflow-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Particulars</th>
                  <th className="text-right px-3 py-2">Debit</th>
                  <th className="text-right px-3 py-2">Credit</th>
                  <th className="text-right px-3 py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {(account?.rows || []).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5 font-mono text-xs">{fmtDate(r.date)}</td>
                    <td className="px-3 py-1.5">
                      {r.voucher_no || r.narration}
                      <span className="text-[10px] uppercase text-muted-foreground ml-2">{r.voucher_type}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">{r.debit ? inr(r.debit) : ""}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{r.credit ? inr(r.credit) : ""}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold">{inr(r.balance)}</td>
                  </tr>
                ))}
                {!account?.rows?.length && (
                  <tr><td colSpan={5} className="text-center text-muted-foreground py-8 text-sm">
                    Nothing posted to this account in the period.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccount(null)}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <JournalDialog open={journalOpen} onOpenChange={setJournalOpen}
                     accounts={accounts} onSaved={load} />
    </div>
  );
}

function Rows({ rows, total, onPick }) {
  if (!rows) return <div className="p-5 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-6 w-full" />)}</div>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.code} onClick={() => onPick?.(r.code)}
              className="border-t hover:bg-muted/40 cursor-pointer">
            <td className="px-5 py-2">{r.name}</td>
            <td className="px-5 py-2 text-right"><Money value={r.amount} /></td>
          </tr>
        ))}
        {!rows.length && (
          <tr><td className="px-5 py-6 text-center text-muted-foreground text-sm">Nothing here yet.</td></tr>
        )}
        <tr className="border-t-2 bg-muted/30 font-bold">
          <td className="px-5 py-2.5">Total</td>
          <td className="px-5 py-2.5 text-right"><Money value={total} bold /></td>
        </tr>
      </tbody>
    </table>
  );
}

/** A manual entry — depreciation, capital, a contra between cash and bank. */
function JournalDialog({ open, onOpenChange, accounts, onSaved }) {
  const blank = () => [{ account: "", debit: "", credit: "" },
                       { account: "", debit: "", credit: "" }];
  const [date, setDate] = useState(todayISO());
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState(blank());
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    const d = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
    const c = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
    return { d, c, ok: d > 0 && Math.abs(d - c) < 0.005 };
  }, [lines]);

  const set = (i, patch) => setLines((p) => p.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/ledger/journal", {
        date, narration,
        lines: lines.filter((l) => l.account && (l.debit || l.credit)).map((l) => ({
          account: l.account, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0,
        })),
      });
      toast.success("Journal entry posted");
      setLines(blank()); setNarration("");
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not post the entry");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="journal-dialog">
        <DialogHeader><DialogTitle>New Journal Entry</DialogTitle>
            <DialogDescription>A manual entry — depreciation, capital, or a contra between cash and bank. Debits must equal credits.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Narration</Label>
            <Input value={narration} onChange={(e) => setNarration(e.target.value)}
                   placeholder="e.g. Depreciation for the year" />
          </div>
        </div>

        <div className="space-y-2 mt-1">
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                {i === 0 && <Label className="text-xs">Account</Label>}
                <Select value={l.account} onValueChange={(v) => set(i, { account: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose an account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.code} value={a.code}>{a.code} · {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-32 space-y-1">
                {i === 0 && <Label className="text-xs">Debit</Label>}
                <Input type="number" value={l.debit}
                       onChange={(e) => set(i, { debit: e.target.value, credit: "" })} />
              </div>
              <div className="w-32 space-y-1">
                {i === 0 && <Label className="text-xs">Credit</Label>}
                <Input type="number" value={l.credit}
                       onChange={(e) => set(i, { credit: e.target.value, debit: "" })} />
              </div>
              <Button size="icon" variant="ghost" onClick={() => setLines((p) => p.filter((_, x) => x !== i))}
                      disabled={lines.length <= 2}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline"
                  onClick={() => setLines((p) => [...p, { account: "", debit: "", credit: "" }])}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add line
          </Button>
        </div>

        <div className={`flex justify-between text-sm rounded-lg px-4 py-2.5 ${
          totals.ok ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground"}`}>
          <span className="font-medium">
            {totals.ok ? "Balanced" : "Debits must equal credits"}
          </span>
          <span className="font-mono">{inr(totals.d)} / {inr(totals.c)}</span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!totals.ok || saving} data-testid="journal-save">
            {saving ? "Posting…" : "Post entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
