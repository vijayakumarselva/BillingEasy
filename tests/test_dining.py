"""The whole dining loop: guest orders -> kitchen cooks -> cashier settles."""
import os, sys, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
for k, v in {"MONGO_URL": "x", "DB_NAME": "t", "JWT_SECRET": "s", "SECRET_KEY": "s"}.items():
    os.environ.setdefault(k, v)

from mongomock_motor import AsyncMongoMockClient
from fastapi.testclient import TestClient
import server, dining as D

OK = []
def check(name, cond, extra=""):
    OK.append((name, bool(cond)))
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if not cond and extra else ""))

mdb = AsyncMongoMockClient()["t"]
server.db = mdb
async def _noop(*a, **k): return None
server.audit_log = _noop
server.app.router.on_startup.clear()
OWNER = {"id": "o1", "email": "owner@kada.in", "name": "Vijay", "is_super_admin": True}
# Lets a test sign in as a different role without rebuilding the app.
CURRENT = {"u": OWNER}
server.app.dependency_overrides[server.get_current_user] = lambda: CURRENT["u"]
ORG = "rest1"

MENU = [
    ("p1", "Masala Dosa", "Tiffin", 90),
    ("p2", "Filter Coffee", "Beverages", 40),
    ("p3", "Mutton Biryani", "Biryani", 320),
    ("p4", "Gulab Jamun", "Sweets", 60),
]

async def seed():
    await mdb.users.insert_one(dict(OWNER))
    await mdb.organizations.insert_one({
        "id": ORG, "name": "Seyon Kitchen", "owner_user_id": "o1",
        "state": "Tamil Nadu", "state_code": "33", "gstin": "33AAAAA0000A1Z5",
        "business_type": "restaurant", "created_at": "2026-01-01T00:00:00+00:00"})
    await mdb.memberships.insert_one({"id": "m1", "user_id": "o1", "org_id": ORG, "role": "owner"})
    await server.ensure_system_roles(mdb, ORG)
    await mdb.subscriptions.insert_one({"account_id": "o1", "plan_code": "PRO_YEARLY",
                                        "status": "active", "addons": {},
                                        "current_period_end": "2099-01-01T00:00:00+00:00"})
    await mdb.products.insert_many([
        {"id": pid, "org_id": ORG, "name": n, "category": c, "sale_price": p,
         "gst_rate": 5, "modes": ["restaurant"], "stock": 0}
        for pid, n, c, p in MENU])
asyncio.run(seed())

c = TestClient(server.app)
H = {"X-Org-Id": ORG}


def test_tables():
    print("\ntables & QR")
    r = c.post("/api/dining/tables/bulk", headers=H, json={"count": 6, "prefix": "T", "seats": 4})
    check("the whole floor can be set up at once", r.status_code == 200 and r.json()["created"] == 6,
          r.text[:200])
    tables = c.get("/api/dining/tables", headers=H).json()
    check("every table gets its own QR token",
          len({t["token"] for t in tables}) == 6)
    check("tokens are short enough to print", all(8 <= len(t["token"]) <= 12 for t in tables))
    r = c.post("/api/dining/tables/bulk", headers=H, json={"count": 6, "prefix": "T"})
    check("setting up the floor twice does not double it",
          r.json()["created"] == 0 and len(c.get("/api/dining/tables", headers=H).json()) == 6)
    r = c.post("/api/dining/tables/bulk", headers=H, json={"count": 8, "prefix": "T"})
    check("raising the count adds only the new tables", r.json()["created"] == 2)
    return tables[0]


def test_guest_opens_menu(table):
    print("\nguest scans the QR")
    r = c.get(f"/api/public/dine/{table['token']}")
    check("the QR opens without any login", r.status_code == 200, r.text[:200])
    d = r.json()
    check("it names the outlet and the table",
          d["outlet"]["name"] == "Seyon Kitchen" and d["table"]["name"] == table["name"])
    check("the menu is there", len(d["menu"]) == 4)
    check("menu prices come from the products", 
          next(m for m in d["menu"] if m["name"] == "Mutton Biryani")["price"] == 320)
    check("no session until something is ordered", d["session"] is None)
    r = c.get("/api/public/dine/not-a-real-token")
    check("a wrong QR is refused politely", r.status_code == 404)


