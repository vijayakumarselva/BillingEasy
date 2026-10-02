"""Subscription state, plan limits and AI credits — all keyed to the login.

An *account* is the owner's user id. Every business (org) that login owns shares
one subscription, one pool of user seats and one AI credit balance. Staff users
spend the owner's credits and count against the owner's seats.

Collections
-----------
subscriptions      one per account_id
credit_balances    one per account_id (plan bucket + pack bucket)
credit_ledger      append-only, one row per grant/spend/refund
billing_payments   one row per payment (subscription, add-on or credit pack)
coupons            discount codes; coupon_redemptions records each use
referrals          referral codes and who signed up through them
devices            active device sessions (Free plan allows one)
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

import pricing as P


# ─────────────────────────────────────────────────────────────────────────────
# Time helpers. Everything is stored UTC ISO; display in IST is the UI's job.
# ─────────────────────────────────────────────────────────────────────────────
def now_dt() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_dt().isoformat()


def parse_dt(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        d = datetime.fromisoformat(str(value))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def add_interval(start: datetime, interval: str, count: int = 1) -> datetime:
    """Month/year arithmetic that keeps the day of month where possible."""
    if interval == "month":
        month = start.month - 1 + count
        year = start.year + month // 12
        month = month % 12 + 1
        day = min(start.day, [31, 29 if year % 4 == 0 and (year % 100 or year % 400 == 0) else 28,
                              31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
        return start.replace(year=year, month=month, day=day)
    return add_interval(start, "month", 12 * count)


def days_between(a: datetime, b: datetime) -> int:
    return max(0, (b - a).days)


class PlanError(HTTPException):
    """402 with a machine-readable code the apps turn into an upgrade prompt."""

    def __init__(self, code: str, message: str, **extra):
        super().__init__(402, {"code": code, "message": message, **extra})
        self.code = code


# ─────────────────────────────────────────────────────────────────────────────
# Subscription record
# ─────────────────────────────────────────────────────────────────────────────
def blank_subscription(account_id: str, *, trial: bool = False) -> Dict[str, Any]:
    now = now_dt()
    sub = {
        "id": str(uuid.uuid4()),
        "account_id": account_id,
        "plan_code": P.FREE_CODE,
        "status": "free",
        "current_period_start": None,
        "current_period_end": None,
        "trial_ends_at": None,
        "cancel_at_period_end": False,
        "pending_plan_code": None,        # downgrade / interval switch at renewal
        "addons": {},                     # {"EXTRA_BUSINESS": 2, "EXTRA_USER": 1}
        "price_lock_paise": None,         # founding members keep their price
        "founding_member": False,
        "provider": None,
        "provider_ref": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    if trial:
        sub.update({
            "plan_code": P.plan_code(P.TRIAL_TIER, "year"),
            "status": "trialing",
            "trial_ends_at": (now + timedelta(days=P.TRIAL_DAYS)).isoformat(),
        })
    return sub


async def get_subscription(db, account_id: str) -> Dict[str, Any]:
    sub = await db.subscriptions.find_one({"account_id": account_id}, {"_id": 0})
    if not sub:
        sub = blank_subscription(account_id)
        await db.subscriptions.insert_one(dict(sub))
    return sub


def effective_status(sub: Dict[str, Any], now: Optional[datetime] = None) -> Dict[str, Any]:
    """Resolve the stored record against the clock.

    trialing -> free when the trial lapses; active -> grace for GRACE_DAYS after
    the period ends, then expired. Grace keeps full access behind a banner.
    """
    now = now or now_dt()
    status = sub.get("status") or "free"
    plan = sub.get("plan_code") or P.FREE_CODE
    trial_end = parse_dt(sub.get("trial_ends_at"))
    period_end = parse_dt(sub.get("current_period_end"))
    grace_end = period_end + timedelta(days=P.GRACE_DAYS) if period_end else None
    days_left = 0
    in_grace = False

    if status == "trialing":
        if trial_end and now > trial_end:
            status, plan = "free", P.FREE_CODE
        else:
            days_left = days_between(now, trial_end) + 1 if trial_end else 0
    elif status in ("active", "past_due", "grace"):
        if period_end and now > period_end:
            if grace_end and now <= grace_end:
                status, in_grace = "grace", True
                days_left = days_between(now, grace_end) + 1
            else:
                status, plan = "expired", P.FREE_CODE
        elif period_end:
            days_left = days_between(now, period_end) + 1
    elif status == "cancelled" and period_end and now <= period_end:
        # Cancelled but paid until period end — keep the plan until then.
        status = "active"
        days_left = days_between(now, period_end) + 1

    paid_plan = sub.get("plan_code") or P.FREE_CODE
    return {
        "status": status,
        "plan_code": plan,                     # what access to grant right now
        "paid_plan_code": paid_plan,           # what they bought
        "tier": P.get_plan(plan)["tier"],
        "interval": P.get_plan(paid_plan)["interval"],
        "trial_ends_at": sub.get("trial_ends_at"),
        "current_period_end": sub.get("current_period_end"),
        "grace_ends_at": grace_end.isoformat() if grace_end else None,
        "in_grace": in_grace,
        "days_left": days_left,
        "cancel_at_period_end": bool(sub.get("cancel_at_period_end")),
        "pending_plan_code": sub.get("pending_plan_code"),
        "founding_member": bool(sub.get("founding_member")),
        "price_lock_paise": sub.get("price_lock_paise"),
        "addons": sub.get("addons") or {},
        "is_paid": status in ("active", "grace", "past_due"),
        "needs_payment": status in ("expired", "past_due", "grace"),
    }


async def get_override(db, account_id: str) -> Dict[str, Any]:
    """A BillingsEasy-granted exception for one account.

    Lets support unlock a single feature or raise one cap without moving the
    customer onto a plan they are not paying for — a demo account, an apology,
    a pilot. It only ever *adds*: it can never take away what the plan includes.
    """
    row = await db.account_overrides.find_one({"account_id": account_id}, {"_id": 0})
    if not row:
        return {}
    until = parse_dt(row.get("expires_at"))
    if until and now_dt() > until:
        return {}                      # lapsed, and no longer applied
    return row


async def account_plan(db, account_id: str, catalogue: Optional[dict] = None) -> Dict[str, Any]:
    """Everything a request needs: live status, resolved limits and features."""
    sub = await get_subscription(db, account_id)
    state = effective_status(sub)
    plan = P.get_plan(state["plan_code"], catalogue)
    limits = dict(plan["limits"])
    features = list(plan["features"])
    addons = state["addons"]
    # Add-ons raise the caps they were bought for (never on an unlimited cap).
    if limits.get("businesses", 0) != P.UNLIMITED:
        limits["businesses"] += int(addons.get("EXTRA_BUSINESS", 0))
    if limits.get("users", 0) != P.UNLIMITED:
        limits["users"] += int(addons.get("EXTRA_USER", 0))

    override = await get_override(db, account_id)
    if override:
        for f in override.get("features") or []:
            if f not in features:
                features.append(f)
        for key, value in (override.get("limits") or {}).items():
            if value is None:
                continue
            current = limits.get(key, 0)
            # An override can only be more generous, never less.
            if int(value) == P.UNLIMITED or current == P.UNLIMITED:
                limits[key] = P.UNLIMITED if int(value) == P.UNLIMITED else current
            else:
                limits[key] = max(int(current), int(value))

    return {**state, "limits": limits, "features": features, "plan": plan,
            "override": {"features": override.get("features") or [],
                         "limits": override.get("limits") or {},
                         "reason": override.get("reason", ""),
                         "expires_at": override.get("expires_at")} if override else None}


# ─────────────────────────────────────────────────────────────────────────────
# Limits
# ─────────────────────────────────────────────────────────────────────────────
async def count_businesses(db, account_id: str) -> int:
    return await db.organizations.count_documents(
        {"owner_user_id": account_id, "deleted": {"$ne": True}})


async def count_users(db, account_id: str) -> int:
    """Distinct people with access to any of this account's businesses."""
    org_ids = [o["id"] async for o in db.organizations.find(
        {"owner_user_id": account_id, "deleted": {"$ne": True}}, {"_id": 0, "id": 1})]
    if not org_ids:
        return 1
    users = set()
    async for m in db.memberships.find({"org_id": {"$in": org_ids}}, {"_id": 0, "user_id": 1}):
        users.add(m["user_id"])
    users.add(account_id)
    return len(users)


