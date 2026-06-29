"""Plan catalogue + hard limits enforced via middleware-like checks.

Pricing model (Jun 2026 onwards):
- Starter   ₹499/mo or ₹4,990/yr  — Freelancers / small shops
- Growth    ₹999/mo or ₹9,999/yr  — Most popular (retail/distributors)
- Business  ₹2,499/mo or ₹24,990/yr — Multi-branch, advanced perms
- Enterprise — Custom (contact sales)

Yearly plans = 2 months free (10× monthly cost). Old codes are kept in
LEGACY_PLAN_CODES so existing organisations stay readable; subscribers on
those codes are flagged `needs_replan` and prompted to pick a new plan.
"""
from typing import Dict, Any, List

# Currency string formatter is FE concern; here we keep raw INR amounts.

PLAN_TIERS = {
    "STARTER": {
        "tier": "STARTER", "name": "Starter",
        "tagline": "For freelancers, home businesses & small shops",
        "monthly_code": "STARTER_499", "monthly_amount": 499,
        "yearly_code": "STARTER_4990", "yearly_amount": 4990,
        "limits": {"users": 1, "invoices_per_month": 500, "products": 500, "storage_mb": 500, "branches": 1},
        "features": [
            "1 user",
            "500 invoices / month",
            "Customer & supplier management",
            "Product / inventory catalogue",
            "GST invoices with PDF",
            "Basic reports (sales, GST)",
            "Email support",
        ],
        "best_for": ["Freelancers", "Small shops", "Home businesses"],
        "highlight": False,
    },
    "GROWTH": {
        "tier": "GROWTH", "name": "Growth",
        "tagline": "Everything you need to scale a retail or distribution business",
        "monthly_code": "GROWTH_999", "monthly_amount": 999,
        "yearly_code": "GROWTH_9999", "yearly_amount": 9999,
        "limits": {"users": 5, "invoices_per_month": -1, "products": -1, "storage_mb": 5000, "branches": 1},
        "features": [
            "5 users",
            "Unlimited invoices",
            "GST billing (GSTR-1, GSTR-3B, HSN)",
            "Inventory management",
            "Expense tracking",
            "Basic analytics & dashboards",
            "Role-based access (RBAC)",
            "WhatsApp invoice sharing",
            "Priority support",
        ],
        "best_for": ["Retail stores", "Distributors", "Small companies"],
        "highlight": True,
        "badge": "Most Popular",
    },
    "BUSINESS": {
        "tier": "BUSINESS", "name": "Business",
        "tagline": "Multi-branch, audit-grade controls for growing teams",
        "monthly_code": "BUSINESS_2499", "monthly_amount": 2499,
        "yearly_code": "BUSINESS_24990", "yearly_amount": 24990,
        "limits": {"users": 25, "invoices_per_month": -1, "products": -1, "storage_mb": 20000, "branches": -1},
        "features": [
            "25 users",
            "Multiple branches",
            "Advanced permissions & custom roles",
            "Audit logs",
            "Advanced reports (P&L, balance sheet, cash flow)",
            "API access",
            "Custom invoice templates",
            "Priority support",
        ],
        "best_for": ["Medium-sized businesses", "Growing distributors"],
        "highlight": False,
    },
    "ENTERPRISE": {
        "tier": "ENTERPRISE", "name": "Enterprise",
        "tagline": "Tailored to your organisation — talk to us",
        "monthly_code": "ENTERPRISE_CUSTOM", "monthly_amount": 0,
        "yearly_code": "ENTERPRISE_CUSTOM", "yearly_amount": 0,
        "limits": {"users": -1, "invoices_per_month": -1, "products": -1, "storage_mb": -1, "branches": -1},
        "features": [
            "Unlimited users",
            "SSO (SAML / OAuth)",
            "Dedicated account manager",
            "Custom integrations",
            "White-labeling",
            "SLA-backed support",
        ],
        "best_for": ["Large organisations", "Multi-state chains"],
        "highlight": False,
        "is_custom": True,
    },
}


# Flat lookup keyed by plan code (used by /billing/subscribe + middleware).
def _build_plans() -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for t in PLAN_TIERS.values():
        if not t.get("is_custom"):
            out[t["monthly_code"]] = {
                "code": t["monthly_code"], "tier": t["tier"], "name": t["name"],
                "amount": t["monthly_amount"], "interval": "month",
                "label": f"₹{t['monthly_amount']:,} / month",
                "limits": t["limits"], "features": t["features"],
            }
            out[t["yearly_code"]] = {
                "code": t["yearly_code"], "tier": t["tier"], "name": t["name"],
                "amount": t["yearly_amount"], "interval": "year",
                "label": f"₹{t['yearly_amount']:,} / year (save 2 months)",
                "limits": t["limits"], "features": t["features"],
            }
    # Enterprise (custom) — single code, amount 0 (handled separately)
    out["ENTERPRISE_CUSTOM"] = {
        "code": "ENTERPRISE_CUSTOM", "tier": "ENTERPRISE", "name": "Enterprise",
        "amount": 0, "interval": "custom", "label": "Custom",
        "limits": PLAN_TIERS["ENTERPRISE"]["limits"],
        "features": PLAN_TIERS["ENTERPRISE"]["features"],
    }
    return out


