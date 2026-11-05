"""Personal finance — a person's own money, kept apart from the business.

The separation is the whole point. Business records are scoped by `org_id`
and belong to a company; everything here is scoped by `user_id` and belongs
to one person. Nothing in this module reads or writes an invoice, a bill, a
payment or a ledger entry, and nothing in the business modules reads these
collections. An owner can see both, side by side, without the two ever being
summed into one set of books.

Three traps this module is built to avoid, because each one quietly makes
every figure wrong:

1. **A transfer is not income, and not an expense.** Moving ₹10,000 from
   savings to a wallet is one event that leaves net worth unchanged. Counted
   naively it inflates both sides of the month.
2. **A credit-card bill is not an expense.** The expense happened when the
   card was swiped. Paying the bill moves money from a bank account to the
   card account — counting both double-counts every rupee spent on the card.
3. **An EMI is partly repayment, not all cost.** Only the interest is an
   expense; the principal reduces what is owed. Treating the whole EMI as an
   expense overstates spending and never pays the loan off.

Money is paise as integers throughout, as in `ledger.py`.
"""
from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

# ───────────────────────────── money ─────────────────────────────

def to_paise(rupees: Any) -> int:
    if rupees is None or rupees == "":
        return 0
    return int(round(float(rupees) * 100))


def to_rupees(paise: Any) -> float:
    return round((int(paise or 0)) / 100, 2)


# ──────────────────────── accounts & categories ────────────────────────

ACCOUNT_TYPES = ["savings", "cash", "current", "credit_card", "wallet", "other"]

# A credit card is a liability: a positive balance means money owed, and
# spending on it increases that balance rather than reducing an asset.
LIABILITY_ACCOUNTS = {"credit_card"}

INCOME_CATEGORIES = [
    "Salary", "Business Income", "Rental Income", "Commission",
    "Freelancing", "Interest", "Investment Returns", "Other Income",
]

EXPENSE_CATEGORIES = [
    "Home Rent", "Electricity & Water", "Groceries", "Food & Dining",
    "Shopping", "Fuel & Travel", "Medical", "Education & School Fees",
    "Insurance", "EMI & Loan Payments", "Credit Card Bills", "Entertainment",
    "Family Expenses", "Investments", "Miscellaneous",
]

TXN_KINDS = ["income", "expense", "transfer"]

LOAN_TYPES = ["home", "personal", "vehicle", "gold", "business", "other"]

GOAL_PRESETS = [
    "Emergency Fund", "Buy a Car", "Buy a House", "Child Education",
    "Holiday", "Retirement", "General Savings",
]

FREQUENCIES = ["daily", "weekly", "monthly", "quarterly", "yearly"]


class PersonalFinanceError(Exception):
    """A record that would make the figures wrong — refused, not stored."""


# ───────────────────────────── dates ─────────────────────────────

def _as_date(v: Any) -> Optional[date]:
    if isinstance(v, date):
        return v
    if isinstance(v, datetime):
        return v.date()
    if not v:
        return None
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def add_months(d: date, n: int) -> date:
    """The same day n months on, clamped to the end of a short month.

    The 31st plus one month is the 28th of February, not the 3rd of March —
    an EMI due on the 31st does not skip into the following month.
    """
    total = d.month - 1 + n
    year = d.year + total // 12
    month = total % 12 + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def next_occurrence(start: Any, frequency: str, after: Optional[date] = None) -> Optional[date]:
    """When a recurring payment next falls due, strictly after `after`."""
    d = _as_date(start)
    if not d:
        return None
    after = after or date.today()
    if frequency not in FREQUENCIES:
        raise PersonalFinanceError(f"{frequency} is not a recurrence we support")
    guard = 0
    while d <= after and guard < 2000:
        guard += 1
        if frequency == "daily":
            d = d + timedelta(days=1)
        elif frequency == "weekly":
            d = d + timedelta(days=7)
        elif frequency == "monthly":
            d = add_months(d, 1)
        elif frequency == "quarterly":
            d = add_months(d, 3)
        else:
            d = add_months(d, 12)
    return d


def month_bounds(month: str) -> Tuple[str, str]:
    """('2026-11') → ('2026-11-01', '2026-11-30')."""
    y, m = int(month[:4]), int(month[5:7])
    return f"{y:04d}-{m:02d}-01", f"{y:04d}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}"


# ───────────────────────────── EMI maths ─────────────────────────────

def emi_amount(principal_p: int, annual_rate: float, months: int) -> int:
    """The standard reducing-balance EMI, in paise.

        EMI = P·r·(1+r)^n / ((1+r)^n − 1),  r = annual rate / 12 / 100

    A zero-interest loan is simply the principal split evenly, which the
    formula above cannot express (it divides by zero).
    """
    principal_p = int(principal_p or 0)
    months = int(months or 0)
    if principal_p <= 0 or months <= 0:
        return 0
    r = float(annual_rate or 0) / 12 / 100
    if r <= 0:
        return int(round(principal_p / months))
    factor = (1 + r) ** months
    return int(round(principal_p * r * factor / (factor - 1)))


