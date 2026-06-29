"""
Launch Readiness Regression Test (Iteration 7+)
Focus: Reports endpoints (user reported Network Error), plus full smoke across all surfaces.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://billease-preview-1.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="session")
def owner_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "owner@vijaytraders.in", "password": "admin123"})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}", "X-Org-Id": data["org_id"]})
    s.org_id = data["org_id"]
    s.user_id = data["id"]
    return s


@pytest.fixture(scope="session")
def super_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "super@billeasy.in", "password": "super123"})
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text}"
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return s


# ---------- PUBLIC ----------
class TestPublic:
    def test_pricing(self):
        r = requests.get(f"{BASE_URL}/api/public/pricing")
        assert r.status_code == 200
        d = r.json()
        # Schema uses "tiers" (4 tiers) + "addons" + "launch_offer"
        assert "tiers" in d
        assert isinstance(d["tiers"], list) and len(d["tiers"]) >= 4
        assert "launch_offer" in d

    def test_gstin_valid(self):
        r = requests.get(f"{BASE_URL}/api/public/gstin/validate", params={"gstin": "29AABCT1332L1ZA"})
        assert r.status_code == 200
        d = r.json()
        assert d.get("valid") is True
        assert "karnataka" in (d.get("state") or "").lower()

    def test_gstin_invalid_checksum(self):
        r = requests.get(f"{BASE_URL}/api/public/gstin/validate", params={"gstin": "29AABCT1332L1Z5"})
        assert r.status_code == 200
        d = r.json()
        assert d.get("valid") is False
        # Backend returns either 'error', 'reason' or 'message'
        err = (d.get("reason") or d.get("error") or d.get("message") or "").lower()
        assert "checksum" in err

    def test_hsn_biscuit(self):
        r = requests.get(f"{BASE_URL}/api/public/hsn/search", params={"q": "biscuit"})
        assert r.status_code == 200
        codes = [x.get("code") for x in r.json().get("results", [])]
        assert "1905" in codes

    def test_hsn_ca_filing(self):
        r = requests.get(f"{BASE_URL}/api/public/hsn/search", params={"q": "CA filing"})
        assert r.status_code == 200
        codes = [x.get("code") for x in r.json().get("results", [])]
        assert "998222" in codes


# ---------- AUTH ----------
class TestAuth:
    def test_login_owner(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == "owner@vijaytraders.in"

    def test_refresh_invalid(self):
        r = requests.post(f"{BASE_URL}/api/auth/refresh", json={"refresh_token": "invalid"})
        assert r.status_code in (400, 401)


# ---------- REPORTS (the key area user reported) ----------
class TestReports:
    """User reported 'Network Error' on Reports page - test ALL 6 reports endpoints."""

    def test_pl(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/reports/pl")
        assert r.status_code == 200, r.text
        d = r.json()
        # Should have revenue/expenses/profit-style structure
        assert isinstance(d, dict)

    def test_balance_sheet(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/reports/balance-sheet")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), dict)

    def test_cash_flow(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/reports/cash-flow")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), dict)

    def test_trial_balance(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/reports/trial-balance")
        assert r.status_code == 200, r.text

    def test_day_book(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/reports/day-book")
        assert r.status_code == 200, r.text

    def test_stock(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/reports/stock")
        assert r.status_code == 200, r.text

    def test_reports_rapid_navigation(self, owner_session):
        """Simulate rapid tab switching - hit all 6 reports endpoints 3x in a row."""
        endpoints = ["pl", "balance-sheet", "cash-flow", "trial-balance", "day-book", "stock"]
        failures = []
        for _ in range(3):
            for ep in endpoints:
                r = owner_session.get(f"{BASE_URL}/api/reports/{ep}", timeout=10)
                if r.status_code != 200:
                    failures.append(f"{ep}:{r.status_code}")
        assert not failures, f"Reports rapid-nav failures: {failures}"


# ---------- DASHBOARD ----------
class TestDashboard:
    def test_dashboard(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/dashboard")
        assert r.status_code == 200
        d = r.json()
        assert "sales_this_month" in d or "sales_last_30d" in d or isinstance(d, dict)


# ---------- PARTIES ----------
class TestParties:
    def test_list(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/parties")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_crud(self, owner_session):
        # P0 from iter7 fixed in iter8 — writes should now succeed.
        r = owner_session.post(f"{BASE_URL}/api/parties", json={
            "name": "TEST_Customer_LR", "gstin": "29AABCT1332L1ZA", "type": "customer",
            "state_code": "29", "state": "Karnataka",
        })
        assert r.status_code in (200, 201), r.text
        pid = r.json()["id"]
        # cleanup
        owner_session.delete(f"{BASE_URL}/api/parties/{pid}")


# ---------- PRODUCTS ----------
class TestProducts:
    def test_list(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/products")
        assert r.status_code == 200


# ---------- INVOICES ----------
class TestInvoices:
    def test_list(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/invoices")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_pdf_download(self, owner_session):
        invs = owner_session.get(f"{BASE_URL}/api/invoices").json()
        sale = next((i for i in invs if i.get("type") == "sale"), None)
        if not sale:
            pytest.skip("No sale invoice in seed")
        r = owner_session.get(f"{BASE_URL}/api/invoices/{sale['id']}/pdf")
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_einvoice_json(self, owner_session):
        invs = owner_session.get(f"{BASE_URL}/api/invoices").json()
        sale = next((i for i in invs if i.get("type") == "sale"), None)
        if not sale:
            pytest.skip("No sale invoice")
        r = owner_session.get(f"{BASE_URL}/api/invoices/{sale['id']}/einvoice")
        # Either ok payload or precheck error envelope
        assert r.status_code == 200
        d = r.json()
        assert "ok" in d


# ---------- PURCHASES ----------
class TestPurchases:
    def test_list(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/purchases")
        assert r.status_code == 200


# ---------- PAYMENTS / EXPENSES / TDS ----------
class TestMisc:
    def test_payments(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/payments")
        assert r.status_code == 200

    def test_expenses(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/expenses")
        assert r.status_code == 200

    def test_tds(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/tds")
        assert r.status_code == 200

    def test_bank_accounts(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/bank-accounts")
        assert r.status_code == 200


# ---------- GST RETURNS ----------
class TestGstReturns:
    def test_gstr1(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/gst/gstr1", params={"month": "2026-01"})
        assert r.status_code == 200

    def test_gstr3b(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/gst/gstr3b", params={"month": "2026-01"})
        assert r.status_code == 200


# ---------- SETTINGS / BUSINESS ----------
class TestSettings:
    def test_business(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/business")
        assert r.status_code == 200

    def test_roles(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/roles")
        assert r.status_code == 200

    def test_permissions(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/permissions")
        assert r.status_code == 200


# ---------- BILLING ----------
class TestBilling:
    def test_plans(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/billing/plans")
        assert r.status_code == 200

    def test_status(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/billing/status")
        assert r.status_code == 200

    def test_launch_offer_public(self):
        r = requests.get(f"{BASE_URL}/api/billing/launch-offer")
        assert r.status_code == 200


# ---------- SUPER ADMIN ----------
class TestSuperAdmin:
    def test_stats(self, super_session):
        r = super_session.get(f"{BASE_URL}/api/super/stats")
        assert r.status_code == 200

    def test_orgs(self, super_session):
        r = super_session.get(f"{BASE_URL}/api/super/orgs")
        assert r.status_code == 200

    def test_users(self, super_session):
        r = super_session.get(f"{BASE_URL}/api/super/users")
        assert r.status_code == 200

    def test_payment_settings_masked(self, super_session):
        r = super_session.get(f"{BASE_URL}/api/super/settings/payment")
        assert r.status_code == 200
        d = r.json()
        # secret should be masked if present
        if d.get("client_secret"):
            assert "*" in d["client_secret"] or d["client_secret"].startswith("***")

    def test_launch_offer_admin(self, super_session):
        r = super_session.get(f"{BASE_URL}/api/super/settings/launch-offer")
        assert r.status_code == 200


# ---------- ROUTE GUARDS (non-super hitting super endpoints) ----------
class TestRouteGuards:
    def test_owner_blocked_from_super(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/super/stats")
        assert r.status_code in (401, 403), f"Owner should not access super endpoints, got {r.status_code}"

    def test_no_auth_blocked_from_dashboard(self):
        r = requests.get(f"{BASE_URL}/api/dashboard")
        assert r.status_code in (401, 403)


# ---------- PUBLIC INVOICE SHARE ----------
class TestPublicShare:
    def test_share_link_flow(self, owner_session):
        invs = owner_session.get(f"{BASE_URL}/api/invoices").json()
        if not invs:
            pytest.skip("No invoices")
        iid = invs[0]["id"]
        r = owner_session.post(f"{BASE_URL}/api/invoices/{iid}/share-link", json={})
        assert r.status_code in (200, 201), r.text
        token = r.json().get("token") or r.json().get("share_token")
        assert token
        # No auth - public access
        r2 = requests.get(f"{BASE_URL}/api/public/invoices/{token}")
        assert r2.status_code == 200
        assert isinstance(r2.json(), dict)


# ---------- AUDIT LOGS ----------
class TestAudit:
    def test_audit_logs(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/audit-logs")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
