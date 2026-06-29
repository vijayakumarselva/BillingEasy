"""BillEasy backend regression test suite."""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()).rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def owner_token():
    r = requests.post(f"{API}/auth/login", json={"email": "owner@vijaytraders.in", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def sales_token():
    r = requests.post(f"{API}/auth/login", json={"email": "sales@vijaytraders.in", "password": "sales123"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def vijay_org_id(owner_token):
    r = requests.get(f"{API}/orgs", headers={"Authorization": f"Bearer {owner_token}"})
    assert r.status_code == 200
    orgs = r.json()
    target = next((o for o in orgs if "Vijay" in o.get("name", "")), orgs[0])
    return target["id"]


@pytest.fixture(autouse=True)
def _patch_H(vijay_org_id):
    """Make every H() call below auto-include X-Org-Id of Vijay Traders."""
    globals()["_DEFAULT_ORG_ID"] = vijay_org_id
    yield


def H(token, org_id=None):
    h = {"Authorization": f"Bearer {token}"}
    oid = org_id or globals().get("_DEFAULT_ORG_ID")
    if oid:
        h["X-Org-Id"] = oid
    return h


# -------- AUTH --------
class TestAuth:
    def test_login_owner(self):
        r = requests.post(f"{API}/auth/login", json={"email": "owner@vijaytraders.in", "password": "admin123"})
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and "org_id" in d

    def test_login_bad(self):
        r = requests.post(f"{API}/auth/login", json={"email": "owner@vijaytraders.in", "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, owner_token):
        r = requests.get(f"{API}/auth/me", headers=H(owner_token))
        assert r.status_code == 200
        assert r.json()["email"] == "owner@vijaytraders.in"

    def test_me_no_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# -------- DASHBOARD --------
class TestDashboard:
    def test_dashboard(self, owner_token):
        r = requests.get(f"{API}/dashboard", headers=H(owner_token))
        assert r.status_code == 200
        d = r.json()
        for k in ["sales_total", "purchase_total", "receivable", "payable", "gst_payable",
                  "net_profit", "chart", "recent_invoices", "top_customers", "top_products"]:
            assert k in d, f"Missing {k}"
        assert isinstance(d["chart"], list) and len(d["chart"]) == 6


# -------- PARTIES --------
class TestParties:
    def test_list_customers(self, owner_token):
        r = requests.get(f"{API}/parties?type=customer", headers=H(owner_token))
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 5
        for it in items:
            assert "name" in it and "gstin" in it and "balance" in it

    def test_list_suppliers(self, owner_token):
        r = requests.get(f"{API}/parties?type=supplier", headers=H(owner_token))
        assert r.status_code == 200
        assert len(r.json()) >= 5

    def test_party_crud(self, owner_token):
        payload = {"type": "customer", "name": "TEST_CUST", "gstin": "33TEST1234A1Z5",
                   "state": "Tamil Nadu", "state_code": "33"}
        r = requests.post(f"{API}/parties", json=payload, headers=H(owner_token))
        assert r.status_code == 200
        pid = r.json()["id"]
        # GET
        g = requests.get(f"{API}/parties/{pid}", headers=H(owner_token))
        assert g.status_code == 200 and g.json()["name"] == "TEST_CUST"
        # UPDATE
        payload["name"] = "TEST_CUST_UPD"
        u = requests.put(f"{API}/parties/{pid}", json=payload, headers=H(owner_token))
        assert u.status_code == 200
        g2 = requests.get(f"{API}/parties/{pid}", headers=H(owner_token))
        assert g2.json()["name"] == "TEST_CUST_UPD"
        # LEDGER
        led = requests.get(f"{API}/parties/{pid}/ledger", headers=H(owner_token))
        assert led.status_code == 200
        assert "transactions" in led.json()
        # DELETE
        d = requests.delete(f"{API}/parties/{pid}", headers=H(owner_token))
        assert d.status_code == 200


# -------- PRODUCTS --------
class TestProducts:
    def test_list_products(self, owner_token):
        r = requests.get(f"{API}/products", headers=H(owner_token))
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 10
        for p in items:
            assert "hsn" in p and "gst_rate" in p and "stock" in p

    def test_create_product(self, owner_token):
        p = {"name": "TEST_PROD", "hsn": "1234", "gst_rate": 18, "stock": 10,
             "purchase_price": 50, "sale_price": 100, "sku": "T-001"}
        r = requests.post(f"{API}/products", json=p, headers=H(owner_token))
        assert r.status_code == 200


# -------- INVOICES --------
class TestInvoices:
    def test_list(self, owner_token):
        r = requests.get(f"{API}/invoices", headers=H(owner_token))
        assert r.status_code == 200
        assert len(r.json()) >= 5

    def test_create_intra_state(self, owner_token):
        # find TN customer (Sundar Electronics)
        parties = requests.get(f"{API}/parties?type=customer", headers=H(owner_token)).json()
        tn = next((p for p in parties if p["state_code"] == "33" and "Sundar" in p["name"]), None)
        assert tn is not None
        products = requests.get(f"{API}/products", headers=H(owner_token)).json()
        prod = products[0]
        body = {
            "party_id": tn["id"], "invoice_date": "2026-01-15", "due_date": "2026-02-15",
            "items": [{"product_id": prod["id"], "name": prod["name"], "hsn": prod["hsn"],
                       "qty": 2, "rate": prod["sale_price"], "gst_rate": prod["gst_rate"]}],
        }
        r = requests.post(f"{API}/invoices", json=body, headers=H(owner_token))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["invoice_no"].startswith("INV-2026-")
        assert d["totals"]["cgst"] > 0 and d["totals"]["sgst"] > 0
        assert d["totals"]["igst"] == 0
        return d["id"]

    def test_create_inter_state(self, owner_token):
        parties = requests.get(f"{API}/parties?type=customer", headers=H(owner_token)).json()
        mh = next((p for p in parties if "Mumbai" in p["name"]), None)
        assert mh is not None
        products = requests.get(f"{API}/products", headers=H(owner_token)).json()
        body = {
            "party_id": mh["id"], "invoice_date": "2026-01-15",
            "items": [{"product_id": products[0]["id"], "name": products[0]["name"],
                       "hsn": products[0]["hsn"], "qty": 1, "rate": 1000, "gst_rate": 18}],
        }
        r = requests.post(f"{API}/invoices", json=body, headers=H(owner_token))
        assert r.status_code == 200
        d = r.json()
        assert d["totals"]["igst"] > 0
        assert d["totals"]["cgst"] == 0 and d["totals"]["sgst"] == 0

    def test_pdf(self, owner_token):
        invs = requests.get(f"{API}/invoices", headers=H(owner_token)).json()
        iid = invs[0]["id"]
        r = requests.get(f"{API}/invoices/{iid}/pdf", headers=H(owner_token))
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_sales_cannot_delete(self, sales_token, owner_token):
        invs = requests.get(f"{API}/invoices", headers=H(owner_token)).json()
        iid = invs[-1]["id"]
        r = requests.delete(f"{API}/invoices/{iid}", headers=H(sales_token))
        assert r.status_code == 403


# -------- PURCHASES --------
class TestPurchases:
    def test_create_purchase_and_stock(self, owner_token):
        suppliers = requests.get(f"{API}/parties?type=supplier", headers=H(owner_token)).json()
        sid = suppliers[0]["id"]
        products = requests.get(f"{API}/products", headers=H(owner_token)).json()
        prod = products[0]
        stock_before = prod["stock"]
        body = {
            "party_id": sid, "bill_no": "TEST-BILL-001", "purchase_date": "2026-01-10",
            "items": [{"product_id": prod["id"], "name": prod["name"], "hsn": prod["hsn"],
                       "qty": 5, "rate": prod["purchase_price"], "gst_rate": prod["gst_rate"]}],
        }
        r = requests.post(f"{API}/purchases", json=body, headers=H(owner_token))
        assert r.status_code == 200
        products2 = requests.get(f"{API}/products", headers=H(owner_token)).json()
        prod2 = next(p for p in products2 if p["id"] == prod["id"])
        assert prod2["stock"] == stock_before + 5

    def test_list(self, owner_token):
        r = requests.get(f"{API}/purchases", headers=H(owner_token))
        assert r.status_code == 200
        assert len(r.json()) >= 3


# -------- PAYMENTS --------
class TestPayments:
    def test_record_payment_reduces_due(self, owner_token):
        invs = requests.get(f"{API}/invoices", headers=H(owner_token)).json()
        inv = invs[0]
        prev_due = inv["due"]
        if prev_due <= 0:
            pytest.skip("no due")
        pay = {"party_id": inv["party_id"], "direction": "received", "amount": 100,
               "mode": "Cash", "date": "2026-01-15", "invoice_id": inv["id"]}
        r = requests.post(f"{API}/payments", json=pay, headers=H(owner_token))
        assert r.status_code == 200
        g = requests.get(f"{API}/invoices/{inv['id']}", headers=H(owner_token))
        assert g.json()["due"] < prev_due


# -------- GST --------
class TestGST:
    def test_gstr1(self, owner_token):
        r = requests.get(f"{API}/gst/gstr1?month=2026-01", headers=H(owner_token))
        assert r.status_code == 200
        d = r.json()
        for k in ["b2b", "b2c", "hsn"]:
            assert k in d and isinstance(d[k], list)

    def test_gstr3b(self, owner_token):
        r = requests.get(f"{API}/gst/gstr3b?month=2026-01", headers=H(owner_token))
        assert r.status_code == 200
        d = r.json()
        for k in ["outward", "itc", "net_payable"]:
            assert k in d


# -------- REPORTS --------
class TestReports:
    def test_pl(self, owner_token):
        r = requests.get(f"{API}/reports/pl", headers=H(owner_token))
        assert r.status_code == 200
        d = r.json()
        for k in ["sales", "cost_of_goods", "gross_profit", "expenses", "net_profit"]:
            assert k in d

    def test_trial_balance(self, owner_token):
        r = requests.get(f"{API}/reports/trial-balance", headers=H(owner_token))
        assert r.status_code == 200
        d = r.json()
        assert "rows" in d and "total_debit" in d and "total_credit" in d

    def test_day_book(self, owner_token):
        r = requests.get(f"{API}/reports/day-book?date=2026-01-15", headers=H(owner_token))
        assert r.status_code == 200
        assert "entries" in r.json()

    def test_stock(self, owner_token):
        r = requests.get(f"{API}/reports/stock", headers=H(owner_token))
        assert r.status_code == 200
        items = r.json()
        assert len(items) > 0
        for i in items:
            assert "value" in i and "low" in i


# -------- TDS --------
class TestTDS:
    def test_tds_crud(self, owner_token):
        parties = requests.get(f"{API}/parties?type=supplier", headers=H(owner_token)).json()
        sid = parties[0]["id"]
        body = {"party_id": sid, "section": "194C", "rate": 1, "amount": 100000,
                "tds_amount": 1000, "date": "2026-01-15"}
        r = requests.post(f"{API}/tds", json=body, headers=H(owner_token))
        assert r.status_code == 200
        ls = requests.get(f"{API}/tds", headers=H(owner_token))
        assert ls.status_code == 200 and len(ls.json()) >= 1


# -------- BUSINESS --------
class TestBusiness:
    def test_get_update(self, owner_token):
        r = requests.get(f"{API}/business", headers=H(owner_token))
        assert r.status_code == 200
        biz = r.json()
        assert biz.get("name") and "Vijay" in biz["name"]
        # update
        biz["phone"] = "9999999999"
        r2 = requests.put(f"{API}/business", json={k: biz.get(k, "") for k in
            ["name","address","state","state_code","gstin","pan","phone","email",
             "logo_url","bank_name","bank_account","bank_ifsc","bank_branch","terms"]},
            headers=H(owner_token))
        assert r2.status_code == 200
        assert r2.json()["phone"] == "9999999999"
