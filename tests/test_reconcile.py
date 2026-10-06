"""Turning bank lines into real entries — and taking them back."""
import os, sys, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
for k, v in {"MONGO_URL": "x", "DB_NAME": "t", "JWT_SECRET": "s", "SECRET_KEY": "s"}.items():
    os.environ.setdefault(k, v)

from mongomock_motor import AsyncMongoMockClient
from fastapi.testclient import TestClient
import server, reconcile as R

OK = []
def check(name, cond, extra=""):
    OK.append((name, bool(cond)))
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if not cond and extra else ""))

mdb = AsyncMongoMockClient()["t"]
server.db = mdb
async def _noop(*a, **k): return None
server.audit_log = _noop
server.app.router.on_startup.clear()
OWNER = {"id": "o1", "email": "owner@nh.in", "name": "Vijay", "is_super_admin": True}
server.app.dependency_overrides[server.get_current_user] = lambda: OWNER
ORG = "org1"
H = {"X-Org-Id": ORG}

LINES = [
    ("r1", "2026-09-30", "UPI-SUDHARSAN R-SUDHARSAN6116-1@OKSBI-SBI-HPCL FUEL", 600, 0),
    ("r2", "2026-09-30", "UPI-SUDHARSAN R-SUDHARSAN6116-1@OKSBI-SBI-HPCL FUEL", 29000, 0),
    ("r3", "2026-09-29", "RTGS DR-UTIB0001196-JK INDIA EAGRITECH LIMITED", 1346916, 0),
    ("r4", "2026-09-30", "RTGS CR-ICIC0000011-TATA CAPITAL LIMITED-NAM", 0, 2893092),
    ("r5", "2026-09-28", "NEFT CR-ACME TRADERS PVT LTD", 0, 118000),
    ("r6", "2026-09-27", "BY TRANSFER TO SELF A/C SWEEP", 50000, 0),
    ("r7", "2026-09-26", "SMS CHG 300916 TO 300926", 23.60, 0),
]

async def seed():
    await mdb.users.insert_one(dict(OWNER))
    await mdb.organizations.insert_one({
        "id": ORG, "name": "NammaHut Services", "owner_user_id": "o1",
        "gstin": "33AAAAA0000A1Z9", "state": "Tamil Nadu", "state_code": "33"})
    await mdb.memberships.insert_one({"id": "m1", "user_id": "o1", "org_id": ORG, "role": "owner"})
    await server.ensure_system_roles(mdb, ORG)
    await mdb.subscriptions.insert_one({"account_id": "o1", "plan_code": "PRO_YEARLY",
                                        "status": "active", "addons": {},
                                        "current_period_end": "2099-01-01T00:00:00+00:00"})
    await mdb.bank_accounts.insert_one({"id": "hdfc", "org_id": ORG, "bank_name": "HDFC",
                                        "account_no": "50200089193962"})
    await mdb.bank_statement_rows.insert_many([
        {"id": i, "org_id": ORG, "bank_account_id": "hdfc", "date": d, "description": desc,
         "debit": dr, "credit": cr, "balance": 0, "matched": False, "superseded": False}
        for i, d, desc, dr, cr in LINES])
    await mdb.parties.insert_one({"id": "pa1", "org_id": ORG, "name": "Acme Traders Pvt Ltd",
                                  "gstin": "33BBBBB1111B1ZU", "state_code": "33",
                                  "type": "customer"})
    # An invoice already raised, waiting to be paid.
    await mdb.invoices.insert_one({
        "id": "inv1", "org_id": ORG, "type": "sale", "invoice_no": "INV-2026-0042",
        "invoice_date": "2026-09-20", "party_id": "pa1",
        "party_snapshot": {"name": "Acme Traders Pvt Ltd", "gstin": "33BBBBB1111B1ZU",
                           "state_code": "33"},
        "totals": {"grand_total": 118000}, "balance_due": 118000, "status": "finalized",
        "amount_received": 0, "items": []})
asyncio.run(seed())
c = TestClient(server.app)


