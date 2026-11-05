"""Reading bank messages.

Every message below is in the shape an Indian bank actually sends. A parser
that quietly invents an amount is worse than one that skips a line, so the
tests care as much about what is refused as about what is read.
"""
import os, sys
from datetime import date
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
import sms_parse as S

OK = []
def check(name, cond, extra=""):
    OK.append((name, bool(cond)))
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if not cond and extra else ""))

TODAY = date(2026, 11, 5)
P = lambda t: S.parse_message(t, today=TODAY)


def test_a_plain_debit():
    print("\nHDFC-style debit")
    r = P("Rs.1,250.00 debited from A/c XX4521 on 03-11-26 to SWIGGY. UPI Ref 412398765432.")
    check("the amount is read with its grouping", r["amount"] == 1250.0, str(r["amount"]))
    check("it is money going out", r["kind"] == "expense")
    check("the date is read", r["date"] == "2026-11-03", r["date"])
    check("the account's last digits are kept", r["account_tail"] == "4521", r["account_tail"])
    check("the merchant is named", r["merchant"].upper().startswith("SWIGGY"), r["merchant"])
    check("and categorised from it", r["category"] == "Food & Dining", r["category"])
    check("the reference is kept", r["reference"] == "412398765432", r["reference"])


def test_a_salary_credit():
    print("\nsalary")
    r = P("Your A/c XX4521 is credited with INR 85,000.00 on 01-Nov-26 by SALARY NOV.")
    check("money coming in", r["kind"] == "income")
    check("the amount", r["amount"] == 85000.0, str(r["amount"]))
    check("a text month is understood", r["date"] == "2026-11-01", r["date"])
    check("and it is salary", r["category"] == "Salary", r["category"])


def test_a_card_spend():
    print("\ncredit card")
    r = P("INR 2,499.00 spent on your HDFC Bank Card x9012 at AMAZON on 02-11-2026.")
    check("spending is an expense", r["kind"] == "expense")
    check("the card's digits are the account", r["account_tail"] == "9012", r["account_tail"])
    check("shopping", r["category"] == "Shopping", r["category"])


def test_an_emi():
    print("\nan EMI")
    r = P("Rs 10497.30 debited from A/c XX4521 towards EMI for Loan A/c 60123456 on 05-11-26.")
    check("it is recognised as an EMI", r["is_emi"] is True)
    check("and categorised as one", r["category"] == "EMI & Loan Payments", r["category"])
    check("with the instalment amount", r["amount"] == 10497.30, str(r["amount"]))


def test_rent_and_bills():
    print("\nthe monthly ones")
    rent = P("Rs.25,000 debited from A/c XX4521 on 07-11-26 towards RENT NOV. Ref 889900112233")
    check("rent", rent["category"] == "Home Rent", rent["category"])
    power = P("INR 2,340.00 paid to BESCOM on 08-11-26 from A/c XX4521.")
    check("electricity", power["category"] == "Electricity & Water", power["category"])
    fuel = P("Rs 3,000.00 spent at INDIAN OIL on 09-11-26 Card x9012")
    check("fuel", fuel["category"] == "Fuel & Travel", fuel["category"])


def test_what_must_be_refused():
    print("\nwhat is NOT a transaction")
    check("an OTP is not a payment",
          P("123456 is your OTP for a txn of Rs.5,000. Do not share with anyone.") is None)
    check("a balance alert is not a payment",
          P("Your A/c XX4521 available balance is Rs.1,70,000.00 as on 05-11-26.") is None)
    check("a statement notice is not a payment",
          P("Your credit card statement is ready. Minimum amount due Rs.2,500.") is None)
    check("a line with no amount is skipped",
          P("Dear customer, your account has been updated.") is None)
    check("a line with no direction is skipped",
          P("Rs.500.00 towards something at some place") is None)


def test_an_unreadable_date_falls_back_to_today():
    print("\na message with no date")
    r = P("Rs.700.00 debited from A/c XX4521 at CAFE COFFEE DAY")
    check("today is used rather than guessing", r["date"] == "2026-11-05", r["date"])


