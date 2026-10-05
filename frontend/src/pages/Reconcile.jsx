// Work down the bank statement and write the books from it.
//
// Most spending never starts with a bill — money leaves, and the paperwork
// comes later, if at all. So this page starts from what the bank says and asks
// one question per line: what was this? Answer it and the expense, bill,
// invoice or receipt is created and the line is marked off.
import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr, fmtDate } from "@/lib/format";
import {
  Search, Check, Undo2, Sparkles, Loader2, ArrowDownLeft, ArrowUpRight,
  CheckCircle2, Layers,
} from "lucide-react";

const CATEGORIES = [
  "Fuel", "Transport", "Travel", "Food & refreshments", "Rent", "Salaries & wages",
  "Electricity", "Phone & internet", "Bank charges", "Interest", "Insurance",
  "Freight & courier", "Office supplies", "Repairs & maintenance", "Marketing",
  "Professional fees", "Taxes & statutory", "Loan repayment", "General",
];

// Money coming in is not all one thing either — a transport charge, scrap sold,
// rent received. Typed freely, but suggested so the same words get reused and
// the Money page can group by them.
const INCOME_CATEGORIES = [
  "Sales", "Transport", "Freight", "Service charges", "Labour charges",
  "Commission", "Rent received", "Interest received", "Scrap sales",
  "Advance received", "Other income",
];

const KIND_HELP = {
  expense: "Money spent with no supplier bill — fuel, tea, wages, charges.",
  purchase: "A supplier bill you are paying for. Creates the bill, marked paid.",
  sale: "Money earned with no invoice yet. Raises the invoice, marked paid.",
  receipt: "A customer paying an invoice you already raised.",
  payment: "You paying a supplier bill already entered.",
  transfer: "Between your own accounts. Neither income nor cost.",
  ignore: "Personal or not business. Hidden from the books.",
};

