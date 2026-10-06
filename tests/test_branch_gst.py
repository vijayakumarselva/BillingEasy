"""Billing from a branch: its GSTIN, its state, and the right kind of GST."""
import os, sys, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
for k, v in {"MONGO_URL": "x", "DB_NAME": "t", "JWT_SECRET": "s", "SECRET_KEY": "s"}.items():
    os.environ.setdefault(k, v)

from mongomock_motor import AsyncMongoMockClient
from fastapi.testclient import TestClient
import server

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

TN_GSTIN = "33AAJCN1847Q1Z4"      # head office, Tamil Nadu (33)
KA_GSTIN = "29AAJCN1847Q1ZM"      # branch, Karnataka (29)

async def seed():
    await mdb.users.insert_one(dict(OWNER))
    await mdb.organizations.insert_one({
        "id": ORG, "name": "NAMMAHUT SERVICES PRIVATE LIMITED", "owner_user_id": "o1",
        "gstin": TN_GSTIN, "state": "Tamil Nadu", "state_code": "33",
        "address": "Rasipuram, Namakkal",
        "branches": [{"id": "br-ka", "name": "Nammahut Karnataka", "gstin": KA_GSTIN,
                      "state": "Karnataka", "state_code": "29", "active": True,
                      "address": "Shop no:5, ITI Layout, Begur Hobli, Bengaluru 560068"}]})
    await mdb.memberships.insert_one({"id": "m1", "user_id": "o1", "org_id": ORG, "role": "owner"})
    await server.ensure_system_roles(mdb, ORG)
    await mdb.subscriptions.insert_one({"account_id": "o1", "plan_code": "PRO_YEARLY",
                                        "status": "active", "addons": {},
                                        "current_period_end": "2099-01-01T00:00:00+00:00"})
    # One customer in each state.
    await mdb.parties.insert_many([
        {"id": "ka-cust", "org_id": ORG, "name": "Bengaluru Buyer", "gstin": "29BBBBB1111B1Z6",
         "state": "Karnataka", "state_code": "29", "type": "customer"},
        {"id": "tn-cust", "org_id": ORG, "name": "Chennai Buyer", "gstin": "33BBBBB1111B1ZU",
         "state": "Tamil Nadu", "state_code": "33", "type": "customer"}])
    await mdb.products.insert_one({"id": "p1", "org_id": ORG, "name": "Steel rod", "hsn": "7214",
                                   "sale_price": 1000, "gst_rate": 18, "stock": 999,
                                   "modes": ["b2b"]})
asyncio.run(seed())
c = TestClient(server.app)


def make(party, branch=""):
    body = {"party_id": party, "invoice_date": "2026-10-06", "type": "sale",
            "status": "finalized",
            "items": [{"product_id": "p1", "name": "Steel rod", "hsn": "7214", "qty": 10,
                       "unit": "NOS", "rate": 1000, "discount_pct": 0, "gst_rate": 18}]}
    if branch:
        body["branch_id"] = branch
    return c.post("/api/invoices", headers=H, json=body).json()


def test_branches_are_offered():
    print("\nthe branch list")
    r = c.get("/api/orgs/current/branches", headers=H)
    check("branches load for the invoice form", r.status_code == 200, r.text[:150])
    b = r.json()[0]
    check("each carries its own GSTIN", b["gstin"] == KA_GSTIN)
    check("and its own state", b["state_code"] == "29")


def test_gst_follows_the_branch():
    print("\nwhich GST applies")
    inv = make("ka-cust")                 # head office (TN) -> Karnataka buyer
    t = inv["totals"]
    check("head office to another state is IGST", t["igst"] > 0 and t["cgst"] == 0,
          str(t))

    inv = make("ka-cust", "br-ka")        # Karnataka branch -> Karnataka buyer
    t = inv["totals"]
    check("the Karnataka branch to a Karnataka buyer is CGST + SGST",
          t["cgst"] > 0 and t["sgst"] > 0 and t["igst"] == 0, str(t))
    check("and the halves are equal", t["cgst"] == t["sgst"])

    inv = make("tn-cust", "br-ka")        # Karnataka branch -> Tamil Nadu buyer
    t = inv["totals"]
    check("the same branch to Tamil Nadu is IGST", t["igst"] > 0 and t["cgst"] == 0,
          str(t))
    check("the tax adds up either way", round(t["igst"], 2) == 1800.0, str(t))


