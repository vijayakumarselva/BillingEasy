// Where the money went. Everything recorded — off the statement, from an
// invoice, or typed by hand — in one picture, with the actual entries behind
// every slice. Click anything to open it up.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { inr, fmtDate } from "@/lib/format";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Legend,
} from "recharts";
import {
  ArrowDownLeft, ArrowUpRight, ChevronRight, Landmark, Loader2, TrendingUp, Wallet,
} from "lucide-react";

// Distinct enough to tell apart at a glance, and readable in both themes.
const COLORS = [
  "#2563EB", "#DC2626", "#059669", "#D97706", "#7C3AED", "#0891B2",
  "#DB2777", "#65A30D", "#EA580C", "#4F46E5", "#0D9488", "#9333EA",
];

function Slice({ data, onPick, activeLabel }) {
  if (!data.length)
    return (
      <div className="h-[240px] grid place-items-center text-sm text-muted-foreground">
        Nothing recorded in this period.
      </div>
    );
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="label"
          innerRadius={55}
          outerRadius={95}
          paddingAngle={2}
          onClick={(d) => onPick(d?.payload?.label)}
          cursor="pointer"
        >
          {data.map((d, i) => (
            <Cell
              key={d.label}
              fill={COLORS[i % COLORS.length]}
              opacity={!activeLabel || activeLabel === d.label ? 1 : 0.35}
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(v, n) => [inr(v), n]}
          contentStyle={{ borderRadius: 8, fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function Breakdown({ rows, direction, period, colorOffset = 0 }) {
  const [open, setOpen] = useState(null);
  const [entries, setEntries] = useState({});
  const [busy, setBusy] = useState("");

  const toggle = async (label) => {
    if (open === label) return setOpen(null);
    setOpen(label);
    if (entries[label]) return;
    setBusy(label);
    try {
      const { data } = await api.get("/money/entries", {
        params: { direction, label, from_date: period.from, to_date: period.to },
      });
      setEntries((e) => ({ ...e, [label]: data }));
    } finally {
      setBusy("");
    }
  };

  if (!rows.length)
    return <p className="text-sm text-muted-foreground py-6 text-center">Nothing yet.</p>;

  return (
    <div className="divide-y">
      {rows.map((g, i) => (
        <div key={g.label}>
          <button
            onClick={() => toggle(g.label)}
            className="w-full flex items-center gap-3 py-2.5 px-1 text-left hover:bg-muted/40 transition-colors"
          >
            <ChevronRight
              className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${
                open === g.label ? "rotate-90" : ""
              }`}
            />
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ background: COLORS[(i + colorOffset) % COLORS.length] }}
            />
            <span className="flex-1 min-w-0">
              <span className="text-sm font-medium block truncate">{g.label}</span>
              <span className="text-[11px] text-muted-foreground">
                {g.count} {g.count === 1 ? "entry" : "entries"} · {g.pct}%
              </span>
            </span>
            <span className="font-semibold text-sm shrink-0">{inr(g.total)}</span>
          </button>

          {open === g.label && (
            <div className="pl-10 pr-1 pb-3">
              {busy === g.label ? (
                <div className="py-4 text-center">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {(entries[g.label]?.entries || []).map((e) => (
                        <tr key={e.id} className="border-b last:border-0">
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap w-24">
                            {fmtDate(e.date)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{e.title}</div>
                            {e.detail && (
                              <div className="text-[11px] text-muted-foreground truncate max-w-[340px]">
                                {e.detail}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {e.from_statement && (
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <Landmark className="h-2.5 w-2.5" /> from statement
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                            {inr(e.amount)}
                          </td>
                        </tr>
                      ))}
                      {(entries[g.label]?.entries || []).length === 0 && (
                        <tr>
                          <td className="px-3 py-4 text-center text-muted-foreground" colSpan={4}>
                            No entries.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {entries[g.label] && entries[g.label].count > entries[g.label].entries.length && (
                    <p className="text-[11px] text-muted-foreground text-center py-2">
                      Showing {entries[g.label].entries.length} of {entries[g.label].count}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Money() {
  const today = new Date().toISOString().slice(0, 10);
  const ninetyAgo = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const [period, setPeriod] = useState({ from: ninetyAgo, to: today });
  const [data, setData] = useState(null);
  const [trend, setTrend] = useState([]);
  const [tab, setTab] = useState("out");
  const [picked, setPicked] = useState(null);

  const load = async () => {
    const [o, t] = await Promise.all([
      api.get("/money/overview", { params: { from_date: period.from, to_date: period.to } }),
      api.get("/money/trend", { params: { months: 6 } }),
    ]);
    setData(o.data);
    setTrend(t.data.months);
  };
  useEffect(() => { load(); }, [period.from, period.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(
    () => (tab === "out" ? data?.out_by_category : data?.in_by_party) || [],
    [data, tab]);

  if (!data) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Money</h1>
          <p className="text-sm text-muted-foreground">
            Everything that came in and went out — click any slice to see the entries behind it.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground">From</label>
            <Input type="date" value={period.from} className="h-9"
                   onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))} />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">To</label>
            <Input type="date" value={period.to} className="h-9"
                   onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" /> Money in
          </div>
          <div className="text-2xl font-bold text-emerald-600">{inr(data.total_in)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <ArrowUpRight className="h-3.5 w-3.5 text-rose-600" /> Money out
          </div>
          <div className="text-2xl font-bold text-rose-600">{inr(data.total_out)}</div>
        </Card>
        <Card className={`p-4 ${data.net < 0 ? "border-rose-200" : "border-emerald-200"}`}>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Wallet className="h-3.5 w-3.5" /> Net
          </div>
          <div className={`text-2xl font-bold ${
            data.net < 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {inr(data.net)}
          </div>
        </Card>
      </div>

      {data.recorded_from_statement > 0 && (
        <p className="text-xs text-muted-foreground">
          {data.recorded_from_statement.toLocaleString("en-IN")} of these were recorded
          straight from your bank statement.{" "}
          <Link to="/reconcile" className="text-blue-600 hover:underline">
            Explain more lines →
          </Link>
        </p>
      )}

      <div className="flex gap-1 border-b">
        {[["out", "Money out"], ["in", "Money in"]].map(([v, l]) => (
          <button
            key={v}
            onClick={() => { setTab(v); setPicked(null); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === v ? "border-blue-600 text-blue-700"
                        : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-1">
            {tab === "out" ? "What you spent on" : "Who paid you"}
          </h3>
          <p className="text-[11px] text-muted-foreground mb-2">
            {picked ? `Showing ${picked}` : "Click a slice to pick one out"}
          </p>
          <Slice data={rows} activeLabel={picked}
                 onPick={(l) => setPicked((p) => (p === l ? null : l))} />
          {picked && (
            <Button size="sm" variant="ghost" className="w-full mt-1"
                    onClick={() => setPicked(null)}>
              Show everything
            </Button>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Breakdown</h3>
          <div className="max-h-[320px] overflow-y-auto -mx-1">
            <Breakdown
              rows={picked ? rows.filter((r) => r.label === picked) : rows}
              direction={tab}
              period={period}
            />
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-1 flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4" /> Last six months
        </h3>
        <p className="text-[11px] text-muted-foreground mb-3">
          In against out, so one heavy month is obvious.
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trend} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }}
                   tickFormatter={(v) => (v >= 1e5 ? `${(v / 1e5).toFixed(0)}L` : v / 1000 + "k")} />
            <Tooltip formatter={(v, n) => [inr(v), n === "money_in" ? "In" : "Out"]}
                     contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Legend formatter={(v) => (v === "money_in" ? "Money in" : "Money out")}
                    wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="money_in" fill="#059669" radius={[4, 4, 0, 0]} />
            <Bar dataKey="money_out" fill="#DC2626" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
