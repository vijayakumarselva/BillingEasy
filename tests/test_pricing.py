"""Unit tests for the pricing catalogue, credits, limits and proration."""
import asyncio, os, sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
os.environ.setdefault("JWT_SECRET", "test")

from mongomock_motor import AsyncMongoMockClient
import pricing as P
import subscriptions as S
from migrate_pricing import migrate

OK = []
def check(name, cond):
    OK.append((name, bool(cond)))
    print(("  ok   " if cond else "  FAIL ") + name)

def fresh():
    return AsyncMongoMockClient()["t"]


# ── catalogue ────────────────────────────────────────────────────────────────
def test_catalogue():
    print("\ncatalogue")
    check("Business yearly is ₹2,499", P.PLANS["BUSINESS_YEARLY"]["paise"] == 249900)
    check("Pro yearly is ₹5,999", P.PLANS["PRO_YEARLY"]["paise"] == 599900)
    check("Free has no e-way bills", not P.has_feature("FREE", "eway_bills"))
    check("Only Pro has e-invoicing",
          P.has_feature("PRO_YEARLY", "einvoicing") and not P.has_feature("BUSINESS_YEARLY", "einvoicing"))
    check("Business unlocks e-way bills", P.has_feature("BUSINESS_YEARLY", "eway_bills"))
    check("Free keeps the footer", not P.has_feature("FREE", "remove_branding"))
    check("Starter removes the footer", P.has_feature("STARTER_YEARLY", "remove_branding"))
    check("legacy GROWTH_9999 maps forward", P.normalise_code("GROWTH_9999") == "BUSINESS_YEARLY")
    check("unknown code falls back to Free", P.normalise_code("NOPE_123") == "FREE")
    check("cheapest plan with e-invoicing is Pro",
          P.cheapest_plan_with("einvoicing")["tier"] == "PRO")
    check("3rd business needs Business",
          P.cheapest_plan_for_limit("businesses", 3)["tier"] == "BUSINESS")
    check("2nd business needs only Starter",
          P.cheapest_plan_for_limit("businesses", 2)["tier"] == "STARTER")
    check("GST on ₹2,499 is ₹449.82", P.gst_on(249900) == 44982)
    check("Indian grouping", P.fmt_inr(149900) == "₹1,499" and P.fmt_inr(1234567800) == "₹1,23,45,678")
    check("yearly saves ~30% on Business",
          28 <= round(100 - 249900 / (29900 * 12) * 100) <= 32)
    cat = {"tiers": P.PLAN_TIERS, "plans": P.PLANS, "addons": P.ADDONS,
           "packs": P.CREDIT_PACKS, "founding": P.FOUNDING_OFFER, "multiyear": P.MULTIYEAR}
    pub = P.public_pricing(cat, spots_left=412)
    check("public pricing lists 4 tiers", len(pub["tiers"]) == 4)
    check("Business is flagged Most Popular",
          next(t for t in pub["tiers"] if t["tier"] == "BUSINESS")["badge"] == "Most Popular")
    check("founding spots surface", pub["founding"]["spots_left"] == 412)


