"""Personal finance.

The interesting tests here are the ones about what must NOT be counted: a
transfer, a credit-card bill, and the principal half of an EMI. Each is a way
of making every figure on the dashboard wrong while looking perfectly
plausible.
"""
import os, sys
from datetime import date
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
import personal as P

OK = []
def check(name, cond, extra=""):
    OK.append((name, bool(cond)))
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if not cond and extra else ""))

TODAY = date(2026, 11, 5)

ACCOUNTS = [
    {"id": "sav", "name": "HDFC Savings", "account_type": "savings", "opening_balance": 100000},
    {"id": "cash", "name": "Cash", "account_type": "cash", "opening_balance": 5000},
    {"id": "card", "name": "HDFC Credit Card", "account_type": "credit_card", "opening_balance": 0},
]


def test_emi_matches_the_bank():
    print("\nEMI arithmetic")
    # ₹10,00,000 at 9% for 60 months. A bank quotes ₹20,758; the exact figure
    # carries paise, and we keep them rather than rounding the schedule adrift.
    emi = P.emi_amount(P.to_paise(1000000), 9, 60)
    check("a ₹10L loan at 9% over 5 years is ₹20,758.36",
          P.to_rupees(emi) == 20758.36, str(P.to_rupees(emi)))
    home = P.emi_amount(P.to_paise(5000000), 8.5, 240)
    check("a ₹50L home loan at 8.5% over 20 years is ₹43,391.16",
          P.to_rupees(home) == 43391.16, str(P.to_rupees(home)))
    free = P.emi_amount(P.to_paise(12000), 0, 12)
    check("an interest-free loan is just the principal split",
          P.to_rupees(free) == 1000.0, str(P.to_rupees(free)))
    check("no loan, no EMI", P.emi_amount(0, 9, 60) == 0)


def test_the_schedule_closes_at_zero():
    print("\namortisation")
    rows = P.amortisation(P.to_paise(100000), 12, 12, "2026-01-10")
    check("one row per instalment", len(rows) == 12, str(len(rows)))
    check("the first instalment is mostly interest",
          rows[0]["interest"] == 1000.0, str(rows[0]["interest"]))
    check("the last instalment is almost all principal",
          rows[-1]["principal"] > rows[-1]["interest"] * 10)
    check("and the loan ends at exactly zero",
          rows[-1]["balance"] == 0, str(rows[-1]["balance"]))
    total_principal = round(sum(r["principal"] for r in rows), 2)
    check("the principal repaid is the amount borrowed",
          total_principal == 100000.0, str(total_principal))
    check("instalments fall on the same day each month",
          rows[1]["due_date"] == "2026-02-10" and rows[11]["due_date"] == "2026-12-10")


def test_a_due_date_at_the_end_of_the_month_does_not_slide():
    print("\nthe 31st")
    check("31 Jan + 1 month is 28 Feb, not 3 March",
          P.add_months(date(2026, 1, 31), 1) == date(2026, 2, 28))
    check("and it comes back on 31 March",
          P.add_months(date(2026, 1, 31), 2) == date(2026, 3, 31))


def test_a_transfer_is_neither_income_nor_expense():
    print("\nTRAP 1 — moving your own money")
    txns = [
        {"kind": "income", "amount": 80000, "date": "2026-11-01", "account_id": "sav", "category": "Salary"},
        {"kind": "transfer", "amount": 10000, "date": "2026-11-02", "account_id": "sav", "to_account_id": "cash"},
        {"kind": "expense", "amount": 3000, "date": "2026-11-03", "account_id": "cash", "category": "Groceries"},
    ]
    s = P.summarise(txns)
    check("income is the salary alone", s["income"] == 80000.0, str(s["income"]))
    check("expenses are the groceries alone", s["expenses"] == 3000.0, str(s["expenses"]))
    check("savings are income less expenses", s["savings"] == 77000.0)
    check("the transfer is reported separately, not in either", s["transfers"] == 10000.0)

    bal = P.account_balances(ACCOUNTS, txns)
    check("savings is 1,00,000 + 80,000 − 10,000", bal["sav"]["balance"] == 170000.0, str(bal["sav"]["balance"]))
    check("cash is 5,000 + 10,000 − 3,000", bal["cash"]["balance"] == 12000.0, str(bal["cash"]["balance"]))
    total = bal["sav"]["balance"] + bal["cash"]["balance"]
    check("and the transfer created no money", total == 182000.0, str(total))


