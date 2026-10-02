"""Subscription catalogue — the one place prices, limits and features live.

The subscription belongs to the **login** (a user account), not to a business.
Every business under that login shares the plan, the user seats and the AI
credit balance. See `subscriptions.py` for the runtime state built on top of
this catalogue.

Money is in **paise** everywhere in this module (₹1,499 -> 149900). Prices here
exclude GST; 18% is added at checkout.

Changing prices
---------------
Edit PLAN_TIERS / ADDONS / CREDIT_PACKS below, or override them at runtime
without a deploy by writing a `pricing_catalogue` document into
`db.platform_settings` (see `load_catalogue`). The document only needs the keys
it changes; everything else falls back to the values here.
"""
from typing import Any, Dict, List, Optional

GST_RATE_PCT = 18
SUBSCRIPTION_SAC = "998314"          # Information technology consultancy services
UNLIMITED = -1

# ─────────────────────────────────────────────────────────────────────────────
# Features. A plan lists the keys it unlocks; `has_feature` is the only check.
# ─────────────────────────────────────────────────────────────────────────────
FEATURES = {
    "gst_invoices":     "GST invoices",
    "whatsapp_share":   "WhatsApp invoice sharing",
    "inventory_basic":  "Basic inventory & barcode",
    "inventory_full":   "Full inventory & barcode",
    "gst_returns":      "GSTR-1 / GSTR-3B reports",
    "eway_bills":       "E-way bills",
    "einvoicing":       "E-invoicing (IRN)",
    "staff_roles":      "Staff roles & activity log",
    "remove_branding":  "Remove the BillingsEasy footer",
}

# Error codes the apps turn into upgrade prompts.
ERR_BUSINESSES   = "PLAN_LIMIT_BUSINESSES"
ERR_USERS        = "PLAN_LIMIT_USERS"
ERR_DEVICES      = "PLAN_LIMIT_DEVICES"
ERR_FEATURE      = "FEATURE_NOT_IN_PLAN"
ERR_CREDITS      = "INSUFFICIENT_CREDITS"


# ─────────────────────────────────────────────────────────────────────────────
# Plans
# ─────────────────────────────────────────────────────────────────────────────
PLAN_TIERS: Dict[str, Dict[str, Any]] = {
    "FREE": {
        "tier": "FREE", "name": "Free", "order": 0,
        "tagline": "Bill for free, for as long as you like",
        "monthly_paise": 0, "yearly_paise": 0,
        "limits": {"businesses": 1, "users": 1, "devices": 1},
        "features": ["gst_invoices", "whatsapp_share", "inventory_basic"],
        "signup_credits": 50,          # one-time, never expires
        "credits_per_year": 0,
        "support": "Help centre",
    },
    "STARTER": {
        "tier": "STARTER", "name": "Starter", "order": 1,
        "tagline": "For a single shop finding its feet",
        "monthly_paise": 17900, "yearly_paise": 149900,
        "limits": {"businesses": 2, "users": 1, "devices": UNLIMITED},
        "features": ["gst_invoices", "whatsapp_share", "inventory_full",
                     "gst_returns", "remove_branding"],
        "signup_credits": 0,
        "credits_per_year": 300,
        "support": "Chat",
    },
    "BUSINESS": {
        "tier": "BUSINESS", "name": "Business", "order": 2,
        "tagline": "For growing businesses with a team",
        "monthly_paise": 29900, "yearly_paise": 249900,
        "limits": {"businesses": 5, "users": 3, "devices": UNLIMITED},
        "features": ["gst_invoices", "whatsapp_share", "inventory_full",
                     "gst_returns", "remove_branding", "eway_bills", "staff_roles"],
        "signup_credits": 0,
        "credits_per_year": 1000,
        "support": "Chat + phone",
        "highlight": True, "badge": "Most Popular",
    },
    "PRO": {
        "tier": "PRO", "name": "Pro", "order": 3,
        "tagline": "Every business you run, every feature we have",
        "monthly_paise": 69900, "yearly_paise": 599900,
        "limits": {"businesses": UNLIMITED, "users": 10, "devices": UNLIMITED},
        "features": ["gst_invoices", "whatsapp_share", "inventory_full",
                     "gst_returns", "remove_branding", "eway_bills", "staff_roles",
                     "einvoicing"],
        "signup_credits": 0,
        "credits_per_year": 5000,
        "support": "Priority + onboarding call",
    },
}

TIER_ORDER = ["FREE", "STARTER", "BUSINESS", "PRO"]

# Plan codes are "<TIER>_<INTERVAL>", e.g. BUSINESS_YEARLY. FREE has no interval.
FREE_CODE = "FREE"


def plan_code(tier: str, interval: str) -> str:
    tier = tier.upper()
    if tier == "FREE":
        return FREE_CODE
    return f"{tier}_{'YEARLY' if interval == 'year' else 'MONTHLY'}"