def test_reading_narrations():
    print("\nreading a bank narration")
    check("the bank's noise is stripped",
          R.clean_narration("RTGS DR-UTIB0001196-JK INDIA EAGRITECH LIMITED")
          == "JK INDIA EAGRITECH LIMITED",
          R.clean_narration("RTGS DR-UTIB0001196-JK INDIA EAGRITECH LIMITED"))
    check("a UPI handle gives up the payer",
          R.name_guess("UPI-SUDHARSAN R-SUDHARSAN6116-1@OKSBI-SBI").lower().startswith("sudharsan"),
          R.name_guess("UPI-SUDHARSAN R-SUDHARSAN6116-1@OKSBI-SBI"))
    check("fuel is recognised", R.hint_for("HPCL PETROL")["category"] == "Fuel")
    check("bank charges are recognised", R.hint_for("SMS CHG 300916")["category"] == "Bank charges")
    check("a sweep is a transfer, not a cost",
          R.hint_for("BY TRANSFER TO SELF A/C SWEEP")["kind"] == R.KIND_TRANSFER)
    k1 = R.rule_key("UPI-SUDHARSAN R-SUDHARSAN6116-1@OKSBI-SBI 600")
    k2 = R.rule_key("UPI-SUDHARSAN R-SUDHARSAN6116-1@OKSBI-SBI 29000")
    check("two payments to the same person share a rule key", k1 == k2 and k1, f"{k1} vs {k2}")


def test_party_match_is_not_fooled_by_common_words():
    print("\nmatching the right business")
    check("a shared 'Traders' is not a match",
          R.same_party("Karthikeyan Traders", "Vrishabh Traders") is False)
    check("nor Pvt Ltd", R.same_party("Alpha Pvt Ltd", "Beta Pvt Ltd") is False)
    check("but a real name is", R.same_party("Acme Traders Pvt Ltd", "ACME TRADERS") is True)
    check("even partially", R.same_party("JK India Eagritech Limited", "Eagritech") is True)
    check("generic words are stripped from a name",
          R.distinctive_words("Sri Vrishabh Traders Pvt Ltd") == ["VRISHABH"],
          str(R.distinctive_words("Sri Vrishabh Traders Pvt Ltd")))

    asyncio.run(mdb.parties.insert_one({"id": "pa9", "org_id": ORG,
                                        "name": "Vrishabh Traders", "type": "supplier"}))
    asyncio.run(mdb.bank_statement_rows.insert_one({
        "id": "r9", "org_id": ORG, "bank_account_id": "hdfc", "date": "2026-09-20",
        "description": "RTGS DR-ICIC0001910-KARTHIKEYAN TRADERS-NETBANK",
        "debit": 2000000, "credit": 0, "matched": False, "superseded": False}))
    q = c.get("/api/reconcile/queue", headers=H).json()
    row = next(x for x in q["rows"] if x["id"] == "r9")
    check("an unrelated supplier is not offered",
          "VRISHABH" not in (row["suggestion"].get("party_name") or "").upper(),
          str(row["suggestion"]))
    check("the narration name is still offered to create",
          "KARTHIKEYAN" in row["suggestion"]["name_guess"].upper(),
          row["suggestion"]["name_guess"])


def test_queue_suggests():
    print("\nthe queue suggests what each line is")
    r = c.get("/api/reconcile/queue", headers=H)
    check("the queue loads", r.status_code == 200, r.text[:200])
    d = r.json()
    globals()["QUEUE_AT_START"] = d["total"]
    check("every unmatched line is there", d["total"] >= 7, str(d["total"]))
    by = {x["id"]: x for x in d["rows"]}
    check("money out offers expense, not sale",
          "expense" in by["r1"]["suggestion"]["choices"]
          and "sale" not in by["r1"]["suggestion"]["choices"])
    check("money in offers sale and receipt",
          set(by["r4"]["suggestion"]["choices"]) >= {"sale", "receipt"})
    check("fuel is suggested as an expense",
          by["r1"]["suggestion"]["kind"] == "expense"
          and by["r1"]["suggestion"]["category"] == "Fuel")
    check("bank charges too", by["r7"]["suggestion"]["category"] == "Bank charges")
    check("a sweep is suggested as a transfer", by["r6"]["suggestion"]["kind"] == "transfer")
    check("a known customer is spotted from the narration",
          by["r5"]["suggestion"]["party_name"] == "Acme Traders Pvt Ltd",
          str(by["r5"]["suggestion"]))
    check("and offered as a receipt", by["r5"]["suggestion"]["kind"] == "receipt")
    check("a hint that cannot apply to money in is dropped",
          by["r4"]["suggestion"]["kind"] in by["r4"]["suggestion"]["choices"],
          str(by["r4"]["suggestion"]))
    check("rather than leaving an impossible choice",
          by["r4"]["suggestion"]["kind"] != "expense")
    check("the amount is read off the right column",
          by["r4"]["suggestion"]["amount"] == 2893092 and by["r4"]["suggestion"]["direction"] == "in")