# ── credits ──────────────────────────────────────────────────────────────────
async def test_credits():
    print("\ncredits")
    db = fresh()
    await S.grant_credits(db, "u1", 300, source="plan", reason="Starter plan credits")
    await S.grant_credits(db, "u1", 100, source="pack", reason="Bought 100")
    bal = await S.get_balance(db, "u1")
    check("balance is plan + pack", bal["total"] == 400)

    r = await S.consume_credit(db, "u1", reason="AI invoice scan", ref_id="scan-1")
    bal = await S.get_balance(db, "u1")
    check("one scan costs one credit", r["spent"] == 1 and bal["total"] == 399)
    check("plan credits are spent first", r["from_plan"] == 1 and bal["pack_credits"] == 100)

    # drain the plan bucket; the overflow must come from packs
    await S.consume_credit(db, "u1", credits=299)
    r = await S.consume_credit(db, "u1", credits=10)
    check("falls through to pack credits once plan runs out",
          r["from_plan"] == 0 and r["from_pack"] == 10)
    bal = await S.get_balance(db, "u1")
    check("pack bucket drawn down", bal["plan_credits"] == 0 and bal["pack_credits"] == 90)

    # renewal resets the plan bucket and leaves packs alone
    await S.reset_plan_credits(db, "u1", 1000, "BUSINESS_YEARLY:2027")
    bal = await S.get_balance(db, "u1")
    check("renewal resets plan credits, packs survive",
          bal["plan_credits"] == 1000 and bal["pack_credits"] == 90)
    await S.reset_plan_credits(db, "u1", 1000, "BUSINESS_YEARLY:2027")
    bal = await S.get_balance(db, "u1")
    check("granting twice for one cycle is a no-op", bal["plan_credits"] == 1000)

    # unused plan credits do not roll over
    await S.consume_credit(db, "u1", credits=5)
    await S.reset_plan_credits(db, "u1", 1000, "BUSINESS_YEARLY:2028")
    bal = await S.get_balance(db, "u1")
    check("plan credits do not roll over", bal["plan_credits"] == 1000)

    # refund on a failed scan
    before = (await S.get_balance(db, "u1"))["total"]
    receipt = await S.consume_credit(db, "u1", reason="AI scan", ref_id="scan-2")
    await S.refund_credit(db, receipt, reason="Scan failed")
    after = await S.get_balance(db, "u1")
    check("failed scan is refunded", after["total"] == before)

    # refund must restore the exact buckets it took from
    db2 = fresh()
    await S.grant_credits(db2, "u2", 1, source="plan", reason="x")
    await S.grant_credits(db2, "u2", 5, source="pack", reason="y")
    rec = await S.consume_credit(db2, "u2", credits=3)
    await S.refund_credit(db2, rec)
    b2 = await S.get_balance(db2, "u2")
    check("refund restores each bucket", b2["plan_credits"] == 1 and b2["pack_credits"] == 5)

    # insufficient
    db3 = fresh()
    await S.grant_credits(db3, "u3", 0, source="pack", reason="none")
    try:
        await S.consume_credit(db3, "u3")
        check("empty balance is refused", False)
    except S.PlanError as e:
        check("empty balance raises INSUFFICIENT_CREDITS", e.code == P.ERR_CREDITS)

    # every movement is on the ledger
    rows = await db.credit_ledger.find({"account_id": "u1"}, {"_id": 0}).to_list(100)
    check("ledger records every movement", len(rows) >= 8)
    check("ledger rows carry source and reason",
          all(r.get("source") in ("plan", "pack") and r.get("reason") for r in rows))
    low = await S.get_balance(db3, "u3")
    check("low-credit flag at 10 or under", low["low"] is True)


# ── limits ───────────────────────────────────────────────────────────────────
async def seed_account(db, account_id, n_businesses=1, plan="FREE", status="free"):
    sub = S.blank_subscription(account_id)
    sub.update({"plan_code": plan, "status": status})
    if status == "active":
        sub["current_period_start"] = S.now_dt().isoformat()
        sub["current_period_end"] = (S.now_dt() + timedelta(days=365)).isoformat()
    await db.subscriptions.insert_one(dict(sub))
    for i in range(n_businesses):
        oid = f"{account_id}-org{i}"
        await db.organizations.insert_one({
            "id": oid, "name": f"Biz {i}", "owner_user_id": account_id,
            "created_at": f"2026-01-{i + 1:02d}T00:00:00+00:00"})
        await db.memberships.insert_one({"id": f"m-{oid}", "org_id": oid,
                                         "user_id": account_id, "role": "owner"})


async def test_limits():
    print("\nlimits")
    db = fresh()
    await seed_account(db, "free1", n_businesses=1)
    try:
        await S.check_account_limit(db, "free1", "businesses")
        check("Free is capped at one business", False)
    except S.PlanError as e:
        check("Free is capped at one business", e.code == P.ERR_BUSINESSES)
        check("the error names the plan that unlocks it",
              e.detail["suggested_plan_name"] == "Starter")

    db = fresh()
    await seed_account(db, "biz1", n_businesses=4, plan="BUSINESS_YEARLY", status="active")
    info = await S.check_account_limit(db, "biz1", "businesses")
    check("Business allows a 5th business", info["limits"]["businesses"] == 5)

    db = fresh()
    await seed_account(db, "pro1", n_businesses=30, plan="PRO_YEARLY", status="active")
    await S.check_account_limit(db, "pro1", "businesses")
    check("Pro is unlimited", True)

    # add-ons raise the cap
    db = fresh()
    await seed_account(db, "s1", n_businesses=2, plan="STARTER_YEARLY", status="active")
    try:
        await S.check_account_limit(db, "s1", "businesses")
        check("Starter stops at 2 businesses", False)
    except S.PlanError:
        check("Starter stops at 2 businesses", True)
    await db.subscriptions.update_one({"account_id": "s1"},
                                      {"$set": {"addons": {"EXTRA_BUSINESS": 1}}})
    info = await S.check_account_limit(db, "s1", "businesses")
    check("the extra-business add-on raises the cap", info["limits"]["businesses"] == 3)

    # features
    try:
        await S.require_feature(db, "s1", "einvoicing")
        check("Starter cannot e-invoice", False)
    except S.PlanError as e:
        check("Starter cannot e-invoice", e.code == P.ERR_FEATURE)
        check("the prompt points at Pro", e.detail["suggested_plan_name"] == "Pro")
    await S.require_feature(db, "s1", "gst_returns")
    check("Starter can file GSTR", True)