def test_place_order(table):
    print("\nguest orders")
    r = c.post(f"/api/public/dine/{table['token']}/order", json={
        "items": [{"product_id": "p1", "qty": 2, "note": "less spicy"},
                  {"product_id": "p2", "qty": 2}],
        "guests": 2, "guest_name": "Anand", "note": "No onion please"})
    check("the order goes through", r.status_code == 200, r.text[:300])
    d = r.json()
    check("a session opened for the table", d["session"]["status"] == "open")
    check("the kitchen has not seen it yet", d["order"]["status"] == "placed")
    check("it is round 1", d["order"]["round"] == 1)
    check("the total is priced by us, not the phone",
          d["session"]["totals"]["items_total"] == 2 * 90 + 2 * 40)
    check("the guest's note is kept", d["order"]["items"][0]["note"] == "less spicy")

    # a phone that lies about the price must not win
    r2 = c.post(f"/api/public/dine/{table['token']}/order",
                json={"items": [{"product_id": "p3", "qty": 1, "rate": 1}]})
    check("a tampered price is ignored",
          r2.json()["order"]["items"][0]["rate"] == 320, r2.text[:200])
    check("the second round is numbered 2", r2.json()["order"]["round"] == 2)
    return d["order"], r2.json()["order"]


def test_kitchen_sees_it(order):
    print("\nkitchen display")
    r = c.get("/api/dining/kitchen", headers=H)
    check("the kitchen board loads", r.status_code == 200, r.text[:200])
    board = r.json()
    check("both rounds are waiting", len(board["orders"]) == 2)
    first = next(o for o in board["orders"] if o["id"] == order["id"])
    check("the kitchen sees the table name", first["table_name"].startswith("T"))
    check("and the dish notes", first["items"][0]["note"] == "less spicy")

    r = c.post(f"/api/dining/orders/{order['id']}/accept", headers=H, json={})
    check("the kitchen can accept", r.status_code == 200 and r.json()["status"] == "accepted",
          r.text[:200])
    r = c.post(f"/api/dining/orders/{order['id']}/preparing", headers=H, json={})
    check("and start cooking", r.json()["status"] == "preparing")
    r = c.post(f"/api/dining/orders/{order['id']}/accept", headers=H, json={})
    check("it cannot go backwards to accepted", r.status_code == 409, str(r.status_code))
    r = c.post(f"/api/dining/orders/{order['id']}/ready", headers=H, json={})
    check("and call it ready", r.json()["status"] == "ready")


def test_unavailable_needs_guest(table, order2):
    print("\nkitchen runs out of something")
    item_id = order2["items"][0]["id"]
    r = c.post(f"/api/dining/orders/{order2['id']}/unavailable", headers=H,
               json={"unavailable_item_ids": [item_id],
                     "note": "Biryani is finished for today, sorry"})
    check("the kitchen can say a dish is finished", r.status_code == 200, r.text[:200])
    check("the only dish being off cancels that round", r.json()["status"] == "cancelled")

    live = c.get(f"/api/public/dine/{table['token']}/live").json()
    orders = {o["id"]: o for o in live["session"]["orders"]}
    o2 = orders[order2["id"]]
    check("the guest is told which dish and why",
          o2["kitchen_note"].startswith("Biryani is finished"))
    check("the guest is not billed for it",
          live["session"]["totals"]["items_total"] == 2 * 90 + 2 * 40)