# ─────────────────────────────────────────────────────────────────────────────
# Add-ons and credit packs
# ─────────────────────────────────────────────────────────────────────────────
ADDONS: Dict[str, Dict[str, Any]] = {
    "EXTRA_BUSINESS": {
        "code": "EXTRA_BUSINESS", "name": "Extra business", "unit": "business",
        "yearly_paise": 49900, "interval": "year",
        "available_on": ["STARTER", "BUSINESS"],      # Pro is already unlimited
        "description": "One more business under the same login, with its own books.",
    },
    "EXTRA_USER": {
        "code": "EXTRA_USER", "name": "Extra user", "unit": "user",
        "yearly_paise": 39900, "interval": "year",
        "available_on": ["BUSINESS", "PRO"],
        "description": "One more team member beyond your plan's seats.",
    },
}

CREDIT_PACKS: List[Dict[str, Any]] = [
    {"code": "PACK_100",  "name": "100 credits",   "credits": 100,  "paise": 9900},
    {"code": "PACK_500",  "name": "500 credits",   "credits": 500,  "paise": 39900,
     "badge": "Most Popular"},
    {"code": "PACK_1000", "name": "1,000 credits", "credits": 1000, "paise": 69900,
     "badge": "Best Value"},
]

# One AI scan = one credit.
CREDITS_PER_SCAN = 1
LOW_CREDIT_THRESHOLD = 10

# Trial / grace / reminders (days)
TRIAL_DAYS = 14
TRIAL_TIER = "BUSINESS"
GRACE_DAYS = 7
RENEWAL_REMINDER_DAYS = [15, 7, 1]

# Founding offer — first N accounts get Business yearly at this price, locked
# for as long as they keep renewing without a gap.
FOUNDING_OFFER = {
    "enabled": True,
    "tier": "BUSINESS",
    "interval": "year",
    "seats": 500,
    "yearly_paise": 199900,
    "label": "Founding member price",
}

# 2-year plans: pay for 21 months, get 24.
MULTIYEAR = {"years": 2, "months_charged": 21, "months_given": 24}

REFERRAL_CREDITS = 200          # to referrer and referee, on the referee's first paid purchase


# ─────────────────────────────────────────────────────────────────────────────
# Legacy codes — orgs priced under the old per-organisation catalogue.
# ─────────────────────────────────────────────────────────────────────────────
LEGACY_PLAN_MAP = {
    "STARTER_499": "STARTER_MONTHLY", "STARTER_4990": "STARTER_YEARLY",
    "GROWTH_999": "BUSINESS_MONTHLY", "GROWTH_9999": "BUSINESS_YEARLY",
    "BUSINESS_2499": "PRO_MONTHLY",   "BUSINESS_24990": "PRO_YEARLY",
    "ENTERPRISE_CUSTOM": "PRO_YEARLY",
    "MONTHLY_199": "STARTER_MONTHLY", "YEARLY_1990": "STARTER_YEARLY",
    "STARTER_199": "STARTER_MONTHLY", "PRO_999": "BUSINESS_MONTHLY",
    "ENTERPRISE_4999": "PRO_YEARLY",
}


