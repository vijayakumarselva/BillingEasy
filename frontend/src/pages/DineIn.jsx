// The page behind the QR code on the table. No login — the token in the URL is
// the credential, and it only ever reaches this one table's session.
// Built phone-first: one thumb, one hand, poor light, impatient people.
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "@/lib/api";
import {
  Plus, Minus, ShoppingBag, ChefHat, CheckCircle2, Clock, Receipt,
  BellRing, Search, X, Leaf, AlertCircle, Loader2,
} from "lucide-react";

const rupee = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const POLL_MS = 4000;

const STATUS_LOOK = {
  placed:      { label: "Sent to the kitchen", icon: Clock,        cls: "text-amber-600 bg-amber-50 border-amber-200" },
  needs_guest: { label: "Needs your okay",     icon: AlertCircle,  cls: "text-rose-600 bg-rose-50 border-rose-200" },
  accepted:    { label: "Accepted",            icon: CheckCircle2, cls: "text-blue-600 bg-blue-50 border-blue-200" },
  preparing:   { label: "Being cooked",        icon: ChefHat,      cls: "text-blue-600 bg-blue-50 border-blue-200" },
  ready:       { label: "On its way",          icon: CheckCircle2, cls: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  served:      { label: "Served",              icon: CheckCircle2, cls: "text-slate-500 bg-slate-50 border-slate-200" },
  cancelled:   { label: "Cancelled",           icon: X,            cls: "text-slate-500 bg-slate-50 border-slate-200" },
  rejected:    { label: "Not available",       icon: X,            cls: "text-slate-500 bg-slate-50 border-slate-200" },
};

function Toast({ msg, onDone }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [msg, onDone]);
  if (!msg) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-28 z-50 bg-slate-900 text-white text-sm
                    px-4 py-2.5 rounded-full shadow-lg max-w-[90vw] text-center">
      {msg}
    </div>
  );
}