def test_second_guest_confirmation(table):
    print("\nguest confirms a change")
    r = c.post(f"/api/public/dine/{table['token']}/order",
               json={"items": [{"product_id": "p3", "qty": 2}, {"product_id": "p4", "qty": 1}]})
    order = r.json()["order"]
    c.post(f"/api/dining/orders/{order['id']}/unavailable", headers=H,
           json={"unavailable_item_ids": [order["items"][0]["id"]], "note": "Biryani sold out"})
    live = c.get(f"/api/public/dine/{table['token']}/live").json()
    o = next(x for x in live["session"]["orders"] if x["id"] == order["id"])
    check("the order pauses for the guest", o["status"] == "needs_guest")

    r = c.post(f"/api/public/dine/{table['token']}/orders/{order['id']}/confirm", json={})
    check("the guest can say carry on", r.json()["status"] == "accepted", r.text[:200])
    live = c.get(f"/api/public/dine/{table['token']}/live").json()
    check("only the dish they still want is billed",
          live["session"]["totals"]["items_total"] == 2 * 90 + 2 * 40 + 60)

    r = c.post(f"/api/public/dine/{table['token']}/order",
               json={"items": [{"product_id": "p4", "qty": 3}]})
    o3 = r.json()["order"]
    c.post(f"/api/dining/orders/{o3['id']}/unavailable", headers=H,
           json={"unavailable_item_ids": [o3["items"][0]["id"]]})
    live = c.get(f"/api/public/dine/{table['token']}/live").json()
    o3live = next(x for x in live["session"]["orders"] if x["id"] == o3["id"])
    check("striking the only dish cancels the round", o3live["status"] == "cancelled")


def test_live_sync(table):
    print("\nthe three screens stay in step")
    seq = c.get("/api/dining/live", headers=H).json()["seq"]
    c.post(f"/api/public/dine/{table['token']}/call-waiter", json={"reason": "need water"})
    r = c.get("/api/dining/live", headers=H, params={"since": seq}).json()
    check("the floor hears the waiter call",
          any(e["kind"] == "waiter.called" for e in r["events"]), str(r["events"])[:200])
    check("and the sequence moves on", r["seq"] > seq)
    check("asking again from the new point is quiet",
          len(c.get("/api/dining/live", headers=H, params={"since": r["seq"]}).json()["events"]) == 0)

    other = c.get("/api/dining/tables", headers=H).json()[1]
    g = c.get(f"/api/public/dine/{other['token']}/live", params={"since": 0}).json()
    check("a guest only ever hears about their own table",
          all(e["table_id"] == other["id"] for e in g["events"]))


def test_bill_and_settle(table):
    print("\nbill and payment")
    r = c.post(f"/api/public/dine/{table['token']}/request-bill", json={})
    check("the guest can ask for the bill", r.status_code == 200, r.text[:200])
    check("they are told where to pay", "counter" in r.json()["message"].lower())
    sess = r.json()["session"]
    check("the table shows as bill-requested", sess["status"] == "bill_requested")

    r = c.post(f"/api/public/dine/{table['token']}/order",
               json={"items": [{"product_id": "p2", "qty": 1}]})
    check("no new orders once the bill is called", r.status_code == 409, str(r.status_code))

    floor = c.get("/api/dining/floor", headers=H).json()
    row = next(t for t in floor["tables"] if t["table"]["id"] == table["id"])
    check("the floor screen flags it", row["state"] == "bill")
    check("the owner sees the live value of the table", row["totals"]["grand_total"] > 0)
    check("and the running floor total", floor["summary"]["live_total"] > 0)

    r = c.post(f"/api/dining/sessions/{sess['id']}/settle", headers=H,
               json={"payment_mode": "upi", "guest_name": "Anand"})
    check("the cashier can settle", r.status_code == 200, r.text[:300])
    inv = r.json()["invoice"]
    check("a GST invoice is raised", bool(inv["invoice_no"]))
    check("it is a service bill under SAC 996331",
          all(i["hsn"] == "996331" for i in inv["items"]))
    check("the bill matches the menu prices the guest saw",
          round(inv["totals"]["grand_total"]) == round(sess["totals"]["grand_total"]),
          f"{inv['totals']['grand_total']} vs {sess['totals']['grand_total']}")
    check("GST is inside the menu price, not added on top",
          inv["totals"]["taxable_amount"] < sess["totals"]["grand_total"])
    check("it splits CGST and SGST within the state",
          inv["totals"]["cgst"] > 0 and inv["totals"]["igst"] == 0)

    pays = asyncio.run(mdb.payments.find({"org_id": ORG}, {"_id": 0}).to_list(10))
    check("the payment is recorded", len(pays) == 1 and pays[0]["mode"] == "upi")
    check("for the full bill", round(pays[0]["amount"]) == round(inv["totals"]["grand_total"]))

    r2 = c.post(f"/api/dining/sessions/{sess['id']}/settle", headers=H, json={"payment_mode": "cash"})
    check("settling twice does not bill twice", r2.json().get("already") is True)

    floor = c.get("/api/dining/floor", headers=H).json()
    row = next(t for t in floor["tables"] if t["table"]["id"] == table["id"])
    check("the table is free again", row["state"] == "free")
    check("and counted in today's sales", floor["summary"]["settled_today"] == 1)


