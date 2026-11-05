"""Personal finance, wired into the application.

The guarantee worth testing hardest is isolation: one person's money is
invisible to another, switching company changes nothing, and none of it
touches the business books.
"""
import os, sys, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
for k, v in {"MONGO_URL": "x", "DB_NAME": "t", "JWT_SECRET": "s", "SECRET_KEY": "s"}.items():
    os.environ.setdefault(k, v)

from mongomock_motor import AsyncMongoMockClient
from fastapi import HTTPException
import server
import personal as P

OK = []
def check(name, cond, extra=""):
    OK.append((name, bool(cond)))
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if not cond and extra else ""))

mdb = AsyncMongoMockClient()["t"]
server.db = mdb
run = asyncio.run

ALICE = {"id": "u-alice", "email": "alice@test.in", "name": "Alice"}
BOB = {"id": "u-bob", "email": "bob@test.in", "name": "Bob"}


def mk_account(user, **kw):
    return run(server.pf_create_account(server.PFAccountIn(**kw), user))


def mk_txn(user, **kw):
    return run(server.pf_create_txn(server.PFTxnIn(**kw), user))


def test_accounts_and_balances():
    print("\naccounts")
    sav = mk_account(ALICE, name="HDFC Savings", account_type="savings", opening_balance=100000)
    card = mk_account(ALICE, name="HDFC Card", account_type="credit_card")
    check("an account is created", sav["id"] and sav["name"] == "HDFC Savings")
    try:
        mk_account(ALICE, name="Nonsense", account_type="crypto")
        check("an unknown account type is refused", False)
    except HTTPException as e:
        check("an unknown account type is refused", e.status_code == 400)
    listed = run(server.pf_accounts(ALICE))
    check("balances come back with the accounts",
          any(a["id"] == sav["id"] and a["balance"] == 100000.0 for a in listed), str(listed))
    globals().update(SAV=sav["id"], CARD=card["id"])


def test_the_three_traps_end_to_end():
    print("\nincome, a card purchase, and the bill")
    cash = mk_account(ALICE, name="Cash", account_type="cash", opening_balance=5000)
    mk_txn(ALICE, kind="income", amount=80000, date="2026-11-01",
           account_id=SAV, category="Salary")
    mk_txn(ALICE, kind="expense", amount=15000, date="2026-11-04",
           account_id=CARD, category="Shopping")
    mk_txn(ALICE, kind="transfer", amount=15000, date="2026-11-20",
           account_id=SAV, to_account_id=CARD)
    mk_txn(ALICE, kind="transfer", amount=5000, date="2026-11-02",
           account_id=SAV, to_account_id=cash["id"])

    d = run(server.pf_dashboard("2026-11", ALICE))
    check("income is the salary", d["income"] == 80000.0, str(d["income"]))
    check("spending is the card purchase only, not the bill as well",
          d["expenses"] == 15000.0, str(d["expenses"]))
    check("savings follow", d["savings"] == 65000.0, str(d["savings"]))
    cards = [a for a in d["accounts"] if a["is_liability"]]
    check("the card is clear once the bill is paid", cards[0]["balance"] == 0.0, str(cards[0]))
    check("available balance excludes the card",
          d["available_balance"] == 170000.0, str(d["available_balance"]))


def test_a_transfer_to_itself_is_refused():
    print("\nvalidation through the API")
    try:
        mk_txn(ALICE, kind="transfer", amount=100, date="2026-11-01",
               account_id=SAV, to_account_id=SAV)
        check("a transfer to the same account is refused", False)
    except HTTPException as e:
        check("a transfer to the same account is refused", e.status_code == 400)
    try:
        mk_txn(ALICE, kind="expense", amount=100, date="2026-11-01", account_id="made-up")
        check("an unknown account is refused", False)
    except HTTPException as e:
        check("an unknown account is refused", e.status_code == 400)