def test_expense():
    print("\nrecording an expense")
    r = c.post("/api/reconcile/r1", headers=H,
               json={"kind": "expense", "category": "Fuel", "remember": True})
    check("it records", r.status_code == 200, r.text[:300])
    exp = asyncio.run(mdb.expenses.find_one({"bank_row_id": "r1"}, {"_id": 0}))
    check("an expense exists", exp and exp["amount"] == 600, str(exp)[:120])
    check("with the category and date", exp["category"] == "Fuel" and exp["date"] == "2026-09-30")
    check("and it knows where it came from", exp["source"] == "bank_statement")
    row = asyncio.run(mdb.bank_statement_rows.find_one({"id": "r1"}, {"_id": 0}))
    check("the statement line is ticked off", row["matched"] is True)
    check("and says what it became", "Fuel" in row["match_ref"])

    q = c.get("/api/reconcile/queue", headers=H).json()
    check("it leaves the queue", q["total"] == QUEUE_AT_START - 1,
          f'{q["total"]} vs {QUEUE_AT_START - 1}')
    nxt = {x["id"]: x for x in q["rows"]}["r2"]
    check("the remembered rule fills in the next one like it",
          nxt["suggestion"]["confidence"] == "high"
          and nxt["suggestion"]["category"] == "Fuel", str(nxt["suggestion"]))
    check("and says it is from a past decision", "before" in nxt["suggestion"]["reason"])


def test_receipt_against_invoice():
    print("\nmoney in against an invoice already raised")
    r = c.get("/api/reconcile/open-documents", headers=H,
              params={"direction": "in", "amount": 118000})
    docs = r.json()["documents"]
    check("the open invoice is offered", docs[0]["ref"] == "INV-2026-0042", str(docs)[:150])
    check("with its balance", docs[0]["due"] == 118000)

    r = c.post("/api/reconcile/r5", headers=H,
               json={"kind": "receipt", "document_id": "inv1"})
    check("the receipt records", r.status_code == 200, r.text[:300])
    inv = asyncio.run(mdb.invoices.find_one({"id": "inv1"}, {"_id": 0}))
    check("the invoice is now paid", inv["status"] == "paid" and inv["balance_due"] == 0)
    check("and shows the money received", inv["amount_received"] == 118000)
    pay = asyncio.run(mdb.payments.find_one({"bank_row_id": "r5"}, {"_id": 0}))
    check("a receipt exists against it",
          pay and pay["invoice_id"] == "inv1" and pay["amount"] == 118000)
    check("paid into the right bank account", pay["bank_account_id"] == "hdfc")
    row = asyncio.run(mdb.bank_statement_rows.find_one({"id": "r5"}, {"_id": 0}))
    check("the line points at the invoice",
          row["match_type"] == "invoice" and row["match_ref"] == "INV-2026-0042")


def test_purchase_creates_supplier():
    print("\nmoney out to a supplier with no bill entered")
    r = c.post("/api/reconcile/r3", headers=H,
               json={"kind": "purchase", "party_name": "JK India Eagritech Limited",
                     "category": "Raw material"})
    check("the bill records", r.status_code == 200, r.text[:300])
    pur = asyncio.run(mdb.purchases.find_one({"bank_row_id": "r3"}, {"_id": 0}))
    check("a purchase exists", pur and pur["totals"]["grand_total"] == 1346916)
    check("marked paid, because the money has gone", pur["status"] == "paid"
          and pur["balance_due"] == 0)
    party = asyncio.run(mdb.parties.find_one({"name": "JK India Eagritech Limited"}, {"_id": 0}))
    check("the supplier was created", party and party["type"] == "supplier")
    check("and linked to the bill", pur["party_id"] == party["id"])


