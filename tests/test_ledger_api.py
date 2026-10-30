"""The ledger wired into the application.

test_ledger.py proves the arithmetic. This proves the plumbing: that saving a
document posts an entry, that cancelling one removes it, and that a rebuild
over existing books produces a trial balance that balances.
"""
import os, sys, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
for k, v in {"MONGO_URL": "x", "DB_NAME": "t", "JWT_SECRET": "s", "SECRET_KEY": "s"}.items():
    os.environ.setdefault(k, v)

from mongomock_motor import AsyncMongoMockClient
import server
import ledger as L

OK = []
def check(name, cond, extra=""):
    OK.append((name, bool(cond)))
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if not cond and extra else ""))

mdb = AsyncMongoMockClient()["t"]
server.db = mdb
C = L.SYSTEM_CODES
run = asyncio.run

USER = {"id": "u1", "email": "owner@test.in", "name": "Owner"}
CTX = {"user": USER, "org_id": "org1", "role": "owner", "permissions": ["*"],
       "allowed_modes": [], "biz_type": "b2b", "entity_id": None, "entity": None,
       "request": None}

INV = {"id": "inv1", "org_id": "org1", "invoice_no": "INV-1", "type": "sale",
       "status": "finalized", "invoice_date": "2026-10-07", "party_id": "c1",
       "party_snapshot": {"name": "A Customer"},
       "totals": {"taxable_amount": 100000.0, "cgst": 9000.0, "sgst": 9000.0,
                  "igst": 0, "grand_total": 118000.0}}
PUR = {"id": "pur1", "org_id": "org1", "bill_no": "B-1", "type": "purchase",
       "purchase_date": "2026-10-07", "party_id": "s1",
       "party_snapshot": {"name": "A Supplier"},
       "totals": {"taxable_amount": 50000.0, "cgst": 4500.0, "sgst": 4500.0,
                  "igst": 0, "grand_total": 59000.0}}
PAY = {"id": "pay1", "org_id": "org1", "payment_date": "2026-10-08", "party_id": "c1",
       "direction": "received", "amount": 18000.0, "method": "upi",
       "bank_account_id": "bank1", "ref_no": "R-1"}
EXP = {"id": "exp1", "org_id": "org1", "date": "2026-10-09", "amount": 1180.0,
       "gst_amount": 180.0, "category": "Internet", "method": "cash"}


async def seed():
    await mdb.organizations.insert_one({"id": "org1", "name": "Test Co", "state_code": "33"})
    await mdb.bank_accounts.insert_one({"id": "bank1", "org_id": "org1", "bank_name": "HDFC",
                                        "account_no": "000123456789", "opening_balance": 100000.0})
    await mdb.parties.insert_many([
        {"id": "c1", "org_id": "org1", "name": "A Customer", "type": "customer", "opening_balance": 0},
        {"id": "s1", "org_id": "org1", "name": "A Supplier", "type": "supplier", "opening_balance": 0}])
run(seed())


def test_the_chart_of_accounts_includes_each_bank():
    print("\nchart of accounts")
    accts = run(server.ledger_accounts("org1"))
    codes = {a["code"] for a in accts}
    check("the defaults are there", C["sales"] in codes and C["receivable"] in codes)
    check("and each bank account is its own ledger account",
          L.bank_code_for("bank1") in codes)
    named = next(a for a in accts if a["code"] == L.bank_code_for("bank1"))
    check("named so an owner recognises it", "HDFC" in named["name"] and "6789" in named["name"],
          named["name"])


def test_saving_a_document_posts_it():
    print("\nposting")
    run(server.post_document("invoice", INV, "org1"))
    e = run(mdb.ledger_entries.find_one({"source_id": "inv1"}, {"_id": 0}))
    check("an invoice reaches the ledger", e is not None)
    check("as a sales voucher", e and e["voucher_type"] == "sales")

    run(server.post_document("purchase", PUR, "org1"))
    run(server.post_document("payment", PAY, "org1"))
    run(server.post_document("expense", EXP, "org1"))
    n = run(mdb.ledger_entries.count_documents({"org_id": "org1"}))
    check("so do bills, receipts and expenses", n == 4, str(n))


