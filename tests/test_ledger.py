"""The general ledger.

Accounting has one property worth protecting above all others: the books
balance. Every test here is really the same test asked in a different way.
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
import ledger as L

OK = []
def check(name, cond, extra=""):
    OK.append((name, bool(cond)))
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if not cond and extra else ""))

C = L.SYSTEM_CODES

INVOICE = {
    "id": "inv1", "org_id": "org1", "invoice_no": "INV-2026-0074",
    "invoice_date": "2026-10-07", "party_id": "cust1",
    "party_snapshot": {"name": "63Ideas Info Labs"},
    "totals": {"taxable_amount": 3740000.0, "cgst": 93500.0, "sgst": 93500.0,
               "igst": 0, "grand_total": 3927000.0, "round_off": 0, "discount": 0},
}
BILL = {
    "id": "pur1", "org_id": "org1", "bill_no": "SUP/99",
    "purchase_date": "2026-10-07", "party_id": "sup1",
    "party_snapshot": {"name": "Karthikeyan Traders"},
    "totals": {"taxable_amount": 1000000.0, "cgst": 90000.0, "sgst": 90000.0,
               "igst": 0, "grand_total": 1180000.0},
}


def test_money_is_exact():
    print("\nmoney")
    check("rupees become paise", L.to_paise(23100.00) == 2310000)
    check("and a stray half paisa rounds, not truncates", L.to_paise(0.015) == 2, str(L.to_paise(0.015)))
    check("a third of a rupee survives the round trip",
          L.to_rupees(L.to_paise(33.33)) == 33.33)
    check("nothing is nothing", L.to_paise(None) == 0 and L.to_paise("") == 0)


def test_an_entry_must_balance():
    print("\nthe one rule")
    try:
        L.build_entry("org1", "2026-10-07",
                      [L.line(C["cash"], debit_p=10000),
                       L.line(C["sales"], credit_p=9000)],
                      voucher_type="journal")
        check("an unbalanced entry is refused", False, "it was accepted")
    except L.LedgerError as e:
        check("an unbalanced entry is refused", "does not balance" in str(e))
    try:
        L.line(C["cash"], debit_p=100, credit_p=100)
        check("a line cannot be both sides", False)
    except L.LedgerError:
        check("a line cannot be both sides", True)
    try:
        L.build_entry("org1", "2026-10-07", [], voucher_type="journal")
        check("an empty entry is not an entry", False)
    except L.LedgerError:
        check("an empty entry is not an entry", True)


def test_a_sale_posts_correctly():
    print("\na sale of ₹39,27,000 including 5% GST")
    e = L.sale_entry(INVOICE)
    by = {l["account"]: l for l in e["lines"]}
    check("the customer is debited the whole bill",
          by[C["receivable"]]["debit"] == 392700000, str(by[C["receivable"]]["debit"]))
    check("sales is credited the taxable value only",
          by[C["sales"]]["credit"] == 374000000)
    check("output CGST is credited", by[C["output_cgst"]]["credit"] == 9350000)
    check("output SGST too", by[C["output_sgst"]]["credit"] == 9350000)
    check("no IGST on an intra-state sale", C["output_igst"] not in by)
    check("the customer is named on the line", by[C["receivable"]]["party_id"] == "cust1")
    check("it balances", sum(l["debit"] for l in e["lines"]) == sum(l["credit"] for l in e["lines"]))
    check("and it points back at the invoice",
          e["source_type"] == "invoice" and e["source_id"] == "inv1")


def test_a_purchase_posts_the_mirror():
    print("\na purchase bill")
    e = L.purchase_entry(BILL)
    by = {l["account"]: l for l in e["lines"]}
    check("purchases is debited net", by[C["purchases"]]["debit"] == 100000000)
    check("input GST is debited, not credited", by[C["input_cgst"]]["debit"] == 9000000)
    check("the supplier is credited the whole bill",
          by[C["payable"]]["credit"] == 118000000)
    check("it balances", sum(l["debit"] for l in e["lines"]) == sum(l["credit"] for l in e["lines"]))


def test_tds_goes_to_the_government_not_the_supplier():
    print("\nthe same bill with ₹1,000 of 194Q deducted")
    e = L.purchase_entry({**BILL, "tds_amount": 1000.0})
    by = {l["account"]: l for l in e["lines"]}
    check("the supplier is credited the bill less the deduction",
          by[C["payable"]]["credit"] == 118000000 - 100000, str(by[C["payable"]]["credit"]))
    check("and TDS payable carries the rest", by[C["tds_payable"]]["credit"] == 100000)
    check("it still balances",
          sum(l["debit"] for l in e["lines"]) == sum(l["credit"] for l in e["lines"]))


def test_money_actually_moves():
    print("\nreceipts and payments — the posting whose absence froze bank balances")
    r = L.payment_entry({"id": "p1", "org_id": "org1", "payment_date": "2026-10-08",
                         "party_id": "cust1", "direction": "received", "amount": 100000.0,
                         "method": "upi", "bank_account_id": "hdfc1"})
    by = {l["account"]: l for l in r["lines"]}
    check("the bank account is debited", by["1010:hdfc1"]["debit"] == 10000000)
    check("the customer's receivable comes down", by[C["receivable"]]["credit"] == 10000000)

    p = L.payment_entry({"id": "p2", "org_id": "org1", "payment_date": "2026-10-09",
                         "party_id": "sup1", "direction": "paid", "amount": 50000.0,
                         "method": "cash"})
    by2 = {l["account"]: l for l in p["lines"]}
    check("paying a supplier debits payable", by2[C["payable"]]["debit"] == 5000000)
    check("and credits cash", by2[C["cash"]]["credit"] == 5000000)
    check("a receipt is a receipt voucher", r["voucher_type"] == "receipt")
    check("a payment is a payment voucher", p["voucher_type"] == "payment")


def test_a_reversal_cancels_exactly():
    print("\ncancelling a document")
    e = L.sale_entry(INVOICE)
    r = L.reversal_of(e, reason="Invoice cancelled")
    both = L.account_balances([e, r])
    check("every account nets to nothing",
          all(v["balance"] == 0 for v in both.values()), str(both))
    check("the reversal says what it undoes", r["reverses"] == e["id"])
    check("the original is untouched", e.get("is_reversal") is None)


def test_the_books_balance():
    print("\na month of trading")
    entries = [
        L.opening_balance_entry("org1", "2026-04-01",
                                [(C["cash"], 5000000), ("1010:hdfc1", 20000000)]),
        L.sale_entry(INVOICE),
        L.purchase_entry(BILL),
        L.payment_entry({"id": "p1", "org_id": "org1", "payment_date": "2026-10-08",
                         "party_id": "cust1", "direction": "received",
                         "amount": 1000000.0, "method": "upi", "bank_account_id": "hdfc1"}),
        L.expense_entry({"id": "e1", "org_id": "org1", "date": "2026-10-09",
                         "amount": 11800.0, "gst_amount": 1800.0,
                         "category": "Internet", "method": "cash"}),
    ]
    accounts = L.DEFAULT_ACCOUNTS
    tb = L.trial_balance(entries, accounts)
    check("the trial balance balances", tb["balanced"], f'off by {tb["difference"]}')
    check("and it is not empty", len(tb["rows"]) > 5)

    pl = L.profit_and_loss(entries, accounts, since="2026-04-01", upto="2027-03-31")
    # Sales 37,40,000 − purchases 10,00,000 − expense 10,000 = 27,30,000
    check("profit is income less expenses", pl["net_profit"] == 2730000.0, str(pl["net_profit"]))

    bs = L.balance_sheet(entries, accounts, upto="2027-03-31", period_start="2026-04-01")
    check("the balance sheet balances", bs["balanced"], f'off by {bs["difference"]}')
    check("assets are real money and debts owed to us", bs["total_assets"] > 0)


def test_the_bank_balance_is_now_a_real_number():
    print("\nthe bug this was built to kill")
    entries = [
        L.opening_balance_entry("org1", "2026-04-01", [("1010:hdfc1", 10000000)]),
        L.payment_entry({"id": "p1", "org_id": "org1", "payment_date": "2026-10-08",
                         "party_id": "c1", "direction": "received", "amount": 50000.0,
                         "method": "neft", "bank_account_id": "hdfc1"}),
        L.payment_entry({"id": "p2", "org_id": "org1", "payment_date": "2026-10-09",
                         "party_id": "s1", "direction": "paid", "amount": 20000.0,
                         "method": "neft", "bank_account_id": "hdfc1"}),
    ]
    bal = L.account_balances(entries)["1010:hdfc1"]["balance"]
    check("opening ₹1,00,000 + ₹50,000 in − ₹20,000 out = ₹1,30,000",
          L.to_rupees(bal) == 130000.0, str(L.to_rupees(bal)))
    led = L.ledger_for(entries, "1010:hdfc1")
    check("the ledger shows each movement", len(led["rows"]) == 3)
    check("with a running balance", led["closing"] == 130000.0)


def test_rounding_never_refuses_a_real_invoice():
    print("\na paisa adrift")
    odd = {**INVOICE, "totals": {"taxable_amount": 1000.0, "cgst": 25.004, "sgst": 25.004,
                                 "igst": 0, "grand_total": 1050.01}}
    e = L.sale_entry(odd)
    check("the entry is still made",
          sum(l["debit"] for l in e["lines"]) == sum(l["credit"] for l in e["lines"]))
    check("and the difference is visible, not hidden",
          any(l["account"] == C["rounding_diff"] for l in e["lines"]))


def main():
    for t in (test_money_is_exact, test_an_entry_must_balance,
              test_a_sale_posts_correctly, test_a_purchase_posts_the_mirror,
              test_tds_goes_to_the_government_not_the_supplier,
              test_money_actually_moves, test_a_reversal_cancels_exactly,
              test_the_books_balance, test_the_bank_balance_is_now_a_real_number,
              test_rounding_never_refuses_a_real_invoice):
        t()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
