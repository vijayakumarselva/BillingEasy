"""Zoho Inventory / Books — push invoices across, pull the e-way bill back.

The shape of the thing:

* Zoho authenticates with OAuth 2.0. You create a **Self Client** in the Zoho
  API console, generate a one-time code, and we exchange it for a refresh
  token. The refresh token lasts until revoked; access tokens last an hour and
  are renewed here as needed.
* Invoices in Zoho need a **contact** and, for stock lines, an **item**. Both
  are matched by name (and SKU for items) and created when missing, so the
  first push of a new customer sets them up.
* Each invoice carries our own number as Zoho's `reference_number`, which is
  how a retry finds the one it already made instead of creating a second.
* India editions expose the e-way bill on the invoice once generated, so after
  you raise it in Zoho we can read the number back and store it here.

Nothing in this module talks to the database; `server.py` does that.
"""
import logging
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# Zoho is region-locked: a token from one data centre will not work on another.
DATA_CENTRES = {
    "in": {"label": "India (zoho.in)", "api": "https://www.zohoapis.in",
           "accounts": "https://accounts.zoho.in"},
    "com": {"label": "United States (zoho.com)", "api": "https://www.zohoapis.com",
            "accounts": "https://accounts.zoho.com"},
    "eu": {"label": "Europe (zoho.eu)", "api": "https://www.zohoapis.eu",
           "accounts": "https://accounts.zoho.eu"},
    "au": {"label": "Australia (zoho.com.au)", "api": "https://www.zohoapis.com.au",
           "accounts": "https://accounts.zoho.com.au"},
    "jp": {"label": "Japan (zoho.jp)", "api": "https://www.zohoapis.jp",
           "accounts": "https://accounts.zoho.jp"},
}

# Inventory and Books share the same objects; Inventory is the superset.
PRODUCTS = {"inventory": "inventory", "books": "books"}

SCOPES = ("ZohoInventory.invoices.CREATE,ZohoInventory.invoices.READ,"
          "ZohoInventory.contacts.CREATE,ZohoInventory.contacts.READ,"
          "ZohoInventory.items.CREATE,ZohoInventory.items.READ,"
          "ZohoInventory.settings.READ")


class ZohoError(Exception):
    """Something Zoho refused, with its own words where we have them."""


def dc(settings: Dict[str, Any]) -> Dict[str, str]:
    return DATA_CENTRES.get((settings or {}).get("data_centre") or "in", DATA_CENTRES["in"])


def api_base(settings: Dict[str, Any]) -> str:
    product = (settings or {}).get("product") or "inventory"
    return f"{dc(settings)['api']}/{PRODUCTS.get(product, 'inventory')}/v1"


# ─────────────────────────────────────────────────────────────────────────────
# OAuth
# ─────────────────────────────────────────────────────────────────────────────
async def exchange_code(settings: Dict[str, Any], code: str,
                        client: Optional[httpx.AsyncClient] = None) -> Dict[str, Any]:
    """Turn the one-time self-client code into a refresh token."""
    close = client is None
    client = client or httpx.AsyncClient(timeout=30)
    try:
        r = await client.post(f"{dc(settings)['accounts']}/oauth/v2/token", data={
            "grant_type": "authorization_code",
            "client_id": settings.get("client_id", ""),
            "client_secret": settings.get("client_secret", ""),
            "code": code.strip(),
            "redirect_uri": settings.get("redirect_uri", "") or None,
        })
        data = r.json()
    finally:
        if close:
            await client.aclose()
    if "refresh_token" not in data:
        raise ZohoError(data.get("error") or
                        "Zoho did not return a refresh token. The code may have expired — "
                        "they last 3 minutes — or the scopes may not match.")
    return data


async def access_token(settings: Dict[str, Any],
                       client: Optional[httpx.AsyncClient] = None) -> str:
    """A fresh access token from the stored refresh token."""
    if not settings.get("refresh_token"):
        raise ZohoError("Not connected to Zoho yet — add your credentials in Settings.")
    close = client is None
    client = client or httpx.AsyncClient(timeout=30)
    try:
        r = await client.post(f"{dc(settings)['accounts']}/oauth/v2/token", data={
            "grant_type": "refresh_token",
            "refresh_token": settings["refresh_token"],
            "client_id": settings.get("client_id", ""),
            "client_secret": settings.get("client_secret", ""),
        })
        data = r.json()
    finally:
        if close:
            await client.aclose()
    token = data.get("access_token")
    if not token:
        raise ZohoError(data.get("error") or
                        "Zoho would not renew the token. It may have been revoked — reconnect.")
    return token


