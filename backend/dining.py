"""QR dining — the live loop between the guest's phone, the kitchen and the owner.

The flow, and the status each step leaves behind:

    guest scans the QR on the table      -> session opens
    guest browses and places an order    -> order "placed"      (kitchen is pinged)
    kitchen accepts                      -> order "accepted"
      ...or marks something unavailable  -> order "needs_guest" (guest is asked)
      ...guest confirms or drops it      -> order "accepted" / "cancelled"
    kitchen cooks                        -> "preparing" -> "ready" -> "served"
    guest asks for the bill              -> session "bill_requested"
    cashier settles it (cash/UPI/card)   -> GST invoice, session "settled"

All three screens stay in step by polling `/live?since=<seq>`: every change
appends an event with a per-outlet sequence number, so a screen only ever asks
"what happened since I last looked". That keeps the whole thing working on
ordinary HTTP — no sockets to keep alive on mobile data in a basement kitchen.
"""
import secrets
import uuid
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

ORDER_FLOW = ["placed", "accepted", "preparing", "ready", "served"]
OPEN_ORDER_STATES = ["placed", "needs_guest", "accepted", "preparing", "ready"]
LIVE_ORDER_STATES = OPEN_ORDER_STATES + ["served"]

SESSION_OPEN = "open"
SESSION_BILL_REQUESTED = "bill_requested"
SESSION_SETTLED = "settled"
SESSION_CANCELLED = "cancelled"

# A plated dish is a service, not stock: SAC 996331 covers restaurant supply.
RESTAURANT_SAC = "996331"
DEFAULT_GST_RATE = 5.0          # AC/non-AC restaurant supply, no input credit


def new_token() -> str:
    """Short, unguessable, readable on a printed QR."""
    return secrets.token_urlsafe(9).replace("_", "").replace("-", "")[:12]


def now_iso():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────────────────────────────────────
# Live event log — one sequence per outlet, so clients can ask "since N".
# ─────────────────────────────────────────────────────────────────────────────
async def next_seq(db, org_id: str) -> int:
    row = await db.counters.find_one_and_update(
        {"key": f"dining_seq:{org_id}"}, {"$inc": {"seq": 1}},
        upsert=True, return_document=True)
    return (row or {}).get("seq") or 1


async def emit(db, org_id: str, kind: str, *, table_id: str = "", session_id: str = "",
               order_id: str = "", payload: Optional[dict] = None) -> dict:
    """Record something the other screens need to know about."""
    seq = await next_seq(db, org_id)
    ev = {
        "id": str(uuid.uuid4()), "org_id": org_id, "seq": seq, "kind": kind,
        "table_id": table_id, "session_id": session_id, "order_id": order_id,
        "payload": payload or {}, "created_at": now_iso(),
    }
    await db.dining_events.insert_one(dict(ev))
    ev.pop("_id", None)
    return ev


async def events_since(db, org_id: str, since: int, limit: int = 100) -> List[dict]:
    return await db.dining_events.find(
        {"org_id": org_id, "seq": {"$gt": int(since or 0)}}, {"_id": 0}
    ).sort("seq", 1).to_list(limit)


async def current_seq(db, org_id: str) -> int:
    row = await db.counters.find_one({"key": f"dining_seq:{org_id}"}, {"_id": 0, "seq": 1})
    return (row or {}).get("seq") or 0


# ─────────────────────────────────────────────────────────────────────────────
# Money. Menu prices are what the guest sees, so GST is inclusive and we work
# backwards for the tax lines — the printed bill has to match the menu board.
# ─────────────────────────────────────────────────────────────────────────────
def line_total(item: dict) -> float:
    return round(float(item.get("rate", 0)) * float(item.get("qty", 0)), 2)


