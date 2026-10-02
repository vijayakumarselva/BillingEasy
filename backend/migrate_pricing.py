"""Move billing from per-organisation plans to per-login subscriptions.

Safe to run repeatedly — every step is idempotent and nothing is deleted.

What it does, per login that owns at least one business:
  * creates a `subscriptions` row;
  * an owner currently paying on an old plan keeps full access on **Pro until
    their current period ends** (they renew at the new prices after that) — a
    straight move to Free would cut off paying customers;
  * an owner still in the old 7-day trial gets the new 14-day Business trial,
    counted from their original signup so nobody gains or loses days;
  * everyone else starts on Free with the 50 signup credits;
  * existing per-org wallet balances are summed into the account's **pack**
    bucket, because those credits were paid for and must never expire;
  * writes a credit_ledger row for every grant so the balance is explainable.

Usage:  python migrate_pricing.py [--dry-run]
"""
import asyncio
import os
import sys
from datetime import timedelta

from motor.motor_asyncio import AsyncIOMotorClient

import pricing as P
import subscriptions as S


async def migrate(db, dry_run: bool = False) -> dict:
    stats = {"accounts": 0, "paid_kept": 0, "trials": 0, "free": 0,
             "pack_credits_carried": 0, "signup_credits": 0, "skipped": 0}

    owner_ids = await db.organizations.distinct("owner_user_id", {"deleted": {"$ne": True}})
    for account_id in owner_ids:
        if not account_id:
            continue
        existing = await db.subscriptions.find_one({"account_id": account_id}, {"_id": 0})
        if existing:
            stats["skipped"] += 1
            continue

        orgs = await db.organizations.find(
            {"owner_user_id": account_id, "deleted": {"$ne": True}}, {"_id": 0}
        ).sort("created_at", 1).to_list(500)
        if not orgs:
            continue
        stats["accounts"] += 1

        # The most generous state across the owner's businesses wins.
        paid = [o for o in orgs if o.get("subscription_status") == "active"
                and S.parse_dt(o.get("current_period_end"))
                and S.parse_dt(o.get("current_period_end")) > S.now_dt()]
        trialing = [o for o in orgs if o.get("subscription_status") == "trialing"]

        sub = S.blank_subscription(account_id)
        if paid:
            latest = max(paid, key=lambda o: S.parse_dt(o["current_period_end"]))
            sub.update({
                "plan_code": "PRO_YEARLY",
                "status": "active",
                "current_period_start": latest.get("created_at"),
                "current_period_end": latest["current_period_end"],
                "migrated_from": latest.get("plan_code"),
                "migration_note": "Kept on Pro at no charge until the old period ends",
            })
            stats["paid_kept"] += 1
        elif trialing:
            earliest = min(trialing, key=lambda o: str(o.get("created_at") or ""))
            started = S.parse_dt(earliest.get("created_at")) or S.now_dt()
            trial_end = started + timedelta(days=P.TRIAL_DAYS)
            if trial_end > S.now_dt():
                sub.update({
                    "plan_code": P.plan_code(P.TRIAL_TIER, "year"),
                    "status": "trialing",
                    "trial_ends_at": trial_end.isoformat(),
                })
                stats["trials"] += 1
            else:
                stats["free"] += 1
        else:
            stats["free"] += 1

        if dry_run:
            continue

        await db.subscriptions.insert_one(dict(sub))

        # Carry paid-for wallet credits across as never-expiring pack credits.
        org_ids = [o["id"] for o in orgs]
        carried = 0
        async for w in db.wallets.find({"org_id": {"$in": org_ids}}, {"_id": 0}):
            carried += max(0, int(w.get("balance") or 0))
        if carried:
            await S.grant_credits(db, account_id, carried, source="pack",
                                  reason="Carried over from your old credit wallet")
            stats["pack_credits_carried"] += carried

        # Signup credits for accounts that never bought any.
        if not carried:
            free_credits = P.PLAN_TIERS["FREE"]["signup_credits"]
            await S.grant_credits(db, account_id, free_credits, source="pack",
                                  reason="Signup credits")
            stats["signup_credits"] += free_credits

        if sub["status"] in ("active", "trialing"):
            plan = P.get_plan(sub["plan_code"])
            if plan.get("credits_per_period"):
                await S.reset_plan_credits(db, account_id, plan["credits_per_period"],
                                           S.period_key(sub),
                                           reason=f"{plan['name']} plan credits")
        await S.sync_readonly_flags(db, account_id)

    return stats


async def main():
    dry = "--dry-run" in sys.argv
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ.get("DB_NAME", "billeasy")]
    stats = await migrate(db, dry_run=dry)
    print(("DRY RUN — nothing written\n" if dry else "") +
          "\n".join(f"{k:>22}: {v}" for k, v in stats.items()))


if __name__ == "__main__":
    asyncio.run(main())