def test_posting_twice_does_not_double_the_books():
    print("\nediting a document")
    run(server.post_document("invoice", INV, "org1"))
    run(server.post_document("invoice", INV, "org1"))
    n = run(mdb.ledger_entries.count_documents({"source_id": "inv1"}))
    check("re-saving replaces its entry rather than adding another", n == 1, str(n))

    bigger = {**INV, "totals": {**INV["totals"], "grand_total": 236000.0,
                                "taxable_amount": 200000.0, "cgst": 18000.0, "sgst": 18000.0}}
    run(server.post_document("invoice", bigger, "org1"))
    e = run(mdb.ledger_entries.find_one({"source_id": "inv1"}, {"_id": 0}))
    rec = next(l for l in e["lines"] if l["account"] == C["receivable"])
    check("and the new figures are what stand", rec["debit"] == 23600000, str(rec["debit"]))
    run(server.post_document("invoice", INV, "org1"))     # back to the original


def test_a_draft_or_cancelled_bill_is_not_an_accounting_event():
    print("\nwhat should never post")
    run(server.post_document("invoice", {**INV, "id": "inv2", "status": "draft"}, "org1"))
    check("a draft posts nothing",
          run(mdb.ledger_entries.count_documents({"source_id": "inv2"})) == 0)
    run(server.post_document("invoice", {**INV, "id": "inv3", "type": "quotation"}, "org1"))
    check("nor does a quotation",
          run(mdb.ledger_entries.count_documents({"source_id": "inv3"})) == 0)
    run(server.post_document("invoice", {**INV, "status": "cancelled"}, "org1"))
    check("and cancelling one takes its entry away",
          run(mdb.ledger_entries.count_documents({"source_id": "inv1"})) == 0)
    run(server.post_document("invoice", INV, "org1"))     # restore


def test_the_books_balance_after_a_rebuild():
    print("\nrebuild over existing documents")
    run(mdb.invoices.insert_one(dict(INV)))
    run(mdb.purchases.insert_one(dict(PUR)))
    run(mdb.payments.insert_one(dict(PAY)))
    run(mdb.expenses.insert_one(dict(EXP)))
    # A manual journal must survive the rebuild.
    manual = L.build_entry("org1", "2026-10-10",
                           [L.line("1600", debit_p=500000), L.line(C["capital"], credit_p=500000)],
                           voucher_type="journal", source_type="manual", source_id="m1")
    run(mdb.ledger_entries.insert_one(dict(manual)))

    res = run(server.rebuild_ledger(CTX))
    check("the rebuild reports success", res["ok"])
    check("it posted the invoice", res["posted"]["invoices"] == 1, str(res["posted"]))
    check("the bill, receipt and expense too",
          res["posted"]["purchases"] == 1 and res["posted"]["payments"] == 1
          and res["posted"]["expenses"] == 1, str(res["posted"]))
    check("opening balances were laid down", res["posted"]["opening"] == 1)
    check("nothing was skipped", res["posted"]["skipped"] == 0, str(res["problems"]))
    check("THE TRIAL BALANCE BALANCES", res["balanced"], f'off by {res["difference"]}')
    check("and the manual journal survived",
          run(mdb.ledger_entries.count_documents({"source_type": "manual"})) == 1)
    check("no document was harmed",
          run(mdb.invoices.count_documents({})) == 1 and run(mdb.payments.count_documents({})) == 1)


def test_running_it_again_changes_nothing():
    print("\nidempotence")
    before = run(mdb.ledger_entries.count_documents({"org_id": "org1"}))
    res = run(server.rebuild_ledger(CTX))
    after = run(mdb.ledger_entries.count_documents({"org_id": "org1"}))
    check("a second rebuild gives the same ledger", before == after, f"{before} then {after}")
    check("and it still balances", res["balanced"])


