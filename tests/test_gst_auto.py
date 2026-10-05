"""Filing an invoice with the government automatically — who, when, and why not."""
import os, sys, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
for k, v in {"MONGO_URL": "x", "DB_NAME": "t", "JWT_SECRET": "s", "SECRET_KEY": "s"}.items():
    os.environ.setdefault(k, v)

from mongomock_motor import AsyncMongoMockClient
from fastapi.testclient import TestClient
import server, gst_auto as G

OK = []
def check(name, cond, extra=""):
    OK.append((name, bool(cond)))
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if not cond and extra else ""))

mdb = AsyncMongoMockClient()["t"]
server.db = mdb
async def _noop(*a, **k): return None
server.audit_log = _noop
server.app.router.on_startup.clear()
OWNER = {"id": "o1", "email": "owner@nh.in", "name": "Vijay", "is_super_admin": True}
server.app.dependency_overrides[server.get_current_user] = lambda: OWNER
ORG = "org1"

GOODS = {"gstin": "33BBBBB1111B1ZU", "name": "Acme Traders", "state_code": "33"}
B2C = {"gstin": "", "name": "Walk-in", "state_code": "33"}

def inv(**kw):
    base = {"id": "i1", "org_id": ORG, "type": "sale", "status": "finalized",
            "invoice_no": "INV-1", "invoice_date": "2026-10-05",
            "party_snapshot": GOODS, "totals": {"grand_total": 120000},
            "items": [{"name": "Steel rod", "hsn": "7214", "qty": 10}]}
    base.update(kw)
    return base

ON = {"enabled": True, "auto_einvoice": True, "auto_eway": True,
      "einvoice_threshold": 0, "eway_threshold": 50000,
      "eway_default_distance": 120, "eway_default_vehicle": "TN34AB1234"}


def test_einvoice_rules():
    print("\nwhen an IRN is raised")
    check("a B2B tax invoice is filed", G.einvoice_decision(inv(), ON)["run"] is True)
    d = G.einvoice_decision(inv(party_snapshot=B2C), ON)
    check("a B2C sale is not", d["run"] is False)
    check("and it says why", "no GSTIN" in d["reason"], d["reason"])
    check("a draft is left alone", G.einvoice_decision(inv(status="draft"), ON)["run"] is False)
    check("a quotation is not an invoice",
          G.einvoice_decision(inv(type="quotation"), ON)["run"] is False)
    check("one already registered is not filed twice",
          G.einvoice_decision(inv(irn="abc"), ON)["status"] == G.DONE)
    check("nothing happens with filing switched off",
          G.einvoice_decision(inv(), {**ON, "enabled": False})["run"] is False)
    check("nor with automation switched off",
          G.einvoice_decision(inv(), {**ON, "auto_einvoice": False})["run"] is False)
    d = G.einvoice_decision(inv(totals={"grand_total": 4000}),
                            {**ON, "einvoice_threshold": 50000})
    check("a threshold is respected", d["run"] is False and "threshold" in d["reason"])


def test_eway_rules():
    print("\nwhen an e-way bill is raised")
    check("goods above the limit need one", G.eway_decision(inv(), ON)["run"] is True)
    d = G.eway_decision(inv(totals={"grand_total": 20000}), ON)
    check("below ₹50,000 none is needed", d["run"] is False)
    check("and the reason quotes both numbers",
          "20,000" in d["reason"] and "50,000" in d["reason"], d["reason"])

    service = inv(items=[{"name": "Consulting", "hsn": "998314", "qty": 1}])
    d = G.eway_decision(service, ON)
    check("a pure service never needs one", d["run"] is False)
    check("because services do not move", "do not move" in d["reason"], d["reason"])
    check("a service-category invoice is spotted too",
          G.eway_decision(inv(invoice_category="service"), ON)["run"] is False)

    d = G.eway_decision(inv(), {**ON, "eway_default_distance": 0, "eway_default_vehicle": ""})
    check("without transport details it waits rather than failing",
          d["status"] == G.NEEDS_INPUT)
    check("and names exactly what is missing",
          "distance" in d["reason"] and "vehicle" in d["reason"], d["reason"])

    d = G.eway_decision(inv(transport={"distance": 40, "transporter_id": "33AAAAA0000A1Z9"}), ON)
    check("a transporter ID is enough without a vehicle", d["run"] is True)
    check("details on the invoice beat the defaults", d["transport"]["distance"] == 40)
    check("a B2C sale of goods still needs one",
          G.eway_decision(inv(party_snapshot=B2C), ON)["run"] is True)


