"""E-Invoice JSON generator — produces the Schema 1.1 payload that the
official IRP (Invoice Registration Portal) accepts.

We deliberately stop at JSON generation. The actual IRN/QR fetch needs
GST GSP credentials (paid integration); shipping that requires the user
to bring their own GSP/ASP API key. For 95% of SMBs, getting a valid
schema-compliant JSON they can upload (or paste into a free IRP simulator)
already removes the biggest blocker.

Spec reference: https://einv-apisandbox.nic.in (Schema v1.1, 2024-10).
"""
from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional

from gstin import validate as validate_gstin


def _state_code_from_gstin(gstin: str) -> Optional[str]:
    if not gstin or len(gstin) < 2:
        return None
    return gstin[:2]


def _fmt_qty(q: float) -> float:
    return round(float(q or 0), 3)


def _fmt_amt(a: float) -> float:
    return round(float(a or 0), 2)


def _fmt_date(iso: str) -> str:
    """E-invoice wants DD/MM/YYYY."""
    if not iso:
        return ""
    try:
        return datetime.fromisoformat(iso[:10]).strftime("%d/%m/%Y")
    except ValueError:
        return iso


def build_einvoice_json(invoice: Dict[str, Any], org: Dict[str, Any]) -> Dict[str, Any]:
    """Build the IRP-compliant JSON for an existing invoice document.

    Pre-conditions enforced by caller:
    - invoice["type"] == "sale" (only tax invoices, not quotations/credit notes)
    - org has GSTIN configured
    - party_snapshot has GSTIN OR amount <₹50,000 (then B2C)
    """
    party = invoice.get("party_snapshot", {})
    items: List[Dict[str, Any]] = invoice.get("items", [])
    totals = invoice.get("totals", {})

    is_intra = (org.get("state_code") or _state_code_from_gstin(org.get("gstin", ""))) \
               == (party.get("state_code") or _state_code_from_gstin(party.get("gstin", "")))

    item_list = []
    for idx, it in enumerate(items, start=1):
        qty = _fmt_qty(it.get("quantity", 0))
        rate = _fmt_amt(it.get("rate", 0))
        gross = qty * rate
        disc = _fmt_amt(it.get("discount_amount", 0))
        taxable = _fmt_amt(gross - disc)
        gst_rate = float(it.get("gst_rate", 0))
        if is_intra:
            cgst_amt = round(taxable * gst_rate / 200, 2)
            sgst_amt = round(taxable * gst_rate / 200, 2)
            igst_amt = 0.0
        else:
            cgst_amt = 0.0; sgst_amt = 0.0
            igst_amt = round(taxable * gst_rate / 100, 2)
        item_list.append({
            "SlNo": str(idx),
            "PrdDesc": it.get("description") or it.get("name", ""),
            "IsServc": "Y" if str(it.get("hsn", "")).startswith("99") else "N",
            "HsnCd": str(it.get("hsn", "")),
            "Qty": qty,
            "Unit": (it.get("unit") or "NOS").upper(),
            "UnitPrice": rate,
            "TotAmt": _fmt_amt(gross),
            "Discount": disc,
            "AssAmt": taxable,
            "GstRt": gst_rate,
            "IgstAmt": igst_amt,
            "CgstAmt": cgst_amt,
            "SgstAmt": sgst_amt,
            "CesRt": 0,
            "CesAmt": 0,
            "CesNonAdvlAmt": 0,
            "StateCesRt": 0,
            "StateCesAmt": 0,
            "StateCesNonAdvlAmt": 0,
            "OthChrg": 0,
            "TotItemVal": _fmt_amt(taxable + cgst_amt + sgst_amt + igst_amt),
        })

    payload = {
        "Version": "1.1",
        "TranDtls": {
            "TaxSch": "GST",
            "SupTyp": "B2B" if party.get("gstin") else "B2C",
            "RegRev": "N",
            "IgstOnIntra": "N",
        },
        "DocDtls": {
            "Typ": "INV",
            "No": invoice.get("invoice_no", ""),
            "Dt": _fmt_date(invoice.get("invoice_date", "")),
        },
        "SellerDtls": {
            "Gstin": org.get("gstin", ""),
            "LglNm": org.get("name", ""),
            "Addr1": (org.get("address") or "")[:100] or "NA",
            "Loc": org.get("city", "") or "NA",
            "Pin": int(org.get("pincode") or 0) or 110001,
            "Stcd": _state_code_from_gstin(org.get("gstin", "")) or "07",
        },
        "BuyerDtls": {
            "Gstin": party.get("gstin", "URP"),  # URP = unregistered (for B2C)
            "LglNm": party.get("name", ""),
            "Pos": _state_code_from_gstin(party.get("gstin", "")) or party.get("state_code") or "07",
            "Addr1": (party.get("billing_address") or "")[:100] or "NA",
            "Loc": party.get("city", "") or "NA",
            "Pin": int(party.get("pincode") or 0) or 110001,
            "Stcd": _state_code_from_gstin(party.get("gstin", "")) or party.get("state_code") or "07",
        },
        "ItemList": item_list,
        "ValDtls": {
            "AssVal": _fmt_amt(totals.get("subtotal", 0)),
            "CgstVal": _fmt_amt(totals.get("cgst", 0)),
            "SgstVal": _fmt_amt(totals.get("sgst", 0)),
            "IgstVal": _fmt_amt(totals.get("igst", 0)),
            "CesVal": 0,
            "StCesVal": 0,
            "Discount": _fmt_amt(totals.get("discount", 0)),
            "OthChrg": 0,
            "RndOffAmt": 0,
            "TotInvVal": _fmt_amt(totals.get("grand_total", 0)),
        },
    }
    return payload


def precheck_eligibility(invoice: Dict[str, Any], org: Dict[str, Any]) -> Dict[str, Any]:
    """Returns {ok: bool, errors: [...], warnings: [...]} before allowing generation."""
    errors, warnings = [], []
    if invoice.get("type") != "sale":
        errors.append("E-invoice JSON is only generated for tax invoices (type='sale').")
    if not org.get("gstin"):
        errors.append("Your organisation has no GSTIN configured (Settings → Business Profile).")
    elif not validate_gstin(org["gstin"])["valid"]:
        errors.append("Your organisation's GSTIN is invalid — please fix it in Settings.")
    party = invoice.get("party_snapshot") or {}
    if not party.get("gstin"):
        warnings.append("Customer has no GSTIN — will be treated as B2C (URP). E-invoicing is mandatory only for B2B above ₹5cr turnover.")
    elif not validate_gstin(party["gstin"])["valid"]:
        errors.append("Customer's GSTIN is invalid — fix it in Parties before generating e-invoice.")
    if not invoice.get("items"):
        errors.append("Invoice has no line items.")
    for i, it in enumerate(invoice.get("items", []), start=1):
        if not it.get("hsn"):
            errors.append(f"Item {i} has no HSN/SAC code. Use the AI HSN Finder.")
    return {"ok": len(errors) == 0, "errors": errors, "warnings": warnings}
