"""GST tax invoices for BillingsEasy's own subscription revenue.

Every paid subscription, add-on or credit pack produces a proper tax invoice
from our own invoicing engine: our GSTIN as the supplier, the customer's GSTIN
when they give one (so they can claim input tax credit), SAC 998314, and
CGST+SGST or IGST depending on the place of supply.

Our seller identity lives in `platform_settings` (id: "billing_entity") so it
can be corrected without a deploy; the defaults below are the registered
details of the company that operates BillingsEasy.
"""
import os
import uuid
from typing import Any, Dict, Optional

import pricing as P
from subscriptions import now_dt, now_iso

SELLER_DEFAULTS = {
    "name": "Nammahut Services Private Limited",
    "trade_name": "BillingsEasy",
    "gstin": os.environ.get("BILLINGSEASY_GSTIN", ""),
    "pan": os.environ.get("BILLINGSEASY_PAN", ""),
    "address": "Rasipuram, Namakkal",
    "state": "Tamil Nadu",
    "state_code": "33",
    "email": "billing@billingseasy.com",
    "phone": "",
    "invoice_prefix": "BE",
    "terms": ("Subscription fees are payable in advance and are non-refundable "
              "once the period has started."),
}


async def seller_identity(db) -> Dict[str, Any]:
    row = await db.platform_settings.find_one({"id": "billing_entity"}, {"_id": 0}) or {}
    return {**SELLER_DEFAULTS, **{k: v for k, v in row.items() if k != "id" and v}}


async def next_invoice_no(db, prefix: str) -> str:
    """BE/2026-27/0001 — one running series for our own sales, per financial year."""
    now = now_dt()
    fy_start = now.year if now.month >= 4 else now.year - 1
    fy = f"{fy_start}-{str(fy_start + 1)[-2:]}"
    row = await db.platform_counters.find_one_and_update(
        {"id": f"billing_invoice:{fy}"},
        {"$inc": {"seq": 1}},
        upsert=True, return_document=True,
    )
    seq = (row or {}).get("seq") or 1
    return f"{prefix}/{fy}/{seq:04d}"


def _split_tax(taxable_paise: int, seller_state_code: str,
               buyer_state_code: Optional[str]) -> Dict[str, int]:
    """Intra-state -> CGST+SGST, inter-state -> IGST. Unknown state = intra-state."""
    total = P.gst_on(taxable_paise)
    if buyer_state_code and str(buyer_state_code).zfill(2) != str(seller_state_code).zfill(2):
        return {"cgst": 0, "sgst": 0, "igst": total, "interstate": True}
    half = total // 2
    return {"cgst": half, "sgst": total - half, "igst": 0, "interstate": False}


async def create_tax_invoice(db, *, payment: Dict[str, Any], buyer: Dict[str, Any]) -> Dict[str, Any]:
    """Build and store the tax invoice for a successful payment.

    Idempotent: a payment that already has an invoice returns the existing one.
    """
    existing = await db.billing_invoices.find_one({"payment_id": payment["id"]}, {"_id": 0})
    if existing:
        return existing

    seller = await seller_identity(db)
    taxable = int(payment["amount_paise"])          # already net of any discount
    tax = _split_tax(taxable, seller["state_code"], buyer.get("state_code"))
    total = taxable + tax["cgst"] + tax["sgst"] + tax["igst"]

    inv = {
        "id": str(uuid.uuid4()),
        "invoice_no": await next_invoice_no(db, seller["invoice_prefix"]),
        "invoice_date": now_dt().strftime("%Y-%m-%d"),
        "payment_id": payment["id"],
        "account_id": payment["account_id"],
        "seller": seller,
        "buyer": {
            "name": buyer.get("name") or buyer.get("email") or "Customer",
            "gstin": (buyer.get("gstin") or "").upper(),
            "address": buyer.get("address") or "",
            "state": buyer.get("state") or "",
            "state_code": buyer.get("state_code") or seller["state_code"],
            "email": buyer.get("email") or "",
        },
        "place_of_supply": f"{buyer.get('state_code') or seller['state_code']}-"
                           f"{buyer.get('state') or seller['state']}",
        "items": [{
            "name": payment.get("description") or "BillingsEasy subscription",
            "sac": P.SUBSCRIPTION_SAC,
            "qty": payment.get("quantity", 1),
            "rate_paise": taxable // max(1, payment.get("quantity", 1)),
            "taxable_paise": taxable,
            "gst_rate": P.GST_RATE_PCT,
        }],
        "totals": {
            "taxable_paise": taxable,
            "cgst_paise": tax["cgst"], "sgst_paise": tax["sgst"], "igst_paise": tax["igst"],
            "gst_paise": tax["cgst"] + tax["sgst"] + tax["igst"],
            "grand_total_paise": total,
            "interstate": tax["interstate"],
        },
        "discount_paise": payment.get("discount_paise", 0),
        "coupon_code": payment.get("coupon_code"),
        "currency": "INR",
        "reverse_charge": "No",
        "created_at": now_iso(),
    }
    await db.billing_invoices.insert_one(dict(inv))
    await db.billing_payments.update_one(
        {"id": payment["id"]},
        {"$set": {"tax_invoice_id": inv["id"], "tax_invoice_no": inv["invoice_no"]}})
    inv.pop("_id", None)
    return inv


def to_pdf_shape(inv: Dict[str, Any]) -> tuple[dict, dict]:
    """Adapt our billing invoice to the (inv, biz) shape generate_invoice_pdf wants."""
    r = lambda paise: round(paise / 100, 2)
    t = inv["totals"]
    biz = {
        "name": inv["seller"]["name"], "gstin": inv["seller"]["gstin"],
        "pan": inv["seller"].get("pan", ""),
        "address": inv["seller"]["address"], "state": inv["seller"]["state"],
        "state_code": inv["seller"]["state_code"], "email": inv["seller"]["email"],
        "phone": inv["seller"].get("phone", ""),
        "terms": inv["seller"].get("terms", ""),
        "invoice_theme": {"show_bank": False, "show_ship_to": False},
    }
    items = [{
        "name": it["name"], "hsn": it["sac"], "qty": it["qty"], "unit": "NOS",
        "rate": r(it["rate_paise"]), "discount_pct": 0, "gst_rate": it["gst_rate"],
        "taxable": r(it["taxable_paise"]),
        "cgst": r(t["cgst_paise"]), "sgst": r(t["sgst_paise"]), "igst": r(t["igst_paise"]),
        "total": r(it["taxable_paise"] + t["gst_paise"]),
    } for it in inv["items"]]
    doc = {
        "invoice_no": inv["invoice_no"], "invoice_date": inv["invoice_date"],
        "party_snapshot": {
            "name": inv["buyer"]["name"], "gstin": inv["buyer"]["gstin"],
            "address": inv["buyer"]["address"], "state": inv["buyer"]["state"],
            "state_code": inv["buyer"]["state_code"], "email": inv["buyer"]["email"],
        },
        "place_of_supply": inv["place_of_supply"],
        "items": items,
        "totals": {
            "taxable_amount": r(t["taxable_paise"]),
            "cgst": r(t["cgst_paise"]), "sgst": r(t["sgst_paise"]), "igst": r(t["igst_paise"]),
            "round_off": 0, "grand_total": r(t["grand_total_paise"]),
        },
        "notes": f"SAC {P.SUBSCRIPTION_SAC} · Reverse charge: No",
        "status": "paid",
    }
    return doc, biz
