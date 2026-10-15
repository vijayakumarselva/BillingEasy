"""The dashboard must survive the data it actually has.

A party saved without a `type` — which earlier versions of the reconcile flow
produced — used to raise KeyError here. The endpoint 500d, the page had no
error handling, and every card rendered `data?.x || 0`: a confident ₹0 across
Sales, Receivable, GST and Net Profit, indistinguishable from an empty
business. Someone reading that would think they had lost their books.
"""
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

USER = {"id": "u1", "email": "owner@test.in", "name": "Owner"}
CTX = {"user": USER, "org_id": "org1", "role": "owner", "permissions": ["*"],
       "allowed_modes": [], "biz_type": "b2b", "entity_id": None, "entity": None,
       "request": None}

THIS_MONTH = server.now_dt().strftime("%Y-%m-05")


async def seed():
    await mdb.organizations.insert_one({"id": "org1", "name": "Test Co", "state_code": "33"})
    await mdb.parties.insert_many([
        {"id": "p1", "org_id": "org1", "name": "Good Customer", "type": "customer",
         "opening_balance": 0},
        {"id": "p2", "org_id": "org1", "name": "Good Supplier", "type": "supplier",
         "opening_balance": 0},
        # The landmine: created by an older reconcile, with no `type` at all.
        {"id": "p3", "org_id": "org1", "name": "Typeless Party", "opening_balance": 0},
    ])
    await mdb.invoices.insert_one({
        "id": "i1", "org_id": "org1", "type": "sale", "party_id": "p1",
        "invoice_no": "INV-1", "invoice_date": THIS_MONTH,
        "items": [{"name": "Thing", "qty": 1, "total": 100000}],
        "totals": {"grand_total": 118000, "cgst": 9000, "sgst": 9000, "igst": 0},
    })
    await mdb.purchases.insert_one({
        "id": "b1", "org_id": "org1", "type": "purchase", "party_id": "p2",
        "purchase_date": THIS_MONTH,
        "totals": {"grand_total": 59000, "cgst": 4500, "sgst": 4500, "igst": 0},
    })
asyncio.run(seed())


def test_a_party_without_a_type_does_not_take_the_dashboard_down():
    print("\nwith one typeless party in the books")
    try:
        d = asyncio.run(server.dashboard(CTX))
    except KeyError as e:
        check("the dashboard loads at all", False, f"KeyError {e}")
        return
    check("the dashboard loads at all", True)
    check("sales for the month are real, not zero", d["sales_total"] == 118000, str(d["sales_total"]))
    check("purchases too", d["purchase_total"] == 59000, str(d["purchase_total"]))
    check("GST is output minus input", d["gst_payable"] == 9000, str(d["gst_payable"]))
    check("the customer's unpaid bill shows as receivable",
          d["receivable"] == 118000, str(d["receivable"]))
    check("and the supplier's as payable", d["payable"] == 59000, str(d["payable"]))
    check("net profit is sales less purchases and expenses",
          d["net_profit"] == 118000 - 59000, str(d["net_profit"]))


def test_figures_are_not_silently_zero():
    print("\nthe numbers mean something")
    d = asyncio.run(server.dashboard(CTX))
    check("a month with trade never reports a flat zero everywhere",
          any(d[k] for k in ("sales_total", "purchase_total", "receivable", "payable")))


def main():
    test_a_party_without_a_type_does_not_take_the_dashboard_down()
    test_figures_are_not_silently_zero()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