async def account_usage(db, account_id: str) -> Dict[str, int]:
    return {
        "businesses": await count_businesses(db, account_id),
        "users": await count_users(db, account_id),
        "devices": await db.devices.count_documents({"account_id": account_id, "active": True}),
    }


def _limit_error(kind: str, used: int, cap: int, catalogue: Optional[dict] = None) -> PlanError:
    code = {"businesses": P.ERR_BUSINESSES, "users": P.ERR_USERS,
            "devices": P.ERR_DEVICES}[kind]
    nxt = P.cheapest_plan_for_limit(kind, used + 1, catalogue)
    noun = {"businesses": "business", "users": "user", "devices": "device"}[kind]
    msg = f"Your plan covers {cap} {noun}{'' if cap == 1 else 's'}."
    if nxt and nxt["tier"] != "FREE":
        msg += f" Add {'a' if kind != 'users' else 'another'} {noun} with {nxt['name']} — {P.fmt_inr(nxt['paise'])}/year."
    return PlanError(code, msg, used=used, limit=cap,
                     suggested_plan=(nxt or {}).get("code"),
                     suggested_plan_name=(nxt or {}).get("name"),
                     suggested_plan_paise=(nxt or {}).get("paise"))


async def check_account_limit(db, account_id: str, kind: str, *,
                              catalogue: Optional[dict] = None,
                              override: Optional[dict] = None):
    """Raise PlanError when adding one more `kind` would exceed the plan.

    `override` is the super-admin per-account override (see owner_business_limits)
    and always wins when it is more generous.
    """
    info = await account_plan(db, account_id, catalogue)
    cap = info["limits"].get(kind, P.UNLIMITED)
    if override and override.get(kind) is not None:
        cap = max(cap, int(override[kind])) if cap != P.UNLIMITED else cap
    if cap == P.UNLIMITED:
        return info
    usage = await account_usage(db, account_id)
    if usage.get(kind, 0) >= cap:
        raise _limit_error(kind, usage.get(kind, 0), cap, catalogue)
    return info