# ─────────────────────────────────────────────────────────────────────────────
# Calling Zoho
# ─────────────────────────────────────────────────────────────────────────────
async def call(settings: Dict[str, Any], method: str, path: str, *,
               token: str, params: Optional[dict] = None,
               json_body: Optional[dict] = None,
               client: Optional[httpx.AsyncClient] = None) -> Dict[str, Any]:
    close = client is None
    client = client or httpx.AsyncClient(timeout=45)
    params = dict(params or {})
    if settings.get("organization_id"):
        params.setdefault("organization_id", settings["organization_id"])
    try:
        r = await client.request(
            method, f"{api_base(settings)}{path}",
            headers={"Authorization": f"Zoho-oauthtoken {token}"},
            params=params, json=json_body)
        try:
            data = r.json()
        except ValueError:
            raise ZohoError(f"Zoho replied with {r.status_code} and no JSON")
    finally:
        if close:
            await client.aclose()
    # Zoho signals failure in the body: code 0 means success.
    if isinstance(data, dict) and data.get("code") not in (0, None):
        raise ZohoError(data.get("message") or f"Zoho error {data.get('code')}")
    if r.status_code >= 400:
        raise ZohoError((data or {}).get("message") or f"Zoho returned {r.status_code}")
    return data


async def list_organisations(settings: Dict[str, Any], token: str,
                             client: Optional[httpx.AsyncClient] = None) -> List[dict]:
    data = await call(settings, "GET", "/organizations", token=token, client=client)
    return [{"organization_id": o.get("organization_id"), "name": o.get("name"),
             "currency_code": o.get("currency_code"), "country": o.get("country"),
             "gstin": o.get("tax_reg_no") or o.get("gst_no", "")}
            for o in data.get("organizations", [])]


# ─────────────────────────────────────────────────────────────────────────────
# Matching our records to Zoho's
# ─────────────────────────────────────────────────────────────────────────────
async def find_or_create_contact(settings: Dict[str, Any], token: str, party: Dict[str, Any],
                                 client: Optional[httpx.AsyncClient] = None) -> str:
    """Zoho's contact id for this customer, creating them if they are new."""
    name = (party.get("name") or "").strip()
    if not name:
        raise ZohoError("The invoice has no customer name to send")
    found = await call(settings, "GET", "/contacts", token=token,
                       params={"contact_name_contains": name[:60]}, client=client)
    for c in found.get("contacts", []):
        if (c.get("contact_name") or "").strip().lower() == name.lower():
            return c["contact_id"]

    body: Dict[str, Any] = {
        "contact_name": name,
        "company_name": name,
        "contact_type": "customer",
    }
    if party.get("gstin"):
        body.update({"gst_no": party["gstin"], "gst_treatment": "business_gst"})
    else:
        body["gst_treatment"] = "consumer"
    if party.get("state"):
        body["place_of_contact"] = party["state"]
    person: Dict[str, Any] = {}
    if party.get("email"):
        person["email"] = party["email"]
    if party.get("phone"):
        person["phone"] = str(party["phone"])
    if person:
        person["first_name"] = name[:40]
        body["contact_persons"] = [person]
    made = await call(settings, "POST", "/contacts", token=token, json_body=body, client=client)
    return made["contact"]["contact_id"]


async def find_or_create_item(settings: Dict[str, Any], token: str, line: Dict[str, Any],
                              client: Optional[httpx.AsyncClient] = None) -> Optional[str]:
    """Zoho's item id for a line, by SKU then name. None for an ad-hoc line."""
    name = (line.get("name") or "").strip()
    sku = (line.get("sku") or "").strip()
    if not name:
        return None
    if sku:
        found = await call(settings, "GET", "/items", token=token,
                           params={"sku": sku}, client=client)
        for i in found.get("items", []):
            if (i.get("sku") or "").strip().lower() == sku.lower():
                return i["item_id"]
    found = await call(settings, "GET", "/items", token=token,
                       params={"name_contains": name[:60]}, client=client)
    for i in found.get("items", []):
        if (i.get("name") or "").strip().lower() == name.lower():
            return i["item_id"]

    body = {
        "name": name,
        "rate": float(line.get("rate") or 0),
        "item_type": "sales",
        "product_type": "goods" if not str(line.get("hsn", "")).startswith("99") else "service",
    }
    if sku:
        body["sku"] = sku
    if line.get("hsn"):
        key = "sac" if str(line["hsn"]).startswith("99") else "hsn_or_sac"
        body[key] = str(line["hsn"])
    if line.get("unit"):
        body["unit"] = line["unit"]
    made = await call(settings, "POST", "/items", token=token, json_body=body, client=client)
    return made["item"]["item_id"]


