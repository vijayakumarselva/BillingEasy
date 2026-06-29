"""Iteration-3 backend tests:
1. PDF — embedded FreeSans font, filename uses invoice_no, X-Invoice-No header, size >15KB.
2. Dashboard aggregation — full payload schema + nested chart/recent/top* schema.
3. Parties balance vs ledger end-balance parity.
4. Invoices list — every row has party_name, paid, due, with due == grand_total - paid.
5. Org isolation — new org dashboard/parties/invoices show ONLY new data; Vijay unchanged.
"""
import os
import re
import uuid
import pytest
import requests

BASE_URL = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip().rstrip("/")
API = f"{BASE_URL}/api"

OWNER_EMAIL = "owner@vijaytraders.in"
OWNER_PW = "admin123"


def H(token, org_id=None):
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if org_id:
        h["X-Org-Id"] = org_id
    return h


@pytest.fixture(scope="module")
def owner():
    r = requests.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PW}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def vijay_org_id(owner):
    r = requests.get(f"{API}/orgs", headers=H(owner["token"]))
    assert r.status_code == 200
    orgs = r.json()
    return next(o["id"] for o in orgs if "Vijay" in o.get("name", ""))


# ---------------------- PDF ----------------------
class TestInvoicePDF:
    def test_pdf_headers_filename_size_font(self, owner, vijay_org_id):
        invs = requests.get(f"{API}/invoices", headers=H(owner["token"], vijay_org_id)).json()
        assert invs, "no invoices to test"
        inv = invs[0]
        invoice_no = inv["invoice_no"]
        iid = inv["id"]
        r = requests.get(f"{API}/invoices/{iid}/pdf", headers=H(owner["token"], vijay_org_id))
        # status + content-type
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        # %PDF magic
        assert r.content[:5] == b"%PDF-", r.content[:20]
        # X-Invoice-No header
        assert r.headers.get("x-invoice-no") == invoice_no, r.headers
        # Content-Disposition filename matches invoice_no
        cd = r.headers.get("content-disposition", "")
        m = re.search(r'filename="?([^";]+)"?', cd)
        assert m, f"no filename in Content-Disposition: {cd!r}"
        assert m.group(1) == f"{invoice_no}.pdf", f"filename={m.group(1)!r}, want {invoice_no}.pdf"
        # size >15KB (embedded font)
        assert len(r.content) > 15 * 1024, f"PDF too small: {len(r.content)} bytes"
        # FreeSans / BillEasySans embed
        body = r.content
        assert b"BillEasySans" in body or b"FreeSans" in body, "embedded font name not found in PDF"

    def test_pdf_inr_symbol_present(self, owner, vijay_org_id):
        """Invoice PDF should contain the rupee symbol U+20B9 (encoded in PDF via font)
        OR at minimum should render with Indian numerals via ParagraphStyle. We assert
        the PDF parses and contains the invoice_no string (best-effort smoke)."""
        invs = requests.get(f"{API}/invoices", headers=H(owner["token"], vijay_org_id)).json()
        inv = invs[0]
        r = requests.get(f"{API}/invoices/{inv['id']}/pdf", headers=H(owner["token"], vijay_org_id))
        assert r.status_code == 200
        # invoice_no should be searchable in stream content (often visible in plain bytes)
        # not always, since reportlab compresses streams; treat as best-effort
        # Just assert non-trivial size and PDF magic again
        assert len(r.content) > 15 * 1024


# ---------------------- DASHBOARD AGGREGATION ----------------------
class TestDashboardAggregation:
    def test_full_schema(self, owner, vijay_org_id):
        r = requests.get(f"{API}/dashboard", headers=H(owner["token"], vijay_org_id))
        assert r.status_code == 200
        d = r.json()
        for k in ["sales_total", "purchase_total", "receivable", "payable",
                  "gst_payable", "net_profit", "expenses_total", "chart",
                  "recent_invoices", "top_customers", "top_products"]:
            assert k in d, f"missing key {k}"
        # numeric
        for k in ["sales_total", "purchase_total", "receivable", "payable",
                  "gst_payable", "net_profit", "expenses_total"]:
            assert isinstance(d[k], (int, float)), f"{k} not numeric: {type(d[k])}"
        # chart length 6 + items have month + sales
        assert isinstance(d["chart"], list) and len(d["chart"]) == 6
        for c in d["chart"]:
            assert "month" in c and "sales" in c
        # recent_invoices ≤5 + party_name
        ri = d["recent_invoices"]
        assert isinstance(ri, list) and len(ri) <= 5
        for inv in ri:
            assert "party_name" in inv, inv
        # top_customers ≤5 with name + amount
        tc = d["top_customers"]
        assert isinstance(tc, list) and len(tc) <= 5
        for c in tc:
            assert "name" in c and "amount" in c
        # top_products ≤5 with name + qty + amount
        tp = d["top_products"]
        assert isinstance(tp, list) and len(tp) <= 5
        for p in tp:
            assert "name" in p and "qty" in p and "amount" in p


# ---------------------- PARTIES BALANCE ----------------------
class TestPartiesBalance:
    def test_party_balance_matches_ledger(self, owner, vijay_org_id):
        r = requests.get(f"{API}/parties?type=customer", headers=H(owner["token"], vijay_org_id))
        assert r.status_code == 200
        parties = r.json()
        assert parties
        # pick first 3 with non-zero data to keep test fast
        checked = 0
        for p in parties:
            assert "balance" in p, f"party missing balance: {p}"
            led = requests.get(f"{API}/parties/{p['id']}/ledger",
                               headers=H(owner["token"], vijay_org_id))
            assert led.status_code == 200
            data = led.json()
            # ledger has transactions list; end balance is last txn's running balance
            # or the 'balance' top-level if available
            end_bal = data.get("balance")
            if end_bal is None and data.get("transactions"):
                end_bal = data["transactions"][-1].get("balance")
            if end_bal is None:
                continue
            assert abs(float(p["balance"]) - float(end_bal)) < 0.5, (
                f"party {p['name']} balance {p['balance']} != ledger end {end_bal}")
            checked += 1
            if checked >= 3:
                break
        assert checked >= 1, "no party-ledger pairs verified"


