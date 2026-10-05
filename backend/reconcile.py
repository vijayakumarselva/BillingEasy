"""Turning a bank line into a real entry in the books.

Most small businesses do not raise a bill and then pay it. Money leaves the
account and the paperwork — if any — turns up later. So the statement, not the
invoice, is where the books actually start: you look at what left, say what it
was, and the entry gets written.

This module reads a bank narration and guesses what it is, so the owner is
confirming a suggestion rather than typing from scratch 1,800 times. Nothing
here writes anything; `server.py` does that once the owner says yes.
"""
import re
from typing import Any, Dict, List, Optional

# What a line can become.
KIND_EXPENSE = "expense"        # money out, no bill — fuel, tea, wages
KIND_PURCHASE = "purchase"      # money out against a supplier bill
KIND_SALE = "sale"              # money in, raise the invoice now
KIND_RECEIPT = "receipt"        # money in against an invoice already raised
KIND_PAYMENT = "payment"        # money out against a bill already entered
KIND_TRANSFER = "transfer"      # between your own accounts — not income or cost
KIND_IGNORE = "ignore"          # not business: personal, or a line you never want

MONEY_IN_KINDS = [KIND_RECEIPT, KIND_SALE, KIND_TRANSFER, KIND_IGNORE]
MONEY_OUT_KINDS = [KIND_PAYMENT, KIND_PURCHASE, KIND_EXPENSE, KIND_TRANSFER, KIND_IGNORE]

# Common Indian bank narration prefixes, stripped before looking for a name.
NOISE = re.compile(
    r"\b(?:NEFT|RTGS|IMPS|UPI|POS|ATM|ACH|ECS|NACH|CHQ|CHEQUE|CR|DR|TFR|TRF|"
    r"BY|TO|FROM|REF|RRN|TXN|PAYMENT|PAYMEN|INF|MB|IB|NB|INB|OTHPG|PCD|BIL|"
    r"BIL/INFT|SI|EMI|CMS|COLLECTION|TRANSFER|SENT|RECEIVED)\b", re.I)
# Long digit runs, account numbers, masked numbers and IFSC-looking tokens.
CODES = re.compile(r"\b(?:[A-Z]{4}0[A-Z0-9]{6}|X{3,}\d*|\d{6,}|[A-Z0-9]*X{4,}[A-Z0-9]*)\b", re.I)

# Narration fragment -> (kind, category). Deliberately small and obvious; the
# owner's own rules, learned from what they actually do, matter far more.
HINTS: List[tuple] = [
    (r"\b(?:HPCL|BPCL|IOCL|IOC|INDIAN\s*OIL|PETROL|DIESEL|FUEL)\b", KIND_EXPENSE, "Fuel"),
    (r"\b(?:SWIGGY|ZOMATO|RESTAURANT|HOTEL|CAFE|TEA|CANTEEN)\b", KIND_EXPENSE, "Food & refreshments"),
    (r"\b(?:UBER|OLA|RAPIDO|IRCTC|RAILWAY|INDIGO|AIR\s*INDIA|SPICEJET|TRAVEL|TOLL|FASTAG|PARKING)\b",
     KIND_EXPENSE, "Travel"),
    (r"\b(?:AIRTEL|JIO|VODAFONE|VI\b|BSNL|RECHARGE|BROADBAND|INTERNET)\b",
     KIND_EXPENSE, "Phone & internet"),
    (r"\b(?:EB|TNEB|ELECTRICITY|POWER\s*BILL|TANGEDCO)\b", KIND_EXPENSE, "Electricity"),
    (r"\b(?:RENT|LEASE)\b", KIND_EXPENSE, "Rent"),
    (r"\b(?:SALARY|WAGES|STIPEND|PAYROLL|BONUS)\b", KIND_EXPENSE, "Salaries & wages"),
    (r"\b(?:GST|TDS|TAX|INCOME\s*TAX|CHALLAN|PTAX|ESI|EPF|PF)\b", KIND_EXPENSE, "Taxes & statutory"),
    (r"\b(?:CHARGES?|FEE|COMMISSION|SMS\s*CHG|AMC|ANNUAL\s*FEE|PENAL|MIN\s*BAL)\b",
     KIND_EXPENSE, "Bank charges"),
    (r"\b(?:INSURANCE|POLICY|LIC\b|PREMIUM)\b", KIND_EXPENSE, "Insurance"),
    (r"\b(?:INTEREST|INT\s*PD|INT\.PD)\b", KIND_EXPENSE, "Interest"),
    (r"\b(?:EMI|LOAN|CAPITAL\s*LIMITED|FINANCE|FINSERV|HDB|BAJAJ\s*FIN)\b",
     KIND_EXPENSE, "Loan repayment"),
    (r"\b(?:COURIER|DTDC|BLUEDART|DELHIVERY|FREIGHT|TRANSPORT|LORRY|CARGO)\b",
     KIND_EXPENSE, "Freight & courier"),
    (r"\b(?:AMAZON|FLIPKART|STATIONERY|PRINT|XEROX)\b", KIND_EXPENSE, "Office supplies"),
]

# Lines that are almost never income or cost.
TRANSFER_HINTS = re.compile(
    r"\b(?:SELF|OWN\s*A/?C|TRANSFER\s*TO\s*SELF|SWEEP|FD\b|RD\b|TERM\s*DEPOSIT|"
    r"CREDIT\s*CARD\s*PAYMENT|CARD\s*PAYMENT)\b", re.I)


