"""Mirroring invoices into Zoho, and bringing the e-way bill back.

Zoho itself is stood in for: the point is that we send the right shape, match
instead of duplicating, survive refusals, and read the e-way bill back.
"""
import os, sys, asyncio, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
for k, v in {"MONGO_URL": "x", "DB_NAME": "t", "JWT_SECRET": "s", "SECRET_KEY": "s"}.items():
    os.environ.setdefault(k, v)

from mongomock_motor import AsyncMongoMockClient
from fastapi.testclient import TestClient
import server, zoho as Z

OK = []
def check(name, cond, extra=""):
    OK.append((name, bool(cond)))
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if not cond and extra else ""))

mdb = AsyncMongoMockClient()["t"]
server.db = mdb
async def _noop(*a, **k): return None
server.audit_log = _noop
server.app.router.on_startup.clear()
OWNER = {"id": "o1", "email": "o@n.in", "name": "V", "is_super_admin": True}
server.app.dependency_overrides[server.get_current_user] = lambda: OWNER
ORG = "org1"
H = {"X-Org-Id": ORG}

# ── a stand-in Zoho ─────────────────────────────────────────────────────────
STATE = {"contacts": [], "items": [], "invoices": [], "calls": [], "fail": None,
         "next_id": 1000, "eway": {}}


def _nid():
    STATE["next_id"] += 1
    return str(STATE["next_id"])


async def fake_token(settings, client=None):
    if STATE.get("fail") == "auth":
        raise Z.ZohoError("invalid_client")
    return "tok-123"


async def fake_call(settings, method, path, *, token, params=None, json_body=None, client=None):
    STATE["calls"].append({"method": method, "path": path, "params": params or {},
                           "body": json_body})
    if STATE.get("fail") == "api":
        raise Z.ZohoError("You are not authorized to perform this operation")

    if path == "/organizations":
        return {"organizations": [{"organization_id": "60001", "name": "NammaHut Services",
                                   "currency_code": "INR", "country": "India",
                                   "tax_reg_no": "33AAJCN1847Q1Z4"}]}
    if path == "/contacts" and method == "GET":
        want = (params or {}).get("contact_name_contains", "").lower()
        return {"contacts": [c for c in STATE["contacts"]
                             if want and want in c["contact_name"].lower()]}
    if path == "/contacts" and method == "POST":
        c = {"contact_id": _nid(), **json_body}
        STATE["contacts"].append(c)
        return {"contact": c}
    if path == "/items" and method == "GET":
        sku = (params or {}).get("sku", "")
        name = (params or {}).get("name_contains", "").lower()
        out = [i for i in STATE["items"]
               if (sku and i.get("sku") == sku) or (name and name in i["name"].lower())]
        return {"items": out}
    if path == "/items" and method == "POST":
        i = {"item_id": _nid(), **json_body}
        STATE["items"].append(i)
        return {"item": i}
    if path == "/invoices" and method == "GET":
        ref = (params or {}).get("reference_number", "")
        return {"invoices": [i for i in STATE["invoices"]
                             if i.get("reference_number") == ref]}
    if path == "/invoices" and method == "POST":
        inv = {"invoice_id": _nid(), "status": "draft", **json_body}
        STATE["invoices"].append(inv)
        return {"invoice": inv}
    if path.startswith("/invoices/") and method == "GET":
        zid = path.split("/")[-1]
        inv = next((i for i in STATE["invoices"] if i["invoice_id"] == zid), {})
        if STATE["eway"].get(zid):
            inv = {**inv, "ewaybill_number": STATE["eway"][zid]}
        return {"invoice": inv}
    return {}

Z.access_token = fake_token
Z.call = fake_call


async def seed():
    await mdb.users.insert_one(dict(OWNER))
    await mdb.organizations.insert_one({"id": ORG, "name": "NammaHut Services",
                                        "owner_user_id": "o1", "gstin": "33AAJCN1847Q1Z4",
                                        "state": "Tamil Nadu", "state_code": "33"})
    await mdb.memberships.insert_one({"id": "m1", "user_id": "o1", "org_id": ORG, "role": "owner"})
    await server.ensure_system_roles(mdb, ORG)
    await mdb.subscriptions.insert_one({"account_id": "o1", "plan_code": "PRO_YEARLY",
                                        "status": "active", "addons": {},
                                        "current_period_end": "2099-01-01T00:00:00+00:00"})
    await mdb.parties.insert_one({"id": "c1", "org_id": ORG, "name": "Acme Traders Pvt Ltd",
                                  "type": "customer", "gstin": "33BBBBB1111B1ZU",
                                  "state": "Tamil Nadu", "state_code": "33",
                                  "email": "ap@acme.in", "phone": "9876500000"})
    await mdb.products.insert_one({"id": "p1", "org_id": ORG, "name": "Steel rod 12mm",
                                   "sku": "ROD-12", "hsn": "7214", "sale_price": 1000,
                                   "gst_rate": 18, "stock": 500, "modes": ["b2b"]})
asyncio.run(seed())
c = TestClient(server.app)


