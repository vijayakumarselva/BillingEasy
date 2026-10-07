"""Section 194Q — only the amount above 50 lakh is taxed."""
import os, sys, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
for k, v in {"MONGO_URL": "x", "DB_NAME": "t", "JWT_SECRET": "s", "SECRET_KEY": "s"}.items():
    os.environ.setdefault(k, v)

from mongomock_motor import AsyncMongoMockClient
from fastapi.testclient import TestClient
import server, tds194q as T

OK = []
def check(name, cond, extra=""):
    OK.append((name, bool(cond)))
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if not cond and extra else ""))

mdb = AsyncMongoMockClient()["t"]
server.db = mdb
async def _noop(*a, **k): return None
server.audit_log = _noop
server.app.router.on_startup.clear()
OWNER = {"id": "o1", "email": "o@n.in", "name": "V", "is_super_admin": True}
server.app.dependency_overrides[server.get_current_user] = lambda: OWNER
ORG = "org1"
H = {"X-Org-Id": ORG}
L = 100000        # one lakh


def test_the_maths():
    print("\nthe rule")
    r = T.compute(0, 220 * L)          # first bill, 2.2 crore
    check("the first 50 lakh is free", r["taxable_for_tds"] == 170 * L,
          str(r["taxable_for_tds"]))
    check("so 2.2 crore attracts 17,000, not 22,000", r["tds"] == 17000.0, str(r["tds"]))
    check("and it says what fell inside the free slice",
          r["exempt_in_this_bill"] == 50 * L)

    r = T.compute(0, 40 * L)
    check("a 40 lakh first bill attracts nothing", r["tds"] == 0 and not r["applicable"])
    check("with the remaining headroom reported", r["exempt_left"] == 10 * L)

    r = T.compute(40 * L, 20 * L)      # crosses mid-way
    check("the bill that crosses is taxed only on the part above",
          r["taxable_for_tds"] == 10 * L, str(r["taxable_for_tds"]))
    check("which is 1,000", r["tds"] == 1000.0)

    r = T.compute(220 * L, 100 * L)    # threshold already used up
    check("later bills are taxed in full", r["taxable_for_tds"] == 100 * L)
    check("at 10,000", r["tds"] == 10000.0)

    r = T.compute(0, 50 * L)
    check("exactly 50 lakh attracts nothing", r["tds"] == 0)
    r = T.compute(0, 50 * L + 1000)
    check("a rupee over is taxed on that rupee only", r["taxable_for_tds"] == 1000)

    check("no PAN means 5%", T.rate_for({"pan": "", "gstin": ""}) == 5.0)
    check("a GSTIN proves the PAN", T.rate_for({"gstin": "33AAJCN1847Q1Z4"}) == 0.1)


async def seed():
    await mdb.users.insert_one(dict(OWNER))
    await mdb.organizations.insert_one({"id": ORG, "name": "NammaHut", "owner_user_id": "o1",
                                        "gstin": "33AAJCN1847Q1Z4", "state": "Tamil Nadu",
                                        "state_code": "33"})
    await mdb.memberships.insert_one({"id": "m1", "user_id": "o1", "org_id": ORG, "role": "owner"})
    await server.ensure_system_roles(mdb, ORG)
    await mdb.subscriptions.insert_one({"account_id": "o1", "plan_code": "PRO_YEARLY",
                                        "status": "active", "addons": {},
                                        "current_period_end": "2099-01-01T00:00:00+00:00"})
    await mdb.parties.insert_one({"id": "sup1", "org_id": ORG, "name": "Sugar Mills Ltd",
                                  "type": "supplier", "gstin": "33CCCCC2222C1Z2",
                                  "state": "Tamil Nadu", "state_code": "33"})
    await mdb.products.insert_one({"id": "pr1", "org_id": ORG, "name": "Sugar 50KGS",
                                   "hsn": "17011490", "purchase_price": 2200, "gst_rate": 5,
                                   "stock": 0, "modes": ["b2b"]})
asyncio.run(seed())
c = TestClient(server.app)


def bill(qty, rate=2200):
    return c.post("/api/purchases", headers=H, json={
        "party_id": "sup1", "bill_no": f"B{qty}", "purchase_date": "2026-10-07",
        "type": "purchase", "tds_rate": 0.1, "tds_amount": 1,
        "items": [{"product_id": "pr1", "name": "Sugar 50KGS", "hsn": "17011490",
                   "qty": qty, "unit": "NOS", "rate": rate, "discount_pct": 0,
                   "gst_rate": 5}]})


