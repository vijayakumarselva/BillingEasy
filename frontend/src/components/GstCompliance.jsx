// Where every invoice stands with the government: what was filed, what failed,
// and what is waiting on a vehicle number. The owner's one place to look before
// the goods leave the yard.
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { inr, fmtDate } from "@/lib/format";
import {
  ShieldCheck, AlertTriangle, Clock, RefreshCcw, Truck, FileCheck2, Loader2,
} from "lucide-react";

const TABS = [
  { key: "attention", label: "Needs attention" },
  { key: "failed", label: "Failed" },
  { key: "done", label: "Filed" },
  { key: "all", label: "All sales" },
];

const LOOK = {
  generated:     { label: "Filed", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  failed:        { label: "Failed", cls: "bg-rose-100 text-rose-800 border-rose-200" },
  pending:       { label: "In progress", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  needs_details: { label: "Needs transport", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  not_required:  { label: "Not needed", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

function Status({ value, number }) {
  if (number) {
    return (
      <span className="inline-flex flex-col">
        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 w-fit">Filed</Badge>
        <span className="text-[10px] text-muted-foreground font-mono mt-0.5 break-all max-w-[160px]">
          {number}
        </span>
      </span>
    );
  }
  const look = LOOK[value] || { label: value || "—", cls: "bg-slate-100 text-slate-600" };
  return <Badge variant="outline" className={look.cls}>{look.label}</Badge>;
}

export default function GstCompliance() {
  const [tab, setTab] = useState("attention");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");

  const load = async (which = tab) => {
    const { data } = await api.get("/gst/compliance", { params: { status: which } });
    setData(data);
  };
  useEffect(() => { load(tab); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const fileOne = async (row) => {
    setBusy(row.invoice_id);
    try {
      const { data: res } = await api.post(`/gst/compliance/file/${row.invoice_id}`);
      const bits = [];
      if (res.einvoice?.status === "generated") bits.push("IRN raised");
      if (res.eway?.status === "generated") bits.push("e-way bill raised");
      const err = res.einvoice?.error || res.eway?.error;
      if (bits.length) toast.success(`${row.invoice_no}: ${bits.join(" and ")}`);
      else if (err) toast.error(err);
      else toast.info(res.eway?.reason || res.einvoice?.reason || "Nothing to file");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not file that invoice");
    } finally {
      setBusy("");
    }
  };

  const retryAll = async () => {
    setBusy("all");
    try {
      const { data: res } = await api.post("/gst/compliance/retry-all");
      toast.success(`Tried ${res.tried}, ${res.succeeded} went through`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not retry");
    } finally {
      setBusy("");
    }
  };

  if (!data) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  const a = data.automation;
  const c = data.counts;

  return (
    <div className="space-y-4">
      {!a.enabled ? (
        <Card className="p-4 border-amber-300 bg-amber-50 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Filing is switched off</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Add your GSP credentials in Settings → GST filing and turn filing on. Until then
              nothing is sent to the government.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="p-4 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">
              {a.auto_einvoice ? "IRN raised automatically" : "IRN raised by hand"}
              {" · "}
              {a.auto_eway
                ? `e-way bill automatically above ${inr(a.eway_threshold)}`
                : "e-way bill by hand"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Every finalized B2B sale is filed the moment it is raised. Change this in
              Settings → GST filing.
            </p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "IRNs filed", value: c.irn_generated, icon: FileCheck2 },
          { label: "E-way bills", value: c.eway_generated, icon: Truck },
          { label: "Failed", value: c.failed, icon: AlertTriangle, warn: c.failed > 0 },
          { label: "Waiting on transport", value: c.needs_details, icon: Clock,
            warn: c.needs_details > 0 },
        ].map((m) => (
          <Card key={m.label} className={`p-4 ${m.warn ? "border-rose-300 bg-rose-50" : ""}`}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <m.icon className="h-3.5 w-3.5" /> {m.label}
            </div>
            <div className="text-xl font-bold">{m.value}</div>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 border-b flex-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === t.key
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {c.failed > 0 && (
          <Button size="sm" variant="outline" className="gap-1.5" disabled={busy === "all"}
                  onClick={retryAll}>
            {busy === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RefreshCcw className="h-3.5 w-3.5" />}
            Retry all failed
          </Button>
        )}
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Invoice</th>
              <th className="px-4 py-2 text-left">Customer</th>
              <th className="px-4 py-2 text-right">Value</th>
              <th className="px-4 py-2 text-left">E-invoice</th>
              <th className="px-4 py-2 text-left">E-way bill</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                {tab === "attention"
                  ? "Nothing needs your attention — everything is filed."
                  : "Nothing here yet."}
              </td></tr>
            )}
            {data.rows.map((r) => (
              <tr key={r.invoice_id} className="border-t align-top">
                <td className="px-4 py-2">
                  <div className="font-medium">{r.invoice_no}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(r.invoice_date)}</div>
                </td>
                <td className="px-4 py-2">{r.party || "—"}</td>
                <td className="px-4 py-2 text-right font-medium">{inr(r.total)}</td>
                <td className="px-4 py-2">
                  <Status value={r.einvoice_status} number={r.irn} />
                  {r.einvoice_error && (
                    <p className="text-[11px] text-rose-600 mt-1 max-w-[220px]">
                      {r.einvoice_error}
                    </p>
                  )}
                </td>
                <td className="px-4 py-2">
                  <Status value={r.ewb_status} number={r.ewb_no} />
                  {r.ewb_valid_till && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      valid till {r.ewb_valid_till}
                    </p>
                  )}
                  {r.ewb_error && (
                    <p className="text-[11px] text-rose-600 mt-1 max-w-[220px]">{r.ewb_error}</p>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="outline" disabled={busy === r.invoice_id}
                          onClick={() => fileOne(r)}>
                    {busy === r.invoice_id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : (r.irn || r.ewb_no) ? "File rest" : "File now"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
