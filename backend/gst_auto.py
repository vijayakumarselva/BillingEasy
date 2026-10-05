"""Filing an invoice with the government, automatically, the moment it is raised.

The law, in short:

* **E-invoice (IRN)** — a B2B tax invoice must be registered on the IRP before it
  is a valid invoice. It does not apply to B2C sales (the buyer has no GSTIN),
  and it only applies at all once your turnover crosses the notified limit.
* **E-way bill** — goods moving on a value above ₹50,000 need one. Services do
  not move, so a pure-service bill never needs one. The IRP often returns the
  e-way bill alongside the IRN when transport details are sent with it.

What this module decides is *whether* to file; `server.py` does the filing.
Nothing here ever blocks a sale: if the GSP is down or a detail is missing, the
invoice still exists and lands in a queue the owner can see and retry.
"""
from typing import Any, Dict, List, Optional

# Services do not move on a lorry, so they never need an e-way bill.
SERVICE_SAC_PREFIX = "99"
EWAY_DEFAULT_THRESHOLD = 50000.0

# What we record on the invoice so the owner always knows where it stands.
PENDING = "pending"
SKIPPED = "not_required"
DONE = "generated"
FAILED = "failed"
NEEDS_INPUT = "needs_details"


def is_service_invoice(inv: Dict[str, Any]) -> bool:
    """True when every line is a service — an e-way bill cannot apply."""
    items = inv.get("items") or []
    if not items:
        return False
    if (inv.get("invoice_category") or "") == "service":
        return True
    codes = [str(i.get("hsn") or "") for i in items]
    return all(c.startswith(SERVICE_SAC_PREFIX) for c in codes if c)


def is_b2b(inv: Dict[str, Any]) -> bool:
    party = inv.get("party_snapshot") or {}
    return bool((party.get("gstin") or "").strip())


def invoice_value(inv: Dict[str, Any]) -> float:
    return float((inv.get("totals") or {}).get("grand_total") or 0)


def einvoice_decision(inv: Dict[str, Any], cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Should this invoice be registered on the IRP right now?"""
    if not cfg.get("enabled"):
        return {"run": False, "status": SKIPPED, "reason": "GST filing is switched off"}
    if not cfg.get("auto_einvoice"):
        return {"run": False, "status": SKIPPED, "reason": "Automatic e-invoicing is off"}
    if inv.get("irn"):
        return {"run": False, "status": DONE, "reason": "Already registered"}
    if inv.get("type") != "sale":
        return {"run": False, "status": SKIPPED,
                "reason": f"E-invoicing applies to tax invoices, not a {inv.get('type')}"}
    if (inv.get("status") or "") not in ("finalized", "paid", "partially_paid"):
        return {"run": False, "status": SKIPPED, "reason": "Draft invoices are not filed"}
    if not is_b2b(inv):
        return {"run": False, "status": SKIPPED,
                "reason": "B2C sale — the buyer has no GSTIN, so no IRN is required"}
    value = invoice_value(inv)
    threshold = float(cfg.get("einvoice_threshold") or 0)
    if threshold and value < threshold:
        return {"run": False, "status": SKIPPED,
                "reason": f"Below your ₹{threshold:,.0f} e-invoice threshold"}
    return {"run": True, "status": PENDING, "reason": "B2B tax invoice"}


def eway_decision(inv: Dict[str, Any], cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Should an e-way bill be raised, and do we have what it needs?"""
    if not cfg.get("enabled"):
        return {"run": False, "status": SKIPPED, "reason": "GST filing is switched off"}
    if not cfg.get("auto_eway"):
        return {"run": False, "status": SKIPPED, "reason": "Automatic e-way bills are off"}
    if inv.get("ewb_no"):
        return {"run": False, "status": DONE, "reason": "Already raised"}
    if inv.get("type") != "sale":
        return {"run": False, "status": SKIPPED, "reason": "Only sales move goods"}
    if (inv.get("status") or "") not in ("finalized", "paid", "partially_paid"):
        return {"run": False, "status": SKIPPED, "reason": "Draft invoices are not filed"}
    if is_service_invoice(inv):
        return {"run": False, "status": SKIPPED,
                "reason": "Services do not move — no e-way bill needed"}
    value = invoice_value(inv)
    threshold = float(cfg.get("eway_threshold") or EWAY_DEFAULT_THRESHOLD)
    if value < threshold:
        return {"run": False, "status": SKIPPED,
                "reason": f"₹{value:,.0f} is below the ₹{threshold:,.0f} e-way bill limit"}

    # The bill cannot be raised without knowing how the goods travel.
    missing = []
    transport = eway_transport(inv, cfg)
    if not transport.get("distance"):
        missing.append("distance in km")
    if not (transport.get("vehicle_no") or transport.get("transporter_id")):
        missing.append("vehicle number or transporter ID")
    if missing:
        return {"run": False, "status": NEEDS_INPUT,
                "reason": "Add " + " and ".join(missing) + " to raise the e-way bill",
                "missing": missing}
    return {"run": True, "status": PENDING, "reason": f"Goods worth ₹{value:,.0f}",
            "transport": transport}


def eway_transport(inv: Dict[str, Any], cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Transport details: whatever was put on the invoice, else the defaults
    the business set once in Settings."""
    inv_t = inv.get("transport") or {}
    return {
        "distance": inv_t.get("distance") or cfg.get("eway_default_distance") or 0,
        "vehicle_no": (inv_t.get("vehicle_no") or inv.get("vehicle_no")
                       or cfg.get("eway_default_vehicle") or "").upper().replace(" ", ""),
        "transporter_id": (inv_t.get("transporter_id")
                           or cfg.get("eway_transporter_id") or "").upper(),
        "transporter_name": inv_t.get("transporter_name") or cfg.get("eway_transporter_name") or "",
        "mode": inv_t.get("mode") or cfg.get("eway_default_mode") or "1",   # 1 road
        "vehicle_type": inv_t.get("vehicle_type") or "R",                    # R regular
        "sub_type": inv_t.get("sub_type") or "1",                            # 1 supply
    }


def plan(inv: Dict[str, Any], cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Both decisions together — what the owner sees as 'what will happen'."""
    return {"einvoice": einvoice_decision(inv, cfg), "eway": eway_decision(inv, cfg)}


def summarise(inv: Dict[str, Any]) -> Dict[str, Any]:
    """Where this invoice stands with the government, for a list or a badge."""
    return {
        "invoice_id": inv.get("id"),
        "invoice_no": inv.get("invoice_no"),
        "invoice_date": inv.get("invoice_date"),
        "party": (inv.get("party_snapshot") or {}).get("name"),
        "total": invoice_value(inv),
        "irn": inv.get("irn") or "",
        "einvoice_status": inv.get("einvoice_status") or "",
        "einvoice_error": inv.get("einvoice_error") or "",
        "ewb_no": inv.get("ewb_no") or "",
        "ewb_status": inv.get("ewb_status") or "",
        "ewb_error": inv.get("ewb_error") or "",
        "ewb_valid_till": inv.get("ewb_valid_till") or "",
    }


def needs_attention(inv: Dict[str, Any]) -> bool:
    """Anything the owner has to do something about."""
    return (inv.get("einvoice_status") in (FAILED, PENDING)
            or inv.get("ewb_status") in (FAILED, PENDING, NEEDS_INPUT))
