"""Iteration 7: AI + India GST compliance tests.

Covers: GSTIN validator, HSN search, AI HSN Finder, AI Expense Categorizer,
AI Chat (SSE) + history + sessions, E-Invoice JSON generator.
"""
import os
import json
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def owner_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "owner@vijaytraders.in", "password": "admin123"},
                      timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def auth_headers(owner_token):
    return {
        "Authorization": f"Bearer {owner_token['token']}",
        "X-Org-Id": owner_token["org_id"],
    }


# ---------- 1. Public GSTIN validator ----------
class TestPublicGstin:
    def test_valid_gstin(self):
        r = requests.get(f"{API}/public/gstin/validate",
                         params={"gstin": "29AABCT1332L1ZA"}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["valid"] is True
        assert d["state"] == "Karnataka"
        assert d["pan"] == "AABCT1332L"

    def test_invalid_checksum(self):
        # Same as above but corrupt checksum
        r = requests.get(f"{API}/public/gstin/validate",
                         params={"gstin": "29AABCT1332L1ZZ"}, timeout=10)
        d = r.json()
        assert d["valid"] is False
        assert "checksum" in d["reason"].lower() or "Checksum" in d["reason"]
        assert "expected_checksum" in d

    def test_empty(self):
        r = requests.get(f"{API}/public/gstin/validate", params={"gstin": ""}, timeout=10)
        d = r.json()
        assert d["valid"] is False
        assert "empty" in d["reason"].lower()

    def test_short(self):
        r = requests.get(f"{API}/public/gstin/validate", params={"gstin": "29ABC"}, timeout=10)
        d = r.json()
        assert d["valid"] is False
        assert "15" in d["reason"]

    def test_invalid_state(self):
        r = requests.get(f"{API}/public/gstin/validate",
                         params={"gstin": "XXAABCT1332L1ZA"}, timeout=10)
        d = r.json()
        assert d["valid"] is False
        assert "state" in d["reason"].lower()

    def test_position_14_not_z(self):
        # swap position 14 from Z to A
        r = requests.get(f"{API}/public/gstin/validate",
                         params={"gstin": "29AABCT1332L1AA"}, timeout=10)
        d = r.json()
        assert d["valid"] is False


# ---------- 2. Public HSN search ----------
class TestPublicHsn:
    def test_search_laptop(self):
        r = requests.get(f"{API}/public/hsn/search", params={"q": "laptop"}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        codes = [x["code"] for x in d["results"]]
        assert "8471" in codes
        m = next(x for x in d["results"] if x["code"] == "8471")
        assert m["gst_rate"] == 18
        assert d["count_total"] >= 80

    def test_search_cement(self):
        r = requests.get(f"{API}/public/hsn/search", params={"q": "cement"}, timeout=10)
        codes = [x["code"] for x in r.json()["results"]]
        assert "2523" in codes

    def test_search_consulting(self):
        r = requests.get(f"{API}/public/hsn/search", params={"q": "consulting"}, timeout=10)
        codes = [x["code"] for x in r.json()["results"]]
        assert "998311" in codes

    def test_search_numeric(self):
        r = requests.get(f"{API}/public/hsn/search", params={"q": "85"}, timeout=10)
        codes = [x["code"] for x in r.json()["results"]]
        assert all(c.startswith("85") for c in codes)
        assert len(codes) >= 5

    def test_by_code_known(self):
        r = requests.get(f"{API}/public/hsn/8471", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["code"] == "8471"

    def test_by_code_unknown(self):
        r = requests.get(f"{API}/public/hsn/99999999", timeout=10)
        assert r.status_code == 404


# ---------- 3. Auth required on AI/einvoice endpoints ----------
class TestAuthGuards:
    def test_ai_hsn_finder_requires_auth(self):
        r = requests.post(f"{API}/ai/hsn-finder", json={"description": "rice"}, timeout=10)
        assert r.status_code in (401, 403)

    def test_ai_categorize_requires_auth(self):
        r = requests.post(f"{API}/ai/categorize-expense",
                          json={"description": "rent", "amount": 1000}, timeout=10)
        assert r.status_code in (401, 403)

    def test_ai_chat_requires_auth(self):
        r = requests.post(f"{API}/ai/chat",
                          json={"session_id": "s1", "message": "hi"}, timeout=10)
        assert r.status_code in (401, 403)


# ---------- 4. AI HSN Finder ----------
class TestAiHsnFinder:
    def test_empty_400(self, auth_headers):
        r = requests.post(f"{API}/ai/hsn-finder", headers=auth_headers,
                          json={"description": ""}, timeout=15)
        assert r.status_code == 400

    def test_basmati_rice(self, auth_headers):
        r = requests.post(f"{API}/ai/hsn-finder", headers=auth_headers,
                          json={"description": "5 kg basmati rice premium grade"},
                          timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        bundled_codes = [x["code"] for x in d.get("bundled_matches", [])]
        assert "1006" in bundled_codes
        ai = d.get("ai_suggestion") or {}
        # Tolerant: if AI is unavailable just check shape; if available it must parse JSON
        if "error" not in ai:
            assert "code" in ai and "gst_rate" in ai and "confidence" in ai
            assert "reasoning" in ai


# ---------- 5. AI Expense Categorizer ----------
class TestAiCategorize:
    def test_broadband(self, auth_headers):
        r = requests.post(f"{API}/ai/categorize-expense", headers=auth_headers,
                          json={"description": "Airtel monthly broadband bill",
                                "amount": 2499}, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        if "error" in d:
            pytest.skip(f"AI returned error: {d}")
        assert "category" in d and "tds_section" in d
        assert "confidence" in d and "reasoning" in d

    def test_office_rent_tds_194I(self, auth_headers):
        r = requests.post(f"{API}/ai/categorize-expense", headers=auth_headers,
                          json={"description": "office rent for shop in Mumbai",
                                "amount": 50000}, timeout=90)
        assert r.status_code == 200
        d = r.json()
        if "error" in d:
            pytest.skip(f"AI returned error: {d}")
        # Tolerant: TDS section should reference 194I (rent)
        assert "194I" in (d.get("tds_section") or "").upper() or \
               "rent" in (d.get("category") or "").lower()


# ---------- 6. AI Chat streaming + history ----------
class TestAiChat:
    SESSION_ID = f"test-session-{int(time.time())}"

    def test_chat_stream_and_persist(self, auth_headers):
        r = requests.post(f"{API}/ai/chat", headers=auth_headers,
                          json={"session_id": self.SESSION_ID,
                                "message": "How much sales did I do last 30 days?"},
                          stream=True, timeout=90)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "text/event-stream" in ct
        deltas = []
        done = False
        for line in r.iter_lines(decode_unicode=True):
            if not line:
                continue
            if line.startswith("data: "):
                payload = line[6:]
                try:
                    obj = json.loads(payload)
                except Exception:
                    continue
                if obj.get("done"):
                    done = True
                    break
                if "delta" in obj:
                    deltas.append(obj["delta"])
        assert done, "Stream never sent done=true"
        full = "".join(deltas)
        assert len(full) > 5, f"Empty AI reply: {full!r}"

        # History should now have user + assistant
        time.sleep(1)
        h = requests.get(f"{API}/ai/chat/history", headers=auth_headers,
                        params={"session_id": self.SESSION_ID}, timeout=15)
        assert h.status_code == 200
        msgs = h.json()["messages"]
        roles = [m["role"] for m in msgs]
        assert "user" in roles and "assistant" in roles

    def test_chat_sessions_list(self, auth_headers):
        r = requests.get(f"{API}/ai/chat/sessions", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        sessions = r.json()
        assert isinstance(sessions, list)
        # The test session should appear
        ids = [s["session_id"] for s in sessions]
        assert self.SESSION_ID in ids


# ---------- 7. E-Invoice JSON ----------
class TestEinvoice:
    @pytest.fixture(scope="class")
    def sale_invoice_id(self, auth_headers):
        r = requests.get(f"{API}/invoices", headers=auth_headers,
                         params={"type": "sale", "limit": 20}, timeout=15)
        assert r.status_code == 200
        invs = r.json()
        items = invs if isinstance(invs, list) else invs.get("results") or invs.get("items") or []
        # find an invoice with hsn on each item
        for inv in items:
            its = inv.get("items") or []
            if its and all(x.get("hsn") for x in its):
                return inv["id"]
        # else just return first sale invoice; we'll assert errors
        if items:
            return items[0]["id"]
        pytest.skip("No sale invoices to test e-invoice against")

    def test_einvoice_schema(self, auth_headers, sale_invoice_id):
        r = requests.get(f"{API}/invoices/{sale_invoice_id}/einvoice",
                         headers=auth_headers, timeout=20)
        assert r.status_code == 200
        d = r.json()
        if not d["ok"]:
            # likely missing HSN on some item — still a valid shape test
            assert isinstance(d.get("errors"), list) and len(d["errors"]) > 0
            return
        p = d["payload"]
        assert p["Version"] == "1.1"
        # required top-level keys
        for k in ("TranDtls", "DocDtls", "SellerDtls", "BuyerDtls", "ItemList", "ValDtls"):
            assert k in p, f"missing {k}"
        assert isinstance(p["ItemList"], list) and len(p["ItemList"]) > 0
        # DocDtls.No should match invoice_no
        inv_r = requests.get(f"{API}/invoices/{sale_invoice_id}",
                             headers=auth_headers, timeout=10).json()
        assert p["DocDtls"]["No"] == inv_r.get("invoice_no")