async def require_feature(db, account_id: str, feature: str,
                          catalogue: Optional[dict] = None):
    info = await account_plan(db, account_id, catalogue)
    if feature in info["features"]:
        return info
    nxt = P.cheapest_plan_with(feature, catalogue)
    label = P.FEATURES.get(feature, feature)
    msg = f"{label} is not part of {info['plan']['name']}."
    if nxt:
        msg += f" It is included in {nxt['name']} — {P.fmt_inr(nxt['paise'])}/year."
    raise PlanError(P.ERR_FEATURE, msg, feature=feature,
                    suggested_plan=(nxt or {}).get("code"),
                    suggested_plan_name=(nxt or {}).get("name"),
                    suggested_plan_paise=(nxt or {}).get("paise"))


# ─────────────────────────────────────────────────────────────────────────────
# AI credits — plan bucket first, then purchased packs.
# ─────────────────────────────────────────────────────────────────────────────
async def get_balance(db, account_id: str) -> Dict[str, Any]:
    bal = await db.credit_balances.find_one({"account_id": account_id}, {"_id": 0})
    if not bal:
        bal = {"account_id": account_id, "plan_credits": 0, "pack_credits": 0,
               "period_key": None, "lifetime_spent": 0, "created_at": now_iso()}
        await db.credit_balances.insert_one(dict(bal))
    bal["total"] = bal.get("plan_credits", 0) + bal.get("pack_credits", 0)
    bal["low"] = bal["total"] <= P.LOW_CREDIT_THRESHOLD
    return bal


async def _ledger(db, account_id: str, *, delta: int, source: str, reason: str,
                  org_id: Optional[str] = None, ref_id: Optional[str] = None,
                  balance_after: Optional[dict] = None) -> dict:
    row = {
        "id": str(uuid.uuid4()), "account_id": account_id, "org_id": org_id,
        "delta": delta, "source": source, "reason": reason, "ref_id": ref_id,
        "plan_after": (balance_after or {}).get("plan_credits"),
        "pack_after": (balance_after or {}).get("pack_credits"),
        "created_at": now_iso(),
    }
    await db.credit_ledger.insert_one(dict(row))
    return row


async def grant_credits(db, account_id: str, credits: int, *, source: str,
                        reason: str, ref_id: Optional[str] = None,
                        period_key: Optional[str] = None) -> Dict[str, Any]:
    """source='plan' resets with the billing cycle; source='pack' never expires."""
    if credits <= 0:
        return await get_balance(db, account_id)
    field = "plan_credits" if source == "plan" else "pack_credits"
    update: Dict[str, Any] = {"$inc": {field: credits},
                              "$set": {"updated_at": now_iso()}}
    if period_key:
        update["$set"]["period_key"] = period_key
    await db.credit_balances.update_one({"account_id": account_id}, update, upsert=True)
    bal = await get_balance(db, account_id)
    await _ledger(db, account_id, delta=credits, source=source, reason=reason,
                  ref_id=ref_id, balance_after=bal)
    return bal


