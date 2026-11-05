// Who owes what, and how late they are.
//
// The figure an owner acts on is never the total — it is the oldest bill and
// the customer sitting past their limit. Both lead here.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { inr, fmtDate } from "@/lib/format";
import { openExternalUrl } from "@/lib/mobile";
import {
  AlertTriangle, ChevronRight, Clock, MessageCircle, FileText, Ban,
} from "lucide-react";

/** Older money is worse money — the shade follows the bucket, not the amount. */
const BUCKET_TONE = {
  current:  "text-muted-foreground",
  d0_30:    "text-foreground",
  d31_60:   "text-amber-600 dark:text-amber-400",
  d61_90:   "text-orange-600 dark:text-orange-400",
  d90_plus: "text-rose-600 dark:text-rose-400 font-semibold",
};

export default function Receivables() {
  const [kind, setKind] = useState("receivable");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);     // the party drilled into
  const nav = useNavigate();

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data: d } = await api.get("/reports/ageing", { params: { kind } });
      setData(d);
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not load the ageing report.");
      setData(null);
    } finally { setLoading(false); }
  }, [kind]);

  useEffect(() => { load(); }, [load]);

  const isRecv = kind === "receivable";
  const buckets = data?.buckets || [];

  const chase = (row) => {
    const phone = String(row.phone || "").replace(/\D/g, "");
    if (!phone) { toast.error(`No phone number on ${row.party_name}'s record`); return; }
    const msg = encodeURIComponent(
      `Hello ${row.party_name}, a gentle reminder that ${inr(row.total)} is outstanding ` +
      `on your account${row.oldest_days > 0 ? `, the oldest bill ${row.oldest_days} days past due` : ""}. ` +
      `Could you let us know when payment is expected? Thank you.`);
    openExternalUrl(`https://wa.me/${phone.length === 10 ? "91" + phone : phone}?text=${msg}`);
  };

  return (
    <div className="space-y-5" data-testid="receivables-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Clock className="h-6 w-6 text-blue-600" /> Ageing
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isRecv ? "Money owed to you, by how late it is."
                    : "What you owe suppliers, by how late it is."}
          </p>
        </div>
        <Tabs value={kind} onValueChange={setKind}>
          <TabsList>
            <TabsTrigger value="receivable" data-testid="tab-receivable">Receivable</TabsTrigger>
            <TabsTrigger value="payable" data-testid="tab-payable">Payable</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {error && (
        <Card className="p-4 border-rose-200 bg-rose-50 dark:bg-rose-950/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-rose-800 dark:text-rose-300">
                The ageing report could not be loaded
              </p>
              <p className="text-xs text-rose-700/80 mt-0.5">{error}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={load}>Try again</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Bucket summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {buckets.map((b) => (
          <div key={b.key} className="rounded-xl border bg-card px-4 py-3">
            <p className="text-[13px] font-medium text-muted-foreground">{b.label}</p>
            {loading ? <Skeleton className="h-7 w-20 mt-1.5" /> : (
              <p className={`text-xl font-semibold tracking-tight mt-1 ${BUCKET_TONE[b.key]}`}>
                {inr(data?.totals?.[b.key] || 0)}
              </p>
            )}
          </div>
        ))}
      </div>

      {!loading && data && data.overdue_total > 0 && (
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{inr(data.overdue_total)}</strong> of{" "}
          {inr(data.total_outstanding)} is past its due date.
        </p>
      )}

      <Card>
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h3 className="font-semibold text-sm">
            {isRecv ? "Customers" : "Suppliers"}{data ? ` · ${data.rows.length}` : ""}
          </h3>
          <span className="text-xs text-muted-foreground">as at {fmtDate(data?.as_at)}</span>
        </div>

        {loading ? (
          <div className="p-5 space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : !data?.rows?.length ? (
          <div className="py-12 text-center">
            <p className="font-semibold">Nothing outstanding</p>
            <p className="text-sm text-muted-foreground mt-1">
              {isRecv ? "Every invoice has been paid." : "Every bill has been settled."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-2 font-semibold">{isRecv ? "Customer" : "Supplier"}</th>
                  {buckets.map((b) => (
                    <th key={b.key} className="text-right px-3 py-2 font-semibold whitespace-nowrap">{b.label}</th>
                  ))}
                  <th className="text-right px-5 py-2 font-semibold">Total</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.party_id} className="border-t hover:bg-muted/40">
                    <td className="px-5 py-2.5">
                      <button className="text-left" onClick={() => setOpen(r)}>
                        <span className="font-medium">{r.party_name || "—"}</span>
                        <span className="flex items-center gap-2 mt-0.5">
                          {r.oldest_days > 0 && (
                            <span className="text-[11px] text-muted-foreground">
                              oldest {r.oldest_days}d
                            </span>
                          )}
                          {r.over_limit && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
                              <Ban className="h-3 w-3" /> over limit
                            </span>
                          )}
                        </span>
                      </button>
                    </td>
                    {buckets.map((b) => (
                      <td key={b.key} className={`text-right px-3 py-2.5 font-mono tabular-nums ${BUCKET_TONE[b.key]}`}>
                        {r[b.key] ? inr(r[b.key]) : "—"}
                      </td>
                    ))}
                    <td className="text-right px-5 py-2.5 font-mono tabular-nums font-semibold">{inr(r.total)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {isRecv && (
                        <Button size="icon" variant="ghost" title="Send a reminder on WhatsApp"
                                onClick={() => chase(r)} data-testid="chase">
                          <MessageCircle className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => setOpen(r)} title="Open">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 bg-muted/30 font-bold">
                  <td className="px-5 py-2.5">Total</td>
                  {buckets.map((b) => (
                    <td key={b.key} className="text-right px-3 py-2.5 font-mono tabular-nums">
                      {data.totals[b.key] ? inr(data.totals[b.key]) : "—"}
                    </td>
                  ))}
                  <td className="text-right px-5 py-2.5 font-mono tabular-nums">{inr(data.total_outstanding)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Which bills make up that total */}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-2xl" data-testid="party-bills">
          <DialogHeader>
            <DialogTitle>{open?.party_name}</DialogTitle>
            <DialogDescription>The individual bills making up this balance, oldest first.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Outstanding <strong className="font-mono text-foreground">{inr(open?.total || 0)}</strong></span>
            {!!open?.credit_limit && (
              <span>Limit <strong className="font-mono text-foreground">{inr(open.credit_limit)}</strong></span>
            )}
            {!!open?.credit_days && <span>Terms {open.credit_days} days</span>}
          </div>
          <div className="max-h-[55vh] overflow-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Document</th>
                  <th className="text-left px-3 py-2">Due</th>
                  <th className="text-right px-3 py-2">Overdue</th>
                  <th className="text-right px-3 py-2">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {(open?.documents || []).map((d) => (
                  <tr key={d.id} className="border-t hover:bg-muted/40 cursor-pointer"
                      onClick={() => { setOpen(null); nav(`/sales/${d.id}`); }}>
                    <td className="px-3 py-2 font-medium text-blue-600">{d.ref}</td>
                    <td className="px-3 py-2 font-mono text-xs">{d.due_date ? fmtDate(d.due_date) : "—"}</td>
                    <td className={`px-3 py-2 text-right ${BUCKET_TONE[d.bucket]}`}>
                      {d.days_overdue > 0 ? `${d.days_overdue} days` : "not due"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{inr(d.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            {open?.phone && (
              <Button variant="outline" onClick={() => chase(open)}>
                <MessageCircle className="h-4 w-4 mr-1.5 text-green-600" /> Send reminder
              </Button>
            )}
            <Button variant="outline" onClick={() => { setOpen(null); nav(`/parties/${open.party_id}`); }}>
              <FileText className="h-4 w-4 mr-1.5" /> Open account
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
