"""Ageing, and the credit limit nobody was checking.

`credit_limit` has sat on the party record since early on, shown in the
Parties table and the edit form, and read by precisely nothing. A customer at
twice their limit could be invoiced again without a murmur.
"""
import os, sys, asyncio
from datetime import date
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
for k, v in {"MONGO_URL": "x", "DB_NAME": "t", "JWT_SECRET": "s", "SECRET_KEY": "s"}.items():
    os.environ.setdefault(k, v)

from mongomock_motor import AsyncMongoMockClient
from fastapi import HTTPException
import server
import receivables as R

OK = []
def check(name, cond, extra=""):
    OK.append((name, bool(cond)))
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if not cond and extra else ""))

mdb = AsyncMongoMockClient()["t"]
server.db = mdb
run = asyncio.run
TODAY = date(2026, 11, 2)

CTX = {"user": {"id": "u1"}, "org_id": "org1", "role": "owner", "permissions": ["*"],
       "allowed_modes": [], "biz_type": "b2b", "entity_id": None, "entity": None, "request": None}


def test_the_buckets_are_the_ones_accountants_use():
    print("\nageing buckets")
    check("a bill not yet due is current", R.bucket_for(-5) == "current")
    check("one day late is in the first bucket", R.bucket_for(1) == "d0_30")
    check("thirty days is still the first", R.bucket_for(30) == "d0_30")
    check("thirty-one tips into the next", R.bucket_for(31) == "d31_60")
    check("ninety-one is the tail", R.bucket_for(91) == "d90_plus")
    check("days overdue counts from the due date",
          R.days_overdue("2026-10-03", TODAY) == 30, str(R.days_overdue("2026-10-03", TODAY)))


def test_ageing_adds_up():
    print("\na customer with four unpaid bills")
    docs = [
        {"id": "1", "party_id": "c1", "party_name": "A", "ref": "INV-1",
         "invoice_date": "2026-10-28", "due_date": "2026-11-27", "outstanding": 10000},
        {"id": "2", "party_id": "c1", "party_name": "A", "ref": "INV-2",
         "invoice_date": "2026-10-01", "due_date": "2026-10-15", "outstanding": 20000},
        {"id": "3", "party_id": "c1", "party_name": "A", "ref": "INV-3",
         "invoice_date": "2026-08-01", "due_date": "2026-08-20", "outstanding": 30000},
        {"id": "4", "party_id": "c2", "party_name": "B", "ref": "INV-4",
         "invoice_date": "2026-05-01", "due_date": "2026-05-30", "outstanding": 40000},
    ]
    rep = R.age_documents(docs, today=TODAY)
    a = next(r for r in rep["rows"] if r["party_id"] == "c1")
    check("a bill still within terms is current", a["current"] == 10000, str(a["current"]))
    check("eighteen days late lands in 1–30", a["d0_30"] == 20000, str(a["d0_30"]))
    check("seventy-four days late lands in 61–90", a["d61_90"] == 30000, str(a["d61_90"]))
    check("the party total is the sum of its buckets", a["total"] == 60000)
    check("and the oldest is reported", a["oldest_days"] == 74, str(a["oldest_days"]))
    check("the worst payer sorts first", rep["rows"][0]["party_id"] == "c2")
    check("the grand total is everything unpaid", rep["total_outstanding"] == 100000)
    check("overdue excludes what is not yet due",
          rep["overdue_total"] == 90000, str(rep["overdue_total"]))
    check("every bucket is accounted for",
          round(sum(rep["totals"].values()), 2) == rep["total_outstanding"])


def test_a_bill_with_no_due_date_uses_the_credit_period():
    print("\nterms that were never set on the document")
    docs = [{"id": "1", "party_id": "c1", "ref": "INV-1",
             "invoice_date": "2026-10-01", "due_date": "", "outstanding": 5000}]
    strict = R.age_documents(docs, today=TODAY, credit_days={"c1": 0})
    check("with no credit period it is 32 days late",
          strict["rows"][0]["d31_60"] == 5000, str(strict["rows"][0]))
    lenient = R.age_documents(docs, today=TODAY, credit_days={"c1": 45})
    check("with 45 days agreed it is not due yet",
          lenient["rows"][0]["current"] == 5000, str(lenient["rows"][0]))


def test_settled_bills_are_not_chased():
    print("\nwhat should never appear")
    docs = [{"id": "1", "party_id": "c1", "ref": "A", "invoice_date": "2026-01-01",
             "due_date": "2026-01-01", "outstanding": 0},
            {"id": "2", "party_id": "c1", "ref": "B", "invoice_date": "2026-01-01",
             "due_date": "2026-01-01", "outstanding": 0.3}]
    rep = R.age_documents(docs, today=TODAY)
    check("a paid bill is gone", not rep["rows"])
    check("and so is rounding dust", rep["total_outstanding"] == 0)