# ─────────────────────────────────────────────────────────────────────────────
# The invoice itself
# ─────────────────────────────────────────────────────────────────────────────
def build_invoice(inv: Dict[str, Any], contact_id: str,
                  item_ids: Dict[int, Optional[str]]) -> Dict[str, Any]:
    """Our invoice in Zoho's shape.

    Our number goes in `reference_number`: it is what a retry looks for, and
    what ties the two systems together when someone is staring at both.
    """
    lines = []
    for idx, it in enumerate(inv.get("items") or []):
        line: Dict[str, Any] = {
            "name": it.get("name", "")[:100],
            "description": (it.get("description") or "")[:500],
            "rate": round(float(it.get("rate") or 0), 2),
            "quantity": float(it.get("qty") or 0),
            "unit": it.get("unit") or "NOS",
        }
        if item_ids.get(idx):
            line["item_id"] = item_ids[idx]
        if it.get("hsn"):
            key = "sac" if str(it["hsn"]).startswith("99") else "hsn_or_sac"
            line[key] = str(it["hsn"])
        if it.get("gst_rate") is not None:
            line["tax_percentage"] = float(it["gst_rate"])
        if it.get("discount_pct"):
            line["discount"] = f"{float(it['discount_pct'])}%"
        lines.append(line)

    body: Dict[str, Any] = {
        "customer_id": contact_id,
        "reference_number": inv.get("invoice_no", ""),
        "date": inv.get("invoice_date", ""),
        "line_items": lines,
        "notes": (inv.get("notes") or "")[:500],
    }
    if inv.get("due_date"):
        body["due_date"] = inv["due_date"]
    # Keep our own numbering rather than letting Zoho renumber the sale.
    if inv.get("invoice_no"):
        body["invoice_number"] = inv["invoice_no"]
    place = (inv.get("party_snapshot") or {}).get("state")
    if place:
        body["place_of_supply"] = place
    return body


async def find_invoice_by_reference(settings: Dict[str, Any], token: str, reference: str,
                                    client: Optional[httpx.AsyncClient] = None
                                    ) -> Optional[dict]:
    """The Zoho invoice we already created for this one, if any."""
    if not reference:
        return None
    data = await call(settings, "GET", "/invoices", token=token,
                      params={"reference_number": reference}, client=client)
    for inv in data.get("invoices", []):
        if (inv.get("reference_number") or "") == reference:
            return inv
    return None


async def push_invoice(settings: Dict[str, Any], token: str, inv: Dict[str, Any],
                       party: Dict[str, Any],
                       client: Optional[httpx.AsyncClient] = None) -> Dict[str, Any]:
    """Create the invoice in Zoho, or return the one already there."""
    existing = await find_invoice_by_reference(settings, token,
                                               inv.get("invoice_no", ""), client=client)
    if existing:
        return {"already": True, "zoho_invoice_id": existing["invoice_id"],
                "zoho_invoice_number": existing.get("invoice_number", ""),
                "status": existing.get("status", ""),
                "eway_bill_no": _eway_from(existing)}

    contact_id = await find_or_create_contact(settings, token, party, client=client)
    item_ids: Dict[int, Optional[str]] = {}
    if settings.get("sync_items", True):
        for idx, line in enumerate(inv.get("items") or []):
            try:
                item_ids[idx] = await find_or_create_item(settings, token, line, client=client)
            except ZohoError as exc:
                # An ad-hoc line is still worth sending; do not lose the invoice
                # over one item that will not map.
                logger.warning("Zoho item mapping failed for %r: %s", line.get("name"), exc)
                item_ids[idx] = None

    made = await call(settings, "POST", "/invoices", token=token,
                      json_body=build_invoice(inv, contact_id, item_ids), client=client)
    z = made.get("invoice", {})
    return {"already": False, "zoho_invoice_id": z.get("invoice_id"),
            "zoho_invoice_number": z.get("invoice_number", ""),
            "status": z.get("status", ""), "eway_bill_no": _eway_from(z)}


def _eway_from(z: Dict[str, Any]) -> str:
    """Zoho names this field differently across editions and versions."""
    for key in ("ewaybill_number", "eway_bill_number", "ewaybill_no", "e_waybill_number"):
        if z.get(key):
            return str(z[key])
    details = z.get("ewaybill_details") or z.get("eway_bill_details") or {}
    if isinstance(details, dict):
        for key in ("ewaybill_number", "eway_bill_number", "number"):
            if details.get(key):
                return str(details[key])
    return ""


async def fetch_eway(settings: Dict[str, Any], token: str, zoho_invoice_id: str,
                     client: Optional[httpx.AsyncClient] = None) -> Dict[str, Any]:
    """Read back the e-way bill raised against this invoice in Zoho."""
    data = await call(settings, "GET", f"/invoices/{zoho_invoice_id}", token=token,
                      client=client)
    z = data.get("invoice", {})
    return {
        "eway_bill_no": _eway_from(z),
        "status": z.get("status", ""),
        "zoho_invoice_number": z.get("invoice_number", ""),
        "balance": z.get("balance"),
    }


def invoice_url(settings: Dict[str, Any], zoho_invoice_id: str) -> str:
    """A link a human can open, rather than an id they cannot use."""
    if not zoho_invoice_id:
        return ""
    product = (settings or {}).get("product") or "inventory"
    host = dc(settings)["api"].replace("www.zohoapis", f"{product}.zoho")
    org = settings.get("organization_id", "")
    return f"{host}/app#/invoices/{zoho_invoice_id}" + (f"?organization_id={org}" if org else "")