def test_a_loan_and_its_emi():
    print("\nloans")
    loan = run(server.pf_create_loan(server.PFLoanIn(
        name="Car Loan", loan_type="vehicle", lender="HDFC", principal=500000,
        interest_rate=9.5, tenure_months=60, first_due_date="2026-01-05",
        installments_paid=10), ALICE))
    check("the EMI is worked out for us", loan["emi"] > 10000, str(loan["emi"]))
    check("ten paid, fifty to go", loan["installments_left"] == 50)
    globals().update(LOAN=loan["id"])

    listed = run(server.pf_loans(ALICE))
    check("the total outstanding is reported", listed["total_outstanding"] > 400000)
    check("as is the monthly commitment", listed["monthly_emi"] > 10000)

    full = run(server.pf_loan(LOAN, ALICE))
    check("the full schedule is available", len(full["schedule"]) == 60)


def test_paying_an_emi_advances_the_loan():
    print("\npaying an EMI")
    before = run(server.pf_loan(LOAN, ALICE))["installments_paid"]
    mk_txn(ALICE, kind="expense", amount=10497, date="2026-11-05", account_id=SAV,
           category="EMI & Loan Payments", loan_id=LOAN)
    after = run(server.pf_loan(LOAN, ALICE))["installments_paid"]
    check("the loan moves on by one instalment", after == before + 1, f"{before} then {after}")
    check("and the outstanding falls",
          run(server.pf_loan(LOAN, ALICE))["outstanding"] < 500000)


def test_a_recurring_payment_is_not_paid_twice():
    print("\nrecurring payments")
    r = run(server.pf_create_recurring(server.PFRecurringIn(
        name="House Rent", amount=25000, frequency="monthly", category="Home Rent",
        start_date="2026-11-07", next_due="2026-11-07", account_id=SAV), ALICE))
    first = run(server.pf_pay_recurring(r["id"], ALICE))
    check("paying it records a transaction", first["ok"] and first.get("transaction_id"))
    check("and schedules the next one", first["next_due"] == "2026-12-07", str(first.get("next_due")))

    # Pretend the user taps Pay twice on the same due date.
    run(db_reset_due(r["id"]))
    again = run(server.pf_pay_recurring(r["id"], ALICE))
    check("paying the same instalment twice does not duplicate it",
          again.get("already") is True, str(again))
    count = run(mdb.pf_transactions.count_documents(
        {"user_id": "u-alice", "recurring_id": r["id"]}))
    check("exactly one transaction exists for it", count == 1, str(count))


async def db_reset_due(rid):
    await mdb.pf_recurring.update_one({"id": rid}, {"$set": {"next_due": "2026-11-07"}})


def test_budgets_and_goals():
    print("\nbudgets and goals")
    run(server.pf_create_budget(server.PFBudgetIn(category="Shopping", amount=10000), ALICE))
    b = run(server.pf_budgets("2026-11", ALICE))
    row = next(r for r in b["rows"] if r["category"] == "Shopping")
    check("the ₹15,000 card purchase blows a ₹10,000 budget", row["state"] == "over")
    check("by ₹5,000", row["over_by"] == 5000.0, str(row["over_by"]))

    run(server.pf_create_goal(server.PFGoalIn(
        name="Emergency Fund", target_amount=300000, saved_amount=120000,
        monthly_contribution=20000, target_date="2027-05-01"), ALICE))
    g = run(server.pf_goals(ALICE))
    check("the goal is tracked", g["goals"][0]["progress_pct"] == 40.0)
    check("and totals are summed", g["total_target"] == 300000.0)


