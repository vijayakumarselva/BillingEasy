"""Double-entry general ledger.

Until now every financial figure in BillingsEasy was derived on the fly by
aggregating invoices, purchases, expenses and payments. That works for a sales
report and falls apart for accounting: a trial balance assembled from four
unrelated sums cannot be made to balance, a bank balance that nothing posts to
never moves off its opening figure, and there is nowhere to record a journal,
a contra, depreciation or an opening capital.

This module is the backbone the rest of the accounting sits on. Documents post
entries; reports read balances. Two rules hold everything together:

1. **Every entry balances.** Debits equal credits, enforced on the way in. An
   unbalanced entry is refused rather than stored and discovered later.
2. **Money is paise, as integers.** Floats drift — a third of a rupee, a
   thousand lines, and the trial balance is off by a few paise with no way to
   find out where. `pricing.py` already works this way.

Nothing here deletes or rewrites a document. Entries carry the id of whatever
produced them, so a document's postings can be found, reversed and rebuilt
without touching the document itself.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Tuple

# ─────────────────────────────── money ───────────────────────────────

def to_paise(rupees: Any) -> int:
    """Rupees (float, str or int) to paise, rounded half-up at the paisa."""
    if rupees is None or rupees == "":
        return 0
    return int(round(float(rupees) * 100))


def to_rupees(paise: int) -> float:
    return round((paise or 0) / 100, 2)


# ──────────────────────── chart of accounts ──────────────────────────
#
# Five account types, in the order a balance sheet and P&L read. `normal` is
# the side that increases the account: assets and expenses are debit-normal,
# the rest credit-normal.

ASSET, LIABILITY, EQUITY, INCOME, EXPENSE = "asset", "liability", "equity", "income", "expense"
NORMAL_SIDE = {ASSET: "debit", EXPENSE: "debit",
               LIABILITY: "credit", EQUITY: "credit", INCOME: "credit"}

BALANCE_SHEET_TYPES = (ASSET, LIABILITY, EQUITY)
PL_TYPES = (INCOME, EXPENSE)

# The default chart for an Indian trading or service business. Codes follow the
# usual convention: 1000s assets, 2000s liabilities, 3000s equity, 4000s
# income, 5000s expenses. `system` accounts are the ones postings are wired to
# by name, so they may not be deleted.
DEFAULT_ACCOUNTS: List[Dict[str, Any]] = [
    # Assets
    {"code": "1000", "name": "Cash in Hand",            "type": ASSET,     "system": "cash"},
    {"code": "1010", "name": "Bank Accounts",           "type": ASSET,     "system": "bank", "group": True},
    {"code": "1100", "name": "Accounts Receivable",     "type": ASSET,     "system": "receivable"},
    {"code": "1200", "name": "Stock in Hand",           "type": ASSET,     "system": "stock"},
    {"code": "1300", "name": "Input CGST",              "type": ASSET,     "system": "input_cgst"},
    {"code": "1310", "name": "Input SGST",              "type": ASSET,     "system": "input_sgst"},
    {"code": "1320", "name": "Input IGST",              "type": ASSET,     "system": "input_igst"},
    {"code": "1400", "name": "TDS Receivable",          "type": ASSET,     "system": "tds_receivable"},
    {"code": "1500", "name": "Advances to Suppliers",   "type": ASSET,     "system": "supplier_advance"},
    {"code": "1600", "name": "Fixed Assets",            "type": ASSET},
    # Liabilities
    {"code": "2000", "name": "Accounts Payable",        "type": LIABILITY, "system": "payable"},
    {"code": "2100", "name": "Output CGST",             "type": LIABILITY, "system": "output_cgst"},
    {"code": "2110", "name": "Output SGST",             "type": LIABILITY, "system": "output_sgst"},
    {"code": "2120", "name": "Output IGST",             "type": LIABILITY, "system": "output_igst"},
    {"code": "2200", "name": "TDS Payable",             "type": LIABILITY, "system": "tds_payable"},
    {"code": "2300", "name": "Advances from Customers", "type": LIABILITY, "system": "customer_advance"},
    {"code": "2400", "name": "Loans",                   "type": LIABILITY},
    {"code": "2500", "name": "Round Off",               "type": LIABILITY, "system": "round_off"},
    # Equity
    {"code": "3000", "name": "Capital Account",         "type": EQUITY,    "system": "capital"},
    {"code": "3100", "name": "Opening Balance Equity",  "type": EQUITY,    "system": "opening_equity"},
    {"code": "3200", "name": "Drawings",                "type": EQUITY},
    # Income
    {"code": "4000", "name": "Sales",                   "type": INCOME,    "system": "sales"},
    {"code": "4100", "name": "Sales Returns",           "type": INCOME,    "system": "sales_returns"},
    {"code": "4200", "name": "Discount Allowed",        "type": EXPENSE,   "system": "discount_allowed"},
    {"code": "4300", "name": "Other Income",            "type": INCOME},
    # Expenses
    {"code": "5000", "name": "Purchases",               "type": EXPENSE,   "system": "purchases"},
    {"code": "5100", "name": "Purchase Returns",        "type": EXPENSE,   "system": "purchase_returns"},
    {"code": "5200", "name": "Direct Expenses",         "type": EXPENSE,   "system": "direct_expense"},
    {"code": "5300", "name": "Indirect Expenses",       "type": EXPENSE,   "system": "indirect_expense"},
    {"code": "5400", "name": "Freight & Shipping",      "type": EXPENSE,   "system": "freight"},
    {"code": "5500", "name": "Bank Charges",            "type": EXPENSE,   "system": "bank_charges"},
    {"code": "5600", "name": "Rounding Difference",     "type": EXPENSE,   "system": "rounding_diff"},
]

SYSTEM_CODES = {a["system"]: a["code"] for a in DEFAULT_ACCOUNTS if a.get("system")}


class LedgerError(Exception):
    """A posting that would corrupt the books — refused, not stored."""


# ───────────────────────────── entries ───────────────────────────────

def line(account: str, debit_p: int = 0, credit_p: int = 0, *,
         party_id: str = "", description: str = "",
         cost_centre: str = "") -> Dict[str, Any]:
    """One side of an entry. Amounts are paise, and only one side is used."""
    debit_p, credit_p = int(debit_p or 0), int(credit_p or 0)
    if debit_p and credit_p:
        raise LedgerError(f"{account}: a line is a debit or a credit, not both")
    if debit_p < 0 or credit_p < 0:
        raise LedgerError(f"{account}: a negative amount is the other side of the entry")
    return {"account": account, "debit": debit_p, "credit": credit_p,
            "party_id": party_id, "description": description,
            "cost_centre": cost_centre}


def build_entry(org_id: str, date: str, lines: List[Dict[str, Any]], *,
                voucher_type: str, narration: str = "",
                source_type: str = "", source_id: str = "",
                voucher_no: str = "", branch_id: str = "",
                created_by: str = "") -> Dict[str, Any]:
    """A journal entry, checked before it is allowed to exist.

    `source_type` / `source_id` tie it to the invoice, bill or payment it came
    from, so the whole posting can be found and reversed as a unit.
    """
    kept = [l for l in lines if (l.get("debit") or l.get("credit"))]
    if not kept:
        raise LedgerError("an entry with no amounts is not an entry")
    debits = sum(l["debit"] for l in kept)
    credits = sum(l["credit"] for l in kept)
    if debits != credits:
        raise LedgerError(
            f"entry does not balance: debits {to_rupees(debits)} vs "
            f"credits {to_rupees(credits)} ({voucher_type} {source_id or ''})".strip())
    return {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "date": (date or "")[:10],
        "voucher_type": voucher_type,
        "voucher_no": voucher_no,
        "narration": narration,
        "lines": kept,
        "total": debits,              # paise; equals credits by construction
        "source_type": source_type,
        "source_id": source_id,
        "branch_id": branch_id,
        "created_by": created_by,
        "created_at": datetime.utcnow().isoformat(),
        "reversed": False,
    }


# ───────────────── postings for the documents we already have ─────────────────
#
# Each takes a saved document and returns the entry it implies. They are pure:
# no database, so they can be tested directly and replayed over history.

def _totals(doc: dict) -> Dict[str, int]:
    t = doc.get("totals") or {}
    return {k: to_paise(t.get(k, 0)) for k in
            ("taxable_amount", "cgst", "sgst", "igst", "grand_total",
             "round_off", "discount")}


def sale_entry(inv: dict, org_id: str = "") -> Dict[str, Any]:
    """A sales invoice.

        Debit  the customer (receivable) with the whole bill
        Credit Sales with the taxable value
        Credit Output CGST / SGST / IGST with the tax

    TDS the customer will deduct is not the seller's entry to make here; it is
    recorded against the receipt when it actually happens.
    """
    t = _totals(inv)
    party = inv.get("party_id", "")
    lines = [
        line(SYSTEM_CODES["receivable"], debit_p=t["grand_total"], party_id=party,
             description=inv.get("invoice_no", "")),
        line(SYSTEM_CODES["sales"], credit_p=t["taxable_amount"]),
    ]
    for tax, code in (("cgst", "output_cgst"), ("sgst", "output_sgst"), ("igst", "output_igst")):
        if t[tax]:
            lines.append(line(SYSTEM_CODES[code], credit_p=t[tax]))
    _absorb_rounding(lines, t["grand_total"])
    return build_entry(
        org_id or inv.get("org_id", ""), inv.get("invoice_date", ""), lines,
        voucher_type="sales", voucher_no=inv.get("invoice_no", ""),
        narration=f"Sale to {(inv.get('party_snapshot') or {}).get('name', '')}".strip(),
        source_type="invoice", source_id=inv.get("id", ""),
        branch_id=inv.get("branch_id", ""))


def purchase_entry(pur: dict, org_id: str = "") -> Dict[str, Any]:
    """A purchase bill — the mirror of a sale.

        Debit  Purchases with the taxable value
        Debit  Input CGST / SGST / IGST
        Credit the supplier (payable) with the whole bill

    Where TDS was deducted under section 194Q, the supplier is credited with
    the bill less the deduction and TDS Payable carries the rest, because that
    money goes to the government rather than the supplier.
    """
    t = _totals(pur)
    party = pur.get("party_id", "")
    tds = to_paise(pur.get("tds_amount", 0))
    lines = [line(SYSTEM_CODES["purchases"], debit_p=t["taxable_amount"])]
    for tax, code in (("cgst", "input_cgst"), ("sgst", "input_sgst"), ("igst", "input_igst")):
        if t[tax]:
            lines.append(line(SYSTEM_CODES[code], debit_p=t[tax]))
    lines.append(line(SYSTEM_CODES["payable"], credit_p=t["grand_total"] - tds,
                      party_id=party, description=pur.get("bill_no", "")))
    if tds:
        lines.append(line(SYSTEM_CODES["tds_payable"], credit_p=tds, party_id=party,
                          description=f"TDS 194Q on {pur.get('bill_no', '')}"))
    _absorb_rounding(lines, None)
    return build_entry(
        org_id or pur.get("org_id", ""), pur.get("purchase_date", ""), lines,
        voucher_type="purchase", voucher_no=pur.get("bill_no", ""),
        narration=f"Purchase from {(pur.get('party_snapshot') or {}).get('name', '')}".strip(),
        source_type="purchase", source_id=pur.get("id", ""),
        branch_id=pur.get("branch_id", ""))


def payment_entry(pay: dict, org_id: str = "", bank_code: str = "") -> Dict[str, Any]:
    """Money in or out.

    Received:  debit cash or bank, credit the customer.
    Paid:      debit the supplier, credit cash or bank.

    This is the posting whose absence meant bank balances never moved.
    """
    amount = to_paise(pay.get("amount", 0))
    party = pay.get("party_id", "")
    received = (pay.get("direction") or "received") == "received"
    money = bank_code or _money_account(pay)
    if received:
        lines = [line(money, debit_p=amount, description=pay.get("ref_no", "")),
                 line(SYSTEM_CODES["receivable"], credit_p=amount, party_id=party)]
    else:
        lines = [line(SYSTEM_CODES["payable"], debit_p=amount, party_id=party),
                 line(money, credit_p=amount, description=pay.get("ref_no", ""))]
    return build_entry(
        org_id or pay.get("org_id", ""), pay.get("payment_date", ""), lines,
        voucher_type="receipt" if received else "payment",
        voucher_no=pay.get("ref_no", ""),
        narration=pay.get("notes", "") or ("Receipt" if received else "Payment"),
        source_type="payment", source_id=pay.get("id", ""))


def expense_entry(exp: dict, org_id: str = "", bank_code: str = "") -> Dict[str, Any]:
    """An expense, paid now.

        Debit  the expense (indirect unless told otherwise)
        Debit  input GST where it was claimed
        Credit cash or bank
    """
    gross = to_paise(exp.get("amount", 0))
    gst = to_paise(exp.get("gst_amount", 0))
    net = gross - gst
    money = bank_code or _money_account(exp)
    lines = [line(exp.get("account_code") or SYSTEM_CODES["indirect_expense"],
                  debit_p=net, description=exp.get("category", ""),
                  cost_centre=exp.get("cost_centre", ""))]
    if gst:
        # Which input head depends on the supply; same-state is the common case.
        half = gst // 2
        lines.append(line(SYSTEM_CODES["input_cgst"], debit_p=half))
        lines.append(line(SYSTEM_CODES["input_sgst"], debit_p=gst - half))
    lines.append(line(money, credit_p=gross))
    return build_entry(
        org_id or exp.get("org_id", ""), exp.get("date", ""), lines,
        voucher_type="expense", voucher_no=exp.get("ref_no", ""),
        narration=exp.get("description", "") or exp.get("category", "Expense"),
        source_type="expense", source_id=exp.get("id", ""))


def opening_balance_entry(org_id: str, date: str,
                          balances: List[Tuple[str, int]]) -> Dict[str, Any]:
    """Opening balances, squared off against Opening Balance Equity.

    `balances` is (account code, signed paise) — positive for a debit balance,
    negative for a credit one. Whatever does not balance lands in equity, which
    is exactly what that account is for.
    """
    lines, net = [], 0
    for code, signed in balances:
        if not signed:
            continue
        net += signed
        lines.append(line(code, debit_p=signed) if signed > 0
                     else line(code, credit_p=-signed))
    if net:
        lines.append(line(SYSTEM_CODES["opening_equity"], credit_p=net) if net > 0
                     else line(SYSTEM_CODES["opening_equity"], debit_p=-net))
    return build_entry(org_id, date, lines, voucher_type="opening",
                       narration="Opening balances", source_type="opening",
                       source_id=f"{org_id}:opening")


def reversal_of(entry: dict, date: str = "", reason: str = "") -> Dict[str, Any]:
    """The entry that undoes another, for a cancelled or corrected document.

    Books are not edited in place: the original stays, and a mirror cancels it.
    """
    flipped = [line(l["account"], debit_p=l["credit"], credit_p=l["debit"],
                    party_id=l.get("party_id", ""),
                    description=l.get("description", ""),
                    cost_centre=l.get("cost_centre", "")) for l in entry["lines"]]
    rev = build_entry(entry["org_id"], date or entry["date"], flipped,
                      voucher_type=entry["voucher_type"],
                      voucher_no=entry.get("voucher_no", ""),
                      narration=reason or f"Reversal of {entry.get('voucher_no') or entry['id']}",
                      source_type=entry.get("source_type", ""),
                      source_id=entry.get("source_id", ""),
                      branch_id=entry.get("branch_id", ""))
    rev["reverses"] = entry["id"]
    rev["is_reversal"] = True
    return rev


def _money_account(doc: dict) -> str:
    """Cash unless the document names a bank account."""
    if doc.get("bank_account_id") or (doc.get("method") or "").lower() in (
            "bank", "neft", "rtgs", "imps", "upi", "cheque", "card"):
        return bank_code_for(doc.get("bank_account_id", ""))
    return SYSTEM_CODES["cash"]


def bank_code_for(bank_account_id: str) -> str:
    """Each bank account is its own ledger account under 1010."""
    return f"1010:{bank_account_id}" if bank_account_id else SYSTEM_CODES["bank"]


def _absorb_rounding(lines: List[Dict[str, Any]], target_total: Optional[int]) -> None:
    """Put any one-paisa gap somewhere honest instead of refusing the entry.

    Tax split across three heads can leave a paisa adrift. Rather than reject a
    real invoice over it, the difference is posted to Rounding Difference,
    where an accountant can see it rather than hunt for it.
    """
    debits = sum(l["debit"] for l in lines)
    credits = sum(l["credit"] for l in lines)
    gap = debits - credits
    if not gap:
        return
    if abs(gap) > 100:          # more than a rupee is a real error, not rounding
        return
    lines.append(line(SYSTEM_CODES["rounding_diff"],
                      credit_p=gap) if gap > 0 else
                 line(SYSTEM_CODES["rounding_diff"], debit_p=-gap))


# ─────────────────────────── reading the books ───────────────────────────

def account_balances(entries: Iterable[dict],
                     upto: str = "", since: str = "") -> Dict[str, Dict[str, int]]:
    """{account: {debit, credit, balance}} in paise, over the given entries.

    `balance` is signed on the debit side: positive means a debit balance.
    """
    out: Dict[str, Dict[str, int]] = {}
    for e in entries:
        if e.get("reversed_out"):
            continue
        d = e.get("date", "")
        if since and d < since:
            continue
        if upto and d > upto:
            continue
        for l in e.get("lines", []):
            acc = out.setdefault(l["account"], {"debit": 0, "credit": 0, "balance": 0})
            acc["debit"] += l.get("debit", 0)
            acc["credit"] += l.get("credit", 0)
    for acc in out.values():
        acc["balance"] = acc["debit"] - acc["credit"]
    return out


def trial_balance(entries: Iterable[dict], accounts: List[dict],
                  upto: str = "") -> Dict[str, Any]:
    """A trial balance that balances, or says by how much it does not."""
    bal = account_balances(entries, upto=upto)
    by_code = {a["code"]: a for a in accounts}
    rows, total_d, total_c = [], 0, 0
    for code, b in sorted(bal.items()):
        if not b["debit"] and not b["credit"]:
            continue
        meta = by_code.get(code) or by_code.get(code.split(":")[0]) or {}
        debit = b["balance"] if b["balance"] > 0 else 0
        credit = -b["balance"] if b["balance"] < 0 else 0
        total_d += debit
        total_c += credit
        rows.append({"code": code, "name": meta.get("name", code),
                     "type": meta.get("type", ""),
                     "debit": to_rupees(debit), "credit": to_rupees(credit)})
    return {"rows": rows, "total_debit": to_rupees(total_d),
            "total_credit": to_rupees(total_c),
            "balanced": total_d == total_c,
            "difference": to_rupees(total_d - total_c)}


def profit_and_loss(entries: Iterable[dict], accounts: List[dict],
                    since: str = "", upto: str = "") -> Dict[str, Any]:
    """Income less expenses for a period, from the ledger."""
    bal = account_balances(entries, since=since, upto=upto)
    by_code = {a["code"]: a for a in accounts}
    income, expense = [], []
    ti = te = 0
    for code, b in sorted(bal.items()):
        meta = by_code.get(code) or by_code.get(code.split(":")[0]) or {}
        kind = meta.get("type")
        if kind == INCOME:
            amt = -b["balance"]           # credit-normal
            ti += amt
            if amt:
                income.append({"code": code, "name": meta.get("name", code),
                               "amount": to_rupees(amt)})
        elif kind == EXPENSE:
            amt = b["balance"]
            te += amt
            if amt:
                expense.append({"code": code, "name": meta.get("name", code),
                                "amount": to_rupees(amt)})
    return {"income": income, "expenses": expense,
            "total_income": to_rupees(ti), "total_expenses": to_rupees(te),
            "net_profit": to_rupees(ti - te), "from": since, "to": upto}


def balance_sheet(entries: Iterable[dict], accounts: List[dict],
                  upto: str = "", period_start: str = "") -> Dict[str, Any]:
    """Assets against liabilities and equity, including the period's profit.

    Profit for the year is not an account anyone posts to — it is income less
    expenses, and it belongs on the equity side or the sheet will not agree.
    """
    bal = account_balances(entries, upto=upto)
    by_code = {a["code"]: a for a in accounts}
    assets, liabilities, equity = [], [], []
    ta = tl = te = 0
    for code, b in sorted(bal.items()):
        meta = by_code.get(code) or by_code.get(code.split(":")[0]) or {}
        kind = meta.get("type")
        if kind == ASSET:
            amt = b["balance"]
            ta += amt
            if amt:
                assets.append({"code": code, "name": meta.get("name", code), "amount": to_rupees(amt)})
        elif kind == LIABILITY:
            amt = -b["balance"]
            tl += amt
            if amt:
                liabilities.append({"code": code, "name": meta.get("name", code), "amount": to_rupees(amt)})
        elif kind == EQUITY:
            amt = -b["balance"]
            te += amt
            if amt:
                equity.append({"code": code, "name": meta.get("name", code), "amount": to_rupees(amt)})

    pl = profit_and_loss(entries, accounts, since=period_start, upto=upto)
    profit_p = to_paise(pl["net_profit"])
    if profit_p:
        equity.append({"code": "3900", "name": "Profit for the period",
                       "amount": to_rupees(profit_p)})
        te += profit_p
    return {"assets": assets, "liabilities": liabilities, "equity": equity,
            "total_assets": to_rupees(ta),
            "total_liabilities": to_rupees(tl),
            "total_equity": to_rupees(te),
            "balanced": ta == tl + te,
            "difference": to_rupees(ta - tl - te),
            "as_at": upto}


def ledger_for(entries: Iterable[dict], account: str,
               since: str = "", upto: str = "",
               opening_p: int = 0) -> Dict[str, Any]:
    """One account's transactions with a running balance — the ledger view."""
    rows = []
    running = opening_p
    for e in sorted(entries, key=lambda x: (x.get("date", ""), x.get("created_at", ""))):
        d = e.get("date", "")
        if since and d < since:
            continue
        if upto and d > upto:
            continue
        for l in e.get("lines", []):
            if l["account"] != account:
                continue
            running += l.get("debit", 0) - l.get("credit", 0)
            rows.append({
                "date": d, "voucher_type": e.get("voucher_type", ""),
                "voucher_no": e.get("voucher_no", ""),
                "narration": l.get("description") or e.get("narration", ""),
                "party_id": l.get("party_id", ""),
                "debit": to_rupees(l.get("debit", 0)),
                "credit": to_rupees(l.get("credit", 0)),
                "balance": to_rupees(running),
                "entry_id": e.get("id", ""),
            })
    return {"account": account, "opening": to_rupees(opening_p),
            "closing": to_rupees(running), "rows": rows}
