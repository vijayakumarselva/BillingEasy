"""Coupons, the founding-member offer and referrals.

All discounts are computed in paise on the pre-GST amount; GST is applied to
the discounted amount at checkout.
"""
import random
import re
import string
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

import pricing as P
from subscriptions import now_dt, now_iso, parse_dt


# ─────────────────────────────────────────────────────────────────────────────
# Coupons
# ─────────────────────────────────────────────────────────────────────────────
def blank_coupon(code: str, **kw) -> Dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "code": code.strip().upper(),
        "kind": kw.get("kind", "percent"),          # percent | flat
        "value": int(kw.get("value", 0)),           # percent 0-100, or paise for flat
        "max_discount_paise": kw.get("max_discount_paise"),   # cap on a percent coupon
        "valid_from": kw.get("valid_from"),
        "valid_to": kw.get("valid_to"),
        "usage_cap": kw.get("usage_cap"),           # total redemptions allowed
        "per_account_cap": kw.get("per_account_cap", 1),
        "plan_codes": kw.get("plan_codes") or [],   # empty = any plan
        "applies_to": kw.get("applies_to") or ["plan"],   # plan | addon | pack
        "first_purchase_only": bool(kw.get("first_purchase_only", False)),
        "active": bool(kw.get("active", True)),
        "description": kw.get("description", ""),
        "used_count": 0,
        "created_at": now_iso(),
        "created_by": kw.get("created_by"),
    }


async def validate_coupon(db, code: str, *, account_id: str, plan_code: Optional[str],
                          amount_paise: int, kind: str = "plan") -> Dict[str, Any]:
    """Return {coupon, discount_paise} or raise 400 with the reason."""
    if not code:
        return {"coupon": None, "discount_paise": 0}
    c = await db.coupons.find_one({"code": code.strip().upper()}, {"_id": 0})
    if not c or not c.get("active"):
        raise HTTPException(400, "That coupon code is not valid.")
    now = now_dt()
    if (vf := parse_dt(c.get("valid_from"))) and now < vf:
        raise HTTPException(400, "That coupon is not active yet.")
    if (vt := parse_dt(c.get("valid_to"))) and now > vt:
        raise HTTPException(400, "That coupon has expired.")
    if c.get("usage_cap") and c.get("used_count", 0) >= int(c["usage_cap"]):
        raise HTTPException(400, "That coupon has been fully claimed.")
    if kind not in (c.get("applies_to") or ["plan"]):
        raise HTTPException(400, f"That coupon cannot be used on a {kind} purchase.")
    if c.get("plan_codes") and plan_code not in c["plan_codes"]:
        raise HTTPException(400, "That coupon does not apply to the plan you picked.")
    used_here = await db.coupon_redemptions.count_documents(
        {"coupon_code": c["code"], "account_id": account_id})
    if c.get("per_account_cap") and used_here >= int(c["per_account_cap"]):
        raise HTTPException(400, "You have already used that coupon.")
    if c.get("first_purchase_only"):
        paid_before = await db.billing_payments.count_documents(
            {"account_id": account_id, "status": "paid"})
        if paid_before:
            raise HTTPException(400, "That coupon is for first purchases only.")

    if c["kind"] == "percent":
        discount = round(amount_paise * int(c["value"]) / 100)
        if c.get("max_discount_paise"):
            discount = min(discount, int(c["max_discount_paise"]))
    else:
        discount = int(c["value"])
    discount = max(0, min(discount, amount_paise))
    return {"coupon": c, "discount_paise": discount}


async def redeem_coupon(db, coupon: Optional[dict], *, account_id: str, payment_id: str,
                        discount_paise: int):
    if not coupon:
        return
    await db.coupon_redemptions.insert_one({
        "id": str(uuid.uuid4()), "coupon_code": coupon["code"], "account_id": account_id,
        "payment_id": payment_id, "discount_paise": discount_paise, "created_at": now_iso(),
    })
    await db.coupons.update_one({"code": coupon["code"]}, {"$inc": {"used_count": 1}})


# ─────────────────────────────────────────────────────────────────────────────
# Founding offer — first N accounts get Business yearly at a locked price.
# ─────────────────────────────────────────────────────────────────────────────
async def founding_spots_left(db, catalogue: dict) -> Optional[int]:
    f = catalogue["founding"]
    if not f.get("enabled"):
        return None
    taken = await db.subscriptions.count_documents({"founding_member": True})
    return max(0, int(f["seats"]) - taken)