def test_splitting_a_paste():
    print("\nsplitting what someone pastes in")
    blob = """Rs.1,250.00 debited from A/c XX4521 on 03-11-26 to SWIGGY.

Your A/c XX4521 is credited with INR 85,000.00 on 01-Nov-26 by SALARY NOV.
Rs 10497.30 debited from A/c XX4521 towards EMI for Loan A/c 60123456 on 05-11-26."""
    msgs = S.split_messages(blob)
    check("three messages are found", len(msgs) == 3, str(len(msgs)))


def test_the_whole_paste():
    print("\nthe whole paste, matched up")
    accounts = [{"id": "sav", "name": "HDFC Savings", "account_no": "000123454521"},
                {"id": "card", "name": "HDFC Card", "account_no": "4000111122229012"}]
    loans = [{"id": "l1", "name": "Car Loan", "lender": "HDFC", "emi": 10497.30}]
    blob = """Rs.1,250.00 debited from A/c XX4521 on 03-11-26 to SWIGGY.

Your A/c XX4521 is credited with INR 85,000.00 on 01-Nov-26 by SALARY NOV.

INR 2,499.00 spent on your HDFC Bank Card x9012 at AMAZON on 02-11-2026.

Rs 10497.30 debited from A/c XX4521 towards EMI for Loan A/c 60123456 on 05-11-26.

123456 is your OTP for a txn of Rs.5,000. Do not share with anyone."""
    res = S.parse_blob(blob, accounts=accounts, loans=loans, today=TODAY)
    check("four transactions read", res["counts"]["read"] == 4, str(res["counts"]))
    check("the OTP is set aside, not imported", res["counts"]["skipped"] == 1)
    check("and shown so nothing vanishes silently", len(res["unparsed"]) == 1)
    check("income and expenses are counted apart",
          res["counts"]["income"] == 1 and res["counts"]["expense"] == 3, str(res["counts"]))
    check("totals add up", res["total_in"] == 85000.0 and res["total_out"] == 14246.3,
          f'{res["total_in"]} / {res["total_out"]}')

    by_amt = {r["amount"]: r for r in res["parsed"]}
    check("the savings account is matched by its last digits",
          by_amt[1250.0]["account_id"] == "sav", str(by_amt[1250.0]["account_id"]))
    check("the card is matched to the card", by_amt[2499.0]["account_id"] == "card")
    check("and the EMI is matched to the right loan",
          by_amt[10497.30]["loan_id"] == "l1", str(by_amt[10497.30]["loan_id"]))


def test_an_ambiguous_account_is_left_for_the_user():
    print("\nwhen two accounts end the same way")
    accounts = [{"id": "a", "name": "One", "account_no": "111114521"},
                {"id": "b", "name": "Two", "account_no": "999994521"}]
    r = S.parse_blob("Rs.100.00 debited from A/c XX4521 on 03-11-26 to SHOP.",
                     accounts=accounts, today=TODAY)
    check("neither is picked", r["parsed"][0]["account_id"] == "")
    check("and it is counted as needing one", r["counts"]["needs_account"] == 1)


def test_a_loan_is_only_matched_on_a_real_signal():
    print("\nloan matching is conservative")
    loans = [{"id": "l1", "name": "Car Loan", "lender": "HDFC", "emi": 10497.30}]
    plain = S.parse_blob("Rs.10497.30 debited from A/c XX4521 on 05-11-26 to SOMEONE.",
                         loans=loans, today=TODAY)
    check("an ordinary payment of the same amount is not an EMI",
          plain["parsed"][0]["loan_id"] == "", str(plain["parsed"][0]))
    two = [{"id": "l1", "name": "A", "lender": "X", "emi": 5000.0},
           {"id": "l2", "name": "B", "lender": "Y", "emi": 5000.0}]
    tie = S.parse_blob("Rs.5000.00 debited towards EMI on 05-11-26 from A/c XX1111",
                       loans=two, today=TODAY)
    check("two loans with the same EMI are left unmatched",
          tie["parsed"][0]["loan_id"] == "")


def main():
    for t in (test_a_plain_debit, test_a_salary_credit, test_a_card_spend, test_an_emi,
              test_rent_and_bills, test_what_must_be_refused,
              test_an_unreadable_date_falls_back_to_today, test_splitting_a_paste,
              test_the_whole_paste, test_an_ambiguous_account_is_left_for_the_user,
              test_a_loan_is_only_matched_on_a_real_signal):
        t()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