def test_a_card_bill_is_not_a_second_expense():
    print("\nTRAP 2 — the credit-card bill")
    txns = [
        {"kind": "income", "amount": 80000, "date": "2026-11-01", "account_id": "sav", "category": "Salary"},
        # Swiping the card is the expense.
        {"kind": "expense", "amount": 15000, "date": "2026-11-04", "account_id": "card", "category": "Shopping"},
        # Paying the bill moves money; it is not a second ₹15,000 of spending.
        {"kind": "transfer", "amount": 15000, "date": "2026-11-20", "account_id": "sav", "to_account_id": "card"},
    ]
    s = P.summarise(txns)
    check("the month shows ₹15,000 spent, not ₹30,000",
          s["expenses"] == 15000.0, str(s["expenses"]))
    bal = P.account_balances(ACCOUNTS, txns)
    check("the card owes ₹15,000 after the purchase, nil after the bill",
          bal["card"]["balance"] == 0.0, str(bal["card"]["balance"]))
    check("and the bank is down by the payment",
          bal["sav"]["balance"] == 165000.0, str(bal["sav"]["balance"]))

    unpaid = P.account_balances(ACCOUNTS, txns[:2])
    check("before paying, the card shows ₹15,000 owed",
          unpaid["card"]["balance"] == 15000.0, str(unpaid["card"]["balance"]))
    check("a card is recognised as a liability", unpaid["card"]["is_liability"])


def test_an_emi_is_part_repayment():
    print("\nTRAP 3 — what an EMI really is")
    loan = {"id": "l1", "name": "Car Loan", "loan_type": "vehicle", "principal": 500000,
            "interest_rate": 9.5, "tenure_months": 60, "first_due_date": "2026-01-05",
            "installments_paid": 10}
    pos = P.loan_position(loan, TODAY)
    check("the EMI is computed if not supplied", pos["emi"] > 0)
    check("ten paid leaves fifty", pos["installments_left"] == 50, str(pos["installments_left"]))
    check("outstanding is less than borrowed", pos["outstanding"] < 500000)
    paid_total = round(pos["principal_repaid"] + pos["interest_paid"], 2)
    check("ten EMIs split into principal and interest",
          abs(paid_total - pos["emi"] * 10) < 2, f'{paid_total} vs {pos["emi"] * 10}')
    check("interest paid is a fraction of the EMIs, not all of it",
          0 < pos["interest_paid"] < pos["principal_repaid"])
    check("the next due date is known", pos["next_due"] == "2026-11-05", str(pos["next_due"]))


def test_what_is_already_spoken_for():
    print("\nupcoming commitments")
    recurrings = [
        {"id": "r1", "name": "House Rent", "amount": 25000, "frequency": "monthly",
         "next_due": "2026-11-07", "category": "Home Rent", "active": True},
        {"id": "r2", "name": "Netflix", "amount": 649, "frequency": "monthly",
         "next_due": "2026-11-28", "category": "Entertainment", "active": True},
        {"id": "r3", "name": "Old gym", "amount": 2000, "frequency": "monthly",
         "next_due": "2026-11-10", "category": "Miscellaneous", "active": False},
    ]
    loans = [{"id": "l1", "name": "Car Loan", "principal": 500000, "interest_rate": 9.5,
              "tenure_months": 60, "first_due_date": "2026-01-05", "installments_paid": 10}]
    up = P.upcoming(recurrings, loans, days=30, today=TODAY)
    names = [i["name"] for i in up["items"]]
    check("rent is listed", "House Rent" in names)
    check("the EMI is listed alongside it", "Car Loan" in names)
    check("a cancelled subscription is not", "Old gym" not in names)
    check("soonest first", up["items"][0]["due_date"] <= up["items"][-1]["due_date"])
    check("the total is what the month already owes", up["total"] > 25000)


def test_budgets_say_when_they_are_blown():
    print("\nbudgets")
    budgets = [{"id": "b1", "category": "Groceries", "amount": 10000},
               {"id": "b2", "category": "Food & Dining", "amount": 5000},
               {"id": "b3", "category": "Shopping", "amount": 8000}]
    txns = [
        {"kind": "expense", "amount": 9000, "date": "2026-11-02", "category": "Groceries"},
        {"kind": "expense", "amount": 7000, "date": "2026-11-03", "category": "Food & Dining"},
        {"kind": "expense", "amount": 1000, "date": "2026-11-04", "category": "Shopping"},
        {"kind": "expense", "amount": 9999, "date": "2026-10-04", "category": "Shopping"},
    ]
    rows = P.budget_status(budgets, txns, "2026-11")
    by = {r["category"]: r for r in rows}
    check("90% used is a warning", by["Groceries"]["state"] == "warning", by["Groceries"]["state"])
    check("over the limit is flagged", by["Food & Dining"]["state"] == "over")
    check("and says by how much", by["Food & Dining"]["over_by"] == 2000.0)
    check("well inside is fine", by["Shopping"]["state"] == "ok")
    check("last month's spending is not counted against this month",
          by["Shopping"]["spent"] == 1000.0, str(by["Shopping"]["spent"]))
    check("the worst offender sorts first", rows[0]["category"] == "Food & Dining")


