"""End-to-end API tests for the subscription, checkout and admin endpoints."""
import os, sys, asyncio, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
for k, v in {"MONGO_URL": "mongodb://localhost:27017", "DB_NAME": "t",
             "JWT_SECRET": "test-secret", "SECRET_KEY": "test-secret"}.items():
    os.environ.setdefault(k, v)

from mongomock_motor import AsyncMongoMockClient
from fastapi.testclient import TestClient
import server, pricing as P, subscriptions as S

OK = []
def check(name, cond, extra=""):
    OK.append((name, bool(cond)))
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if not cond and extra else ""))

mdb = AsyncMongoMockClient()["t"]
server.db = mdb
async def _noop(*a, **k): return None
server.audit_log = _noop
server.app.router.on_startup.clear()

OWNER = {"id": "owner1", "email": "owner@test.in", "name": "Vijay", "is_super_admin": True}
STAFF = {"id": "staff1", "email": "staff@test.in", "name": "Abhishek"}
ORG = "org1"
CURRENT = {"u": OWNER}
server.app.dependency_overrides[server.get_current_user] = lambda: CURRENT["u"]


async def seed():
    await mdb.users.insert_many([dict(OWNER), dict(STAFF)])
    await mdb.organizations.insert_one({
        "id": ORG, "name": "NammaHut Services", "owner_user_id": "owner1",
        "state": "Tamil Nadu", "state_code": "33", "gstin": "33AAAAA0000A1Z5",
        "created_at": "2026-01-01T00:00:00+00:00", "business_type": "b2b"})
    await mdb.memberships.insert_many([
        {"id": "m1", "user_id": "owner1", "org_id": ORG, "role": "owner"},
        {"id": "m2", "user_id": "staff1", "org_id": ORG, "role": "manager"}])
    await server.ensure_system_roles(mdb, ORG)

asyncio.run(seed())
c = TestClient(server.app)
H = {"X-Org-Id": ORG}


def test_public_pricing():
    print("\npublic pricing")
    r = c.get("/api/pricing")
    check("pricing is public", r.status_code == 200, r.text[:200])
    d = r.json()
    check("four tiers", len(d["tiers"]) == 4)
    biz = next(t for t in d["tiers"] if t["tier"] == "BUSINESS")
    check("Business ₹2,499/year", biz["yearly_label"] == "₹2,499")
    check("Business ₹299/month", biz["monthly_label"] == "₹299")
    check("Most Popular badge", biz["badge"] == "Most Popular")
    check("yearly saving is advertised", d["max_yearly_save_pct"] >= 25)
    check("founding counter starts at 500", d["founding"]["spots_left"] == 500)
    check("founding price is ₹1,999", d["founding"]["label_price"] == "₹1,999")
    check("packs are listed", len(d["packs"]) == 3)
    check("14-day trial advertised", d["trial_days"] == 14)


def test_subscription_view():
    print("\nsubscription view")
    r = c.get("/api/subscription", headers=H)
    check("subscription loads", r.status_code == 200, r.text[:300])
    d = r.json()
    check("a new account is on Free", d["plan"]["tier"] == "FREE")
    check("Free allows one business", d["limits"]["businesses"] == 1)
    check("usage is reported", d["usage"]["businesses"] == 1)
    check("credits are split plan vs purchased", set(d["credits"]) >= {"plan", "pack", "total"})
    check("a referral code is issued", len(d["referral_code"]) >= 6)


def test_feature_gating():
    print("\nfeature gating (server-side)")
    r = c.get("/api/gst/gstr1", headers=H)
    check("Free cannot pull GSTR-1", r.status_code == 402, f"{r.status_code}")
    d = r.json()["detail"]
    check("the error is machine-readable", d["code"] == P.ERR_FEATURE)
    check("it names the plan that unlocks it", d["suggested_plan_name"] == "Starter")
    check("and its price", d["suggested_plan_paise"] == 149900)

    r = c.get("/api/gst/gstr3b", headers=H)
    check("GSTR-3B is gated too", r.status_code == 402)


def test_quote_and_checkout():
    print("\nquote + checkout")
    r = c.post("/api/billing/quote", headers=H, json={"plan_code": "BUSINESS_YEARLY"})
    check("quote works", r.status_code == 200, r.text[:300])
    q = r.json()
    check("founding price is applied automatically", q["base_paise"] == 199900)
    check("GST is 18% on the discounted amount", q["gst_paise"] == P.gst_on(199900))
    check("total includes GST", q["total_paise"] == 199900 + P.gst_on(199900))
    check("total is labelled in rupees", q["total_label"] == "₹2,358.82")

    r = c.post("/api/billing/checkout", headers=H, json={"plan_code": "BUSINESS_YEARLY"})
    check("checkout starts a payment", r.status_code == 200, r.text[:300])
    co = r.json()
    check("nothing is active before payment",
          c.get("/api/subscription", headers=H).json()["plan"]["tier"] == "FREE")
    check("mock gateway is used when no keys are set", co["mock"] is True)
    return co["order_id"]