async def reset_plan_credits(db, account_id: str, credits: int, period_key: str,
                             reason: str = "Plan renewal — AI scans") -> Dict[str, Any]:
    """Plan credits do not roll over — the new allowance replaces the old one."""
    bal = await get_balance(db, account_id)
    if bal.get("period_key") == period_key:
        return bal                      # already granted for this cycle
    await db.credit_balances.update_one(
        {"account_id": account_id},
        {"$set": {"plan_credits": credits, "period_key": period_key,
                  "updated_at": now_iso()}}, upsert=True)
    bal = await get_balance(db, account_id)
    await _ledger(db, account_id, delta=credits, source="plan", reason=reason,
                  balance_after=bal)
    return bal


async def consume_credit(db, account_id: str, *, credits: int = P.CREDITS_PER_SCAN,
                         reason: str = "AI invoice scan", org_id: Optional[str] = None,
                         ref_id: Optional[str] = None) -> Dict[str, Any]:
    """Spend plan credits first, then pack credits. Raises INSUFFICIENT_CREDITS.

    Returns a receipt that `refund_credit` can reverse if the scan fails.
    """
    bal = await get_balance(db, account_id)
    if bal["total"] < credits:
        packs = ", ".join(f"{p['credits']} for {P.fmt_inr(p['paise'])}" for p in P.CREDIT_PACKS)
        raise PlanError(
            P.ERR_CREDITS,
            f"You have {bal['total']} AI scan{'' if bal['total'] == 1 else 's'} left. "
            f"Top up: {packs}.",
            needed=credits, balance=bal["total"], packs=P.CREDIT_PACKS)
    from_plan = min(bal.get("plan_credits", 0), credits)
    from_pack = credits - from_plan
    await db.credit_balances.update_one(
        {"account_id": account_id},
        {"$inc": {"plan_credits": -from_plan, "pack_credits": -from_pack,
                  "lifetime_spent": credits},
         "$set": {"updated_at": now_iso()}})
    after = await get_balance(db, account_id)
    if from_plan:
        await _ledger(db, account_id, delta=-from_plan, source="plan", reason=reason,
                      org_id=org_id, ref_id=ref_id, balance_after=after)
    if from_pack:
        await _ledger(db, account_id, delta=-from_pack, source="pack", reason=reason,
                      org_id=org_id, ref_id=ref_id, balance_after=after)
    return {"spent": credits, "from_plan": from_plan, "from_pack": from_pack,
            "balance": after["total"], "low": after["low"], "ref_id": ref_id,
            "account_id": account_id, "org_id": org_id}


async def refund_credit(db, receipt: Optional[Dict[str, Any]], reason: str = "Scan failed"):
    """Put back exactly what `consume_credit` took, in the buckets it came from."""
    if not receipt or not receipt.get("spent"):
        return
    account_id = receipt["account_id"]
    await db.credit_balances.update_one(
        {"account_id": account_id},
        {"$inc": {"plan_credits": receipt.get("from_plan", 0),
                  "pack_credits": receipt.get("from_pack", 0),
                  "lifetime_spent": -receipt["spent"]},
         "$set": {"updated_at": now_iso()}})
    after = await get_balance(db, account_id)
    for source, amount in (("plan", receipt.get("from_plan", 0)),
                           ("pack", receipt.get("from_pack", 0))):
        if amount:
            await _ledger(db, account_id, delta=amount, source=source, reason=reason,
                          org_id=receipt.get("org_id"), ref_id=receipt.get("ref_id"),
                          balance_after=after)
    return after


# ─────────────────────────────────────────────────────────────────────────────
# Upgrades, downgrades, renewals
# ─────────────────────────────────────────────────────────────────────────────
def proration_paise(current_plan: dict, new_plan: dict,
                    period_start: Optional[datetime], period_end: Optional[datetime],
                    now: Optional[datetime] = None) -> Dict[str, Any]:
    """Charge for an immediate upgrade: the unused value of the current plan is
    credited against the new plan's price for the remaining days.

    On a plan with no paid period (Free or trial) the full new price is charged.
    """
    now = now or now_dt()
    full = int(new_plan["paise"])
    if not period_start or not period_end or period_end <= now or not current_plan["paise"]:
        return {"charge_paise": full, "credit_paise": 0, "full_paise": full,
                "days_left": 0, "days_total": 0, "prorated": False}
    days_total = max(1, days_between(period_start, period_end))
    days_left = max(0, days_between(now, period_end))
    unused = round(int(current_plan["paise"]) * days_left / days_total)
    # New plan is charged for the remaining days of the current period, so the
    # renewal date does not move.
    new_for_remainder = round(full * days_left / days_total)
    charge = max(0, new_for_remainder - unused)
    return {"charge_paise": charge, "credit_paise": unused,
            "full_paise": full, "new_for_remainder": new_for_remainder,
            "days_left": days_left, "days_total": days_total, "prorated": True}