def test_the_reports_read_from_it():
    print("\nreports")
    tb = run(server.ledger_trial_balance("", CTX))
    check("the trial balance balances", tb["balanced"], f'off by {tb["difference"]}')
    check("and shows real rows", len(tb["rows"]) >= 6, str(len(tb["rows"])))

    pl = run(server.ledger_pl("2026-04-01", "2027-03-31", CTX))
    # Sales 1,00,000 − purchases 50,000 − expense 1,000 = 49,000
    check("profit and loss is derived from the ledger",
          pl["net_profit"] == 49000.0, str(pl["net_profit"]))

    bs = run(server.ledger_balance_sheet("", CTX))
    check("the balance sheet balances", bs["balanced"], f'off by {bs["difference"]}')

    bank = run(server.ledger_bank_book("bank1", "", "", CTX))
    # ₹1,00,000 opening + ₹18,000 received
    check("the bank balance finally moves when money arrives",
          bank["closing"] == 118000.0, str(bank["closing"]))

    jr = run(server.ledger_journal("", "", 200, CTX))
    check("the day book lists the entries", jr["count"] >= 5, str(jr["count"]))
    check("with account names, not just codes",
          all("account_name" in l for e in jr["entries"] for l in e["lines"]))


def test_a_manual_journal_must_balance():
    print("\nmanual entries")
    from fastapi import HTTPException
    good = server.JournalIn(date="2026-10-11", narration="Depreciation",
                            lines=[server.JournalLineIn(account="5300", debit=1000),
                                   server.JournalLineIn(account="1600", credit=1000)])
    r = run(server.create_journal(good, CTX))
    check("a balanced journal is accepted", r["ok"] and r["total"] == 1000.0)
    bad = server.JournalIn(date="2026-10-11", lines=[
        server.JournalLineIn(account="5300", debit=1000),
        server.JournalLineIn(account="1600", credit=900)])
    try:
        run(server.create_journal(bad, CTX))
        check("an unbalanced one is refused", False, "it was accepted")
    except HTTPException as e:
        check("an unbalanced one is refused", e.status_code == 400 and "balance" in str(e.detail))
    tb = run(server.ledger_trial_balance("", CTX))
    check("the books still balance afterwards", tb["balanced"])


def test_the_old_report_screens_switch_over():
    print("\nthe existing Reports page")
    tb = run(server.trial_balance(CTX))
    check("trial balance now comes from the ledger", tb.get("source") == "ledger", str(tb.get("source")))
    check("and it balances", tb.get("balanced"), f'off by {tb.get("difference")}')

    bs = run(server.balance_sheet(CTX))
    check("so does the balance sheet", bs.get("source") == "ledger")
    bank = next((a for a in bs["assets"] if "HDFC" in a["name"]), None)
    check("and Cash & Bank is no longer frozen at the opening figure",
          bank and bank["amount"] == 118000.0, str(bank))

    pl = run(server.pl_report(None, CTX))
    # ₹49,000 of trading, less the ₹1,000 depreciation journal posted above —
    # which is the point: a manual entry moves the profit, as it should.
    check("profit and loss too", pl.get("source") == "ledger" and pl["profit"] == 48000.0,
          str(pl.get("profit")))


def test_a_business_with_no_ledger_still_sees_its_reports():
    print("\nbooks that have not been built yet")
    other = {**CTX, "org_id": "org2"}
    run(mdb.organizations.insert_one({"id": "org2", "name": "No Ledger Co"}))
    tb = run(server.trial_balance(other))
    check("the old computation still answers", tb.get("source") != "ledger")
    bs = run(server.balance_sheet(other))
    check("and the balance sheet does not break", "assets" in bs)


def main():
    for t in (test_the_chart_of_accounts_includes_each_bank,
              test_saving_a_document_posts_it,
              test_posting_twice_does_not_double_the_books,
              test_a_draft_or_cancelled_bill_is_not_an_accounting_event,
              test_the_books_balance_after_a_rebuild,
              test_running_it_again_changes_nothing,
              test_the_reports_read_from_it,
              test_a_manual_journal_must_balance,
              test_the_old_report_screens_switch_over,
              test_a_business_with_no_ledger_still_sees_its_reports):
        t()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
