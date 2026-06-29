"""Platform-wide payment gateway settings stored in MongoDB (system_settings).

Why DB-backed (not .env)? The super admin updates Cashfree keys via UI, so the
backend reads them at request time. Secret is encrypted at rest using Fernet,
with the key derived from JWT_SECRET so no extra env var is needed.

Collection layout: one document with id == "payment_gateway".
{
  id: "payment_gateway",
  provider: "cashfree",
  environment: "MOCK" | "SANDBOX" | "PROD",
  client_id: "<plain>",
  client_secret_enc: "<fernet token>",
  enabled: bool,
  updated_at: iso,
  updated_by: user_email,
}
"""
import base64
import hashlib
import os
from typing import Optional, Dict, Any

from cryptography.fernet import Fernet, InvalidToken

SETTINGS_ID = "payment_gateway"


def _fernet() -> Fernet:
    secret = os.environ["JWT_SECRET"].encode()
    key = base64.urlsafe_b64encode(hashlib.sha256(secret).digest())
    return Fernet(key)


def encrypt_secret(plain: str) -> str:
    if not plain:
        return ""
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_secret(token: str) -> str:
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, ValueError):
        return ""


def mask(value: str, keep: int = 4) -> str:
    if not value:
        return ""
    if len(value) <= keep:
        return "•" * len(value)
    return "•" * (len(value) - keep) + value[-keep:]


async def load_payment_settings(db) -> Dict[str, Any]:
    """Returns the raw settings document (with encrypted secret), or defaults."""
    doc = await db.system_settings.find_one({"id": SETTINGS_ID}, {"_id": 0})
    if not doc:
        return {
            "id": SETTINGS_ID,
            "provider": "cashfree",
            "environment": "MOCK",
            "client_id": "",
            "client_secret_enc": "",
            "enabled": False,
            "updated_at": None,
            "updated_by": None,
        }
    return doc


async def save_payment_settings(db, *, environment: str, client_id: str,
                                client_secret: Optional[str], enabled: bool,
                                updated_by: str, now_iso: str) -> Dict[str, Any]:
    update: Dict[str, Any] = {
        "id": SETTINGS_ID,
        "provider": "cashfree",
        "environment": environment,
        "client_id": client_id.strip(),
        "enabled": bool(enabled),
        "updated_at": now_iso,
        "updated_by": updated_by,
    }
    if client_secret is not None and client_secret.strip() != "":
        update["client_secret_enc"] = encrypt_secret(client_secret.strip())
    await db.system_settings.update_one(
        {"id": SETTINGS_ID}, {"$set": update}, upsert=True
    )
    doc = await db.system_settings.find_one({"id": SETTINGS_ID}, {"_id": 0})
    return doc


async def get_cashfree_credentials(db) -> Dict[str, Any]:
    """Returns decrypted credentials for runtime use by billing endpoints.

    Falls back to .env values when DB has nothing configured (backward compat).
    """
    doc = await load_payment_settings(db)
    env = doc.get("environment") or "MOCK"
    client_id = doc.get("client_id") or ""
    client_secret = decrypt_secret(doc.get("client_secret_enc", ""))
    enabled = bool(doc.get("enabled"))

    if not client_id:
        # Fallback to .env so the prior workflow still works
        client_id = os.environ.get("CASHFREE_CLIENT_ID", "")
        client_secret = os.environ.get("CASHFREE_CLIENT_SECRET", "")
        env = os.environ.get("CASHFREE_ENV", env)
        if client_id and client_secret:
            enabled = True

    base_url = ("https://sandbox.cashfree.com/pg" if env == "SANDBOX"
                else "https://api.cashfree.com/pg")
    return {
        "environment": env,
        "client_id": client_id,
        "client_secret": client_secret,
        "enabled": enabled,
        "base_url": base_url,
        "is_mock": env == "MOCK" or not enabled or not client_id or not client_secret,
    }


def public_view(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Sanitised view for the API (no plain secret leaks)."""
    secret_enc = doc.get("client_secret_enc", "")
    has_secret = bool(secret_enc)
    secret_preview = ""
    if has_secret:
        decrypted = decrypt_secret(secret_enc)
        secret_preview = mask(decrypted, keep=4) if decrypted else "•••• (unreadable)"
    return {
        "provider": doc.get("provider", "cashfree"),
        "environment": doc.get("environment", "MOCK"),
        "client_id": doc.get("client_id", ""),
        "client_secret_preview": secret_preview,
        "has_client_secret": has_secret,
        "enabled": bool(doc.get("enabled")),
        "updated_at": doc.get("updated_at"),
        "updated_by": doc.get("updated_by"),
    }