# ─────────────────────────────────────────────────────────────────────────────
# Catalogue access
# ─────────────────────────────────────────────────────────────────────────────
def _build_plans(tiers: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for t in tiers.values():
        if t["tier"] == "FREE":
            out[FREE_CODE] = {
                "code": FREE_CODE, "tier": "FREE", "name": t["name"],
                "interval": "none", "paise": 0,
                "limits": t["limits"], "features": t["features"],
                "credits_per_period": 0, "support": t["support"],
            }
            continue
        for interval, key in (("month", "monthly_paise"), ("year", "yearly_paise")):
            code = plan_code(t["tier"], interval)
            per_period = t["credits_per_year"] if interval == "year" else \
                round(t["credits_per_year"] / 12)
            out[code] = {
                "code": code, "tier": t["tier"], "name": t["name"],
                "interval": interval, "paise": t[key],
                "limits": t["limits"], "features": t["features"],
                "credits_per_period": per_period, "support": t["support"],
            }
    return out


PLANS: Dict[str, Dict[str, Any]] = _build_plans(PLAN_TIERS)


async def load_catalogue(db) -> Dict[str, Any]:
    """Catalogue with any super-admin price overrides applied.

    The override document is a partial: {"tiers": {"BUSINESS": {"yearly_paise": 199900}},
    "packs": [...], "founding": {...}} — anything missing falls back to the code.
    """
    row = await db.platform_settings.find_one({"id": "pricing_catalogue"}, {"_id": 0}) or {}
    tiers = {k: dict(v) for k, v in PLAN_TIERS.items()}
    for tier, patch in (row.get("tiers") or {}).items():
        if tier in tiers and isinstance(patch, dict):
            tiers[tier].update({k: v for k, v in patch.items() if k != "tier"})
    return {
        "tiers": tiers,
        "plans": _build_plans(tiers),
        "addons": {**ADDONS, **(row.get("addons") or {})},
        "packs": row.get("packs") or CREDIT_PACKS,
        "founding": {**FOUNDING_OFFER, **(row.get("founding") or {})},
        "multiyear": {**MULTIYEAR, **(row.get("multiyear") or {})},
    }


def normalise_code(code: Optional[str]) -> str:
    """Old or unknown plan code -> a code in the current catalogue."""
    if not code:
        return FREE_CODE
    if code in PLANS:
        return code
    return LEGACY_PLAN_MAP.get(code, FREE_CODE)


def get_plan(code: Optional[str], catalogue: Optional[dict] = None) -> Dict[str, Any]:
    plans = (catalogue or {}).get("plans") or PLANS
    return plans.get(normalise_code(code)) or plans[FREE_CODE]


def plan_limits(code: Optional[str], catalogue: Optional[dict] = None) -> Dict[str, int]:
    return dict(get_plan(code, catalogue)["limits"])


def has_feature(code: Optional[str], feature: str, catalogue: Optional[dict] = None) -> bool:
    return feature in get_plan(code, catalogue)["features"]


def tier_rank(code: Optional[str]) -> int:
    tier = get_plan(code)["tier"]
    return TIER_ORDER.index(tier) if tier in TIER_ORDER else 0


def is_upgrade(from_code: Optional[str], to_code: Optional[str]) -> bool:
    return tier_rank(to_code) > tier_rank(from_code)


def cheapest_plan_with(feature: str, catalogue: Optional[dict] = None) -> Optional[Dict[str, Any]]:
    """The plan to name in an upgrade prompt: lowest tier that unlocks `feature`."""
    plans = (catalogue or {}).get("plans") or PLANS
    yearly = [p for p in plans.values() if p["interval"] in ("year", "none")]
    for tier in TIER_ORDER:
        for p in yearly:
            if p["tier"] == tier and feature in p["features"]:
                return p
    return None


def cheapest_plan_for_limit(kind: str, needed: int,
                            catalogue: Optional[dict] = None) -> Optional[Dict[str, Any]]:
    """Lowest yearly plan whose `kind` limit covers `needed`."""
    plans = (catalogue or {}).get("plans") or PLANS
    for tier in TIER_ORDER:
        for p in plans.values():
            if p["tier"] != tier or p["interval"] not in ("year", "none"):
                continue
            cap = p["limits"].get(kind, 0)
            if cap == UNLIMITED or cap >= needed:
                return p
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Money helpers — paise in, paise out. Rupee conversion only at the edges.
# ─────────────────────────────────────────────────────────────────────────────
def gst_on(paise: int) -> int:
    return round(paise * GST_RATE_PCT / 100)


def with_gst(paise: int) -> int:
    return paise + gst_on(paise)


def rupees(paise: int) -> float:
    return round(paise / 100, 2)


def fmt_inr(paise: int) -> str:
    """₹1,49,900 paise -> '₹1,499' (Indian digit grouping, no paise when round)."""
    whole, rem = divmod(int(paise), 100)
    s = str(whole)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:]); head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts + [tail])
    return f"₹{s}" + (f".{rem:02d}" if rem else "")


def public_pricing(catalogue: Dict[str, Any], spots_left: Optional[int] = None) -> Dict[str, Any]:
    """Shape consumed by the public pricing page and the in-app plan picker."""
    tiers = sorted(catalogue["tiers"].values(), key=lambda t: t["order"])
    founding = catalogue["founding"]
    out_tiers = []
    for t in tiers:
        monthly, yearly = t["monthly_paise"], t["yearly_paise"]
        save_pct = 0
        if monthly and yearly:
            save_pct = round(100 - (yearly / (monthly * 12)) * 100)
        out_tiers.append({
            "tier": t["tier"], "name": t["name"], "tagline": t["tagline"],
            "order": t["order"],
            "monthly_paise": monthly, "yearly_paise": yearly,
            "monthly_label": fmt_inr(monthly) if monthly else None,
            "yearly_label": fmt_inr(yearly) if yearly else "₹0",
            "yearly_save_pct": save_pct,
            "monthly_code": plan_code(t["tier"], "month") if monthly else None,
            "yearly_code": plan_code(t["tier"], "year") if t["tier"] != "FREE" else FREE_CODE,
            "limits": t["limits"],
            "features": t["features"],
            "feature_labels": [FEATURES[f] for f in t["features"] if f in FEATURES],
            "credits_per_year": t["credits_per_year"],
            "signup_credits": t.get("signup_credits", 0),
            "support": t["support"],
            "highlight": t.get("highlight", False),
            "badge": t.get("badge"),
        })
    max_save = max([t["yearly_save_pct"] for t in out_tiers] or [0])
    return {
        "tiers": out_tiers,
        "features": FEATURES,
        "feature_order": list(FEATURES),
        "addons": list(catalogue["addons"].values()),
        "packs": catalogue["packs"],
        "gst_pct": GST_RATE_PCT,
        "max_yearly_save_pct": max_save,
        "trial_days": TRIAL_DAYS,
        "trial_tier": TRIAL_TIER,
        "multiyear": catalogue["multiyear"],
        "founding": ({**founding, "spots_left": spots_left,
                      "label_price": fmt_inr(founding["yearly_paise"])}
                     if founding.get("enabled") else None),
    }