def amortisation(principal_p: int, annual_rate: float, months: int,
                 first_due: Any, emi_p: Optional[int] = None) -> List[Dict[str, Any]]:
    """Instalment by instalment: what is interest, what repays the loan.

    The last instalment absorbs the rounding, so the closing balance is
    exactly zero rather than a few paise adrift.
    """
    start = _as_date(first_due)
    if not start or months <= 0 or principal_p <= 0:
        return []
    emi_p = emi_p or emi_amount(principal_p, annual_rate, months)
    r = float(annual_rate or 0) / 12 / 100
    balance = int(principal_p)
    rows: List[Dict[str, Any]] = []
    for i in range(months):
        interest = int(round(balance * r))
        principal_part = emi_p - interest
        if i == months - 1 or principal_part >= balance:
            principal_part = balance
            emi_this = principal_part + interest
        else:
            emi_this = emi_p
        balance -= principal_part
        rows.append({
            "no": i + 1,
            "due_date": str(add_months(start, i)),
            "emi": to_rupees(emi_this),
            "interest": to_rupees(interest),
            "principal": to_rupees(principal_part),
            "balance": to_rupees(max(balance, 0)),
        })
        if balance <= 0:
            break
    return rows


def loan_position(loan: dict, today: Optional[date] = None) -> Dict[str, Any]:
    """Where a loan stands: paid, outstanding, next due, interest so far."""
    today = today or date.today()
    principal_p = to_paise(loan.get("principal"))
    months = int(loan.get("tenure_months") or 0)
    rate = float(loan.get("interest_rate") or 0)
    emi_p = to_paise(loan.get("emi")) or emi_amount(principal_p, rate, months)
    schedule = amortisation(principal_p, rate, months, loan.get("first_due_date"), emi_p)

    paid_count = int(loan.get("installments_paid") or 0)
    paid_count = max(0, min(paid_count, len(schedule)))
    paid = schedule[:paid_count]
    remaining = schedule[paid_count:]

    outstanding_p = to_paise(paid[-1]["balance"]) if paid else principal_p
    if loan.get("closed"):
        outstanding_p = 0
        remaining = []

    overdue = [r for r in remaining if _as_date(r["due_date"]) and _as_date(r["due_date"]) < today]
    return {
        "id": loan.get("id", ""),
        "name": loan.get("name", ""),
        "loan_type": loan.get("loan_type", "other"),
        "lender": loan.get("lender", ""),
        "principal": to_rupees(principal_p),
        "interest_rate": rate,
        "tenure_months": months,
        "emi": to_rupees(emi_p),
        "installments_paid": paid_count,
        "installments_left": len(remaining),
        "outstanding": to_rupees(outstanding_p),
        "principal_repaid": to_rupees(principal_p - outstanding_p),
        "interest_paid": to_rupees(sum(to_paise(r["interest"]) for r in paid)),
        "interest_remaining": to_rupees(sum(to_paise(r["interest"]) for r in remaining)),
        "next_due": remaining[0]["due_date"] if remaining else None,
        "next_emi": remaining[0]["emi"] if remaining else 0,
        "overdue_count": len(overdue),
        "closed": bool(loan.get("closed")) or not remaining,
        "schedule": schedule,
    }


# ──────────────────── transactions, balances, summaries ────────────────────

def validate_txn(txn: dict) -> None:
    kind = txn.get("kind")
    if kind not in TXN_KINDS:
        raise PersonalFinanceError(f"A transaction is income, expense or transfer — not {kind!r}")
    if to_paise(txn.get("amount")) <= 0:
        raise PersonalFinanceError("An amount is required")
    if not _as_date(txn.get("date")):
        raise PersonalFinanceError("A valid date is required")
    if kind == "transfer":
        if not txn.get("account_id") or not txn.get("to_account_id"):
            raise PersonalFinanceError("A transfer needs an account on both sides")
        if txn["account_id"] == txn["to_account_id"]:
            raise PersonalFinanceError("A transfer has to go somewhere else")
    elif not txn.get("account_id"):
        raise PersonalFinanceError("An account is required")