function Money({ row }) {
  const isIn = (row.credit || 0) > 0;
  return (
    <span className={`font-semibold inline-flex items-center gap-1 ${
      isIn ? "text-emerald-600" : "text-rose-600"}`}>
      {isIn ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
      {inr(isIn ? row.credit : row.debit)}
    </span>
  );
}

export default function Reconcile() {
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [parties, setParties] = useState([]);
  const [direction, setDirection] = useState("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [drafts, setDrafts] = useState({});      // row id -> what the owner chose
  const [docs, setDocs] = useState({});          // row id -> open invoices/bills
  const [picked, setPicked] = useState([]);      // for doing many at once

  // Settling against an existing invoice or bill needs the list of open ones.
  const loadDocs = async (row) => {
    const dir = (row.credit || 0) > 0 ? "in" : "out";
    const amount = row.credit || row.debit;
    const { data } = await api.get("/reconcile/open-documents",
                                   { params: { direction: dir, amount } });
    setDocs((d) => ({ ...d, [row.id]: data.documents }));
  };

  const load = async () => {
    const [queue, sum] = await Promise.all([
      api.get("/reconcile/queue", { params: { direction, q, limit: 50 } }),
      api.get("/reconcile/summary"),
    ]);
    setData(queue.data);
    setSummary(sum.data);
    // Start every row from its suggestion, so most need one click.
    const seed = {};
    for (const r of queue.data.rows) {
      seed[r.id] = {
        kind: r.suggestion.kind,
        category: r.suggestion.category || "",
        party_id: r.suggestion.party_id || "",
        party_name: r.suggestion.party_id ? "" : (r.suggestion.name_guess || ""),
        document_id: "",
        remember: false,
      };
    }
    setDrafts(seed);
    setPicked([]);
    // A row we already suggest settling against an invoice needs that list now,
    // not only if the owner opens the dropdown.
    for (const r of queue.data.rows) {
      if (seed[r.id].kind === "receipt" || seed[r.id].kind === "payment") loadDocs(r);
    }
  };

  useEffect(() => { load(); }, [direction]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api.get("/parties").then((r) => setParties(r.data?.data ?? r.data ?? [])).catch(() => {});
  }, []);

  const set = (id, patch) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const save = async (row) => {
    setBusy(row.id);
    try {
      const { data: res } = await api.post(`/reconcile/${row.id}`, drafts[row.id]);
      toast.success(
        res.ignored ? "Hidden from the books"
                    : `Recorded — ${res.match_ref || data.kind_labels[drafts[row.id].kind]}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not record that");
    } finally {
      setBusy("");
    }
  };

  const saveMany = async () => {
    const first = drafts[picked[0]];
    if (!first) return;
    setBusy("bulk");
    try {
      const { data: res } = await api.post("/reconcile/bulk", {
        row_ids: picked, entry: { ...first, document_id: "" },
      });
      toast.success(`${res.recorded} recorded${res.failed.length ? `, ${res.failed.length} could not be` : ""}`);
      if (res.failed.length) toast.error(res.failed[0].error);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not record those");
    } finally {
      setBusy("");
    }
  };

  const rows = data?.rows || [];
  const sameKindAsFirst = useMemo(() => {
    if (!picked.length) return true;
    const k = drafts[picked[0]]?.kind;
    return picked.every((id) => drafts[id]?.kind === k);
  }, [picked, drafts]);

  if (!data || !summary)
    return <div className="p-8 text-center text-muted-foreground">Loading the statement…</div>;

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="text-2xl font-bold">Explain the statement</h1>
        <p className="text-sm text-muted-foreground">
          Every line the bank shows, waiting to be told what it was. Recording one here creates
          the expense, bill, invoice or receipt and ticks the line off.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Still to explain</div>
          <div className="text-xl font-bold">{summary.left.toLocaleString("en-IN")}</div>
          <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full"
                 style={{ width: `${summary.progress_pct}%` }} />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {summary.progress_pct}% done
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Unexplained money in</div>
          <div className="text-xl font-bold text-emerald-600">{inr(summary.unexplained_in)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Unexplained money out</div>
          <div className="text-xl font-bold text-rose-600">{inr(summary.unexplained_out)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Remembered rules</div>
          <div className="text-xl font-bold">{summary.rules}</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Lines like these fill themselves in
          </div>
        </Card>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search the narration" value={q}
                 onChange={(e) => setQ(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && load()} />
        </div>
        <div className="inline-flex bg-muted rounded-lg p-1">
          {[["all", "Everything"], ["out", "Money out"], ["in", "Money in"]].map(([v, l]) => (
            <button key={v} onClick={() => setDirection(v)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                      direction === v ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
              {l}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
        {picked.length > 1 && (
          <Button size="sm" className="gap-1.5" disabled={busy === "bulk" || !sameKindAsFirst}
                  onClick={saveMany} title={sameKindAsFirst ? "" : "Pick lines of the same type"}>
            {busy === "bulk" ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                             : <Layers className="h-3.5 w-3.5" />}
            Record {picked.length} the same way
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <Card className="p-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
          <h3 className="font-semibold">Nothing left to explain</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Every line on the statement has been recorded.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const d = drafts[row.id] || {};
            const s = row.suggestion;
            const isIn = (row.credit || 0) > 0;
            const needsDoc = d.kind === "receipt" || d.kind === "payment";
            const needsParty = ["purchase", "sale"].includes(d.kind);
            const showsCategory = ["expense", "purchase", "sale"].includes(d.kind);
            return (
              <Card key={row.id} className="p-3">
                <div className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1.5 h-4 w-4 shrink-0"
                         checked={picked.includes(row.id)}
                         onChange={(e) => setPicked((p) =>
                           e.target.checked ? [...p, row.id] : p.filter((x) => x !== row.id))} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-medium break-words">{row.description}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {fmtDate(row.date)}{row.account ? ` · ${row.account}` : ""}
                        </p>
                      </div>
                      <Money row={row} />
                    </div>

                    {s.confidence !== "low" && (
                      <p className="text-[11px] text-blue-600 mt-1.5 inline-flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> {s.reason}
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-2.5">
                      <div>
                        <label className="text-[11px] text-muted-foreground">What was this?</label>
                        <Select value={d.kind || ""}
                                onValueChange={(v) => { set(row.id, { kind: v });
                                                        if (v === "receipt" || v === "payment") loadDocs(row); }}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {s.choices.map((k) => (
                              <SelectItem key={k} value={k}>{data.kind_labels[k]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {showsCategory && (
                        <div>
                          <label className="text-[11px] text-muted-foreground">
                            {d.kind === "expense" ? "Category" : "Description"}
                          </label>
                          {d.kind === "expense" ? (
                            <Select value={d.category || "General"}
                                    onValueChange={(v) => set(row.id, { category: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {CATEGORIES.map((cName) => (
                                  <SelectItem key={cName} value={cName}>{cName}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <>
                              <Input
                                list={`cats-${row.id}`}
                                value={d.category || ""}
                                placeholder={d.kind === "sale" ? "Sales" : "Goods / services"}
                                onChange={(e) => set(row.id, { category: e.target.value })} />
                              <datalist id={`cats-${row.id}`}>
                                {(d.kind === "sale" ? INCOME_CATEGORIES : CATEGORIES)
                                  .map((cName) => <option key={cName} value={cName} />)}
                              </datalist>
                            </>
                          )}
                        </div>
                      )}

                      {(needsParty || d.kind === "expense") && (
                        <div>
                          <label className="text-[11px] text-muted-foreground">
                            {isIn ? "Customer" : "Supplier"}
                            {d.kind === "expense" ? " (optional)" : ""}
                          </label>
                          <Input
                            list={`parties-${row.id}`}
                            value={d.party_name || parties.find((p) => p.id === d.party_id)?.name || ""}
                            placeholder={s.name_guess || "Name"}
                            onChange={(e) => {
                              const match = parties.find((p) => p.name === e.target.value);
                              set(row.id, { party_name: match ? "" : e.target.value,
                                            party_id: match ? match.id : "" });
                            }} />
                          <datalist id={`parties-${row.id}`}>
                            {parties.slice(0, 300).map((p) => <option key={p.id} value={p.name} />)}
                          </datalist>
                        </div>
                      )}

                      {needsDoc && (
                        <div className="lg:col-span-2">
                          <label className="text-[11px] text-muted-foreground">
                            Against which {isIn ? "invoice" : "bill"}?
                          </label>
                          <Select value={d.document_id || ""}
                                  onValueChange={(v) => set(row.id, { document_id: v })}>
                            <SelectTrigger><SelectValue placeholder="Pick one" /></SelectTrigger>
                            <SelectContent>
                              {(docs[row.id] || []).map((doc) => (
                                <SelectItem key={doc.id} value={doc.id}>
                                  {doc.ref} · {doc.party} · due {inr(doc.due)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 mt-2.5 flex-wrap">
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <input type="checkbox" checked={!!d.remember}
                               onChange={(e) => set(row.id, { remember: e.target.checked })} />
                        Do this automatically for lines like “{s.rule_key || "this"}”
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground hidden sm:block">
                          {KIND_HELP[d.kind]}
                        </span>
                        <Button size="sm" className="gap-1.5" disabled={busy === row.id}
                                onClick={() => save(row)}>
                          {busy === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                           : <Check className="h-3.5 w-3.5" />}
                          Record
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}

          {data.total > rows.length && (
            <p className="text-center text-xs text-muted-foreground py-3">
              Showing {rows.length} of {data.total.toLocaleString("en-IN")} —
              record these and the next lot appears.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