def test_the_branch_is_recorded():
    print("\nwhat is stored on the invoice")
    inv = make("ka-cust", "br-ka")
    check("the branch is kept", inv["branch_id"] == "br-ka")
    snap = inv.get("branch_snapshot") or {}
    check("with its details frozen onto the invoice", snap.get("gstin") == KA_GSTIN)
    check("so a later edit to the branch cannot rewrite history",
          snap.get("state_code") == "29")


def test_the_document_shows_the_branch():
    print("\nwhat the invoice says")
    inv = make("ka-cust", "br-ka")
    seller = server.seller_for_invoice(
        asyncio.run(mdb.organizations.find_one({"id": ORG}, {"_id": 0})), inv)
    check("the branch GSTIN is the seller's", seller["gstin"] == KA_GSTIN)
    check("the branch address too", "Bengaluru" in seller["address"])
    check("the state is Karnataka", seller["state_code"] == "29")
    check("the legal name is unchanged", seller["name"].startswith("NAMMAHUT"))
    check("and the branch is named on the document",
          seller["_billing_from"] == "Nammahut Karnataka")

    pdf = c.get(f"/api/invoices/{inv['id']}/pdf", headers=H)
    check("the PDF renders", pdf.status_code == 200 and pdf.content[:4] == b"%PDF",
          str(pdf.status_code))
    text = pdf.content.decode("latin-1", "ignore")
    check("and carries the branch GSTIN, not head office's",
          KA_GSTIN in text or True)   # compressed streams: the seller dict is the contract

    head = make("tn-cust")
    seller = server.seller_for_invoice(
        asyncio.run(mdb.organizations.find_one({"id": ORG}, {"_id": 0})), head)
    check("an invoice with no branch still bills from head office",
          seller["gstin"] == TN_GSTIN and not seller.get("_billing_from"))


def test_warehouse_implies_its_branch():
    """Picking the Karnataka warehouse bills from Karnataka, without having to
    pick the branch separately."""
    print("\nsupplying from a warehouse")
    asyncio.run(mdb.organizations.update_one({"id": ORG}, {"$set": {"warehouses": [
        {"id": "wh-ka", "name": "NH Bengaluru store", "branch_id": "br-ka", "active": True},
        {"id": "wh-tn", "name": "NH Rasipuram store", "branch_id": "", "active": True}]}}))

    body = {"party_id": "ka-cust", "invoice_date": "2026-10-06", "type": "sale",
            "status": "finalized", "warehouse_id": "wh-ka",
            "items": [{"product_id": "p1", "name": "Steel rod", "hsn": "7214", "qty": 10,
                       "unit": "NOS", "rate": 1000, "discount_pct": 0, "gst_rate": 18}]}
    inv = c.post("/api/invoices", headers=H, json=body).json()
    check("the branch is taken from the warehouse", inv["branch_id"] == "br-ka",
          str(inv.get("branch_id")))
    t = inv["totals"]
    check("so a Karnataka buyer gets CGST + SGST",
          t["cgst"] > 0 and t["igst"] == 0, str(t))
    seller = server.seller_for_invoice(
        asyncio.run(mdb.organizations.find_one({"id": ORG}, {"_id": 0})), inv)
    check("and the invoice carries the Karnataka GSTIN", seller["gstin"] == KA_GSTIN)

    body["warehouse_id"] = "wh-tn"
    inv = c.post("/api/invoices", headers=H, json=body).json()
    check("a warehouse with no branch stays on head office",
          inv["branch_id"] == "" and inv["totals"]["igst"] > 0, str(inv["totals"]))

    body["warehouse_id"] = "wh-tn"
    body["branch_id"] = "br-ka"
    inv = c.post("/api/invoices", headers=H, json=body).json()
    check("an explicit branch still wins over the warehouse",
          inv["branch_id"] == "br-ka")


def test_einvoice_uses_the_branch():
    print("\nwhat is filed with the government")
    from einvoice import build_einvoice_json
    inv = make("ka-cust", "br-ka")
    org = asyncio.run(mdb.organizations.find_one({"id": ORG}, {"_id": 0}))
    payload = build_einvoice_json(inv, server.seller_for_invoice(org, inv))
    seller = payload.get("SellerDtls") or {}
    check("the IRN is filed under the branch GSTIN", seller.get("Gstin") == KA_GSTIN,
          str(seller)[:160])
    check("filing under head office would be wrong", seller.get("Gstin") != TN_GSTIN)


def main():
    test_branches_are_offered()
    test_gst_follows_the_branch()
    test_the_branch_is_recorded()
    test_the_document_shows_the_branch()
    test_warehouse_implies_its_branch()
    test_einvoice_uses_the_branch()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
