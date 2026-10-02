// The owner's screen: the whole floor at a glance, who is waiting, what each
// table is worth right now, and settling the bill when they come to the counter.
import { useEffect, useRef, useState } from "react";
import api, { API_BASE } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { inr } from "@/lib/format";
import {
  QrCode, Users, Receipt, BellRing, Plus, Printer, RefreshCcw, ChefHat,
  Clock, Loader2, X, Settings2,
} from "lucide-react";

const POLL_MS = 4000;

const STATE_STYLE = {
  free:        "border-slate-200 bg-white",
  seated:      "border-slate-300 bg-slate-50",
  new_order:   "border-amber-400 bg-amber-50",
  needs_guest: "border-rose-400 bg-rose-50",
  cooking:     "border-blue-400 bg-blue-50",
  ready:       "border-emerald-400 bg-emerald-50",
  bill:        "border-violet-500 bg-violet-50",
};

const STATE_DOT = {
  free: "bg-slate-300", seated: "bg-slate-400", new_order: "bg-amber-500",
  needs_guest: "bg-rose-500", cooking: "bg-blue-500", ready: "bg-emerald-500",
  bill: "bg-violet-500",
};

function guestUrl(token) {
  return `${window.location.origin}/dine/${token}`;
}

// QR images come from a public renderer so no extra dependency ships in the bundle.
function qrSrc(token, size = 220) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
    guestUrl(token))}`;
}

export default function DiningFloor() {
  const [floor, setFloor] = useState(null);
  const [tables, setTables] = useState([]);
  const [active, setActive] = useState(null);     // table row open in the drawer
  const [settle, setSettle] = useState(null);
  const [qrTable, setQrTable] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState("");
  const seqRef = useRef(0);

  const load = async () => {
    const [f, t] = await Promise.all([api.get("/dining/floor"), api.get("/dining/tables")]);
    setFloor(f.data);
    setTables(t.data);
    seqRef.current = f.data.seq;
    setActive((a) =>
      a ? f.data.tables.find((r) => r.table.id === a.table.id) || null : null);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const { data } = await api.get("/dining/live", { params: { since: seqRef.current } });
        seqRef.current = data.seq;
        if (!data.events?.length) return;
        await load();
        for (const e of data.events) {
          if (e.kind === "waiter.called")
            toast.info(`Table ${e.payload?.table_name} is calling a waiter`);
          if (e.kind === "bill.requested")
            toast.info(`Table ${e.payload?.table_name} has asked for the bill`);
        }
      } catch {
        /* a dropped poll is not worth a toast */
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const setupFloor = async () => {
    setBusy("setup");
    try {
      const { data } = await api.post("/dining/tables/bulk", { count: Number(count), prefix: "T" });
      toast.success(
        data.created ? `${data.created} table${data.created === 1 ? "" : "s"} added`
                     : "Your floor already has that many tables");
      setSetupOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not set the floor up");
    } finally {
      setBusy("");
    }
  };

  const doSettle = async () => {
    setBusy("settle");
    try {
      const { data } = await api.post(`/dining/sessions/${settle.session.id}/settle`, {
        payment_mode: settle.mode,
        discount: Number(settle.discount) || 0,
        guest_name: settle.guest_name || "",
      });
      toast.success(
        data.already ? "That bill was already settled"
                     : `Bill ${data.invoice.invoice_no} · ${inr(data.invoice.totals.grand_total)}`);
      setSettle(null);
      setActive(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not settle that table");
    } finally {
      setBusy("");
    }
  };

  const printQrSheet = () => {
    const w = window.open("", "_blank");
    if (!w) return toast.error("Allow pop-ups to print the QR sheet");
    w.document.write(`<html><head><title>Table QR codes</title><style>
      body{font-family:system-ui,sans-serif;margin:0;padding:16px}
      .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
      .card{border:1px solid #cbd5e1;border-radius:12px;padding:16px;text-align:center;
            page-break-inside:avoid}
      h2{margin:0 0 4px;font-size:26px}
      p{margin:6px 0 0;font-size:12px;color:#64748b}
      img{width:190px;height:190px}
      @media print{@page{margin:10mm}}
    </style></head><body><div class="grid">
      ${tables.map((t) => `<div class="card">
          <h2>${t.name}</h2>
          <img src="${qrSrc(t.token, 380)}" alt="QR for ${t.name}" />
          <p><b>Scan to see the menu and order</b></p>
          <p>${guestUrl(t.token)}</p>
        </div>`).join("")}
    </div><script>window.onload=()=>setTimeout(()=>window.print(),600)<\/script></body></html>`);
    w.document.close();
  };

  if (!floor)
    return <div className="p-8 text-center text-muted-foreground">Loading the floor…</div>;

  const s = floor.summary;

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Floor</h1>
          <p className="text-sm text-muted-foreground">
            Live from every table. Tap a table to see its orders or settle the bill.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCcw className="h-3.5 w-3.5" /> Refresh
          </Button>
          {tables.length > 0 && (
            <Button variant="outline" size="sm" onClick={printQrSheet} className="gap-1.5">
              <Printer className="h-3.5 w-3.5" /> Print QR sheet
            </Button>
          )}
          <Button size="sm" onClick={() => setSetupOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Tables
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Tables busy", value: `${s.occupied} of ${s.tables_total}`, icon: Users },
          { label: "Guests seated", value: s.covers, icon: Users },
          { label: "On the tables now", value: inr(s.live_total), icon: Clock },
          { label: "Bills asked for", value: s.bill_requested, icon: Receipt,
            warn: s.bill_requested > 0 },
          { label: "Settled today", value: `${s.settled_today} · ${inr(s.sales_today)}`,
            icon: Receipt },
        ].map((m) => (
          <Card key={m.label} className={`p-4 ${m.warn ? "border-violet-400 bg-violet-50" : ""}`}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <m.icon className="h-3.5 w-3.5" /> {m.label}
            </div>
            <div className="text-xl font-bold">{m.value}</div>
          </Card>
        ))}
      </div>

      {tables.length === 0 ? (
        <Card className="p-10 text-center">
          <QrCode className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-semibold">Set your tables up first</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Each table gets its own QR code. Guests scan it, see your menu and order from their
            phone — the kitchen hears about it straight away.
          </p>
          <Button className="mt-4" onClick={() => setSetupOpen(true)}>
            Add tables
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {floor.tables.map((row) => (
            <button
              key={row.table.id}
              onClick={() => setActive(row)}
              className={`text-left rounded-xl border-2 p-3 transition-all hover:shadow-md ${
                STATE_STYLE[row.state]
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold">{row.table.name}</span>
                <span className={`h-2.5 w-2.5 rounded-full ${STATE_DOT[row.state]}`} />
              </div>
              <p className="text-[11px] font-medium text-slate-600 mt-0.5">{row.state_label}</p>
              {row.session && (
                <>
                  <p className="text-sm font-bold mt-2">{inr(row.totals.grand_total)}</p>
                  <p className="text-[11px] text-slate-500">
                    {row.session.guests ? `${row.session.guests} guests · ` : ""}
                    {row.orders.filter((o) => o.status !== "cancelled").length} round
                    {row.orders.length === 1 ? "" : "s"}
                  </p>
                </>
              )}
              <div className="flex gap-1 mt-2 flex-wrap">
                {row.waiting_orders > 0 && (
                  <Badge className="bg-amber-500 text-white text-[10px]">
                    {row.waiting_orders} waiting
                  </Badge>
                )}
                {row.ready_orders > 0 && (
                  <Badge className="bg-emerald-600 text-white text-[10px]">
                    {row.ready_orders} ready
                  </Badge>
                )}
                {row.waiter_calls > 0 && (
                  <Badge className="bg-rose-500 text-white text-[10px] gap-0.5">
                    <BellRing className="h-2.5 w-2.5" /> {row.waiter_calls}
                  </Badge>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Table drawer */}
      {active && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setActive(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-background w-full max-w-md h-full overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-lg">Table {active.table.name}</h2>
                <p className="text-xs text-muted-foreground">{active.state_label}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setQrTable(active.table)}>
                  <QrCode className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setActive(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {!active.session ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground mb-3">
                    Nobody is seated here. Guests can scan the QR, or you can seat them yourself.
                  </p>
                  <Button
                    onClick={async () => {
                      await api.post("/dining/sessions/open", { table_id: active.table.id, guests: 2 });
                      toast.success(`Table ${active.table.name} seated`);
                      load();
                    }}
                  >
                    Seat guests here
                  </Button>
                </div>
              ) : (
                <>
                  {active.orders.filter((o) => o.status !== "cancelled").map((o) => (
                    <Card key={o.id} className="p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-muted-foreground">Round {o.round}</span>
                        <Badge variant="outline" className="capitalize text-[10px]">
                          {o.status.replace("_", " ")}
                        </Badge>
                      </div>
                      {o.items.map((i) => (
                        <div
                          key={i.id}
                          className={`flex justify-between text-sm ${
                            i.status === "cancelled" ? "line-through text-muted-foreground" : ""
                          }`}
                        >
                          <span>
                            {i.qty}× {i.name}
                          </span>
                          <span>{inr(i.rate * i.qty)}</span>
                        </div>
                      ))}
                    </Card>
                  ))}

                  <Card className="p-3 bg-muted/40">
                    <div className="flex justify-between text-sm">
                      <span>Food</span>
                      <span>{inr(active.totals.items_total)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>GST ({active.totals.gst_rate}%, inside the price)</span>
                      <span>{inr(active.totals.gst)}</span>
                    </div>
                    <div className="flex justify-between font-bold mt-1 pt-1 border-t">
                      <span>Total</span>
                      <span>{inr(active.totals.grand_total)}</span>
                    </div>
                  </Card>

                  <div className="flex gap-2">
                    {active.session.status === "bill_requested" && (
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={async () => {
                          await api.post(`/dining/sessions/${active.session.id}/reopen`);
                          toast.success("Table reopened for more orders");
                          load();
                        }}
                      >
                        Reopen
                      </Button>
                    )}
                    <Button
                      className="flex-1 gap-1.5"
                      onClick={() =>
                        setSettle({ session: active.session, totals: active.totals,
                                    mode: "cash", discount: 0,
                                    guest_name: active.session.guest_name || "" })}
                    >
                      <Receipt className="h-4 w-4" /> Settle {inr(active.totals.grand_total)}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settle */}
      {settle && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4" onClick={() => setSettle(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <Card className="relative w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg">Settle the bill</h3>
            <p className="text-sm text-muted-foreground">
              Table {settle.session.table_name} · {inr(settle.totals.grand_total)}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">How did they pay?</label>
                <div className="grid grid-cols-3 gap-2 mt-1.5">
                  {["cash", "upi", "card"].map((m) => (
                    <button
                      key={m}
                      onClick={() => setSettle((x) => ({ ...x, mode: m }))}
                      className={`py-2.5 rounded-lg border-2 text-sm font-semibold capitalize ${
                        settle.mode === m
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-slate-200"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Taken at the counter. Online payment can be switched on later.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Discount ₹</label>
                  <Input
                    type="number"
                    value={settle.discount}
                    onChange={(e) => setSettle((x) => ({ ...x, discount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Guest name</label>
                  <Input
                    value={settle.guest_name}
                    onChange={(e) => setSettle((x) => ({ ...x, guest_name: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <Button variant="ghost" className="flex-1" onClick={() => setSettle(null)}>
                Cancel
              </Button>
              <Button className="flex-1 gap-1.5" disabled={busy === "settle"} onClick={doSettle}>
                {busy === "settle" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Take payment
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* One table's QR */}
      {qrTable && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4" onClick={() => setQrTable(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <Card className="relative w-full max-w-xs p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-2xl">{qrTable.name}</h3>
            <img
              src={qrSrc(qrTable.token)}
              alt={`QR code for table ${qrTable.name}`}
              className="mx-auto my-4 h-52 w-52"
            />
            <p className="text-xs text-muted-foreground break-all">{guestUrl(qrTable.token)}</p>
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  navigator.clipboard?.writeText(guestUrl(qrTable.token));
                  toast.success("Link copied");
                }}
              >
                Copy link
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={async () => {
                  await api.post(`/dining/tables/${qrTable.id}/new-qr`);
                  toast.success("New QR made — reprint the sticker, the old one is dead");
                  setQrTable(null);
                  load();
                }}
              >
                New QR
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Floor setup */}
      {setupOpen && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4" onClick={() => setSetupOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <Card className="relative w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg">How many tables?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              We will make T1 to T{count || "n"}, each with its own QR code. Running this again
              never doubles your floor.
            </p>
            <Input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="mt-3"
            />
            <div className="flex gap-2 mt-4">
              <Button variant="ghost" className="flex-1" onClick={() => setSetupOpen(false)}>
                Cancel
              </Button>
              <Button className="flex-1" disabled={busy === "setup"} onClick={setupFloor}>
                {busy === "setup" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