def test_one_persons_money_is_their_own():
    print("\nISOLATION — the guarantee")
    bob_acc = mk_account(BOB, name="Bob's Savings", account_type="savings", opening_balance=999)
    mk_txn(BOB, kind="income", amount=1234, date="2026-11-01",
           account_id=bob_acc["id"], category="Salary")

    alice_accounts = run(server.pf_accounts(ALICE))
    check("Alice cannot see Bob's account",
          all(a["id"] != bob_acc["id"] for a in alice_accounts))
    bob_dash = run(server.pf_dashboard("2026-11", BOB))
    check("Bob's income is his own", bob_dash["income"] == 1234.0, str(bob_dash["income"]))
    alice_dash = run(server.pf_dashboard("2026-11", ALICE))
    check("and Alice's is hers", alice_dash["income"] == 80000.0, str(alice_dash["income"]))

    try:
        run(server.pf_loan(LOAN, BOB))
        check("Bob cannot open Alice's loan", False, "he could")
    except HTTPException as e:
        check("Bob cannot open Alice's loan", e.status_code == 404)
    try:
        run(server.pf_update_goal("made-up", server.PFGoalIn(name="x", target_amount=1), BOB))
        check("nor edit a goal that is not his", False)
    except HTTPException as e:
        check("nor edit a goal that is not his", e.status_code == 404)


def test_nothing_leaks_into_the_business_books():
    print("\nSEPARATION — business is untouched")
    check("no personal record carries an org_id",
          run(mdb.pf_transactions.count_documents({"org_id": {"$exists": True}})) == 0)
    check("the business collections are empty of personal data",
          run(mdb.invoices.count_documents({})) == 0 and
          run(mdb.ledger_entries.count_documents({})) == 0 and
          run(mdb.payments.count_documents({})) == 0)
    check("and every personal record is keyed to a person",
          run(mdb.pf_transactions.count_documents({"user_id": {"$exists": True}})) ==
          run(mdb.pf_transactions.count_documents({})))


def test_an_account_in_use_cannot_vanish():
    print("\ndeleting an account that has history")
    try:
        run(server.pf_delete_account(SAV, ALICE))
        check("it is refused", False, "the account was deleted")
    except HTTPException as e:
        check("it is refused", e.status_code == 409)
        check("and says to archive instead", "Archive" in str(e.detail))


def test_the_report_adds_up():
    print("\nreport")
    rep = run(server.pf_report("2026-11-01", "2026-11-30", ALICE))
    check("it covers the period", rep["from"] == "2026-11-01")
    check("income and expenses are there", rep["income"] > 0 and rep["expenses"] > 0)
    check("savings is the difference",
          rep["savings"] == round(rep["income"] - rep["expenses"], 2))
    check("net worth counts the loan", rep["net_worth"]["loan_outstanding"] > 0)
    check("and the transactions behind it are included", len(rep["transactions"]) > 0)


def test_importing_bank_messages():
    print("\nreading pasted bank messages")
    blob = ("Rs.1,250.00 debited from A/c XX4521 on 03-11-2026 to SWIGGY. Ref 998877665544\n\n"
            "123456 is your OTP for a txn of Rs.5,000. Do not share with anyone.")
    run(mdb.pf_accounts.update_one({"id": SAV}, {"$set": {"account_no": "000123454521"}}))
    res = run(server.pf_parse_messages(server.PFMessagesIn(text=blob), ALICE))
    check("the payment is read", res["counts"]["read"] == 1, str(res["counts"]))
    check("the OTP is not", res["counts"]["skipped"] == 1)
    row = res["parsed"][0]
    check("and matched to the right account", row["account_id"] == SAV, str(row["account_id"]))

    rows = [server.PFImportRow(**{k: v for k, v in row.items()
                                  if k in server.PFImportRow.model_fields})]
    first = run(server.pf_import_messages(server.PFImportIn(rows=rows), ALICE))
    check("importing saves it", first["imported"] == 1, str(first))

    again = run(server.pf_import_messages(server.PFImportIn(rows=rows), ALICE))
    check("pasting the same block again imports nothing",
          again["imported"] == 0 and again["skipped_duplicates"] == 1, str(again))


def main():
    for t in (test_accounts_and_balances, test_the_three_traps_end_to_end,
              test_a_transfer_to_itself_is_refused, test_a_loan_and_its_emi,
              test_paying_an_emi_advances_the_loan,
              test_a_recurring_payment_is_not_paid_twice,
              test_budgets_and_goals, test_one_persons_money_is_their_own,
              test_nothing_leaks_into_the_business_books,
              test_an_account_in_use_cannot_vanish, test_the_report_adds_up,
              test_importing_bank_messages):
        t()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