async def founding_price_for(db, catalogue: dict, account_id: str,
                             plan_code: str) -> Optional[int]:
    """The founding price in paise if this purchase qualifies, else None.

    An existing founding member keeps the price on every renewal as long as
    they have not lapsed; `price_lock_paise` on the subscription carries it.
    """
    f = catalogue["founding"]
    sub = await db.subscriptions.find_one({"account_id": account_id}, {"_id": 0}) or {}
    wanted = P.plan_code(f["tier"], f["interval"])
    if plan_code != wanted:
        return None
    if sub.get("founding_member") and sub.get("price_lock_paise") is not None:
        return int(sub["price_lock_paise"])
    if not f.get("enabled"):
        return None
    left = await founding_spots_left(db, catalogue)
    return int(f["yearly_paise"]) if left and left > 0 else None


# ─────────────────────────────────────────────────────────────────────────────
# Referrals
# ─────────────────────────────────────────────────────────────────────────────
_ALPHABET = string.ascii_uppercase.replace("O", "").replace("I", "") + "23456789"


def _random_code(n: int = 7) -> str:
    return "".join(random.choice(_ALPHABET) for _ in range(n))


async def referral_code_for(db, account_id: str, *, name: str = "") -> str:
    row = await db.referrals.find_one({"account_id": account_id}, {"_id": 0, "code": 1})
    if row:
        return row["code"]
    stem = re.sub(r"[^A-Z]", "", (name or "").upper())[:4]
    for _ in range(10):
        code = (stem + _random_code(7 - len(stem)))[:8] or _random_code()
        if not await db.referrals.find_one({"code": code}):
            await db.referrals.insert_one({
                "id": str(uuid.uuid4()), "account_id": account_id, "code": code,
                "signups": 0, "converted": 0, "credits_awarded": 0,
                "created_at": now_iso(),
            })
            return code
    raise HTTPException(500, "Could not allocate a referral code")


async def record_referral_signup(db, *, code: str, new_account_id: str) -> Optional[dict]:
    """Attach a new signup to a referrer. Self-referral and repeats are ignored."""
    if not code:
        return None
    ref = await db.referrals.find_one({"code": code.strip().upper()}, {"_id": 0})
    if not ref or ref["account_id"] == new_account_id:
        return None
    if await db.referral_signups.find_one({"referee_account_id": new_account_id}):
        return None
    row = {
        "id": str(uuid.uuid4()), "code": ref["code"],
        "referrer_account_id": ref["account_id"], "referee_account_id": new_account_id,
        "status": "signed_up", "created_at": now_iso(),
    }
    await db.referral_signups.insert_one(dict(row))
    await db.referrals.update_one({"code": ref["code"]}, {"$inc": {"signups": 1}})
    return row


async def award_referral_on_first_payment(db, account_id: str, grant_credits) -> Optional[dict]:
    """Called after a payment succeeds: both sides get credits, once."""
    row = await db.referral_signups.find_one(
        {"referee_account_id": account_id, "status": "signed_up"}, {"_id": 0})
    if not row:
        return None
    paid = await db.billing_payments.count_documents({"account_id": account_id, "status": "paid"})
    if paid > 1:            # not their first paid purchase
        return None
    credits = P.REFERRAL_CREDITS
    await grant_credits(db, row["referrer_account_id"], credits, source="pack",
                        reason=f"Referral bonus — {account_id[:8]} subscribed")
    await grant_credits(db, account_id, credits, source="pack",
                        reason="Referral bonus — welcome to BillingsEasy")
    await db.referral_signups.update_one(
        {"id": row["id"]}, {"$set": {"status": "converted", "converted_at": now_iso(),
                                     "credits_each": credits}})
    await db.referrals.update_one({"code": row["code"]},
                                  {"$inc": {"converted": 1, "credits_awarded": credits * 2}})
    return {**row, "credits_each": credits}


async def referral_summary(db, account_id: str, name: str = "") -> Dict[str, Any]:
    code = await referral_code_for(db, account_id, name=name)
    row = await db.referrals.find_one({"account_id": account_id}, {"_id": 0}) or {}
    return {
        "code": code,
        "signups": row.get("signups", 0),
        "converted": row.get("converted", 0),
        "credits_awarded": row.get("credits_awarded", 0),
        "credits_each": P.REFERRAL_CREDITS,
    }
