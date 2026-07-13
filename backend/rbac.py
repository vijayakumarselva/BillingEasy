"""RBAC + Audit logging primitives for BillEasy."""
from __future__ import annotations
import secrets
import time
from datetime import datetime, timezone
from collections import defaultdict, deque
from typing import Any, Dict, Optional, List

# ---------------- Permission catalogue ----------------
PERMISSIONS: List[str] = [
    # Sales / Invoices
    "invoice.view", "invoice.create", "invoice.edit", "invoice.delete",
    # Purchases / Bills
    "purchase.view", "purchase.create", "purchase.delete",
    # Parties (Customers & Suppliers)
    "party.view", "party.create", "party.edit", "party.delete",
    # Products & Stock
    "product.view", "product.create", "product.edit", "product.delete",
    # Payments
    "payment.view", "payment.create", "payment.delete",
    # Expenses
    "expense.view", "expense.create", "expense.delete",
    # GST / Reports
    "gst.view", "report.view", "data.export",
    # TDS
    "tds.view", "tds.create",
    # Org Settings
    "settings.view", "settings.edit",
    # Team & RBAC
    "user.invite", "user.remove", "role.manage",
    # Billing
    "billing.view", "billing.manage",
    # Audit logs
    "audit.view",
]

# System roles (cannot be deleted; can be referenced by slug)
SYSTEM_ROLES: Dict[str, Dict[str, Any]] = {
    "owner": {
        "name": "Owner",
        "description": "Full control of the organization, billing, team, and data.",
        "permissions": ["*"],
        "allowed_modes": [],  # empty = unrestricted
        "is_system": True,
    },
    "accountant": {
        "name": "Accountant",
        "description": "Manages books, GST returns and reports. Cannot manage billing or team.",
        "permissions": [
            "invoice.*", "purchase.*", "payment.*", "expense.*",
            "party.*", "product.*",
            "gst.view", "report.view", "data.export",
            "tds.*", "settings.view", "audit.view",
        ],
        "allowed_modes": [],  # unrestricted
        "is_system": True,
    },
    "sales": {
        "name": "Sales Staff",
        "description": "Creates invoices and records customer payments. View-only on products & reports.",
        "permissions": [
            "invoice.view", "invoice.create", "invoice.edit",
            "party.view", "party.create",
            "product.view",
            "payment.view", "payment.create",
            "settings.view",
        ],
        "allowed_modes": [],  # unrestricted
        "is_system": True,
    },
    "pos-staff": {
        "name": "POS Staff",
        "description": "Counter billing only. Can only access POS & B2C screens. No accounting, GST or settings.",
        "permissions": [
            "invoice.view", "invoice.create",
            "product.view",
            "party.view", "party.create",
            "payment.view", "payment.create",
        ],
        "allowed_modes": ["pos", "b2c"],  # locked to POS/B2C only
        "is_system": True,
    },
    "restaurant-staff": {
        "name": "Restaurant Staff",
        "description": "Restaurant orders and KOT only. Cannot access B2B invoices, accounting or settings.",
        "permissions": [
            "invoice.view", "invoice.create",
            "product.view",
            "party.view",
            "expense.view", "expense.create",
        ],
        "allowed_modes": ["restaurant"],  # locked to restaurant only
        "is_system": True,
    },
    "b2b-staff": {
        "name": "B2B Staff",
        "description": "B2B invoicing and purchases only. Cannot access POS, Restaurant or accounting.",
        "permissions": [
            "invoice.view", "invoice.create", "invoice.edit",
            "purchase.view", "purchase.create",
            "party.view", "party.create",
            "product.view",
            "payment.view", "payment.create",
            "settings.view",
        ],
        "allowed_modes": ["b2b"],  # locked to B2B only
        "is_system": True,
    },
}


def expand_permissions(perms: List[str]) -> set:
    """Expand wildcards. '*' = all. 'invoice.*' = invoice.view, invoice.create, ..."""
    out: set = set()
    if "*" in perms:
        return set(PERMISSIONS)
    for p in perms:
        if p.endswith(".*"):
            prefix = p[:-2] + "."
            for full in PERMISSIONS:
                if full.startswith(prefix):
                    out.add(full)
        elif p in PERMISSIONS:
            out.add(p)
    return out


async def resolve_permissions(db, role_slug: str, org_id: str) -> set:
    """Get the effective permission set for a role slug within an org."""
    if role_slug in SYSTEM_ROLES:
        return expand_permissions(SYSTEM_ROLES[role_slug]["permissions"])
    custom = await db.roles.find_one({"slug": role_slug, "org_id": org_id}, {"_id": 0})
    if not custom:
        return set()
    return expand_permissions(custom.get("permissions", []))


async def resolve_allowed_modes(db, role_slug: str, org_id: str) -> List[str]:
    """Return allowed business modes for a role. Empty list = unrestricted (sees all modes)."""
    if role_slug in SYSTEM_ROLES:
        return SYSTEM_ROLES[role_slug].get("allowed_modes", [])
    custom = await db.roles.find_one({"slug": role_slug, "org_id": org_id}, {"_id": 0})
    if not custom:
        return []
    return custom.get("allowed_modes", [])


async def ensure_system_roles(db, org_id: str):
    """Idempotently create system role rows for an org so the UI can list them."""
    for slug, role in SYSTEM_ROLES.items():
        exists = await db.roles.find_one({"slug": slug, "org_id": org_id, "is_system": True})
        if not exists:
            await db.roles.insert_one({
                "id": f"sys-{slug}-{org_id}",
                "org_id": org_id,
                "slug": slug,
                "name": role["name"],
                "description": role["description"],
                "permissions": role["permissions"],
                "allowed_modes": role.get("allowed_modes", []),
                "is_system": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        else:
            # Keep allowed_modes up to date even for existing rows
            await db.roles.update_one(
                {"slug": slug, "org_id": org_id, "is_system": True},
                {"$set": {"allowed_modes": role.get("allowed_modes", [])}}
            )


# ---------------- Audit log ----------------
async def audit_log(db, *, org_id: str, user: dict, action: str,
                    entity_type: Optional[str] = None, entity_id: Optional[str] = None,
                    metadata: Optional[dict] = None, request=None):
    ip = ""
    ua = ""
    if request is not None:
        ip = (request.headers.get("x-forwarded-for") or
              (request.client.host if request.client else "")).split(",")[0].strip()
        ua = request.headers.get("user-agent", "")[:200]
    await db.audit_logs.insert_one({
        "id": secrets.token_hex(8),
        "org_id": org_id,
        "user_id": user.get("id"),
        "user_email": user.get("email"),
        "user_name": user.get("name"),
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "metadata": metadata or {},
        "ip": ip, "user_agent": ua,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


# ---------------- Rate limiting (in-process, per-IP) ----------------
class RateLimiter:
    def __init__(self):
        self._hits: Dict[str, deque] = defaultdict(deque)

    def hit(self, key: str, max_hits: int, window_seconds: int) -> bool:
        """Returns True if allowed, False if over the limit."""
        now = time.time()
        q = self._hits[key]
        while q and now - q[0] > window_seconds:
            q.popleft()
        if len(q) >= max_hits:
            return False
        q.append(now)
        return True


limiter = RateLimiter()


def client_ip(request) -> str:
    if not request:
        return "unknown"
    return (request.headers.get("x-forwarded-for")
            or (request.client.host if request.client else "unknown")).split(",")[0].strip()