def test_activation(order_id):
    print("\nactivation")
    r = c.post(f"/api/billing/verify/{order_id}", headers=H)
    check("payment verifies", r.status_code == 200 and r.json()["status"] == "paid", r.text[:200])
    inv_no = r.json().get("tax_invoice_no")
    check("a GST tax invoice is raised", bool(inv_no), str(r.json()))

    d = c.get("/api/subscription", headers=H).json()
    check("the plan is now Business", d["plan"]["tier"] == "BUSINESS")
    check("the account is a founding member", d["founding_member"] is True)
    check("Business grants 1,000 AI credits", d["credits"]["plan"] == 1000)
    check("renewal is a year away", 363 <= d["days_left"] <= 366)
    check("GSTR is unlocked", c.get("/api/gst/gstr1", headers=H).status_code == 200)
    check("5 businesses allowed", d["limits"]["businesses"] == 5)

    # replaying the same payment must not double-apply
    r2 = c.post(f"/api/billing/verify/{order_id}", headers=H)
    d2 = c.get("/api/subscription", headers=H).json()
    check("re-verifying is idempotent",
          r2.json().get("already") is True and d2["credits"]["plan"] == 1000)

    invs = c.get("/api/billing/invoices", headers=H).json()
    check("the invoice is in billing history", len(invs) == 1)
    inv = invs[0]
    check("our GSTIN is the supplier", inv["seller"]["name"].startswith("Nammahut"))
    check("the customer's GSTIN is captured", inv["buyer"]["gstin"] == "33AAAAA0000A1Z5")
    check("SAC 998314", inv["items"][0]["sac"] == "998314")
    check("same state -> CGST + SGST, no IGST",
          inv["totals"]["cgst_paise"] > 0 and inv["totals"]["igst_paise"] == 0)
    check("tax adds up",
          inv["totals"]["cgst_paise"] + inv["totals"]["sgst_paise"] == P.gst_on(199900))
    check("invoice number is a proper series", "/" in inv["invoice_no"])

    pdf = c.get(f"/api/billing/invoices/{inv['id']}/pdf", headers=H)
    check("the tax invoice downloads as a PDF",
          pdf.status_code == 200 and pdf.content[:4] == b"%PDF", str(pdf.status_code))
    return inv


def test_credit_packs():
    print("\ncredit packs")
    before = c.get("/api/subscription", headers=H).json()["credits"]["pack"]
    r = c.post("/api/billing/checkout", headers=H,
               json={"kind": "pack", "pack_code": "PACK_500"})
    check("a pack can be bought", r.status_code == 200, r.text[:200])
    oid = r.json()["order_id"]
    check("pack price is ₹399 + GST",
          r.json()["amount_paise"] == 39900 + P.gst_on(39900))
    c.post(f"/api/billing/verify/{oid}", headers=H)
    after = c.get("/api/subscription", headers=H).json()["credits"]
    check("500 credits land in the purchased bucket", after["pack"] == before + 500)
    check("plan credits are untouched", after["plan"] == 1000)


def test_addons():
    print("\nadd-ons")
    r = c.post("/api/billing/checkout", headers=H,
               json={"kind": "addon", "addon_code": "EXTRA_BUSINESS", "quantity": 2})
    check("extra businesses can be bought", r.status_code == 200, r.text[:200])
    check("2 × ₹499 + GST", r.json()["amount_paise"] == 99800 + P.gst_on(99800))
    c.post(f"/api/billing/verify/{r.json()['order_id']}", headers=H)
    d = c.get("/api/subscription", headers=H).json()
    check("the cap rises to 7", d["limits"]["businesses"] == 7)

    r = c.post("/api/billing/quote", headers=H,
               json={"kind": "addon", "addon_code": "EXTRA_USER", "quantity": 1})
    check("extra users are available on Business", r.status_code == 200, r.text[:200])


def test_coupons():
    print("\ncoupons")
    r = c.post("/api/super/coupons", json={
        "code": "diwali25", "kind": "percent", "value": 25,
        "applies_to": ["plan", "pack"], "usage_cap": 2, "per_account_cap": 1,
        "description": "Diwali 2026"})
    check("a coupon can be created", r.status_code == 200, r.text[:200])
    check("the code is normalised to upper case", r.json()["code"] == "DIWALI25")

    r = c.post("/api/billing/quote", headers=H,
               json={"kind": "pack", "pack_code": "PACK_1000", "coupon": "DIWALI25"})
    q = r.json()
    check("25% comes off the pack", q["discount_paise"] == round(69900 * 0.25))
    check("GST is charged on the discounted amount",
          q["gst_paise"] == P.gst_on(69900 - q["discount_paise"]))

    r = c.post("/api/billing/quote", headers=H,
               json={"kind": "pack", "pack_code": "PACK_100", "coupon": "NOPE"})
    check("an unknown coupon is refused", r.status_code == 400)

    r = c.post("/api/billing/checkout", headers=H,
               json={"kind": "pack", "pack_code": "PACK_1000", "coupon": "DIWALI25"})
    c.post(f"/api/billing/verify/{r.json()['order_id']}", headers=H)
    r = c.post("/api/billing/quote", headers=H,
               json={"kind": "pack", "pack_code": "PACK_100", "coupon": "DIWALI25"})
    check("a coupon cannot be used twice by one account", r.status_code == 400)


