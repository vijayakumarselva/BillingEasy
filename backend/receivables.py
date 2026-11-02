"""Who owes what, how late they are, and who should not be sold to on credit.

`credit_limit` has existed on a party record for a long time. Nothing has ever
read it: a customer sitting on twice their limit could be invoiced again
without a word. That is the gap this closes, along with the ageing an owner
needs to chase money — the single most useful thing an accounting package does
for a small Indian business.

Pure functions, so the buckets can be tested against known dates rather than
whatever today happens to be.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional

# The buckets Indian businesses actually use, matching Tally's ageing report.
BUCKETS = [
    ("current", "Not yet due", None, 0),
    ("d0_30",   "1–30 days",     0, 30),
    ("d31_60",  "31–60 days",   30, 60),
    ("d61_90",  "61–90 days",   60, 90),
    ("d90_plus", "Over 90 days", 90, None),
]
BUCKET_KEYS = [b[0] for b in BUCKETS]


def _as_date(value: Any) -> Optional[date]:
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def days_overdue(due_date: Any, today: Optional[date] = None) -> int:
    """Negative while a bill is still within its terms."""
    d = _as_date(due_date)
    if not d:
        return 0
    return ((today or date.today()) - d).days


def bucket_for(overdue: int) -> str:
    if overdue <= 0:
        return "current"
    for key, _label, lo, hi in BUCKETS[1:]:
        if (lo is None or overdue > lo) and (hi is None or overdue <= hi):
            return key
    return "d90_plus"


def age_documents(docs: Iterable[dict], *, today: Optional[date] = None,
                  date_field: str = "due_date",
                  fallback_field: str = "invoice_date",
                  credit_days: Optional[Dict[str, int]] = None) -> Dict[str, Any]:
    """Bucket outstanding documents by how overdue they are.

    Each doc needs `party_id`, an amount in `outstanding`, and a due date. A
    bill with no due date falls back to its document date plus that party's
    credit period, because an undated bill is not automatically current — it
    is simply one nobody set terms on.
    """
    today = today or date.today()
    credit_days = credit_days or {}
    by_party: Dict[str, Dict[str, Any]] = {}
    totals = {k: 0.0 for k in BUCKET_KEYS}
    total_outstanding = 0.0

    for d in docs:
        amount = round(float(d.get("outstanding") or 0), 2)
        if amount <= 0.5:          # settled, or rounding dust
            continue
        due = _as_date(d.get(date_field))
        if not due:
            base = _as_date(d.get(fallback_field))
            if base:
                due = base + timedelta(days=credit_days.get(d.get("party_id", ""), 0))
        overdue = ((today - due).days if due else 0)
        key = bucket_for(overdue)

        party = by_party.setdefault(d.get("party_id", ""), {
            "party_id": d.get("party_id", ""),
            "party_name": d.get("party_name", ""),
            "total": 0.0, "oldest_days": 0, "count": 0,
            **{k: 0.0 for k in BUCKET_KEYS},
            "documents": [],
        })
        party[key] += amount
        party["total"] = round(party["total"] + amount, 2)
        party["count"] += 1
        party["oldest_days"] = max(party["oldest_days"], overdue)
        party["documents"].append({
            "id": d.get("id", ""), "ref": d.get("ref", ""),
            "date": str(d.get(fallback_field, ""))[:10],
            "due_date": str(due) if due else "",
            "outstanding": amount, "days_overdue": overdue, "bucket": key,
        })
        totals[key] = round(totals[key] + amount, 2)
        total_outstanding = round(total_outstanding + amount, 2)

    rows = sorted(by_party.values(), key=lambda p: p["oldest_days"], reverse=True)
    for r in rows:
        for k in BUCKET_KEYS:
            r[k] = round(r[k], 2)
        r["documents"].sort(key=lambda x: x["days_overdue"], reverse=True)
    return {
        "rows": rows,
        "totals": totals,
        "total_outstanding": total_outstanding,
        "overdue_total": round(sum(totals[k] for k in BUCKET_KEYS if k != "current"), 2),
        "buckets": [{"key": k, "label": lbl} for k, lbl, _lo, _hi in BUCKETS],
        "as_at": str(today),
    }


# ──────────────────────────── credit control ────────────────────────────

def credit_status(*, outstanding: float, credit_limit: float,
                  oldest_overdue: int = 0, credit_days: int = 0,
                  new_amount: float = 0.0) -> Dict[str, Any]:
    """Whether another credit sale to this customer is wise.

    Returns a verdict rather than a boolean, because the honest answer is
    usually "allowed, but somebody should know": a hard block on a real
    customer standing at the counter is worse than a warning the owner can
    override. Only an explicit setting should stop a sale outright.
    """
    limit = float(credit_limit or 0)
    exposure = round(float(outstanding or 0) + float(new_amount or 0), 2)
    over_by = round(exposure - limit, 2) if limit else 0.0
    late = oldest_overdue > 0

    if limit and over_by > 0.5:
        level = "over_limit"
        message = (f"This sale takes {_money(exposure)} past a credit limit of "
                   f"{_money(limit)} — over by {_money(over_by)}.")
    elif late and oldest_overdue > max(credit_days, 0) + 30:
        level = "badly_overdue"
        message = (f"{_money(outstanding)} is outstanding, the oldest bill "
                   f"{oldest_overdue} days past its due date.")
    elif late:
        level = "overdue"
        message = (f"{_money(outstanding)} outstanding, oldest bill "
                   f"{oldest_overdue} days overdue.")
    elif limit and exposure > limit * 0.9:
        level = "near_limit"
        message = (f"This sale brings them to {_money(exposure)} of a "
                   f"{_money(limit)} limit.")
    else:
        level = "ok"
        message = ""

    return {
        "level": level,
        "ok": level in ("ok", "near_limit"),
        "message": message,
        "outstanding": round(float(outstanding or 0), 2),
        "credit_limit": limit,
        "exposure": exposure,
        "over_by": max(0.0, over_by),
        "oldest_overdue": oldest_overdue,
    }


def _money(n: float) -> str:
    return "₹" + f"{float(n or 0):,.2f}"


def statement(party: dict, documents: List[dict], payments: List[dict],
              *, opening: float = 0.0) -> Dict[str, Any]:
    """A customer's account, oldest first, with a running balance.

    This is what gets emailed when somebody asks "what do I actually owe?".
    """
    rows: List[Dict[str, Any]] = []
    for d in documents:
        rows.append({"date": str(d.get("invoice_date") or d.get("purchase_date") or "")[:10],
                     "type": d.get("doc_type", "Invoice"),
                     "ref": d.get("ref", ""),
                     "debit": round(float(d.get("amount") or 0), 2), "credit": 0.0})
    for p in payments:
        rows.append({"date": str(p.get("payment_date", ""))[:10],
                     "type": "Receipt" if p.get("direction") == "received" else "Payment",
                     "ref": p.get("ref_no", ""),
                     "debit": 0.0, "credit": round(float(p.get("amount") or 0), 2)})
    rows.sort(key=lambda r: (r["date"], r["type"]))

    running = round(float(opening or 0), 2)
    for r in rows:
        running = round(running + r["debit"] - r["credit"], 2)
        r["balance"] = running
    return {
        "party": {"id": party.get("id", ""), "name": party.get("name", ""),
                  "gstin": party.get("gstin", ""), "phone": party.get("phone", ""),
                  "email": party.get("email", ""),
                  "credit_limit": party.get("credit_limit", 0),
                  "credit_days": party.get("credit_days", 0)},
        "opening": round(float(opening or 0), 2),
        "rows": rows,
        "closing": running,
    }