def prorated_credits(new_plan: dict, days_left: int, days_total: int) -> int:
    """Top up AI credits to the new plan's allowance for the remaining period."""
    if not days_total:
        return int(new_plan.get("credits_per_period", 0))
    return round(int(new_plan.get("credits_per_period", 0)) * days_left / days_total)


def period_key(sub: Dict[str, Any]) -> str:
    return f"{sub.get('plan_code')}:{sub.get('current_period_start') or 'none'}"


async def apply_plan(db, account_id: str, new_code: str, *, interval: Optional[str] = None,
                     months: Optional[int] = None, status: str = "active",
                     provider: Optional[str] = None, provider_ref: Optional[str] = None,
                     price_lock_paise: Optional[int] = None,
                     founding: bool = False,
                     catalogue: Optional[dict] = None) -> Dict[str, Any]:
    """Activate `new_code` now and grant its credit allowance. Idempotent per period."""
    sub = await get_subscription(db, account_id)
    plan = P.get_plan(new_code, catalogue)
    now = now_dt()
    interval = interval or plan["interval"]
    if months:
        end = add_interval(now, "month", months)
    elif interval == "none":
        end = None
    else:
        end = add_interval(now, interval, 1)
    patch = {
        "plan_code": plan["code"], "status": status,
        "current_period_start": now.isoformat(),
        "current_period_end": end.isoformat() if end else None,
        "pending_plan_code": None, "cancel_at_period_end": False,
        "updated_at": now.isoformat(),
    }
    if provider:
        patch["provider"] = provider
    if provider_ref:
        patch["provider_ref"] = provider_ref
    if price_lock_paise is not None:
        patch["price_lock_paise"] = price_lock_paise
    if founding:
        patch["founding_member"] = True
    await db.subscriptions.update_one({"account_id": account_id}, {"$set": patch}, upsert=True)
    sub = await get_subscription(db, account_id)
    allowance = int(plan.get("credits_per_period", 0))
    if months and interval == "year":
        allowance = round(allowance * months / 12)
    if allowance:
        await reset_plan_credits(db, account_id, allowance, period_key(sub),
                                 reason=f"{plan['name']} plan — AI scans")
    return sub


async def schedule_downgrade(db, account_id: str, new_code: str) -> Dict[str, Any]:
    """Downgrades take effect at renewal — never mid-period, never destructive."""
    await db.subscriptions.update_one(
        {"account_id": account_id},
        {"$set": {"pending_plan_code": P.normalise_code(new_code),
                  "updated_at": now_iso()}}, upsert=True)
    return await get_subscription(db, account_id)


async def over_limit_businesses(db, account_id: str,
                                catalogue: Optional[dict] = None) -> List[dict]:
    """Businesses beyond the plan's cap — kept, but read-only until the owner
    picks which to keep active or buys the extra-business add-on.

    The oldest businesses stay active; the newest become read-only.
    """
    info = await account_plan(db, account_id, catalogue)
    cap = info["limits"].get("businesses", P.UNLIMITED)
    if cap == P.UNLIMITED:
        return []
    owned = await db.organizations.find(
        {"owner_user_id": account_id, "deleted": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "created_at": 1, "keep_active": 1}
    ).sort("created_at", 1).to_list(500)
    chosen = [o for o in owned if o.get("keep_active")]
    rest = [o for o in owned if not o.get("keep_active")]
    active = (chosen + rest)[:cap]
    active_ids = {o["id"] for o in active}
    return [o for o in owned if o["id"] not in active_ids]


async def sync_readonly_flags(db, account_id: str,
                              catalogue: Optional[dict] = None) -> List[str]:
    """Mark the over-limit businesses read-only and clear the flag on the rest."""
    locked = {o["id"] for o in await over_limit_businesses(db, account_id, catalogue)}
    await db.organizations.update_many(
        {"owner_user_id": account_id, "id": {"$in": list(locked)}},
        {"$set": {"readonly_reason": "plan_limit"}})
    await db.organizations.update_many(
        {"owner_user_id": account_id, "id": {"$nin": list(locked)},
         "readonly_reason": "plan_limit"},
        {"$set": {"readonly_reason": None}})
    return sorted(locked)
