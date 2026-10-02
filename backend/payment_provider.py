"""Payment providers behind one interface.

Cashfree is the only live provider; Razorpay can be added by writing another
subclass and registering it in `get_provider` — nothing above this file knows
which one is in use.

Every provider deals in **paise** and returns the same three shapes:
  create_order(...)   -> {"order_id", "session_id", "pay_url", "mock"}
  fetch_order(...)    -> {"status": "paid"|"pending"|"failed", "raw"}
  verify_webhook(...) -> True/False
"""
import base64
import hashlib
import hmac
import json
import logging
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

CASHFREE_PG_VERSION = "2023-08-01"
CASHFREE_SUB_VERSION = "2022-09-01"


class PaymentError(Exception):
    pass


class PaymentProvider:
    name = "base"

    def __init__(self, creds: Dict[str, Any]):
        self.creds = creds
        self.is_mock = bool(creds.get("is_mock"))

    async def create_order(self, *, order_id: str, amount_paise: int, customer: Dict[str, str],
                           note: str = "", return_url: str = "") -> Dict[str, Any]:
        raise NotImplementedError

    async def fetch_order(self, order_id: str) -> Dict[str, Any]:
        raise NotImplementedError

    def verify_webhook(self, *, raw_body: bytes, signature: str, timestamp: str) -> bool:
        raise NotImplementedError


class MockProvider(PaymentProvider):
    """Used when no gateway keys are configured. No money moves."""
    name = "mock"

    def __init__(self, creds=None):
        super().__init__({**(creds or {}), "is_mock": True})

    async def create_order(self, *, order_id, amount_paise, customer, note="", return_url=""):
        return {"order_id": order_id, "session_id": f"mock_session_{order_id}",
                "pay_url": f"{return_url.split('?')[0] or '/billing/mock-checkout'}"
                           f"?order_id={order_id}&amount={amount_paise}",
                "mock": True}

    async def fetch_order(self, order_id: str):
        return {"status": "paid", "raw": {"mock": True, "order_id": order_id}}

    def verify_webhook(self, *, raw_body, signature, timestamp):
        return True


class CashfreeProvider(PaymentProvider):
    name = "cashfree"

    @property
    def base(self) -> str:
        return self.creds.get("base_url") or (
            "https://sandbox.cashfree.com" if self.creds.get("env", "sandbox") == "sandbox"
            else "https://api.cashfree.com")

    def _headers(self, version: str = CASHFREE_PG_VERSION) -> Dict[str, str]:
        return {
            "x-client-id": self.creds["client_id"],
            "x-client-secret": self.creds["client_secret"],
            "x-api-version": version,
            "Content-Type": "application/json",
        }

    async def create_order(self, *, order_id, amount_paise, customer, note="", return_url=""):
        payload = {
            "order_id": order_id,
            "order_amount": round(amount_paise / 100, 2),      # Cashfree takes rupees
            "order_currency": "INR",
            "customer_details": {
                "customer_id": customer.get("id") or order_id,
                "customer_email": customer.get("email") or "",
                "customer_phone": customer.get("phone") or "9999999999",
                "customer_name": customer.get("name") or "",
            },
            "order_meta": {"return_url": return_url} if return_url else {},
            "order_note": note[:200],
        }
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(f"{self.base}/pg/orders", json=payload, headers=self._headers())
        if r.status_code not in (200, 201):
            logger.error("Cashfree order failed: %s %s", r.status_code, r.text)
            raise PaymentError(f"Could not start the payment: {r.text[:200]}")
        data = r.json()
        return {"order_id": data.get("order_id", order_id),
                "session_id": data.get("payment_session_id"),
                "pay_url": data.get("payment_link"), "mock": False}

    async def fetch_order(self, order_id: str):
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(f"{self.base}/pg/orders/{order_id}", headers=self._headers())
        if r.status_code != 200:
            raise PaymentError("Could not verify the payment with the gateway")
        data = r.json()
        status = {"PAID": "paid", "ACTIVE": "pending", "EXPIRED": "failed"}.get(
            data.get("order_status", ""), "pending")
        return {"status": status, "raw": data}

    def verify_webhook(self, *, raw_body: bytes, signature: str, timestamp: str) -> bool:
        secret = self.creds.get("client_secret") or ""
        if not secret or not signature:
            return False
        expected = base64.b64encode(
            hmac.new(secret.encode(), timestamp.encode() + raw_body, hashlib.sha256).digest()
        ).decode()
        return hmac.compare_digest(expected, signature)


def get_provider(creds: Dict[str, Any]) -> PaymentProvider:
    """Pick the provider from the super admin's payment settings."""
    if not creds or creds.get("is_mock") or not creds.get("client_id") or not creds.get("client_secret"):
        return MockProvider(creds)
    provider = (creds.get("provider") or "cashfree").lower()
    if provider == "cashfree":
        return CashfreeProvider(creds)
    raise PaymentError(f"Payment provider '{provider}' is not supported yet")