def test_sale_and_transfer_and_ignore():
    print("\nthe rest of the choices")
    r = c.post("/api/reconcile/r4", headers=H,
               json={"kind": "sale", "party_name": "Tata Capital Limited",
                     "category": "Services"})
    check("money in with no invoice raises one", r.status_code == 200, r.text[:300])
    inv = asyncio.run(mdb.invoices.find_one({"bank_row_id": "r4"}, {"_id": 0}))
    check("the invoice exists and is paid",
          inv and inv["status"] == "paid" and inv["totals"]["grand_total"] == 2893092)

    r = c.post("/api/reconcile/r6", headers=H, json={"kind": "transfer"})
    check("a transfer records", r.status_code == 200, r.text[:200])
    check("as a transfer, not a cost",
          asyncio.run(mdb.bank_transfers.count_documents({"bank_row_id": "r6"})) == 1)
    check("and no expense is created",
          asyncio.run(mdb.expenses.count_documents({"bank_row_id": "r6"})) == 0)

    r = c.post("/api/reconcile/r7", headers=H,
               json={"kind": "ignore", "note": "Personal"})
    check("a line can be hidden", r.json().get("ignored") is True)
    q = c.get("/api/reconcile/queue", headers=H).json()
    check("an ignored line leaves the queue",
          not any(x["id"] == "r7" for x in q["rows"]))


def test_wrong_direction_refused():
    print("\nguarding against nonsense")
    asyncio.run(mdb.bank_statement_rows.insert_one({
        "id": "r8", "org_id": ORG, "bank_account_id": "hdfc", "date": "2026-09-25",
        "description": "NEFT CR SOMEONE", "debit": 0, "credit": 5000, "matched": False,
        "superseded": False}))
    r = c.post("/api/reconcile/r8", headers=H, json={"kind": "expense", "category": "Fuel"})
    check("money in cannot be an expense", r.status_code == 400, str(r.status_code))
    check("and says so plainly", "money-in" in r.json()["detail"], r.json().get("detail"))
    r = c.post("/api/reconcile/r8", headers=H, json={"kind": "receipt"})
    check("a receipt without an invoice is refused", r.status_code == 400)
    check("naming what is missing", "invoice" in r.json()["detail"].lower())


def test_suspicious_sweep():
    print("\nspotting a wrong match after the fact")
    # Record a line against a party the bank never mentions.
    asyncio.run(mdb.bank_statement_rows.insert_one({
        "id": "r20", "org_id": ORG, "bank_account_id": "hdfc", "date": "2026-09-19",
        "description": "RTGS DR-ICIC0001910-KARTHIKEYAN TRADERS-NETBANK",
        "debit": 2000000, "credit": 0, "matched": False, "superseded": False}))
    c.post("/api/reconcile/r20", headers=H,
           json={"kind": "expense", "category": "Loan repayment",
                 "party_name": "Vrishabh Traders"})
    # And one with no party at all — a category is not a name and must not flag.
    asyncio.run(mdb.bank_statement_rows.insert_one({
        "id": "r21", "org_id": ORG, "bank_account_id": "hdfc", "date": "2026-09-18",
        "description": "UPI-OLA CABS-OLACABS@YBL", "debit": 380, "credit": 0,
        "matched": False, "superseded": False}))
    c.post("/api/reconcile/r21", headers=H, json={"kind": "expense", "category": "Travel"})

    d = c.get("/api/money/suspicious", headers=H).json()
    titles = [e["title"] for e in d["entries"]]
    check("the wrong party is caught", "Vrishabh Traders" in titles, str(titles))
    check("with the name the bank actually printed",
          any("KARTHIKEYAN" in (e["narration_name"] or "").upper() for e in d["entries"]),
          str(d["entries"])[:200])
    check("an expense with no party is not flagged", "Travel" not in titles, str(titles))
    check("and the bank line is offered so it can be redone",
          all(e["bank_row_id"] for e in d["entries"]), str(d["entries"])[:150])

    bad = next(e for e in d["entries"] if e["title"] == "Vrishabh Traders")
    c.post(f"/api/reconcile/{bad['bank_row_id']}/undo", headers=H)
    after = c.get("/api/money/suspicious", headers=H).json()
    check("redoing it clears the warning",
          "Vrishabh Traders" not in [e["title"] for e in after["entries"]])
    q = c.get("/api/reconcile/queue", headers=H).json()
    check("and the line is back to be explained",
          any(x["id"] == "r20" for x in q["rows"]))


