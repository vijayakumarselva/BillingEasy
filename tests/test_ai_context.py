"""The AI assistant must answer from the books, not point at a screen."""
import os, sys, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
for k, v in {"MONGO_URL": "x", "DB_NAME": "t", "JWT_SECRET": "s", "SECRET_KEY": "s"}.items():
    os.environ.setdefault(k, v)

from mongomock_motor import AsyncMongoMockClient
import server

OK = []
def check(name, cond, extra=""):
    OK.append((name, bool(cond)))
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if not cond and extra else ""))

mdb = AsyncMongoMockClient()["t"]
server.db = mdb
ORG = "org1"

ROWS = [
    ("2026-04-05", "NEFT CR SOUTH INDIA TRADERS PVT LTD", 0, 250000, True),
    ("2026-05-11", "IMPS SOUTH INDIA TRADERS PART PAYMENT", 0, 90000, False),
    ("2026-05-20", "RTGS DR NORTHERN MILLS", 185000, 0, False),
    ("2026-06-02", "UPI DR FUEL HPCL", 4200, 0, False),
    ("2026-06-18", "NEFT CR ACME EXPORTS", 0, 500000, False),
]

async def seed():
    await mdb.organizations.insert_one({
        "id": ORG, "name": "NammaHut Services", "gstin": "33AAAAA0000A1Z5",
        "state_code": "33", "owner_user_id": "o1"})
    await mdb.bank_accounts.insert_one({
        "id": "hdfc", "org_id": ORG, "bank_name": "HDFC", "account_no": "50200089193962"})
    await mdb.bank_statement_rows.insert_many([
        {"id": f"r{i}", "org_id": ORG, "bank_account_id": "hdfc", "date": d,
         "description": desc, "debit": dr, "credit": cr, "balance": 0,
         "matched": m, "match_ref": "INV-2026-0007" if m else None,
         "superseded": False}
        for i, (d, desc, dr, cr, m) in enumerate(ROWS)])
    # An older upload that has been replaced — must never be answered from.
    await mdb.bank_statement_rows.insert_one({
        "id": "old", "org_id": ORG, "bank_account_id": "hdfc", "date": "2026-01-01",
        "description": "NEFT CR SOUTH INDIA TRADERS OLD UPLOAD", "debit": 0,
        "credit": 999999, "balance": 0, "matched": False, "superseded": True})
    await mdb.parties.insert_one({
        "id": "p1", "org_id": ORG, "name": "South India Traders Pvt Ltd",
        "gstin": "33BBBBB1111B1Z5", "phone": "9876500000", "role": "customer",
        "state": "Tamil Nadu"})
    await mdb.invoices.insert_one({
        "id": "i1", "org_id": ORG, "type": "sale", "invoice_no": "INV-2026-0007",
        "invoice_date": "2026-04-01", "party_snapshot": {"name": "South India Traders Pvt Ltd"},
        "totals": {"grand_total": 250000}, "balance_due": 0})
    await mdb.payments.insert_one({
        "id": "pay1", "org_id": ORG, "party_name": "South India Traders Pvt Ltd",
        "amount": 250000, "mode": "neft", "payment_date": "2026-04-05",
        "invoice_no": "INV-2026-0007", "type": "receipt"})
    await mdb.products.insert_one({
        "id": "pr1", "org_id": ORG, "name": "Cotton Bedsheet 90x100",
        "sale_price": 1200, "stock": 40, "gst_rate": 5, "hsn": "6302"})
asyncio.run(seed())


def test_terms():
    print("\nreading the question")
    t = server._ai_search_terms("any incoming payment from the statement un the name of south india")
    check("it pulls the name out", "south" in t and "india" in t)
    check("and keeps the pair together", "south india" in t, str(t))
    check("it drops the filler words",
          not any(w in t for w in ("any", "payment", "statement", "name", "from")), str(t))
    check("a question with no name searches nothing useful",
          _no_names(server._ai_search_terms("how much gst do i owe this month")), 
          str(server._ai_search_terms("how much gst do i owe this month")))


def _no_names(terms):
    return all(t in ("gst", "owe") or " " in t for t in terms)