def test_86_a_dish(table):
    print("\n86 a dish from the floor")
    r = c.put("/api/dining/menu", headers=H,
              json={"product_id": "p3", "menu_out_of_stock": True})
    check("a dish can be marked finished", r.status_code == 200, r.text[:200])
    menu = c.get(f"/api/public/dine/{table['token']}").json()["menu"]
    check("the guest sees it greyed out",
          next(m for m in menu if m["id"] == "p3")["available"] is False)
    r = c.post(f"/api/public/dine/{table['token']}/order",
               json={"items": [{"product_id": "p3", "qty": 1}]})
    check("and cannot order it", r.status_code == 409, str(r.status_code))
    check("with a message naming the dish", "Mutton Biryani" in r.json()["detail"])
    c.put("/api/dining/menu", headers=H, json={"product_id": "p3", "menu_out_of_stock": False})


def test_stop_taking_orders(table):
    print("\nkitchen closes the tablets")
    c.put("/api/dining/settings", headers=H, json={"accept_orders": False})
    r = c.post(f"/api/public/dine/{table['token']}/order",
               json={"items": [{"product_id": "p1", "qty": 1}]})
    check("ordering is shut off cleanly", r.status_code == 423, str(r.status_code))
    c.put("/api/dining/settings", headers=H, json={"accept_orders": True})
    r = c.post(f"/api/public/dine/{table['token']}/order",
               json={"items": [{"product_id": "p1", "qty": 1}]})
    check("and back on again", r.status_code == 200, r.text[:200])
    sess = r.json()["session"]
    c.post(f"/api/dining/sessions/{sess['id']}/cancel", headers=H)


def test_staff_side(table):
    print("\nwaiter takes the order instead")
    tables = c.get("/api/dining/tables", headers=H).json()
    t2 = tables[2]
    r = c.post("/api/dining/sessions/open", headers=H,
               json={"table_id": t2["id"], "guests": 4, "guest_name": "Walk-in"})
    check("a walk-in can be seated from the floor", r.status_code == 200, r.text[:200])
    sess = r.json()
    r = c.post("/api/dining/orders", headers=H,
               json={"session_id": sess["id"], "items": [{"product_id": "p3", "qty": 4}]})
    check("the waiter can send an order", r.status_code == 200, r.text[:200])
    check("the kitchen cannot tell the difference", r.json()["status"] == "placed")
    board = c.get("/api/dining/kitchen", headers=H).json()
    check("it lands on the same kitchen board",
          any(o["id"] == r.json()["id"] for o in board["orders"]))


