"""Signing in must never be refused — making room is fine, locking out is not."""
import os, sys, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
for k, v in {"MONGO_URL": "x", "DB_NAME": "t", "JWT_SECRET": "s", "SECRET_KEY": "s"}.items():
    os.environ.setdefault(k, v)

from mongomock_motor import AsyncMongoMockClient
import server

OK = []
def check(name, cond, extra=""):
    OK.append((name, bool(cond)))
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if not cond and extra else ""))

mdb = AsyncMongoMockClient()["t"]
server.db = mdb


class Req:
    def __init__(self, ua, ip="1.1.1.1", device=None):
        self.headers = {"User-Agent": ua}
        if device:
            self.headers["X-Device-Id"] = device
        self.client = type("C", (), {"host": ip})()


FREE = {"id": "u1", "email": "free@test.in", "name": "Free user"}
STAFF = {"id": "s1", "email": "staff@billingseasy.com", "name": "Us", "is_super_admin": True}

MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"


async def seed():
    await mdb.users.insert_many([dict(FREE), dict(STAFF)])
    for uid, org in (("u1", "org1"), ("s1", "org2")):
        await mdb.organizations.insert_one({"id": org, "name": org, "owner_user_id": uid,
                                            "state_code": "33"})
        await mdb.memberships.insert_one({"id": f"m{uid}", "user_id": uid, "org_id": org,
                                          "role": "owner"})
    # The free account is on Free: one device.
    await mdb.subscriptions.insert_one({"account_id": "u1", "plan_code": "FREE",
                                        "status": "free", "addons": {}})
    await mdb.subscriptions.insert_one({"account_id": "s1", "plan_code": "FREE",
                                        "status": "free", "addons": {}})
asyncio.run(seed())


def test_free_user_is_never_locked_out():
    print("\na one-device plan")
    r1 = asyncio.run(server.register_device(FREE, Req(MAC, device="mac-1")))
    check("the first device signs in", r1["new"] is True)
    check("and nothing was signed out", "signed_out" not in r1)

    r2 = asyncio.run(server.register_device(FREE, Req(PHONE, device="phone-1")))
    check("a second device still signs in", r2["new"] is True, str(r2))
    check("room was made by signing out the first", r2.get("signed_out") == ["Mac"], str(r2))
    check("and they are told, with the plan that covers more",
          "signed you out on Mac" in r2["notice"] and "Starter" in r2["notice"], r2.get("notice"))

    active = asyncio.run(mdb.devices.find({"account_id": "u1", "active": True},
                                          {"_id": 0}).to_list(10))
    check("only the new device is left", len(active) == 1 and active[0]["device_id"] == "phone-1")
    old = asyncio.run(mdb.devices.find_one({"device_id": "mac-1"}, {"_id": 0}))
    check("the old one records why it ended", old["signed_out_reason"] == "device_limit")

    r3 = asyncio.run(server.register_device(FREE, Req(PHONE, device="phone-1")))
    check("signing in again on the same device changes nothing",
          r3["new"] is False and "signed_out" not in r3)

    r4 = asyncio.run(server.register_device(FREE, Req(PC, device="pc-1")))
    check("a third device also gets in", r4["new"] is True)
    check("retiring the phone this time", r4.get("signed_out") == ["iPhone"], str(r4))


def test_staff_are_never_limited():
    print("\nBillingsEasy staff")
    for i, ua in enumerate([MAC, PHONE, PC]):
        r = asyncio.run(server.register_device(STAFF, Req(ua, device=f"staff-{i}")))
        check(f"device {i + 1} gets in", r.get("staff") is True)
    check("no device rows are even written for staff",
          asyncio.run(mdb.devices.count_documents({"account_id": "s1"})) == 0)


def test_paid_plan_is_unlimited():
    print("\na paid plan")
    asyncio.run(mdb.subscriptions.update_one(
        {"account_id": "u1"},
        {"$set": {"plan_code": "STARTER_YEARLY", "status": "active",
                  "current_period_end": "2099-01-01T00:00:00+00:00"}}))
    before = asyncio.run(mdb.devices.count_documents({"account_id": "u1", "active": True}))
    r = asyncio.run(server.register_device(FREE, Req(MAC, device="mac-2")))
    check("another device just signs in", r["new"] is True and "signed_out" not in r)
    after = asyncio.run(mdb.devices.count_documents({"account_id": "u1", "active": True}))
    check("and the earlier one stays signed in", after == before + 1)


def main():
    test_free_user_is_never_locked_out()
    test_staff_are_never_limited()
    test_paid_plan_is_unlimited()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