PLANS = _build_plans()


# Add-ons — display only (marketing). No billing impact yet.
ADDONS: List[Dict[str, Any]] = [
    {"code": "ADDON_USER",      "name": "Additional user",     "amount": 99,  "interval": "month",
     "description": "Add an extra team member beyond your plan cap."},
    {"code": "ADDON_BRANCH",    "name": "Extra branch",        "amount": 199, "interval": "month",
     "description": "Additional shop/branch with its own books."},
    {"code": "ADDON_BRANDING",  "name": "Custom branding",     "amount": 299, "interval": "month",
     "description": "Use your own logo & colours on PDFs and the portal."},
    {"code": "ADDON_WHATSAPP",  "name": "WhatsApp automation", "amount": 499, "interval": "month",
     "description": "Auto-send invoices & overdue reminders via WhatsApp."},
    {"code": "ADDON_API",       "name": "API access",          "amount": 999, "interval": "month",
     "description": "Programmatic access to your BillEasy data."},
    {"code": "ADDON_STORAGE",   "name": "Extra storage (5 GB)", "amount": 99,  "interval": "month",
     "description": "Bump your attachment storage by 5 GB."},
]


# Plans we used to charge but no longer offer. Existing subscribers stay
# readable but their `subscription_status` will be flagged needs_replan.
LEGACY_PLAN_CODES = {
    "FREE", "STARTER_199", "PRO_999", "ENTERPRISE_4999",
    "MONTHLY_199", "YEARLY_1990",
}


def is_legacy_plan(plan_code: str | None) -> bool:
    if not plan_code:
        return False
    return plan_code in LEGACY_PLAN_CODES or plan_code not in PLANS


def get_plan(plan_code: str | None) -> Dict[str, Any] | None:
    if not plan_code:
        return None
    return PLANS.get(plan_code)


def get_plan_limits(plan_code: str | None) -> dict:
    """Resolve limits — falls back to Starter limits for legacy/unknown codes."""
    plan = PLANS.get(plan_code or "")
    if plan:
        return plan["limits"]
    return PLAN_TIERS["STARTER"]["limits"]


def public_pricing() -> Dict[str, Any]:
    """Shape consumed by both the in-app /billing page and the public landing page."""
    return {
        "tiers": [
            {
                "tier": t["tier"], "name": t["name"], "tagline": t["tagline"],
                "monthly_code": t["monthly_code"], "monthly_amount": t["monthly_amount"],
                "yearly_code": t["yearly_code"], "yearly_amount": t["yearly_amount"],
                "limits": t["limits"], "features": t["features"],
                "best_for": t["best_for"], "highlight": t.get("highlight", False),
                "badge": t.get("badge"), "is_custom": t.get("is_custom", False),
            }
            for t in PLAN_TIERS.values()
        ],
        "addons": ADDONS,
    }


async def org_usage(db, org_id: str) -> dict:
    """Live usage counters used by billing page + limit checks."""
    from datetime import datetime, timezone
    month_prefix = datetime.now(timezone.utc).strftime("%Y-%m")
    users = await db.memberships.count_documents({"org_id": org_id})
    invoices_month = await db.invoices.count_documents(
        {"org_id": org_id, "type": "sale", "invoice_date": {"$regex": f"^{month_prefix}"}})
    products = await db.products.count_documents({"org_id": org_id})
    return {"users": users, "invoices_this_month": invoices_month, "products": products}


async def check_limit(db, org, kind: str):
    """Raise HTTPException(402) when kind ('users'|'invoice'|'product') would exceed plan."""
    from fastapi import HTTPException
    plan_code = org.get("plan_code")
    limits = get_plan_limits(plan_code)
    usage = await org_usage(db, org["id"])
    cap_map = {"users": ("users", "users"),
               "invoice": ("invoices_per_month", "invoices_this_month"),
               "product": ("products", "products")}
    if kind not in cap_map:
        return
    limit_key, usage_key = cap_map[kind]
    cap = limits.get(limit_key, -1)
    if cap == -1:
        return
    if usage[usage_key] >= cap:
        raise HTTPException(
            402,
            f"Plan limit reached: {usage[usage_key]}/{cap} {limit_key}. Upgrade to continue.",
        )