def test_roles():
    """Each role reaches its own screen and nothing else."""
    print("\nroles")
    from rbac import SYSTEM_ROLES, role_home

    async def add(uid, email, role):
        await mdb.users.insert_one({"id": uid, "email": email, "name": role})
        await mdb.memberships.insert_one({"id": f"m-{uid}", "user_id": uid,
                                          "org_id": ORG, "role": role})
    asyncio.run(add("k1", "cook@kada.in", "kitchen"))
    asyncio.run(add("f1", "floor@kada.in", "floor-manager"))

    check("the kitchen lands on the kitchen screen", role_home("kitchen") == "/kitchen-screen")
    check("the floor manager lands on the floor", role_home("floor-manager") == "/dining")
    check("the owner still lands on the dashboard", role_home("owner") == "/dashboard")

    KITCHEN = {"id": "k1", "email": "cook@kada.in", "name": "Cook"}
    FLOOR = {"id": "f1", "email": "floor@kada.in", "name": "Floor"}

    # ── kitchen login ──
    CURRENT["u"] = KITCHEN
    check("the kitchen can see its board", c.get("/api/dining/kitchen", headers=H).status_code == 200)
    board = c.get("/api/dining/kitchen", headers=H).json()
    check("tickets carry how long the guest has waited",
          all("waiting_minutes" in o for o in board["orders"]), str(board["orders"])[:120])
    check("the kitchen cannot open the floor",
          c.get("/api/dining/floor", headers=H).status_code == 403)
    check("the kitchen cannot settle a bill",
          c.post("/api/dining/sessions/x/settle", headers=H,
                 json={"payment_mode": "cash"}).status_code == 403)
    check("the kitchen cannot read invoices",
          c.get("/api/invoices", headers=H).status_code == 403)
    check("the kitchen cannot touch the menu",
          c.put("/api/dining/menu", headers=H,
                json={"product_id": "p1", "menu_out_of_stock": True}).status_code == 403)
    check("the kitchen cannot make tables",
          c.post("/api/dining/tables/bulk", headers=H, json={"count": 2}).status_code == 403)
    check("the kitchen cannot see the subscription",
          c.get("/api/subscription", headers=H).status_code in (403, 402),
          str(c.get("/api/subscription", headers=H).status_code))

    # ── floor manager ──
    CURRENT["u"] = FLOOR
    check("the floor manager sees the floor",
          c.get("/api/dining/floor", headers=H).status_code == 200)
    floor = c.get("/api/dining/floor", headers=H).json()
    check("the floor reports what is running late",
          set(floor["summary"]) >= {"late", "warning", "longest_wait", "late_tables"})
    check("the floor manager can also watch the kitchen",
          c.get("/api/dining/kitchen", headers=H).status_code == 200)
    check("the floor manager cannot see purchases",
          c.get("/api/purchases", headers=H).status_code == 403)
    check("the floor manager cannot change prices or tables",
          c.post("/api/dining/tables/bulk", headers=H, json={"count": 2}).status_code == 403)
    check("the floor manager cannot invite staff",
          c.post("/api/orgs/current/members", headers=H,
                 json={"email": "x@y.in", "name": "X", "password": "secret1",
                       "role": "kitchen"}).status_code == 403)

    # ── owner ──
    CURRENT["u"] = OWNER
    check("the owner can do all of it",
          c.get("/api/dining/floor", headers=H).status_code == 200
          and c.get("/api/dining/kitchen", headers=H).status_code == 200
          and c.post("/api/dining/tables/bulk", headers=H, json={"count": 8}).status_code == 200)

    perms = SYSTEM_ROLES["kitchen"]["permissions"]
    check("the kitchen role carries only what it needs",
          set(perms) == {"dining.kitchen", "product.view"}, str(perms))


def test_delays():
    print("\ndelays")
    import dining as D
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    fresh = {"status": "placed", "placed_at": (now - timedelta(minutes=3)).isoformat()}
    warm = {"status": "preparing", "placed_at": (now - timedelta(minutes=14)).isoformat()}
    late = {"status": "preparing", "placed_at": (now - timedelta(minutes=25)).isoformat()}
    done = {"status": "served", "placed_at": (now - timedelta(minutes=40)).isoformat(),
            "served_at": (now - timedelta(minutes=30)).isoformat()}
    waiting = {"status": "needs_guest", "placed_at": (now - timedelta(minutes=30)).isoformat()}

    check("a new order is not late", D.delay_level(fresh, now) == "ok")
    check("twelve minutes is worth a glance", D.delay_level(warm, now) == "warn")
    check("twenty minutes needs someone to go over", D.delay_level(late, now) == "late")
    check("a served round stops the clock", D.delay_level(done, now) == "ok")
    check("and its wait is measured to when it landed",
          D.minutes_waiting(done, now) == 10)
    check("waiting on the guest is not the kitchen being slow",
          D.delay_level(waiting, now) == "ok")

    summary = D.delay_summary([fresh, warm, late, done, waiting], now)
    check("the floor counts the late ones", summary["late"] == 1 and summary["warning"] == 1)
    check("and knows the longest wait", summary["longest_wait"] >= 25)


def main():
    table = test_tables()
    test_guest_opens_menu(table)
    o1, o2 = test_place_order(table)
    test_kitchen_sees_it(o1)
    test_unavailable_needs_guest(table, o2)
    test_second_guest_confirmation(table)
    test_live_sync(table)
    test_bill_and_settle(table)
    test_86_a_dish(table)
    test_stop_taking_orders(table)
    test_staff_side(table)
    test_delays()
    test_roles()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