# ── trial, grace, expiry ─────────────────────────────────────────────────────
async def test_lifecycle():
    print("\nlifecycle")
    db = fresh()
    sub = S.blank_subscription("t1", trial=True)
    st = S.effective_status(sub)
    check("new signup trials on Business", st["tier"] == "BUSINESS" and st["status"] == "trialing")
    check("trial runs 14 days", 13 <= st["days_left"] <= 15)

    sub["trial_ends_at"] = (S.now_dt() - timedelta(days=1)).isoformat()
    st = S.effective_status(sub)
    check("a lapsed trial drops to Free, not a lockout",
          st["status"] == "free" and st["plan_code"] == "FREE")

    paid = S.blank_subscription("p1")
    paid.update({"plan_code": "BUSINESS_YEARLY", "status": "active",
                 "current_period_start": (S.now_dt() - timedelta(days=366)).isoformat(),
                 "current_period_end": (S.now_dt() - timedelta(days=1)).isoformat()})
    st = S.effective_status(paid)
    check("just-expired plan enters the 7-day grace", st["status"] == "grace" and st["in_grace"])
    check("grace keeps full access", st["plan_code"] == "BUSINESS_YEARLY")
    check("grace counts down", 6 <= st["days_left"] <= 7)

    paid["current_period_end"] = (S.now_dt() - timedelta(days=10)).isoformat()
    st = S.effective_status(paid)
    check("after grace it falls to Free", st["status"] == "expired" and st["plan_code"] == "FREE")

    cancelled = S.blank_subscription("c1")
    cancelled.update({"plan_code": "PRO_YEARLY", "status": "cancelled",
                      "current_period_end": (S.now_dt() + timedelta(days=30)).isoformat()})
    st = S.effective_status(cancelled)
    check("cancelling keeps access until the period ends", st["plan_code"] == "PRO_YEARLY")


# ── proration ────────────────────────────────────────────────────────────────
def test_proration():
    print("\nproration")
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    end = datetime(2027, 1, 1, tzinfo=timezone.utc)
    half = datetime(2026, 7, 2, tzinfo=timezone.utc)      # ~183 days left of 365
    starter, business = P.PLANS["STARTER_YEARLY"], P.PLANS["BUSINESS_YEARLY"]

    r = S.proration_paise(starter, business, start, end, now=half)
    check("upgrade is charged for the remaining days only",
          r["charge_paise"] < business["paise"])
    check("unused Starter value is credited", 73000 < r["credit_paise"] < 77000)
    check("charge = new share - old credit",
          r["charge_paise"] == r["new_for_remainder"] - r["credit_paise"])
    expected = round(249900 * r["days_left"] / 365) - round(149900 * r["days_left"] / 365)
    check("prorated difference is exact", r["charge_paise"] == expected)

    r_day1 = S.proration_paise(starter, business, start, end, now=start)
    check("upgrading on day 1 costs the full difference",
          r_day1["charge_paise"] == 249900 - 149900)

    r_free = S.proration_paise(P.PLANS["FREE"], business, None, None)
    check("upgrading from Free charges full price",
          r_free["charge_paise"] == 249900 and not r_free["prorated"])

    r_last = S.proration_paise(starter, business, start, end,
                               now=end - timedelta(hours=12))
    check("upgrading on the last day costs nothing extra", r_last["charge_paise"] == 0)

    c = S.prorated_credits(business, 183, 365)
    check("credits are topped up pro rata", 495 <= c <= 505)
    check("full period grants the full allowance",
          S.prorated_credits(business, 365, 365) == 1000)


async def test_downgrade():
    print("\ndowngrade")
    db = fresh()
    await seed_account(db, "d1", n_businesses=4, plan="BUSINESS_YEARLY", status="active")
    locked = await S.sync_readonly_flags(db, "d1")
    check("nothing is locked while within the plan", locked == [])

    await db.subscriptions.update_one({"account_id": "d1"},
                                      {"$set": {"plan_code": "STARTER_YEARLY"}})
    locked = await S.sync_readonly_flags(db, "d1")
    check("after downgrade the extra businesses go read-only", len(locked) == 2)
    kept = await db.organizations.count_documents({"owner_user_id": "d1",
                                                   "readonly_reason": "plan_limit"})
    check("data is kept, never deleted",
          await db.organizations.count_documents({"owner_user_id": "d1"}) == 4 and kept == 2)
    check("the oldest businesses stay active",
          "d1-org0" not in locked and "d1-org1" not in locked)

    # the owner can choose which to keep
    await db.organizations.update_one({"id": "d1-org3"}, {"$set": {"keep_active": True}})
    locked = await S.sync_readonly_flags(db, "d1")
    check("owner's choice is respected", "d1-org3" not in locked)

    # buying the add-on unlocks one
    await db.subscriptions.update_one({"account_id": "d1"},
                                      {"$set": {"addons": {"EXTRA_BUSINESS": 1}}})
    locked = await S.sync_readonly_flags(db, "d1")
    check("buying an extra business unlocks one", len(locked) == 1)

    sub = await S.schedule_downgrade(db, "d1", "FREE")
    check("a downgrade is scheduled, not applied now",
          sub["pending_plan_code"] == "FREE" and sub["plan_code"] == "STARTER_YEARLY")


