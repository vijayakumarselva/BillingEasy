"""
Iteration 8 RETEST — verifies the P0 fixes from iter7:
  1) Seeded org can now write (status 'trialing', is_active=true).
  2) POST /api/billing/subscribe preserves trialing/active status (does NOT
     flip to pending_authorisation while checkout is in-flight).
  3) GET /api/gst/gstr1 and /api/gst/gstr3b default to current month
     (HTTP 200 with no query param).
  4) Light AI smoke (hsn-finder, categorize-expense).
  5) E-invoice JSON envelope for a sale invoice.
"""
import os
from datetime import datetime
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://billease-preview-1.preview.emergentagent.com").rstrip("/")

# ------------ fixtures ------------
@pytest.fixture(scope="module")
def owner():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "owner@vijaytraders.in", "password": "admin123"})
    assert r.status_code == 200, r.text
    d = r.json()
    s.headers.update({"Authorization": f"Bearer {d['token']}", "X-Org-Id": d["org_id"]})
    s.org_id = d["org_id"]
    return s


@pytest.fixture(scope="module")
def super_admin():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "super@billeasy.in", "password": "super123"})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


# ------------ 1) BILLING STATUS BASELINE ------------
class TestBillingStatus:
    def test_status_trialing_active(self, owner):
        r = owner.get(f"{BASE_URL}/api/billing/status")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("status") in ("trialing", "active"), f"Unexpected status: {d}"
        assert d.get("is_active") is True, f"is_active must be True, got: {d}"

    def test_subscribe_preserves_trialing(self, owner):
        # Capture status BEFORE
        before = owner.get(f"{BASE_URL}/api/billing/status").json()
        before_status = before.get("status")
        assert before_status in ("trialing", "active")

        # Hit subscribe (mock mode)
        r = owner.post(f"{BASE_URL}/api/billing/subscribe",
                       json={"plan_code": "GROWTH_999"})
        assert r.status_code == 200, r.text
        body = r.json()
        # Mock mode returns auth_link
        assert "auth_link" in body or "subscription_id" in body or "mock" in str(body).lower()

        # Capture status AFTER — must NOT have flipped to pending_authorisation
        after = owner.get(f"{BASE_URL}/api/billing/status").json()
        assert after.get("status") == before_status, (
            f"P0 regression: status changed {before_status} -> {after.get('status')}")
        assert after.get("is_active") is True


# ------------ 2) WRITES NOW WORK (the heart of the P0 retest) ------------
class TestWritesUnblocked:
    """All POSTs that used to 402 should now succeed."""

    def test_post_party(self, owner):
        r = owner.post(f"{BASE_URL}/api/parties", json={
            "name": "TEST_Party_Iter8", "gstin": "29AABCT1332L1ZA",
            "type": "customer", "state_code": "29", "state": "Karnataka",
        })
        assert r.status_code in (200, 201), f"Expected 2xx, got {r.status_code}: {r.text}"
        pid = r.json()["id"]
        # cleanup
        owner.delete(f"{BASE_URL}/api/parties/{pid}")

    def test_post_product(self, owner):
        r = owner.post(f"{BASE_URL}/api/products", json={
            "name": "TEST_Product_Iter8", "unit": "pc",
            "price": 100, "gst_rate": 18, "hsn": "8517",
        })
        assert r.status_code in (200, 201), f"Expected 2xx, got {r.status_code}: {r.text}"
        pid = r.json()["id"]
        owner.delete(f"{BASE_URL}/api/products/{pid}")

    def test_post_expense(self, owner):
        r = owner.post(f"{BASE_URL}/api/expenses", json={
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "category": "Office",
            "amount": 250,
            "description": "TEST_Expense_Iter8",
        })
        assert r.status_code in (200, 201), f"Expected 2xx, got {r.status_code}: {r.text}"
        eid = r.json().get("id")
        if eid:
            owner.delete(f"{BASE_URL}/api/expenses/{eid}")

    def test_post_payment(self, owner):
        # Need a party first
        party_r = owner.post(f"{BASE_URL}/api/parties", json={
            "name": "TEST_PayParty_Iter8", "type": "customer",
            "state_code": "29", "state": "Karnataka",
        })
        assert party_r.status_code in (200, 201), party_r.text
        party_id = party_r.json()["id"]

        r = owner.post(f"{BASE_URL}/api/payments", json={
            "party_id": party_id,
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "amount": 100,
            "mode": "Cash",
            "direction": "received",
        })
        assert r.status_code in (200, 201), f"Expected 2xx, got {r.status_code}: {r.text}"
        pid = r.json().get("id")
        if pid:
            owner.delete(f"{BASE_URL}/api/payments/{pid}")
        owner.delete(f"{BASE_URL}/api/parties/{party_id}")

    def test_post_invoice_then_purchase(self, owner):
        # Need a party + product first
        party_r = owner.post(f"{BASE_URL}/api/parties", json={
            "name": "TEST_InvParty_Iter8", "type": "customer",
            "state_code": "29", "state": "Karnataka",
        })
        assert party_r.status_code in (200, 201), party_r.text
        party_id = party_r.json()["id"]

        prod_r = owner.post(f"{BASE_URL}/api/products", json={
            "name": "TEST_InvProduct_Iter8", "unit": "pc",
            "price": 100, "gst_rate": 18, "hsn": "8517",
        })
        assert prod_r.status_code in (200, 201), prod_r.text
        prod_id = prod_r.json()["id"]

        invoice_payload = {
            "type": "sale",
            "party_id": party_id,
            "invoice_date": datetime.utcnow().strftime("%Y-%m-%d"),
            "items": [{
                "product_id": prod_id,
                "name": "TEST_InvProduct_Iter8",
                "qty": 1, "rate": 100, "gst_rate": 18, "hsn": "8517",
            }],
        }
        inv_r = owner.post(f"{BASE_URL}/api/invoices", json=invoice_payload)
        assert inv_r.status_code in (200, 201), f"invoice POST failed: {inv_r.status_code} {inv_r.text}"
        inv_id = inv_r.json().get("id")

        # E-invoice JSON for this sale invoice
        if inv_id:
            ei = owner.get(f"{BASE_URL}/api/invoices/{inv_id}/einvoice")
            assert ei.status_code == 200, ei.text
            assert "ok" in ei.json()

        # Now purchase
        sup_r = owner.post(f"{BASE_URL}/api/parties", json={
            "name": "TEST_Supplier_Iter8", "type": "supplier",
            "state_code": "29", "state": "Karnataka",
        })
        assert sup_r.status_code in (200, 201), sup_r.text
        supplier_id = sup_r.json()["id"]

        purchase_payload = {
            "type": "purchase",
            "party_id": supplier_id,
            "bill_no": "TEST_BILL_001",
            "purchase_date": datetime.utcnow().strftime("%Y-%m-%d"),
            "items": [{
                "product_id": prod_id,
                "name": "TEST_InvProduct_Iter8",
                "qty": 1, "rate": 80, "gst_rate": 18, "hsn": "8517",
            }],
        }
        pur_r = owner.post(f"{BASE_URL}/api/purchases", json=purchase_payload)
        assert pur_r.status_code in (200, 201), f"purchase POST failed: {pur_r.status_code} {pur_r.text}"
        pur_id = pur_r.json().get("id")

        # cleanup
        if pur_id:
            owner.delete(f"{BASE_URL}/api/purchases/{pur_id}")
        if inv_id:
            owner.delete(f"{BASE_URL}/api/invoices/{inv_id}")
        owner.delete(f"{BASE_URL}/api/parties/{supplier_id}")
        owner.delete(f"{BASE_URL}/api/products/{prod_id}")
        owner.delete(f"{BASE_URL}/api/parties/{party_id}")