def test_the_screenshot_case():
    print("\nthe bill from the screenshot")
    r = c.get("/api/purchases/vendor-ytd/sup1", headers=H, params={"current": 220 * L})
    d = r.json()
    check("a first-time seller has nothing before this bill", d["ytd_total"] == 0)
    check("but this bill does attract TDS", d["tds_applicable"] is True)
    check("on 1.7 crore, not 2.2", d["calc"]["taxable_for_tds"] == 170 * L,
          str(d["calc"]["taxable_for_tds"]))
    check("so 17,000", d["calc"]["tds"] == 17000.0, str(d["calc"]["tds"]))
    check("and the reason is in plain words", "free of TDS" in d["calc"]["reason"],
          d["calc"]["reason"])

    inv = bill(10000).json()     # 10,000 x 2,200 = 2.2 crore taxable
    check("saving the bill stores 17,000, whatever the browser sent",
          inv["tds_amount"] == 17000.0, str(inv["tds_amount"]))
    check("net payable is the bill less that",
          inv["net_payable"] == round(inv["totals"]["grand_total"] - 17000, 2),
          str(inv["net_payable"]))
    check("and the working is kept on the bill",
          inv["tds_calc"]["taxable_for_tds"] == 170 * L)


def test_the_second_bill():
    print("\nthe next bill from the same seller")
    r = c.get("/api/purchases/vendor-ytd/sup1", headers=H, params={"current": 100 * L})
    d = r.json()
    check("the year-to-date now excludes GST", d["ytd_total"] == 220 * L,
          str(d["ytd_total"]))
    check("the free slice is gone", d["calc"]["exempt_left"] == 0)
    check("so the whole bill is taxed", d["calc"]["taxable_for_tds"] == 100 * L)
    inv = bill(5000, 2000).json()        # 1 crore
    check("which is 10,000", inv["tds_amount"] == 10000.0, str(inv["tds_amount"]))


def test_editing_does_not_double_count():
    print("\nediting a bill")
    pur = asyncio.run(mdb.purchases.find_one({"bill_no": "B10000"}, {"_id": 0}))
    r = c.get("/api/purchases/vendor-ytd/sup1", headers=H,
              params={"current": 220 * L, "exclude_id": pur["id"]})
    check("the bill being edited is left out of its own year-to-date",
          r.json()["ytd_total"] == 100 * L, str(r.json()["ytd_total"]))

    r = c.put(f"/api/purchases/{pur['id']}", headers=H, json={
        "party_id": "sup1", "bill_no": "B10000", "purchase_date": "2026-10-07",
        "type": "purchase", "tds_rate": 0.1, "tds_amount": 99999,
        "items": [{"product_id": "pr1", "name": "Sugar 50KGS", "hsn": "17011490",
                   "qty": 10000, "unit": "NOS", "rate": 2200, "discount_pct": 0,
                   "gst_rate": 5}]})
    check("an edit recomputes rather than trusting what was sent",
          r.json()["tds_amount"] != 99999, str(r.json()["tds_amount"]))


def test_below_threshold_seller():
    print("\na small seller")
    asyncio.run(mdb.parties.insert_one({"id": "sup2", "org_id": ORG, "name": "Small Traders",
                                        "type": "supplier", "gstin": "33DDDDD3333D1Z1",
                                        "state_code": "33", "state": "Tamil Nadu"}))
    r = c.get("/api/purchases/vendor-ytd/sup2", headers=H, params={"current": 30 * L})
    d = r.json()
    check("no TDS below the threshold", d["tds_applicable"] is False)
    check("and the headroom is shown", d["calc"]["exempt_left"] == 20 * L)
    inv = c.post("/api/purchases", headers=H, json={
        "party_id": "sup2", "bill_no": "S1", "purchase_date": "2026-10-07",
        "type": "purchase", "tds_rate": 0.1, "tds_amount": 3000,
        "items": [{"product_id": "pr1", "name": "Sugar", "hsn": "17011490", "qty": 1500,
                   "unit": "NOS", "rate": 2000, "discount_pct": 0, "gst_rate": 5}]}).json()
    check("so nothing is deducted even if the browser asked for it",
          inv["tds_amount"] == 0.0, str(inv["tds_amount"]))
    check("and the supplier is paid in full",
          inv["net_payable"] == inv["totals"]["grand_total"])


def main():
    test_the_maths()
    test_the_screenshot_case()
    test_the_second_bill()
    test_editing_does_not_double_count()
    test_below_threshold_seller()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