def configure(**over):
    body = {"enabled": True, "product": "inventory", "data_centre": "in",
            "client_id": "1000.ABC", "client_secret": "shh",
            "organization_id": "60001", "organization_name": "NammaHut Services",
            "auto_push": False, "sync_items": True, "pull_eway": True}
    body.update(over)
    return c.put("/api/integrations/zoho", headers=H, json=body)


def make_invoice(no_suffix=""):
    return c.post("/api/invoices", headers=H, json={
        "party_id": "c1", "invoice_date": "2026-10-07", "type": "sale",
        "status": "finalized",
        "items": [{"product_id": "p1", "name": "Steel rod 12mm", "hsn": "7214", "qty": 60,
                   "unit": "NOS", "rate": 1000, "discount_pct": 0, "gst_rate": 18}]}).json()


def test_settings_and_secrets():
    print("\nsettings")
    r = configure()
    check("settings save", r.status_code == 200, r.text[:200])
    d = r.json()
    check("the secret is never sent back in the clear",
          "shh" not in json.dumps(d), str(d)[:160])
    check("it comes back masked", "•" in (d.get("client_secret") or ""), d.get("client_secret"))
    raw = asyncio.run(mdb.integration_settings.find_one({"org_id": ORG}, {"_id": 0}))
    check("and is encrypted at rest",
          "shh" not in json.dumps(raw) and raw.get("client_secret_enc"), str(raw)[:160])

    r2 = c.put("/api/integrations/zoho", headers=H, json={
        "enabled": True, "client_id": "1000.ABC", "client_secret": d["client_secret"],
        "organization_id": "60001", "data_centre": "in", "product": "inventory"})
    check("saving again with the mask keeps the real secret", r2.status_code == 200)
    cfg = asyncio.run(server._zoho_settings(ORG))
    check("which is still readable internally", cfg["client_secret"] == "shh")

    check("the data centre list is offered", "in" in (d.get("data_centres") or {}))
    check("and the scopes to paste into Zoho", "ZohoInventory.invoices.CREATE" in d["scopes"])


def test_push_creates_what_is_missing():
    print("\nsending an invoice across")
    configure()
    inv = make_invoice()
    r = c.post(f"/api/integrations/zoho/push/{inv['id']}", headers=H)
    check("the push succeeds", r.status_code == 200, r.text[:250])
    d = r.json()
    check("Zoho's invoice id comes back", bool(d.get("zoho_invoice_id")))
    check("the customer was created in Zoho", len(STATE["contacts"]) == 1)
    made = STATE["contacts"][0]
    check("with their GSTIN and treatment",
          made["gst_no"] == "33BBBBB1111B1ZU" and made["gst_treatment"] == "business_gst")
    check("the item was created too", len(STATE["items"]) == 1, str(STATE["items"])[:120])
    check("carrying the HSN", STATE["items"][0]["hsn_or_sac"] == "7214")

    z = STATE["invoices"][0]
    check("our invoice number is the reference Zoho holds",
          z["reference_number"] == inv["invoice_no"], str(z)[:160])
    check("the line has the right quantity and rate",
          z["line_items"][0]["quantity"] == 60 and z["line_items"][0]["rate"] == 1000)
    check("and the GST rate", z["line_items"][0]["tax_percentage"] == 18)
    check("place of supply is sent", z.get("place_of_supply") == "Tamil Nadu")

    stored = c.get(f"/api/invoices/{inv['id']}", headers=H).json()
    check("the link back to Zoho is stored", stored["zoho_invoice_id"] == d["zoho_invoice_id"])
    check("with a URL a human can open", stored["zoho_url"].startswith("http"))


def test_no_duplicates():
    print("\npushing twice")
    before = len(STATE["invoices"])
    inv = make_invoice()
    c.post(f"/api/integrations/zoho/push/{inv['id']}", headers=H)
    r = c.post(f"/api/integrations/zoho/push/{inv['id']}", headers=H)
    check("the second push does not create a second invoice",
          len(STATE["invoices"]) == before + 1, str(len(STATE["invoices"])))
    check("it says it was already there", r.json().get("already") is True)

    # Even if our stored link is lost, the reference finds it.
    asyncio.run(mdb.invoices.update_one({"id": inv["id"]},
                                        {"$set": {"zoho_invoice_id": ""}}))
    c.post(f"/api/integrations/zoho/push/{inv['id']}", headers=H)
    check("and a lost link is recovered rather than duplicated",
          len(STATE["invoices"]) == before + 1, str(len(STATE["invoices"])))

    existing = len(STATE["contacts"])
    inv2 = make_invoice()
    c.post(f"/api/integrations/zoho/push/{inv2['id']}", headers=H)
    check("the same customer is reused, not created again",
          len(STATE["contacts"]) == existing, str(len(STATE["contacts"])))


