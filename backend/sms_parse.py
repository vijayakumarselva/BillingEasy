"""Reading bank messages.

Nobody wants to type in forty transactions. They do, however, already have
forty bank SMS sitting on their phone. This turns a pasted block of them into
transactions, matched to the right account and — where it is an EMI — to the
right loan.

Deliberately rule-based rather than a model call. Indian bank SMS follows a
small number of shapes, the rules are testable against real examples, and a
parser that silently invents an amount is worse than one that skips a line.
Anything not understood is returned as `unparsed` for the person to see,
never guessed at.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional

# ── the words banks use ──────────────────────────────────────────────────

DEBIT_WORDS = r"(?:debited|debit|spent|withdrawn|paid|sent|deducted|purchase of|txn of)"
CREDIT_WORDS = r"(?:credited|credit|received|deposited|refund(?:ed)?)"

# ₹ 1,234.56 / Rs.1234 / INR 1,23,456.78 — the Indian grouping included.
AMOUNT = r"(?:(?:rs|inr|₹)\.?\s*)([0-9][0-9,]*(?:\.[0-9]{1,2})?)"

# A/c XX1234, a/c no. ****5678, Card x1234, ending 1234
ACCOUNT_TAIL = r"(?:a\/?c|acct|account|card)[^0-9a-z]{0,12}(?:x+|\*+)?\s*([0-9]{3,6})"

# 05-11-26, 05/11/2026, 05-Nov-26, 2026-11-05
DATE_PATTERNS = [
    (r"(\d{4})-(\d{2})-(\d{2})", "ymd"),
    (r"(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})", "dmy"),
    (r"(\d{1,2})[-\s]([a-z]{3})[-\s](\d{2,4})", "dMy"),
]
MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}

# What the money was for. Order matters: the first match wins, so the
# specific sits above the general.
CATEGORY_HINTS: List[tuple] = [
    (r"\bemi\b|loan a\/?c|loan acc|instal?ment", "EMI & Loan Payments"),
    (r"credit card (?:bill|payment)|cc bill|card bill", "Credit Card Bills"),
    (r"\brent\b", "Home Rent"),
    (r"electricity|\bbescom\b|\btneb\b|power bill|water bill|\bbwssb\b", "Electricity & Water"),
    (r"petrol|diesel|\bfuel\b|\bhpcl\b|\bbpcl\b|indian oil|\biocl\b", "Fuel & Travel"),
    (r"\buber\b|\bola\b|\birctc\b|railway|indigo|spicejet|air india|\bmetro\b", "Fuel & Travel"),
    (r"swiggy|zomato|restaurant|cafe|dominos|\bkfc\b|mcdonald", "Food & Dining"),
    (r"bigbasket|blinkit|zepto|dmart|grocer|supermarket|reliance fresh", "Groceries"),
    (r"amazon|flipkart|myntra|ajio|nykaa|meesho|shopping", "Shopping"),
    (r"pharmacy|apollo|medplus|hospital|clinic|\bmedical\b|diagnost", "Medical"),
    (r"school fee|college|tuition|\bexam fee\b|udemy|coursera", "Education & School Fees"),
    (r"insurance|\blic\b|premium|policy", "Insurance"),
    (r"netflix|prime video|hotstar|spotify|youtube premium|subscription", "Entertainment"),
    (r"mutual fund|\bsip\b|zerodha|groww|upstox|\bnps\b|\bppf\b", "Investments"),
    (r"salary|payroll|stipend", "Salary"),
    (r"interest credited|int\.?cr|savings interest", "Interest"),
]

# Lines that are not transactions, however much they look like one.
NOISE = re.compile(
    r"otp|one[- ]time password|do not share|is your verification|"
    r"will expire|minimum amount due|statement is ready|has been generated|"
    r"avl(?:bl)? (?:bal|limit)|available balance is|your balance",
    re.I)


def _to_amount(raw: str) -> float:
    return float(raw.replace(",", ""))


def _parse_date(text: str, today: Optional[date] = None) -> Optional[str]:
    today = today or date.today()
    low = text.lower()
    for pattern, kind in DATE_PATTERNS:
        m = re.search(pattern, low)
        if not m:
            continue
        try:
            if kind == "ymd":
                y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            elif kind == "dmy":
                d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            else:
                d = int(m.group(1))
                mo = MONTHS.get(m.group(2)[:3], 0)
                y = int(m.group(3))
                if not mo:
                    continue
            if y < 100:
                y += 2000
            if not (1 <= mo <= 12 and 1 <= d <= 31):
                continue
            return date(y, mo, d).isoformat()
        except ValueError:
            continue
    return None


def _merchant(text: str) -> str:
    """Who it went to, as the message names them."""
    patterns = [
        r"(?:\bto\b|\bat\b|towards|in favou?r of)\s+([A-Za-z0-9&.\- ]{3,40}?)(?:\s+on\b|\s+ref|\s+upi|[.,;]|$)",
        r"\bupi\/[a-z]*\/?\d*\/?([A-Za-z0-9&.\- ]{3,40}?)(?:\/|\s|$)",
        r"\bby\s+([A-Za-z0-9&.\- ]{3,40}?)(?:\s+on\b|[.,;]|$)",
    ]
    for p in patterns:
        m = re.search(p, text, re.I)
        if m:
            name = " ".join(m.group(1).split()).strip(" .-")
            # "to your a/c" and friends are not a merchant.
            if name and not re.fullmatch(r"(your|a\/?c|account|bank|us|the)\b.*", name, re.I):
                return name[:60]
    return ""


def _category(text: str, direction: str) -> str:
    low = text.lower()
    for pattern, cat in CATEGORY_HINTS:
        if re.search(pattern, low):
            # A salary hint on a debit line is somebody paying salaries out.
            if direction == "expense" and cat in ("Salary", "Interest"):
                continue
            if direction == "income" and cat not in ("Salary", "Interest"):
                continue
            return cat
    return "" if direction == "income" else "Miscellaneous"


def parse_message(text: str, *, today: Optional[date] = None) -> Optional[Dict[str, Any]]:
    """One message to one transaction, or None if it is not one."""
    raw = " ".join((text or "").split())
    if len(raw) < 12 or NOISE.search(raw):
        return None
    low = raw.lower()

    amounts = re.findall(AMOUNT, low, re.I)
    if not amounts:
        return None

    debit_at = re.search(DEBIT_WORDS, low)
    credit_at = re.search(CREDIT_WORDS, low)
    if debit_at and credit_at:
        # Both words appear — the earlier one is what happened to the money.
        direction = "expense" if debit_at.start() < credit_at.start() else "income"
    elif debit_at:
        direction = "expense"
    elif credit_at:
        direction = "income"
    else:
        return None

    acct = re.search(ACCOUNT_TAIL, low)
    is_emi = bool(re.search(r"\bemi\b|loan a\/?c|loan acc|instal?ment", low))
    ref = re.search(r"(?:ref(?:erence)?(?:\s*no)?\.?|txn|utr|upi ref)[^0-9a-z]{0,4}([a-z0-9]{6,20})", low)

    return {
        "amount": _to_amount(amounts[0]),
        "kind": direction,
        "date": _parse_date(raw, today) or (today or date.today()).isoformat(),
        "account_tail": acct.group(1) if acct else "",
        "merchant": _merchant(raw),
        "category": _category(raw, direction),
        "is_emi": is_emi,
        "reference": ref.group(1).upper() if ref else "",
        "notes": raw[:200],
    }


def split_messages(blob: str) -> List[str]:
    """A pasted block into individual messages.

    People paste in all sorts of ways. A blank line separates reliably; so
    does a line that starts a fresh bank alert. A single long line with
    several messages run together is left whole rather than cut at a guess.
    """
    if not blob:
        return []
    chunks = re.split(r"\n\s*\n", blob.strip())
    out: List[str] = []
    for chunk in chunks:
        lines = [l for l in chunk.splitlines() if l.strip()]
        if len(lines) <= 1:
            out.extend(l for l in lines if l.strip())
            continue
        # Each line that looks like its own alert becomes its own message.
        starts = [bool(re.match(rf"\s*(?:dear|{AMOUNT}|your|an? |alert|txn)", l, re.I))
                  for l in lines]
        if sum(starts) >= max(2, len(lines) // 2):
            out.extend(lines)
        else:
            out.append(" ".join(lines))
    return [o.strip() for o in out if o.strip()]


def match_account(parsed: dict, accounts: List[dict]) -> str:
    """Which of this person's accounts the message is about.

    Matched on the last digits the bank prints. Where several accounts end
    the same way nothing is matched, because picking one at random would post
    money to the wrong place.
    """
    tail = (parsed.get("account_tail") or "").lstrip("0")
    if not tail:
        return ""
    hits = []
    for a in accounts:
        digits = re.sub(r"\D", "", str(a.get("account_no") or a.get("name") or ""))
        if digits and (digits.endswith(tail) or tail.endswith(digits[-4:] if len(digits) >= 4 else digits)):
            hits.append(a["id"])
    return hits[0] if len(hits) == 1 else ""


def match_loan(parsed: dict, loans: List[dict]) -> str:
    """Which loan an EMI belongs to.

    Only ever matched for a message that actually mentions an EMI, and only
    on a confident signal: the lender's name, the loan's name, or an amount
    within a rupee of the instalment.
    """
    if not parsed.get("is_emi"):
        return ""
    low = (parsed.get("notes") or "").lower()
    amount = float(parsed.get("amount") or 0)
    for l in loans:
        for field in ("name", "lender"):
            val = str(l.get(field) or "").strip().lower()
            if len(val) >= 4 and val in low:
                return l["id"]
    near = [l for l in loans if abs(float(l.get("emi") or 0) - amount) <= 1.0]
    return near[0]["id"] if len(near) == 1 else ""


def parse_blob(blob: str, *, accounts: Optional[List[dict]] = None,
               loans: Optional[List[dict]] = None,
               today: Optional[date] = None) -> Dict[str, Any]:
    """The whole paste: what was understood, and what was not."""
    accounts = accounts or []
    loans = loans or []
    parsed: List[Dict[str, Any]] = []
    unparsed: List[str] = []

    for message in split_messages(blob):
        row = parse_message(message, today=today)
        if not row:
            unparsed.append(message[:200])
            continue
        row["account_id"] = match_account(row, accounts)
        row["loan_id"] = match_loan(row, loans)
        if row["loan_id"] and not row["category"]:
            row["category"] = "EMI & Loan Payments"
        parsed.append(row)

    return {
        "parsed": parsed,
        "unparsed": unparsed,
        "counts": {
            "read": len(parsed),
            "skipped": len(unparsed),
            "income": sum(1 for p in parsed if p["kind"] == "income"),
            "expense": sum(1 for p in parsed if p["kind"] == "expense"),
            "emi": sum(1 for p in parsed if p["is_emi"]),
            "needs_account": sum(1 for p in parsed if not p["account_id"]),
        },
        "total_in": round(sum(p["amount"] for p in parsed if p["kind"] == "income"), 2),
        "total_out": round(sum(p["amount"] for p in parsed if p["kind"] == "expense"), 2),
    }