def test_bank_context():
    print("\nbank statement in the snapshot")
    ctx = asyncio.run(server._build_business_context(
        ORG, "any incoming payment from the statement in the name of south india"))
    bank = ctx["bank_statement"]
    check("the statement is in the context", bank["uploaded"] is True)
    check("it knows how many rows are on screen", bank["rows_on_screen"] == 5, str(bank))
    check("the replaced upload is excluded", bank["total_money_in"] == 840000,
          str(bank["total_money_in"]))
    check("it found the South India rows", bank["matching_row_count"] == 2,
          str(bank["matching_rows"]))
    hits = bank["matching_rows"]
    check("both are money in", all(h["money_in"] > 0 for h in hits))
    check("with the real amounts", sorted(h["money_in"] for h in hits) == [90000, 250000])
    check("and the dates", any(h["date"] == "2026-04-05" for h in hits))
    check("the matched one says which invoice",
          any(h["matched_to"] == "INV-2026-0007" for h in hits))
    check("the stale upload is not among them",
          not any(h["money_in"] == 999999 for h in hits))
    check("it says what it searched for", "south india" in bank["searched_for"])
    check("the account is named", "HDFC" in bank["accounts"][0])

    check("the customer was found too",
          ctx["matching_parties"][0]["name"].startswith("South India"))
    check("with their invoice", ctx["their_invoices"][0]["invoice_no"] == "INV-2026-0007")
    check("and the receipt against it", ctx["matching_payments"][0]["amount"] == 250000)


def test_no_match_and_other_questions():
    print("\nwhen there is nothing to find")
    ctx = asyncio.run(server._build_business_context(ORG, "payments from Kerala Spices"))
    check("an unknown name returns no rows rather than wrong ones",
          ctx["bank_statement"]["matching_row_count"] == 0)
    check("but it still reports what it looked for",
          "kerala" in ctx["bank_statement"]["searched_for"])
    check("and the statement totals are still there",
          ctx["bank_statement"]["total_money_in"] == 840000)

    ctx = asyncio.run(server._build_business_context(ORG, "what are my biggest receipts"))
    check("the biggest credits are always offered",
          ctx["bank_statement"]["largest_money_in"][0]["money_in"] == 500000)
    check("so are the most recent rows",
          len(ctx["bank_statement"]["most_recent_rows"]) == 5)

    ctx = asyncio.run(server._build_business_context(ORG, "do I have cotton bedsheet in stock"))
    check("products are searchable too",
          ctx["matching_products"][0]["stock"] == 40, str(ctx.get("matching_products")))


def test_empty_org():
    print("\nan account with no statement")
    asyncio.run(mdb.organizations.insert_one({"id": "org2", "name": "Fresh Co",
                                              "state_code": "33", "owner_user_id": "o2"}))
    ctx = asyncio.run(server._build_business_context("org2", "any payment from south india"))
    check("it says plainly that nothing is uploaded",
          ctx["bank_statement"]["uploaded"] is False)
    check("with a note the assistant can repeat",
          "uploaded" in ctx["bank_statement"]["note"].lower())


def test_scoping():
    print("\nscoping")
    asyncio.run(mdb.bank_statement_rows.insert_one({
        "id": "other", "org_id": "org2", "bank_account_id": "x", "date": "2026-07-01",
        "description": "NEFT CR SOUTH INDIA SOMEONE ELSE", "debit": 0, "credit": 1,
        "balance": 0, "matched": False, "superseded": False}))
    ctx = asyncio.run(server._build_business_context(ORG, "south india payments"))
    check("another business's rows never leak in",
          all(h["money_in"] != 1 for h in ctx["bank_statement"]["matching_rows"]))


def test_permissions():
    """The assistant must not read out what the signed-in role cannot open."""
    print("\nthe assistant respects the role")
    kitchen = {"dining.kitchen", "product.view"}
    ctx = asyncio.run(server._build_business_context(
        ORG, "any payment from south india", may=kitchen))
    check("a kitchen login gets no bank statement",
          ctx["bank_statement"]["uploaded"] is False)
    check("and is told why", "role" in ctx["bank_statement"]["note"].lower())
    check("no sales figures either", "sales_last_30d" not in ctx)
    check("no customer list", "matching_parties" not in ctx)
    check("no invoices", "their_invoices" not in ctx)
    check("no receipts", "matching_payments" not in ctx)
    ctx2 = asyncio.run(server._build_business_context(
        ORG, "do we have cotton bedsheet", may=kitchen))
    check("but it can still look up a dish or product",
          ctx2.get("matching_products", [{}])[0].get("stock") == 40)

    floor = {"dining.floor", "invoice.view", "party.view", "payment.view", "product.view"}
    ctx3 = asyncio.run(server._build_business_context(
        ORG, "any payment from south india", may=floor))
    check("a floor manager who handles payments does see the statement",
          ctx3["bank_statement"]["matching_row_count"] == 2)
    check("but still no purchase figures", "expenses_last_30d" not in ctx3)

    owner = {"*"}
    ctx4 = asyncio.run(server._build_business_context(
        ORG, "any payment from south india", may=owner))
    check("the owner sees everything",
          ctx4["bank_statement"]["matching_row_count"] == 2
          and "expenses_last_30d" in ctx4 and "sales_last_30d" in ctx4)


def main():
    test_terms()
    test_bank_context()
    test_no_match_and_other_questions()
    test_empty_org()
    test_scoping()
    test_permissions()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