export default function DineIn() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [cart, setCart] = useState({});
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const seqRef = useRef(0);

  const url = (p = "") => `${API_BASE}/public/dine/${token}${p}`;

  useEffect(() => {
    axios
      .get(url())
      .then((r) => {
        setData(r.data);
        seqRef.current = r.data.seq || 0;
      })
      .catch((e) =>
        setErr(e.response?.data?.detail || "We could not open the menu. Please ask our staff."));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for kitchen news. Only this table's events ever come back.
  useEffect(() => {
    if (!data) return;
    let alive = true;
    const tick = async () => {
      try {
        const { data: live } = await axios.get(url("/live"), { params: { since: seqRef.current } });
        if (!alive) return;
        seqRef.current = live.seq;
        setData((d) => (d ? { ...d, session: live.session } : d));
        for (const e of live.events || []) {
          if (e.kind === "order.accepted") setToast("The kitchen has started your order");
          if (e.kind === "order.ready") setToast("Your food is on its way");
          if (e.kind === "order.needs_guest") setToast("The kitchen needs your okay on an item");
          if (e.kind === "session.settled") setToast("Thank you! Your bill is settled.");
        }
      } catch {
        /* a dropped poll is not worth telling the guest about */
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [data?.table?.id, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const menu = data?.menu || [];
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(menu.map((m) => m.category)))],
    [menu]);
  const shown = useMemo(
    () =>
      menu.filter(
        (m) =>
          (cat === "All" || m.category === cat) &&
          (!q || m.name.toLowerCase().includes(q.toLowerCase()))),
    [menu, cat, q]);

  const cartLines = Object.entries(cart)
    .map(([id, qty]) => ({ ...menu.find((m) => m.id === id), qty }))
    .filter((l) => l.id && l.qty > 0);
  const cartTotal = cartLines.reduce((s, l) => s + l.price * l.qty, 0);
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);

  const bump = (id, by) =>
    setCart((c) => {
      const next = Math.max(0, (c[id] || 0) + by);
      const out = { ...c, [id]: next };
      if (!next) delete out[id];
      return out;
    });

  const send = async () => {
    setBusy("order");
    try {
      const { data: res } = await axios.post(url("/order"), {
        items: cartLines.map((l) => ({ product_id: l.id, qty: l.qty })),
        note,
      });
      setData((d) => ({ ...d, session: res.session }));
      setCart({});
      setNote("");
      setCartOpen(false);
      setToast("Sent to the kitchen");
    } catch (e) {
      setToast(e.response?.data?.detail || "That did not go through — please try again");
    } finally {
      setBusy("");
    }
  };

  const confirmChange = async (orderId, cancel) => {
    setBusy(orderId);
    try {
      await axios.post(url(`/orders/${orderId}/confirm`), { cancel });
      const { data: live } = await axios.get(url("/live"), { params: { since: 0 } });
      setData((d) => ({ ...d, session: live.session }));
      setToast(cancel ? "Removed from your order" : "Thanks — the kitchen is on it");
    } finally {
      setBusy("");
    }
  };

  const callWaiter = async () => {
    setBusy("waiter");
    try {
      await axios.post(url("/call-waiter"), {});
      setToast("A waiter is on the way");
    } finally {
      setBusy("");
    }
  };

  const askForBill = async () => {
    setBusy("bill");
    try {
      const { data: res } = await axios.post(url("/request-bill"), {});
      setData((d) => ({ ...d, session: res.session }));
      setToast(res.message);
    } catch (e) {
      setToast(e.response?.data?.detail || "Please call a waiter for the bill");
    } finally {
      setBusy("");
    }
  };

  if (err)
    return (
      <div className="min-h-screen grid place-items-center p-8 text-center bg-slate-50">
        <div>
          <AlertCircle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">{err}</p>
        </div>
      </div>
    );
  if (!data)
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );

  const session = data.session;
  const orders = (session?.orders || []).filter((o) => o.status !== "cancelled" || o.kitchen_note);
  const billed = session?.status === "bill_requested";
  const settled = session?.status === "settled";
  const needsOk = (session?.orders || []).filter((o) => o.status === "needs_guest");

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="font-bold text-slate-900 truncate">{data.outlet.name}</h1>
            <p className="text-xs text-slate-500">
              Table {data.table.name}
              {data.table.zone ? ` · ${data.table.zone}` : ""}
            </p>
          </div>
          <button
            onClick={callWaiter}
            disabled={busy === "waiter"}
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 border
                       border-blue-200 bg-blue-50 rounded-full px-3 py-2 active:scale-95 transition-transform"
          >
            <BellRing className="h-3.5 w-3.5" /> Call waiter
          </button>
        </div>
      </header>

      {/* The kitchen needs an answer — this comes before anything else */}
      {needsOk.map((o) => (
        <div key={o.id} className="mx-4 mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="font-semibold text-rose-900 text-sm">
            {o.kitchen_note || "The kitchen cannot make one of your dishes."}
          </p>
          <ul className="mt-2 space-y-1">
            {o.items.map((i) => (
              <li
                key={i.id}
                className={`text-sm flex justify-between ${
                  i.status === "cancelled" ? "text-rose-400 line-through" : "text-slate-700"
                }`}
              >
                <span>
                  {i.name} × {i.qty}
                </span>
                <span>{rupee(i.rate * i.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => confirmChange(o.id, true)}
              disabled={busy === o.id}
              className="flex-1 text-sm font-semibold text-rose-700 border border-rose-300 rounded-lg py-2.5"
            >
              Cancel this round
            </button>
            <button
              onClick={() => confirmChange(o.id, false)}
              disabled={busy === o.id}
              className="flex-1 text-sm font-semibold text-white bg-rose-600 rounded-lg py-2.5"
            >
              Send the rest
            </button>
          </div>
        </div>
      ))}

      {/* What has been ordered so far */}
      {orders.length > 0 && (
        <section className="mx-4 mt-4 bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-2.5 border-b flex items-center justify-between">
            <span className="font-semibold text-sm text-slate-900">Your order</span>
            <span className="text-xs text-slate-400">
              {session.order_count} round{session.order_count === 1 ? "" : "s"}
            </span>
          </div>
          {orders.map((o) => {
            const look = STATUS_LOOK[o.status] || STATUS_LOOK.placed;
            const Icon = look.icon;
            return (
              <div key={o.id} className="px-4 py-3 border-b last:border-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-slate-400">Round {o.round}</span>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${look.cls}`}
                  >
                    <Icon className="h-3 w-3" /> {look.label}
                  </span>
                </div>
                {o.items.map((i) => (
                  <div
                    key={i.id}
                    className={`flex justify-between text-sm ${
                      i.status === "cancelled" ? "text-slate-400 line-through" : "text-slate-700"
                    }`}
                  >
                    <span>
                      {i.name} × {i.qty}
                      {i.note && <span className="text-xs text-slate-400"> · {i.note}</span>}
                    </span>
                    <span>{rupee(i.rate * i.qty)}</span>
                  </div>
                ))}
              </div>
            );
          })}
          <div className="px-4 py-3 bg-slate-50 space-y-1">
            {session.totals.service_charge > 0 && (
              <div className="flex justify-between text-xs text-slate-500">
                <span>Service charge</span>
                <span>{rupee(session.totals.service_charge)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-slate-500">
              <span>GST ({session.totals.gst_rate}%, included)</span>
              <span>{rupee(session.totals.gst)}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-900">
              <span>Total</span>
              <span>{rupee(session.totals.grand_total)}</span>
            </div>
          </div>
        </section>
      )}

      {billed && (
        <div className="mx-4 mt-4 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
          <Receipt className="h-5 w-5 text-emerald-600 mx-auto mb-1.5" />
          <p className="text-sm font-semibold text-emerald-900">Your bill is on its way</p>
          <p className="text-xs text-emerald-700 mt-1">{data.settings.pay_at_counter_note}</p>
        </div>
      )}
      {settled && (
        <div className="mx-4 mt-4 rounded-xl bg-slate-100 border p-4 text-center">
          <p className="text-sm font-semibold">Thank you for dining with us</p>
          <p className="text-xs text-slate-500 mt-0.5">Bill {session.invoice_no}</p>
        </div>
      )}

      {/* Menu */}
      {!billed && !settled && (
        <>
          <div className="sticky top-[57px] z-20 bg-slate-50 pt-4 pb-2">
            <div className="px-4 relative">
              <Search className="h-4 w-4 absolute left-7 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search the menu"
                className="w-full bg-white border rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-blue-400"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto px-4 mt-2 pb-1 no-scrollbar">
              {categories.map((cName) => (
                <button
                  key={cName}
                  onClick={() => setCat(cName)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    cat === cName
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-200"
                  }`}
                >
                  {cName}
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 space-y-2 mt-1">
            {shown.length === 0 && (
              <p className="text-center text-sm text-slate-400 py-10">Nothing matches that.</p>
            )}
            {shown.map((m) => (
              <div
                key={m.id}
                className={`bg-white rounded-xl border p-3 flex items-center gap-3 ${
                  m.available ? "" : "opacity-55"
                }`}
              >
                {m.image_b64 ? (
                  <img src={m.image_b64} alt="" className="h-16 w-16 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="h-16 w-16 rounded-lg bg-slate-100 grid place-items-center shrink-0">
                    <ChefHat className="h-6 w-6 text-slate-300" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {m.veg === true && <Leaf className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                    <h3 className="font-semibold text-sm text-slate-900 truncate">{m.name}</h3>
                  </div>
                  {m.description && (
                    <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{m.description}</p>
                  )}
                  <p className="font-bold text-slate-900 text-sm mt-1">{rupee(m.price)}</p>
                </div>
                {m.available ? (
                  cart[m.id] ? (
                    <div className="flex items-center gap-2 bg-blue-600 rounded-lg text-white shrink-0">
                      <button onClick={() => bump(m.id, -1)} className="px-2.5 py-2">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="font-bold text-sm w-4 text-center">{cart[m.id]}</span>
                      <button onClick={() => bump(m.id, 1)} className="px-2.5 py-2">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => bump(m.id, 1)}
                      className="shrink-0 border-2 border-blue-600 text-blue-600 font-bold text-xs
                                 rounded-lg px-4 py-2 active:scale-95 transition-transform"
                    >
                      ADD
                    </button>
                  )
                ) : (
                  <span className="shrink-0 text-[11px] text-slate-400 font-medium px-2">
                    Finished
                    <br />
                    for today
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Bottom bar */}
      {!settled && !(billed && cartCount === 0) && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {cartCount > 0 ? (
            <button
              onClick={() => setCartOpen(true)}
              className="w-full bg-blue-600 text-white rounded-xl py-3.5 font-semibold flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
            >
              <ShoppingBag className="h-4 w-4" />
              {cartCount} item{cartCount === 1 ? "" : "s"} · {rupee(cartTotal)} · Review
            </button>
          ) : session?.order_count > 0 && !billed ? (
            <button
              onClick={askForBill}
              disabled={busy === "bill"}
              className="w-full border-2 border-slate-900 text-slate-900 rounded-xl py-3.5 font-semibold flex items-center justify-center gap-2"
            >
              <Receipt className="h-4 w-4" /> Ask for the bill · {rupee(session.totals.grand_total)}
            </button>
          ) : billed ? null : (
            <p className="text-center text-xs text-slate-400 py-1">
              Tap ADD to start your order
            </p>
          )}
        </div>
      )}

      {/* Cart sheet */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setCartOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white px-4 py-3 border-b flex items-center justify-between">
              <h2 className="font-bold">Your order</h2>
              <button onClick={() => setCartOpen(false)} className="p-1">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="px-4 py-2">
              {cartLines.map((l) => (
                <div key={l.id} className="flex items-center gap-3 py-2.5 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.name}</p>
                    <p className="text-xs text-slate-500">{rupee(l.price)} each</p>
                  </div>
                  <div className="flex items-center gap-2 border rounded-lg">
                    <button onClick={() => bump(l.id, -1)} className="px-2.5 py-1.5">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="font-semibold text-sm w-4 text-center">{l.qty}</span>
                    <button onClick={() => bump(l.id, 1)} className="px-2.5 py-1.5">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="font-semibold text-sm w-16 text-right">
                    {rupee(l.price * l.qty)}
                  </span>
                </div>
              ))}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything the kitchen should know? (less spicy, no onion…)"
                rows={2}
                className="w-full mt-3 border rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
            </div>
            <div className="sticky bottom-0 bg-white border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex justify-between font-bold mb-2.5">
                <span>Total</span>
                <span>{rupee(cartTotal)}</span>
              </div>
              <button
                onClick={send}
                disabled={busy === "order" || cartLines.length === 0}
                className="w-full bg-blue-600 text-white rounded-xl py-3.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {busy === "order" && <Loader2 className="h-4 w-4 animate-spin" />}
                Send to the kitchen
              </button>
              <p className="text-center text-[11px] text-slate-400 mt-2">
                GST is already included · pay at the counter when you leave
              </p>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toast} onDone={() => setToast("")} />
    </div>
  );
}
