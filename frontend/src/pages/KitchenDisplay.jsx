// Kitchen display. Read from two metres away, operated with flour on your
// hands: big type, big targets, one colour per state, and a sound when
// something new lands.
import { useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Clock, ChefHat, Check, X, AlertTriangle, Volume2, VolumeX, Loader2 } from "lucide-react";

const POLL_MS = 4000;

const COLUMNS = [
  { key: "placed", title: "New", hint: "Accept to start", cls: "border-amber-400 bg-amber-50" },
  { key: "needs_guest", title: "Waiting on guest", hint: "Guest is deciding", cls: "border-rose-400 bg-rose-50" },
  { key: "cooking", title: "Cooking", hint: "On the pass soon", cls: "border-blue-400 bg-blue-50" },
  { key: "ready", title: "Ready", hint: "Call a waiter", cls: "border-emerald-400 bg-emerald-50" },
];

function minutesSince(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ac = new Ctx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.18, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.45);
    osc.start();
    osc.stop(ac.currentTime + 0.45);
  } catch {
    /* a kitchen tablet with no audio is fine — the card still turns amber */
  }
}

export default function KitchenDisplay() {
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState("");
  const [sound, setSound] = useState(true);
  const [strike, setStrike] = useState(null); // order being edited for 86'd dishes
  const [tick, setTick] = useState(0);
  const seqRef = useRef(0);
  const soundRef = useRef(true);
  soundRef.current = sound;

  const load = async () => {
    const { data } = await api.get("/dining/kitchen");
    setOrders(data.orders);
    seqRef.current = data.seq;
  };

  useEffect(() => { load(); }, []);

  // Poll for new rounds; ring once per batch, not once per order.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const { data } = await api.get("/dining/live", { params: { since: seqRef.current } });
        seqRef.current = data.seq;
        const fresh = (data.events || []).filter((e) => e.kind === "order.placed");
        if (data.events?.length) await load();
        if (fresh.length && soundRef.current) beep();
        for (const e of fresh) {
          toast.info(`New order · Table ${e.payload?.table_name || ""}`);
        }
      } catch {
        /* ignore a dropped poll */
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Re-render once a minute so the "waiting" clocks stay honest.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const act = async (order, action, payload = {}) => {
    setBusy(order.id);
    try {
      await api.post(`/dining/orders/${order.id}/${action}`, payload);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "That did not go through");
    } finally {
      setBusy("");
      setStrike(null);
    }
  };

  const grouped = useMemo(() => {
    const g = { placed: [], needs_guest: [], cooking: [], ready: [] };
    for (const o of orders) {
      if (o.status === "placed") g.placed.push(o);
      else if (o.status === "needs_guest") g.needs_guest.push(o);
      else if (o.status === "accepted" || o.status === "preparing") g.cooking.push(o);
      else if (o.status === "ready") g.ready.push(o);
    }
    return g;
  }, [orders, tick]);

  const card = (o) => {
    const mins = minutesSince(o.placed_at);
    const late = mins >= 15;
    const live = o.items.filter((i) => i.status !== "cancelled");
    return (
      <div
        key={o.id}
        className={`rounded-xl border-2 bg-white p-3 ${
          late && o.status !== "ready" ? "border-rose-500" : "border-slate-200"
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xl font-extrabold text-slate-900">{o.table_name}</span>
          <span
            className={`text-xs font-bold px-2 py-1 rounded-full inline-flex items-center gap-1 ${
              late ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            <Clock className="h-3 w-3" />
            {mins}m
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mb-1.5">
          Round {o.round}
          {o.placed_by === "staff" ? " · taken by a waiter" : ""}
        </p>

        <ul className="space-y-1.5 mb-2">
          {o.items.map((i) => (
            <li
              key={i.id}
              className={`flex items-start gap-2 ${
                i.status === "cancelled" ? "text-slate-300 line-through" : ""
              }`}
            >
              {strike?.id === o.id && i.status !== "cancelled" && (
                <input
                  type="checkbox"
                  className="mt-1.5 h-4 w-4"
                  checked={strike.ids.includes(i.id)}
                  onChange={(e) =>
                    setStrike((s) => ({
                      ...s,
                      ids: e.target.checked ? [...s.ids, i.id] : s.ids.filter((x) => x !== i.id),
                    }))
                  }
                />
              )}
              <span className="text-lg font-bold text-slate-900 w-7 shrink-0">{i.qty}×</span>
              <span className="min-w-0">
                <span className="font-semibold text-slate-800 leading-tight">{i.name}</span>
                {i.note && (
                  <span className="block text-xs font-medium text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 mt-0.5">
                    {i.note}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>

        {o.note && (
          <p className="text-xs bg-amber-50 text-amber-800 rounded px-2 py-1.5 mb-2">
            Table note: {o.note}
          </p>
        )}
        {o.status === "needs_guest" && (
          <p className="text-xs text-rose-700 mb-2">
            Waiting for the guest to confirm{o.kitchen_note ? ` — “${o.kitchen_note}”` : ""}
          </p>
        )}

        {strike?.id === o.id ? (
          <div className="space-y-2">
            <input
              value={strike.note}
              onChange={(e) => setStrike((s) => ({ ...s, note: e.target.value }))}
              placeholder="Tell the guest why (optional)"
              className="w-full border rounded-lg px-2.5 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setStrike(null)}
                className="flex-1 border rounded-lg py-2.5 text-sm font-semibold text-slate-600"
              >
                Back
              </button>
              <button
                disabled={!strike.ids.length}
                onClick={() =>
                  act(o, "unavailable", { unavailable_item_ids: strike.ids, note: strike.note })
                }
                className="flex-1 bg-rose-600 text-white rounded-lg py-2.5 text-sm font-bold disabled:opacity-50"
              >
                Tell the guest
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            {o.status === "placed" && (
              <>
                <button
                  onClick={() => setStrike({ id: o.id, ids: [], note: "" })}
                  className="px-3 border-2 border-slate-200 rounded-lg py-3 text-sm font-semibold text-slate-600"
                  title="A dish is finished"
                >
                  <AlertTriangle className="h-4 w-4" />
                </button>
                <button
                  disabled={busy === o.id}
                  onClick={() => act(o, "accept")}
                  className="flex-1 bg-slate-900 text-white rounded-lg py-3 font-bold inline-flex items-center justify-center gap-2"
                >
                  {busy === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Accept
                </button>
              </>
            )}
            {(o.status === "accepted" || o.status === "preparing") && (
              <>
                {o.status === "accepted" && (
                  <button
                    disabled={busy === o.id}
                    onClick={() => act(o, "preparing")}
                    className="flex-1 border-2 border-blue-500 text-blue-700 rounded-lg py-3 font-bold"
                  >
                    Start cooking
                  </button>
                )}
                <button
                  disabled={busy === o.id}
                  onClick={() => act(o, "ready")}
                  className="flex-1 bg-emerald-600 text-white rounded-lg py-3 font-bold"
                >
                  Ready
                </button>
              </>
            )}
            {o.status === "ready" && (
              <button
                disabled={busy === o.id}
                onClick={() => act(o, "served")}
                className="flex-1 bg-slate-900 text-white rounded-lg py-3 font-bold"
              >
                Served
              </button>
            )}
            {o.status === "needs_guest" && (
              <button
                disabled={busy === o.id}
                onClick={() => act(o, "cancel", { note: "Cancelled in the kitchen" })}
                className="flex-1 border-2 border-slate-200 text-slate-600 rounded-lg py-3 font-semibold"
              >
                Drop this round
              </button>
            )}
          </div>
        )}
        {live.length === 0 && (
          <p className="text-xs text-slate-400 mt-2">Every dish in this round was struck off.</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ChefHat className="h-6 w-6" /> Kitchen
          </h1>
          <p className="text-sm text-muted-foreground">
            Orders arrive here the moment a guest sends them.
          </p>
        </div>
        <button
          onClick={() => setSound((s) => !s)}
          className="inline-flex items-center gap-2 text-sm border rounded-lg px-3 py-2"
          title={sound ? "Sound is on" : "Sound is off"}
        >
          {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
          {sound ? "Sound on" : "Sound off"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMNS.map((col) => (
          <section key={col.key} className={`rounded-xl border-t-4 ${col.cls} p-3`}>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-bold text-slate-900">{col.title}</h2>
              <span className="text-sm font-bold text-slate-500">{grouped[col.key].length}</span>
            </div>
            <div className="space-y-3">
              {grouped[col.key].length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">{col.hint}</p>
              ) : (
                grouped[col.key].map(card)
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