def clean_narration(text: str) -> str:
    """The human-readable part of a bank narration.

    "RTGS DR-UTIB0001196-JK INDIA EAGRITECH LIMIT..." -> "JK INDIA EAGRITECH LIMIT"
    """
    s = (text or "").upper()
    s = s.replace("/", " ").replace("-", " ").replace("_", " ")
    s = CODES.sub(" ", s)
    s = NOISE.sub(" ", s)
    s = re.sub(r"[^A-Z0-9&.@ ]", " ", s)
    s = re.sub(r"\s{2,}", " ", s).strip()
    # Drop single stray letters left behind by the stripping.
    return " ".join(w for w in s.split() if len(w) > 1)


def name_guess(text: str) -> str:
    """The best guess at who the other side is — used to match a party."""
    cleaned = clean_narration(text)
    if not cleaned:
        return ""
    # A UPI handle carries the payer's name before the @.
    m = re.search(r"([A-Z][A-Z\s]{2,})\s*@", (text or "").upper())
    if m:
        return m.group(1).strip().title()
    return " ".join(cleaned.split()[:4]).title()


def hint_for(text: str) -> Optional[Dict[str, str]]:
    up = (text or "").upper()
    if TRANSFER_HINTS.search(up):
        return {"kind": KIND_TRANSFER, "category": "Own account transfer"}
    for pattern, kind, category in HINTS:
        if re.search(pattern, up, re.I):
            return {"kind": kind, "category": category}
    return None


# Words almost every Indian business name contains. Matching a party on these
# alone pairs "Karthikeyan Traders" with "Vrishabh Traders", which is worse
# than offering no guess at all.
GENERIC_NAME_WORDS = {
    "TRADERS", "TRADING", "ENTERPRISE", "ENTERPRISES", "AGENCIES", "AGENCY",
    "COMPANY", "COMPANIES", "PRIVATE", "LIMITED", "PVT", "LTD", "LLP", "INC",
    "CORP", "CORPORATION", "INDUSTRIES", "INDUSTRY", "SONS", "BROTHERS", "BROS",
    "AND", "THE", "STORE", "STORES", "SHOP", "MART", "SUPER", "GENERAL",
    "SERVICES", "SERVICE", "SOLUTIONS", "SOLUTION", "SYSTEMS", "SUPPLIERS",
    "DISTRIBUTORS", "DISTRIBUTOR", "MERCHANTS", "ASSOCIATES", "GROUP",
    "INDIA", "INDIAN", "NEW", "SREE", "SRI", "SHREE", "SHRI",
}


def distinctive_words(name: str) -> List[str]:
    """The parts of a name that actually identify a business."""
    return [w for w in re.findall(r"[A-Z0-9&]{3,}", (name or "").upper())
            if w not in GENERIC_NAME_WORDS]


def same_party(narration_guess: str, party_name: str) -> bool:
    """Is this narration really about this party?

    At least one distinctive word must match — a shared "Traders" is not a match.
    """
    a = set(distinctive_words(narration_guess))
    b = set(distinctive_words(party_name))
    return bool(a & b)


def rule_key(text: str) -> str:
    """A stable key for 'lines like this one', so a decision can be reused.

    The merchant name survives; the reference numbers that differ every time
    do not. "UPI-SUDHARSAN R-SUDHARSAN6116-1@OKSBI-SBI" and the same payment
    next month land on the same key.
    """
    cleaned = clean_narration(text)
    return " ".join(cleaned.split()[:3])


def suggest(row: Dict[str, Any], *, rule: Optional[dict] = None,
            party: Optional[dict] = None) -> Dict[str, Any]:
    """What this line probably is. A saved rule always wins over a guess."""
    is_in = float(row.get("credit") or 0) > 0
    amount = float(row.get("credit") or 0) if is_in else float(row.get("debit") or 0)
    out = {
        "direction": "in" if is_in else "out",
        "amount": round(amount, 2),
        "name_guess": name_guess(row.get("description", "")),
        "rule_key": rule_key(row.get("description", "")),
        "choices": MONEY_IN_KINDS if is_in else MONEY_OUT_KINDS,
        "party_id": (party or {}).get("id", ""),
        "party_name": (party or {}).get("name", ""),
        "confidence": "low",
    }

    if rule:
        out.update({"kind": rule.get("kind"), "category": rule.get("category", ""),
                    "party_id": rule.get("party_id") or out["party_id"],
                    "party_name": rule.get("party_name") or out["party_name"],
                    "reason": "You chose this for the same kind of line before",
                    "confidence": "high"})
        return out

    if party:
        out.update({"kind": KIND_RECEIPT if is_in else KIND_PAYMENT,
                    "category": "",
                    "reason": f"The narration looks like {party['name']}",
                    "confidence": "medium"})
        return out

    hint = hint_for(row.get("description", ""))
    # A hint only counts if it makes sense for the direction. "TATA CAPITAL"
    # reads as a loan, but money *arriving* from them is not a loan repayment,
    # and offering an expense against a credit would leave the choice blank.
    if hint and hint["kind"] in out["choices"]:
        out.update({**hint, "reason": "Recognised from the narration",
                    "confidence": "medium"})
        return out

    out.update({"kind": KIND_SALE if is_in else KIND_EXPENSE,
                "category": "" if is_in else "General",
                "reason": "No match — tell us what this is",
                "confidence": "low"})
    return out


def describe(kind: str) -> str:
    return {
        KIND_EXPENSE: "Expense",
        KIND_PURCHASE: "Purchase bill",
        KIND_SALE: "Sales invoice",
        KIND_RECEIPT: "Receipt against an invoice",
        KIND_PAYMENT: "Payment against a bill",
        KIND_TRANSFER: "Transfer between own accounts",
        KIND_IGNORE: "Not business",
    }.get(kind, kind)