# ------------ 3) GSTR DEFAULT-MONTH ------------
class TestGstrDefaults:
    def test_gstr1_no_param(self, owner):
        r = owner.get(f"{BASE_URL}/api/gst/gstr1")
        assert r.status_code == 200, f"GSTR-1 must default month, got {r.status_code}: {r.text}"

    def test_gstr3b_no_param(self, owner):
        r = owner.get(f"{BASE_URL}/api/gst/gstr3b")
        assert r.status_code == 200, f"GSTR-3B must default month, got {r.status_code}: {r.text}"

    def test_gstr1_with_param_still_works(self, owner):
        r = owner.get(f"{BASE_URL}/api/gst/gstr1", params={"month": "2026-01"})
        assert r.status_code == 200, r.text


# ------------ 4) AI SMOKE (~4 calls cap) ------------
class TestAiSmoke:
    def test_hsn_finder(self, owner):
        r = owner.post(f"{BASE_URL}/api/ai/hsn-finder", json={"description": "wireless bluetooth speaker"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d, dict)
        # Accept any reasonable shape: 'hsn', 'code', 'suggestion', 'results'
        assert any(k in d for k in ("hsn", "code", "suggestion", "results", "suggestions", "ai_suggestion", "bundled_matches")), d

    def test_categorize_expense(self, owner):
        r = owner.post(f"{BASE_URL}/api/ai/categorize-expense", json={"description": "Adobe Creative Cloud monthly fee"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert any(k in d for k in ("category", "result", "suggestion")), d


# ------------ 5) REPORTS + SUPER ADMIN sanity ------------
class TestQuickSanity:
    @pytest.mark.parametrize("ep", ["pl", "balance-sheet", "cash-flow", "trial-balance", "day-book", "stock"])
    def test_reports(self, owner, ep):
        r = owner.get(f"{BASE_URL}/api/reports/{ep}")
        assert r.status_code == 200, r.text

    def test_super_orgs(self, super_admin):
        r = super_admin.get(f"{BASE_URL}/api/super/orgs")
        assert r.status_code == 200

    def test_super_users(self, super_admin):
        r = super_admin.get(f"{BASE_URL}/api/super/users")
        assert r.status_code == 200

    def test_super_payment_settings(self, super_admin):
        r = super_admin.get(f"{BASE_URL}/api/super/settings/payment")
        assert r.status_code == 200

    def test_super_launch_offer(self, super_admin):
        r = super_admin.get(f"{BASE_URL}/api/super/settings/launch-offer")
        assert r.status_code == 200