def test_goals_know_whether_they_will_arrive():
    print("\nsavings goals")
    g = P.goal_progress({"id": "g1", "name": "Emergency Fund", "target_amount": 300000,
                         "saved_amount": 120000, "monthly_contribution": 20000,
                         "target_date": "2027-05-01"}, TODAY)
    check("progress is what is saved over the target", g["progress_pct"] == 40.0, str(g["progress_pct"]))
    check("₹1,80,000 left at ₹20,000 a month is nine months", g["months_needed"] == 9, str(g["months_needed"]))
    check("six months available", g["months_available"] == 6, str(g["months_available"]))
    check("so it is not on track", g["on_track"] is False)
    check("and it says what would be needed", g["required_monthly"] == 30000.0, str(g["required_monthly"]))

    done = P.goal_progress({"name": "Holiday", "target_amount": 50000,
                            "saved_amount": 50000, "monthly_contribution": 0}, TODAY)
    check("a reached goal is complete", done["complete"] and done["progress_pct"] == 100.0)


def test_net_worth_counts_the_debts():
    print("\nnet worth")
    txns = [{"kind": "expense", "amount": 15000, "date": "2026-11-04", "account_id": "card",
             "category": "Shopping"}]
    bal = P.account_balances(ACCOUNTS, txns)
    loans = [{"id": "l1", "name": "Car", "principal": 500000, "interest_rate": 9.5,
              "tenure_months": 60, "first_due_date": "2026-01-05", "installments_paid": 10}]
    nw = P.net_worth(bal, loans, TODAY)
    check("assets are the cash accounts", nw["assets"] == 105000.0, str(nw["assets"]))
    check("the card debt counts against it", nw["card_debt"] == 15000.0)
    check("so does the loan", nw["loan_outstanding"] > 400000)
    check("net worth is assets less both",
          nw["net_worth"] == round(nw["assets"] - nw["liabilities"], 2))
    check("and it is negative here, which is the honest answer", nw["net_worth"] < 0)


def test_bad_records_are_refused():
    print("\nvalidation")
    def refused(t):
        try:
            P.validate_txn(t); return None
        except P.PersonalFinanceError as e:
            return str(e)
    check("a transfer to the same account is refused",
          refused({"kind": "transfer", "amount": 100, "date": "2026-11-01",
                   "account_id": "a", "to_account_id": "a"}) is not None)
    check("a transfer with one side missing is refused",
          refused({"kind": "transfer", "amount": 100, "date": "2026-11-01", "account_id": "a"}) is not None)
    check("a zero amount is refused",
          refused({"kind": "expense", "amount": 0, "date": "2026-11-01", "account_id": "a"}) is not None)
    check("an unknown kind is refused",
          refused({"kind": "donation", "amount": 10, "date": "2026-11-01", "account_id": "a"}) is not None)
    check("a good one passes",
          refused({"kind": "expense", "amount": 10, "date": "2026-11-01", "account_id": "a"}) is None)


def test_recurrence_lands_on_the_right_day():
    print("\nrecurrence")
    check("monthly from the 7th", str(P.next_occurrence("2026-11-07", "monthly", date(2026, 11, 7))) == "2026-12-07")
    check("weekly", str(P.next_occurrence("2026-11-02", "weekly", TODAY)) == "2026-11-09")
    check("quarterly", str(P.next_occurrence("2026-09-15", "quarterly", TODAY)) == "2026-12-15")
    check("a future date stays put", str(P.next_occurrence("2026-12-01", "monthly", TODAY)) == "2026-12-01")


def main():
    for t in (test_emi_matches_the_bank, test_the_schedule_closes_at_zero,
              test_a_due_date_at_the_end_of_the_month_does_not_slide,
              test_a_transfer_is_neither_income_nor_expense,
              test_a_card_bill_is_not_a_second_expense,
              test_an_emi_is_part_repayment, test_what_is_already_spoken_for,
              test_budgets_say_when_they_are_blown,
              test_goals_know_whether_they_will_arrive,
              test_net_worth_counts_the_debts, test_bad_records_are_refused,
              test_recurrence_lands_on_the_right_day):
        t()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
