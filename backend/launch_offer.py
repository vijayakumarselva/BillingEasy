"""Configurable launch / promotional offer stored in MongoDB (system_settings).

Single document: id == "launch_offer". Schema:
{
  id: "launch_offer",
  enabled: bool,
  title: str,                # e.g. "Launch Offer 🎉"
  description: str,          # e.g. "Growth Plan ₹699/month for the first 3 months"
  plan_codes: [str],         # applicable plan codes (e.g. ["GROWTH_999"])
  discount_pct: int,         # 0-100
  duration_months: int,      # how many billing cycles the discount applies for
  starts_at: iso str | null,
  ends_at: iso str | null,
  updated_at: iso, updated_by: email,
}
"""
from datetime import datetime, timezone
from typing import Any, Dict, Optional

SETTINGS_ID = "launch_offer"


def now_dt() -> datetime:
    return datetime.now(timezone.utc)


def _is_within_window(doc: Dict[str, Any]) -> bool:
    now = now_dt()
    starts = doc.get("starts_at")
    ends = doc.get("ends_at")
    if starts:
        try:
            if datetime.fromisoformat(starts) > now:
                return False
        except Exception:
            pass
    if ends:
        try:
            if datetime.fromisoformat(ends) < now:
                return False
        except Exception:
            pass
    return True


async def load_offer(db) -> Dict[str, Any]:
    doc = await db.system_settings.find_one({"id": SETTINGS_ID}, {"_id": 0})
    if not doc:
        return {
            "id": SETTINGS_ID, "enabled": False,
            "title": "", "description": "",
            "plan_codes": [], "discount_pct": 0, "duration_months": 0,
            "starts_at": None, "ends_at": None,
            "updated_at": None, "updated_by": None,
        }
    return doc


async def save_offer(db, *, enabled: bool, title: str, description: str,
                     plan_codes: list, discount_pct: int, duration_months: int,
                     starts_at: Optional[str], ends_at: Optional[str],
                     updated_by: str, now_iso: str) -> Dict[str, Any]:
    update = {
        "id": SETTINGS_ID,
        "enabled": bool(enabled),
        "title": title.strip(),
        "description": description.strip(),
        "plan_codes": list(plan_codes or []),
        "discount_pct": max(0, min(100, int(discount_pct or 0))),
        "duration_months": max(0, int(duration_months or 0)),
        "starts_at": starts_at or None,
        "ends_at": ends_at or None,
        "updated_at": now_iso,
        "updated_by": updated_by,
    }
    await db.system_settings.update_one({"id": SETTINGS_ID}, {"$set": update}, upsert=True)
    return await db.system_settings.find_one({"id": SETTINGS_ID}, {"_id": 0})


async def public_offer(db) -> Dict[str, Any]:
    """Sanitised offer for public consumption — empty/disabled outside window."""
    doc = await load_offer(db)
    active = doc.get("enabled") and _is_within_window(doc)
    return {
        "active": bool(active),
        "title": doc.get("title", ""),
        "description": doc.get("description", ""),
        "plan_codes": doc.get("plan_codes", []),
        "discount_pct": doc.get("discount_pct", 0),
        "duration_months": doc.get("duration_months", 0),
        "starts_at": doc.get("starts_at"),
        "ends_at": doc.get("ends_at"),
    }


def admin_view(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "enabled": bool(doc.get("enabled")),
        "title": doc.get("title", ""),
        "description": doc.get("description", ""),
        "plan_codes": doc.get("plan_codes", []),
        "discount_pct": doc.get("discount_pct", 0),
        "duration_months": doc.get("duration_months", 0),
        "starts_at": doc.get("starts_at"),
        "ends_at": doc.get("ends_at"),
        "updated_at": doc.get("updated_at"),
        "updated_by": doc.get("updated_by"),
        "currently_active": bool(doc.get("enabled") and _is_within_window(doc)),
    }