async def test_apply_plan():
    print("\napply_plan")
    db = fresh()
    await seed_account(db, "a1", n_businesses=1)
    await S.apply_plan(db, "a1", "BUSINESS_YEARLY", provider="cashfree", provider_ref="sub_1")
    info = await S.account_plan(db, "a1")
    bal = await S.get_balance(db, "a1")
    check("activation sets the plan", info["plan_code"] == "BUSINESS_YEARLY")
    check("activation grants the year's credits", bal["plan_credits"] == 1000)
    check("renewal date is a year out", 363 <= info["days_left"] <= 366)

    await S.apply_plan(db, "a1", "BUSINESS_YEARLY", provider_ref="sub_1")
    bal2 = await S.get_balance(db, "a1")
    check("re-applying the same period does not double-grant", bal2["plan_credits"] == 1000)

    await S.apply_plan(db, "a1", "PRO_YEARLY", months=24)
    info = await S.account_plan(db, "a1")
    bal3 = await S.get_balance(db, "a1")
    check("a 2-year plan runs 24 months", 729 <= info["days_left"] <= 732)
    check("2 years grants double credits", bal3["plan_credits"] == 10000)


# ── migration ────────────────────────────────────────────────────────────────
async def test_migration():
    print("\nmigration")
    db = fresh()
    now = S.now_dt()
    await db.organizations.insert_many([
        {"id": "o1", "owner_user_id": "payer", "name": "Paying Co",
         "plan_code": "GROWTH_9999", "subscription_status": "active",
         "current_period_end": (now + timedelta(days=200)).isoformat(),
         "created_at": "2026-01-01T00:00:00+00:00"},
        {"id": "o2", "owner_user_id": "trialer", "name": "New Co",
         "plan_code": None, "subscription_status": "trialing",
         "trial_ends_at": (now + timedelta(days=3)).isoformat(),
         "created_at": (now - timedelta(days=4)).isoformat()},
        {"id": "o3", "owner_user_id": "lapsed", "name": "Old Co",
         "plan_code": None, "subscription_status": "trial_expired",
         "created_at": "2025-01-01T00:00:00+00:00"},
    ])
    await db.wallets.insert_one({"org_id": "o1", "balance": 420})

    stats = await migrate(db, dry_run=True)
    check("dry run writes nothing", await db.subscriptions.count_documents({}) == 0)
    check("dry run still reports", stats["accounts"] == 3)

    await migrate(db)
    payer = S.effective_status(await db.subscriptions.find_one({"account_id": "payer"}))
    check("a paying customer is not downgraded", payer["status"] == "active")
    check("they keep full access on Pro", payer["plan_code"] == "PRO_YEARLY")
    check("their existing period is honoured", 199 <= payer["days_left"] <= 201)

    bal = await S.get_balance(db, "payer")
    check("paid-for wallet credits carry over as non-expiring packs",
          bal["pack_credits"] == 420)

    tr = S.effective_status(await db.subscriptions.find_one({"account_id": "trialer"}))
    check("an in-flight trial becomes the 14-day Business trial",
          tr["status"] == "trialing" and tr["tier"] == "BUSINESS")
    check("trial days count from the original signup", 9 <= tr["days_left"] <= 11)

    lapsed = S.effective_status(await db.subscriptions.find_one({"account_id": "lapsed"}))
    check("a lapsed account lands on Free", lapsed["plan_code"] == "FREE")
    lb = await S.get_balance(db, "lapsed")
    check("and gets the 50 signup credits", lb["total"] == 50)

    before = await db.subscriptions.count_documents({})
    await migrate(db)
    check("re-running the migration changes nothing",
          await db.subscriptions.count_documents({}) == before)
    check("and does not re-grant credits",
          (await S.get_balance(db, "lapsed"))["total"] == 50)


async def main():
    test_catalogue()
    await test_credits()
    await test_limits()
    await test_lifecycle()
    test_proration()
    await test_downgrade()
    await test_apply_plan()
    await test_migration()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