def session_totals(orders: List[dict], *, gst_rate: float = DEFAULT_GST_RATE,
                   service_charge_pct: float = 0.0, discount: float = 0.0,
                   prices_include_gst: bool = True) -> Dict[str, Any]:
    gross = 0.0
    for o in orders:
        if o.get("status") == "cancelled":
            continue
        for it in o.get("items", []):
            if it.get("status") == "cancelled":
                continue
            gross += line_total(it)
    gross = round(gross, 2)
    discount = round(min(discount, gross), 2)
    after_discount = round(gross - discount, 2)
    service = round(after_discount * service_charge_pct / 100, 2)
    base = round(after_discount + service, 2)

    if prices_include_gst:
        taxable = round(base * 100 / (100 + gst_rate), 2)
        gst = round(base - taxable, 2)
        grand = base
    else:
        taxable = base
        gst = round(base * gst_rate / 100, 2)
        grand = round(base + gst, 2)

    return {
        "items_total": gross,
        "discount": discount,
        "service_charge": service,
        "taxable": taxable,
        "gst_rate": gst_rate,
        "cgst": round(gst / 2, 2),
        "sgst": round(gst - round(gst / 2, 2), 2),
        "gst": gst,
        "grand_total": grand,
        "prices_include_gst": prices_include_gst,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Sessions
# ─────────────────────────────────────────────────────────────────────────────
def blank_session(org_id: str, table: dict, *, guests: int = 0,
                  opened_by: str = "guest") -> dict:
    return {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "table_id": table["id"],
        "table_name": table.get("name", ""),
        "status": SESSION_OPEN,
        "guests": guests,
        "guest_name": "",
        "guest_phone": "",
        "opened_by": opened_by,
        "opened_at": now_iso(),
        "bill_requested_at": None,
        "settled_at": None,
        "invoice_id": None,
        "invoice_no": None,
        "payment_mode": None,
        "discount": 0.0,
        "service_charge_pct": 0.0,
        "waiter_calls": 0,
        "created_at": now_iso(),
    }


async def open_session(db, org_id: str, table: dict, *, guests: int = 0,
                       opened_by: str = "guest") -> dict:
    """Find the table's live session, or start one. Scanning twice is harmless."""
    existing = await db.dining_sessions.find_one(
        {"org_id": org_id, "table_id": table["id"],
         "status": {"$in": [SESSION_OPEN, SESSION_BILL_REQUESTED]}}, {"_id": 0})
    if existing:
        return existing
    sess = blank_session(org_id, table, guests=guests, opened_by=opened_by)
    await db.dining_sessions.insert_one(dict(sess))
    await db.dining_tables.update_one({"id": table["id"], "org_id": org_id},
                                      {"$set": {"status": "seated"}})
    await emit(db, org_id, "session.opened", table_id=table["id"], session_id=sess["id"],
               payload={"table_name": table.get("name"), "opened_by": opened_by})
    return sess


async def session_orders(db, org_id: str, session_id: str) -> List[dict]:
    return await db.dining_orders.find(
        {"org_id": org_id, "session_id": session_id}, {"_id": 0}
    ).sort("round", 1).to_list(200)


async def session_view(db, org_id: str, session: dict) -> dict:
    """A session with its orders and live totals — what every screen renders."""
    orders = await session_orders(db, org_id, session["id"])
    totals = session_totals(
        orders,
        gst_rate=session.get("gst_rate", DEFAULT_GST_RATE),
        service_charge_pct=session.get("service_charge_pct", 0.0),
        discount=session.get("discount", 0.0))
    return {**session, "orders": orders, "totals": totals,
            "order_count": len([o for o in orders if o.get("status") != "cancelled"]),
            "has_open_orders": any(o["status"] in OPEN_ORDER_STATES for o in orders)}


# ─────────────────────────────────────────────────────────────────────────────
# Orders
# ─────────────────────────────────────────────────────────────────────────────
def build_order(org_id: str, session: dict, items: List[dict], *, round_no: int,
                note: str = "", placed_by: str = "guest") -> dict:
    clean = []
    for it in items:
        qty = float(it.get("qty") or 0)
        if qty <= 0:
            continue
        clean.append({
            "id": str(uuid.uuid4()),
            "product_id": it.get("product_id", ""),
            "name": (it.get("name") or "").strip(),
            "qty": qty,
            "rate": round(float(it.get("rate") or 0), 2),
            "note": (it.get("note") or "").strip()[:140],
            "status": "ok",
        })
    if not clean:
        raise HTTPException(400, "Add at least one dish before sending the order")
    return {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "session_id": session["id"],
        "table_id": session["table_id"],
        "table_name": session.get("table_name", ""),
        "round": round_no,
        "items": clean,
        "status": "placed",
        "note": note.strip()[:200],
        "kitchen_note": "",
        "placed_by": placed_by,
        "placed_at": now_iso(),
        "accepted_at": None,
        "ready_at": None,
        "served_at": None,
        "created_at": now_iso(),
    }


def order_total(order: dict) -> float:
    return round(sum(line_total(i) for i in order.get("items", [])
                     if i.get("status") != "cancelled"), 2)


ALLOWED_TRANSITIONS = {
    "placed":      {"accepted", "needs_guest", "rejected", "cancelled"},
    "needs_guest": {"accepted", "cancelled"},
    "accepted":    {"preparing", "ready", "cancelled"},
    "preparing":   {"ready", "cancelled"},
    "ready":       {"served"},
    "served":      set(),
    "rejected":    set(),
    "cancelled":   set(),
}


def check_transition(current: str, nxt: str):
    if nxt not in ALLOWED_TRANSITIONS.get(current, set()):
        raise HTTPException(
            409, f"An order that is already {current.replace('_', ' ')} "
                 f"cannot move to {nxt.replace('_', ' ')}.")


# ─────────────────────────────────────────────────────────────────────────────
# Floor view
# ─────────────────────────────────────────────────────────────────────────────
def table_state(session: Optional[dict], orders: List[dict]) -> str:
    """What the owner sees at a glance on the floor plan."""
    if not session:
        return "free"
    if session["status"] == SESSION_BILL_REQUESTED:
        return "bill"
    if any(o["status"] == "placed" for o in orders):
        return "new_order"
    if any(o["status"] == "needs_guest" for o in orders):
        return "needs_guest"
    if any(o["status"] == "ready" for o in orders):
        return "ready"
    if any(o["status"] in ("accepted", "preparing") for o in orders):
        return "cooking"
    return "seated"


STATE_LABELS = {
    "free": "Free",
    "seated": "Seated",
    "new_order": "New order",
    "needs_guest": "Waiting on guest",
    "cooking": "In the kitchen",
    "ready": "Ready to serve",
    "bill": "Bill requested",
}


# ─────────────────────────────────────────────────────────────────────────────
# Delays — the floor manager's whole job is spotting these before the guest does.
# ─────────────────────────────────────────────────────────────────────────────
WARN_MINUTES = 12          # amber: worth a glance
LATE_MINUTES = 20          # red: go and say something


def minutes_waiting(order: dict, now=None) -> int:
    """How long the guest has been waiting on this round, in minutes.

    The clock starts when they sent it and stops when it reaches the table —
    not when the kitchen accepted it, because the guest does not care about that.
    """
    from datetime import datetime, timezone
    started = order.get("placed_at")
    if not started:
        return 0
    ended = order.get("served_at") if order.get("status") == "served" else None
    try:
        t0 = datetime.fromisoformat(started)
        t1 = datetime.fromisoformat(ended) if ended else (now or datetime.now(timezone.utc))
    except (TypeError, ValueError):
        return 0
    if t0.tzinfo is None:
        t0 = t0.replace(tzinfo=timezone.utc)
    if t1.tzinfo is None:
        t1 = t1.replace(tzinfo=timezone.utc)
    return max(0, int((t1 - t0).total_seconds() // 60))


def delay_level(order: dict, now=None) -> str:
    """"ok" | "warn" | "late" — a round already served is never late."""
    if order.get("status") in ("served", "cancelled", "rejected"):
        return "ok"
    if order.get("status") == "needs_guest":
        return "ok"              # the clock is on the guest, not the kitchen
    mins = minutes_waiting(order, now)
    if mins >= LATE_MINUTES:
        return "late"
    if mins >= WARN_MINUTES:
        return "warn"
    return "ok"


def delay_summary(orders: List[dict], now=None) -> Dict[str, Any]:
    live = [o for o in orders if o.get("status") in OPEN_ORDER_STATES]
    levels = [(o, delay_level(o, now)) for o in live]
    late = [o for o, lv in levels if lv == "late"]
    warn = [o for o, lv in levels if lv == "warn"]
    waits = [minutes_waiting(o, now) for o in live]
    return {
        "late": len(late),
        "warning": len(warn),
        "longest_wait": max(waits) if waits else 0,
        "late_tables": sorted({o.get("table_name", "") for o in late}),
        "warn_minutes": WARN_MINUTES,
        "late_minutes": LATE_MINUTES,
    }
