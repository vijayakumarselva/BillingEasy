"""Rates quoted with GST inside them.

The sugar invoice from the shop floor: 170 bags at ₹23,100 a bag, GST 5%,
quoted inclusive. The customer owes ₹39,27,000 — that is the whole point of an
inclusive price. Worked the other way round it comes to ₹41,23,350, which is
₹1,96,350 of tax charged on tax.

What used to happen was subtler. The front end converted the inclusive rate to
its taxable base (₹22,000) before saving, because the server only ever added
GST on top. The grand total came out right, but the invoice printed ₹22,000 a
bag where ₹23,100 had been agreed, and any discount was folded into the rate
and vanished from the bill.
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
for k, v in {"MONGO_URL": "x", "DB_NAME": "t", "JWT_SECRET": "s", "SECRET_KEY": "s"}.items():
    os.environ.setdefault(k, v)

import server

OK = []
def check(name, cond, extra=""):
    OK.append((name, bool(cond)))
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if not cond and extra else ""))

SUGAR = [{"name": "Sugar 50KGS", "hsn": "17011490", "qty": 170, "unit": "BAGS",
          "rate": 23100, "discount_pct": 0, "gst_rate": 5}]


def test_the_sugar_invoice():
    print("\n170 bags at ₹23,100 inclusive, GST 5%")
    t = server.calc_invoice_totals([dict(SUGAR[0])], same_state=True, tax_inclusive=True)
    check("the customer owes exactly the inclusive price", t["grand_total"] == 3927000.0,
          str(t["grand_total"]))
    check("the taxable value is backed out of it", t["taxable_amount"] == 3740000.0,
          str(t["taxable_amount"]))
    check("CGST is half of 5% of that", t["cgst"] == 93500.0, str(t["cgst"]))
    check("SGST the other half", t["sgst"] == 93500.0, str(t["sgst"]))
    check("subtotal is reported before tax", t["subtotal"] == 3740000.0, str(t["subtotal"]))
    check("the rate on the line is the one that was agreed",
          t["items"][0]["rate"] == 23100, str(t["items"][0]["rate"]))
    check("and the taxable rate per bag is there for the invoice to print",
          t["items"][0]["taxable_rate"] == 22000.0, str(t["items"][0].get("taxable_rate")))
    check("the flag travels with the totals", t["tax_inclusive"] is True)


def test_the_same_bill_quoted_exclusive():
    print("\nthe same rate quoted exclusive means a bigger bill")
    t = server.calc_invoice_totals([dict(SUGAR[0])], same_state=True, tax_inclusive=False)
    check("GST is added on top", t["grand_total"] == 4123350.0, str(t["grand_total"]))
    check("the taxable value is the full gross", t["taxable_amount"] == 3927000.0,
          str(t["taxable_amount"]))
    check("exclusive is still the default",
          server.calc_invoice_totals([dict(SUGAR[0])], True)["grand_total"] == 4123350.0)


def test_a_discount_survives():
    print("\na 10% discount on an inclusive price")
    line = dict(SUGAR[0], discount_pct=10)
    t = server.calc_invoice_totals([line], same_state=True, tax_inclusive=True)
    # 170 × 23,100 = 39,27,000 inclusive; less 10% = 35,34,300 inclusive.
    check("the customer owes the discounted inclusive price",
          t["grand_total"] == 3534300.0, str(t["grand_total"]))
    check("the discount is reported before tax too", t["discount"] == 374000.0,
          str(t["discount"]))
    check("subtotal less discount is the taxable value",
          round(t["subtotal"] - t["discount"], 2) == t["taxable_amount"],
          f'{t["subtotal"]} - {t["discount"]} != {t["taxable_amount"]}')
    check("the rate still says what was quoted", t["items"][0]["rate"] == 23100)
    check("and the discount is still on the line, not hidden in the rate",
          t["items"][0]["discount_pct"] == 10)


def test_interstate_and_zero_rated():
    print("\nedges")
    t = server.calc_invoice_totals([dict(SUGAR[0])], same_state=False, tax_inclusive=True)
    check("inter-state puts it all in IGST", t["igst"] == 187000.0 and t["cgst"] == 0,
          str(t["igst"]))
    free = [{"name": "Exempt", "qty": 2, "rate": 100, "gst_rate": 0, "discount_pct": 0}]
    t0 = server.calc_invoice_totals(free, same_state=True, tax_inclusive=True)
    check("a nil-rated line is not divided by anything", t0["grand_total"] == 200.0,
          str(t0["grand_total"]))


def main():
    test_the_sugar_invoice()
    test_the_same_bill_quoted_exclusive()
    test_a_discount_survives()
    test_interstate_and_zero_rated()
    failed = [n for n, ok in OK if not ok]
    print(f"\n{len(OK) - len(failed)}/{len(OK)} checks passed")
    if failed:
        print("FAILED:\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