def test_the_credit_verdict():
    print("\nshould we sell to them again?")
    ok = R.credit_status(outstanding=10000, credit_limit=100000, new_amount=5000)
    check("well inside the limit is fine", ok["level"] == "ok" and ok["ok"])

    near = R.credit_status(outstanding=88000, credit_limit=100000, new_amount=5000)
    check("close to it says so without blocking",
          near["level"] == "near_limit" and near["ok"])

    over = R.credit_status(outstanding=98000, credit_limit=100000, new_amount=5000)
    check("past it is flagged", over["level"] == "over_limit" and not over["ok"])
    check("and says by how much", over["over_by"] == 3000, str(over["over_by"]))
    check("in words a salesperson can repeat", "past a credit limit" in over["message"])

    late = R.credit_status(outstanding=50000, credit_limit=0, oldest_overdue=15)
    check("no limit set still warns on an overdue bill", late["level"] == "overdue")
    worse = R.credit_status(outstanding=50000, credit_limit=0, oldest_overdue=120, credit_days=30)
    check("badly overdue is its own level", worse["level"] == "badly_overdue")


async def seed():
    await mdb.organizations.insert_one({"id": "org1", "name": "Test Co", "state_code": "33"})
    await mdb.parties.insert_many([
        {"id": "c1", "org_id": "org1", "name": "Tight Customer", "type": "customer",
         "credit_limit": 50000, "credit_days": 30, "opening_balance": 0},
        {"id": "c2", "org_id": "org1", "name": "Blocked Customer", "type": "customer",
         "credit_limit": 10000, "credit_days": 0, "block_over_limit": True, "opening_balance": 0},
    ])
    await mdb.invoices.insert_one({
        "id": "i1", "org_id": "org1", "type": "sale", "status": "finalized",
        "invoice_no": "INV-1", "party_id": "c1", "invoice_date": "2026-09-01",
        "due_date": "2026-10-01", "party_snapshot": {"name": "Tight Customer"},
        "totals": {"grand_total": 45000, "taxable_amount": 45000, "cgst": 0, "sgst": 0, "igst": 0}})
run(seed())


def test_the_report_reads_real_documents():
    print("\nthe ageing endpoint")
    rep = run(server.ageing_report("receivable", CTX))
    row = rep["rows"][0]
    check("the unpaid invoice is listed", row["party_id"] == "c1" and row["total"] == 45000)
    check("with the customer's name", row["party_name"] == "Tight Customer")
    check("their limit travels with the row", row["credit_limit"] == 50000)
    check("and the invoice can be drilled into", row["documents"][0]["ref"] == "INV-1")
    try:
        run(server.ageing_report("nonsense", CTX))
        check("an unknown kind is refused", False)
    except HTTPException as e:
        check("an unknown kind is refused", e.status_code == 400)


def test_credit_status_endpoint_sees_the_outstanding_bill():
    print("\nasking before raising an invoice")
    st = run(server.party_credit_status("c1", 10000, "", CTX))
    check("their exposure includes the new sale", st["exposure"] == 55000, str(st["exposure"]))
    check("which is over the ₹50,000 limit", st["level"] == "over_limit")
    check("but it does not block, because nobody asked it to", st["blocking"] is False)
    st2 = run(server.party_credit_status("c1", 10000, "i1", CTX))
    check("excluding the invoice being edited drops the exposure",
          st2["exposure"] == 10000, str(st2["exposure"]))


def test_a_blocked_customer_is_actually_blocked():
    print("\nblock_over_limit, the deliberate setting")
    st = run(server.party_credit_status("c2", 20000, "", CTX))
    check("over their ₹10,000 limit", st["level"] == "over_limit")
    check("and this one does block", st["blocking"] is True)


def test_the_statement_runs_a_balance():
    print("\nthe customer's own account")
    run(mdb.payments.insert_one({"id": "p1", "org_id": "org1", "party_id": "c1",
                                 "direction": "received", "amount": 15000,
                                 "payment_date": "2026-10-05", "ref_no": "R-1"}))
    stm = run(server.party_statement("c1", CTX))
    check("the invoice is a debit", stm["rows"][0]["debit"] == 45000)
    check("the receipt is a credit", stm["rows"][1]["credit"] == 15000)
    check("and the closing balance is what is still owed",
          stm["closing"] == 30000, str(stm["closing"]))
    check("the customer's terms are on it", stm["party"]["credit_days"] == 30)


def main():
    for t in (test_the_buckets_are_the_ones_accountants_use, test_ageing_adds_up,
              test_a_bill_with_no_due_date_uses_the_credit_period,
              test_settled_bills_are_not_chased, test_the_credit_verdict,
              test_the_report_reads_real_documents,
              test_credit_status_endpoint_sees_the_outstanding_bill,
              test_a_blocked_customer_is_actually_blocked,
              test_the_statement_runs_a_balance):
        t()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
