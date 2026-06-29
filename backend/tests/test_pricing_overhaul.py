"""Backend regression tests for the pricing overhaul + launch offer + legacy plan flagging.

Covers:
- GET /api/public/pricing (no auth)
- GET /api/billing/plans (auth)
- POST /api/billing/subscribe (mock auth_link + ENTERPRISE_CUSTOM 400)
- GET/POST /api/super/settings/launch-offer (super admin)
- /api/billing/status needs_replan detection for legacy plan codes
- 403 enforcement for non-super-admin on launch-offer routes
- Audit log entry for launch_offer.updated

Resets launch offer + Vijay Traders org plan_code at teardown.
"""
import os
import time
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback for inside-container testing
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "billeasy_db")

SUPER_EMAIL = "super@billeasy.in"
SUPER_PASS = "super123"
OWNER_EMAIL = "owner@vijaytraders.in"
OWNER_PASS = "admin123"


# -------------- Fixtures --------------

@pytest.fixture(scope="session")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Login failed for {email}: {r.status_code} {r.text}")
    return r.json()


@pytest.fixture(scope="session")
def super_token():
    return _login(SUPER_EMAIL, SUPER_PASS)["token"]


@pytest.fixture(scope="session")
def owner_login():
    return _login(OWNER_EMAIL, OWNER_PASS)


@pytest.fixture(scope="session")
def owner_token(owner_login):
    return owner_login["token"]


@pytest.fixture(scope="session")
def owner_org_id(owner_login):
    return owner_login["org_id"]


@pytest.fixture(scope="session", autouse=True)
def _reset_state_after(mongo, owner_org_id):
    """Backup org.plan_code + launch offer state; restore after the session."""
    org = mongo.organizations.find_one({"id": owner_org_id}, {"plan_code": 1})
    original_plan_code = org.get("plan_code") if org else None
    original_offer = mongo.system_settings.find_one({"id": "launch_offer"}, {"_id": 0})
    yield
    # Restore plan_code
    mongo.organizations.update_one(
        {"id": owner_org_id}, {"$set": {"plan_code": original_plan_code}}
    )
    # Reset offer to disabled (preserve original if existed, else delete)
    if original_offer:
        mongo.system_settings.replace_one({"id": "launch_offer"}, original_offer, upsert=True)
        # Force disable to be safe
        mongo.system_settings.update_one({"id": "launch_offer"}, {"$set": {"enabled": False}})
    else:
        mongo.system_settings.delete_one({"id": "launch_offer"})


# -------------- Public pricing --------------

class TestPublicPricing:
    def test_public_pricing_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/public/pricing", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "tiers" in data and "addons" in data and "launch_offer" in data

        tiers = {t["tier"]: t for t in data["tiers"]}
        assert set(tiers.keys()) == {"STARTER", "GROWTH", "BUSINESS", "ENTERPRISE"}

        # Verify amounts and codes
        assert tiers["STARTER"]["monthly_code"] == "STARTER_499"
        assert tiers["STARTER"]["monthly_amount"] == 499
        assert tiers["STARTER"]["yearly_amount"] == 4990
        assert tiers["GROWTH"]["monthly_code"] == "GROWTH_999"
        assert tiers["GROWTH"]["monthly_amount"] == 999
        assert tiers["GROWTH"]["yearly_amount"] == 9999
        assert tiers["GROWTH"]["highlight"] is True
        assert tiers["GROWTH"].get("badge") == "Most Popular"
        assert tiers["BUSINESS"]["monthly_amount"] == 2499
        assert tiers["BUSINESS"]["yearly_amount"] == 24990
        assert tiers["ENTERPRISE"]["is_custom"] is True

        # 6 addons
        assert len(data["addons"]) == 6
        codes = {a["code"] for a in data["addons"]}
        assert "ADDON_USER" in codes and "ADDON_API" in codes


