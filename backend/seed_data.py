"""Seed demo data: Vijay Traders org + 3 users + parties + products + invoices."""
import uuid
from datetime import datetime, timezone, timedelta


def _today(offset_days: int = 0) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=offset_days)).strftime("%Y-%m-%d")


def _iso(offset_days: int = 0) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=offset_days)).isoformat()


async def seed_demo_data(db, hash_password):
    # Wipe everything (idempotent)
    for coll in ("users","organizations","memberships","business","parties","products",
                 "invoices","purchases","payments","expenses","bank_accounts","tds_entries","counters"):
        await db[coll].delete_many({})

    # --- Users
    owner_id = str(uuid.uuid4())
    acct_id = str(uuid.uuid4())
    sales_id = str(uuid.uuid4())
    super_id = str(uuid.uuid4())
    await db.users.insert_many([
        {"id": owner_id, "email": "owner@vijaytraders.in", "name": "Vijay Kumar",
         "password_hash": hash_password("admin123"), "created_at": _iso()},
        {"id": acct_id, "email": "accountant@vijaytraders.in", "name": "Priya Sharma",
         "password_hash": hash_password("accountant123"), "created_at": _iso()},
        {"id": sales_id, "email": "sales@vijaytraders.in", "name": "Ravi Iyer",
         "password_hash": hash_password("sales123"), "created_at": _iso()},
        {"id": super_id, "email": "super@billeasy.in", "name": "BillEasy Admin",
         "password_hash": hash_password("super123"), "is_super_admin": True, "created_at": _iso()},
    ])

    # --- Org with active subscription (demo)
    org_id = str(uuid.uuid4())
    period_end = datetime.now(timezone.utc) + timedelta(days=30)
    await db.organizations.insert_one({
        "id": org_id, "name": "Vijay Traders",
        "address": "12, Anna Salai, T. Nagar, Chennai - 600017",
        "state": "Tamil Nadu", "state_code": "33",
        "gstin": "33ABCDE1234F1Z7", "pan": "ABCDE1234F",
        "phone": "+91 98400 12345", "email": "hello@vijaytraders.in",
        "logo_url": "",
        "bank_name": "HDFC Bank", "bank_account": "50100123456789",
        "bank_ifsc": "HDFC0000123", "bank_branch": "T. Nagar, Chennai",
        "terms": "1. Payment due within 30 days from invoice date.\n2. Interest @18% p.a. on overdue amounts.\n3. Goods once sold will not be taken back without prior approval.\n4. Subject to Chennai jurisdiction.",
        "owner_user_id": owner_id,
        "plan_code": "MONTHLY_199",
        "subscription_status": "active",
        "trial_ends_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "current_period_end": period_end.isoformat(),
        "cashfree_subscription_id": "demo_sub_active",
        "created_at": _iso(30),
    })

    # --- Memberships
    await db.memberships.insert_many([
        {"id": str(uuid.uuid4()), "user_id": owner_id, "org_id": org_id, "role": "owner", "created_at": _iso()},
        {"id": str(uuid.uuid4()), "user_id": acct_id, "org_id": org_id, "role": "accountant", "created_at": _iso()},
        {"id": str(uuid.uuid4()), "user_id": sales_id, "org_id": org_id, "role": "sales", "created_at": _iso()},
    ])

    # --- Bank account
    await db.bank_accounts.insert_one({
        "id": str(uuid.uuid4()), "org_id": org_id, "bank_name": "HDFC Bank",
        "account_no": "50100123456789", "ifsc": "HDFC0000123",
        "branch": "T. Nagar", "opening_balance": 250000, "created_at": _iso(),
    })

    # --- Parties
    customers = [
        ("Sundar Electronics", "Chennai", "Tamil Nadu", "33", "33AAACS1234A1Z9"),
        ("Lakshmi Stores", "Coimbatore", "Tamil Nadu", "33", "33AABCL5678B1ZP"),
        ("Mumbai Mobile Mart", "Mumbai", "Maharashtra", "27", "27AABCM9999C1ZZ"),
        ("Bangalore Bazaar", "Bengaluru", "Karnataka", "29", "29AABCB8888D1ZA"),
        ("Hyderabad Hub", "Hyderabad", "Telangana", "36", ""),
    ]
    suppliers = [
        ("Reliance Wholesale", "Mumbai", "Maharashtra", "27", "27AAACR1111E1Z3"),
        ("Tata Distributors", "Chennai", "Tamil Nadu", "33", "33AABCT2222F1ZZ"),
        ("Samsung India", "Gurugram", "Haryana", "06", "06AAACS3333G1ZQ"),
        ("Local Stationery Co.", "Chennai", "Tamil Nadu", "33", ""),
        ("Bharat Logistics", "Chennai", "Tamil Nadu", "33", "33AABCB4444H1ZQ"),
    ]
    party_ids = {}
    for name, city, state, sc, gst in customers:
        pid = str(uuid.uuid4()); party_ids[name] = pid
        await db.parties.insert_one({
            "id": pid, "org_id": org_id, "type": "customer", "name": name,
            "phone": "+91 98765 43210", "email": f"{name.lower().replace(' ','')}@example.com",
            "gstin": gst, "pan": gst[2:12] if gst else "",
            "state": state, "state_code": sc,
            "billing_address": f"Shop No. 1, {city}", "shipping_address": f"Shop No. 1, {city}",
            "opening_balance": 0, "credit_limit": 100000, "created_at": _iso(),
        })
    for name, city, state, sc, gst in suppliers:
        pid = str(uuid.uuid4()); party_ids[name] = pid
        await db.parties.insert_one({
            "id": pid, "org_id": org_id, "type": "supplier", "name": name,
            "phone": "+91 99887 76655", "email": f"{name.lower().replace(' ','')}@vendor.com",
            "gstin": gst, "pan": gst[2:12] if gst else "",
            "state": state, "state_code": sc,
            "billing_address": f"Industrial Estate, {city}",
            "shipping_address": f"Industrial Estate, {city}",
            "opening_balance": 0, "credit_limit": 0, "created_at": _iso(),
        })

    # --- Products
    products = [
        ("Samsung Galaxy A54", "85171290", "NOS", "Mobile", 28000, 32990, 18, 25),
        ("Apple iPhone 15", "85171290", "NOS", "Mobile", 65000, 79990, 18, 12),
        ("USB-C Cable 1m", "85444290", "NOS", "Accessories", 80, 199, 18, 200),
        ("Bluetooth Speaker", "85182900", "NOS", "Accessories", 1500, 2499, 18, 40),
        ("Rice Bag 25kg", "10063020", "BAG", "Grocery", 1200, 1450, 5, 60),
        ("Refined Oil 5L", "15079010", "LTR", "Grocery", 700, 850, 5, 50),
        ("Notebook A4", "48201020", "NOS", "Stationery", 25, 60, 12, 500),
        ("Ball Pen Pack", "96081019", "PKT", "Stationery", 40, 99, 12, 300),
        ("Air Conditioner 1.5T", "84151010", "NOS", "Appliance", 28000, 38990, 28, 8),
        ("LED TV 43inch", "85287100", "NOS", "Appliance", 22000, 29990, 28, 10),
    ]
    product_ids = {}
    for name, hsn, unit, cat, pp, sp, gst, stock in products:
        pid = str(uuid.uuid4()); product_ids[name] = pid
        await db.products.insert_one({
            "id": pid, "org_id": org_id, "name": name,
            "sku": name[:3].upper() + "-" + str(hash(name))[-4:],
            "hsn": hsn, "unit": unit, "category": cat,
            "purchase_price": pp, "sale_price": sp, "gst_rate": gst,
            "stock": stock, "low_stock_alert": 5, "barcode": "", "created_at": _iso(),
        })

    def calc(items, same_state):
        sub = disc = tax = cgst = sgst = igst = 0
        detailed = []
        for it in items:
            gross = it["qty"] * it["rate"]
            d = gross * (it.get("discount_pct", 0) / 100)
            taxable = gross - d
            t = taxable * (it.get("gst_rate", 0) / 100)
            c, s, i_ = (t/2, t/2, 0) if same_state else (0, 0, t)
            total = taxable + t
            detailed.append({**it, "gross": round(gross,2), "discount": round(d,2),
                             "taxable": round(taxable,2), "cgst": round(c,2),
                             "sgst": round(s,2), "igst": round(i_,2), "total": round(total,2)})
            sub += gross; disc += d; tax += taxable; cgst += c; sgst += s; igst += i_
        grand = tax + cgst + sgst + igst
        return detailed, {"subtotal": round(sub,2), "discount": round(disc,2),
                          "taxable_amount": round(tax,2), "cgst": round(cgst,2),
                          "sgst": round(sgst,2), "igst": round(igst,2),
                          "round_off": round(round(grand) - grand, 2),
                          "grand_total": round(round(grand), 2)}

    invoice_specs = [
        ("Sundar Electronics", [("Samsung Galaxy A54", 2), ("USB-C Cable 1m", 5)], 2),
        ("Lakshmi Stores", [("Rice Bag 25kg", 10), ("Refined Oil 5L", 6)], 5),
        ("Mumbai Mobile Mart", [("Apple iPhone 15", 3), ("Bluetooth Speaker", 5)], 8),
        ("Bangalore Bazaar", [("LED TV 43inch", 2), ("Air Conditioner 1.5T", 1)], 12),
        ("Hyderabad Hub", [("Notebook A4", 100), ("Ball Pen Pack", 50)], 15),
    ]
    year = datetime.now(timezone.utc).year
    seq = 0
    biz_state = "33"
    for pname, items_spec, days_ago in invoice_specs:
        seq += 1
        party = await db.parties.find_one({"id": party_ids[pname]}, {"_id": 0})
        same_state = party["state_code"] == biz_state
        items = []
        for prod_name, qty in items_spec:
            prod = await db.products.find_one({"id": product_ids[prod_name]}, {"_id": 0})
            items.append({"product_id": prod["id"], "name": prod["name"], "hsn": prod["hsn"],
                          "qty": qty, "unit": prod["unit"], "rate": prod["sale_price"],
                          "discount_pct": 0, "gst_rate": prod["gst_rate"]})
        detailed, totals = calc(items, same_state)
        await db.invoices.insert_one({
            "id": str(uuid.uuid4()), "org_id": org_id,
            "invoice_no": f"INV-{year}-{seq:04d}",
            "party_id": party["id"], "party_snapshot": party,
            "invoice_date": _today(days_ago), "due_date": _today(days_ago - 30),
            "items": detailed, "totals": totals,
            "notes": "Thank you for your business!", "status": "finalized",
            "type": "sale", "is_recurring": False, "same_state": same_state,
            "created_at": _iso(days_ago),
        })
    await db.counters.insert_one({"key": f"{org_id}:INV-{year}", "seq": seq})

    purchase_specs = [
        ("Reliance Wholesale", [("Apple iPhone 15", 5), ("Samsung Galaxy A54", 10)], 20),
        ("Tata Distributors", [("LED TV 43inch", 5), ("Air Conditioner 1.5T", 3)], 25),
        ("Local Stationery Co.", [("Notebook A4", 500), ("Ball Pen Pack", 200)], 18),
    ]
    for i, (sname, items_spec, days_ago) in enumerate(purchase_specs, 1):
        supp = await db.parties.find_one({"id": party_ids[sname]}, {"_id": 0})
        same_state = supp["state_code"] == biz_state
        items = []
        for prod_name, qty in items_spec:
            prod = await db.products.find_one({"id": product_ids[prod_name]}, {"_id": 0})
            items.append({"product_id": prod["id"], "name": prod["name"], "hsn": prod["hsn"],
                          "qty": qty, "unit": prod["unit"], "rate": prod["purchase_price"],
                          "discount_pct": 0, "gst_rate": prod["gst_rate"]})
        detailed, totals = calc(items, same_state)
        await db.purchases.insert_one({
            "id": str(uuid.uuid4()), "org_id": org_id,
            "party_id": supp["id"], "party_snapshot": supp,
            "bill_no": f"BILL-{1000+i}", "purchase_date": _today(days_ago),
            "items": detailed, "totals": totals, "notes": "", "type": "purchase",
            "same_state": same_state, "created_at": _iso(days_ago),
        })

    invs = await db.invoices.find({"org_id": org_id, "type": "sale"}, {"_id": 0}).to_list(5)
    if invs:
        await db.payments.insert_one({
            "id": str(uuid.uuid4()), "org_id": org_id, "party_id": invs[0]["party_id"],
            "direction": "received", "amount": invs[0]["totals"]["grand_total"],
            "mode": "UPI", "date": _today(1), "reference": f"UPI-{invs[0]['invoice_no']}",
            "bank_account_id": "", "invoice_id": invs[0]["id"], "created_at": _iso(1),
        })
        await db.payments.insert_one({
            "id": str(uuid.uuid4()), "org_id": org_id, "party_id": invs[1]["party_id"],
            "direction": "received", "amount": invs[1]["totals"]["grand_total"] / 2,
            "mode": "Cash", "date": _today(4), "reference": f"Partial-{invs[1]['invoice_no']}",
            "bank_account_id": "", "invoice_id": invs[1]["id"], "created_at": _iso(4),
        })

    for cat, amt, days, desc in [("Rent", 35000, 10, "Shop rent"),
                                  ("Electricity", 6500, 7, "TNEB Bill"),
                                  ("Internet", 1200, 5, "Broadband"),
                                  ("Salaries", 85000, 2, "Staff salaries")]:
        await db.expenses.insert_one({
            "id": str(uuid.uuid4()), "org_id": org_id,
            "category": cat, "amount": amt, "date": _today(days),
            "description": desc, "gst_rate": 0, "created_at": _iso(days),
        })

    supp = await db.parties.find_one({"id": party_ids["Bharat Logistics"]}, {"_id": 0})
    await db.tds_entries.insert_one({
        "id": str(uuid.uuid4()), "org_id": org_id, "party_id": supp["id"],
        "section": "194C", "rate": 1.0, "amount": 50000, "tds_amount": 500,
        "date": _today(15), "notes": "Transport service TDS", "created_at": _iso(15),
    })