def test_eway_comes_back():
    print("\nthe e-way bill raised in Zoho")
    inv = make_invoice()
    pushed = c.post(f"/api/integrations/zoho/push/{inv['id']}", headers=H).json()
    zid = pushed["zoho_invoice_id"]

    r = c.post(f"/api/integrations/zoho/pull-eway/{inv['id']}", headers=H).json()
    check("nothing is invented before it exists", r["found"] is False, str(r))

    STATE["eway"][zid] = "391000987654"          # raised in Zoho
    r = c.post(f"/api/integrations/zoho/pull-eway/{inv['id']}", headers=H).json()
    check("once raised, it is found", r["found"] is True and r["eway_bill_no"] == "391000987654")
    stored = c.get(f"/api/invoices/{inv['id']}", headers=H).json()
    check("and lands on the invoice here", stored["ewb_no"] == "391000987654")
    check("marked as having come from Zoho", stored["ewb_source"] == "zoho")

    inv2 = make_invoice()
    p2 = c.post(f"/api/integrations/zoho/push/{inv2['id']}", headers=H).json()
    STATE["eway"][p2["zoho_invoice_id"]] = "391000111222"
    r = c.post("/api/integrations/zoho/sync-eway", headers=H).json()
    check("a sweep picks up every one that has been raised", r["found"] >= 1, str(r))


def test_failures_are_survivable():
    print("\nwhen Zoho refuses")
    inv = make_invoice()
    STATE["fail"] = "api"
    r = c.post(f"/api/integrations/zoho/push/{inv['id']}", headers=H)
    check("the push reports the refusal", r.status_code == 502, str(r.status_code))
    check("in Zoho's own words", "not authorized" in r.text, r.text[:140])
    stored = c.get(f"/api/invoices/{inv['id']}", headers=H).json()
    check("the invoice still exists here", stored["invoice_no"])
    check("with the error kept against it", "not authorized" in stored["zoho_error"])

    q = c.get("/api/integrations/zoho/queue", headers=H, params={"status": "failed"}).json()
    check("and it shows in the queue", any(x["id"] == inv["id"] for x in q["rows"]))

    STATE["fail"] = None
    r = c.post(f"/api/integrations/zoho/push/{inv['id']}", headers=H)
    check("retrying after the fix works", r.json().get("zoho_invoice_id"))
    stored = c.get(f"/api/invoices/{inv['id']}", headers=H).json()
    check("and the error is cleared", not stored.get("zoho_error"))

    STATE["fail"] = "auth"
    r = c.post("/api/integrations/zoho/test", headers=H)
    check("a bad connection is reported plainly", r.status_code == 400, str(r.status_code))
    STATE["fail"] = None


def test_off_by_default():
    print("\nnothing leaves unless it is switched on")
    configure(enabled=False)
    inv = make_invoice()
    before = len(STATE["invoices"])
    r = c.post(f"/api/integrations/zoho/push/{inv['id']}", headers=H).json()
    check("a push is skipped while Zoho is off", r.get("skipped"), str(r))
    check("and nothing is sent", len(STATE["invoices"]) == before)
    configure(enabled=True, auto_push=False)
    made = c.post("/api/invoices", headers=H, json={
        "party_id": "c1", "invoice_date": "2026-10-07", "type": "sale", "status": "finalized",
        "items": [{"product_id": "p1", "name": "Steel rod 12mm", "hsn": "7214", "qty": 1,
                   "unit": "NOS", "rate": 1000, "discount_pct": 0, "gst_rate": 18}]}).json()
    check("with auto-push off, raising a sale sends nothing",
          made.get("mirrored_to") is None, str(made.get("mirrored_to")))
    configure(enabled=True, auto_push=True)
    made = c.post("/api/invoices", headers=H, json={
        "party_id": "c1", "invoice_date": "2026-10-07", "type": "sale", "status": "finalized",
        "items": [{"product_id": "p1", "name": "Steel rod 12mm", "hsn": "7214", "qty": 1,
                   "unit": "NOS", "rate": 1000, "discount_pct": 0, "gst_rate": 18}]}).json()
    check("with it on, the sale is queued for Zoho", made.get("mirrored_to") == "zoho")


def test_payload_shape():
    print("\nthe shape we send")
    body = Z.build_invoice(
        {"invoice_no": "INV-1", "invoice_date": "2026-10-07", "due_date": "2026-10-21",
         "notes": "handle with care",
         "party_snapshot": {"name": "Acme", "state": "Tamil Nadu"},
         "items": [{"name": "Service fee", "hsn": "998314", "qty": 1, "rate": 5000,
                    "unit": "NOS", "gst_rate": 18, "discount_pct": 10}]},
        "C1", {0: "I1"})
    check("a SAC line is tagged as a service, not goods", body["line_items"][0]["sac"] == "998314")
    check("a discount is sent as a percentage", body["line_items"][0]["discount"] == "10.0%")
    check("our number is kept, not renumbered by Zoho", body["invoice_number"] == "INV-1")
    check("and doubles as the reference", body["reference_number"] == "INV-1")
    check("the due date goes across", body["due_date"] == "2026-10-21")


def main():
    test_settings_and_secrets()
    test_push_creates_what_is_missing()
    test_no_duplicates()
    test_eway_comes_back()
    test_failures_are_survivable()
    test_off_by_default()
    test_payload_shape()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