def test_downgrade_flow():
    print("\ndowngrade")
    r = c.post("/api/billing/downgrade", headers=H, json={"plan_code": "STARTER_YEARLY"})
    check("a downgrade can be scheduled", r.status_code == 200, r.text[:200])
    d = r.json()
    check("it takes effect at renewal, not now", d["effective_at"] is not None)
    check("the subscriber keeps Business until then",
          c.get("/api/subscription", headers=H).json()["plan"]["tier"] == "BUSINESS")
    check("the pending plan is shown",
          c.get("/api/subscription", headers=H).json()["pending_plan_code"] == "STARTER_YEARLY")
    r = c.post("/api/billing/downgrade", headers=H, json={"plan_code": "PRO_YEARLY"})
    check("an upgrade is not accepted as a downgrade", r.status_code == 400)
    c.post("/api/billing/cancel-downgrade", headers=H)
    check("a scheduled downgrade can be called off",
          c.get("/api/subscription", headers=H).json()["pending_plan_code"] is None)


def test_business_limit():
    print("\nbusiness limits")
    created = 0
    for i in range(10):
        r = c.post("/api/businesses", headers=H,
                   json={"name": f"Extra Biz {i}", "business_type": "b2c"})
        if r.status_code != 200:
            break
        created += 1
    check("the plan's 7 businesses can all be created", created == 6, str(created))
    d = r.json()
    check("the 8th business is refused on Business+2 add-ons", r.status_code == 402, str(r.status_code))
    check("with a machine-readable code", d["detail"]["code"] == P.ERR_BUSINESSES)
    check("naming Pro as the fix", d["detail"]["suggested_plan_name"] == "Pro")
    count = c.get("/api/subscription", headers=H).json()["usage"]["businesses"]
    check("exactly 7 businesses exist", count == 7, str(count))


def test_super_admin():
    print("\nadmin panel")
    r = c.get("/api/super/subscriptions")
    check("customer list loads", r.status_code == 200, r.text[:200])
    row = r.json()["rows"][0]
    check("it shows the plan", row["plan_name"] == "Business")
    check("and revenue collected", row["revenue_paise"] > 0)

    r = c.get("/api/super/revenue")
    check("revenue dashboard loads", r.status_code == 200, r.text[:200])
    rev = r.json()
    check("MRR is computed", rev["mrr_paise"] > 0)
    check("ARR is the real annual value, not 12× a rounded MRR",
          rev["arr_paise"] == 199900)
    check("pack revenue is tracked separately", rev["pack_revenue_paise"] > 0)
    check("one founding seat is taken", rev["founding_spots_left"] == 499)

    r = c.post("/api/super/subscriptions/grant",
               json={"account_id": "owner1", "credits": 250,
                     "reason": "Goodwill after a support issue"})
    check("an admin can grant credits", r.status_code == 200, r.text[:200])
    log = c.get("/api/super/grants").json()
    check("the grant is logged with its reason", log[0]["reason"].startswith("Goodwill"))

    r = c.put("/api/super/pricing", json={"tiers": {"BUSINESS": {"yearly_paise": 299900}}})
    check("prices can be changed without a deploy", r.status_code == 200, r.text[:200])
    live = c.get("/api/pricing").json()
    check("the new price is live immediately",
          next(t for t in live["tiers"] if t["tier"] == "BUSINESS")["yearly_label"] == "₹2,999")
    c.put("/api/super/pricing", json={"tiers": {"BUSINESS": {"yearly_paise": 249900}}})


def test_staff_and_credits():
    print("\nstaff + credit ledger")
    CURRENT["u"] = STAFF
    d = c.get("/api/subscription", headers=H).json()
    check("staff see the owner's plan", d["plan"]["tier"] == "BUSINESS")
    check("and the owner's credit pool", d["credits"]["plan"] == 1000)
    CURRENT["u"] = OWNER

    led = c.get("/api/subscription/credits", headers=H).json()
    check("the ledger is visible", len(led["ledger"]) > 0)
    check("every row says where the credits came from",
          all(r["source"] in ("plan", "pack") for r in led["ledger"]))


def test_renewals():
    print("\nrenewal job")
    r = c.post("/api/super/billing/run-renewals")
    check("the renewal cycle runs", r.status_code == 200, r.text[:200])
    check("it reports what it did", set(r.json()) >= {"downgraded", "expired", "reminders"})


def main():
    test_public_pricing()
    test_subscription_view()
    test_feature_gating()
    oid = test_quote_and_checkout()
    test_activation(oid)
    test_credit_packs()
    test_addons()
    test_coupons()
    test_downgrade_flow()
    test_business_limit()
    test_super_admin()
    test_staff_and_credits()
    test_renewals()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