def account_balances(accounts: List[dict], txns: Iterable[dict]) -> Dict[str, Dict[str, Any]]:
    """Current balance per account, with transfers moving money rather than
    creating or destroying it.

    For a credit card the sign is flipped: spending raises what is owed.
    """
    out: Dict[str, Dict[str, Any]] = {}
    for a in accounts:
        out[a["id"]] = {
            "id": a["id"], "name": a.get("name", ""),
            "account_type": a.get("account_type", "other"),
            "is_liability": a.get("account_type") in LIABILITY_ACCOUNTS,
            "opening": to_rupees(to_paise(a.get("opening_balance"))),
            "_p": to_paise(a.get("opening_balance")),
            "in": 0, "out": 0,
        }
    for t in txns:
        amt = to_paise(t.get("amount"))
        kind = t.get("kind")
        src = out.get(t.get("account_id"))
        if kind == "income":
            if src:
                src["_p"] += amt
                src["in"] += amt
        elif kind == "expense":
            if src:
                # On a card, spending increases the debt rather than draining cash.
                src["_p"] += amt if src["is_liability"] else -amt
                src["out"] += amt
        elif kind == "transfer":
            dst = out.get(t.get("to_account_id"))
            if src:
                src["_p"] -= amt
                src["out"] += amt
            if dst:
                # Paying a card bill reduces the debt; topping up a wallet adds to it.
                dst["_p"] -= amt if dst["is_liability"] else -amt
                dst["in"] += amt
    for a in out.values():
        a["balance"] = to_rupees(a.pop("_p"))
        a["in"] = to_rupees(a["in"])
        a["out"] = to_rupees(a["out"])
    return out


def summarise(txns: Iterable[dict], *, since: str = "", upto: str = "") -> Dict[str, Any]:
    """Income, expenses and what is left, for a period.

    Transfers are deliberately absent from both totals: moving your own money
    is not earning it and not spending it.
    """
    income_p = expense_p = transfer_p = 0
    by_category: Dict[str, int] = {}
    by_income_category: Dict[str, int] = {}
    for t in txns:
        d = str(t.get("date", ""))[:10]
        if since and d < since:
            continue
        if upto and d > upto:
            continue
        amt = to_paise(t.get("amount"))
        cat = t.get("category") or "Uncategorised"
        if t.get("kind") == "income":
            income_p += amt
            by_income_category[cat] = by_income_category.get(cat, 0) + amt
        elif t.get("kind") == "expense":
            expense_p += amt
            by_category[cat] = by_category.get(cat, 0) + amt
        elif t.get("kind") == "transfer":
            transfer_p += amt

    cats = sorted(({"category": c, "amount": to_rupees(v),
                    "share": round(v * 100 / expense_p, 1) if expense_p else 0}
                   for c, v in by_category.items()),
                  key=lambda x: x["amount"], reverse=True)
    return {
        "income": to_rupees(income_p),
        "expenses": to_rupees(expense_p),
        "savings": to_rupees(income_p - expense_p),
        "savings_rate": round((income_p - expense_p) * 100 / income_p, 1) if income_p else 0,
        "transfers": to_rupees(transfer_p),
        "by_category": cats,
        "by_income_category": sorted(
            ({"category": c, "amount": to_rupees(v)} for c, v in by_income_category.items()),
            key=lambda x: x["amount"], reverse=True),
        "from": since, "to": upto,
    }


def monthly_series(txns: Iterable[dict], months: int = 6,
                   today: Optional[date] = None) -> List[Dict[str, Any]]:
    """Income against expenses, month by month, oldest first."""
    today = today or date.today()
    buckets: Dict[str, Dict[str, int]] = {}
    for i in range(months - 1, -1, -1):
        ref = add_months(today.replace(day=1), -i)
        buckets[ref.strftime("%Y-%m")] = {"income": 0, "expenses": 0}
    for t in txns:
        key = str(t.get("date", ""))[:7]
        if key not in buckets:
            continue
        amt = to_paise(t.get("amount"))
        if t.get("kind") == "income":
            buckets[key]["income"] += amt
        elif t.get("kind") == "expense":
            buckets[key]["expenses"] += amt
    out = []
    for key, v in buckets.items():
        y, m = int(key[:4]), int(key[5:7])
        out.append({
            "month": key,
            "label": date(y, m, 1).strftime("%b %y"),
            "income": to_rupees(v["income"]),
            "expenses": to_rupees(v["expenses"]),
            "savings": to_rupees(v["income"] - v["expenses"]),
        })
    return out


# ──────────────────────── budgets and goals ────────────────────────