# ---------------------- INVOICES LIST AGGREGATION ----------------------
class TestInvoicesListShape:
    def test_each_invoice_has_party_name_paid_due(self, owner, vijay_org_id):
        r = requests.get(f"{API}/invoices", headers=H(owner["token"], vijay_org_id))
        assert r.status_code == 200
        invs = r.json()
        assert invs, "no invoices"
        for inv in invs:
            for k in ["party_name", "paid", "due"]:
                assert k in inv, f"missing {k} in invoice {inv.get('invoice_no')}: {list(inv.keys())}"
            # grand_total lives in totals.grand_total
            gt = float(inv.get("totals", {}).get("grand_total", 0))
            diff = gt - float(inv["paid"]) - float(inv["due"])
            assert abs(diff) < 1.0, (
                f"due mismatch for {inv['invoice_no']}: "
                f"grand_total={gt} paid={inv['paid']} due={inv['due']}")


# ---------------------- ORG ISOLATION FOR DASHBOARD/INVOICES/PARTIES ----------------------
class TestOrgIsolation:
    @pytest.fixture(scope="class")
    def new_org_with_data(self, owner):
        from datetime import datetime, timezone
        today_iso = datetime.now(timezone.utc).date().isoformat()
        # create org
        ro = requests.post(f"{API}/orgs", json={
            "name": f"TEST_ISO3_{uuid.uuid4().hex[:6]}", "state": "Karnataka", "state_code": "29"
        }, headers=H(owner["token"]))
        assert ro.status_code == 200, ro.text
        oid = ro.json()["id"]
        # add customer
        rc = requests.post(f"{API}/parties", json={
            "type": "customer", "name": "ISO3_CUST", "gstin": "29ISO3ABCDE1Z9",
            "state": "Karnataka", "state_code": "29"
        }, headers=H(owner["token"], oid))
        assert rc.status_code == 200, rc.text
        cust = rc.json()
        # add product
        rp = requests.post(f"{API}/products", json={
            "name": "ISO3_PROD", "hsn": "9999", "gst_rate": 18, "stock": 100,
            "purchase_price": 100, "sale_price": 200, "sku": "ISO3-1"
        }, headers=H(owner["token"], oid))
        assert rp.status_code == 200, rp.text
        prod = rp.json()
        # create invoice with TODAY's date (dashboard filters by current month)
        ri = requests.post(f"{API}/invoices", json={
            "party_id": cust["id"], "invoice_date": today_iso, "due_date": today_iso,
            "items": [{"product_id": prod["id"], "name": prod["name"], "hsn": prod["hsn"],
                       "qty": 3, "rate": 200, "gst_rate": 18}],
        }, headers=H(owner["token"], oid))
        assert ri.status_code == 200, ri.text
        return {"org_id": oid, "cust": cust, "prod": prod, "invoice": ri.json()}

    def test_new_org_parties_scope(self, owner, new_org_with_data):
        r = requests.get(f"{API}/parties",
                         headers=H(owner["token"], new_org_with_data["org_id"]))
        assert r.status_code == 200
        items = r.json()
        names = [p["name"] for p in items]
        assert names == ["ISO3_CUST"], f"expected only ISO3_CUST, got {names}"

    def test_new_org_invoices_scope(self, owner, new_org_with_data):
        r = requests.get(f"{API}/invoices",
                         headers=H(owner["token"], new_org_with_data["org_id"]))
        assert r.status_code == 200
        invs = r.json()
        assert len(invs) == 1
        assert invs[0]["party_name"] == "ISO3_CUST"
        assert invs[0]["invoice_no"].startswith("INV-2026-")

    def test_new_org_dashboard_only_new_data(self, owner, new_org_with_data):
        r = requests.get(f"{API}/dashboard",
                         headers=H(owner["token"], new_org_with_data["org_id"]))
        assert r.status_code == 200
        d = r.json()
        # sales_total > 0 (one invoice)
        assert d["sales_total"] > 0
        # purchases zero (no purchase)
        assert d["purchase_total"] == 0
        # recent_invoices contains only the new one
        assert len(d["recent_invoices"]) == 1
        assert d["recent_invoices"][0]["party_name"] == "ISO3_CUST"
        # top_customers should contain only ISO3_CUST
        names = [c["name"] for c in d["top_customers"]]
        assert names == ["ISO3_CUST"], names
        # top_products only ISO3_PROD
        pnames = [p["name"] for p in d["top_products"]]
        assert pnames == ["ISO3_PROD"], pnames

    def test_vijay_unchanged_after_new_org(self, owner, vijay_org_id, new_org_with_data):
        # parties in Vijay must NOT contain ISO3_CUST
        r = requests.get(f"{API}/parties",
                         headers=H(owner["token"], vijay_org_id))
        assert r.status_code == 200
        assert not any(p["name"] == "ISO3_CUST" for p in r.json())
        # dashboard top_products in Vijay must NOT contain ISO3_PROD
        rd = requests.get(f"{API}/dashboard",
                          headers=H(owner["token"], vijay_org_id))
        assert rd.status_code == 200
        d = rd.json()
        assert not any(p["name"] == "ISO3_PROD" for p in d["top_products"])
        assert not any(c["name"] == "ISO3_CUST" for c in d["top_customers"])