class TestBillingPlansAuth:
    def test_billing_plans_returns_tiers_addons_plans(self, owner_token):
        r = requests.get(f"{BASE_URL}/api/billing/plans",
                         headers={"Authorization": f"Bearer {owner_token}"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "tiers" in data and "addons" in data and "plans" in data
        assert len(data["tiers"]) == 4
        assert len(data["addons"]) == 6
        # Flat plans should include monthly + yearly codes
        plan_codes = {p["code"] for p in data["plans"]}
        for required in ("STARTER_499", "STARTER_4990", "GROWTH_999",
                         "GROWTH_9999", "BUSINESS_2499", "BUSINESS_24990",
                         "ENTERPRISE_CUSTOM"):
            assert required in plan_codes, f"Missing plan code {required}"


# -------------- Subscribe --------------

class TestSubscribe:
    def test_subscribe_growth_returns_mock_auth_link(self, owner_token):
        r = requests.post(f"{BASE_URL}/api/billing/subscribe",
                          headers={"Authorization": f"Bearer {owner_token}"},
                          json={"plan_code": "GROWTH_999"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("mode") == "mock"
        assert "auth_link" in data and isinstance(data["auth_link"], str)
        assert "mock-checkout" in data["auth_link"]
        assert data.get("subscription_id", "").startswith("sub_")

    def test_subscribe_enterprise_custom_returns_400(self, owner_token):
        r = requests.post(f"{BASE_URL}/api/billing/subscribe",
                          headers={"Authorization": f"Bearer {owner_token}"},
                          json={"plan_code": "ENTERPRISE_CUSTOM"}, timeout=15)
        assert r.status_code == 400, r.text
        body = r.json()
        msg = (body.get("detail") or body.get("message") or "").lower()
        assert "sales" in msg or "custom" in msg or "checkout" in msg


# -------------- Launch offer (super admin) --------------

class TestLaunchOfferSuper:
    def test_403_for_non_super_admin(self, owner_token):
        r1 = requests.get(f"{BASE_URL}/api/super/settings/launch-offer",
                          headers={"Authorization": f"Bearer {owner_token}"}, timeout=15)
        assert r1.status_code == 403
        r2 = requests.post(f"{BASE_URL}/api/super/settings/launch-offer",
                           headers={"Authorization": f"Bearer {owner_token}"},
                           json={"enabled": True, "title": "x", "description": "x",
                                 "plan_codes": ["GROWTH_999"], "discount_pct": 10,
                                 "duration_months": 3}, timeout=15)
        assert r2.status_code == 403

    def test_enabling_without_plan_codes_returns_400(self, super_token):
        r = requests.post(f"{BASE_URL}/api/super/settings/launch-offer",
                          headers={"Authorization": f"Bearer {super_token}"},
                          json={"enabled": True, "title": "Launch", "description": "x",
                                "plan_codes": [], "discount_pct": 30,
                                "duration_months": 3}, timeout=15)
        assert r.status_code == 400

    def test_save_offer_and_public_reflects_it(self, super_token, mongo):
        today = datetime.now(timezone.utc).date().isoformat()
        ends = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()
        payload = {
            "enabled": True,
            "title": "Launch Offer 🎉",
            "description": "Growth Plan ₹699/month for first 3 months",
            "plan_codes": ["GROWTH_999"],
            "discount_pct": 30,
            "duration_months": 3,
            "starts_at": today,
            "ends_at": ends,
        }
        r = requests.post(f"{BASE_URL}/api/super/settings/launch-offer",
                          headers={"Authorization": f"Bearer {super_token}"},
                          json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["enabled"] is True
        assert data["title"] == "Launch Offer 🎉"
        assert data["discount_pct"] == 30
        assert data["duration_months"] == 3
        assert data["plan_codes"] == ["GROWTH_999"]
        assert data["currently_active"] is True

        # Verify public/pricing reflects
        pub = requests.get(f"{BASE_URL}/api/public/pricing", timeout=15).json()
        offer = pub.get("launch_offer", {})
        assert offer.get("active") is True
        assert offer.get("title") == "Launch Offer 🎉"
        assert offer.get("description") == "Growth Plan ₹699/month for first 3 months"
        assert offer.get("discount_pct") == 30
        assert offer.get("duration_months") == 3
        assert "GROWTH_999" in offer.get("plan_codes", [])

        # Audit log entry exists
        log = mongo.audit_logs.find_one({"action": "super.launch_offer.updated"},
                                        sort=[("timestamp", -1)])
        assert log is not None
        assert log.get("entity_type") == "system_settings"
        assert log.get("entity_id") == "launch_offer"
        assert log.get("metadata", {}).get("enabled") is True

    def test_super_get_launch_offer(self, super_token):
        r = requests.get(f"{BASE_URL}/api/super/settings/launch-offer",
                         headers={"Authorization": f"Bearer {super_token}"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "enabled" in body and "plan_codes" in body

    def test_disable_offer_resets_active(self, super_token):
        r = requests.post(f"{BASE_URL}/api/super/settings/launch-offer",
                          headers={"Authorization": f"Bearer {super_token}"},
                          json={"enabled": False, "title": "", "description": "",
                                "plan_codes": [], "discount_pct": 0,
                                "duration_months": 0}, timeout=15)
        assert r.status_code == 200
        assert r.json()["enabled"] is False
        # public pricing now reports inactive
        pub = requests.get(f"{BASE_URL}/api/public/pricing", timeout=15).json()
        assert pub["launch_offer"]["active"] is False


# -------------- Legacy plan detection --------------

class TestLegacyPlanDetection:
    def test_needs_replan_flag_via_mongo_mutation(self, mongo, owner_token, owner_org_id):
        # Set legacy plan code AND ensure subscription_status is active/trialing
        original = mongo.organizations.find_one({"id": owner_org_id})
        sub_status = original.get("subscription_status")
        if sub_status not in ("active", "trialing"):
            mongo.organizations.update_one({"id": owner_org_id},
                                           {"$set": {"subscription_status": "trialing"}})
        mongo.organizations.update_one({"id": owner_org_id},
                                       {"$set": {"plan_code": "MONTHLY_199"}})

        r = requests.get(f"{BASE_URL}/api/billing/status",
                         headers={"Authorization": f"Bearer {owner_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("plan_code") == "MONTHLY_199"
        assert body.get("needs_replan") is True

        # Restore sub_status if we changed it
        if sub_status not in ("active", "trialing"):
            mongo.organizations.update_one({"id": owner_org_id},
                                           {"$set": {"subscription_status": sub_status}})

    def test_no_needs_replan_for_valid_plan(self, mongo, owner_token, owner_org_id):
        mongo.organizations.update_one({"id": owner_org_id},
                                       {"$set": {"plan_code": "GROWTH_999"}})
        r = requests.get(f"{BASE_URL}/api/billing/status",
                         headers={"Authorization": f"Bearer {owner_token}"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        if body.get("status") in ("active", "trialing"):
            assert body.get("needs_replan") is False