def test_created_party_is_usable():
    """A party made from a bank line must behave like any other party."""
    print("\na party created from the statement")
    asyncio.run(mdb.bank_statement_rows.insert_one({
        "id": "r30", "org_id": ORG, "bank_account_id": "hdfc", "date": "2026-09-15",
        "description": "NEFT DR-SUNRISE POLYMERS", "debit": 75000, "credit": 0,
        "matched": False, "superseded": False}))
    c.post("/api/reconcile/r30", headers=H,
           json={"kind": "purchase", "party_name": "Sunrise Polymers",
                 "category": "Raw material"})
    made = asyncio.run(mdb.parties.find_one({"name": "Sunrise Polymers"}, {"_id": 0}))
    check("it is stored as a supplier under the real field",
          made and made.get("type") == "supplier", str(made)[:140])
    check("with a state, so GST can be worked out", bool(made.get("state_code")))
    r = c.get("/api/parties", headers=H)
    check("and the Parties list still loads", r.status_code == 200, r.text[:200])
    body = r.json()
    names = [p["name"] for p in (body["data"] if isinstance(body, dict) else body)]
    check("with the new supplier in it", "Sunrise Polymers" in names)


def test_undo():
    print("\nundo")
    r = c.post("/api/reconcile/r1/undo", headers=H)
    check("a mistake can be taken back", r.status_code == 200, r.text[:200])
    check("and the expense it made is gone",
          asyncio.run(mdb.expenses.count_documents({"bank_row_id": "r1"})) == 0)
    row = asyncio.run(mdb.bank_statement_rows.find_one({"id": "r1"}, {"_id": 0}))
    check("the line is back in the queue", row["matched"] is False)

    c.post("/api/reconcile/r5/undo", headers=H)
    inv = asyncio.run(mdb.invoices.find_one({"id": "inv1"}, {"_id": 0}))
    check("undoing a receipt removes the payment",
          asyncio.run(mdb.payments.count_documents({"bank_row_id": "r5"})) == 0)


def test_bulk_and_summary():
    print("\ndoing many at once")
    rows = [x["id"] for x in c.get("/api/reconcile/queue", headers=H,
                                   params={"direction": "out"}).json()["rows"]]
    r = c.post("/api/reconcile/bulk", headers=H, json={
        "row_ids": rows, "entry": {"kind": "expense", "category": "General"}})
    check("a batch records in one go", r.json()["recorded"] == len(rows), r.text[:200])

    s = c.get("/api/reconcile/summary", headers=H).json()
    check("the summary counts what is done", s["done"] >= 1)
    check("and what is left", s["left"] >= 0)
    check("progress is a percentage", 0 <= s["progress_pct"] <= 100)
    check("a remembered rule is listed", s["rules"] >= 1)
    rules = c.get("/api/reconcile/rules", headers=H).json()
    check("and readable", any(x["category"] == "Fuel" for x in rules), str(rules)[:150])


def main():
    test_reading_narrations()
    test_party_match_is_not_fooled_by_common_words()
    test_queue_suggests()
    test_expense()
    test_receipt_against_invoice()
    test_purchase_creates_supplier()
    test_sale_and_transfer_and_ignore()
    test_wrong_direction_refused()
    test_suspicious_sweep()
    test_created_party_is_usable()
    test_undo()
    test_bulk_and_summary()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
