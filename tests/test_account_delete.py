"""Deleting your own account from inside the app.

Apple requires this of any app that lets people sign up (Review Guideline
5.1.1(v)), and it has to really delete. What it must *not* do is take a
business's books with it when someone else still works in them, or wipe
invoices that GST law says to keep for 72 months.
"""
import os, sys, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
for k, v in {"MONGO_URL": "x", "DB_NAME": "t", "JWT_SECRET": "s", "SECRET_KEY": "s"}.items():
    os.environ.setdefault(k, v)

from mongomock_motor import AsyncMongoMockClient
from fastapi import HTTPException
import server

OK = []
def check(name, cond, extra=""):
    OK.append((name, bool(cond)))
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if not cond and extra else ""))

mdb = AsyncMongoMockClient()["t"]
server.db = mdb

PW = server.hash_password("correct-horse")
SOLO = {"id": "u1", "email": "solo@test.in", "name": "Solo", "password_hash": PW}
SHARED = {"id": "u2", "email": "shared@test.in", "name": "Partner", "password_hash": PW}
OTHER = {"id": "u3", "email": "other@test.in", "name": "Still here", "password_hash": PW}
OTP_ONLY = {"id": "u4", "email": "otp@test.in", "name": "No password"}


class Req:
    headers = {"User-Agent": "test"}
    client = type("C", (), {"host": "1.1.1.1"})()


async def seed():
    await mdb.users.insert_many([dict(SOLO), dict(SHARED), dict(OTHER), dict(OTP_ONLY)])
    # org-solo has one member; org-shared has two.
    await mdb.organizations.insert_many([
        {"id": "org-solo", "name": "Solo Traders", "owner_user_id": "u1"},
        {"id": "org-shared", "name": "Shared LLP", "owner_user_id": "u2"},
    ])
    await mdb.memberships.insert_many([
        {"id": "m1", "user_id": "u1", "org_id": "org-solo", "role": "owner"},
        {"id": "m2", "user_id": "u2", "org_id": "org-shared", "role": "owner"},
        {"id": "m3", "user_id": "u3", "org_id": "org-shared", "role": "accountant"},
    ])
    await mdb.devices.insert_one({"account_id": "u1", "user_id": "u1", "device_id": "d1"})
    await mdb.invoices.insert_one({"id": "i1", "org_id": "org-solo", "invoice_no": "INV-1"})
asyncio.run(seed())


def delete(user, **body):
    return asyncio.run(server.delete_account(
        server.DeleteAccountIn(**body), Req(), user))


def refused(user, **body):
    try:
        delete(user, **body)
        return None
    except HTTPException as e:
        return e.detail


def test_it_refuses_a_careless_tap():
    print("\nguards")
    check("nothing happens without the word DELETE",
          "DELETE" in (refused(SOLO, password="correct-horse", confirm="") or ""))
    check("nor with the wrong password",
          "Password is incorrect" == refused(SOLO, password="nope", confirm="DELETE"))
    check("and the user is still there",
          asyncio.run(mdb.users.find_one({"id": "u1"})) is not None)


def test_a_sole_owner_closes_their_business():
    print("\nthe last member of a business")
    res = delete(SOLO, password="correct-horse", confirm="DELETE")
    check("the account goes", res["ok"] and res["orgs_closed"] == 1, str(res))
    check("the user row is gone",
          asyncio.run(mdb.users.find_one({"id": "u1"})) is None)
    check("so are their memberships",
          asyncio.run(mdb.memberships.count_documents({"user_id": "u1"})) == 0)
    check("and their devices",
          asyncio.run(mdb.devices.count_documents({"user_id": "u1"})) == 0)
    org = asyncio.run(mdb.organizations.find_one({"id": "org-solo"}))
    check("the business is marked closed, not deleted", org and org.get("closed") is True)
    check("the invoices survive it — GST law wants 72 months",
          asyncio.run(mdb.invoices.count_documents({"org_id": "org-solo"})) == 1)
    check("and they are told why", "72 months" in res["message"])


def test_a_shared_business_carries_on():
    print("\nwhen someone else still works there")
    res = delete(SHARED, password="correct-horse", confirm="DELETE")
    check("the account goes", res["ok"])
    check("but no business is closed", res["orgs_closed"] == 0, str(res))
    org = asyncio.run(mdb.organizations.find_one({"id": "org-shared"}))
    check("the business is untouched", org and not org.get("closed"))
    check("and the colleague keeps their access",
          asyncio.run(mdb.memberships.count_documents({"user_id": "u3"})) == 1)


def test_otp_only_logins_can_leave_too():
    print("\na login that never had a password")
    res = delete(OTP_ONLY, confirm="DELETE")
    check("no password is demanded of it", res["ok"], str(res))
    check("the user row is gone",
          asyncio.run(mdb.users.find_one({"id": "u4"})) is None)


def main():
    test_it_refuses_a_careless_tap()
    test_a_sole_owner_closes_their_business()
    test_a_shared_business_carries_on()
    test_otp_only_logins_can_leave_too()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