def test_helpers():
    print("\nreading the invoice")
    check("a mixed invoice is not a service",
          G.is_service_invoice(inv(items=[{"hsn": "998314"}, {"hsn": "7214"}])) is False)
    check("an all-SAC invoice is",
          G.is_service_invoice(inv(items=[{"hsn": "998314"}, {"hsn": "996331"}])) is True)
    check("a GSTIN makes it B2B", G.is_b2b(inv()) is True)
    check("no GSTIN makes it B2C", G.is_b2b(inv(party_snapshot=B2C)) is False)
    check("attention is needed when something failed",
          G.needs_attention({"einvoice_status": G.FAILED}) is True)
    check("and when transport details are missing",
          G.needs_attention({"ewb_status": G.NEEDS_INPUT}) is True)
    check("but not when all is done",
          G.needs_attention({"einvoice_status": G.DONE, "ewb_status": G.DONE}) is False)


# ── the real flow, with a stand-in GSP ──────────────────────────────────────
GSP_CALLS = []

async def fake_gsp_post(cfg, path, payload):
    GSP_CALLS.append({"path": path, "payload": payload})
    if "fail" in str(payload).lower():
        from fastapi import HTTPException
        raise HTTPException(502, "GSP rejected: duplicate IRN for this invoice")
    if "ewayapi" in path or "eway" in path.lower():
        return {"EwbNo": "391000123456", "EwbDt": "2026-10-05", "EwbValidTill": "2026-10-07"}
    return {"Irn": "a1b2c3" * 10, "AckNo": "112210000123",
            "AckDt": "2026-10-05", "SignedQRCode": "QR..."}

server._gsp_post = fake_gsp_post

c = TestClient(server.app)
H = {"X-Org-Id": ORG}


async def seed():
    await mdb.users.insert_one(dict(OWNER))
    await mdb.organizations.insert_one({
        "id": ORG, "name": "NammaHut Services", "owner_user_id": "o1",
        "gstin": "33AAAAA0000A1Z9", "state": "Tamil Nadu", "state_code": "33",
        "address": "Rasipuram", "created_at": "2026-01-01T00:00:00+00:00"})
    await mdb.memberships.insert_one({"id": "m1", "user_id": "o1", "org_id": ORG, "role": "owner"})
    await server.ensure_system_roles(mdb, ORG)
    await mdb.subscriptions.insert_one({
        "account_id": "o1", "plan_code": "PRO_YEARLY", "status": "active", "addons": {},
        "current_period_end": "2099-01-01T00:00:00+00:00"})
    await mdb.parties.insert_one({"id": "pa1", "org_id": ORG, **GOODS, "role": "customer"})
    await mdb.products.insert_one({"id": "pr1", "org_id": ORG, "name": "Steel rod",
                                   "hsn": "7214", "sale_price": 1000, "gst_rate": 18,
                                   "stock": 500, "modes": ["b2b"]})
    await mdb.gst_settings.insert_one({
        "org_id": ORG, "id": server.GST_SETTINGS_ID, "enabled": True,
        "provider": "nic_sandbox", "base_url": "https://einv-apisandbox.nic.in",
        "einvoice_path": "/eicore/v1.03/Invoice", "ewaybill_path": "/ewaybillapi/v1.03/ewayapi",
        "client_id": "x", "client_secret": "y", "gstin": "33AAAAA0000A1Z9",
        "auto_einvoice": True, "auto_eway": True, "einvoice_threshold": 0,
        "eway_threshold": 50000, "eway_default_distance": 120,
        "eway_default_vehicle": "TN34AB1234"})
asyncio.run(seed())


def file_now(iid):
    """Run the filing and wait for it, instead of racing the background task."""
    return asyncio.run(server._auto_file_invoice(ORG, iid, OWNER))


def make_invoice(qty=100, party="pa1", auto=False):
    """Create an invoice. `auto=False` keeps the background filing out of the
    way so a test can drive it explicitly and assert on the result."""
    if not auto:
        asyncio.run(mdb.gst_settings.update_one(
            {"org_id": ORG}, {"$set": {"auto_einvoice": False, "auto_eway": False}}))
    r = c.post("/api/invoices", headers=H, json={
        "party_id": party, "invoice_date": "2026-10-05", "type": "sale",
        "status": "finalized",
        "items": [{"product_id": "pr1", "name": "Steel rod", "hsn": "7214", "qty": qty,
                   "unit": "NOS", "rate": 1000, "discount_pct": 0, "gst_rate": 18}]})
    if not auto:
        asyncio.run(mdb.gst_settings.update_one(
            {"org_id": ORG}, {"$set": {"auto_einvoice": True, "auto_eway": True}}))
    return r