def budget_status(budgets: List[dict], txns: Iterable[dict], month: str) -> List[Dict[str, Any]]:
    """How much of each budget is used, and what is overspent."""
    since, upto = month_bounds(month)
    spent: Dict[str, int] = {}
    for t in txns:
        d = str(t.get("date", ""))[:10]
        if t.get("kind") != "expense" or d < since or d > upto:
            continue
        cat = t.get("category") or "Uncategorised"
        spent[cat] = spent.get(cat, 0) + to_paise(t.get("amount"))

    rows = []
    for b in budgets:
        cat = b.get("category", "")
        limit_p = to_paise(b.get("amount"))
        used_p = spent.get(cat, 0)
        pct = round(used_p * 100 / limit_p, 1) if limit_p else 0
        rows.append({
            "id": b.get("id", ""), "category": cat,
            "budget": to_rupees(limit_p), "spent": to_rupees(used_p),
            "remaining": to_rupees(max(0, limit_p - used_p)),
            "over_by": to_rupees(max(0, used_p - limit_p)),
            "used_pct": pct,
            "state": "over" if used_p > limit_p else "warning" if pct >= 80 else "ok",
        })
    rows.sort(key=lambda r: r["used_pct"], reverse=True)
    return rows


def goal_progress(goal: dict, today: Optional[date] = None) -> Dict[str, Any]:
    """Where a savings goal stands, and whether it will arrive on time."""
    today = today or date.today()
    target_p = to_paise(goal.get("target_amount"))
    saved_p = to_paise(goal.get("saved_amount"))
    monthly_p = to_paise(goal.get("monthly_contribution"))
    left_p = max(0, target_p - saved_p)
    months_needed = (left_p + monthly_p - 1) // monthly_p if monthly_p else None

    target_date = _as_date(goal.get("target_date"))
    months_available = None
    if target_date:
        months_available = max(0, (target_date.year - today.year) * 12 + target_date.month - today.month)

    on_track = None
    required_monthly_p = None
    if months_available is not None:
        required_monthly_p = (left_p + months_available - 1) // months_available if months_available else left_p
        on_track = monthly_p >= required_monthly_p if left_p else True

    return {
        "id": goal.get("id", ""), "name": goal.get("name", ""),
        "target_amount": to_rupees(target_p),
        "saved_amount": to_rupees(saved_p),
        "remaining": to_rupees(left_p),
        "progress_pct": round(saved_p * 100 / target_p, 1) if target_p else 0,
        "monthly_contribution": to_rupees(monthly_p),
        "months_needed": months_needed,
        "months_available": months_available,
        "required_monthly": to_rupees(required_monthly_p) if required_monthly_p is not None else None,
        "on_track": on_track,
        "complete": left_p == 0 and target_p > 0,
        "target_date": goal.get("target_date", ""),
    }


# ──────────────────────── what is coming up ────────────────────────

def upcoming(recurrings: List[dict], loans: List[dict], *,
             days: int = 30, today: Optional[date] = None) -> Dict[str, Any]:
    """Every commitment falling due in the window, soonest first.

    This is the figure a salaried person actually wants: not what they spent,
    but what is already spoken for before the month is out.
    """
    today = today or date.today()
    horizon = today + timedelta(days=days)
    items: List[Dict[str, Any]] = []

    for r in recurrings:
        if not r.get("active", True):
            continue
        due = next_occurrence(r.get("next_due") or r.get("start_date"),
                              r.get("frequency", "monthly"), after=today - timedelta(days=1))
        if due and due <= horizon:
            items.append({"kind": "recurring", "id": r.get("id", ""),
                          "name": r.get("name", ""), "category": r.get("category", ""),
                          "amount": to_rupees(to_paise(r.get("amount"))),
                          "due_date": str(due),
                          "days_away": (due - today).days,
                          "overdue": due < today})

    for l in loans:
        pos = loan_position(l, today)
        if pos["closed"] or not pos["next_due"]:
            continue
        due = _as_date(pos["next_due"])
        if due and due <= horizon:
            items.append({"kind": "emi", "id": pos["id"], "name": pos["name"] or "Loan EMI",
                          "category": "EMI & Loan Payments", "amount": pos["next_emi"],
                          "due_date": str(due), "days_away": (due - today).days,
                          "overdue": due < today})

    items.sort(key=lambda x: x["due_date"])
    return {
        "items": items,
        "total": round(sum(i["amount"] for i in items), 2),
        "overdue_total": round(sum(i["amount"] for i in items if i["overdue"]), 2),
        "window_days": days,
    }


def net_worth(accounts_balances: Dict[str, Dict[str, Any]],
              loans: List[dict], today: Optional[date] = None) -> Dict[str, Any]:
    """Assets less what is owed — on cards and on loans."""
    assets = liabilities = 0.0
    for a in accounts_balances.values():
        if a["is_liability"]:
            liabilities += max(0.0, a["balance"])
        else:
            assets += a["balance"]
    loan_outstanding = sum(loan_position(l, today)["outstanding"] for l in loans)
    return {
        "assets": round(assets, 2),
        "card_debt": round(liabilities, 2),
        "loan_outstanding": round(loan_outstanding, 2),
        "liabilities": round(liabilities + loan_outstanding, 2),
        "net_worth": round(assets - liabilities - loan_outstanding, 2),
    }