def test_end_to_end():
    print("\nraising an invoice files it")
    r = make_invoice(auto=True)
    check("the invoice is created", r.status_code == 200, r.text[:200])
    check("and filing is queued, not blocking", r.json().get("auto_filing") == "queued")
    iid = r.json()["id"]
    res = file_now(iid)
    check("the IRN is registered", res["einvoice"]["status"] == G.DONE, str(res["einvoice"]))
    check("the e-way bill follows", res["eway"]["status"] == G.DONE, str(res["eway"]))

    inv_doc = c.get(f"/api/invoices/{iid}", headers=H).json()
    check("the IRN is on the invoice", len(inv_doc.get("irn") or "") > 10)
    check("so is the e-way bill number", inv_doc.get("ewb_no") == "391000123456")
    check("and when it expires", inv_doc.get("ewb_valid_till") == "2026-10-07")
    check("the GSP was called for both", len(GSP_CALLS) >= 2)
    check("the e-way payload carried the vehicle",
          any("TN34AB1234" in str(cl["payload"]) for cl in GSP_CALLS), str(GSP_CALLS)[-300:])

    r = c.get(f"/api/gst/compliance/preview/{iid}", headers=H)
    check("a preview shows it is already done",
          r.json()["einvoice"]["status"] == G.DONE and r.json()["current"]["irn"])


def test_b2c_and_small():
    print("\nwhat is skipped, and why")
    asyncio.run(mdb.parties.insert_one({"id": "pa2", "org_id": ORG, "name": "Walk-in",
                                        "gstin": "", "state_code": "33", "role": "customer"}))
    iid = make_invoice(qty=100, party="pa2").json()["id"]
    res = file_now(iid)
    check("a B2C sale gets no IRN", res["einvoice"]["status"] == G.SKIPPED)
    check("with the reason recorded", "GSTIN" in res["einvoice"]["reason"])
    check("but the goods still get an e-way bill", res["eway"]["status"] == G.DONE)

    iid = make_invoice(qty=10).json()["id"]        # ₹11,800 — under the limit
    res = file_now(iid)
    check("a small B2B invoice still gets an IRN", res["einvoice"]["status"] == G.DONE)
    check("but no e-way bill", res["eway"]["status"] == G.SKIPPED)
    check("because it is under the limit", "below" in res["eway"]["reason"].lower())


def test_failure_is_survivable():
    print("\nwhen the GSP says no")
    asyncio.run(mdb.gst_settings.update_one(
        {"org_id": ORG}, {"$set": {"eway_default_vehicle": "FAIL123"}}))
    iid = make_invoice().json()["id"]
    res = file_now(iid)
    check("the e-way bill fails", res["eway"]["status"] == G.FAILED, str(res["eway"]))
    check("the invoice still exists", c.get(f"/api/invoices/{iid}", headers=H).status_code == 200)
    doc = c.get(f"/api/invoices/{iid}", headers=H).json()
    check("the error is kept on the invoice", "duplicate IRN" in (doc.get("ewb_error") or ""))

    q = c.get("/api/gst/compliance", headers=H, params={"status": "failed"}).json()
    check("it shows up in the queue", any(r["invoice_id"] == iid for r in q["rows"]))
    check("the counts are reported", q["counts"]["failed"] >= 1)
    check("the automation settings come with it", q["automation"]["auto_eway"] is True)

    asyncio.run(mdb.gst_settings.update_one(
        {"org_id": ORG}, {"$set": {"eway_default_vehicle": "TN34AB1234"}}))
    r = c.post("/api/gst/compliance/retry-all", headers=H)
    check("retrying after the fix works", r.json()["succeeded"] >= 1, r.text[:200])
    doc = c.get(f"/api/invoices/{iid}", headers=H).json()
    check("and the e-way bill lands", doc.get("ewb_no") == "391000123456")


def test_needs_details_queue():
    print("\nwaiting on transport details")
    asyncio.run(mdb.gst_settings.update_one(
        {"org_id": ORG}, {"$set": {"eway_default_distance": 0, "eway_default_vehicle": ""}}))
    iid = make_invoice().json()["id"]
    res = file_now(iid)
    check("it waits for the details", res["eway"]["status"] == G.NEEDS_INPUT)
    q = c.get("/api/gst/compliance", headers=H, params={"status": "pending"}).json()
    check("and is listed as needing them", any(r["invoice_id"] == iid for r in q["rows"]))
    check("counted separately from failures", q["counts"]["needs_details"] >= 1)
    asyncio.run(mdb.gst_settings.update_one(
        {"org_id": ORG}, {"$set": {"eway_default_distance": 120,
                                   "eway_default_vehicle": "TN34AB1234"}}))


def test_off_by_default():
    print("\nnothing happens unless it is switched on")
    asyncio.run(mdb.gst_settings.update_one(
        {"org_id": ORG}, {"$set": {"auto_einvoice": False, "auto_eway": False}}))
    r = make_invoice(auto=True)
    check("no filing is queued", r.json().get("auto_filing") is None)
    asyncio.run(mdb.gst_settings.update_one(
        {"org_id": ORG}, {"$set": {"auto_einvoice": True, "auto_eway": True}}))


def main():
    test_einvoice_rules()
    test_eway_rules()
    test_helpers()
    test_end_to_end()
    test_b2c_and_small()
    test_failure_is_survivable()
    test_needs_details_queue()
    test_off_by_default()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
