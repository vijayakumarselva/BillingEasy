"""BillEasy backend — multi-org SaaS with Cashfree subscription billing.

Multi-tenancy: every document is scoped to an `org_id`. Users join orgs through
`memberships`. The active org is sent by frontend via `X-Org-Id` header.

Cashfree integration is currently in MOCK mode (no real money). Add real keys
to /app/backend/.env: CASHFREE_CLIENT_ID, CASHFREE_CLIENT_SECRET, CASHFREE_ENV.
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import ssl
import certifi
import uuid
import logging
import hmac
import hashlib
import base64
import json
import secrets
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone, timedelta
from typing import Any, Optional, List, Dict
from io import BytesIO

import bcrypt
import jwt as pyjwt
import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query, Body
from fastapi import UploadFile, File
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field, EmailStr
from motor.motor_asyncio import AsyncIOMotorClient
from starlette.middleware.cors import CORSMiddleware

from pdf_invoice import generate_invoice_pdf
from seed_data import seed_demo_data
from rbac import (
    PERMISSIONS, SYSTEM_ROLES, resolve_permissions, resolve_allowed_modes, ensure_system_roles,
    audit_log, limiter, client_ip,
)
from plans import (
    PLANS as PLAN_CATALOG, get_plan_limits, org_usage, check_limit,
    public_pricing, is_legacy_plan, ADDONS,
)
from payment_settings import (
    load_payment_settings, save_payment_settings, get_cashfree_credentials,
    public_view as payment_public_view,
)
from launch_offer import (
    load_offer as load_launch_offer, save_offer as save_launch_offer,
    public_offer as public_launch_offer, admin_view as launch_offer_admin_view,
)
from gstin import validate as validate_gstin
from hsn_data import search_hsn as search_hsn_db, get_by_code as get_hsn_by_code, HSN as HSN_LIST
from einvoice import build_einvoice_json, precheck_eligibility as einvoice_precheck
from ai_helpers import ai_chat_stream, ai_hsn_suggest, ai_categorize_expense, ai_product_suggest, ai_extract_invoice, ai_analyze_bank_vendors, ai_bank_insights, ai_parse_payment, ai_parse_party, ai_extract_bill_ref

# ---------------- Setup ----------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"

CASHFREE_API_VERSION = "2023-08-01"

PLANS = PLAN_CATALOG

client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=30000)
db = client[DB_NAME]

app = FastAPI(title="BillEasy API")
api = APIRouter(prefix="/api")


@app.get("/health")
@app.get("/api/health")
async def health():
    return {"status": "ok", "v": "2.5"}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("billeasy")


def send_email(to: str, subject: str, html: str, text: str = "") -> bool:
    """Send email via Gmail SMTP. Requires SMTP_EMAIL + SMTP_PASSWORD env vars.
    Falls back to logging if not configured."""
    smtp_email = os.getenv("SMTP_EMAIL", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    if not smtp_email or not smtp_password:
        logger.info("[EMAIL FALLBACK] To: %s | Subject: %s | Body: %s", to, subject, text or html[:200])
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"BillingEasy <{smtp_email}>"
        msg["To"] = to
        if text:
            msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
            s.login(smtp_email, smtp_password)
            s.sendmail(smtp_email, to, msg.as_string())
        return True
    except Exception as e:
        logger.error("Email send failed: %s", e)
        return False


# ---------------- Helpers ----------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def now_dt() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id, "email": email,
        "exp": now_dt() + timedelta(minutes=30), "type": "access",
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id, "jti": secrets.token_hex(16),
        "exp": now_dt() + timedelta(days=30), "type": "refresh",
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def strip_id(doc: dict) -> dict:
    if doc: doc.pop("_id", None)
    return doc


async def get_current_user(request: Request) -> Dict[str, Any]:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def get_user_membership(user_id: str, org_id: str) -> Optional[dict]:
    return await db.memberships.find_one({"user_id": user_id, "org_id": org_id}, {"_id": 0})


async def get_org_ctx(request: Request, user=Depends(get_current_user)) -> dict:
    """Resolve the active org from X-Org-Id header. Falls back to user's last_active_org or first membership."""
    org_id = request.headers.get("X-Org-Id")
    if not org_id:
        org_id = user.get("last_active_org_id")
        if not org_id:
            m = await db.memberships.find_one({"user_id": user["id"]}, {"_id": 0})
            if not m:
                raise HTTPException(403, "No organization found for user")
            org_id = m["org_id"]
    membership = await get_user_membership(user["id"], org_id)
    if not membership:
        raise HTTPException(403, "Not a member of this organization")
    if user.get("last_active_org_id") != org_id:
        await db.users.update_one({"id": user["id"]}, {"$set": {"last_active_org_id": org_id}})
    perms = await resolve_permissions(db, membership["role"], org_id)
    allowed_modes = await resolve_allowed_modes(db, membership["role"], org_id)
    biz_type = request.headers.get("X-Biz-Type") or None
    org_type = (await db.organizations.find_one({"id": org_id}, {"_id": 0, "business_type": 1}) or {}).get("business_type")
    if org_type:
        biz_type = org_type
    # Server-side enforcement: if role is locked to specific modes, force biz_type
    if allowed_modes:
        if not biz_type or biz_type not in allowed_modes:
            biz_type = allowed_modes[0]
    # Entity support: resolve active entity from X-Entity-Id header
    entity_id = request.headers.get("X-Entity-Id") or None
    entity = None
    if entity_id:
        org_doc = await db.organizations.find_one({"id": org_id}, {"_id": 0, "entities": 1})
        entities = (org_doc or {}).get("entities", [])
        entity = next((e for e in entities if e.get("id") == entity_id), None)
        if entity:
            biz_type = entity.get("biz_type", biz_type)  # entity overrides biz_type
    return {"user": user, "org_id": org_id, "role": membership["role"], "permissions": perms,
            "allowed_modes": allowed_modes, "biz_type": biz_type,
            "entity_id": entity_id, "entity": entity, "request": request}


def require_permission(perm: str):
    async def checker(ctx=Depends(get_org_ctx)):
        if perm not in ctx["permissions"]:
            raise HTTPException(403, f"Missing permission: {perm}")
        return ctx
    return checker


def require_roles(*roles: str):
    async def checker(ctx=Depends(get_org_ctx)):
        if ctx["role"] not in roles:
            raise HTTPException(403, "Forbidden: insufficient role")
        return ctx
    return checker


def org_filter(ctx: dict, extra: Optional[dict] = None) -> dict:
    q = {"org_id": ctx["org_id"]}
    if extra: q.update(extra)
    return q


def biz_filter(ctx: dict, extra: Optional[dict] = None) -> dict:
    """org_filter + optional entity/biz_type scoping. Docs with no entity/biz_type visible in all modes."""
    q = org_filter(ctx, extra)
    eid = ctx.get("entity_id")
    bt = ctx.get("biz_type")
    if eid:
        # Entity-scoped: match entity_id OR legacy docs with no entity (shared)
        q["$or"] = [{"entity_id": eid}, {"entity_id": {"$exists": False}}, {"entity_id": None}]
    elif bt:
        q["$or"] = [{"biz_type": bt}, {"biz_type": {"$exists": False}}]
    return q


# ---------------- Subscription helpers ----------------
async def get_org_doc(org_id: str) -> dict:
    o = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Org not found")
    return o


def subscription_status_summary(org: dict) -> dict:
    """Compute live status for the org based on trial / subscription dates."""
    now = now_dt()
    trial_ends = org.get("trial_ends_at")
    sub_status = org.get("subscription_status", "trialing")
    period_end = org.get("current_period_end")

    trial_ends_dt = datetime.fromisoformat(trial_ends) if trial_ends else None
    period_end_dt = datetime.fromisoformat(period_end) if period_end else None

    if sub_status == "active" and period_end_dt and now > period_end_dt:
        sub_status = "expired"
    if sub_status == "trialing" and trial_ends_dt and now > trial_ends_dt:
        sub_status = "trial_expired"

    days_left = 0
    if sub_status == "trialing" and trial_ends_dt:
        days_left = max(0, (trial_ends_dt - now).days + 1)
    elif sub_status == "active" and period_end_dt:
        days_left = max(0, (period_end_dt - now).days + 1)

    return {
        "status": sub_status,
        "plan_code": org.get("plan_code"),
        "trial_ends_at": trial_ends,
        "current_period_end": period_end,
        "days_left": days_left,
        "is_active": sub_status in ("trialing", "active"),
        "needs_payment": sub_status in ("trial_expired", "expired", "past_due"),
        "needs_replan": is_legacy_plan(org.get("plan_code")) and sub_status in ("active", "trialing"),
    }


async def ensure_active_subscription(ctx: dict):
    """Block writes when subscription/trial has ended."""
    org = await get_org_doc(ctx["org_id"])
    summary = await effective_subscription(org)
    if not summary["is_active"]:
        raise HTTPException(402, f"Subscription required ({summary['status']}). Visit /settings → Billing.")


# ---------------- Models ----------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    org_name: str = "My Business"
    phone: str = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class OrgCreateIn(BaseModel):
    name: str
    state: str = "Tamil Nadu"
    state_code: str = "33"


class OrgUpdateIn(BaseModel):
    name: str
    address: str = ""
    state: str = "Tamil Nadu"
    state_code: str = "33"
    gstin: str = ""
    pan: str = ""
    phone: str = ""
    email: str = ""
    logo_url: str = ""
    logo_b64: str = ""          # base64 encoded logo stored in DB
    upi_qr_b64: str = ""        # base64 encoded UPI QR image for POS payments
    bank_name: str = ""
    bank_account: str = ""
    bank_ifsc: str = ""
    bank_branch: str = ""
    terms: str = ""
    invoice_theme: dict = {}    # {primary_color, accent_color, show_logo, show_ship_to, show_bank, show_terms, show_signature, watermark}
    business_mode: str = "b2b"  # "b2b" | "b2c" | "restaurant" | "pos"


class InviteIn(BaseModel):
    email: EmailStr
    name: str
    password: str = Field(min_length=6)
    role: str = "sales"  # owner | accountant | sales


class SubscribeIn(BaseModel):
    plan_code: str  # MONTHLY_199 | YEARLY_1990


class ShippingAddress(BaseModel):
    """A delivery address. Structured fields are authoritative; `address` is the
    composed one-line version kept for older records, PDFs and e-way bills."""
    id: str = ""
    label: str = ""          # e.g. Warehouse, Site 1
    attention: str = ""
    line1: str = ""
    line2: str = ""
    city: str = ""
    state: str = ""
    state_code: str = ""
    pincode: str = ""
    phone: str = ""
    address: str = ""


def compose_address(a: dict) -> str:
    parts = [a.get("attention"), a.get("line1"), a.get("line2"), a.get("city")]
    tail = " ".join(x for x in [a.get("state"), a.get("pincode")] if x)
    parts.append(tail)
    text = ", ".join(x.strip() for x in parts if x and x.strip())
    return text or (a.get("address") or "").strip()


def normalise_shipping(addrs) -> list:
    """Accept old {label,address} rows and new structured ones; always return both."""
    out = []
    for a in addrs or []:
        a = dict(a)
        if not any(a.get(k) for k in ("line1", "line2", "city", "pincode")) and a.get("address"):
            a["line1"] = a["address"]          # legacy single box becomes line 1
        a["address"] = compose_address(a)
        if not a.get("id"):
            a["id"] = str(uuid.uuid4())
        out.append(a)
    return out

class PartyIn(BaseModel):
    type: str
    name: str
    phone: str = ""
    email: str = ""
    gstin: str = ""
    pan: str = ""
    state: str = "Tamil Nadu"
    state_code: str = "33"
    billing_address: str = ""
    shipping_address: str = ""          # legacy single address — kept for backward compat
    shipping_addresses: List[ShippingAddress] = []   # new: multiple addresses
    opening_balance: float = 0
    credit_limit: float = 0
    tds_opening_balance: float = 0


class ProductIn(BaseModel):
    name: str
    sku: str = ""
    hsn: str = ""
    unit: str = "NOS"
    category: str = "General"
    purchase_price: float = 0
    sale_price: float = 0
    gst_rate: float = 18
    stock: float = 0
    low_stock_alert: float = 5
    barcode: str = ""
    upc: str = ""
    unit_qty: str = ""  # size/weight value e.g. "500" (paired with unit "ML" → 500 ML)
    modes: List[str] = ["b2b", "b2c", "restaurant", "pos"]  # which business modes use this product
    image_b64: str = ""  # base64 data-URI of product image


class LineItem(BaseModel):
    product_id: str = ""
    name: str
    hsn: str = ""
    qty: float
    unit: str = "NOS"
    rate: float
    discount_pct: float = 0
    gst_rate: float = 18


class BranchIn(BaseModel):
    name: str
    gstin: str = ""
    state: str = "Tamil Nadu"
    state_code: str = "33"
    address: str = ""
    active: bool = True


class WarehouseIn(BaseModel):
    name: str
    branch_id: str = ""       # which branch this warehouse belongs to
    address: str = ""
    active: bool = True


class GrnItemIn(BaseModel):
    product_id: str
    name: str = ""
    hsn: str = ""
    qty: float
    unit: str = "NOS"
    rate: float                # purchase rate / cost price
    gst_rate: float = 18


class GrnIn(BaseModel):
    warehouse_id: str
    vendor_id: str
    grn_date: str
    ref_no: str = ""           # vendor's DC / challan number
    purchase_id: str = ""      # link to purchase bill if created
    items: List[GrnItemIn]
    notes: str = ""


class DeliveryOrderItemIn(BaseModel):
    product_id: str
    name: str = ""
    hsn: str = ""
    qty: float
    unit: str = "NOS"
    rate: float
    gst_rate: float = 18


class DeliveryOrderIn(BaseModel):
    warehouse_id: str
    customer_id: str
    do_date: str
    shipment_date: str = ""
    ref_no: str = ""           # sale order / PO reference
    invoice_id: str = ""       # link to invoice if created
    order_type: str = "Sales"
    payment_terms: str = "Due on Receipt"
    broker: str = ""
    items: List[DeliveryOrderItemIn]
    notes: str = ""


class InvoiceIn(BaseModel):
    party_id: str
    invoice_date: str
    due_date: str = ""
    items: List[LineItem]
    notes: str = ""
    status: str = "finalized"
    is_recurring: bool = False
    type: str = "sale"
    branch_id: str = ""
    invoice_category: str = "stock"   # "stock" | "service"
    shipping_address: str = ""
    shipping_label: str = ""
    po_number: str = ""
    tds_rate: float = 0          # TDS rate customer will deduct (e.g. 0.1%)
    tds_amount: float = 0        # Expected TDS deduction by customer
    warehouse_id: str = ""       # dispatch warehouse (stock invoices)


class PurchaseIn(BaseModel):
    party_id: str
    bill_no: str
    purchase_date: str
    items: List[LineItem]
    notes: str = ""
    type: str = "purchase"
    branch_id: str = ""
    warehouse_id: str = ""       # receiving warehouse
    eway_bill_no: str = ""
    vehicle_no: str = ""
    bank_account_id: Optional[str] = None
    purchase_category: str = "stock"  # "stock" | "service"
    tds_rate: float = 0          # TDS rate applied (e.g. 0.1 for 0.1%)
    tds_amount: float = 0        # Computed TDS deduction amount


class PaymentIn(BaseModel):
    party_id: str
    direction: str
    amount: float
    mode: str = "Cash"
    date: str
    reference: str = ""
    bank_account_id: str = ""
    invoice_id: str = ""       # link to SO/PO invoice
    expense_id: str = ""       # link to expense record
    linked_type: str = ""      # "invoice" | "expense" | ""


class ExpenseIn(BaseModel):
    category: str
    amount: float
    date: str
    description: str = ""
    gst_rate: float = 0


class BankAccountIn(BaseModel):
    bank_name: str
    account_no: str
    ifsc: str = ""
    branch: str = ""
    opening_balance: float = 0
    account_type: str = "Current"   # Current | Savings | OD | CC | Wallet


class TDSEntryIn(BaseModel):
    party_id: str
    section: str
    rate: float
    amount: float
    tds_amount: float
    date: str
    notes: str = ""


# ---------------- GST helpers ----------------
def calc_invoice_totals(items: List[dict], same_state: bool) -> dict:
    subtotal = discount = taxable = cgst = sgst = igst = 0.0
    detailed = []
    for it in items:
        gross = it["qty"] * it["rate"]
        d = gross * (it.get("discount_pct", 0) / 100)
        tx = gross - d
        tax = tx * (it.get("gst_rate", 0) / 100)
        c, s, i_ = (tax/2, tax/2, 0) if same_state else (0, 0, tax)
        total = tx + tax
        detailed.append({**it, "gross": round(gross, 2), "discount": round(d, 2),
                         "taxable": round(tx, 2), "cgst": round(c, 2),
                         "sgst": round(s, 2), "igst": round(i_, 2),
                         "total": round(total, 2)})
        subtotal += gross; discount += d; taxable += tx
        cgst += c; sgst += s; igst += i_
    grand = taxable + cgst + sgst + igst
    round_off = round(grand) - grand
    return {
        "items": detailed,
        "subtotal": round(subtotal, 2), "discount": round(discount, 2),
        "taxable_amount": round(taxable, 2),
        "cgst": round(cgst, 2), "sgst": round(sgst, 2), "igst": round(igst, 2),
        "round_off": round(round_off, 2),
        "grand_total": round(grand + round_off, 2),
    }


async def next_invoice_number(org_id: str, prefix: str = "INV") -> str:
    year = now_dt().year
    counter_key = f"{org_id}:{prefix}-{year}"
    res = await db.counters.find_one_and_update(
        {"key": counter_key}, {"$inc": {"seq": 1}},
        upsert=True, return_document=True,
    )
    return f"{prefix}-{year}-{(res['seq'] if res else 1):04d}"


def purchase_payable(pur: dict) -> float:
    """Amount actually payable to the supplier: bill total less TDS deducted (Sec 194Q)."""
    grand = (pur.get("totals") or {}).get("grand_total", 0) or 0
    tds = pur.get("tds_amount") or 0
    return round(grand - tds, 2) if tds > 0 else grand


def po_label(pur: dict) -> str:
    """Display number for a purchase: system PO number, falling back to the supplier bill no."""
    return pur.get("po_no") or po_label(pur)


# ---------------- AUTH ----------------
@api.post("/auth/register")
async def register(body: RegisterIn, request: Request, response: Response):
    email = body.email.lower()
    if not limiter.hit(f"register:{client_ip(request)}", max_hits=10, window_seconds=900):
        raise HTTPException(429, "Too many signups from this IP. Try again later.")
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    user = {
        "id": uid, "email": email, "name": body.name, "phone": body.phone,
        "password_hash": hash_password(body.password), "created_at": now_iso(),
        "last_login": now_iso(),
    }
    await db.users.insert_one(user)
    org = await _create_org_internal(body.org_name, uid)
    token = create_access_token(uid, email)
    refresh = create_refresh_token(uid)
    response.set_cookie("access_token", token, httponly=True, samesite="lax",
                        secure=False, max_age=30*60, path="/")
    await audit_log(db, org_id=org["id"], user=user, action="user.registered",
                    entity_type="user", entity_id=uid, request=request)
    return {"id": uid, "email": email, "name": body.name,
            "token": token, "refresh_token": refresh, "org_id": org["id"]}


@api.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    ip = client_ip(request)
    if not limiter.hit(f"login:{ip}", max_hits=8, window_seconds=900):
        raise HTTPException(429, "Too many login attempts. Try again in 15 minutes.")
    email = body.email.lower()
    u = await db.users.find_one({"email": email})
    if not u or not verify_password(body.password, u["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = create_access_token(u["id"], u["email"])
    refresh = create_refresh_token(u["id"])
    # Prefer last_active_org_id, then active owner-role org, then first membership
    best_org_id = u.get("last_active_org_id")
    if best_org_id and not await db.memberships.find_one({"user_id": u["id"], "org_id": best_org_id}):
        best_org_id = None
    if not best_org_id:
        async for m in db.memberships.find({"user_id": u["id"]}, {"_id": 0}):
            org = await db.organizations.find_one({"id": m["org_id"]}, {"_id": 0, "subscription_status": 1})
            if not org:
                continue
            if m["role"] == "owner" and org.get("subscription_status") in ("active", "trialing"):
                best_org_id = m["org_id"]; break
            if best_org_id is None:
                best_org_id = m["org_id"]
    await db.users.update_one({"id": u["id"]}, {"$set": {"last_login": now_iso()}})
    response.set_cookie("access_token", token, httponly=True, samesite="lax",
                        secure=False, max_age=30*60, path="/")
    if best_org_id:
        await audit_log(db, org_id=best_org_id, user=u, action="user.login", request=request)
    return {"id": u["id"], "email": u["email"], "name": u["name"],
            "token": token, "refresh_token": refresh, "org_id": best_org_id}


@api.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    body = await request.json()
    token = body.get("refresh_token") or request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "Missing refresh token")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid token type")
    except pyjwt.PyJWTError:
        raise HTTPException(401, "Invalid/expired refresh token")
    u = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not u:
        raise HTTPException(401, "User no longer exists")
    new_access = create_access_token(u["id"], u["email"])
    response.set_cookie("access_token", new_access, httponly=True, samesite="lax",
                        secure=False, max_age=30*60, path="/")
    return {"token": new_access}


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    password: str = Field(min_length=6)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordIn, request: Request):
    ip = client_ip(request)
    if not limiter.hit(f"forgot:{ip}", max_hits=5, window_seconds=900):
        raise HTTPException(429, "Too many requests. Try again later.")
    u = await db.users.find_one({"email": body.email.lower()})
    # Always return success to avoid email enumeration
    if u:
        token = secrets.token_urlsafe(32)
        await db.password_resets.insert_one({
            "token": token, "user_id": u["id"],
            "expires_at": (now_dt() + timedelta(hours=2)).isoformat(),
            "used": False, "created_at": now_iso(),
        })
        app_url = os.getenv("APP_URL", "https://billingseasy.com")
        reset_link = f"{app_url}/reset-password?token={token}"
        html = f"""
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
          <h2 style="color:#1D4ED8;">Reset your BillingEasy password</h2>
          <p>Click the button below to set a new password. This link expires in 2 hours.</p>
          <a href="{reset_link}" style="display:inline-block;background:#2563EB;color:#fff;
             padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">
            Reset Password
          </a>
          <p style="color:#6B7280;font-size:13px;">If you didn't request this, ignore this email.</p>
          <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;"/>
          <p style="color:#9CA3AF;font-size:12px;">BillingEasy · billingseasy.com</p>
        </div>"""
        sent = send_email(u["email"], "Reset your BillingEasy password", html,
                          f"Reset your password: {reset_link}")
        if not sent:
            logger.info("Password reset link for %s: %s", u["email"], reset_link)
    return {"ok": True, "message": "If that email exists, a reset link has been sent."}


@api.post("/auth/reset-password")
async def reset_password(body: ResetPasswordIn):
    rec = await db.password_resets.find_one({"token": body.token, "used": False})
    if not rec:
        raise HTTPException(400, "Invalid or already-used token")
    if datetime.fromisoformat(rec["expires_at"]) < now_dt():
        raise HTTPException(400, "Token has expired")
    await db.users.update_one({"id": rec["user_id"]},
                              {"$set": {"password_hash": hash_password(body.password)}})
    await db.password_resets.update_one({"token": body.token}, {"$set": {"used": True}})
    return {"ok": True}


@api.post("/auth/change-password")
async def change_password(body: ChangePasswordIn, user=Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]})
    if not verify_password(body.current_password, u["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    await db.users.update_one({"id": user["id"]},
                              {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"ok": True}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


# ──────────────── OTP LOGIN ────────────────
class OtpRequestIn(BaseModel):
    email: EmailStr

class OtpVerifyIn(BaseModel):
    email: EmailStr
    otp: str

@api.post("/auth/otp/request")
async def otp_request(body: OtpRequestIn, request: Request, response: Response):
    ip = client_ip(request)
    if not limiter.hit(f"otp_req:{ip}", max_hits=5, window_seconds=900):
        raise HTTPException(429, "Too many OTP requests. Try again in 15 minutes.")
    email = body.email.lower()
    u = await db.users.find_one({"email": email})
    if not u:
        uid = str(uuid.uuid4())
        u = {"id": uid, "email": email, "name": email.split("@")[0].title(),
             "password_hash": "", "created_at": now_iso(), "last_login": now_iso()}
        await db.users.insert_one(u)
        await _create_org_internal(f"{u['name']}'s Business", uid)
    otp = str(secrets.randbelow(900000) + 100000)
    expires_at = (now_dt() + timedelta(minutes=10)).isoformat()
    await db.otp_codes.delete_many({"email": email})
    await db.otp_codes.insert_one({"email": email, "otp": otp,
                                   "expires_at": expires_at, "used": False})
    html = f"""
    <div style="font-family:sans-serif;max-width:400px;margin:0 auto;">
      <h2 style="color:#1D4ED8;">Your BillingEasy OTP</h2>
      <p>Use this code to sign in. It expires in 10 minutes.</p>
      <div style="font-size:40px;font-weight:800;letter-spacing:10px;color:#1D4ED8;
                  background:#EFF6FF;padding:20px;border-radius:12px;text-align:center;
                  margin:16px 0;">{otp}</div>
      <p style="color:#6B7280;font-size:13px;">If you didn't request this, ignore this email.</p>
      <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;"/>
      <p style="color:#9CA3AF;font-size:12px;">BillingEasy · billingseasy.com</p>
    </div>"""
    sent = send_email(email, f"{otp} is your BillingEasy OTP", html, f"Your OTP is: {otp}")
    if not sent:
        logger.info("OTP for %s: %s", email, otp)
        return {"ok": True, "message": f"Email not configured — your OTP is: {otp}", "dev_otp": otp}
    return {"ok": True, "message": "OTP sent to your email. Valid for 10 minutes."}

@api.post("/auth/otp/verify")
async def otp_verify(body: OtpVerifyIn, request: Request, response: Response):
    ip = client_ip(request)
    if not limiter.hit(f"otp_verify:{ip}", max_hits=10, window_seconds=900):
        raise HTTPException(429, "Too many attempts. Try again later.")
    email = body.email.lower()
    rec = await db.otp_codes.find_one({"email": email, "used": False})
    if not rec or rec["otp"] != body.otp.strip():
        raise HTTPException(400, "Invalid OTP")
    if datetime.fromisoformat(rec["expires_at"]) < now_dt():
        raise HTTPException(400, "OTP has expired. Request a new one.")
    await db.otp_codes.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
    u = await db.users.find_one({"email": email})
    await db.users.update_one({"id": u["id"]}, {"$set": {"last_login": now_iso()}})
    token = create_access_token(u["id"], u["email"])
    refresh = create_refresh_token(u["id"])
    response.set_cookie("access_token", token, httponly=True, samesite="lax",
                        secure=False, max_age=30*60, path="/")
    return {"id": u["id"], "email": u["email"], "name": u["name"],
            "token": token, "refresh_token": refresh}



# ──────────────── PHONE / SMS OTP LOGIN ────────────────
class PhoneOtpRequestIn(BaseModel):
    phone: str  # 10-digit Indian mobile number

class PhoneOtpVerifyIn(BaseModel):
    phone: str
    otp: str

def normalize_phone(phone: str) -> str:
    """Strip +91 / 0 prefix, return 10-digit number."""
    p = phone.strip().replace(" ", "").replace("-", "")
    if p.startswith("+91"):
        p = p[3:]
    elif p.startswith("91") and len(p) == 12:
        p = p[2:]
    elif p.startswith("0"):
        p = p[1:]
    return p

async def send_sms_otp(phone10: str, otp: str) -> bool:
    """Send OTP via Fast2SMS. Returns True if sent."""
    api_key = os.environ.get("FAST2SMS_API_KEY", "")
    if not api_key:
        logger.info("SMS OTP for %s: %s (no FAST2SMS_API_KEY)", phone10, otp)
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                "https://www.fast2sms.com/dev/bulkV2",
                headers={"authorization": api_key},
                json={
                    "variables_values": otp,
                    "route": "otp",
                    "numbers": phone10,
                },
            )
        resp = r.json()
        if resp.get("return"):
            return True
        logger.warning("Fast2SMS error: %s", resp)
        return False
    except Exception as exc:
        logger.warning("Fast2SMS exception: %s", exc)
        return False

@api.post("/auth/phone/request")
async def phone_otp_request(body: PhoneOtpRequestIn, request: Request):
    ip = client_ip(request)
    if not limiter.hit(f"phone_otp:{ip}", max_hits=5, window_seconds=900):
        raise HTTPException(429, "Too many OTP requests. Try again in 15 minutes.")
    phone = normalize_phone(body.phone)
    if len(phone) != 10 or not phone.isdigit():
        raise HTTPException(400, "Enter a valid 10-digit Indian mobile number")
    # Auto-create user keyed by phone if not exists
    u = await db.users.find_one({"phone": phone})
    if not u:
        uid = str(uuid.uuid4())
        fake_email = f"{phone}@phone.billingseasy.com"
        u = {"id": uid, "email": fake_email, "name": f"User{phone[-4:]}",
             "phone": phone, "password_hash": "", "created_at": now_iso(), "last_login": now_iso()}
        await db.users.insert_one(u)
        await _create_org_internal(f"Business {phone[-4:]}", uid)
    otp = str(secrets.randbelow(900000) + 100000)
    expires_at = (now_dt() + timedelta(minutes=10)).isoformat()
    await db.otp_codes.delete_many({"phone": phone})
    await db.otp_codes.insert_one({"phone": phone, "otp": otp, "expires_at": expires_at, "used": False})
    sent = await send_sms_otp(phone, otp)
    if not sent:
        return {"ok": True, "message": f"SMS not configured — OTP: {otp}", "dev_otp": otp}
    return {"ok": True, "message": f"OTP sent to +91 {phone[:5]}XXXXX. Valid for 10 min."}

@api.post("/auth/phone/verify")
async def phone_otp_verify(body: PhoneOtpVerifyIn, request: Request, response: Response):
    ip = client_ip(request)
    if not limiter.hit(f"phone_verify:{ip}", max_hits=10, window_seconds=900):
        raise HTTPException(429, "Too many attempts. Try again later.")
    phone = normalize_phone(body.phone)
    rec = await db.otp_codes.find_one({"phone": phone, "used": False})
    if not rec or rec["otp"] != body.otp.strip():
        raise HTTPException(400, "Invalid OTP")
    if datetime.fromisoformat(rec["expires_at"]) < now_dt():
        raise HTTPException(400, "OTP expired. Request a new one.")
    await db.otp_codes.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
    u = await db.users.find_one({"phone": phone})
    await db.users.update_one({"id": u["id"]}, {"$set": {"last_login": now_iso()}})
    token = create_access_token(u["id"], u["email"])
    refresh = create_refresh_token(u["id"])
    response.set_cookie("access_token", token, httponly=True, samesite="lax",
                        secure=False, max_age=30*60, path="/")
    return {"id": u["id"], "email": u["email"], "name": u["name"],
            "token": token, "refresh_token": refresh}


# ──────────────── WALLET / CREDITS ────────────────
DEFAULT_CREDIT_COSTS = {
    "invoice.create":        3,
    "purchase.create":       2,
    "payment.create":        1,
    "expense.create":        1,
    "ai.query":             10,
    "bank_statement.upload": 5,
    "report.export":         3,
    "gst.export":            5,
    "einvoice.generate":     4,
}

# Credit packs available for purchase
CREDIT_PACKS = [
    {"id": "PACK_100",   "name": "Try It",   "credits": 100,   "price": 149,   "per_credit": 1.49, "savings_pct": 0,  "badge": None,          "color": "slate"},
    {"id": "PACK_500",   "name": "Starter",  "credits": 500,   "price": 649,   "per_credit": 1.30, "savings_pct": 13, "badge": None,          "color": "blue"},
    {"id": "PACK_2000",  "name": "Growth",   "credits": 2000,  "price": 2299,  "per_credit": 1.15, "savings_pct": 23, "badge": "Most Popular","color": "blue"},
    {"id": "PACK_7500",  "name": "Business", "credits": 7500,  "price": 7499,  "per_credit": 1.00, "savings_pct": 33, "badge": None,          "color": "violet"},
    {"id": "PACK_25000", "name": "Enterprise","credits": 25000, "price": 19999, "per_credit": 0.80, "savings_pct": 46, "badge": "Best Value",  "color": "violet"},
]

async def _get_credit_costs() -> dict:
    override = await db.credit_config.find_one({"key": "costs"})
    if override:
        return {**DEFAULT_CREDIT_COSTS, **override.get("costs", {})}
    return DEFAULT_CREDIT_COSTS

async def _get_wallet(org_id: str) -> dict:
    w = await db.wallets.find_one({"org_id": org_id})
    if not w:
        w = {"org_id": org_id, "balance": 50, "total_earned": 50,
             "total_spent": 0, "created_at": now_iso()}
        await db.wallets.insert_one(w)
    return w

async def deduct_credits(org_id: str, action: str, ref: str = "") -> dict:
    costs = await _get_credit_costs()
    cost = costs.get(action, 0)
    if cost == 0:
        return {"ok": True, "cost": 0}
    w = await _get_wallet(org_id)
    if w["balance"] < cost:
        raise HTTPException(402, f"Insufficient credits. Need {cost}, have {w['balance']}. Top up your wallet.")
    new_bal = w["balance"] - cost
    await db.wallets.update_one(
        {"org_id": org_id},
        {"$inc": {"balance": -cost, "total_spent": cost}}
    )
    await db.wallet_txns.insert_one({
        "id": str(uuid.uuid4()), "org_id": org_id, "action": action,
        "cost": cost, "balance_after": new_bal, "ref": ref, "created_at": now_iso(),
    })
    return {"ok": True, "cost": cost, "balance": new_bal}

@api.get("/wallet/packs")
async def get_credit_packs():
    return CREDIT_PACKS

class PurchasePackIn(BaseModel):
    pack_id: str

@api.post("/wallet/create-order")
async def wallet_create_order(body: dict, ctx=Depends(get_org_ctx)):
    """Create a Cashfree payment order for a credit pack. Returns order_id + payment_session_id."""
    pack_id = body.get("pack_id")
    packs = await db.config.find_one({"key": "credit_packs"}, {"_id": 0})
    pack = next((p for p in (packs or {}).get("value", []) if p["id"] == pack_id), None)
    if not pack:
        # Fall back to in-memory CREDIT_PACKS list
        pack = next((p for p in CREDIT_PACKS if p["id"] == pack_id), None)
    if not pack:
        raise HTTPException(400, "Invalid pack")

    creds = await get_cashfree_credentials(db)
    order_id = f"BE-{ctx['org_id'][:8]}-{pack_id}-{str(uuid.uuid4())[:8]}"

    if not creds.get("client_id") or not creds.get("client_secret") or creds.get("is_mock"):
        # Mock mode — return a fake session for testing
        mock_session = f"mock_session_{order_id}"
        await db.pending_orders.insert_one({
            "order_id": order_id, "org_id": ctx["org_id"],
            "pack_id": pack_id, "pack": pack,
            "amount": pack["price"], "status": "created",
            "mock": True, "created_at": now_iso()
        })
        return {"order_id": order_id, "payment_session_id": mock_session, "mock": True, "amount": pack["price"]}

    cf_env = creds.get("env", "sandbox")
    base = "https://sandbox.cashfree.com" if cf_env == "sandbox" else "https://api.cashfree.com"
    headers = {
        "x-client-id": creds["client_id"],
        "x-client-secret": creds["client_secret"],
        "x-api-version": "2023-08-01",
        "Content-Type": "application/json"
    }
    user = ctx["user"]
    payload = {
        "order_id": order_id,
        "order_amount": pack["price"],
        "order_currency": "INR",
        "customer_details": {
            "customer_id": user.get("id", str(uuid.uuid4())[:8]),
            "customer_email": user.get("email", "user@example.com"),
            "customer_phone": user.get("phone", "9999999999")
        },
        "order_meta": {"return_url": f"https://billingseasy.com/credits?order_id={order_id}"},
        "order_note": f"BillingsEasy credit pack: {pack['name']} ({pack['credits']} credits)"
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{base}/pg/orders", json=payload, headers=headers)
    if r.status_code not in (200, 201):
        raise HTTPException(502, f"Cashfree order creation failed: {r.text}")
    data = r.json()
    await db.pending_orders.insert_one({
        "order_id": order_id, "org_id": ctx["org_id"],
        "pack_id": pack_id, "pack": pack,
        "amount": pack["price"], "status": "created",
        "mock": False, "created_at": now_iso()
    })
    return {"order_id": order_id, "payment_session_id": data.get("payment_session_id"), "mock": False, "amount": pack["price"]}


@api.post("/wallet/verify-order")
async def wallet_verify_order(body: dict, ctx=Depends(get_org_ctx)):
    """Called after Cashfree payment completes. Verifies and credits the wallet."""
    order_id = body.get("order_id")
    order = await db.pending_orders.find_one({"order_id": order_id, "org_id": ctx["org_id"]})
    if not order:
        raise HTTPException(404, "Order not found")
    if order.get("status") == "paid":
        wallet = await _get_wallet(ctx["org_id"])
        return {"balance": wallet["balance"], "already_processed": True}

    creds = await get_cashfree_credentials(db)

    if order.get("mock"):
        # Mock mode — auto-approve
        verified = True
        cf_status = "PAID"
    else:
        cf_env = creds.get("env", "sandbox")
        base = "https://sandbox.cashfree.com" if cf_env == "sandbox" else "https://api.cashfree.com"
        headers = {
            "x-client-id": creds["client_id"],
            "x-client-secret": creds["client_secret"],
            "x-api-version": "2023-08-01"
        }
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{base}/pg/orders/{order_id}", headers=headers)
        if r.status_code != 200:
            raise HTTPException(502, "Could not verify payment")
        data = r.json()
        cf_status = data.get("order_status", "")
        verified = cf_status == "PAID"

    if verified:
        pack = order["pack"]
        credits_to_add = pack["credits"]
        wallet = await _get_wallet(ctx["org_id"])
        new_balance = wallet["balance"] + credits_to_add
        await db.wallets.update_one(
            {"org_id": ctx["org_id"]},
            {
                "$set": {"balance": new_balance},
                "$inc": {"total_earned": credits_to_add},
                "$push": {"transactions": {
                    "id": str(uuid.uuid4()), "type": "purchase",
                    "amount": credits_to_add, "pack": pack["name"],
                    "order_id": order_id, "paid_inr": pack["price"],
                    "created_at": now_iso()
                }}
            }
        )
        await db.pending_orders.update_one({"order_id": order_id}, {"$set": {"status": "paid"}})
        return {"balance": new_balance, "credits_added": credits_to_add}
    else:
        raise HTTPException(402, f"Payment not completed. Status: {cf_status}")


@api.post("/wallet/cashfree-webhook")
async def wallet_cashfree_payment_webhook(request: Request):
    """Cashfree PG webhook for one-time credit pack payments."""
    payload = await request.body()
    sig = request.headers.get("x-webhook-signature", "")
    ts = request.headers.get("x-webhook-timestamp", "")
    creds = await get_cashfree_credentials(db)
    secret = creds.get("client_secret", "")
    if secret and sig:
        msg = ts + payload.decode()
        expected = base64.b64encode(
            hmac.new(secret.encode(), msg.encode(), hashlib.sha256).digest()
        ).decode()
        if not hmac.compare_digest(sig, expected):
            raise HTTPException(400, "Invalid signature")
    data = json.loads(payload)
    event = data.get("type", "")
    if event == "PAYMENT_SUCCESS_WEBHOOK":
        order_id = data.get("data", {}).get("order", {}).get("order_id", "")
        order = await db.pending_orders.find_one({"order_id": order_id})
        if order and order.get("status") != "paid":
            pack = order["pack"]
            wallet = await _get_wallet(order["org_id"])
            new_balance = wallet["balance"] + pack["credits"]
            await db.wallets.update_one(
                {"org_id": order["org_id"]},
                {
                    "$set": {"balance": new_balance},
                    "$inc": {"total_earned": pack["credits"]},
                    "$push": {"transactions": {
                        "id": str(uuid.uuid4()), "type": "purchase",
                        "amount": pack["credits"], "pack": pack["name"],
                        "order_id": order_id, "paid_inr": pack["price"],
                        "created_at": now_iso()
                    }}
                }
            )
            await db.pending_orders.update_one({"order_id": order_id}, {"$set": {"status": "paid"}})
    return {"ok": True}


@api.post("/wallet/purchase")
async def purchase_pack(body: PurchasePackIn, ctx=Depends(get_org_ctx)):
    if not ctx["user"].get("is_super_admin"):
        raise HTTPException(403, "Use /credits to purchase credits via payment gateway")
    pack = next((p for p in CREDIT_PACKS if p["id"] == body.pack_id), None)
    if not pack:
        raise HTTPException(400, "Invalid pack")
    org_id = ctx["org_id"]
    await db.wallets.update_one(
        {"org_id": org_id},
        {"$inc": {"balance": pack["credits"], "total_earned": pack["credits"]}},
        upsert=True,
    )
    await db.wallet_txns.insert_one({
        "id": str(uuid.uuid4()), "org_id": org_id, "action": "topup",
        "cost": -pack["credits"],
        "ref": f"{pack['name']} Pack — ₹{pack['price']:,} ({pack['credits']} credits)",
        "created_at": now_iso(),
    })
    w = await _get_wallet(org_id)
    return {"ok": True, "pack": pack, "balance": w["balance"]}

@api.get("/wallet")
async def get_wallet(ctx=Depends(get_org_ctx)):
    org_id = ctx["org_id"]
    w = await _get_wallet(org_id)
    costs = await _get_credit_costs()
    txns = await db.wallet_txns.find(
        {"org_id": org_id}, {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    return {"balance": w["balance"], "total_earned": w["total_earned"],
            "total_spent": w["total_spent"], "costs": costs, "transactions": txns}

class TopUpIn(BaseModel):
    credits: int = Field(ge=10, le=100000)
    note: str = ""

@api.post("/wallet/topup")
async def topup_wallet(body: TopUpIn, ctx=Depends(get_org_ctx)):
    if not ctx["user"].get("is_super_admin"):
        raise HTTPException(403, "Use /credits to purchase credits via payment gateway")
    org_id = ctx["org_id"]
    await db.wallets.update_one(
        {"org_id": org_id},
        {"$inc": {"balance": body.credits, "total_earned": body.credits}},
        upsert=True,
    )
    await db.wallet_txns.insert_one({
        "id": str(uuid.uuid4()), "org_id": org_id, "action": "topup",
        "cost": -body.credits, "ref": body.note or "Manual top-up", "created_at": now_iso(),
    })
    w = await _get_wallet(org_id)
    return {"ok": True, "balance": w["balance"]}

@api.get("/admin/credit-costs")
async def admin_get_costs(user=Depends(get_current_user)):
    if not user.get("is_super_admin"):
        raise HTTPException(403, "Super admin only")
    return await _get_credit_costs()

class CreditCostsIn(BaseModel):
    costs: Dict[str, int]

@api.put("/admin/credit-costs")
async def admin_set_costs(body: CreditCostsIn, user=Depends(get_current_user)):
    if not user.get("is_super_admin"):
        raise HTTPException(403, "Super admin only")
    await db.credit_config.update_one(
        {"key": "costs"}, {"$set": {"costs": body.costs}}, upsert=True
    )
    return {"ok": True, "costs": body.costs}

class AdminTopUpIn(BaseModel):
    org_id: str
    credits: int = Field(ge=1)
    note: str = ""

@api.post("/admin/wallet/topup")
async def admin_topup(body: AdminTopUpIn, user=Depends(get_current_user)):
    if not user.get("is_super_admin"):
        raise HTTPException(403, "Super admin only")
    await db.wallets.update_one(
        {"org_id": body.org_id},
        {"$inc": {"balance": body.credits, "total_earned": body.credits}},
        upsert=True,
    )
    await db.wallet_txns.insert_one({
        "id": str(uuid.uuid4()), "org_id": body.org_id, "action": "topup",
        "cost": -body.credits, "ref": body.note or f"Admin top-up by {user['email']}",
        "created_at": now_iso(),
    })
    return {"ok": True}

@api.get("/admin/wallets")
async def admin_list_wallets(user=Depends(get_current_user)):
    if not user.get("is_super_admin"):
        raise HTTPException(403, "Super admin only")
    wallets = await db.wallets.find({}, {"_id": 0}).sort("balance", 1).to_list(500)
    return wallets


# One-time bootstrap: promote any email to super admin using BOOTSTRAP_SECRET env var
# POST /api/bootstrap-admin  body: {"email": "you@example.com", "secret": "your-secret"}
@api.post("/bootstrap-admin")
async def bootstrap_admin(body: dict):
    secret = os.getenv("BOOTSTRAP_SECRET", "")
    if not secret or body.get("secret") != secret:
        raise HTTPException(403, "Invalid bootstrap secret")
    email = (body.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(400, "email required")
    result = await db.users.update_one(
        {"email": email},
        {"$set": {"is_super_admin": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, f"User {email} not found. Register first, then call this endpoint.")
    return {"ok": True, "message": f"{email} is now super admin"}


@api.post("/admin/migrate-biz-type")
async def migrate_biz_type(body: dict, user=Depends(get_current_user)):
    """One-time migration: tag all existing untagged docs as the given biz_type (default b2b)."""
    if not user.get("is_super_admin"):
        raise HTTPException(403, "Super admin only")
    biz_type = body.get("biz_type", "b2b")
    no_tag = {"$or": [{"biz_type": {"$exists": False}}, {"biz_type": None}]}
    results = {}
    for coll_name in ["parties", "invoices", "purchases", "expenses", "payments"]:
        coll = db[coll_name]
        r = await coll.update_many(no_tag, {"$set": {"biz_type": biz_type}})
        results[coll_name] = r.modified_count
    return {"ok": True, "tagged_as": biz_type, "counts": results}


# ---------------- ORGS ----------------
async def _create_org_internal(name: str, owner_user_id: str, state: str = "Tamil Nadu", state_code: str = "33") -> dict:
    org_id = str(uuid.uuid4())
    trial_ends = now_dt() + timedelta(days=7)
    org = {
        "id": org_id, "name": name,
        "address": "", "state": state, "state_code": state_code,
        "gstin": "", "pan": "", "phone": "", "email": "",
        "logo_url": "",
        "bank_name": "", "bank_account": "", "bank_ifsc": "", "bank_branch": "",
        "terms": "1. Payment due within 30 days.\n2. Subject to local jurisdiction.",
        "owner_user_id": owner_user_id,
        "plan_code": None,
        "subscription_status": "trialing",
        "trial_ends_at": trial_ends.isoformat(),
        "current_period_end": None,
        "cashfree_subscription_id": None,
        "created_at": now_iso(),
    }
    await db.organizations.insert_one(org)
    org.pop("_id", None)
    await db.memberships.insert_one({
        "id": str(uuid.uuid4()), "user_id": owner_user_id, "org_id": org_id,
        "role": "owner", "created_at": now_iso(),
    })
    await ensure_system_roles(db, org_id)
    return org


@api.get("/orgs")
async def list_my_orgs(user=Depends(get_current_user)):
    memberships = await db.memberships.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    out = []
    for m in memberships:
        org = await db.organizations.find_one({"id": m["org_id"]}, {"_id": 0})
        if org:
            allowed_modes = await resolve_allowed_modes(db, m["role"], m["org_id"])
            if org.get("deleted"):
                continue
            out.append({**org, "role": m["role"], "allowed_modes": allowed_modes,
                        "subscription": await effective_subscription(org)})
    return out


@api.post("/orgs")
async def create_org(body: OrgCreateIn, request: Request, user=Depends(get_current_user)):
    """Legacy endpoint (old 'New Organization' dialog) — now goes through business limits as B2B."""
    return await create_business(BusinessCreateIn(name=body.name, business_type="b2b", state=body.state,
                                                  state_code=body.state_code), request, user)


@api.get("/orgs/current")
async def get_current_org(ctx=Depends(get_org_ctx)):
    org = await get_org_doc(ctx["org_id"])
    return {**org, "role": ctx["role"], "allowed_modes": ctx.get("allowed_modes", []),
            "subscription": await effective_subscription(org)}


@api.put("/orgs/current")
async def update_current_org(body: OrgUpdateIn, request: Request, ctx=Depends(require_permission("settings.edit"))):
    data = body.model_dump()
    data["updated_at"] = now_iso()
    await db.organizations.update_one({"id": ctx["org_id"]}, {"$set": data})
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="settings.updated",
                    entity_type="organization", entity_id=ctx["org_id"], request=request)
    return await db.organizations.find_one({"id": ctx["org_id"]}, {"_id": 0})


# ── Entities (sub-profiles within an org) ─────────────────────────────────────

class EntityIn(BaseModel):
    name: str                       # e.g. "Nammahut B2B", "Nammahut Retail"
    biz_type: str = "b2b"           # b2b | b2c | restaurant | pos
    gstin: str = ""
    pan: str = ""
    address: str = ""
    state: str = ""
    state_code: str = ""
    phone: str = ""
    email: str = ""
    logo_b64: str = ""
    invoice_prefix: str = ""        # e.g. "B2B", "B2C"
    invoice_theme: dict = {}

@api.get("/orgs/current/entities")
async def list_entities(ctx=Depends(get_org_ctx)):
    org = await get_org_doc(ctx["org_id"])
    return org.get("entities", [])

@api.post("/orgs/current/entities")
async def create_entity(body: EntityIn, ctx=Depends(require_permission("settings.edit"))):
    eid = str(uuid.uuid4())
    entity = {"id": eid, **body.model_dump(), "created_at": now_iso()}
    await db.organizations.update_one({"id": ctx["org_id"]}, {"$push": {"entities": entity}})
    return entity

@api.put("/orgs/current/entities/{eid}")
async def update_entity(eid: str, body: EntityIn, ctx=Depends(require_permission("settings.edit"))):
    org = await get_org_doc(ctx["org_id"])
    entities = org.get("entities", [])
    updated = []
    found = False
    for e in entities:
        if e["id"] == eid:
            updated.append({"id": eid, **body.model_dump(), "created_at": e.get("created_at", now_iso()), "updated_at": now_iso()})
            found = True
        else:
            updated.append(e)
    if not found:
        raise HTTPException(404, "Entity not found")
    await db.organizations.update_one({"id": ctx["org_id"]}, {"$set": {"entities": updated}})
    return next(e for e in updated if e["id"] == eid)

@api.delete("/orgs/current/entities/{eid}")
async def delete_entity(eid: str, ctx=Depends(require_permission("settings.edit"))):
    await db.organizations.update_one({"id": ctx["org_id"]}, {"$pull": {"entities": {"id": eid}}})
    return {"ok": True}


# Bulk product update (inline edit all)
class BulkProductUpdateIn(BaseModel):
    updates: List[dict]   # [{id, name, purchase_price, sale_price, gst_rate, stock, unit, ...}]

@api.put("/products/bulk-update")
async def bulk_update_products(body: BulkProductUpdateIn, ctx=Depends(get_org_ctx)):
    """Update multiple products at once (inline edit mode)."""
    await ensure_active_subscription(ctx)
    updated = 0
    ALLOWED = {"name", "purchase_price", "sale_price", "gst_rate", "unit", "unit_qty",
                "hsn", "category", "low_stock_alert", "modes", "entity_id"}
    for upd in body.updates:
        pid = upd.get("id")
        if not pid: continue
        patch = {k: v for k, v in upd.items() if k in ALLOWED}
        if patch:
            await db.products.update_one(org_filter(ctx, {"id": pid}), {"$set": patch})
            updated += 1
    return {"ok": True, "updated": updated}


@api.get("/orgs/current/branches")
async def list_branches(ctx=Depends(get_org_ctx)):
    org = await get_org_doc(ctx["org_id"])
    return org.get("branches", [])

@api.post("/orgs/current/branches")
async def add_branch(body: BranchIn, ctx=Depends(get_org_ctx)):
    branch = {"id": str(uuid.uuid4()), **body.model_dump(), "created_at": now_iso()}
    await db.organizations.update_one({"id": ctx["org_id"]}, {"$push": {"branches": branch}})
    return branch

@api.put("/orgs/current/branches/{branch_id}")
async def update_branch(branch_id: str, body: BranchIn, ctx=Depends(get_org_ctx)):
    org = await get_org_doc(ctx["org_id"])
    branches = org.get("branches", [])
    idx = next((i for i, b in enumerate(branches) if b["id"] == branch_id), None)
    if idx is None: raise HTTPException(404, "Branch not found")
    branches[idx] = {**branches[idx], **body.model_dump()}
    await db.organizations.update_one({"id": ctx["org_id"]}, {"$set": {"branches": branches}})
    return branches[idx]

@api.delete("/orgs/current/branches/{branch_id}")
async def delete_branch(branch_id: str, ctx=Depends(get_org_ctx)):
    await db.organizations.update_one({"id": ctx["org_id"]}, {"$pull": {"branches": {"id": branch_id}}})
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# WAREHOUSES  (stored in org doc like branches)
# ─────────────────────────────────────────────────────────────────────────────

@api.get("/warehouses")
async def list_warehouses(ctx=Depends(get_org_ctx)):
    org = await get_org_doc(ctx["org_id"])
    return org.get("warehouses", [])

@api.post("/warehouses")
async def create_warehouse(body: WarehouseIn, ctx=Depends(require_permission("settings.edit"))):
    wh = {"id": str(uuid.uuid4()), **body.model_dump(), "created_at": now_iso()}
    await db.organizations.update_one({"id": ctx["org_id"]}, {"$push": {"warehouses": wh}})
    return wh

@api.put("/warehouses/{wid}")
async def update_warehouse(wid: str, body: WarehouseIn, ctx=Depends(require_permission("settings.edit"))):
    org = await get_org_doc(ctx["org_id"])
    whs = org.get("warehouses", [])
    idx = next((i for i, w in enumerate(whs) if w["id"] == wid), None)
    if idx is None: raise HTTPException(404, "Warehouse not found")
    whs[idx] = {**whs[idx], **body.model_dump()}
    await db.organizations.update_one({"id": ctx["org_id"]}, {"$set": {"warehouses": whs}})
    return whs[idx]

@api.delete("/warehouses/{wid}")
async def delete_warehouse(wid: str, ctx=Depends(require_permission("settings.edit"))):
    await db.organizations.update_one({"id": ctx["org_id"]}, {"$pull": {"warehouses": {"id": wid}}})
    return {"ok": True}

@api.get("/warehouses/{wid}/stock")
async def warehouse_stock(wid: str, ctx=Depends(get_org_ctx)):
    """Return per-product stock for a specific warehouse."""
    cursor = db.warehouse_stock.find(org_filter(ctx, {"warehouse_id": wid}), {"_id": 0})
    items = await cursor.to_list(length=2000)
    # Join product names
    prod_ids = [i["product_id"] for i in items]
    prods = {}
    async for p in db.products.find(org_filter(ctx, {"id": {"$in": prod_ids}}), {"_id": 0, "id": 1, "name": 1, "sku": 1, "unit": 1, "low_stock_alert": 1}):
        prods[p["id"]] = p
    for it in items:
        p = prods.get(it["product_id"], {})
        it["product_name"] = p.get("name", "Unknown")
        it["sku"] = p.get("sku", "")
        it["unit"] = p.get("unit", "NOS")
        it["low_stock_alert"] = p.get("low_stock_alert", 5)
    return items

async def _adjust_warehouse_stock(org_id: str, warehouse_id: str, product_id: str, qty_delta: float,
                                   movement_type: str = "", ref_id: str = "", ref_no: str = "",
                                   party_name: str = "", date: str = ""):
    """Add/subtract qty from warehouse_stock and log a stock movement."""
    filt = {"org_id": org_id, "warehouse_id": warehouse_id, "product_id": product_id}
    await db.warehouse_stock.update_one(filt, {"$inc": {"qty": qty_delta}}, upsert=True)
    # Log movement
    if movement_type:
        await db.stock_movements.insert_one({
            "id": str(uuid.uuid4()), "org_id": org_id,
            "product_id": product_id, "warehouse_id": warehouse_id,
            "qty": qty_delta,  # positive = IN, negative = OUT
            "movement_type": movement_type,  # grn | sale | purchase_return | adjustment | delivery
            "ref_id": ref_id, "ref_no": ref_no, "party_name": party_name,
            "date": date or now_iso()[:10],
            "created_at": now_iso(),
        })


async def _log_stock_movement(org_id: str, product_id: str, qty_delta: float,
                               movement_type: str, ref_id: str = "", ref_no: str = "",
                               party_name: str = "", date: str = "", warehouse_id: str = ""):
    """Log a global product stock movement (no warehouse)."""
    await db.stock_movements.insert_one({
        "id": str(uuid.uuid4()), "org_id": org_id,
        "product_id": product_id, "warehouse_id": warehouse_id,
        "qty": qty_delta,
        "movement_type": movement_type,
        "ref_id": ref_id, "ref_no": ref_no, "party_name": party_name,
        "date": date or now_iso()[:10],
        "created_at": now_iso(),
    })


# ─────────────────────────────────────────────────────────────────────────────
# GRN – Goods Receipt Note
# ─────────────────────────────────────────────────────────────────────────────

async def _next_grn_number(org_id: str) -> str:
    import datetime as _dt
    yr = _dt.date.today().year
    count = await db.grns.count_documents({"org_id": org_id}) + 1
    return f"GRN-{yr}-{count:04d}"

@api.get("/grns")
async def list_grns(ctx=Depends(get_org_ctx)):
    cursor = db.grns.find(org_filter(ctx, {}), {"_id": 0}).sort("grn_date", -1)
    return await cursor.to_list(length=500)

@api.get("/grns/{gid}")
async def get_grn(gid: str, ctx=Depends(get_org_ctx)):
    grn = await db.grns.find_one(org_filter(ctx, {"id": gid}), {"_id": 0})
    if not grn: raise HTTPException(404, "GRN not found")
    return grn

@api.post("/grns")
async def create_grn(body: GrnIn, ctx=Depends(require_permission("purchase.create"))):
    # Validate warehouse exists
    org = await get_org_doc(ctx["org_id"])
    whs = {w["id"]: w for w in org.get("warehouses", [])}
    if body.warehouse_id not in whs:
        raise HTTPException(400, "Warehouse not found")

    grn_no = await _next_grn_number(ctx["org_id"])
    grn = {
        "id": str(uuid.uuid4()),
        "org_id": ctx["org_id"],
        "grn_no": grn_no,
        **body.model_dump(),
        "warehouse_name": whs[body.warehouse_id]["name"],
        "status": "received",
        "created_at": now_iso(),
    }
    # Resolve vendor name
    vendor = await db.parties.find_one(org_filter(ctx, {"id": body.vendor_id}), {"_id": 0, "name": 1})
    grn["vendor_name"] = vendor.get("name", "") if vendor else ""

    await db.grns.insert_one(grn)

    # Increase warehouse stock per item
    for it in body.items:
        if it.product_id:
            await _adjust_warehouse_stock(
                ctx["org_id"], body.warehouse_id, it.product_id, it.qty,
                movement_type="grn", ref_id=grn["id"], ref_no=grn_no,
                party_name=grn.get("vendor_name", ""), date=body.grn_date)
            # Also update global product stock
            await db.products.update_one(org_filter(ctx, {"id": it.product_id}), {"$inc": {"stock": it.qty}})

    grn.pop("_id", None)
    return grn

@api.delete("/grns/{gid}")
async def delete_grn(gid: str, ctx=Depends(require_permission("purchase.create"))):
    grn = await db.grns.find_one(org_filter(ctx, {"id": gid}), {"_id": 0})
    if not grn: raise HTTPException(404, "GRN not found")
    # Reverse stock
    for it in grn.get("items", []):
        if it.get("product_id"):
            await _adjust_warehouse_stock(ctx["org_id"], grn["warehouse_id"], it["product_id"], -it["qty"])
            await db.products.update_one(org_filter(ctx, {"id": it["product_id"]}), {"$inc": {"stock": -it["qty"]}})
    await db.grns.delete_one({"id": gid, "org_id": ctx["org_id"]})
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# DELIVERY ORDERS
# ─────────────────────────────────────────────────────────────────────────────

async def _next_do_number(org_id: str) -> str:
    import datetime as _dt
    yr = _dt.date.today().year
    count = await db.delivery_orders.count_documents({"org_id": org_id}) + 1
    return f"DO-{yr}-{count:04d}"

@api.get("/delivery-orders")
async def list_delivery_orders(ctx=Depends(get_org_ctx)):
    cursor = db.delivery_orders.find(org_filter(ctx, {}), {"_id": 0}).sort("do_date", -1)
    return await cursor.to_list(length=500)

@api.get("/delivery-orders/{did}")
async def get_delivery_order(did: str, ctx=Depends(get_org_ctx)):
    do = await db.delivery_orders.find_one(org_filter(ctx, {"id": did}), {"_id": 0})
    if not do: raise HTTPException(404, "Delivery order not found")
    return do

@api.post("/delivery-orders")
async def create_delivery_order(body: DeliveryOrderIn, ctx=Depends(require_permission("invoice.create"))):
    org = await get_org_doc(ctx["org_id"])
    whs = {w["id"]: w for w in org.get("warehouses", [])}
    if body.warehouse_id not in whs:
        raise HTTPException(400, "Warehouse not found")

    # Check warehouse has enough stock for each item
    errors = []
    for it in body.items:
        if it.product_id:
            ws = await db.warehouse_stock.find_one(
                {"org_id": ctx["org_id"], "warehouse_id": body.warehouse_id, "product_id": it.product_id}
            )
            available = (ws or {}).get("qty", 0)
            if available < it.qty:
                prod = await db.products.find_one(org_filter(ctx, {"id": it.product_id}), {"name": 1})
                pname = (prod or {}).get("name", it.product_id)
                errors.append(f"{pname}: need {it.qty}, only {available} in warehouse")
    if errors:
        raise HTTPException(400, "; ".join(errors))

    do_no = await _next_do_number(ctx["org_id"])
    customer = await db.parties.find_one(org_filter(ctx, {"id": body.customer_id}), {"_id": 0, "name": 1, "phone": 1, "gstin": 1})

    do = {
        "id": str(uuid.uuid4()),
        "org_id": ctx["org_id"],
        "do_no": do_no,
        **body.model_dump(),
        "warehouse_name": whs[body.warehouse_id]["name"],
        "customer_name": (customer or {}).get("name", ""),
        "status": "dispatched",
        "created_at": now_iso(),
    }
    await db.delivery_orders.insert_one(do)

    # Decrease warehouse stock
    for it in body.items:
        if it.product_id:
            await _adjust_warehouse_stock(ctx["org_id"], body.warehouse_id, it.product_id, -it.qty)
            await db.products.update_one(org_filter(ctx, {"id": it.product_id}), {"$inc": {"stock": -it.qty}})

    do.pop("_id", None)
    return do

@api.delete("/delivery-orders/{did}")
async def delete_delivery_order(did: str, ctx=Depends(require_permission("invoice.create"))):
    do = await db.delivery_orders.find_one(org_filter(ctx, {"id": did}), {"_id": 0})
    if not do: raise HTTPException(404)
    for it in do.get("items", []):
        if it.get("product_id"):
            await _adjust_warehouse_stock(ctx["org_id"], do["warehouse_id"], it["product_id"], it["qty"])
            await db.products.update_one(org_filter(ctx, {"id": it["product_id"]}), {"$inc": {"stock": it["qty"]}})
    await db.delivery_orders.delete_one({"id": did, "org_id": ctx["org_id"]})
    return {"ok": True}

@api.get("/orgs/current/members")
async def list_members(ctx=Depends(get_org_ctx)):
    out = []
    async for m in db.memberships.find({"org_id": ctx["org_id"]}, {"_id": 0}):
        u = await db.users.find_one({"id": m["user_id"]}, {"_id": 0, "password_hash": 0})
        if u:
            out.append({**u, "role": m["role"], "membership_id": m["id"]})
    return out


@api.post("/orgs/current/members")
async def invite_member(body: InviteIn, request: Request, ctx=Depends(require_permission("user.invite"))):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user:
        uid = str(uuid.uuid4())
        user = {
            "id": uid, "email": email, "name": body.name,
            "password_hash": hash_password(body.password), "created_at": now_iso(),
        }
        await db.users.insert_one(user)
    existing = await db.memberships.find_one({"user_id": user["id"], "org_id": ctx["org_id"]})
    if existing:
        raise HTTPException(400, "User is already a member")
    # Validate role: must be system slug or org-owned role
    if body.role not in SYSTEM_ROLES:
        role_doc = await db.roles.find_one({"slug": body.role, "org_id": ctx["org_id"]})
        if not role_doc:
            raise HTTPException(400, "Unknown role")
    await db.memberships.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["id"], "org_id": ctx["org_id"],
        "role": body.role, "created_at": now_iso(),
    })
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="user.invited",
                    entity_type="user", entity_id=user["id"],
                    metadata={"email": email, "role": body.role}, request=request)
    return {"ok": True, "user_id": user["id"]}


class MemberRoleIn(BaseModel):
    role: str


@api.patch("/orgs/current/members/{membership_id}/role")
async def change_member_role(membership_id: str, body: MemberRoleIn, request: Request,
                              ctx=Depends(require_permission("user.invite"))):
    m = await db.memberships.find_one({"id": membership_id, "org_id": ctx["org_id"]})
    if not m:
        raise HTTPException(404, "Not found")
    if m["role"] == "owner":
        raise HTTPException(400, "Cannot change the owner's role")
    if m["user_id"] == ctx["user"]["id"]:
        raise HTTPException(400, "Cannot change your own role")
    # Validate role exists (system or custom)
    valid_system = list(SYSTEM_ROLES.keys())
    custom = await db.roles.find_one({"slug": body.role, "org_id": ctx["org_id"]})
    if body.role not in valid_system and not custom:
        raise HTTPException(400, f"Role '{body.role}' does not exist")
    await db.memberships.update_one({"id": membership_id}, {"$set": {"role": body.role}})
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="user.role_changed",
                    entity_type="user", entity_id=m["user_id"],
                    metadata={"old_role": m["role"], "new_role": body.role}, request=request)
    return {"ok": True}


@api.delete("/orgs/current/members/{membership_id}")
async def remove_member(membership_id: str, request: Request, ctx=Depends(require_permission("user.remove"))):
    m = await db.memberships.find_one({"id": membership_id, "org_id": ctx["org_id"]})
    if not m:
        raise HTTPException(404, "Not found")
    if m["role"] == "owner":
        raise HTTPException(400, "Cannot remove the owner")
    await db.memberships.delete_one({"id": membership_id})
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="user.removed",
                    entity_type="user", entity_id=m["user_id"],
                    metadata={"role": m["role"]}, request=request)
    return {"ok": True}


@api.post("/orgs/current/members/{membership_id}/reset-password")
async def admin_reset_password(membership_id: str, ctx=Depends(get_org_ctx)):
    """Owner can generate a new temporary password for any member in their org."""
    if ctx["role"] != "owner":
        raise HTTPException(403, "Only the org owner can reset member passwords")
    m = await db.memberships.find_one({"id": membership_id, "org_id": ctx["org_id"]})
    if not m:
        raise HTTPException(404, "Member not found")
    if m["role"] == "owner":
        raise HTTPException(400, "Cannot reset owner password via this endpoint")
    # Generate a random 10-char password: 2 upper + 2 digits + 6 lower
    import random, string
    chars = string.ascii_lowercase
    uppers = string.ascii_uppercase
    digits = string.digits
    pwd = (
        "".join(random.choices(uppers, k=2)) +
        "".join(random.choices(digits, k=2)) +
        "".join(random.choices(chars, k=6))
    )
    # Shuffle so uppers/digits aren't always first
    pwd_list = list(pwd); random.shuffle(pwd_list); pwd = "".join(pwd_list)
    hashed = hash_password(pwd)
    await db.users.update_one({"id": m["user_id"]}, {"$set": {"password_hash": hashed}})
    user = await db.users.find_one({"id": m["user_id"]}, {"_id": 0, "email": 1, "name": 1})
    return {"ok": True, "email": user.get("email"), "name": user.get("name"), "temp_password": pwd}


# ---------------- BILLING (Cashfree, MOCKED) ----------------
@api.get("/billing/plans")
async def get_plans():
    """Returns full pricing structure (tiers + add-ons) for the in-app billing page."""
    pricing = public_pricing()
    return {
        "tiers": pricing["tiers"],
        "addons": pricing["addons"],
        # Backwards compat — flat list of monthly + yearly plans
        "plans": list(PLAN_CATALOG.values()),
    }


@api.get("/billing/launch-offer")
async def billing_launch_offer():
    """Public-ish (auth required by client). Returns active launch offer details."""
    return await public_launch_offer(db)


@api.get("/public/pricing")
async def public_pricing_endpoint():
    """No-auth endpoint used by the marketing landing page."""
    pricing = public_pricing()
    offer = await public_launch_offer(db)
    return {
        "tiers": pricing["tiers"],
        "addons": pricing["addons"],
        "launch_offer": offer,
    }


# =========================================================================
# PUBLIC INDIAN COMPLIANCE TOOLS (no auth — free for SEO & lead-gen)
# =========================================================================
def _gstin_business_type(g: str) -> str:
    """Decode business type from PAN 4th character embedded in GSTIN."""
    pan_type = g[5] if len(g) >= 6 else ""
    return {
        "P": "Individual / Proprietor", "C": "Company", "H": "HUF",
        "F": "Firm / LLP", "A": "Association of Persons", "T": "Trust",
        "B": "Body of Individuals", "L": "Local Authority", "J": "Artificial Juridical Person",
        "G": "Government",
    }.get(pan_type, "")

_GST_PORTAL_URLS = [
    "https://services.gst.gov.in/services/api/search/taxpayerDetails?gstin={g}",
    "https://services.gst.gov.in/services/api/search/taxpayerDetailsByTrade?gstin={g}",
]

@api.get("/public/gstin/lookup")
async def public_gstin_lookup(gstin: str):
    """Fetch GSTIN details from GST portal; falls back to structural parse."""
    g = (gstin or "").strip().upper()
    result = validate_gstin(g)
    if not result.get("valid"):
        raise HTTPException(400, result.get("reason", "Invalid GSTIN"))

    btype = _gstin_business_type(g)
    browser_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-IN,en;q=0.9",
        "Referer": "https://www.gst.gov.in/",
        "Origin": "https://www.gst.gov.in",
        "sec-fetch-site": "same-site",
        "sec-fetch-mode": "cors",
    }

    try:
        async with httpx.AsyncClient(timeout=8, verify=False) as client:
            for url_tpl in _GST_PORTAL_URLS:
                try:
                    r = await client.get(url_tpl.format(g=g), headers=browser_headers)
                    if r.status_code == 200 and r.headers.get("content-type", "").startswith("application/json"):
                        data = r.json()
                        tp = data.get("taxpayerInfo") or data.get("data") or data
                        if isinstance(tp, dict) and tp.get("tradeNam"):
                            addr_parts = []
                            princ = tp.get("pradr", {}).get("addr", {})
                            for k in ["bnm", "st", "loc", "dst", "stcd"]:
                                v = princ.get(k, "")
                                if v and v.strip():
                                    addr_parts.append(v.strip())
                            return {
                                "valid": True, "gstin": g,
                                "trade_name": tp.get("tradeNam", ""),
                                "legal_name": tp.get("lgnm", tp.get("tradeNam", "")),
                                "state": result.get("state", ""),
                                "state_code": g[:2],
                                "address": ", ".join(addr_parts),
                                "pincode": princ.get("pncd", ""),
                                "status": tp.get("sts", "Active"),
                                "business_type": tp.get("ctb", "") or btype,
                                "source": "gst_portal",
                            }
                except Exception:
                    continue
    except Exception as exc:
        logger.info("GST portal lookup failed for %s: %s", g, exc)

    # Structural fallback — state and business type from GSTIN itself
    return {
        "valid": True, "gstin": g,
        "trade_name": "", "legal_name": "",
        "state": result.get("state", ""),
        "state_code": g[:2],
        "address": "", "pincode": "",
        "status": "Active",
        "business_type": btype,
        "source": "structural_only",
        "message": "GST portal unreachable from server — state & business type decoded from GSTIN",
    }


@api.get("/public/gstin/validate")
async def public_gstin_validate(gstin: str):
    return validate_gstin(gstin)


@api.get("/public/hsn/search")
async def public_hsn_search(q: str = "", limit: int = 20):
    """Search the bundled HSN/SAC database (CBIC). Free, no auth, no rate limit."""
    return {"query": q, "count_total": len(HSN_LIST), "results": search_hsn_db(q, limit=min(limit, 50))}


@api.get("/public/hsn/{code}")
async def public_hsn_by_code(code: str):
    item = get_hsn_by_code(code)
    if not item:
        raise HTTPException(404, "HSN/SAC code not found in the bundled CBIC list. Try the AI HSN Finder (login required).")
    return item


# =========================================================================
# AI-POWERED FEATURES (auth required — Claude Sonnet 4.5 via Emergent key)
# =========================================================================
class AiHsnIn(BaseModel):
    description: str


@api.post("/ai/hsn-finder")
async def ai_hsn_finder(body: AiHsnIn, ctx=Depends(get_org_ctx)):
    """AI fallback for HSN/SAC code suggestion when the bundled DB has no match.
    Also returns top bundled matches alongside the AI suggestion so the user can compare."""
    desc = (body.description or "").strip()
    if not desc:
        raise HTTPException(400, "description is required")
    bundled = search_hsn_db(desc, limit=5)
    try:
        ai = await ai_hsn_suggest(desc)
    except Exception as exc:
        logger.warning("AI HSN suggest failed: %s", exc)
        ai = {"error": "ai_unavailable", "message": str(exc)}
    return {"query": desc, "bundled_matches": bundled, "ai_suggestion": ai}


class AiProductSuggestIn(BaseModel):
    name: str = ""
    image_b64: str = ""


@api.post("/ai/product-suggest")
async def ai_product_suggest_endpoint(body: AiProductSuggestIn, ctx=Depends(get_org_ctx)):
    if not body.name and not body.image_b64:
        raise HTTPException(400, "Provide product name or image")
    try:
        result = await ai_product_suggest(name=body.name, image_b64=body.image_b64)
    except Exception as exc:
        logger.warning("AI product suggest failed: %s", exc)
        raise HTTPException(503, f"AI service unavailable: {exc}")
    return result


class AiCategorizeIn(BaseModel):
    description: str
    amount: Optional[float] = None


@api.post("/ai/categorize-expense")
async def ai_categorize_expense_endpoint(body: AiCategorizeIn, ctx=Depends(get_org_ctx)):
    desc = (body.description or "").strip()
    if not desc:
        raise HTTPException(400, "description is required")
    try:
        result = await ai_categorize_expense(desc, body.amount)
    except Exception as exc:
        logger.warning("AI categorize failed: %s", exc)
        raise HTTPException(503, f"AI service unavailable: {exc}")
    return result


# ---- AI Chat (streaming) ----
class AiChatIn(BaseModel):
    session_id: str
    message: str


async def _build_business_context(org_id: str) -> Dict[str, Any]:
    """Compact snapshot of the org's books for the LLM."""
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    month_prefix = now.strftime("%Y-%m")
    last_30 = (now - timedelta(days=30)).strftime("%Y-%m-%d")

    inv_pipeline = [
        {"$match": {"org_id": org_id, "type": "sale", "invoice_date": {"$gte": last_30}}},
        {"$group": {"_id": None,
                    "count": {"$sum": 1},
                    "total": {"$sum": "$totals.grand_total"},
                    "received": {"$sum": "$amount_received"}}},
    ]
    exp_pipeline = [
        {"$match": {"org_id": org_id, "purchase_date": {"$gte": last_30}}},
        {"$group": {"_id": None, "count": {"$sum": 1}, "total": {"$sum": "$totals.grand_total"}}},
    ]
    top_parties_pipeline = [
        {"$match": {"org_id": org_id, "type": "sale", "invoice_date": {"$gte": last_30}}},
        {"$group": {"_id": "$party_snapshot.name", "total": {"$sum": "$totals.grand_total"}}},
        {"$sort": {"total": -1}}, {"$limit": 5},
    ]
    overdue_pipeline = [
        {"$match": {"org_id": org_id, "type": "sale", "balance_due": {"$gt": 0},
                    "due_date": {"$lt": now.strftime("%Y-%m-%d")}}},
        {"$group": {"_id": None, "count": {"$sum": 1}, "total": {"$sum": "$balance_due"}}},
    ]

    org = await get_org_doc(org_id)
    inv_agg = await db.invoices.aggregate(inv_pipeline).to_list(1)
    exp_agg = await db.purchases.aggregate(exp_pipeline).to_list(1)
    top_parties = await db.invoices.aggregate(top_parties_pipeline).to_list(5)
    overdue = await db.invoices.aggregate(overdue_pipeline).to_list(1)
    invoices_this_month = await db.invoices.count_documents(
        {"org_id": org_id, "type": "sale", "invoice_date": {"$regex": f"^{month_prefix}"}}
    )

    return {
        "business_name": org.get("name"),
        "gstin": org.get("gstin"),
        "today": now.strftime("%d %b %Y"),
        "sales_last_30d": inv_agg[0] if inv_agg else {"count": 0, "total": 0, "received": 0},
        "expenses_last_30d": exp_agg[0] if exp_agg else {"count": 0, "total": 0},
        "invoices_this_month": invoices_this_month,
        "top_customers_30d": top_parties,
        "overdue_invoices": overdue[0] if overdue else {"count": 0, "total": 0},
    }


@api.post("/ai/chat")
async def ai_chat_endpoint(body: AiChatIn, ctx=Depends(get_org_ctx)):
    """Server-Sent Events streaming response."""
    msg = (body.message or "").strip()
    if not msg:
        raise HTTPException(400, "message is required")
    session_id = body.session_id or f"chat-{ctx['org_id']}-{secrets.token_hex(4)}"
    context = await _build_business_context(ctx["org_id"])

    # Persist user msg
    await db.ai_chats.insert_one({
        "id": secrets.token_hex(8), "org_id": ctx["org_id"],
        "user_id": ctx["user"]["id"], "session_id": session_id,
        "role": "user", "content": msg, "timestamp": now_iso(),
    })

    async def event_gen():
        full = ""
        try:
            async for delta in ai_chat_stream(session_id=session_id, user_text=msg,
                                              business_context=context):
                full += delta
                # SSE frame
                yield f"data: {json.dumps({'delta': delta})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
        finally:
            yield f"data: {json.dumps({'done': True})}\n\n"
            # Persist assistant reply
            if full:
                await db.ai_chats.insert_one({
                    "id": secrets.token_hex(8), "org_id": ctx["org_id"],
                    "user_id": ctx["user"]["id"], "session_id": session_id,
                    "role": "assistant", "content": full, "timestamp": now_iso(),
                })

    return StreamingResponse(event_gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@api.get("/ai/chat/history")
async def ai_chat_history(session_id: str, ctx=Depends(get_org_ctx)):
    cursor = db.ai_chats.find({"org_id": ctx["org_id"], "session_id": session_id}).sort("timestamp", 1)
    msgs = [{"role": m["role"], "content": m["content"], "timestamp": m["timestamp"]}
            async for m in cursor]
    return {"session_id": session_id, "messages": msgs}


@api.get("/ai/chat/sessions")
async def ai_chat_sessions(ctx=Depends(get_org_ctx)):
    """Lists distinct chat sessions for the current user — most recent first."""
    pipeline = [
        {"$match": {"org_id": ctx["org_id"], "user_id": ctx["user"]["id"]}},
        {"$sort": {"timestamp": -1}},
        {"$group": {"_id": "$session_id",
                    "last_msg": {"$first": "$content"},
                    "last_role": {"$first": "$role"},
                    "last_at": {"$first": "$timestamp"},
                    "count": {"$sum": 1}}},
        {"$sort": {"last_at": -1}}, {"$limit": 30},
    ]
    out = []
    async for s in db.ai_chats.aggregate(pipeline):
        out.append({"session_id": s["_id"], "last_msg": (s["last_msg"] or "")[:140],
                    "last_role": s["last_role"], "last_at": s["last_at"], "count": s["count"]})
    return out


@api.post("/ai/invoice-draft")
async def ai_invoice_draft(body: dict, ctx=Depends(get_org_ctx)):
    """Extract invoice details from natural language, match parties/products, return a draft."""
    from datetime import datetime, timezone
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "text is required")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    extracted = await ai_extract_invoice(text, today)
    if "error" in extracted:
        raise HTTPException(500, extracted["error"])

    # Try to match party by name
    party_name = extracted.get("party_name", "")
    party = None
    if party_name:
        party = await db.parties.find_one(
            {"org_id": ctx["org_id"], "name": {"$regex": re.escape(party_name), "$options": "i"}},
            {"_id": 0}
        )

    # Try to match each item to a product
    matched_items = []
    for item in (extracted.get("items") or []):
        pname = item.get("name", "")
        prod = None
        if pname:
            prod = await db.products.find_one(
                {"org_id": ctx["org_id"], "name": {"$regex": re.escape(pname), "$options": "i"}},
                {"_id": 0}
            )
        matched_items.append({
            **item,
            "product_id": prod["id"] if prod else "",
            "matched_product_name": prod["name"] if prod else "",
            "rate": item.get("rate") or (prod["sale_price"] if prod else 0),
            "gst_rate": item.get("gst_rate") if item.get("gst_rate") is not None else (prod["gst_rate"] if prod else 18),
            "hsn": item.get("hsn") or (prod["hsn"] if prod else ""),
            "unit": item.get("unit") or (prod["unit"] if prod else "NOS"),
        })

    return {
        "extracted": extracted,
        "party": party,
        "items": matched_items,
        "today": today,
    }


# =========================================================================
# E-INVOICE JSON GENERATOR (auth — schema 1.1 compliant)
# =========================================================================
@api.get("/invoices/{iid}/einvoice")
async def invoice_einvoice_json(iid: str, ctx=Depends(get_org_ctx)):
    inv = await db.invoices.find_one(org_filter(ctx, {"id": iid}), {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    org = await get_org_doc(ctx["org_id"])
    check = einvoice_precheck(inv, org)
    if not check["ok"]:
        return {"ok": False, "errors": check["errors"], "warnings": check["warnings"], "payload": None}
    payload = build_einvoice_json(inv, org)
    return {"ok": True, "errors": [], "warnings": check["warnings"], "payload": payload}


@api.post("/invoices/{iid}/eway-bill")
async def invoice_eway_bill(iid: str, body: dict, ctx=Depends(get_org_ctx)):
    """Generate E-Way Bill JSON payload (NIC format) for a sales invoice."""
    inv = await db.invoices.find_one(org_filter(ctx, {"id": iid}), {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    org = await get_org_doc(ctx["org_id"])

    errors = []
    warnings = []
    party = inv.get("party_snapshot", {})

    if not org.get("gstin"):      errors.append("Your GSTIN is missing — add it in Settings")
    if not party.get("gstin"):
        # NIC expects "URP" for an unregistered (B2C) recipient — an e-way bill is still required
        warnings.append("Customer has no GSTIN — filing as URP (unregistered person)")
    if not party.get("state_code"): warnings.append("Customer state code missing — place of supply may be wrong")
    totals = inv.get("totals", {})
    grand = totals.get("grand_total", 0)
    if grand < 50000:
        warnings.append(f"E-Way Bill is optional for amounts below ₹50,000 (this invoice: ₹{grand:,.2f})")
    if not body.get("distance"):  errors.append("Distance (km) is required")

    if errors:
        return {"ok": False, "errors": errors, "warnings": warnings, "payload": None}

    import datetime as _dt
    inv_date = inv.get("invoice_date", _dt.date.today().isoformat())
    # Format date as DD/MM/YYYY for NIC
    def _fmt(d):
        try: return _dt.date.fromisoformat(d).strftime("%d/%m/%Y")
        except: return d

    trans_doc_date = body.get("transDocDate", inv_date)

    # Build item list
    items = []
    for it in inv.get("items", []):
        gst = it.get("gst_rate", 0)
        same_state = (org.get("state_code", "33") == party.get("state_code", "33"))
        taxable = it.get("qty", 0) * it.get("rate", 0) * (1 - (it.get("discount_pct", 0) / 100))
        items.append({
            "productName": it.get("name", ""),
            "hsnCode": str(it.get("hsn", "") or ""),
            "quantity": it.get("qty", 0),
            "qtyUnit": it.get("unit", "NOS"),
            "taxableAmount": round(taxable, 2),
            "sgstRate": round(gst / 2, 2) if same_state else 0,
            "cgstRate": round(gst / 2, 2) if same_state else 0,
            "igstRate": gst if not same_state else 0,
            "cessRate": 0,
        })

    payload = {
        "supplyType": body.get("supplyType", "O"),
        "subSupplyType": body.get("subSupplyType", "1"),
        "docType": "INV",
        "docNo": inv.get("invoice_no", ""),
        "docDate": _fmt(inv_date),
        "fromGstin": org.get("gstin", ""),
        "fromTrdName": org.get("name", ""),
        "fromAddr1": org.get("address", ""),
        "fromStateCode": org.get("state_code", "33"),
        "toGstin": party.get("gstin") or "URP",
        "toTrdName": party.get("name", ""),
        "toAddr1": party.get("billing_address", ""),
        "toStateCode": party.get("state_code", "33"),
        "totalValue": round(totals.get("grand_total", 0), 2),
        "cgstValue": round(totals.get("cgst", 0), 2),
        "sgstValue": round(totals.get("sgst", 0), 2),
        "igstValue": round(totals.get("igst", 0), 2),
        "cessValue": 0,
        "cessNonAdvolValue": 0,
        "otherValue": round(totals.get("shipping", 0) + totals.get("adj", 0), 2),
        "totInvValue": round(totals.get("grand_total", 0), 2),
        "transMode": body.get("transMode", "1"),
        "transDistance": str(body.get("distance", "")),
        "transporterName": body.get("transName", ""),
        "transporterId": "",
        "transDocNo": body.get("transDocNo", ""),
        "transDocDate": _fmt(trans_doc_date),
        "vehicleNo": body.get("vehNo", ""),
        "vehicleType": body.get("vehType", "R"),
        "itemList": items,
    }

    return {"ok": True, "errors": [], "warnings": warnings, "payload": payload}


@api.get("/billing/status")
async def billing_status(ctx=Depends(get_org_ctx)):
    org = await get_org_doc(ctx["org_id"])
    payer = await billing_org_for(org)
    summary = await effective_subscription(org)
    summary["limits"] = get_plan_limits(payer.get("plan_code") or "FREE")
    summary["usage"] = await org_usage(db, ctx["org_id"])
    return summary


@api.post("/billing/subscribe")
async def subscribe(body: SubscribeIn, request: Request, ctx=Depends(require_roles("owner"))):
    if body.plan_code not in PLANS:
        raise HTTPException(400, "Invalid plan")
    plan = PLANS[body.plan_code]
    if plan.get("interval") == "custom" or plan["amount"] <= 0:
        raise HTTPException(400, "This plan requires contacting sales — no online checkout available.")
    org = await get_org_doc(ctx["org_id"])
    user = ctx["user"]
    sub_id = f"sub_{ctx['org_id']}_{int(now_dt().timestamp())}"
    creds = await get_cashfree_credentials(db)

    if creds["is_mock"]:
        # MOCK: create a fake auth link served by us; success endpoint flips status.
        # If the org is still in an active/trialing state, KEEP that status while the
        # checkout is in-flight so the user doesn't lose access mid-flow.
        origin = request.headers.get("Origin", "")
        auth_link = f"{origin}/billing/mock-checkout?sub_id={sub_id}&plan={plan['code']}"
        current_status = org.get("subscription_status", "trialing")
        next_status = current_status if current_status in ("trialing", "active") else "pending_authorisation"
        await db.organizations.update_one(
            {"id": ctx["org_id"]},
            {"$set": {"cashfree_subscription_id": sub_id, "plan_code": plan["code"],
                      "subscription_status": next_status}},
        )
        return {"subscription_id": sub_id, "auth_link": auth_link, "mode": "mock"}

    # REAL Cashfree call (subscription create) — uses DB-stored credentials
    headers = {
        "x-client-id": creds["client_id"],
        "x-client-secret": creds["client_secret"],
        "x-api-version": CASHFREE_API_VERSION,
        "Content-Type": "application/json",
    }
    first_charge_date = (now_dt() + timedelta(days=7)).strftime("%Y-%m-%d")
    payload = {
        "subscription_id": sub_id,
        "plan": {
            "plan_type": "PERIODIC", "plan_name": plan["code"],
            "plan_amount": plan["amount"], "plan_currency": "INR",
            "interval_unit": "MONTH" if plan["interval"] == "month" else "YEAR",
            "interval_count": 1,
        },
        "customer_details": {
            "customer_id": f"org-{ctx['org_id']}",
            "customer_email": user["email"],
            "customer_phone": org.get("phone") or "9999999999",
        },
        "first_charge_date": first_charge_date,
        "auth_config": {"return_url": f"{os.environ.get('BACKEND_PUBLIC_URL','')}/api/billing/return"},
    }
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{creds['base_url']}/subscriptions", headers=headers, json=payload)
    if r.status_code >= 400:
        logger.error("Cashfree error: %s %s", r.status_code, r.text)
        raise HTTPException(502, "Cashfree subscription creation failed")
    data = r.json()
    auth_link = data.get("auth_link") or data.get("subscription_url")
    current_status = org.get("subscription_status", "trialing")
    next_status = current_status if current_status in ("trialing", "active") else "pending_authorisation"
    await db.organizations.update_one(
        {"id": ctx["org_id"]},
        {"$set": {"cashfree_subscription_id": data.get("subscription_id", sub_id),
                  "plan_code": plan["code"], "subscription_status": next_status}},
    )
    return {"subscription_id": data.get("subscription_id", sub_id), "auth_link": auth_link, "mode": "cashfree"}


@api.post("/billing/mock-activate")
async def mock_activate(ctx=Depends(require_permission("billing.manage"))):
    """Activate the subscription in MOCK mode (called after fake checkout)."""
    org = await get_org_doc(ctx["org_id"])
    plan_code = org.get("plan_code") or "MONTHLY_199"
    plan = PLANS[plan_code]
    period_end = now_dt() + timedelta(days=365 if plan["interval"] == "year" else 30)
    await db.organizations.update_one(
        {"id": ctx["org_id"]},
        {"$set": {"subscription_status": "active",
                  "current_period_end": period_end.isoformat()}},
    )
    org = await get_org_doc(ctx["org_id"])
    return subscription_status_summary(org)


@api.post("/billing/cancel")
async def cancel_subscription(ctx=Depends(require_permission("billing.manage"))):
    await db.organizations.update_one(
        {"id": ctx["org_id"]},
        {"$set": {"subscription_status": "cancelled"}},
    )
    return {"ok": True}


@api.post("/billing/webhook")
async def cashfree_webhook(request: Request):
    """Cashfree subscription webhook with HMAC-SHA256 verification."""
    timestamp = request.headers.get("x-webhook-timestamp", "")
    signature = request.headers.get("x-webhook-signature", "")
    raw = await request.body()
    creds = await get_cashfree_credentials(db)
    if not creds["is_mock"] and creds["client_secret"]:
        expected = base64.b64encode(
            hmac.new(creds["client_secret"].encode(), (timestamp.encode() + raw),
                     hashlib.sha256).digest()
        ).decode()
        if not hmac.compare_digest(expected, signature):
            raise HTTPException(400, "Invalid signature")
    payload = json.loads(raw or b"{}")
    data = payload.get("data", {})
    sub_id = data.get("subscription_id") or payload.get("subscription_id")
    event = payload.get("event_type") or payload.get("type", "")
    if not sub_id:
        return {"ok": True}
    org = await db.organizations.find_one({"cashfree_subscription_id": sub_id}, {"_id": 0, "id": 1, "plan_code": 1})
    if not org:
        return {"ok": True}
    updates: Dict[str, Any] = {}
    if event in ("SUBSCRIPTION_AUTH_STATUS", "SUBSCRIPTION_PAYMENT_SUCCESS"):
        plan = PLANS.get(org.get("plan_code") or "MONTHLY_199", PLANS["MONTHLY_199"])
        period_end = now_dt() + timedelta(days=365 if plan["interval"] == "year" else 30)
        updates = {"subscription_status": "active", "current_period_end": period_end.isoformat()}
    elif event == "SUBSCRIPTION_PAYMENT_FAILED":
        updates = {"subscription_status": "past_due"}
    elif event == "SUBSCRIPTION_CANCELLED":
        updates = {"subscription_status": "cancelled"}
    if updates:
        await db.organizations.update_one({"id": org["id"]}, {"$set": updates})
    return {"received": True}


# ---------------- ROLES & PERMISSIONS ----------------
class RoleIn(BaseModel):
    name: str
    description: str = ""
    permissions: List[str] = []
    allowed_modes: List[str] = []  # empty = unrestricted; e.g. ["pos","b2c"] locks to POS only


@api.get("/permissions")
async def get_permission_catalogue(ctx=Depends(get_org_ctx)):
    """All available permissions grouped by module — used by the role editor UI."""
    groups: Dict[str, List[str]] = {}
    for p in PERMISSIONS:
        module = p.split(".")[0]
        groups.setdefault(module, []).append(p)
    return {"permissions": PERMISSIONS, "grouped": groups,
            "system_roles": [{"slug": s, **r} for s, r in SYSTEM_ROLES.items()],
            "your_permissions": sorted(list(ctx["permissions"]))}


@api.get("/roles")
async def list_roles(ctx=Depends(get_org_ctx)):
    await ensure_system_roles(db, ctx["org_id"])
    rows = await db.roles.find(org_filter(ctx), {"_id": 0}).sort("is_system", -1).to_list(100)
    # Member counts per role slug
    counts: Dict[str, int] = {}
    async for m in db.memberships.find({"org_id": ctx["org_id"]}, {"_id": 0, "role": 1}):
        counts[m["role"]] = counts.get(m["role"], 0) + 1
    for r in rows:
        r["member_count"] = counts.get(r["slug"], 0)
    return rows


@api.post("/roles")
async def create_role(body: RoleIn, request: Request, ctx=Depends(require_permission("role.manage"))):
    slug = body.name.lower().replace(" ", "-")[:40] + "-" + secrets.token_hex(3)
    doc = {
        "id": str(uuid.uuid4()), "org_id": ctx["org_id"],
        "slug": slug, "name": body.name, "description": body.description,
        "permissions": [p for p in body.permissions if p in PERMISSIONS or p == "*" or p.endswith(".*")],
        "allowed_modes": [m for m in body.allowed_modes if m in ("b2b", "b2c", "restaurant", "pos", "stay")],
        "is_system": False, "created_at": now_iso(),
    }
    await db.roles.insert_one(doc)
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="role.created",
                    entity_type="role", entity_id=slug,
                    metadata={"name": body.name, "permissions": doc["permissions"]}, request=request)
    return strip_id(doc)


@api.put("/roles/{slug}")
async def update_role(slug: str, body: RoleIn, request: Request,
                       ctx=Depends(require_permission("role.manage"))):
    role = await db.roles.find_one(org_filter(ctx, {"slug": slug}))
    if not role:
        raise HTTPException(404, "Role not found")
    # system roles can be customized per-org
    new_perms = [p for p in body.permissions if p in PERMISSIONS or p == "*" or p.endswith(".*")]
    new_modes = [m for m in body.allowed_modes if m in ("b2b", "b2c", "restaurant", "pos", "stay")]
    await db.roles.update_one({"_id": role["_id"]},
                               {"$set": {"name": body.name, "description": body.description,
                                         "permissions": new_perms, "allowed_modes": new_modes}})
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="role.updated",
                    entity_type="role", entity_id=slug,
                    metadata={"name": body.name, "permissions": new_perms}, request=request)
    return await db.roles.find_one({"_id": role["_id"]}, {"_id": 0})


@api.delete("/roles/{slug}")
async def delete_role(slug: str, request: Request, ctx=Depends(require_permission("role.manage"))):
    role = await db.roles.find_one(org_filter(ctx, {"slug": slug}))
    if not role:
        raise HTTPException(404, "Not found")
    if role.get("is_system"):
        raise HTTPException(400, "Cannot delete system roles")
    in_use = await db.memberships.count_documents({"org_id": ctx["org_id"], "role": slug})
    if in_use:
        raise HTTPException(400, f"{in_use} member(s) still use this role. Reassign first.")
    await db.roles.delete_one({"_id": role["_id"]})
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="role.deleted",
                    entity_type="role", entity_id=slug, request=request)
    return {"ok": True}


# ---------------- AUDIT LOGS ----------------
@api.get("/audit-logs")
async def list_audit_logs(action: Optional[str] = None, limit: int = 200,
                           ctx=Depends(require_permission("audit.view"))):
    q = org_filter(ctx)
    if action: q["action"] = action
    items = await db.audit_logs.find(q, {"_id": 0}).sort("timestamp", -1).to_list(min(limit, 500))
    return items




# ---------------- BUSINESS (alias for current org) ----------------
@api.get("/business")
async def get_biz(ctx=Depends(get_org_ctx)):
    return await get_org_doc(ctx["org_id"])


@api.put("/business")
async def update_biz(body: OrgUpdateIn, request: Request, ctx=Depends(require_permission("settings.edit"))):
    data = body.model_dump(); data["updated_at"] = now_iso()
    await db.organizations.update_one({"id": ctx["org_id"]}, {"$set": data})
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="settings.updated",
                    entity_type="organization", entity_id=ctx["org_id"], request=request)
    return await db.organizations.find_one({"id": ctx["org_id"]}, {"_id": 0})


@api.post("/business/logo")
async def upload_logo(file: UploadFile = File(...), ctx=Depends(require_permission("settings.edit"))):
    """Upload company logo — stored as base64 in org doc. Max 2 MB."""
    if file.size and file.size > 2 * 1024 * 1024:
        raise HTTPException(413, "Logo must be under 2 MB")
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(413, "Logo must be under 2 MB")
    mime = file.content_type or "image/png"
    if mime not in ("image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"):
        raise HTTPException(415, "Unsupported format — use PNG, JPG, or WebP")
    import base64 as b64mod
    encoded = b64mod.b64encode(content).decode()
    data_uri = f"data:{mime};base64,{encoded}"
    await db.organizations.update_one(
        {"id": ctx["org_id"]},
        {"$set": {"logo_b64": data_uri, "updated_at": now_iso()}}
    )
    return {"ok": True, "logo_b64": data_uri}


@api.delete("/business/logo")
async def delete_logo(ctx=Depends(require_permission("settings.edit"))):
    await db.organizations.update_one({"id": ctx["org_id"]}, {"$set": {"logo_b64": "", "updated_at": now_iso()}})
    return {"ok": True}


@api.post("/business/signature")
async def upload_signature(file: UploadFile = File(...), ctx=Depends(require_permission("settings.edit"))):
    """Upload authorized signature image — stored as base64 in org doc. Max 2 MB."""
    if file.size and file.size > 2 * 1024 * 1024:
        raise HTTPException(413, "Signature image must be under 2 MB")
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(413, "Signature image must be under 2 MB")
    mime = file.content_type or "image/png"
    if mime not in ("image/png", "image/jpeg", "image/jpg", "image/webp"):
        raise HTTPException(415, "Unsupported format — use PNG or JPG")
    import base64 as b64mod
    encoded = b64mod.b64encode(content).decode()
    data_uri = f"data:{mime};base64,{encoded}"
    await db.organizations.update_one(
        {"id": ctx["org_id"]},
        {"$set": {"signature_b64": data_uri, "updated_at": now_iso()}}
    )
    return {"ok": True, "signature_b64": data_uri}


@api.delete("/business/signature")
async def delete_signature(ctx=Depends(require_permission("settings.edit"))):
    await db.organizations.update_one({"id": ctx["org_id"]}, {"$set": {"signature_b64": "", "updated_at": now_iso()}})
    return {"ok": True}


@api.get("/business/upload-token")
async def get_upload_token(ctx=Depends(get_org_ctx)):
    """Return the stable upload token for this org's mobile quick-upload link."""
    token = _make_upload_token(ctx["org_id"])
    return {"token": token}


# ---------------- PARTIES ----------------
async def compute_party_balance(pid: str, org_id: str) -> float:
    party = await db.parties.find_one({"id": pid, "org_id": org_id}, {"_id": 0})
    if not party:
        return 0
    bal = party.get("opening_balance", 0)
    if party["type"] == "customer":
        inv_agg = await db.invoices.aggregate([
            {"$match": {"party_id": pid, "org_id": org_id}},
            {"$group": {"_id": None, "total": {"$sum": "$totals.grand_total"}}},
        ]).to_list(1)
        pay_agg = await db.payments.aggregate([
            {"$match": {"party_id": pid, "org_id": org_id, "direction": "received"}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]).to_list(1)
        bal += (inv_agg[0]["total"] if inv_agg else 0)
        bal -= (pay_agg[0]["total"] if pay_agg else 0)
    else:
        pur_agg = await db.purchases.aggregate([
            {"$match": {"party_id": pid, "org_id": org_id}},
            {"$group": {"_id": None, "total": {"$sum": "$totals.grand_total"}}},
        ]).to_list(1)
        pay_agg = await db.payments.aggregate([
            {"$match": {"party_id": pid, "org_id": org_id, "direction": "paid"}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]).to_list(1)
        bal += (pur_agg[0]["total"] if pur_agg else 0)
        bal -= (pay_agg[0]["total"] if pay_agg else 0)
    return round(bal, 2)


async def bulk_party_balances(org_id: str, parties: List[dict]) -> Dict[str, float]:
    """One-shot aggregation: returns {party_id: balance} for all parties in `parties`."""
    out: Dict[str, float] = {p["id"]: p.get("opening_balance", 0) for p in parties}
    cust_ids = [p["id"] for p in parties if p["type"] == "customer"]
    supp_ids = [p["id"] for p in parties if p["type"] == "supplier"]
    if cust_ids:
        async for r in db.invoices.aggregate([
            {"$match": {"org_id": org_id, "party_id": {"$in": cust_ids}}},
            {"$group": {"_id": "$party_id", "total": {"$sum": "$totals.grand_total"}}},
        ]):
            out[r["_id"]] = out.get(r["_id"], 0) + r["total"]
        async for r in db.payments.aggregate([
            {"$match": {"org_id": org_id, "party_id": {"$in": cust_ids}, "direction": "received"}},
            {"$group": {"_id": "$party_id", "total": {"$sum": "$amount"}}},
        ]):
            out[r["_id"]] = out.get(r["_id"], 0) - r["total"]
    if supp_ids:
        async for r in db.purchases.aggregate([
            {"$match": {"org_id": org_id, "party_id": {"$in": supp_ids}}},
            {"$group": {"_id": "$party_id", "total": {"$sum": "$totals.grand_total"}}},
        ]):
            out[r["_id"]] = out.get(r["_id"], 0) + r["total"]
        async for r in db.payments.aggregate([
            {"$match": {"org_id": org_id, "party_id": {"$in": supp_ids}, "direction": "paid"}},
            {"$group": {"_id": "$party_id", "total": {"$sum": "$amount"}}},
        ]):
            out[r["_id"]] = out.get(r["_id"], 0) - r["total"]
    return {k: round(v, 2) for k, v in out.items()}


class PartyParseIn(BaseModel):
    text: str = ""
    file_b64: str = ""   # data URL or raw base64 of an image / PDF
    media_type: str = ""

@api.post("/parties/ai-parse")
async def ai_parse_party_endpoint(body: PartyParseIn, ctx=Depends(get_org_ctx)):
    """Extract party (supplier/customer) fields from text, an image, or a PDF using AI."""
    if not body.text.strip() and not body.file_b64:
        raise HTTPException(400, "Provide text or a file")
    if len(body.file_b64) > 7_000_000:  # ~5 MB file after base64 overhead
        raise HTTPException(413, "File must be under 5 MB")
    try:
        return await ai_parse_party(body.text, body.file_b64, body.media_type)
    except Exception as e:
        logging.exception("party ai-parse failed")
        raise HTTPException(502, f"AI extraction failed: {str(e)[:120]}")

@api.get("/parties")
async def list_parties(type: Optional[str] = None, search: Optional[str] = None, ctx=Depends(get_org_ctx)):
    q = biz_filter(ctx)
    if type: q["type"] = type
    if search: q["name"] = {"$regex": search, "$options": "i"}
    items = await db.parties.find(q, {"_id": 0}).sort("name", 1).to_list(500)
    balances = await bulk_party_balances(ctx["org_id"], items)
    for p in items:
        p["balance"] = balances.get(p["id"], p.get("opening_balance", 0))
    return items


@api.post("/parties")
async def create_party(body: PartyIn, ctx=Depends(get_org_ctx)):
    await ensure_active_subscription(ctx)
    data = body.model_dump()
    data["shipping_addresses"] = normalise_shipping(data.get("shipping_addresses"))
    doc = {**data, "id": str(uuid.uuid4()),
           "org_id": ctx["org_id"], "biz_type": ctx.get("biz_type"), "created_at": now_iso()}
    await db.parties.insert_one(doc)
    return strip_id(doc)


@api.get("/parties/{pid}")
async def get_party(pid: str, ctx=Depends(get_org_ctx)):
    p = await db.parties.find_one(org_filter(ctx, {"id": pid}), {"_id": 0})
    if not p: raise HTTPException(404, "Not found")
    p["balance"] = await compute_party_balance(pid, ctx["org_id"])
    return p


@api.put("/parties/{pid}")
async def update_party(pid: str, body: PartyIn, ctx=Depends(get_org_ctx)):
    await ensure_active_subscription(ctx)
    data = body.model_dump()
    data["shipping_addresses"] = normalise_shipping(data.get("shipping_addresses"))
    await db.parties.update_one(org_filter(ctx, {"id": pid}), {"$set": data})
    return await db.parties.find_one(org_filter(ctx, {"id": pid}), {"_id": 0})


@api.delete("/parties/{pid}")
async def delete_party(pid: str, ctx=Depends(require_permission("party.delete"))):
    await db.parties.delete_one(org_filter(ctx, {"id": pid}))
    return {"ok": True}


@api.get("/parties/{pid}/ledger")
async def party_ledger(pid: str, ctx=Depends(get_org_ctx)):
    party = await db.parties.find_one(org_filter(ctx, {"id": pid}), {"_id": 0})
    if not party: raise HTTPException(404, "Not found")
    txns = []
    if party["type"] == "customer":
        async for i in db.invoices.find(org_filter(ctx, {"party_id": pid}), {"_id": 0}):
            txns.append({"date": i["invoice_date"], "type": "Invoice", "ref": i["invoice_no"],
                         "debit": i["totals"]["grand_total"], "credit": 0, "id": i["id"]})
        async for p in db.payments.find(org_filter(ctx, {"party_id": pid, "direction": "received"}), {"_id": 0}):
            txns.append({"date": p["date"], "type": "Payment", "ref": p.get("reference", ""),
                         "debit": 0, "credit": p["amount"], "id": p["id"]})
    else:
        async for i in db.purchases.find(org_filter(ctx, {"party_id": pid}), {"_id": 0}):
            txns.append({"date": i["purchase_date"], "type": "Bill", "ref": i["bill_no"],
                         "debit": 0, "credit": i["totals"]["grand_total"], "id": i["id"]})
        async for p in db.payments.find(org_filter(ctx, {"party_id": pid, "direction": "paid"}), {"_id": 0}):
            txns.append({"date": p["date"], "type": "Payment", "ref": p.get("reference", ""),
                         "debit": p["amount"], "credit": 0, "id": p["id"]})
    txns.sort(key=lambda x: x["date"])
    bal = party.get("opening_balance", 0)
    for t in txns:
        bal += t["debit"] - t["credit"]; t["balance"] = round(bal, 2)
    return {"party": party, "transactions": txns, "balance": round(bal, 2)}


# ---------------- PRODUCTS ----------------
VALID_MODES = ("b2b", "b2c", "restaurant", "pos", "stay")


def product_mode_query(ctx: dict, mode: Optional[str]) -> dict:
    """Mongo filter restricting products to what this user may see.

    - Restricted users (role has allowed_modes): only products explicitly tagged
      with one of their modes. Untagged products are hidden from them.
    - Unrestricted users (owner etc.): mode="all" shows everything; an explicit
      mode shows that mode; no mode follows the active business profile
      (X-Biz-Type / entity). Untagged legacy products stay visible to them.
    """
    allowed = ctx.get("allowed_modes") or []
    req = (mode or "").strip().lower()
    if allowed:
        if req not in allowed:
            bt = ctx.get("biz_type")
            req = bt if bt in allowed else ""
        return {"modes": req} if req else {"modes": {"$in": allowed}}
    if not req:
        req = ctx.get("biz_type") or ""
    if req and req != "all":
        return {"$or": [{"modes": req}, {"modes": {"$exists": False}}, {"modes": []}]}
    return {}


async def get_accessible_product(ctx: dict, pid: str, projection: Optional[dict] = None) -> dict:
    q = org_filter(ctx, {"id": pid})
    if ctx.get("allowed_modes"):
        q.update(product_mode_query(ctx, "all"))  # any of the user's modes
    doc = await db.products.find_one(q, projection or {"_id": 0})
    if not doc:
        raise HTTPException(404, "Product not found")
    return doc


@api.get("/products")
async def list_products(search: Optional[str] = None, mode: Optional[str] = None, ctx=Depends(get_org_ctx)):
    q = org_filter(ctx)
    if search: q["name"] = {"$regex": search, "$options": "i"}
    q.update(product_mode_query(ctx, mode))
    return await db.products.find(q, {"_id": 0}).sort("name", 1).to_list(1000)


@api.post("/products")
async def create_product(body: ProductIn, ctx=Depends(get_org_ctx)):
    await ensure_active_subscription(ctx)
    data = body.model_dump()
    allowed = ctx.get("allowed_modes") or []
    modes = [m for m in (data.get("modes") or []) if m in VALID_MODES]
    if allowed:
        modes = [m for m in modes if m in allowed] or [ctx.get("biz_type") if ctx.get("biz_type") in allowed else allowed[0]]
    data["modes"] = modes
    doc = {**data, "id": str(uuid.uuid4()),
           "org_id": ctx["org_id"], "created_at": now_iso()}
    await db.products.insert_one(doc)
    return strip_id(doc)


# Registered before /products/{pid}: FastAPI matches routes in order, so
# otherwise 'bulk-modes' is captured as a product id and fails validation (422).
class BulkModesIn(BaseModel):
    ids: List[str]
    modes: List[str]

@api.put("/products/bulk-modes")
async def bulk_update_product_modes(body: BulkModesIn, ctx=Depends(get_org_ctx)):
    """Set the `modes` field (business types) for multiple products at once."""
    await ensure_active_subscription(ctx)
    if ctx.get("allowed_modes"):
        raise HTTPException(403, "Only users with access to all business profiles can change product profiles")
    valid_modes = set(VALID_MODES)
    modes = [m for m in body.modes if m in valid_modes]
    result = await db.products.update_many(
        org_filter(ctx, {"id": {"$in": body.ids}}),
        {"$set": {"modes": modes, "updated_at": now_iso()}}
    )
    return {"ok": True, "updated": result.modified_count}


@api.put("/products/{pid}")
async def update_product(pid: str, body: ProductIn, ctx=Depends(get_org_ctx)):
    await ensure_active_subscription(ctx)
    current = await get_accessible_product(ctx, pid, {"_id": 0, "modes": 1})
    update_data = body.model_dump()
    allowed = ctx.get("allowed_modes") or []
    if allowed:
        # Restricted users can only change tags inside their own profiles
        existing = [m for m in (current.get("modes") or []) if m in VALID_MODES]
        kept = [m for m in existing if m not in allowed]
        mine = [m for m in (update_data.get("modes") or []) if m in allowed]
        update_data["modes"] = (kept + mine) or existing
    # Never overwrite an existing UPC with empty — UPC is permanent once set
    if not update_data.get("upc"):
        existing = await db.products.find_one(org_filter(ctx, {"id": pid}), {"_id": 0, "upc": 1})
        if existing and existing.get("upc"):
            update_data["upc"] = existing["upc"]
    await db.products.update_one(org_filter(ctx, {"id": pid}), {"$set": update_data})
    return await db.products.find_one(org_filter(ctx, {"id": pid}), {"_id": 0})


@api.delete("/products/{pid}")
async def delete_product(pid: str, ctx=Depends(require_permission("product.delete"))):
    await get_accessible_product(ctx, pid, {"_id": 0, "id": 1})
    await db.products.delete_one(org_filter(ctx, {"id": pid}))
    return {"ok": True}


# ---------------- INVOICES ----------------

@api.get("/invoices/next-number")
async def get_next_invoice_number(ctx=Depends(get_org_ctx)):
    """Return the next auto-generated invoice number for this org."""
    num = await next_invoice_number(ctx["org_id"])
    return {"next": num}

@api.get("/invoices/customer-ytd/{party_id}")
async def customer_ytd(party_id: str, ctx=Depends(get_org_ctx)):
    """Return this customer's YTD sales (grand_total) for TDS applicability check."""
    import datetime as _dt
    today = _dt.date.today()
    fy_start = _dt.date(today.year if today.month >= 4 else today.year - 1, 4, 1)
    pipeline = [
        {"$match": {**biz_filter(ctx), "party_id": party_id,
                    "invoice_date": {"$gte": fy_start.isoformat()},
                    "type": {"$in": ["invoice", "b2c"]}}},
        {"$group": {"_id": None, "ytd": {"$sum": "$totals.grand_total"}}},
    ]
    result = await db.invoices.aggregate(pipeline).to_list(1)
    ytd_in_system = result[0]["ytd"] if result else 0.0
    party = await db.parties.find_one(org_filter(ctx, {"id": party_id}), {"_id": 0, "tds_opening_balance": 1})
    opening = float((party or {}).get("tds_opening_balance") or 0)
    ytd_total = ytd_in_system + opening
    TDS_THRESHOLD = 5_000_000
    return {
        "party_id": party_id,
        "ytd_in_system": round(ytd_in_system, 2),
        "tds_opening_balance": round(opening, 2),
        "ytd_total": round(ytd_total, 2),
        "tds_applicable": ytd_total >= TDS_THRESHOLD,
        "threshold": TDS_THRESHOLD,
        "remaining_to_threshold": max(0, round(TDS_THRESHOLD - ytd_total, 2)),
    }


@api.get("/invoices")
async def list_invoices(status: Optional[str] = None, type: Optional[str] = None,
                        party_id: Optional[str] = None, ctx=Depends(get_org_ctx)):
    q = biz_filter(ctx)
    if status: q["status"] = status
    if type: q["type"] = type
    if party_id: q["party_id"] = party_id
    items = await db.invoices.find(q, {"_id": 0}).sort("invoice_date", -1).to_list(500)
    if not items: return items
    # Bulk fetch party names
    party_ids = list({i["party_id"] for i in items})
    parties = {p["id"]: p["name"] async for p in db.parties.find(
        {"id": {"$in": party_ids}, "org_id": ctx["org_id"]}, {"_id": 0, "id": 1, "name": 1})}
    # Bulk aggregate paid amounts per invoice
    inv_ids = [i["id"] for i in items]
    paid_map: Dict[str, float] = {}
    async for r in db.payments.aggregate([
        {"$match": {"org_id": ctx["org_id"], "invoice_id": {"$in": inv_ids}}},
        {"$group": {"_id": "$invoice_id", "total": {"$sum": "$amount"}}},
    ]):
        paid_map[r["_id"]] = r["total"]
    for i in items:
        i["party_name"] = parties.get(i["party_id"], "—")
        paid = paid_map.get(i["id"], 0)
        i["paid"] = round(paid, 2)
        i["due"] = round(i["totals"]["grand_total"] - paid, 2)
    return items


async def _build_invoice_doc(body: InvoiceIn, ctx: dict, prefix: str) -> dict:
    biz = await get_org_doc(ctx["org_id"])
    party = None
    if body.party_id:
        party = await db.parties.find_one(org_filter(ctx, {"id": body.party_id}), {"_id": 0})
        if not party: raise HTTPException(400, "Party not found")
    if not party:
        party = {"id": "", "name": "Walk-in Customer", "phone": "", "state_code": "33"}
    # Resolve branch — if branch_id given, use that branch's state for GST determination
    branch = None
    seller_state_code = biz.get("state_code", "33")
    if body.branch_id:
        branch = next((b for b in biz.get("branches", []) if b["id"] == body.branch_id), None)
        if branch:
            seller_state_code = branch.get("state_code", seller_state_code)
    same_state = (seller_state_code == party.get("state_code", "33"))
    totals = calc_invoice_totals([i.model_dump() for i in body.items], same_state)
    return {
        "id": str(uuid.uuid4()),
        "org_id": ctx["org_id"],
        "biz_type": ctx.get("biz_type"),
        "invoice_no": await next_invoice_number(ctx["org_id"], prefix),
        "party_id": body.party_id, "party_snapshot": party,
        "invoice_date": body.invoice_date, "due_date": body.due_date,
        "items": totals["items"],
        "totals": {k: v for k, v in totals.items() if k != "items"},
        "notes": body.notes, "status": body.status, "type": body.type,
        "is_recurring": body.is_recurring, "same_state": same_state,
        "branch_id": body.branch_id, "branch_snapshot": branch,
        "invoice_category": getattr(body, "invoice_category", "stock"),
        "shipping_address": getattr(body, "shipping_address", ""),
        "shipping_label": getattr(body, "shipping_label", ""),
        "po_number": getattr(body, "po_number", ""),
        "tds_rate": getattr(body, "tds_rate", 0) or 0,
        "tds_amount": round(getattr(body, "tds_amount", 0) or 0, 2),
        "net_receivable": round((totals.get("grand_total", 0) - (getattr(body, "tds_amount", 0) or 0)), 2),
        "warehouse_id": getattr(body, "warehouse_id", "") or "",
        "created_at": now_iso(),
    }


@api.post("/invoices")
async def create_invoice(body: InvoiceIn, request: Request, ctx=Depends(require_permission("invoice.create"))):
    await ensure_active_subscription(ctx)
    org = await get_org_doc(ctx["org_id"])
    await check_limit(db, org, "invoice")
    prefix = {"sale": "INV", "quotation": "QT", "credit_note": "CN", "sales_return": "SR"}.get(body.type, "INV")
    doc = await _build_invoice_doc(body, ctx, prefix)
    await db.invoices.insert_one(doc)
    # Only deduct stock for stock invoices (not service invoices)
    if body.type == "sale" and body.status == "finalized" and body.invoice_category == "stock":
        party = await db.parties.find_one(org_filter(ctx, {"id": body.party_id}), {"_id": 0, "name": 1})
        party_name = party.get("name", "") if party else ""
        for it in body.items:
            if it.product_id:
                await db.products.update_one(org_filter(ctx, {"id": it.product_id}), {"$inc": {"stock": -it.qty}})
                if body.warehouse_id:
                    await _adjust_warehouse_stock(ctx["org_id"], body.warehouse_id, it.product_id, -it.qty,
                        movement_type="sale", ref_id=doc["id"], ref_no=doc["invoice_no"],
                        party_name=party_name, date=body.invoice_date)
                else:
                    await _log_stock_movement(ctx["org_id"], it.product_id, -it.qty,
                        movement_type="sale", ref_id=doc["id"], ref_no=doc["invoice_no"],
                        party_name=party_name, date=body.invoice_date)
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="invoice.created",
                    entity_type="invoice", entity_id=doc["id"],
                    metadata={"invoice_no": doc["invoice_no"], "total": doc["totals"]["grand_total"]},
                    request=request)
    return strip_id(doc)


@api.get("/invoices/{iid}")
async def get_invoice(iid: str, ctx=Depends(get_org_ctx)):
    inv = await db.invoices.find_one(org_filter(ctx, {"id": iid}), {"_id": 0})
    if not inv: raise HTTPException(404, "Not found")
    paid = 0
    async for p in db.payments.find({"invoice_id": iid, "org_id": ctx["org_id"]}, {"_id": 0, "amount": 1}):
        paid += p["amount"]
    inv["paid"] = round(paid, 2)
    inv["due"] = round(inv["totals"]["grand_total"] - paid, 2)
    return inv


@api.put("/invoices/{iid}")
async def update_invoice(iid: str, body: InvoiceIn, request: Request, ctx=Depends(require_permission("invoice.create"))):
    existing = await db.invoices.find_one(org_filter(ctx, {"id": iid}), {"_id": 0})
    if not existing:
        raise HTTPException(404, "Invoice not found")
    prefix = {"sale": "INV", "quotation": "QT", "credit_note": "CN", "sales_return": "SR"}.get(body.type, "INV")
    doc = await _build_invoice_doc(body, ctx, prefix)
    # Keep original invoice_no and id
    doc["id"] = iid
    doc["invoice_no"] = existing["invoice_no"]
    doc["created_at"] = existing.get("created_at", doc["created_at"])
    doc["updated_at"] = now_iso()
    # Restore old stock if it was a stock sale — then re-deduct new quantities
    if existing.get("type") == "sale" and existing.get("status") == "finalized" and existing.get("invoice_category", "stock") == "stock":
        for it in existing.get("items", []):
            pid = it.get("product_id")
            if pid:
                await db.products.update_one(org_filter(ctx, {"id": pid}), {"$inc": {"stock": it.get("qty", 0)}})
    await db.invoices.replace_one(org_filter(ctx, {"id": iid}), doc)
    if body.type == "sale" and body.status == "finalized" and body.invoice_category == "stock":
        for it in body.items:
            if it.product_id:
                await db.products.update_one(org_filter(ctx, {"id": it.product_id}), {"$inc": {"stock": -it.qty}})
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="invoice.updated",
                    entity_type="invoice", entity_id=iid,
                    metadata={"invoice_no": doc["invoice_no"]}, request=request)
    return strip_id(doc)


class InvoiceStatusIn(BaseModel):
    status: str  # draft | finalized | void | cancelled

@api.patch("/invoices/{iid}/status")
async def change_invoice_status(iid: str, body: InvoiceStatusIn, request: Request, ctx=Depends(require_permission("invoice.create"))):
    allowed = {"draft", "finalized", "void", "cancelled", "dispatched", "delivered", "paid"}
    if body.status not in allowed:
        raise HTTPException(400, f"Status must be one of: {', '.join(allowed)}")
    inv = await db.invoices.find_one(org_filter(ctx, {"id": iid}), {"_id": 0, "invoice_no": 1, "status": 1})
    if not inv: raise HTTPException(404, "Invoice not found")
    await db.invoices.update_one(
        org_filter(ctx, {"id": iid}),
        {"$set": {"status": body.status, "status_changed_at": datetime.utcnow().isoformat()}}
    )
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action=f"invoice.status.{body.status}",
                    entity_type="invoice", entity_id=iid,
                    metadata={"invoice_no": inv.get("invoice_no"), "new_status": body.status}, request=request)
    return {"ok": True, "status": body.status}


@api.patch("/invoices/{iid}/cancel")
async def cancel_invoice(iid: str, request: Request, ctx=Depends(require_permission("invoice.delete"))):
    inv = await db.invoices.find_one(org_filter(ctx, {"id": iid}), {"_id": 0, "invoice_no": 1, "status": 1})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.get("status") == "cancelled":
        raise HTTPException(400, "Invoice is already cancelled")
    await db.invoices.update_one(
        org_filter(ctx, {"id": iid}),
        {"$set": {"status": "cancelled", "cancelled_at": datetime.utcnow().isoformat()}}
    )
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="invoice.cancelled",
                    entity_type="invoice", entity_id=iid,
                    metadata={"invoice_no": inv.get("invoice_no")}, request=request)
    return {"ok": True}


@api.delete("/invoices/{iid}")
async def delete_invoice(iid: str, request: Request, ctx=Depends(require_permission("invoice.delete"))):
    inv = await db.invoices.find_one(org_filter(ctx, {"id": iid}), {"_id": 0, "invoice_no": 1})
    await db.invoices.delete_one(org_filter(ctx, {"id": iid}))
    if inv:
        await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="invoice.deleted",
                        entity_type="invoice", entity_id=iid,
                        metadata={"invoice_no": inv.get("invoice_no")}, request=request)
    return {"ok": True}


@api.post("/invoices/{iid}/convert")
async def convert_quotation(iid: str, ctx=Depends(get_org_ctx)):
    await ensure_active_subscription(ctx)
    q = await db.invoices.find_one(org_filter(ctx, {"id": iid}), {"_id": 0})
    if not q or q.get("type") != "quotation": raise HTTPException(400, "Not a quotation")
    new = {**q, "id": str(uuid.uuid4()),
           "invoice_no": await next_invoice_number(ctx["org_id"], "INV"),
           "type": "sale", "status": "finalized", "created_at": now_iso()}
    await db.invoices.insert_one(new)
    return strip_id(new)


@api.get("/invoices/{iid}/pdf")
async def invoice_pdf(iid: str, ctx=Depends(get_org_ctx)):
    inv = await db.invoices.find_one(org_filter(ctx, {"id": iid}), {"_id": 0})
    if not inv: raise HTTPException(404, "Not found")
    biz = await get_org_doc(ctx["org_id"])
    tmpl = (biz.get("invoice_theme") or {}).get("template", "classic")
    try:
        pdf_bytes = generate_invoice_pdf(inv, biz, template=tmpl)
    except Exception as exc:
        import traceback
        raise HTTPException(500, f"PDF generation failed: {exc}\n{traceback.format_exc()}")
    return StreamingResponse(BytesIO(pdf_bytes), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="{inv["invoice_no"]}.pdf"',
                                      "X-Invoice-No": inv["invoice_no"]})


# ---------------- PURCHASES ----------------
@api.post("/purchases/ai-scan")
async def purchase_ai_scan(file: UploadFile = File(...), ctx=Depends(get_org_ctx)):
    """Scan a vendor invoice image/PDF with AI and extract purchase details."""
    import base64, json as _json, re as _re, io, tempfile, os as _os
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise HTTPException(400, "AI features require ANTHROPIC_API_KEY to be configured")
    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large — max 10 MB")

    PROMPT = """You are an OCR assistant for Indian purchase invoices. Extract all visible details and return ONLY a valid JSON object (no markdown, no explanation):
{"supplier_name":"","gstin":"","bill_no":"","date":"YYYY-MM-DD","eway_bill_no":"","vehicle_no":"","items":[{"name":"","hsn":"","qty":1,"unit":"pcs","rate":0,"gst_rate":0,"amount":0}],"subtotal":0,"gst_amount":0,"total":0,"notes":""}
Rules:
- supplier_name: the seller/vendor name (not the buyer)
- gstin: seller's GSTIN if shown, else ""
- bill_no: invoice/bill number
- date: invoice date in YYYY-MM-DD format
- eway_bill_no: e-Way Bill number if shown (12-digit), else ""
- vehicle_no: vehicle/transport number if shown (e.g. TN34MB4437), else ""
- items: list every line item with:
  - name: product/item description
  - hsn: HSN/SAC code if shown for this item, else ""
  - qty: quantity as a number
  - unit: unit of measure (pcs/kg/nos/bags/qtl/MT/etc)
  - rate: rate per unit BEFORE GST
  - gst_rate: GST percentage as number (e.g. 5, 12, 18, 28) — look for IGST/CGST+SGST rates
  - amount: line total before GST
- subtotal: sum of all line item amounts before GST
- gst_amount: total GST/tax charged
- total: final payable amount
- notes: HSN codes summary, terms, e-way bill details, or any other info
If a field is not visible, leave it empty string or 0. Return ONLY the JSON."""

    import anthropic
    client = anthropic.AsyncAnthropic(api_key=key)

    media_type = (file.content_type or "").lower()
    is_pdf = media_type == "application/pdf" or (file.filename or "").lower().endswith(".pdf")

    if is_pdf:
        # Convert PDF pages to images for reliable visual extraction
        try:
            from pdf2image import convert_from_bytes
            images = convert_from_bytes(raw, dpi=200, fmt="jpeg")
        except Exception as e:
            # pdf2image not available or poppler missing — fall back to document API
            images = None

        if images:
            # Build content with all page images (max 4 pages to stay within limits)
            content = []
            for img in images[:4]:
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=85)
                b64img = base64.standard_b64encode(buf.getvalue()).decode()
                content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64img}})
            content.append({"type": "text", "text": PROMPT})
            msg = await client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=1500,
                messages=[{"role": "user", "content": content}],
            )
        else:
            # Fallback: send PDF as document
            b64 = base64.standard_b64encode(raw).decode("utf-8")
            msg = await client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=1500,
                messages=[{"role": "user", "content": [
                    {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}},
                    {"type": "text", "text": PROMPT},
                ]}],
            )
    else:
        # Image file — send directly
        if media_type not in ("image/jpeg", "image/png", "image/gif", "image/webp"):
            media_type = "image/jpeg"
        b64 = base64.standard_b64encode(raw).decode("utf-8")
        msg = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1500,
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                {"type": "text", "text": PROMPT},
            ]}],
        )

    raw_text = msg.content[0].text.strip()
    m = _re.search(r"\{.*\}", raw_text, _re.DOTALL)
    try:
        result = _json.loads(m.group() if m else raw_text)
    except Exception:
        raise HTTPException(422, "AI could not parse the invoice — please fill manually")
    return result


# ── Quick upload via mobile link ──────────────────────────────────────────────

def _make_upload_token(org_id: str) -> str:
    """Generate a stable, unforgeable upload token for an org."""
    import hmac, hashlib
    secret = os.environ.get("SECRET_KEY", "billingeasy-secret")
    return hmac.new(secret.encode(), org_id.encode(), hashlib.sha256).hexdigest()[:32]

@api.get("/public/upload-token/{token}")
async def validate_upload_token(token: str):
    """Validate upload token and return org info — used by mobile quick-upload page."""
    org = await db.organizations.find_one({"_id": {"$exists": True}}, {"_id": 0, "id": 1, "name": 1})
    # Find org whose token matches
    async for org in db.organizations.find({}, {"_id": 0, "id": 1, "name": 1}):
        if _make_upload_token(org["id"]) == token:
            return {"ok": True, "org_id": org["id"], "org_name": org["name"]}
    raise HTTPException(404, "Invalid upload link")

@api.post("/public/quick-upload/{token}")
async def quick_upload_purchase(token: str, file: UploadFile = File(...)):
    """Mobile quick upload — scan PDF/image with AI and store as a draft purchase.
    No auth needed — token authenticates the org."""
    # Resolve org
    target_org_id = None
    async for org in db.organizations.find({}, {"_id": 0, "id": 1}):
        if _make_upload_token(org["id"]) == token:
            target_org_id = org["id"]
            break
    if not target_org_id:
        raise HTTPException(404, "Invalid upload link")

    import base64, json as _json, re as _re, io
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise HTTPException(400, "AI not configured")

    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large — max 10 MB")

    PROMPT = """You are an OCR assistant for Indian purchase invoices. Extract all visible details and return ONLY a valid JSON object (no markdown, no explanation):
{"supplier_name":"","gstin":"","bill_no":"","date":"YYYY-MM-DD","eway_bill_no":"","vehicle_no":"","items":[{"name":"","hsn":"","qty":1,"unit":"pcs","rate":0,"gst_rate":0,"amount":0}],"subtotal":0,"gst_amount":0,"total":0,"notes":""}
If a field is not visible, leave it empty string or 0. Return ONLY the JSON."""

    import anthropic
    client = anthropic.AsyncAnthropic(api_key=key)
    media_type = (file.content_type or "").lower()
    is_pdf = media_type == "application/pdf" or (file.filename or "").lower().endswith(".pdf")

    if is_pdf:
        try:
            from pdf2image import convert_from_bytes
            images = convert_from_bytes(raw, dpi=200, fmt="jpeg")
            content = []
            for img in images[:4]:
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=85)
                b64img = base64.standard_b64encode(buf.getvalue()).decode()
                content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64img}})
            content.append({"type": "text", "text": PROMPT})
        except Exception:
            b64 = base64.standard_b64encode(raw).decode()
            content = [
                {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}},
                {"type": "text", "text": PROMPT},
            ]
    else:
        if media_type not in ("image/jpeg", "image/png", "image/gif", "image/webp"):
            media_type = "image/jpeg"
        b64 = base64.standard_b64encode(raw).decode()
        content = [
            {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
            {"type": "text", "text": PROMPT},
        ]

    msg = await client.messages.create(
        model="claude-sonnet-4-6", max_tokens=1500,
        messages=[{"role": "user", "content": content}],
    )
    raw_text = msg.content[0].text.strip()
    m = _re.search(r"\{.*\}", raw_text, _re.DOTALL)
    try:
        ai_data = _json.loads(m.group() if m else raw_text)
    except Exception:
        ai_data = {}

    # ── Auto-save: find or create supplier, then save purchase ──────────────
    supplier_name = (ai_data.get("supplier_name") or "").strip() or "Unknown Supplier"
    supplier_gstin = (ai_data.get("gstin") or "").strip().upper()

    # Try to find existing party by GSTIN or name
    party = None
    if supplier_gstin:
        party = await db.parties.find_one({"org_id": target_org_id, "gstin": supplier_gstin}, {"_id": 0})
    if not party:
        party = await db.parties.find_one(
            {"org_id": target_org_id, "name": {"$regex": f"^{_re.escape(supplier_name)}$", "$options": "i"}},
            {"_id": 0}
        )
    # If not found, auto-create the supplier
    if not party:
        from gstin import validate_gstin
        state_code = supplier_gstin[:2] if len(supplier_gstin) >= 2 else "33"
        from gstin import STATE_CODES  # maps code → name
        state_name = STATE_CODES.get(state_code, "Tamil Nadu")
        party = {
            "id": str(uuid.uuid4()), "org_id": target_org_id,
            "name": supplier_name, "gstin": supplier_gstin,
            "phone": "", "email": "", "role": "supplier",
            "state": state_name, "state_code": state_code,
            "opening_balance": 0, "credit_limit": 0,
            "billing_address": "", "shipping_address": "",
            "created_at": now_iso(), "source": "quick_upload_auto",
        }
        await db.parties.insert_one(party)

    # Build line items
    raw_items = ai_data.get("items") or []
    if not raw_items:
        raw_items = [{"name": file.filename or "Purchase", "hsn": "", "qty": 1, "unit": "NOS", "rate": ai_data.get("subtotal", 0) or ai_data.get("total", 0), "gst_rate": 0}]

    biz = await db.organizations.find_one({"id": target_org_id}, {"_id": 0, "state_code": 1}) or {}
    seller_state = biz.get("state_code", "33")
    same_state = seller_state == party.get("state_code", "33")

    items_for_calc = [
        {
            "product_id": "",
            "name": it.get("name", "Item"),
            "hsn": it.get("hsn", ""),
            "qty": float(it.get("qty") or 1),
            "unit": it.get("unit", "NOS"),
            "rate": float(it.get("rate") or it.get("amount") or 0),
            "discount_pct": 0,
            "gst_rate": float(it.get("gst_rate") or 0),
        }
        for it in raw_items
    ]
    totals = calc_invoice_totals(items_for_calc, same_state)

    bill_date = ai_data.get("date") or now_iso()[:10]
    bill_no = ai_data.get("bill_no") or f"QU-{str(uuid.uuid4())[:8].upper()}"

    purchase_doc = {
        "id": str(uuid.uuid4()), "org_id": target_org_id,
        "party_id": party["id"], "party_snapshot": party,
        "po_no": await next_invoice_number(target_org_id, "PO"),
        "bill_no": bill_no, "purchase_date": bill_date,
        "items": totals["items"],
        "totals": {k: v for k, v in totals.items() if k != "items"},
        "notes": ai_data.get("notes", ""),
        "type": "purchase", "same_state": same_state,
        "branch_id": "", "branch_snapshot": None,
        "eway_bill_no": ai_data.get("eway_bill_no", ""),
        "vehicle_no": ai_data.get("vehicle_no", ""),
        "purchase_category": "stock",
        "source": "quick_upload",
        "status": "draft",
        "created_at": now_iso(),
    }
    await db.purchases.insert_one(purchase_doc)

    return {
        "ok": True,
        "saved": True,
        "purchase_id": purchase_doc["id"],
        "bill_no": bill_no,
        "supplier": supplier_name,
        "total": totals.get("grand_total", 0),
        "ai_data": ai_data,
    }

@api.get("/purchase-uploads")
async def list_purchase_uploads(ctx=Depends(get_org_ctx)):
    """List pending quick-upload purchase drafts for this org."""
    items = await db.purchase_uploads.find(
        {"org_id": ctx["org_id"], "status": "pending_review"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return items

@api.delete("/purchase-uploads/{uid}")
async def dismiss_purchase_upload(uid: str, ctx=Depends(get_org_ctx)):
    await db.purchase_uploads.update_one(
        {"id": uid, "org_id": ctx["org_id"]},
        {"$set": {"status": "dismissed"}}
    )
    return {"ok": True}


@api.get("/purchases/vendor-ytd/{party_id}")
async def vendor_ytd(party_id: str, ctx=Depends(get_org_ctx)):
    """Return this vendor's YTD purchases + TDS applicability (respects opening balance for migrations)."""
    import datetime as _dt
    today = _dt.date.today()
    fy_start = _dt.date(today.year if today.month >= 4 else today.year - 1, 4, 1)
    pipeline = [
        {"$match": {**biz_filter(ctx), "party_id": party_id,
                    "purchase_date": {"$gte": fy_start.isoformat()},
                    "type": "purchase"}},
        {"$group": {"_id": None, "ytd": {"$sum": "$totals.grand_total"}}},
    ]
    result = await db.purchases.aggregate(pipeline).to_list(1)
    ytd_in_system = result[0]["ytd"] if result else 0.0
    # Get opening balance (purchases before migration) from party record
    party = await db.parties.find_one(org_filter(ctx, {"id": party_id}), {"_id": 0, "tds_opening_balance": 1})
    opening = float((party or {}).get("tds_opening_balance") or 0)
    ytd_total = ytd_in_system + opening
    TDS_THRESHOLD = 5_000_000  # ₹50 Lakhs
    return {
        "party_id": party_id,
        "ytd_in_system": round(ytd_in_system, 2),
        "tds_opening_balance": round(opening, 2),
        "ytd_total": round(ytd_total, 2),
        "tds_applicable": ytd_total >= TDS_THRESHOLD,
        "threshold": TDS_THRESHOLD,
        "remaining_to_threshold": max(0, round(TDS_THRESHOLD - ytd_total, 2)),
    }


@api.get("/purchases")
async def list_purchases(ctx=Depends(get_org_ctx)):
    items = await db.purchases.find(biz_filter(ctx), {"_id": 0}).sort("purchase_date", -1).to_list(500)
    if not items: return items
    party_ids = list({i["party_id"] for i in items})
    pmap = {p["id"]: p["name"] async for p in db.parties.find(
        {"id": {"$in": party_ids}, "org_id": ctx["org_id"]}, {"_id": 0, "id": 1, "name": 1})}
    for i in items:
        i["party_name"] = pmap.get(i["party_id"], "\u2014")

    # Assign system PO numbers to purchases created before PO numbering existed
    missing = sorted((i for i in items if not i.get("po_no")),
                     key=lambda i: (i.get("purchase_date") or "", i.get("created_at") or ""))
    for i in missing:
        po_no = await next_invoice_number(ctx["org_id"], "PO")
        res = await db.purchases.update_one(
            {"org_id": ctx["org_id"], "id": i["id"], "po_no": {"$in": [None, ""]}},
            {"$set": {"po_no": po_no}})
        if res.modified_count:
            i["po_no"] = po_no
        else:  # assigned concurrently by another request
            cur = await db.purchases.find_one({"org_id": ctx["org_id"], "id": i["id"]}, {"_id": 0, "po_no": 1})
            i["po_no"] = (cur or {}).get("po_no", "")

    # ── Compute paid / due from payments ──────────────────────────────────────
    # Directly-linked payments first, then FIFO-allocate any unlinked supplier
    # payments from the same party across that party's open bills (Tally-style).
    pur_ids = {i["id"] for i in items}
    direct_paid = {}
    unlinked_by_party = {}
    async for pay in db.payments.find(
        {"org_id": ctx["org_id"], "direction": "paid"},
        {"_id": 0, "invoice_id": 1, "party_id": 1, "amount": 1, "date": 1}):
        amt = pay.get("amount") or 0
        if amt <= 0:
            continue
        inv_id = pay.get("invoice_id")
        if inv_id and inv_id in pur_ids:
            direct_paid[inv_id] = direct_paid.get(inv_id, 0) + amt
        elif not inv_id and pay.get("party_id"):
            unlinked_by_party.setdefault(pay["party_id"], []).append(pay)

    for i in items:
        i["paid"] = direct_paid.get(i["id"], 0)

    # FIFO-allocate unlinked payments to that party's oldest open bills
    for party_id, pays in unlinked_by_party.items():
        pool = sum(p.get("amount") or 0 for p in pays)
        if pool <= 0:
            continue
        bills = sorted(
            (b for b in items
             if b["party_id"] == party_id
             and (b.get("status") or "").lower() not in ("cancelled",)),
            key=lambda b: b.get("purchase_date") or "")
        for b in bills:
            if pool <= 0:
                break
            grand = purchase_payable(b)
            remaining = grand - b.get("paid", 0)
            if remaining <= 0:
                continue
            take = min(pool, remaining)
            b["paid"] = b.get("paid", 0) + take
            pool -= take

    # Derive payment status + persist a "paid" status back so it sticks
    for i in items:
        grand = purchase_payable(i)
        paid = i.get("paid", 0)
        i["payable"] = grand
        i["due"] = round(max(grand - paid, 0), 2)
        cur = (i.get("status") or "").lower()
        if cur == "cancelled":
            i["payment_status"] = "cancelled"
        elif grand > 0 and paid >= grand * 0.99:
            i["payment_status"] = "paid"
            if cur != "paid":
                i["status"] = "paid"
                await db.purchases.update_one(
                    {"org_id": ctx["org_id"], "id": i["id"]},
                    {"$set": {"status": "paid",
                              "status_changed_at": datetime.utcnow().isoformat()}})
        elif paid > 0:
            i["payment_status"] = "partial"
        else:
            i["payment_status"] = "unpaid"
    return items


@api.post("/purchases")
async def create_purchase(body: PurchaseIn, ctx=Depends(get_org_ctx)):
    await ensure_active_subscription(ctx)
    biz = await get_org_doc(ctx["org_id"])
    party = await db.parties.find_one(org_filter(ctx, {"id": body.party_id}), {"_id": 0})
    if not party: raise HTTPException(400, "Supplier not found")
    branch = None
    seller_state_code = biz.get("state_code", "33")
    if body.branch_id:
        branch = next((b for b in biz.get("branches", []) if b["id"] == body.branch_id), None)
        if branch:
            seller_state_code = branch.get("state_code", seller_state_code)
    same_state = (seller_state_code == party.get("state_code", "33"))
    totals = calc_invoice_totals([i.model_dump() for i in body.items], same_state)
    # Resolve warehouse
    warehouse_name = ""
    if body.warehouse_id:
        wh = await db.warehouse_stock.find_one({"org_id": ctx["org_id"], "warehouse_id": body.warehouse_id}, {"_id": 0, "warehouse_name": 1})
        if not wh:
            wh_doc = await db.organizations.find_one({"id": ctx["org_id"]}, {"_id": 0, "warehouses": 1})
            wh_list = (wh_doc or {}).get("warehouses", [])
            found = next((w for w in wh_list if w.get("id") == body.warehouse_id), None)
            warehouse_name = found.get("name", "") if found else ""
        else:
            warehouse_name = wh.get("warehouse_name", "")
    doc = {
        "id": str(uuid.uuid4()), "org_id": ctx["org_id"],
        "biz_type": ctx.get("biz_type"),
        "party_id": body.party_id, "party_snapshot": party,
        "po_no": await next_invoice_number(ctx["org_id"], "PO"),
        "bill_no": body.bill_no, "purchase_date": body.purchase_date,
        "items": totals["items"],
        "totals": {k: v for k, v in totals.items() if k != "items"},
        "notes": body.notes, "type": body.type, "same_state": same_state,
        "branch_id": body.branch_id, "branch_snapshot": branch,
        "warehouse_id": body.warehouse_id or "",
        "warehouse_name": warehouse_name,
        "eway_bill_no": body.eway_bill_no or "",
        "vehicle_no": body.vehicle_no or "",
        "purchase_category": body.purchase_category or "stock",
        "tds_rate": body.tds_rate or 0,
        "tds_amount": round(body.tds_amount or 0, 2),
        "net_payable": round((totals.get("grand_total", 0) - (body.tds_amount or 0)), 2),
        "created_at": now_iso(),
    }
    await db.purchases.insert_one(doc)
    # Only add stock for stock purchases (not service purchases)
    if body.type == "purchase" and body.purchase_category == "stock":
        for it in body.items:
            if it.product_id:
                await db.products.update_one(org_filter(ctx, {"id": it.product_id}), {"$inc": {"stock": it.qty}})
    return strip_id(doc)


@api.patch("/purchases/{pid}/cancel")
async def cancel_purchase(pid: str, ctx=Depends(require_permission("purchase.delete"))):
    p = await db.purchases.find_one(org_filter(ctx, {"id": pid}), {"_id": 0, "status": 1})
    if not p: raise HTTPException(404, "Purchase not found")
    if p.get("status") == "cancelled": raise HTTPException(400, "Already cancelled")
    await db.purchases.update_one(
        org_filter(ctx, {"id": pid}),
        {"$set": {"status": "cancelled", "cancelled_at": datetime.utcnow().isoformat()}}
    )
    return {"ok": True}


@api.put("/purchases/{pid}")
async def update_purchase(pid: str, body: PurchaseIn, ctx=Depends(require_permission("purchase.create"))):
    p = await db.purchases.find_one(org_filter(ctx, {"id": pid}), {"_id": 0})
    if not p: raise HTTPException(404, "Purchase not found")
    if p.get("status") == "cancelled": raise HTTPException(400, "Cannot edit a cancelled purchase")
    biz = await get_org_doc(ctx["org_id"])
    party = await db.parties.find_one(org_filter(ctx, {"id": body.party_id}), {"_id": 0})
    if not party: raise HTTPException(400, "Supplier not found")
    branch = None
    seller_state_code = biz.get("state_code", "33")
    if body.branch_id:
        branch = next((b for b in biz.get("branches", []) if b["id"] == body.branch_id), None)
        if branch:
            seller_state_code = branch.get("state_code", seller_state_code)
    same_state = (seller_state_code == party.get("state_code", "33"))
    totals = calc_invoice_totals([i.model_dump() for i in body.items], same_state)
    # Reverse old stock if it was a stock purchase
    if p.get("type") == "purchase" and p.get("purchase_category", "stock") == "stock":
        for it in p.get("items", []):
            if it.get("product_id"):
                await db.products.update_one(org_filter(ctx, {"id": it["product_id"]}), {"$inc": {"stock": -it.get("qty", 0)}})
    update = {
        "party_id": body.party_id, "party_snapshot": party,
        "bill_no": body.bill_no, "purchase_date": body.purchase_date,
        "items": totals["items"],
        "totals": {k: v for k, v in totals.items() if k != "items"},
        "notes": body.notes, "type": body.type, "same_state": same_state,
        "branch_id": body.branch_id, "branch_snapshot": branch,
        "warehouse_id": body.warehouse_id or "",
        "eway_bill_no": body.eway_bill_no or "", "vehicle_no": body.vehicle_no or "",
        "purchase_category": body.purchase_category or "stock",
        "tds_rate": body.tds_rate or 0,
        "tds_amount": round(body.tds_amount or 0, 2),
        "net_payable": round((totals.get("grand_total", 0) - (body.tds_amount or 0)), 2),
        "updated_at": now_iso(),
    }
    await db.purchases.update_one(org_filter(ctx, {"id": pid}), {"$set": update})
    # Apply new stock
    if body.type == "purchase" and body.purchase_category == "stock":
        for it in body.items:
            if it.product_id:
                await db.products.update_one(org_filter(ctx, {"id": it.product_id}), {"$inc": {"stock": it.qty}})
    return strip_id({**p, **update})


@api.post("/purchases/{pid}/attach-invoice")
async def attach_vendor_invoice(pid: str, file: UploadFile = File(...), ctx=Depends(require_permission("purchase.create"))):
    """Upload vendor invoice PDF or image and attach it to a purchase bill."""
    p = await db.purchases.find_one(org_filter(ctx, {"id": pid}),
                                    {"_id": 0, "id": 1, "bill_no": 1, "totals": 1, "tds_amount": 1, "net_payable": 1, "party_snapshot": 1})
    if not p: raise HTTPException(404, "Purchase not found")
    if file.size and file.size > 5 * 1024 * 1024:
        raise HTTPException(413, "File must be under 5 MB")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(413, "File must be under 5 MB")
    mime = file.content_type or "application/pdf"
    import base64 as b64mod
    encoded = b64mod.b64encode(content).decode()
    data_uri = f"data:{mime};base64,{encoded}"
    await db.purchases.update_one(
        org_filter(ctx, {"id": pid}),
        {"$set": {"vendor_invoice_b64": data_uri, "vendor_invoice_name": file.filename or "invoice", "updated_at": now_iso()}}
    )
    result = {"ok": True, "filename": file.filename, "bill_no_updated": False, "warnings": []}

    # Read the vendor's real invoice number off the file and put it on the PO.
    # Best-effort: the attachment is already saved, so AI problems never fail the upload.
    try:
        ref = await ai_extract_bill_ref(content, mime)
    except Exception:
        logging.exception("bill ref extraction failed for purchase %s", pid)
        ref = {}
    bill_no = str(ref.get("bill_no") or "").strip()
    result["extracted"] = ref
    if bill_no:
        old = str(p.get("bill_no") or "")
        update = {"vendor_invoice_no": bill_no}
        if ref.get("bill_date"):
            update["vendor_invoice_date"] = ref["bill_date"]
        if bill_no != old:
            dup = await db.purchases.find_one(
                {"org_id": ctx["org_id"], "id": {"$ne": pid}, "bill_no": bill_no,
                 "party_id": (p.get("party_snapshot") or {}).get("id"), "status": {"$ne": "cancelled"}},
                {"_id": 0, "po_no": 1})
            if dup:
                result["warnings"].append(
                    f"Invoice {bill_no} is already recorded on {dup.get('po_no') or 'another purchase'} for this supplier — possible duplicate bill")
            update["bill_no"] = bill_no
            update["bill_no_entered"] = old  # keep what the user originally typed
            result.update(bill_no_updated=True, old_bill_no=old)
        result["bill_no"] = bill_no
        await db.purchases.update_one(org_filter(ctx, {"id": pid}), {"$set": update})
    else:
        result["warnings"].append("Could not read the invoice number from the file — please update Bill # manually")

    grand = (p.get("totals") or {}).get("grand_total", 0) or 0
    try:
        ext_total = float(ref.get("grand_total") or 0)
    except (TypeError, ValueError):
        ext_total = 0
    if grand and ext_total and abs(ext_total - grand) > max(1, grand * 0.01):
        result["warnings"].append(f"Invoice total ₹{ext_total:,.2f} does not match PO total ₹{grand:,.2f}")
    po_gstin = ((p.get("party_snapshot") or {}).get("gstin") or "").upper()
    ext_gstin = str(ref.get("supplier_gstin") or "").upper()
    if po_gstin and ext_gstin and po_gstin != ext_gstin:
        result["warnings"].append(f"Supplier GSTIN on invoice ({ext_gstin}) differs from the PO supplier ({po_gstin})")
    return result


@api.delete("/purchases/{pid}/attach-invoice")
async def remove_vendor_invoice(pid: str, ctx=Depends(require_permission("purchase.create"))):
    await db.purchases.update_one(org_filter(ctx, {"id": pid}),
        {"$unset": {"vendor_invoice_b64": "", "vendor_invoice_name": ""}})
    return {"ok": True}


@api.delete("/purchases/{pid}")
async def delete_purchase(pid: str, ctx=Depends(require_permission("purchase.delete"))):
    await db.purchases.delete_one(org_filter(ctx, {"id": pid}))
    return {"ok": True}


@api.get("/purchases/{pid}/pdf")
async def purchase_pdf(pid: str, ctx=Depends(get_org_ctx)):
    p = await db.purchases.find_one(org_filter(ctx, {"id": pid}), {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    biz = await get_org_doc(ctx["org_id"])
    # Adapt purchase shape to the generator (uses invoice_no/invoice_date keys).
    adapted = {**p, "invoice_no": p["bill_no"], "invoice_date": p["purchase_date"]}
    tmpl = (biz.get("invoice_theme") or {}).get("template", "classic")
    try:
        pdf_bytes = generate_invoice_pdf(adapted, biz, kind="purchase", template=tmpl)
    except Exception as exc:
        import traceback
        raise HTTPException(500, f"PDF generation failed: {exc}\n{traceback.format_exc()}")
    safe_no = p["bill_no"].replace("/", "_").replace(" ", "_")
    return StreamingResponse(BytesIO(pdf_bytes), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="PB-{safe_no}.pdf"',
                                      "X-Bill-No": p["bill_no"]})


# ---------------- PAYMENTS ----------------
@api.get("/payments")
async def list_payments(direction: Optional[str] = None, ctx=Depends(get_org_ctx)):
    q = org_filter(ctx)
    if direction: q["direction"] = direction
    items = await db.payments.find(q, {"_id": 0}).sort("date", -1).to_list(500)
    if not items: return items
    party_ids = list({i["party_id"] for i in items})
    pmap = {p["id"]: p["name"] async for p in db.parties.find(
        {"id": {"$in": party_ids}, "org_id": ctx["org_id"]}, {"_id": 0, "id": 1, "name": 1})}
    for i in items:
        i["party_name"] = pmap.get(i["party_id"], "\u2014")

    # ── Backfill the linked PO for money-out payments saved without one ───────
    # Match on party + amount (within 1%) against that party's purchase bills,
    # then persist the link so the PO auto-closes on the next payment write.
    linked_po_ids = list({i["invoice_id"] for i in items
                          if i.get("direction") == "paid" and i.get("invoice_id")})
    if linked_po_ids:
        po_map = {pur["id"]: po_label(pur) async for pur in db.purchases.find(
            {"org_id": ctx["org_id"], "id": {"$in": linked_po_ids}},
            {"_id": 0, "id": 1, "bill_no": 1, "po_no": 1})}
        for i in items:
            label = po_map.get(i.get("invoice_id"))
            if label and i.get("linked_ref") != label:
                i["linked_ref"] = label
                await db.payments.update_one({"org_id": ctx["org_id"], "id": i["id"]},
                                             {"$set": {"linked_ref": label}})

    unlinked = [i for i in items
                if i.get("direction") == "paid"
                and not i.get("linked_ref")
                and i.get("party_id") and (i.get("amount") or 0) > 0]
    if unlinked:
        cand_parties = list({i["party_id"] for i in unlinked})
        purchases = await db.purchases.find(
            {"org_id": ctx["org_id"], "party_id": {"$in": cand_parties},
             "status": {"$ne": "cancelled"}},
            {"_id": 0, "id": 1, "bill_no": 1, "po_no": 1, "party_id": 1, "totals": 1}).to_list(500)
        used = set()
        for i in unlinked:
            amt = i["amount"]
            for pur in purchases:
                if pur["id"] in used or pur["party_id"] != i["party_id"]:
                    continue
                grand = purchase_payable(pur)
                if grand > 0 and abs(grand - amt) / grand <= 0.01:
                    ref = po_label(pur)
                    i["invoice_id"] = pur["id"]
                    i["linked_ref"] = ref
                    i["linked_type"] = "invoice"
                    used.add(pur["id"])
                    await db.payments.update_one(
                        {"org_id": ctx["org_id"], "id": i["id"]},
                        {"$set": {"invoice_id": pur["id"], "linked_ref": ref,
                                  "linked_type": "invoice"}})
                    break
    return items


@api.post("/payments")
async def create_payment(body: PaymentIn, ctx=Depends(get_org_ctx)):
    await ensure_active_subscription(ctx)
    doc = {**body.model_dump(), "id": str(uuid.uuid4()),
           "org_id": ctx["org_id"], "created_at": now_iso()}
    # Resolve bank account name for display
    if body.bank_account_id:
        bank = await db.bank_accounts.find_one(org_filter(ctx, {"id": body.bank_account_id}), {"_id": 0})
        if bank:
            doc["bank_account_name"] = f"{bank['bank_name']} – {bank['account_no'][-4:]}"
            doc["account_type"] = bank.get("account_type", "Current")
    # Resolve linked invoice display info + auto-close if fully paid
    if body.invoice_id:
        inv = await db.invoices.find_one(org_filter(ctx, {"id": body.invoice_id}), {"_id": 0, "invoice_no": 1, "total": 1, "status": 1})
        if inv:
            doc["linked_ref"] = inv.get("invoice_no", body.invoice_id)
            doc["linked_type"] = "invoice"
    # Resolve linked expense display info
    if body.expense_id:
        exp = await db.expenses.find_one(org_filter(ctx, {"id": body.expense_id}), {"_id": 0, "category": 1, "description": 1})
        if exp:
            doc["linked_ref"] = exp.get("description") or exp.get("category", body.expense_id)
            doc["linked_type"] = "expense"
    await db.payments.insert_one(doc)
    # Auto-mark invoice as paid if total payments now cover it
    if body.invoice_id:
        # First check sale invoices
        inv = await db.invoices.find_one(org_filter(ctx, {"id": body.invoice_id}), {"_id": 0, "id": 1, "totals": 1, "status": 1})
        if inv and inv.get("status") not in ("void", "cancelled", "paid"):
            total_paid = 0
            async for p in db.payments.find({"org_id": ctx["org_id"], "invoice_id": body.invoice_id}, {"_id": 0, "amount": 1}):
                total_paid += p["amount"]
            inv_total = (inv.get("totals") or {}).get("grand_total", 0) or 0
            if inv_total > 0 and total_paid >= inv_total * 0.99:
                await db.invoices.update_one(
                    org_filter(ctx, {"id": body.invoice_id}),
                    {"$set": {"status": "paid", "status_changed_at": datetime.utcnow().isoformat()}}
                )
                doc["invoice_auto_closed"] = True
        # Always check purchases too (invoice_id may point to a PO)
        pur = await db.purchases.find_one({"org_id": ctx["org_id"], "id": body.invoice_id}, {"_id": 0, "id": 1, "bill_no": 1, "po_no": 1, "totals": 1, "tds_amount": 1, "net_payable": 1, "status": 1})
        if pur and pur.get("status") not in ("cancelled", "paid"):
            total_paid = 0
            async for p in db.payments.find({"org_id": ctx["org_id"], "invoice_id": body.invoice_id}, {"_id": 0, "amount": 1}):
                total_paid += p["amount"]
            grand_total = purchase_payable(pur)
            if grand_total > 0 and total_paid >= grand_total * 0.99:
                await db.purchases.update_one(
                    {"org_id": ctx["org_id"], "id": body.invoice_id},
                    {"$set": {"status": "paid", "status_changed_at": datetime.utcnow().isoformat()}}
                )
                doc["purchase_auto_closed"] = True
                if not doc.get("linked_ref"):
                    doc["linked_ref"] = po_label(pur)
                    doc["linked_type"] = "invoice"
                    await db.payments.update_one({"id": doc["id"], "org_id": ctx["org_id"]},
                        {"$set": {"linked_ref": doc["linked_ref"], "linked_type": "invoice"}})
    elif body.direction == "paid" and body.party_id and body.amount:
        # No explicit PO linked — try to auto-match by party + amount
        amt = body.amount
        q = {"org_id": ctx["org_id"], "party_id": body.party_id,
             "status": {"$nin": ["cancelled", "paid"]}}
        best_pur = None
        async for pur in db.purchases.find(q, {"_id": 0, "id": 1, "bill_no": 1, "po_no": 1, "totals": 1, "tds_amount": 1, "net_payable": 1, "status": 1}):
            grand_total = purchase_payable(pur)
            if grand_total > 0 and abs(grand_total - amt) / grand_total <= 0.01:
                best_pur = pur
                break
        if best_pur:
            po_id = best_pur["id"]
            linked_ref = po_label(best_pur)
            # Compute total paid so far for this PO
            total_paid = amt
            async for p in db.payments.find({"org_id": ctx["org_id"], "invoice_id": po_id}, {"_id": 0, "amount": 1}):
                total_paid += p["amount"]
            grand_total = purchase_payable(best_pur)
            # Link payment to this PO
            await db.payments.update_one({"id": doc["id"], "org_id": ctx["org_id"]},
                {"$set": {"invoice_id": po_id, "linked_ref": linked_ref, "linked_type": "invoice"}})
            doc["invoice_id"] = po_id
            doc["linked_ref"] = linked_ref
            doc["linked_type"] = "invoice"
            # Close PO if fully paid
            if grand_total > 0 and total_paid >= grand_total * 0.99:
                await db.purchases.update_one(
                    {"org_id": ctx["org_id"], "id": po_id},
                    {"$set": {"status": "paid", "status_changed_at": datetime.utcnow().isoformat()}}
                )
                doc["purchase_auto_closed"] = True
    return strip_id(doc)


@api.patch("/payments/{pid}")
async def update_payment(pid: str, body: PaymentIn, ctx=Depends(get_org_ctx)):
    """Update a payment — re-resolve bank account name and linked invoice/expense."""
    update = {**body.model_dump()}
    if body.bank_account_id:
        bank = await db.bank_accounts.find_one(org_filter(ctx, {"id": body.bank_account_id}), {"_id": 0})
        if bank:
            update["bank_account_name"] = f"{bank['bank_name']} – {bank['account_no'][-4:]}"
            update["account_type"] = bank.get("account_type", "Current")
    if body.invoice_id:
        inv = await db.invoices.find_one(org_filter(ctx, {"id": body.invoice_id}), {"_id": 0, "invoice_no": 1, "total": 1})
        if inv:
            update["linked_ref"] = inv.get("invoice_no", body.invoice_id)
            update["linked_type"] = "invoice"
    elif body.expense_id:
        exp = await db.expenses.find_one(org_filter(ctx, {"id": body.expense_id}), {"_id": 0, "category": 1, "description": 1})
        if exp:
            update["linked_ref"] = exp.get("description") or exp.get("category", body.expense_id)
            update["linked_type"] = "expense"
    else:
        update["linked_ref"] = ""
        update["linked_type"] = ""
    await db.payments.update_one(org_filter(ctx, {"id": pid}), {"$set": update})
    # Re-check invoice auto-close
    result_flags = {}
    if body.invoice_id:
        # Check sale invoice
        inv = await db.invoices.find_one(org_filter(ctx, {"id": body.invoice_id}), {"_id": 0, "id": 1, "totals": 1, "status": 1})
        if inv and inv.get("status") not in ("void", "cancelled", "paid"):
            total_paid = 0
            async for p in db.payments.find({"org_id": ctx["org_id"], "invoice_id": body.invoice_id}, {"_id": 0, "amount": 1}):
                total_paid += p["amount"]
            inv_total = (inv.get("totals") or {}).get("grand_total", 0) or 0
            if inv_total > 0 and total_paid >= inv_total * 0.99:
                await db.invoices.update_one(
                    org_filter(ctx, {"id": body.invoice_id}),
                    {"$set": {"status": "paid", "status_changed_at": datetime.utcnow().isoformat()}}
                )
                result_flags["invoice_auto_closed"] = True
        # Always check purchase (PO) too
        pur = await db.purchases.find_one({"org_id": ctx["org_id"], "id": body.invoice_id}, {"_id": 0, "id": 1, "bill_no": 1, "po_no": 1, "totals": 1, "tds_amount": 1, "net_payable": 1, "status": 1})
        if pur and pur.get("status") not in ("cancelled", "paid"):
            total_paid = 0
            async for p in db.payments.find({"org_id": ctx["org_id"], "invoice_id": body.invoice_id}, {"_id": 0, "amount": 1}):
                total_paid += p["amount"]
            grand_total = purchase_payable(pur)
            if grand_total > 0 and total_paid >= grand_total * 0.99:
                await db.purchases.update_one(
                    {"org_id": ctx["org_id"], "id": body.invoice_id},
                    {"$set": {"status": "paid", "status_changed_at": datetime.utcnow().isoformat()}}
                )
                result_flags["purchase_auto_closed"] = True
    elif body.direction == "paid" and body.party_id and body.amount:
        # No PO linked — auto-match by party + amount
        amt = body.amount
        q = {"org_id": ctx["org_id"], "party_id": body.party_id, "status": {"$nin": ["cancelled", "paid"]}}
        best_pur = None
        async for pur in db.purchases.find(q, {"_id": 0, "id": 1, "bill_no": 1, "po_no": 1, "totals": 1, "tds_amount": 1, "net_payable": 1}):
            grand_total = purchase_payable(pur)
            if grand_total > 0 and abs(grand_total - amt) / grand_total <= 0.01:
                best_pur = pur; break
        if best_pur:
            po_id = best_pur["id"]
            linked_ref = po_label(best_pur)
            total_paid = amt
            async for p in db.payments.find({"org_id": ctx["org_id"], "invoice_id": po_id}, {"_id": 0, "amount": 1}):
                total_paid += p["amount"]
            grand_total = purchase_payable(best_pur)
            await db.payments.update_one({"id": pid, "org_id": ctx["org_id"]},
                {"$set": {"invoice_id": po_id, "linked_ref": linked_ref, "linked_type": "invoice"}})
            if grand_total > 0 and total_paid >= grand_total * 0.99:
                await db.purchases.update_one(
                    {"org_id": ctx["org_id"], "id": po_id},
                    {"$set": {"status": "paid", "status_changed_at": datetime.utcnow().isoformat()}}
                )
                result_flags["purchase_auto_closed"] = True
    return {"ok": True, **result_flags}


@api.delete("/payments/{pid}")
async def delete_payment(pid: str, ctx=Depends(require_permission("payment.delete"))):
    await db.payments.delete_one(org_filter(ctx, {"id": pid}))
    return {"ok": True}


class PaymentParseIn(BaseModel):
    text: str
    today: str = ""

@api.get("/payments/open-items")
async def get_open_items(party_id: str = Query(None), direction: str = Query("received"), ctx=Depends(get_org_ctx)):
    """Return open invoices/purchases and expenses for a party that can be linked to a payment."""
    result_invoices = []

    if direction == "received":
        # Money In — link to Sale invoices
        inv_q = {**org_filter(ctx), "type": "sale",
                  "status": {"$in": ["finalized", "dispatched", "delivered"]}}
        if party_id: inv_q["party_id"] = party_id
        invoices = await db.invoices.find(inv_q, {"_id": 0, "id": 1, "invoice_no": 1, "totals": 1, "invoice_date": 1,
                                                  "party_id": 1, "po_number": 1}).sort("invoice_date", 1).to_list(300)
        pnames = {pp["id"]: pp["name"] async for pp in db.parties.find(
            {"org_id": ctx["org_id"], "id": {"$in": list({i["party_id"] for i in invoices})}},
            {"_id": 0, "id": 1, "name": 1})}
        inv_ids = [i["id"] for i in invoices]
        paid_map = {}
        if inv_ids:
            async for p in db.payments.aggregate([
                {"$match": {"org_id": ctx["org_id"], "invoice_id": {"$in": inv_ids}}},
                {"$group": {"_id": "$invoice_id", "paid": {"$sum": "$amount"}}},
            ]):
                paid_map[p["_id"]] = p["paid"]
        for inv in invoices:
            paid = round(paid_map.get(inv["id"], 0), 2)
            total = (inv.get("totals") or {}).get("grand_total", 0) or 0
            outstanding = round(total - paid, 2)
            if outstanding > 0.5:
                result_invoices.append({
                    "id": inv["id"], "invoice_no": inv.get("invoice_no", ""),
                    "total": total, "paid": paid, "outstanding": outstanding,
                    "date": inv.get("invoice_date", ""), "party_id": inv.get("party_id"),
                    "party_name": pnames.get(inv.get("party_id"), ""),
                    "customer_po": inv.get("po_number", ""), "item_type": "invoice"})
    else:
        # Money Out — link to Purchase bills (db.purchases collection)
        # Query org-wide (no biz_type scoping) — payments cross business modes
        org_q = {"org_id": ctx["org_id"], "status": {"$nin": ["cancelled", "draft"]}}
        # First try: filter by party
        if party_id:
            pur_q = {**org_q, "party_id": party_id}
            purchases = await db.purchases.find(pur_q, {"_id": 0, "id": 1, "bill_no": 1, "po_no": 1, "totals": 1, "tds_amount": 1, "net_payable": 1,
                "purchase_date": 1, "party_id": 1, "status": 1}).sort("purchase_date", -1).to_list(100)
            # Fallback 1: try without status restriction (in case status field differs)
            if not purchases:
                purchases = await db.purchases.find(
                    {"org_id": ctx["org_id"], "party_id": party_id},
                    {"_id": 0, "id": 1, "bill_no": 1, "po_no": 1, "totals": 1, "tds_amount": 1, "net_payable": 1, "purchase_date": 1, "party_id": 1, "status": 1}
                ).sort("purchase_date", -1).to_list(100)
            # Fallback 2: show all org purchases so user can manually pick
            if not purchases:
                purchases = await db.purchases.find(org_q, {"_id": 0, "id": 1, "bill_no": 1, "po_no": 1, "totals": 1, "tds_amount": 1, "net_payable": 1,
                    "purchase_date": 1, "party_id": 1, "status": 1}).sort("purchase_date", -1).to_list(100)
        else:
            purchases = await db.purchases.find(org_q, {"_id": 0, "id": 1, "bill_no": 1, "po_no": 1, "totals": 1, "tds_amount": 1, "net_payable": 1,
                "purchase_date": 1, "party_id": 1, "status": 1}).sort("purchase_date", -1).to_list(100)
        # Enrich party names
        pur_party_ids = list({p["party_id"] for p in purchases if p.get("party_id")})
        pmap = {p["id"]: p["name"] async for p in db.parties.find(
            {"org_id": ctx["org_id"], "id": {"$in": pur_party_ids}}, {"_id": 0, "id": 1, "name": 1})} if pur_party_ids else {}
        pur_ids = [p["id"] for p in purchases]
        pur_paid_map = {}
        if pur_ids:
            async for p in db.payments.aggregate([
                {"$match": {"org_id": ctx["org_id"], "invoice_id": {"$in": pur_ids}}},
                {"$group": {"_id": "$invoice_id", "paid": {"$sum": "$amount"}}},
            ]):
                pur_paid_map[p["_id"]] = p["paid"]
        for pur in purchases:
            total = purchase_payable(pur)
            paid = pur_paid_map.get(pur["id"], 0)
            outstanding = round(total - paid, 2)
            # Always include — don't filter by outstanding.
            # When editing an existing payment the purchase may appear "fully paid"
            # because this payment itself is already counted; filtering it out causes
            # the "No open purchases" message on edit. Let the user re-link freely.
            result_invoices.append({
                "id": pur["id"],
                "invoice_no": po_label(pur),
                "total": total, "paid": paid, "outstanding": outstanding,
                "date": pur.get("purchase_date", ""),
                "party_name": pmap.get(pur.get("party_id", ""), ""),
                "item_type": "invoice",
            })

    # Expenses (only for money-out)
    result_expenses = []
    if direction == "paid":
        exp_q = org_filter(ctx)
        expenses = await db.expenses.find(exp_q, {"_id": 0, "id": 1, "category": 1, "description": 1, "amount": 1, "date": 1}).sort("date", -1).to_list(50)
        # Check which expenses are already fully paid
        exp_ids = [e["id"] for e in expenses]
        exp_paid_map = {}
        if exp_ids:
            async for p in db.payments.aggregate([
                {"$match": {"org_id": ctx["org_id"], "expense_id": {"$in": exp_ids}}},
                {"$group": {"_id": "$expense_id", "paid": {"$sum": "$amount"}}},
            ]):
                exp_paid_map[p["_id"]] = p["paid"]
        for exp in expenses:
            paid = exp_paid_map.get(exp["id"], 0)
            outstanding = round(exp.get("amount", 0) - paid, 2)
            if outstanding > 0.5:
                result_expenses.append({**exp, "paid": paid, "outstanding": outstanding,
                                        "item_type": "expense",
                                        "label": exp.get("description") or exp.get("category", "Expense")})

    return {"invoices": result_invoices, "expenses": result_expenses}


@api.post("/payments/ai-parse")
async def ai_parse_payment_endpoint(body: PaymentParseIn, ctx=Depends(get_org_ctx)):
    """Parse a natural-language payment description using AI and suggest a matching SO/PO."""
    result = await ai_parse_payment(body.text, body.today)

    # After parsing, try to auto-match against open POs (money-out) or sale invoices (money-in)
    direction = result.get("direction", "received")
    parsed_amount = result.get("amount", 0)
    parsed_party = (result.get("party_name") or "").lower()

    suggested_link = None
    try:
        if parsed_amount and parsed_amount > 0:
            if direction == "paid":
                # Look for purchase bills with similar amount (within 1%)
                pur_q = {"org_id": ctx["org_id"], "status": {"$nin": ["cancelled"]}}
                async for pur in db.purchases.find(pur_q, {"_id": 0, "id": 1, "bill_no": 1, "po_no": 1, "totals": 1, "tds_amount": 1, "net_payable": 1,
                        "purchase_date": 1, "party_id": 1}).sort("purchase_date", -1).limit(200):
                    total = purchase_payable(pur)
                    if total and abs(total - parsed_amount) / max(total, 1) <= 0.02:
                        # Amount match within 2% — fetch party name
                        party = await db.parties.find_one({"org_id": ctx["org_id"], "id": pur.get("party_id")},
                                                           {"_id": 0, "name": 1})
                        party_name = (party or {}).get("name", "")
                        # Prefer match if party name also matches
                        score = 2 if parsed_party and parsed_party in party_name.lower() else 1
                        if not suggested_link or score > suggested_link.get("score", 0):
                            suggested_link = {
                                "id": pur["id"], "invoice_no": po_label(pur),
                                "total": total, "outstanding": total,
                                "date": pur.get("purchase_date", ""),
                                "party_name": party_name, "item_type": "invoice", "score": score,
                            }
            else:
                # Money in — look for sale invoices
                inv_q = {"org_id": ctx["org_id"], "type": "sale",
                         "status": {"$in": ["finalized", "dispatched", "delivered"]}}
                cands = await db.invoices.find(inv_q, {"_id": 0, "id": 1, "invoice_no": 1, "totals": 1,
                        "invoice_date": 1, "party_id": 1}).sort("invoice_date", 1).to_list(300)
                paid_map = {}
                if cands:
                    async for r in db.payments.aggregate([
                        {"$match": {"org_id": ctx["org_id"], "invoice_id": {"$in": [c["id"] for c in cands]}}},
                        {"$group": {"_id": "$invoice_id", "paid": {"$sum": "$amount"}}}]):
                        paid_map[r["_id"]] = r["paid"]
                    names = {pp["id"]: pp["name"] async for pp in db.parties.find(
                        {"org_id": ctx["org_id"], "id": {"$in": list({c["party_id"] for c in cands})}},
                        {"_id": 0, "id": 1, "name": 1})}
                for inv in cands:
                    total = (inv.get("totals") or {}).get("grand_total", 0) or 0
                    outstanding = round(total - paid_map.get(inv["id"], 0), 2)
                    if outstanding <= 0.5:
                        continue
                    # A receipt can settle the balance in full, or be a part-payment of it
                    exact = abs(outstanding - parsed_amount) / max(outstanding, 1) <= 0.02
                    if not exact and parsed_amount > outstanding * 1.02:
                        continue
                    p_name = names.get(inv.get("party_id"), "")
                    party_hit = bool(parsed_party and parsed_party in p_name.lower())
                    if not exact and not party_hit:
                        continue  # part-payments only suggested when the customer matches
                    score = (2 if party_hit else 0) + (1 if exact else 0)
                    if not suggested_link or score > suggested_link.get("score", 0):
                        suggested_link = {
                            "id": inv["id"], "invoice_no": inv.get("invoice_no", ""),
                            "total": total, "outstanding": outstanding,
                            "date": inv.get("invoice_date", ""),
                            "party_name": p_name, "item_type": "invoice", "score": score,
                        }
    except Exception:
        pass  # suggestion is best-effort

    if suggested_link:
        suggested_link.pop("score", None)
        result["suggested_link"] = suggested_link

    return result


# ---------------- EXPENSES ----------------
@api.get("/expenses")
async def list_expenses(ctx=Depends(get_org_ctx)):
    return await db.expenses.find(biz_filter(ctx), {"_id": 0}).sort("date", -1).to_list(1000)


@api.post("/expenses")
async def create_expense(body: ExpenseIn, ctx=Depends(get_org_ctx)):
    await ensure_active_subscription(ctx)
    doc = {**body.model_dump(), "id": str(uuid.uuid4()),
           "org_id": ctx["org_id"], "biz_type": ctx.get("biz_type"), "created_at": now_iso()}
    await db.expenses.insert_one(doc)
    return strip_id(doc)


@api.delete("/expenses/{eid}")
async def delete_expense(eid: str, ctx=Depends(get_org_ctx)):
    await db.expenses.delete_one(org_filter(ctx, {"id": eid}))
    return {"ok": True}


# ---------------- BANK ACCOUNTS ----------------
@api.get("/bank-accounts")
async def list_banks(ctx=Depends(get_org_ctx)):
    return await db.bank_accounts.find(org_filter(ctx), {"_id": 0}).to_list(100)


@api.post("/bank-accounts")
async def create_bank(body: BankAccountIn, ctx=Depends(get_org_ctx)):
    await ensure_active_subscription(ctx)
    doc = {**body.model_dump(), "id": str(uuid.uuid4()),
           "org_id": ctx["org_id"], "created_at": now_iso()}
    await db.bank_accounts.insert_one(doc)
    return strip_id(doc)


@api.delete("/bank-accounts/{bid}")
async def delete_bank(bid: str, ctx=Depends(get_org_ctx)):
    await db.bank_accounts.delete_one(org_filter(ctx, {"id": bid}))
    return {"ok": True}


# ---------------- Bank Statement Upload & Auto-Match ----------------

class BankStatementRow(BaseModel):
    date: str
    description: str
    debit: float = 0.0
    credit: float = 0.0
    balance: float = 0.0

class BankStatementUpload(BaseModel):
    bank_account_id: str
    rows: List[BankStatementRow]
    filename: str = ""

@api.get("/bank-statement/batches")
async def list_statement_batches(bank_account_id: str = Query(None), ctx=Depends(get_org_ctx)):
    q = org_filter(ctx)
    if bank_account_id:
        q["bank_account_id"] = bank_account_id
    batches = await db.bank_statement_uploads.find(q, {"_id": 0}).sort("uploaded_at", -1).to_list(200)

    # Recalculate matched_count live for each batch (upload-time count goes stale as rows get matched)
    base_row_q = org_filter(ctx)
    if bank_account_id:
        base_row_q["bank_account_id"] = bank_account_id

    for b in batches:
        bid = b.get("id") or b.get("batch_id")
        total = await db.bank_statement_rows.count_documents({**base_row_q, "batch_id": bid})
        matched_live = await db.bank_statement_rows.count_documents({**base_row_q, "batch_id": bid, "matched": True})
        b["row_count"] = total
        b["matched_count"] = matched_live

    # Also check for "legacy" rows that have no batch_id (uploaded before batch tracking)
    legacy_q = {**base_row_q, "batch_id": {"$exists": False}}
    legacy_count = await db.bank_statement_rows.count_documents(legacy_q)
    if legacy_count > 0:
        legacy_rows = await db.bank_statement_rows.find(legacy_q, {"_id": 0, "date": 1, "matched": 1}).to_list(5000)
        dates = sorted([r["date"] for r in legacy_rows if r.get("date")])
        matched = sum(1 for r in legacy_rows if r.get("matched"))
        batches.append({
            "id": "__legacy__",
            "filename": "Legacy Upload (pre-tracking)",
            "row_count": legacy_count,
            "matched_count": matched,
            "date_from": dates[0] if dates else "",
            "date_to": dates[-1] if dates else "",
            "uploaded_at": "",
            "bank_account_id": bank_account_id or "",
            "is_legacy": True,
        })
    return batches

@api.get("/bank-statement/batch/{batch_id}/rows")
async def get_batch_rows(batch_id: str, ctx=Depends(get_org_ctx)):
    if batch_id == "__legacy__":
        rows = await db.bank_statement_rows.find(
            {**org_filter(ctx), "batch_id": {"$exists": False}}, {"_id": 0}
        ).sort("date", 1).to_list(5000)
    else:
        rows = await db.bank_statement_rows.find(org_filter(ctx, {"batch_id": batch_id}), {"_id": 0}).sort("date", 1).to_list(5000)
    return rows

@api.delete("/bank-statement/batch/{batch_id}")
async def delete_batch(batch_id: str, ctx=Depends(get_org_ctx)):
    if batch_id == "__legacy__":
        await db.bank_statement_rows.delete_many({**org_filter(ctx), "batch_id": {"$exists": False}})
    else:
        await db.bank_statement_rows.delete_many(org_filter(ctx, {"batch_id": batch_id}))
        await db.bank_statement_uploads.delete_one(org_filter(ctx, {"id": batch_id}))
    return {"ok": True}

@api.get("/bank-statement/analyze")
async def analyze_bank_statement(bank_account_id: str = Query(None), batch_id: str = Query(None), ctx=Depends(get_org_ctx)):
    """AI-powered analysis: vendor groups, category breakdown, monthly trend, insights."""
    import re as _re
    from collections import defaultdict

    q = org_filter(ctx)
    if bank_account_id: q["bank_account_id"] = bank_account_id
    if batch_id: q["batch_id"] = batch_id
    rows = await db.bank_statement_rows.find(q, {"_id": 0}).to_list(5000)
    if not rows:
        return {"vendors": [], "categories": [], "monthly": [], "insights": "", "total_in": 0, "total_out": 0}

    # ── 1. Extract vendor key from description ──────────────────────────────
    def extract_vendor(desc: str) -> str:
        d = desc.upper()
        # Remove common bank prefixes
        d = _re.sub(r"^(IMPS|NEFT|RTGS|UPI|NACH|ECS|ACH|HDFC|ICICI|SBI|AXIS|KOTAK|YES|PNB|BOB|CBI|IOB|CANARA)[- /]*", "", d)
        # Extract meaningful part (before long number sequences)
        d = _re.sub(r"\d{6,}", "", d)
        d = _re.sub(r"[/\-_]{2,}", " ", d)
        parts = d.split()[:5]
        return " ".join(p for p in parts if len(p) > 2)[:50].strip() or desc[:40]

    # ── 2. Aggregate by vendor ──────────────────────────────────────────────
    vendor_map = defaultdict(lambda: {"total_debit": 0.0, "total_credit": 0.0, "count": 0})
    monthly_map = defaultdict(lambda: {"debit": 0.0, "credit": 0.0})
    total_in = total_out = 0.0

    for r in rows:
        vk = extract_vendor(r.get("description", ""))
        vendor_map[vk]["total_debit"]  += r.get("debit", 0)
        vendor_map[vk]["total_credit"] += r.get("credit", 0)
        vendor_map[vk]["count"] += 1
        # monthly
        date_str = r.get("date", "")
        month_key = date_str[:7] if len(date_str) >= 7 else date_str[:4]
        monthly_map[month_key]["debit"]  += r.get("debit", 0)
        monthly_map[month_key]["credit"] += r.get("credit", 0)
        total_in  += r.get("credit", 0)
        total_out += r.get("debit", 0)

    vendors_list = [
        {"raw_vendor": k, "total_debit": v["total_debit"], "total_credit": v["total_credit"], "count": v["count"]}
        for k, v in sorted(vendor_map.items(), key=lambda x: -(x[1]["total_debit"] + x[1]["total_credit"]))
    ]

    # ── 3. AI categorization ────────────────────────────────────────────────
    ai_cats = await ai_analyze_bank_vendors(vendors_list[:80])
    cat_map = {c["raw_vendor"]: c for c in ai_cats}

    # Enrich vendors with AI category
    for v in vendors_list:
        ai = cat_map.get(v["raw_vendor"], {})
        v["clean_name"] = ai.get("clean_name", v["raw_vendor"])
        v["category"]   = ai.get("category", "Miscellaneous")
        v["sub_type"]   = ai.get("sub_type", "expense")

    # ── 4. Category rollup ──────────────────────────────────────────────────
    cat_rollup = defaultdict(lambda: {"debit": 0.0, "credit": 0.0, "count": 0})
    for v in vendors_list:
        cat = v["category"]
        cat_rollup[cat]["debit"]  += v["total_debit"]
        cat_rollup[cat]["credit"] += v["total_credit"]
        cat_rollup[cat]["count"]  += v["count"]
    categories = [
        {"category": k, "debit": v["debit"], "credit": v["credit"], "count": v["count"]}
        for k, v in sorted(cat_rollup.items(), key=lambda x: -(x[1]["debit"] + x[1]["credit"]))
    ]

    # ── 5. Monthly trend ────────────────────────────────────────────────────
    monthly = [
        {"month": k, "credit": v["credit"], "debit": v["debit"]}
        for k, v in sorted(monthly_map.items())
    ]

    # ── 6. AI insights ──────────────────────────────────────────────────────
    summary = {
        "total_in": round(total_in, 2), "total_out": round(total_out, 2),
        "net": round(total_in - total_out, 2),
        "top_expense_vendors": [{"name": v["clean_name"], "amount": v["total_debit"]} for v in vendors_list[:10] if v["total_debit"] > 0],
        "top_income_vendors":  [{"name": v["clean_name"], "amount": v["total_credit"]} for v in vendors_list[:10] if v["total_credit"] > 0],
        "top_expense_categories": categories[:5],
        "months_covered": len(monthly),
    }
    insights = await ai_bank_insights(summary)

    return {
        "vendors": vendors_list[:100],
        "categories": categories,
        "monthly": monthly,
        "insights": insights,
        "total_in": round(total_in, 2),
        "total_out": round(total_out, 2),
    }

@api.post("/bank-statement/upload")
async def upload_bank_statement(body: BankStatementUpload, ctx=Depends(get_org_ctx)):
    """Accept parsed bank statement rows and auto-match against invoices/purchases."""
    batch_id = str(uuid.uuid4())
    results = []
    for row in body.rows:
        entry = {
            "id": str(uuid.uuid4()),
            "org_id": ctx["org_id"],
            "bank_account_id": body.bank_account_id,
            "batch_id": batch_id,
            "date": row.date,
            "description": row.description,
            "debit": row.debit,
            "credit": row.credit,
            "balance": row.balance,
            "matched": False,
            "match_type": None,
            "match_id": None,
            "match_ref": None,
            "created_at": now_iso(),
        }
        entry.update(await match_bank_row(ctx, row.date, row.description, row.debit, row.credit))
        entry["fingerprint"] = _bank_row_fingerprint(body.bank_account_id, row.date, row.debit, row.credit, row.description)
        await db.bank_statement_rows.insert_one(entry)
        results.append({k: v for k, v in entry.items() if k != "_id"})
    matched = sum(1 for r in results if r["matched"])
    # Save batch metadata
    dates = sorted([r["date"] for r in results if r.get("date")])
    batch_doc = {
        "id": batch_id, "org_id": ctx["org_id"],
        "bank_account_id": body.bank_account_id,
        "filename": body.filename or "upload",
        "row_count": len(results), "matched_count": matched,
        "date_from": dates[0] if dates else "", "date_to": dates[-1] if dates else "",
        "uploaded_at": now_iso(),
    }
    await db.bank_statement_uploads.insert_one(batch_doc)
    return {"uploaded": len(results), "matched": matched, "rows": results, "batch_id": batch_id}

@api.get("/bank-statement")
async def get_bank_statement(bank_account_id: str = Query(None), ctx=Depends(get_org_ctx)):
    q = org_filter(ctx)
    if bank_account_id:
        q["bank_account_id"] = bank_account_id
    rows = await db.bank_statement_rows.find(q, {"_id": 0}).sort("date", -1).to_list(10000)
    return rows

@api.patch("/bank-statement/{row_id}/match")
async def manual_match(row_id: str, body: dict, ctx=Depends(get_org_ctx)):
    await db.bank_statement_rows.update_one(
        org_filter(ctx, {"id": row_id}),
        {"$set": {"matched": True, "match_type": body.get("match_type"), "match_id": body.get("match_id"), "match_ref": body.get("match_ref")}}
    )
    return {"ok": True}

@api.delete("/bank-statement/{row_id}")
async def delete_statement_row(row_id: str, ctx=Depends(get_org_ctx)):
    await db.bank_statement_rows.delete_one(org_filter(ctx, {"id": row_id}))
    return {"ok": True}


# ---------------- INVENTORY ----------------

@api.get("/inventory/summary")
async def inventory_summary(ctx=Depends(get_org_ctx)):
    """Return current stock level per product with movement totals."""
    products = await db.products.find(org_filter(ctx), {"_id": 0,
        "id": 1, "name": 1, "sku": 1, "unit": 1, "stock": 1, "low_stock_alert": 1, "category": 1, "sale_price": 1}).to_list(1000)
    if not products:
        return []
    prod_ids = [p["id"] for p in products]
    # Aggregate total IN and OUT from stock_movements
    in_map: Dict[str, float] = {}
    out_map: Dict[str, float] = {}
    async for r in db.stock_movements.aggregate([
        {"$match": {"org_id": ctx["org_id"], "product_id": {"$in": prod_ids}}},
        {"$group": {"_id": "$product_id",
                    "total_in":  {"$sum": {"$cond": [{"$gt": ["$qty", 0]}, "$qty", 0]}},
                    "total_out": {"$sum": {"$cond": [{"$lt": ["$qty", 0]}, {"$abs": "$qty"}, 0]}}}},
    ]):
        in_map[r["_id"]] = round(r["total_in"], 3)
        out_map[r["_id"]] = round(r["total_out"], 3)
    result = []
    for p in products:
        pid = p["id"]
        stock = p.get("stock", 0) or 0
        low = p.get("low_stock_alert", 5) or 5
        result.append({
            **p,
            "total_in":  in_map.get(pid, 0),
            "total_out": out_map.get(pid, 0),
            "stock_value": round(stock * (p.get("sale_price") or 0), 2),
            "is_low_stock": stock <= low,
        })
    result.sort(key=lambda x: x["name"])
    return result


@api.get("/inventory/movements")
async def inventory_movements(
    product_id: str = Query(None),
    movement_type: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    ctx=Depends(get_org_ctx)
):
    """Return stock movement log."""
    q = org_filter(ctx)
    if product_id: q["product_id"] = product_id
    if movement_type: q["movement_type"] = movement_type
    if date_from: q.setdefault("date", {})["$gte"] = date_from
    if date_to:   q.setdefault("date", {})["$lte"] = date_to
    movements = await db.stock_movements.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    # Enrich with product names
    prod_ids = list({m["product_id"] for m in movements if m.get("product_id")})
    if prod_ids:
        pmap = {p["id"]: p async for p in db.products.find(org_filter(ctx, {"id": {"$in": prod_ids}}), {"_id": 0, "id": 1, "name": 1, "sku": 1, "unit": 1})}
        for m in movements:
            p = pmap.get(m.get("product_id"), {})
            m["product_name"] = p.get("name", "")
            m["product_sku"]  = p.get("sku", "")
            m["unit"]         = p.get("unit", "")
    # Enrich with warehouse names
    org = await get_org_doc(ctx["org_id"])
    wmap = {w["id"]: w["name"] for w in org.get("warehouses", [])}
    for m in movements:
        m["warehouse_name"] = wmap.get(m.get("warehouse_id", ""), "")
    return movements


class StockAdjustIn(BaseModel):
    product_id: str
    qty: float           # positive = add, negative = remove
    reason: str = ""
    warehouse_id: str = ""
    date: str = ""

@api.post("/inventory/adjust")
async def stock_adjust(body: StockAdjustIn, ctx=Depends(require_permission("settings.edit"))):
    """Manual stock adjustment."""
    await db.products.update_one(org_filter(ctx, {"id": body.product_id}), {"$inc": {"stock": body.qty}})
    if body.warehouse_id:
        await _adjust_warehouse_stock(ctx["org_id"], body.warehouse_id, body.product_id, body.qty,
            movement_type="adjustment", ref_no=body.reason or "Manual adjustment",
            date=body.date or now_iso()[:10])
    else:
        await _log_stock_movement(ctx["org_id"], body.product_id, body.qty,
            movement_type="adjustment", ref_no=body.reason or "Manual adjustment",
            date=body.date or now_iso()[:10])
    return {"ok": True}


@api.post("/inventory/sync-history")
async def sync_inventory_history(ctx=Depends(require_permission("settings.edit"))):
    """Backfill stock_movements from existing GRNs and finalized sale invoices.
    Safe to run multiple times — skips records that already have a movement logged."""
    org_id = ctx["org_id"]
    added = 0

    # Get already-logged ref_ids to avoid duplicates
    existing_refs = set()
    async for m in db.stock_movements.find({"org_id": org_id}, {"ref_id": 1, "_id": 0}):
        if m.get("ref_id"):
            existing_refs.add(m["ref_id"])

    # Backfill GRNs
    async for grn in db.grns.find({"org_id": org_id}, {"_id": 0}):
        if grn["id"] in existing_refs:
            continue
        for it in grn.get("items", []):
            if not it.get("product_id"):
                continue
            await db.stock_movements.insert_one({
                "id": str(uuid.uuid4()), "org_id": org_id,
                "product_id": it["product_id"],
                "warehouse_id": grn.get("warehouse_id", ""),
                "qty": it["qty"],
                "movement_type": "grn",
                "ref_id": grn["id"],
                "ref_no": grn.get("grn_no", ""),
                "party_name": grn.get("vendor_name", ""),
                "date": grn.get("grn_date", now_iso()[:10]),
                "created_at": grn.get("created_at", now_iso()),
            })
            added += 1

    # Backfill finalized stock invoices (include docs without invoice_category — legacy = stock)
    async for inv in db.invoices.find({"org_id": org_id, "type": "sale", "status": "finalized",
                                       "$or": [{"invoice_category": "stock"}, {"invoice_category": {"$exists": False}}, {"invoice_category": ""}]}, {"_id": 0}):
        if inv["id"] in existing_refs:
            continue
        for it in inv.get("items", []):
            if not it.get("product_id"):
                continue
            await db.stock_movements.insert_one({
                "id": str(uuid.uuid4()), "org_id": org_id,
                "product_id": it["product_id"],
                "warehouse_id": inv.get("warehouse_id", ""),
                "qty": -it["qty"],
                "movement_type": "sale",
                "ref_id": inv["id"],
                "ref_no": inv.get("invoice_no", ""),
                "party_name": inv.get("party_name", ""),
                "date": inv.get("invoice_date", now_iso()[:10]),
                "created_at": inv.get("created_at", now_iso()),
            })
            added += 1

    return {"ok": True, "added": added}


# ---------------- TDS ----------------
@api.get("/tds")
async def list_tds(ctx=Depends(get_org_ctx)):
    items = await db.tds_entries.find(org_filter(ctx), {"_id": 0}).sort("date", -1).to_list(500)
    if not items: return items
    party_ids = list({i["party_id"] for i in items})
    pmap = {p["id"]: p["name"] async for p in db.parties.find(
        {"id": {"$in": party_ids}, "org_id": ctx["org_id"]}, {"_id": 0, "id": 1, "name": 1})}
    for i in items:
        i["party_name"] = pmap.get(i["party_id"], "—")
    return items


@api.post("/tds")
async def create_tds(body: TDSEntryIn, ctx=Depends(get_org_ctx)):
    await ensure_active_subscription(ctx)
    doc = {**body.model_dump(), "id": str(uuid.uuid4()),
           "org_id": ctx["org_id"], "created_at": now_iso()}
    await db.tds_entries.insert_one(doc)
    return strip_id(doc)


# ---------------- DASHBOARD ----------------
@api.get("/dashboard")
async def dashboard(ctx=Depends(get_org_ctx)):
    today = now_dt()
    month_start_str = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()[:10]
    oid = ctx["org_id"]

    # Month sales + output GST (aggregation)
    sales_agg = await db.invoices.aggregate([
        {"$match": {"org_id": oid, "invoice_date": {"$gte": month_start_str}, "type": "sale"}},
        {"$group": {"_id": None,
                    "total": {"$sum": "$totals.grand_total"},
                    "gst": {"$sum": {"$add": ["$totals.cgst", "$totals.sgst", "$totals.igst"]}}}},
    ]).to_list(1)
    sales_total = sales_agg[0]["total"] if sales_agg else 0
    output_gst = sales_agg[0]["gst"] if sales_agg else 0

    # Month purchases + input GST
    pur_agg = await db.purchases.aggregate([
        {"$match": {"org_id": oid, "purchase_date": {"$gte": month_start_str}, "type": "purchase"}},
        {"$group": {"_id": None,
                    "total": {"$sum": "$totals.grand_total"},
                    "gst": {"$sum": {"$add": ["$totals.cgst", "$totals.sgst", "$totals.igst"]}}}},
    ]).to_list(1)
    purchase_total = pur_agg[0]["total"] if pur_agg else 0
    input_gst = pur_agg[0]["gst"] if pur_agg else 0
    gst_payable = max(0, output_gst - input_gst)

    # Bulk receivable / payable
    parties_all = await db.parties.find({"org_id": oid}, {"_id": 0, "id": 1, "type": 1, "opening_balance": 1}).to_list(2000)
    balances = await bulk_party_balances(oid, parties_all)
    receivable = sum(balances[p["id"]] for p in parties_all if p["type"] == "customer")
    payable = sum(balances[p["id"]] for p in parties_all if p["type"] == "supplier")

    # Sales last 6 months (one aggregation grouping by year-month)
    six_months_ago_str = (today.replace(day=1) - timedelta(days=180)).strftime("%Y-%m-%d")
    month_buckets: Dict[str, float] = {}
    async for r in db.invoices.aggregate([
        {"$match": {"org_id": oid, "type": "sale", "invoice_date": {"$gte": six_months_ago_str}}},
        {"$group": {"_id": {"$substr": ["$invoice_date", 0, 7]},
                    "total": {"$sum": "$totals.grand_total"}}},
    ]):
        month_buckets[r["_id"]] = r["total"]
    chart = []
    for offset in range(5, -1, -1):
        ref = today.replace(day=1) - timedelta(days=offset * 30)
        ms = ref.strftime("%Y-%m")
        chart.append({"month": ref.strftime("%b %Y"), "sales": round(month_buckets.get(ms, 0), 2)})

    # Recent invoices
    recent = await db.invoices.find({"org_id": oid, "type": "sale"}, {"_id": 0}).sort("invoice_date", -1).to_list(5)
    if recent:
        pids = list({r["party_id"] for r in recent})
        pmap = {p["id"]: p["name"] async for p in db.parties.find(
            {"id": {"$in": pids}, "org_id": oid}, {"_id": 0, "id": 1, "name": 1})}
        for r in recent:
            r["party_name"] = pmap.get(r["party_id"], "—")

    # Top customers (aggregation)
    tc_list = []
    async for r in db.invoices.aggregate([
        {"$match": {"org_id": oid, "type": "sale"}},
        {"$group": {"_id": "$party_id", "amount": {"$sum": "$totals.grand_total"}}},
        {"$sort": {"amount": -1}}, {"$limit": 5},
    ]):
        p = await db.parties.find_one({"id": r["_id"], "org_id": oid}, {"_id": 0, "name": 1})
        tc_list.append({"name": p["name"] if p else "—", "amount": round(r["amount"], 2)})

    # Top products (aggregation with $unwind)
    tp_list = []
    async for r in db.invoices.aggregate([
        {"$match": {"org_id": oid, "type": "sale"}},
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.name",
                    "qty": {"$sum": "$items.qty"},
                    "amount": {"$sum": "$items.total"}}},
        {"$sort": {"amount": -1}}, {"$limit": 5},
    ]):
        tp_list.append({"name": r["_id"], "qty": r["qty"], "amount": round(r["amount"], 2)})

    # Expenses this month (aggregation)
    exp_agg = await db.expenses.aggregate([
        {"$match": {"org_id": oid, "date": {"$gte": month_start_str}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    expenses_total = exp_agg[0]["total"] if exp_agg else 0

    net_profit = sales_total - purchase_total - expenses_total

    return {
        "sales_total": round(sales_total, 2), "purchase_total": round(purchase_total, 2),
        "receivable": round(receivable, 2), "payable": round(payable, 2),
        "gst_payable": round(gst_payable, 2), "net_profit": round(net_profit, 2),
        "expenses_total": round(expenses_total, 2), "chart": chart,
        "recent_invoices": recent, "top_customers": tc_list, "top_products": tp_list,
    }


@api.get("/dashboard/pos")
async def dashboard_pos(ctx=Depends(get_org_ctx)):
    """POS-specific dashboard: today's counters, cash/UPI split, top products."""
    today_str = now_dt().strftime("%Y-%m-%d")
    oid = ctx["org_id"]

    # Today's POS invoices (notes contains "POS sale")
    today_agg = await db.invoices.aggregate([
        {"$match": {"org_id": oid, "type": "sale", "invoice_date": today_str, "notes": {"$regex": "POS sale", "$options": "i"}}},
        {"$group": {"_id": None, "count": {"$sum": 1}, "total": {"$sum": "$totals.grand_total"}}},
    ]).to_list(1)

    # Cash vs UPI today
    cash_agg = await db.payments.aggregate([
        {"$match": {"org_id": oid, "payment_date": today_str, "method": "cash"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    upi_agg = await db.payments.aggregate([
        {"$match": {"org_id": oid, "payment_date": today_str, "method": {"$in": ["upi", "online"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)

    # Top 5 products sold today (from POS invoices)
    top_products = []
    async for r in db.invoices.aggregate([
        {"$match": {"org_id": oid, "type": "sale", "invoice_date": today_str, "notes": {"$regex": "POS sale", "$options": "i"}}},
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.name", "qty": {"$sum": "$items.qty"}, "amount": {"$sum": "$items.total"}}},
        {"$sort": {"amount": -1}}, {"$limit": 5},
    ]):
        top_products.append({"name": r["_id"], "qty": round(r["qty"], 2), "amount": round(r["amount"], 2)})

    # Recent 5 POS bills today
    recent = await db.invoices.find(
        {"org_id": oid, "type": "sale", "invoice_date": today_str, "notes": {"$regex": "POS sale", "$options": "i"}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(5)
    for r in recent:
        r["party_name"] = r.get("party_snapshot", {}).get("name") or "Walk-in"

    # Low stock alert
    low_stock = await db.products.find(
        {"org_id": oid, "$expr": {"$lte": ["$stock", "$low_stock_alert"]}},
        {"_id": 0, "name": 1, "stock": 1, "unit": 1}
    ).to_list(10)

    today_data = today_agg[0] if today_agg else {"count": 0, "total": 0}
    return {
        "today_count": today_data.get("count", 0),
        "today_total": round(today_data.get("total", 0), 2),
        "cash_today": round(cash_agg[0]["total"] if cash_agg else 0, 2),
        "upi_today": round(upi_agg[0]["total"] if upi_agg else 0, 2),
        "top_products": top_products,
        "recent_bills": recent,
        "low_stock": low_stock,
    }


# ---------------- GST ----------------
@api.get("/gst/gstr1")
async def gstr1(month: Optional[str] = Query(None, description="YYYY-MM; defaults to current month"),
                ctx=Depends(get_org_ctx)):
    if not month:
        month = now_dt().strftime("%Y-%m")
    b2b, b2c, hsn_summary = [], [], {}
    async for inv in db.invoices.find({"org_id": ctx["org_id"], "type": "sale",
                                        "invoice_date": {"$regex": f"^{month}"}}, {"_id": 0}):
        party = inv.get("party_snapshot", {})
        entry = {"invoice_no": inv["invoice_no"], "date": inv["invoice_date"],
                 "party": party.get("name", ""), "gstin": party.get("gstin", ""),
                 "taxable": inv["totals"]["taxable_amount"], "cgst": inv["totals"]["cgst"],
                 "sgst": inv["totals"]["sgst"], "igst": inv["totals"]["igst"],
                 "total": inv["totals"]["grand_total"]}
        (b2b if party.get("gstin") else b2c).append(entry)
        for it in inv["items"]:
            hsn = it.get("hsn") or "—"
            hsn_summary.setdefault(hsn, {"hsn": hsn, "description": it["name"], "qty": 0,
                                          "taxable": 0, "cgst": 0, "sgst": 0, "igst": 0, "total": 0})
            for k in ("qty", "taxable", "cgst", "sgst", "igst", "total"):
                hsn_summary[hsn][k] += it[k]
    return {"month": month, "b2b": b2b, "b2c": b2c, "hsn": list(hsn_summary.values())}


@api.get("/gst/gstr3b")
async def gstr3b(month: Optional[str] = Query(None, description="YYYY-MM; defaults to current month"),
                 ctx=Depends(get_org_ctx)):
    if not month:
        month = now_dt().strftime("%Y-%m")
    out_cgst = out_sgst = out_igst = in_cgst = in_sgst = in_igst = 0
    out_taxable = in_taxable = 0
    async for inv in db.invoices.find({"org_id": ctx["org_id"], "type": "sale",
                                        "invoice_date": {"$regex": f"^{month}"}}, {"_id": 0, "totals": 1}):
        t = inv["totals"]
        out_cgst += t["cgst"]; out_sgst += t["sgst"]; out_igst += t["igst"]; out_taxable += t["taxable_amount"]
    async for inv in db.purchases.find({"org_id": ctx["org_id"], "type": "purchase",
                                         "purchase_date": {"$regex": f"^{month}"}}, {"_id": 0, "totals": 1, "tds_amount": 1, "net_payable": 1}):
        t = inv["totals"]
        in_cgst += t["cgst"]; in_sgst += t["sgst"]; in_igst += t["igst"]; in_taxable += t["taxable_amount"]
    return {
        "month": month,
        "outward": {"taxable": round(out_taxable, 2), "cgst": round(out_cgst, 2),
                    "sgst": round(out_sgst, 2), "igst": round(out_igst, 2)},
        "itc": {"taxable": round(in_taxable, 2), "cgst": round(in_cgst, 2),
                "sgst": round(in_sgst, 2), "igst": round(in_igst, 2)},
        "net_payable": {
            "cgst": round(max(0, out_cgst - in_cgst), 2),
            "sgst": round(max(0, out_sgst - in_sgst), 2),
            "igst": round(max(0, out_igst - in_igst), 2),
            "total": round(max(0, out_cgst + out_sgst + out_igst - in_cgst - in_sgst - in_igst), 2),
        }
    }


# ---------------- REPORTS ----------------
@api.get("/reports/pl")
async def pl_report(month: Optional[str] = None, ctx=Depends(get_org_ctx)):
    oid = ctx["org_id"]
    q_inv = {"org_id": oid, "type": "sale"}
    q_pur = {"org_id": oid, "type": "purchase"}
    q_exp = {"org_id": oid}
    if month:
        q_inv["invoice_date"] = {"$regex": f"^{month}"}
        q_pur["purchase_date"] = {"$regex": f"^{month}"}
        q_exp["date"] = {"$regex": f"^{month}"}
    sales = cost = expenses = 0
    async for i in db.invoices.find(q_inv, {"_id": 0, "totals": 1}):
        sales += i["totals"]["taxable_amount"]
    async for i in db.purchases.find(q_pur, {"_id": 0, "totals": 1, "tds_amount": 1, "net_payable": 1}):
        cost += i["totals"]["taxable_amount"]
    async for e in db.expenses.find(q_exp, {"_id": 0, "amount": 1}):
        expenses += e["amount"]
    return {
        "sales": round(sales, 2), "cost_of_goods": round(cost, 2),
        "gross_profit": round(sales - cost, 2),
        "expenses": round(expenses, 2),
        "net_profit": round(sales - cost - expenses, 2),
    }


@api.get("/reports/trial-balance")
async def trial_balance(ctx=Depends(get_org_ctx)):
    oid = ctx["org_id"]
    # Aggregations over invoices, purchases, expenses
    sales_agg = await db.invoices.aggregate([
        {"$match": {"org_id": oid, "type": "sale"}},
        {"$group": {"_id": None, "total": {"$sum": "$totals.grand_total"}}},
    ]).to_list(1)
    pur_agg = await db.purchases.aggregate([
        {"$match": {"org_id": oid, "type": "purchase"}},
        {"$group": {"_id": None, "total": {"$sum": "$totals.grand_total"}}},
    ]).to_list(1)
    exp_agg = await db.expenses.aggregate([
        {"$match": {"org_id": oid}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    sales = sales_agg[0]["total"] if sales_agg else 0
    purchases = pur_agg[0]["total"] if pur_agg else 0
    expenses = exp_agg[0]["total"] if exp_agg else 0

    # Bulk party balances
    parties_all = await db.parties.find({"org_id": oid}, {"_id": 0, "id": 1, "type": 1, "opening_balance": 1}).to_list(2000)
    balances = await bulk_party_balances(oid, parties_all)
    receivable = sum(balances[p["id"]] for p in parties_all if p["type"] == "customer")
    payable = sum(balances[p["id"]] for p in parties_all if p["type"] == "supplier")

    rows = [
        {"account": "Sales", "debit": 0, "credit": round(sales, 2)},
        {"account": "Purchases", "debit": round(purchases, 2), "credit": 0},
        {"account": "Expenses", "debit": round(expenses, 2), "credit": 0},
        {"account": "Accounts Receivable", "debit": round(receivable, 2), "credit": 0},
        {"account": "Accounts Payable", "debit": 0, "credit": round(payable, 2)},
    ]
    return {"rows": rows, "total_debit": sum(r["debit"] for r in rows),
            "total_credit": sum(r["credit"] for r in rows)}


@api.get("/reports/day-book")
async def day_book(date: Optional[str] = None, ctx=Depends(get_org_ctx)):
    today = date or now_dt().strftime("%Y-%m-%d")
    oid = ctx["org_id"]
    out = []
    async for i in db.invoices.find({"org_id": oid, "invoice_date": today}, {"_id": 0}):
        out.append({"type": "Sale", "ref": i["invoice_no"], "amount": i["totals"]["grand_total"], "date": today})
    async for i in db.purchases.find({"org_id": oid, "purchase_date": today}, {"_id": 0}):
        out.append({"type": "Purchase", "ref": i["bill_no"], "amount": i["totals"]["grand_total"], "date": today})
    async for p in db.payments.find({"org_id": oid, "date": today}, {"_id": 0}):
        out.append({"type": f"Payment {p['direction']}", "ref": p.get("reference", ""), "amount": p["amount"], "date": today})
    async for e in db.expenses.find({"org_id": oid, "date": today}, {"_id": 0}):
        out.append({"type": "Expense", "ref": e["category"], "amount": e["amount"], "date": today})
    return {"date": today, "entries": out}


@api.get("/reports/stock")
async def stock_report(ctx=Depends(get_org_ctx)):
    items = await db.products.find(org_filter(ctx), {"_id": 0}).to_list(1000)
    for i in items:
        i["value"] = round(i.get("stock", 0) * i.get("purchase_price", 0), 2)
        i["low"] = i.get("stock", 0) <= i.get("low_stock_alert", 0)
    return items



# ---------------- SUPER ADMIN ----------------
async def require_super_admin(user=Depends(get_current_user)):
    if not user.get("is_super_admin"):
        raise HTTPException(403, "Super admin only")
    return user


# ─────────────────────────────────────────────────────────────────────────────
# Businesses: each business is a standalone org (own parties, products, invoices,
# accounts, team). One owner can run several; extra businesses bill as add-ons on the
# owner's main ("billing") org. Limits and prices are set by the BillingsEasy super admin.
# ─────────────────────────────────────────────────────────────────────────────
BUSINESS_TYPES = {
    "b2b": "B2B Billing", "b2c": "B2C Retail", "restaurant": "Restaurant",
    "pos": "POS / Counter", "stay": "Stay / Resort / Homestay",
}
DEFAULT_BUSINESS_LIMITS = {
    "included_businesses": 1,          # covered by the main subscription
    "max_businesses": 1,               # hard cap (admin raises it per account)
    "allowed_types": list(BUSINESS_TYPES),
    "addon_price_monthly": 299,        # INR per extra business per month
}


async def platform_business_defaults() -> dict:
    row = await db.platform_settings.find_one({"id": "business_limits"}, {"_id": 0}) or {}
    return {**DEFAULT_BUSINESS_LIMITS, **{k: v for k, v in row.items() if k in DEFAULT_BUSINESS_LIMITS}}


async def owner_business_limits(user_id: str) -> dict:
    base = await platform_business_defaults()
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "business_limits": 1}) or {}
    override = {k: v for k, v in (u.get("business_limits") or {}).items() if k in DEFAULT_BUSINESS_LIMITS and v is not None}
    lim = {**base, **override}
    lim["max_businesses"] = max(int(lim["max_businesses"]), int(lim["included_businesses"]))
    lim["allowed_types"] = [t for t in lim["allowed_types"] if t in BUSINESS_TYPES]
    return lim


async def owned_businesses(user_id: str) -> list:
    return await db.organizations.find(
        {"owner_user_id": user_id, "deleted": {"$ne": True}}, {"_id": 0}).sort("created_at", 1).to_list(200)


async def billing_org_for(org: dict) -> dict:
    """The org whose subscription covers this business (itself unless it's an add-on)."""
    bid = org.get("billing_org_id")
    if bid and bid != org.get("id"):
        parent = await db.organizations.find_one({"id": bid}, {"_id": 0})
        if parent:
            return parent
    return org


async def effective_subscription(org: dict) -> dict:
    summary = subscription_status_summary(await billing_org_for(org))
    if org.get("billing_org_id") and org.get("billing_org_id") != org.get("id"):
        summary["billed_via"] = org["billing_org_id"]
    return summary


class BusinessCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    business_type: str
    state: str = "Tamil Nadu"
    state_code: str = "33"
    gstin: str = ""


async def _business_account(user: dict) -> dict:
    owned = await owned_businesses(user["id"])
    lim = await owner_business_limits(user["id"])
    extra = max(0, len(owned) - lim["included_businesses"])
    return {
        "limits": lim, "owned_count": len(owned),
        "can_add": len(owned) < lim["max_businesses"],
        "extra_businesses": extra,
        "addon_monthly_total": extra * lim["addon_price_monthly"],
        "types": [{"value": k, "label": v, "allowed": k in lim["allowed_types"]} for k, v in BUSINESS_TYPES.items()],
    }


@api.get("/businesses")
async def list_businesses(user=Depends(get_current_user)):
    memberships = await db.memberships.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    rows = []
    for m in memberships:
        org = await db.organizations.find_one({"id": m["org_id"], "deleted": {"$ne": True}}, {"_id": 0,
            "id": 1, "name": 1, "business_type": 1, "gstin": 1, "owner_user_id": 1, "billing_org_id": 1, "created_at": 1})
        if org:
            rows.append({**org, "role": m["role"], "type_label": BUSINESS_TYPES.get(org.get("business_type") or "", "Multi-type (legacy)")})
    rows.sort(key=lambda r: r.get("created_at") or "")
    return {"businesses": rows, "account": await _business_account(user)}


@api.post("/businesses")
async def create_business(body: BusinessCreateIn, request: Request, user=Depends(get_current_user)):
    btype = body.business_type.strip().lower()
    if btype not in BUSINESS_TYPES:
        raise HTTPException(400, "Unknown business type")
    acct = await _business_account(user)
    lim = acct["limits"]
    if btype not in lim["allowed_types"]:
        raise HTTPException(403, f"{BUSINESS_TYPES[btype]} isn't enabled for your account — contact BillingsEasy support")
    if not acct["can_add"]:
        raise HTTPException(402, f"Your account allows {lim['max_businesses']} business"
                                 f"{'es' if lim['max_businesses'] != 1 else ''}. Contact BillingsEasy to add more "
                                 f"(₹{lim['addon_price_monthly']}/month per extra business).")
    owned = await owned_businesses(user["id"])
    billing_root = (await billing_org_for(owned[0]))["id"] if owned else None
    org = await _create_org_internal(body.name.strip(), user["id"], body.state, body.state_code)
    patch = {"business_type": btype, "business_mode": btype, "gstin": body.gstin.strip().upper(),
             "billing_org_id": billing_root or org["id"]}
    if billing_root:
        patch.update({"subscription_status": "addon", "trial_ends_at": None})
    await db.organizations.update_one({"id": org["id"]}, {"$set": patch})
    org.update(patch)
    await audit_log(db, org_id=org["id"], user=user, action="business.created", entity_type="organization",
                    entity_id=org["id"], metadata={"name": org["name"], "type": btype,
                                                   "billing_org_id": patch["billing_org_id"]}, request=request)
    return {**org, "role": "owner", "subscription": await effective_subscription(org)}


# ── Super admin: per-account business limits & pricing ──
class BusinessLimitsIn(BaseModel):
    included_businesses: Optional[int] = None
    max_businesses: Optional[int] = None
    allowed_types: Optional[List[str]] = None
    addon_price_monthly: Optional[float] = None
    note: str = ""


def _clean_limits(body: BusinessLimitsIn) -> dict:
    out = {}
    if body.included_businesses is not None: out["included_businesses"] = max(0, int(body.included_businesses))
    if body.max_businesses is not None: out["max_businesses"] = max(1, int(body.max_businesses))
    if body.allowed_types is not None: out["allowed_types"] = [t for t in body.allowed_types if t in BUSINESS_TYPES]
    if body.addon_price_monthly is not None: out["addon_price_monthly"] = max(0.0, float(body.addon_price_monthly))
    return out


@api.get("/super/business-limits")
async def super_get_business_defaults(user=Depends(require_super_admin)):
    return {"defaults": await platform_business_defaults(), "types": BUSINESS_TYPES}


@api.put("/super/business-limits")
async def super_set_business_defaults(body: BusinessLimitsIn, user=Depends(require_super_admin)):
    data = _clean_limits(body)
    await db.platform_settings.update_one({"id": "business_limits"},
                                          {"$set": {"id": "business_limits", **data, "updated_at": now_iso()}}, upsert=True)
    return await platform_business_defaults()


@api.get("/super/accounts")
async def super_list_accounts(user=Depends(require_super_admin)):
    """Owners with their businesses, effective limits and add-on charges."""
    owner_ids = await db.organizations.distinct("owner_user_id", {"deleted": {"$ne": True}})
    out = []
    for uid in owner_ids:
        if not uid:
            continue
        u = await db.users.find_one({"id": uid}, {"_id": 0, "id": 1, "name": 1, "email": 1, "business_limits": 1})
        if not u:
            continue
        acct = await _business_account(u)
        biz = await owned_businesses(uid)
        out.append({"user": {k: u.get(k) for k in ("id", "name", "email")},
                    "override": u.get("business_limits") or {}, **acct,
                    "businesses": [{"id": b["id"], "name": b["name"],
                                    "business_type": b.get("business_type") or "",
                                    "type_label": BUSINESS_TYPES.get(b.get("business_type") or "", "Multi-type (legacy)"),
                                    "billing_org_id": b.get("billing_org_id"),
                                    "subscription": (await effective_subscription(b))["status"],
                                    "created_at": b.get("created_at")} for b in biz]})
    out.sort(key=lambda a: -a["owned_count"])
    return out


@api.put("/super/accounts/{user_id}/business-limits")
async def super_set_account_limits(user_id: str, body: BusinessLimitsIn, request: Request,
                                   admin=Depends(require_super_admin)):
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1})
    if not u:
        raise HTTPException(404, "User not found")
    data = _clean_limits(body)
    if body.note: data["note"] = body.note
    await db.users.update_one({"id": user_id}, {"$set": {"business_limits": data}})
    return await _business_account({"id": user_id})


@api.get("/super/stats")
async def super_stats(user=Depends(require_super_admin)):
    return {
        "users": await db.users.count_documents({}),
        "organizations": await db.organizations.count_documents({}),
        "active_subscriptions": await db.organizations.count_documents({"subscription_status": "active"}),
        "trialing": await db.organizations.count_documents({"subscription_status": "trialing"}),
        "suspended": await db.organizations.count_documents({"subscription_status": "suspended"}),
        "invoices_total": await db.invoices.count_documents({}),
        "audit_events": await db.audit_logs.count_documents({}),
    }


@api.get("/super/orgs")
async def super_list_orgs(user=Depends(require_super_admin)):
    orgs = await db.organizations.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for o in orgs:
        o["subscription"] = await effective_subscription(o)
        o["usage"] = await org_usage(db, o["id"])
        owner = await db.users.find_one({"id": o.get("owner_user_id")}, {"_id": 0, "password_hash": 0})
        o["owner"] = owner
    return orgs


@api.post("/super/orgs/{org_id}/suspend")
async def super_suspend_org(org_id: str, user=Depends(require_super_admin)):
    await db.organizations.update_one({"id": org_id}, {"$set": {"subscription_status": "suspended"}})
    return {"ok": True}


@api.post("/super/orgs/{org_id}/activate")
async def super_activate_org(org_id: str, user=Depends(require_super_admin)):
    await db.organizations.update_one({"id": org_id}, {"$set": {"subscription_status": "active"}})
    return {"ok": True}


@api.post("/super/orgs/{org_id}/extend-trial")
async def super_extend_trial(org_id: str, days: int = 30, user=Depends(require_super_admin)):
    new_end = (now_dt() + timedelta(days=days)).isoformat()
    await db.organizations.update_one({"id": org_id}, {
        "$set": {"subscription_status": "trialing", "trial_ends_at": new_end}
    })
    return {"ok": True, "trial_ends_at": new_end}


@api.delete("/super/orgs/{org_id}")
async def super_delete_org(org_id: str, user=Depends(require_super_admin)):
    for coll in ("parties", "products", "invoices", "purchases", "payments",
                  "expenses", "bank_accounts", "tds_entries", "memberships",
                  "roles", "audit_logs"):
        await db[coll].delete_many({"org_id": org_id})
    await db.organizations.delete_one({"id": org_id})
    return {"ok": True}


@api.get("/super/users")
async def super_list_users(user=Depends(require_super_admin)):
    rows = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(2000)
    for u in rows:
        u["org_count"] = await db.memberships.count_documents({"user_id": u["id"]})
    return rows



@api.post("/super/users/{user_id}/reset-password")
async def super_reset_password(user_id: str, body: dict = Body(...), user=Depends(require_super_admin)):
    new_pw = body.get("password", "")
    if len(new_pw) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1})
    if not target:
        raise HTTPException(404, "User not found")
    await db.users.update_one({"id": user_id}, {"$set": {"password_hash": hash_password(new_pw)}})
    return {"ok": True, "email": target["email"]}


@api.post("/super/impersonate/{user_id}")
async def super_impersonate(user_id: str, user=Depends(require_super_admin)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(404, "User not found")
    token = create_access_token(target["id"], target["email"])
    m = await db.memberships.find_one({"user_id": target["id"]}, {"_id": 0})
    await db.audit_logs.insert_one({
        "id": secrets.token_hex(8), "org_id": m["org_id"] if m else None,
        "user_id": user["id"], "user_email": user["email"], "user_name": user.get("name"),
        "action": "super.impersonate", "entity_type": "user", "entity_id": user_id,
        "metadata": {"target_email": target["email"]},
        "ip": "", "user_agent": "",
        "timestamp": now_iso(),
    })
    return {"token": token, "user": target, "org_id": m["org_id"] if m else None}


# ---------------- SUPER ADMIN · PAYMENT GATEWAY SETTINGS ----------------
class PaymentSettingsIn(BaseModel):
    environment: str  # MOCK | SANDBOX | PROD
    client_id: str = ""
    client_secret: Optional[str] = None  # null = keep existing
    enabled: bool = False


@api.get("/super/settings/payment")
async def super_get_payment_settings(user=Depends(require_super_admin)):
    doc = await load_payment_settings(db)
    return payment_public_view(doc)


@api.post("/super/settings/payment")
async def super_save_payment_settings(body: PaymentSettingsIn, request: Request,
                                       user=Depends(require_super_admin)):
    env = (body.environment or "MOCK").upper()
    if env not in ("MOCK", "SANDBOX", "PROD"):
        raise HTTPException(400, "Invalid environment")
    if env != "MOCK" and body.enabled:
        # When enabling live mode, require both id + a stored or new secret
        existing = await load_payment_settings(db)
        has_existing_secret = bool(existing.get("client_secret_enc"))
        if not body.client_id.strip():
            raise HTTPException(400, "Client ID is required to enable live mode")
        if not (body.client_secret and body.client_secret.strip()) and not has_existing_secret:
            raise HTTPException(400, "Client Secret is required to enable live mode")
    doc = await save_payment_settings(
        db, environment=env, client_id=body.client_id,
        client_secret=body.client_secret, enabled=body.enabled,
        updated_by=user["email"], now_iso=now_iso(),
    )
    await db.audit_logs.insert_one({
        "id": secrets.token_hex(8), "org_id": None,
        "user_id": user["id"], "user_email": user["email"], "user_name": user.get("name"),
        "action": "super.payment_settings.updated", "entity_type": "system_settings",
        "entity_id": "payment_gateway",
        "metadata": {"environment": env, "enabled": body.enabled,
                     "secret_rotated": bool(body.client_secret and body.client_secret.strip())},
        "ip": client_ip(request), "user_agent": request.headers.get("User-Agent", ""),
        "timestamp": now_iso(),
    })
    return payment_public_view(doc)


@api.post("/super/settings/payment/test")
async def super_test_payment_settings(user=Depends(require_super_admin)):
    """Smoke test — verifies credentials can reach Cashfree (subscriptions list endpoint)."""
    creds = await get_cashfree_credentials(db)
    if creds["is_mock"]:
        return {"ok": True, "mode": "mock", "message": "Mock mode active — no live call made."}
    headers = {
        "x-client-id": creds["client_id"],
        "x-client-secret": creds["client_secret"],
        "x-api-version": CASHFREE_API_VERSION,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{creds['base_url']}/subscriptions", headers=headers)
    except Exception as exc:  # network failure
        raise HTTPException(502, f"Cashfree unreachable: {exc}")
    if r.status_code == 401:
        raise HTTPException(401, "Cashfree rejected credentials (401). Check Client ID/Secret.")
    if r.status_code >= 500:
        raise HTTPException(502, f"Cashfree returned {r.status_code}")
    return {"ok": True, "mode": creds["environment"].lower(),
            "status_code": r.status_code, "base_url": creds["base_url"]}


# ---------------- SUPER ADMIN · LAUNCH OFFER ----------------
class LaunchOfferIn(BaseModel):
    enabled: bool = False
    title: str = ""
    description: str = ""
    plan_codes: List[str] = []
    discount_pct: int = 0
    duration_months: int = 0
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None


@api.get("/super/settings/launch-offer")
async def super_get_launch_offer(user=Depends(require_super_admin)):
    doc = await load_launch_offer(db)
    return launch_offer_admin_view(doc)


@api.post("/super/settings/launch-offer")
async def super_save_launch_offer(body: LaunchOfferIn, request: Request,
                                   user=Depends(require_super_admin)):
    if body.enabled:
        invalid = [c for c in body.plan_codes if c not in PLANS]
        if invalid:
            raise HTTPException(400, f"Unknown plan codes: {', '.join(invalid)}")
        if not body.plan_codes:
            raise HTTPException(400, "Pick at least one plan for the offer to apply to.")
    doc = await save_launch_offer(
        db, enabled=body.enabled, title=body.title, description=body.description,
        plan_codes=body.plan_codes, discount_pct=body.discount_pct,
        duration_months=body.duration_months,
        starts_at=body.starts_at, ends_at=body.ends_at,
        updated_by=user["email"], now_iso=now_iso(),
    )
    await db.audit_logs.insert_one({
        "id": secrets.token_hex(8), "org_id": None,
        "user_id": user["id"], "user_email": user["email"], "user_name": user.get("name"),
        "action": "super.launch_offer.updated", "entity_type": "system_settings",
        "entity_id": "launch_offer",
        "metadata": {"enabled": body.enabled, "discount_pct": body.discount_pct,
                     "plan_codes": body.plan_codes},
        "ip": client_ip(request), "user_agent": request.headers.get("User-Agent", ""),
        "timestamp": now_iso(),
    })
    return launch_offer_admin_view(doc)


# ---------------- PUBLIC INVOICE SHARE LINK ----------------
@api.post("/invoices/{iid}/share-link")
async def create_share_link(iid: str, ctx=Depends(require_permission("invoice.view"))):
    inv = await db.invoices.find_one(org_filter(ctx, {"id": iid}), {"_id": 0, "id": 1, "share_token": 1})
    if not inv:
        raise HTTPException(404, "Not found")
    token = inv.get("share_token") or secrets.token_urlsafe(20)
    await db.invoices.update_one(org_filter(ctx, {"id": iid}), {"$set": {"share_token": token}})
    return {"token": token, "path": f"/p/invoice/{token}"}


@api.get("/public/invoices/{token}")
async def public_invoice(token: str):
    inv = await db.invoices.find_one({"share_token": token}, {"_id": 0, "share_token": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found or link revoked")
    org = await db.organizations.find_one({"id": inv["org_id"]},
        {"_id": 0, "name": 1, "address": 1, "gstin": 1, "pan": 1, "phone": 1, "email": 1,
         "bank_name": 1, "bank_account": 1, "bank_ifsc": 1, "bank_branch": 1, "terms": 1})
    paid = 0
    async for p in db.payments.find({"invoice_id": inv["id"]}, {"_id": 0, "amount": 1}):
        paid += p["amount"]
    inv["paid"] = round(paid, 2)
    inv["due"] = round(inv["totals"]["grand_total"] - paid, 2)
    return {"invoice": inv, "business": org}


@api.get("/public/invoices/{token}/pdf")
async def public_invoice_pdf(token: str):
    inv = await db.invoices.find_one({"share_token": token}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    biz = await db.organizations.find_one({"id": inv["org_id"]}, {"_id": 0})
    pdf = generate_invoice_pdf(inv, biz or {})
    return StreamingResponse(BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="{inv["invoice_no"]}.pdf"'})


# ---------------- BALANCE SHEET + CASH FLOW ----------------
@api.get("/reports/balance-sheet")
async def balance_sheet(ctx=Depends(get_org_ctx)):
    """Simple snapshot — assets vs liabilities + equity."""
    oid = ctx["org_id"]
    receivable = 0; payable = 0
    parties_all = await db.parties.find({"org_id": oid}, {"_id": 0, "id": 1, "type": 1, "opening_balance": 1}).to_list(2000)
    balances = await bulk_party_balances(oid, parties_all)
    for p in parties_all:
        if p["type"] == "customer": receivable += balances[p["id"]]
        else: payable += balances[p["id"]]
    stock_value = 0
    async for prod in db.products.find({"org_id": oid}, {"_id": 0, "stock": 1, "purchase_price": 1}):
        stock_value += (prod.get("stock", 0) or 0) * (prod.get("purchase_price", 0) or 0)
    bank_value = 0
    async for b in db.bank_accounts.find({"org_id": oid}, {"_id": 0, "opening_balance": 1}):
        bank_value += b.get("opening_balance", 0)

    assets = [
        {"label": "Cash & Bank", "amount": round(bank_value, 2)},
        {"label": "Accounts Receivable", "amount": round(receivable, 2)},
        {"label": "Stock / Inventory (at cost)", "amount": round(stock_value, 2)},
    ]
    liab = [
        {"label": "Accounts Payable", "amount": round(payable, 2)},
    ]
    total_assets = sum(x["amount"] for x in assets)
    total_liab = sum(x["amount"] for x in liab)
    equity = total_assets - total_liab
    return {"assets": assets, "liabilities": liab,
            "total_assets": round(total_assets, 2),
            "total_liabilities": round(total_liab, 2),
            "equity": round(equity, 2)}


@api.get("/reports/cash-flow")
async def cash_flow(month: Optional[str] = None, ctx=Depends(get_org_ctx)):
    """Cash in (payments received) vs cash out (payments paid + expenses) for a month or all-time."""
    oid = ctx["org_id"]
    q_pay = {"org_id": oid}
    q_exp = {"org_id": oid}
    if month:
        q_pay["date"] = {"$regex": f"^{month}"}
        q_exp["date"] = {"$regex": f"^{month}"}
    in_total = out_total = exp_total = 0
    in_by_mode: Dict[str, float] = {}
    out_by_mode: Dict[str, float] = {}
    async for r in db.payments.aggregate([
        {"$match": {**q_pay, "direction": "received"}},
        {"$group": {"_id": "$mode", "total": {"$sum": "$amount"}}},
    ]):
        in_by_mode[r["_id"] or "Other"] = r["total"]; in_total += r["total"]
    async for r in db.payments.aggregate([
        {"$match": {**q_pay, "direction": "paid"}},
        {"$group": {"_id": "$mode", "total": {"$sum": "$amount"}}},
    ]):
        out_by_mode[r["_id"] or "Other"] = r["total"]; out_total += r["total"]
    async for e in db.expenses.find(q_exp, {"_id": 0, "amount": 1}):
        exp_total += e["amount"]
    net = in_total - out_total - exp_total
    return {
        "month": month, "in_total": round(in_total, 2), "out_total": round(out_total, 2),
        "expenses": round(exp_total, 2), "net_cash_flow": round(net, 2),
        "in_by_mode": {k: round(v, 2) for k, v in in_by_mode.items()},
        "out_by_mode": {k: round(v, 2) for k, v in out_by_mode.items()},
    }


# ---------------- Support Chat ----------------

@api.get("/chat/messages")
async def get_chat_messages(ctx=Depends(get_org_ctx)):
    msgs = []
    async for m in db.chat_messages.find({"org_id": ctx["org_id"]}, {"_id": 0}).sort("created_at", 1):
        msgs.append(m)
    # Mark user messages as read by user (admin replies)
    await db.chat_messages.update_many(
        {"org_id": ctx["org_id"], "sender": "admin", "read_by_user": False},
        {"$set": {"read_by_user": True}}
    )
    return msgs

@api.post("/chat/messages")
async def send_chat_message(body: dict, ctx=Depends(get_org_ctx)):
    text = (body.get("message") or "").strip()
    if not text:
        raise HTTPException(400, "Message required")
    msg = {
        "id": str(uuid.uuid4()),
        "org_id": ctx["org_id"],
        "user_email": ctx["user"]["email"],
        "user_name": ctx["user"].get("name", ctx["user"]["email"]),
        "message": text,
        "sender": "user",
        "read_by_admin": False,
        "read_by_user": True,
        "created_at": now_iso(),
    }
    await db.chat_messages.insert_one(msg)
    return {k: v for k, v in msg.items() if k != "_id"}

@api.get("/chat/unread")
async def get_unread_count(ctx=Depends(get_org_ctx)):
    count = await db.chat_messages.count_documents(
        {"org_id": ctx["org_id"], "sender": "admin", "read_by_user": False}
    )
    return {"count": count}

# Super admin: get all threads
@api.get("/super/chat/threads")
async def super_chat_threads(user=Depends(get_current_user)):
    if not user.get("is_super_admin"):
        raise HTTPException(403, "Super admin only")
    pipeline = [
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$org_id",
            "last_message": {"$first": "$message"},
            "last_sender": {"$first": "$sender"},
            "last_at": {"$first": "$created_at"},
            "user_email": {"$first": "$user_email"},
            "user_name": {"$first": "$user_name"},
            "unread": {"$sum": {"$cond": [{"$eq": ["$read_by_admin", False]}, 1, 0]}},
        }},
        {"$sort": {"last_at": -1}},
    ]
    threads = []
    async for t in db.chat_messages.aggregate(pipeline):
        threads.append({
            "org_id": t["_id"],
            "user_email": t["user_email"],
            "user_name": t["user_name"],
            "last_message": t["last_message"],
            "last_sender": t["last_sender"],
            "last_at": t["last_at"],
            "unread": t["unread"],
        })
    return threads

@api.get("/super/chat/messages/{org_id}")
async def super_get_thread(org_id: str, user=Depends(get_current_user)):
    if not user.get("is_super_admin"):
        raise HTTPException(403, "Super admin only")
    msgs = []
    async for m in db.chat_messages.find({"org_id": org_id}, {"_id": 0}).sort("created_at", 1):
        msgs.append(m)
    # Mark as read by admin
    await db.chat_messages.update_many(
        {"org_id": org_id, "sender": "user", "read_by_admin": False},
        {"$set": {"read_by_admin": True}}
    )
    return msgs

@api.post("/super/chat/reply")
async def super_chat_reply(body: dict, user=Depends(get_current_user)):
    if not user.get("is_super_admin"):
        raise HTTPException(403, "Super admin only")
    org_id = (body.get("org_id") or "").strip()
    text = (body.get("message") or "").strip()
    if not org_id or not text:
        raise HTTPException(400, "org_id and message required")
    msg = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "user_email": "admin",
        "user_name": "BillingsEasy Support",
        "message": text,
        "sender": "admin",
        "read_by_admin": True,
        "read_by_user": False,
        "created_at": now_iso(),
    }
    await db.chat_messages.insert_one(msg)
    return {k: v for k, v in msg.items() if k != "_id"}

@api.get("/super/chat/unread")
async def super_unread(user=Depends(get_current_user)):
    if not user.get("is_super_admin"):
        raise HTTPException(403, "Super admin only")
    count = await db.chat_messages.count_documents({"sender": "user", "read_by_admin": False})
    return {"count": count}


# ---------------- Seed ----------------
@api.post("/seed/demo")
async def seed(user=Depends(get_current_user)):
    # only the demo owner can reseed
    if user["email"] != os.environ.get("ADMIN_EMAIL", "owner@vijaytraders.in"):
        raise HTTPException(403, "Only the demo owner can reseed")
    await seed_demo_data(db, hash_password)
    return {"ok": True}


# ---------------- Bootstrap ----------------
@app.on_event("startup")
async def on_startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.memberships.create_index([("user_id", 1), ("org_id", 1)], unique=True)
        await db.organizations.create_index("id", unique=True)
        # Website orders must never create two invoices (webhook retries)
        await db.invoices.create_index(
            [("org_id", 1), ("external_source", 1), ("external_id", 1)], unique=True,
            partialFilterExpression={"external_id": {"$type": "string"}}, name="uniq_external_order")
        await db.integration_keys.create_index("key_hash", unique=True)
        if await db.users.count_documents({}) == 0:
            await seed_demo_data(db, hash_password)
            logger.info("Seeded demo data")
        # Auto-promote SUPER_ADMIN_EMAIL env var to super admin on every startup
        super_email = os.getenv("SUPER_ADMIN_EMAIL", "").strip().lower()
        if super_email:
            result = await db.users.update_one(
                {"email": super_email},
                {"$set": {"is_super_admin": True}}
            )
            if result.modified_count:
                logger.info(f"Promoted {super_email} to super admin")
            elif result.matched_count == 0:
                logger.warning(f"SUPER_ADMIN_EMAIL {super_email} not found in users — register first")
        logger.info("Database connected and ready")
    except Exception as e:
        logger.error(f"Startup error (non-fatal): {e}")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


# ═══════════════════════════════════════════════════════════════════════════
# 🃏  COUPLES POKER — multiplayer Texas Hold'em (in-memory, no auth needed)
# Registered BEFORE include_router so FastAPI picks up the routes correctly.
# ═══════════════════════════════════════════════════════════════════════════
import random as _random
from itertools import combinations as _combs

_POKER_ROOMS: dict = {}          # room_id -> room dict (in-memory is fine for a fun game)
_P_NAMES = ["Subhi", "Viju"]
_HAND_NAMES = [
    "High Card","One Pair","Two Pair","Three of a Kind",
    "Straight","Flush","Full House","Four of a Kind","Straight Flush","Royal Flush",
]
_VAL = {str(i):i for i in range(2,11)}
_VAL.update({"J":11,"Q":12,"K":13,"A":14})

def _make_deck():
    d = [{"s":s,"r":r,"v":_VAL[r]} for s in ["S","H","D","C"] for r in list(_VAL.keys())]
    _random.shuffle(d)
    return d

def _sc5(h):
    vs = sorted([c["v"] for c in h], reverse=True)
    is_f = len({c["s"] for c in h}) == 1
    is_s = len(set(vs)) == 5 and vs[0]-vs[4] == 4
    is_w = vs == [14,5,4,3,2]
    f: dict = {}
    for v in vs: f[v] = f.get(v,0)+1
    gs = sorted(f.items(), key=lambda x:(-x[1],-x[0]))
    v1,c1 = int(gs[0][0]), gs[0][1]
    v2,c2 = (int(gs[1][0]), gs[1][1]) if len(gs)>1 else (0,0)
    top = 5 if is_w else vs[0]
    if is_f and (is_s or is_w): return [9 if vs[0]==14 and is_s else 8, top]
    if c1==4: return [7,v1,v2]
    if c1==3 and c2==2: return [6,v1,v2]
    if is_f: return [5]+vs
    if is_s or is_w: return [4,top]
    if c1==3: return [3,v1,v2,int(gs[2][0])]
    if c1==2 and c2==2: return [2,max(v1,v2),min(v1,v2),int(gs[2][0])]
    if c1==2: return [1,v1]+[v for v in vs if v!=v1][:3]
    return [0]+vs

def _best_hand(hole, comm):
    all_cards = list(hole) + list(comm)
    best = None
    for combo in _combs(all_cards, 5):
        sc = _sc5(list(combo))
        if best is None: best = sc; continue
        for a,b in zip(sc, best+[0]*10):
            if a>b: best=sc; break
            if a<b: break
    return best or [0]

def _cmp(a,b):
    for x,y in zip(a, b+[0]*10):
        if x!=y: return x-y
    return 0

SB_BLIND, BB_BLIND = 10, 20

def _new_poker_game(chips=None, dealer="Subhi"):
    chips = chips or {"Subhi":1000,"Viju":1000}
    other = "Viju" if dealer=="Subhi" else "Subhi"
    sb,bb = dealer, other
    d = _make_deck()
    return {
        "comm":     d[4:9],
        "revealed": 0,
        "pot":      SB_BLIND+BB_BLIND,
        "players": {
            sb: {"chips": chips[sb]-SB_BLIND, "hole": d[0:2], "folded": False, "roundBet": SB_BLIND},
            bb: {"chips": chips[bb]-BB_BLIND, "hole": d[2:4], "folded": False, "roundBet": BB_BLIND},
        },
        "currentBet": BB_BLIND,
        "actor": sb,
        "acted":  {sb: False, bb: False},
        "stage":  "preflop",
        "winner": None,
        "winHand": "",
        "dealer": dealer,
        "msg": f"Pre-flop: {sb} posts SB ₹{SB_BLIND} · {bb} posts BB ₹{BB_BLIND}. {sb} to act first.",
    }

def _advance_poker(game):
    p = game["players"]
    other = "Viju" if game["actor"]=="Subhi" else "Subhi"
    # Check if round is over
    if p[other]["folded"] or (
        game["acted"]["Subhi"] and game["acted"]["Viju"] and
        p["Subhi"]["roundBet"] == p["Viju"]["roundBet"]
    ):
        _next_stage(game)
    else:
        game["actor"] = other
        game["msg"] = f"{other}'s turn 🎴"

def _next_stage(game):
    NEXT = {"preflop":"flop","flop":"turn","turn":"river","river":"showdown"}
    REVEAL = {"flop":3,"turn":4,"river":5}
    nxt = NEXT.get(game["stage"])
    if not nxt or nxt=="showdown":
        _do_showdown(game); return
    game["stage"] = nxt
    game["revealed"] = REVEAL[nxt]
    game["currentBet"] = 0
    for pd in game["players"].values(): pd["roundBet"] = 0
    game["acted"] = {"Subhi": False, "Viju": False}
    bb = "Viju" if game["dealer"]=="Subhi" else "Subhi"
    game["actor"] = bb
    game["msg"] = f"{nxt.capitalize()} 🎴 {bb} to act first."

def _do_showdown(game):
    game["stage"] = "showdown"; game["revealed"] = 5
    p = game["players"]
    s0 = _best_hand(p["Subhi"]["hole"], game["comm"])
    s1 = _best_hand(p["Viju"]["hole"],  game["comm"])
    c  = _cmp(s0, s1)
    hn = _HAND_NAMES
    if c>0:
        p["Subhi"]["chips"]+=game["pot"]; game["winner"]="Subhi"; game["winHand"]=hn[s0[0]]
        game["msg"]=f"🎉 Subhi wins ₹{game['pot']} with {hn[s0[0]]}!"
    elif c<0:
        p["Viju"]["chips"]+=game["pot"];  game["winner"]="Viju";  game["winHand"]=hn[s1[0]]
        game["msg"]=f"🎉 Viju wins ₹{game['pot']} with {hn[s1[0]]}!"
    else:
        half=game["pot"]//2
        p["Subhi"]["chips"]+=half; p["Viju"]["chips"]+=game["pot"]-half
        game["winner"]="tie"; game["winHand"]=hn[s0[0]]
        game["msg"]=f"🤝 Tie! {hn[s0[0]]} — pot split."
    game["pot"]=0

# ── Poker HTTP endpoints (registered directly on app with /api prefix) ─────
@app.get("/api/poker/{room_id}/join")
async def poker_join(room_id: str, player: str):
    if player not in _P_NAMES:
        raise HTTPException(400, "Player must be Subhi or Viju")
    if room_id not in _POKER_ROOMS:
        _POKER_ROOMS[room_id] = {"game": None, "connected": [], "chips": {"Subhi":1000,"Viju":1000}, "chat": []}
    room = _POKER_ROOMS[room_id]
    if player not in room["connected"]:
        room["connected"].append(player)
    if len(room["connected"]) == 2 and room["game"] is None:
        room["game"] = _new_poker_game(room["chips"])
    return {"ok": True, "connected": room["connected"], "ready": len(room["connected"]) >= 2}

@app.get("/api/poker/{room_id}/state")
async def poker_state(room_id: str, player: str):
    if room_id not in _POKER_ROOMS:
        return {"ok": False, "msg": "Room not found"}
    room = _POKER_ROOMS[room_id]
    game = room.get("game")
    if game is None:
        return {"ok": True, "game": None, "connected": room["connected"]}
    # Filter opponent hole cards (hidden until showdown)
    fp = {}
    for pname, pd in game["players"].items():
        fd = {**pd}
        if pname != player and game["stage"] != "showdown":
            fd["hole"] = None
        fp[pname] = fd
    out = {**game, "players": fp, "commVisible": game["comm"][:game["revealed"]]}
    out.pop("comm", None)
    return {"ok": True, "game": out, "connected": room["connected"], "chat": room.get("chat", [])[-50:]}

@app.post("/api/poker/{room_id}/action")
async def poker_action(room_id: str, player: str, action: str, amount: int = 0):
    if room_id not in _POKER_ROOMS:
        raise HTTPException(404, "Room not found")
    room  = _POKER_ROOMS[room_id]
    game  = room.get("game")
    if game is None:         raise HTTPException(400, "Game not started yet")
    if game["winner"] is not None: raise HTTPException(400, "Hand is over")
    if game["actor"] != player:
        raise HTTPException(400, f"Not your turn — {game['actor']} to act")

    p     = game["players"]
    other = "Viju" if player=="Subhi" else "Subhi"

    if action == "fold":
        p[player]["folded"] = True
        p[other]["chips"] += game["pot"]
        game["winner"] = other; game["pot"] = 0
        game["stage"]  = "showdown"; game["revealed"] = 5
        game["msg"]    = f"{player} folds 🏳️  {other} wins the pot!"

    elif action in ("check","call"):
        amt = min(game["currentBet"]-p[player]["roundBet"], p[player]["chips"])
        if amt > 0:
            game["pot"] += amt; p[player]["chips"] -= amt
            p[player]["roundBet"] = game["currentBet"]
        game["acted"][player] = True
        _advance_poker(game)

    elif action == "raise":
        call_amt = game["currentBet"] - p[player]["roundBet"]
        pay = min(call_amt + amount, p[player]["chips"])
        game["pot"]              += pay
        p[player]["chips"]       -= pay
        game["currentBet"]       += amount
        p[player]["roundBet"]     = game["currentBet"]
        game["acted"]             = {player: True, other: False}
        game["actor"]             = other
        game["msg"]               = f"{player} raises to ₹{game['currentBet']}. {other} to respond."

    return {"ok": True}

@app.post("/api/poker/{room_id}/deal")
async def poker_deal(room_id: str):
    if room_id not in _POKER_ROOMS:
        raise HTTPException(404)
    room = _POKER_ROOMS[room_id]
    game = room.get("game")
    if game is None or game.get("winner") is None:
        raise HTTPException(400, "Hand not finished")
    chips  = {p: d["chips"] for p,d in game["players"].items()}
    dealer = "Viju" if game["dealer"]=="Subhi" else "Subhi"
    room["chips"] = chips
    room["game"]  = _new_poker_game(chips, dealer)
    return {"ok": True}

@app.post("/api/poker/{room_id}/chat")
async def poker_chat(room_id: str, player: str, msg: str):
    import time as _time
    if room_id not in _POKER_ROOMS:
        raise HTTPException(404, "Room not found")
    room = _POKER_ROOMS[room_id]
    if "chat" not in room:
        room["chat"] = []
    # Keep last 100 messages
    room["chat"].append({"player": player, "msg": msg[:200], "t": int(_time.time())})
    if len(room["chat"]) > 100:
        room["chat"] = room["chat"][-100:]
    return {"ok": True}

@app.delete("/api/poker/{room_id}/leave")
async def poker_leave(room_id: str, player: str):
    if room_id in _POKER_ROOMS:
        room = _POKER_ROOMS[room_id]
        if player in room["connected"]:
            room["connected"].remove(player)
        if not room["connected"]:
            del _POKER_ROOMS[room_id]
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════════════
# 🃏  RUMMY  — Indian Points Rummy, 13-card, wild joker
# ══════════════════════════════════════════════════════════════════════════════
_RUMMY_ROOMS: dict = {}
_RUM_PTS  = {"A":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":10,"Q":10,"K":10}
_RUM_SEQ  = {"A":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13}

def _rum_deck():
    d=[{"r":r,"s":s} for s in ["S","H","D","C"] for r in ["A","2","3","4","5","6","7","8","9","10","J","Q","K"]]
    _random.shuffle(d); return d

def _new_rummy(scores=None, dealer="Subhi"):
    scores = scores or {"Subhi":0,"Viju":0}
    d = _rum_deck()
    hands = {"Subhi":d[:13],"Viju":d[13:26]}
    rest  = d[26:]
    joker = rest.pop(0)
    first_disc = rest.pop(0)
    first = "Viju" if dealer=="Subhi" else "Subhi"
    return {
        "hands":hands, "stock":rest, "discard":[first_disc], "joker":joker,
        "actor":first, "dealer":dealer, "drawn":False,
        "stage":"playing","winner":None,"loser_points":0,"scores":scores,
        "msg":f"Wild Joker: {joker['r']} ✨  {first} goes first.",
    }

def _sv(r): return _RUM_SEQ.get(r,0)

def _rum_pure_seq(cards, jrank):
    if len(cards)<3: return False
    if any(c["r"]==jrank for c in cards): return False
    if len(set(c["s"] for c in cards))>1: return False
    vals=sorted(_sv(c["r"]) for c in cards)
    if len(vals)!=len(set(vals)): return False
    return all(vals[i]+1==vals[i+1] for i in range(len(vals)-1))

def _rum_impure_seq(cards, jrank):
    if len(cards)<3: return False
    jokers=[c for c in cards if c["r"]==jrank]
    norms =[c for c in cards if c["r"]!=jrank]
    if not norms: return False
    if len(set(c["s"] for c in norms))>1: return False
    vals=sorted(_sv(c["r"]) for c in norms)
    if len(vals)!=len(set(vals)): return False
    if not jokers:
        return all(vals[i]+1==vals[i+1] for i in range(len(vals)-1))
    gaps=sum(vals[i+1]-vals[i]-1 for i in range(len(vals)-1))
    if gaps>len(jokers): return False
    extra=len(jokers)-gaps
    return (vals[-1]-vals[0]+1)+extra==len(cards)

def _rum_set(cards, jrank):
    if len(cards)<3 or len(cards)>4: return False
    norms=[c for c in cards if c["r"]!=jrank]
    if not norms: return False
    if len(set(c["r"] for c in norms))>1: return False
    suits=[c["s"] for c in norms]
    return len(suits)==len(set(suits))

def _rum_validate(groups, joker):
    jrank=joker["r"]
    total=sum(len(g) for g in groups)
    if total!=13: return False,f"Groups cover {total} cards (need 13)"
    pure=0; seqs=0
    for g in groups:
        if _rum_pure_seq(g,jrank): pure+=1; seqs+=1
        elif _rum_impure_seq(g,jrank): seqs+=1
        elif not _rum_set(g,jrank):
            return False,f"Invalid group: {[c['r']+c['s'] for c in g]}"
    if pure<1: return False,"Need ≥1 pure sequence (no wild joker)"
    if seqs<2: return False,"Need ≥2 sequences total"
    return True,"Valid!"

def _rum_pts(hand,jrank):
    return min(80,sum(_RUM_PTS.get(c["r"],10) for c in hand if c["r"]!=jrank))

from pydantic import BaseModel as _PBM
class _RumDecBody(_PBM):
    discard: dict
    groups: list

@app.get("/api/rummy/{room_id}/join")
async def rummy_join(room_id:str, player:str):
    if player not in ("Subhi","Viju"): raise HTTPException(400,"Invalid player")
    if room_id not in _RUMMY_ROOMS:
        _RUMMY_ROOMS[room_id]={"game":None,"connected":[],"scores":{"Subhi":0,"Viju":0},"chat":[]}
    room=_RUMMY_ROOMS[room_id]
    if player not in room["connected"]: room["connected"].append(player)
    if len(room["connected"])==2 and room["game"] is None:
        room["game"]=_new_rummy(room["scores"])
    return {"ok":True,"connected":room["connected"],"ready":len(room["connected"])>=2}

@app.get("/api/rummy/{room_id}/state")
async def rummy_state(room_id:str, player:str):
    if room_id not in _RUMMY_ROOMS: return {"ok":False,"msg":"Room not found"}
    room=_RUMMY_ROOMS[room_id]
    game=room.get("game")
    if game is None:
        return {"ok":True,"game":None,"connected":room["connected"],"chat":room.get("chat",[])[-50:]}
    other="Viju" if player=="Subhi" else "Subhi"
    out={
        "myHand":       game["hands"][player],
        "opponentCount":len(game["hands"][other]),
        "opponentHand": game["hands"][other] if game["stage"]=="finished" else None,
        "discardTop":   game["discard"][-1] if game["discard"] else None,
        "stockCount":   len(game["stock"]),
        "joker":        game["joker"],
        "actor":        game["actor"],
        "drawn":        game["drawn"],
        "stage":        game["stage"],
        "winner":       game["winner"],
        "loser_points": game.get("loser_points",0),
        "scores":       game.get("scores",{}),
        "msg":          game["msg"],
        "invalidMsg":   game.get("invalidMsg",""),
    }
    return {"ok":True,"game":out,"connected":room["connected"],"chat":room.get("chat",[])[-50:]}

@app.post("/api/rummy/{room_id}/draw")
async def rummy_draw(room_id:str, player:str, source:str="stock"):
    if room_id not in _RUMMY_ROOMS: raise HTTPException(404)
    room=_RUMMY_ROOMS[room_id]; game=room.get("game")
    if not game or game["stage"]!="playing": raise HTTPException(400,"Game not active")
    if game["actor"]!=player: raise HTTPException(400,"Not your turn")
    if game["drawn"]: raise HTTPException(400,"Already drew this turn")
    if source=="discard":
        if not game["discard"]: raise HTTPException(400,"Discard pile empty")
        card=game["discard"].pop()
        game["msg"]=f"{player} picked from discard pile."
    else:
        if not game["stock"]:
            top=game["discard"][-1]; game["stock"]=game["discard"][:-1]
            _random.shuffle(game["stock"]); game["discard"]=[top]
        card=game["stock"].pop()
        game["msg"]=f"{player} drew from stock."
    game["hands"][player].append(card); game["drawn"]=True
    return {"ok":True,"card":card}

@app.post("/api/rummy/{room_id}/discard")
async def rummy_discard(room_id:str, player:str, card_index:int):
    if room_id not in _RUMMY_ROOMS: raise HTTPException(404)
    room=_RUMMY_ROOMS[room_id]; game=room.get("game")
    if not game or game["stage"]!="playing": raise HTTPException(400)
    if game["actor"]!=player: raise HTTPException(400,"Not your turn")
    if not game["drawn"]: raise HTTPException(400,"Draw a card first")
    hand=game["hands"][player]
    if card_index<0 or card_index>=len(hand): raise HTTPException(400,"Bad index")
    disc=hand.pop(card_index); game["discard"].append(disc)
    other="Viju" if player=="Subhi" else "Subhi"
    game["actor"]=other; game["drawn"]=False
    game["msg"]=f"{player} discarded {disc['r']}{disc['s']}. {other}'s turn."
    return {"ok":True}

@app.post("/api/rummy/{room_id}/declare")
async def rummy_declare(room_id:str, player:str, body:_RumDecBody):
    if room_id not in _RUMMY_ROOMS: raise HTTPException(404)
    room=_RUMMY_ROOMS[room_id]; game=room.get("game")
    if not game or game["stage"]!="playing": raise HTTPException(400)
    if game["actor"]!=player: raise HTTPException(400,"Not your turn")
    if not game["drawn"]: raise HTTPException(400,"Draw first")
    hand=game["hands"][player]
    dc=body.discard
    try:
        idx=next(i for i,c in enumerate(hand) if c["r"]==dc["r"] and c["s"]==dc["s"])
        hand.pop(idx)
    except StopIteration:
        raise HTTPException(400,"Discard card not in hand")
    game["discard"].append(dc)
    valid,reason=_rum_validate(body.groups,game["joker"])
    other="Viju" if player=="Subhi" else "Subhi"
    if valid:
        pts=_rum_pts(game["hands"][other],game["joker"]["r"])
        game["scores"][other]=game["scores"].get(other,0)+pts
        game["winner"]=player; game["loser_points"]=pts; game["stage"]="finished"
        game["msg"]=f"🎉 {player} declares! {other} gets {pts} penalty points."
        game["invalidMsg"]=""
    else:
        game["scores"][player]=game["scores"].get(player,0)+80
        game["winner"]=other; game["loser_points"]=80; game["stage"]="finished"
        game["msg"]=f"❌ Invalid declare by {player}! +80 penalty. {other} wins."
        game["invalidMsg"]=reason
    return {"ok":True,"valid":valid,"reason":reason}

@app.post("/api/rummy/{room_id}/deal")
async def rummy_new_deal(room_id:str):
    if room_id not in _RUMMY_ROOMS: raise HTTPException(404)
    room=_RUMMY_ROOMS[room_id]; game=room.get("game")
    if not game or game.get("stage")!="finished": raise HTTPException(400)
    scores=game.get("scores",{"Subhi":0,"Viju":0})
    dealer="Viju" if game["dealer"]=="Subhi" else "Subhi"
    room["scores"]=scores; room["game"]=_new_rummy(scores,dealer)
    return {"ok":True}

@app.delete("/api/rummy/{room_id}/leave")
async def rummy_leave(room_id:str, player:str):
    if room_id in _RUMMY_ROOMS:
        room=_RUMMY_ROOMS[room_id]
        if player in room["connected"]: room["connected"].remove(player)
        if not room["connected"]: del _RUMMY_ROOMS[room_id]
    return {"ok":True}

@app.post("/api/rummy/{room_id}/chat")
async def rummy_chat(room_id:str, player:str, msg:str):
    import time as _time
    if room_id not in _RUMMY_ROOMS: raise HTTPException(404)
    room=_RUMMY_ROOMS[room_id]
    if "chat" not in room: room["chat"]=[]
    room["chat"].append({"player":player,"msg":msg[:200],"t":int(_time.time())})
    if len(room["chat"])>100: room["chat"]=room["chat"][-100:]
    return {"ok":True}


# ═══════════════════════════════════════════════════════════════════════════════
#  🎮 IT TAKES TWO — Co-op Adventure Game
# ═══════════════════════════════════════════════════════════════════════════════

import random as _rnd
import math as _math
import time as _adv_time

_ADV_ROOMS: dict = {}

SYMBOLS = ["🔴","🔵","🟡","🟢","🟣","🟠","⭐","💎"]

MAZE_W, MAZE_H = 7, 7  # odd dimensions for clean maze gen

def _gen_maze(w=MAZE_W, h=MAZE_H):
    """Generate a maze using recursive backtracking. Returns 2D grid: 0=path, 1=wall."""
    grid = [[1]*w for _ in range(h)]
    def carve(cx, cy):
        dirs = [(0,2),(0,-2),(2,0),(-2,0)]
        _rnd.shuffle(dirs)
        for dx, dy in dirs:
            nx, ny = cx+dx, cy+dy
            if 0<=nx<w and 0<=ny<h and grid[ny][nx]==1:
                grid[cy+dy//2][cx+dx//2]=0
                grid[ny][nx]=0
                carve(nx,ny)
    grid[1][1]=0
    carve(1,1)
    grid[1][1]=0
    grid[h-2][w-2]=0
    return grid

def _new_adv():
    seq = _rnd.sample(SYMBOLS, 4)
    maze = _gen_maze()
    return {
        "players": {},
        "chat": [],
        "level": 1,
        "completed": [],   # levels completed
        "won": False,
        # Level 1 — The Code
        "code_seq": seq,
        "code_input": [],
        "code_attempts": 0,
        "code_done": False,
        "code_failed": False,
        # Level 2 — The Balance
        "balance_pos": 0.0,       # -1.0 … 1.0, 0 = centre
        "balance_hold": 0,        # frames held in zone
        "balance_done": False,
        "balance_last": 0,
        # Level 3 — The Maze
        "maze": maze,
        "maze_px": 1, "maze_py": 1,   # player position
        "maze_done": False,
    }

@api.post("/adventure/{room}/join")
async def adv_join(room:str, player:str):
    if room not in _ADV_ROOMS:
        _ADV_ROOMS[room] = _new_adv()
    r = _ADV_ROOMS[room]
    if player not in r["players"]:
        if len(r["players"]) >= 2:
            return {"ok":False,"msg":"Room full"}
        r["players"][player] = True
    return {"ok":True}

@api.get("/adventure/{room}/state")
async def adv_state(room:str, player:str):
    if room not in _ADV_ROOMS:
        return {"ok":False,"msg":"Room not found"}
    r = _ADV_ROOMS[room]
    connected = list(r["players"].keys())
    players = [p for p in ["Subhi","Viju"] if p in r["players"]]
    # Assign roles deterministically: first joiner = "revealer", second = "actor"
    # Subhi always sees the code; Viju always has the buttons
    role = "revealer" if player=="Subhi" else "actor"

    base = {
        "ok": True,
        "connected": connected,
        "level": r["level"],
        "completed": r["completed"],
        "won": r["won"],
        "role": role,
        "chat": r["chat"][-50:],
        # Level 1
        "code_done": r["code_done"],
        "code_failed": r["code_failed"],
        "code_attempts": r["code_attempts"],
        "code_input": r["code_input"],
        # Level 2
        "balance_pos": r["balance_pos"],
        "balance_hold": r["balance_hold"],
        "balance_done": r["balance_done"],
        # Level 3
        "maze": r["maze"],
        "maze_px": r["maze_px"],
        "maze_py": r["maze_py"],
        "maze_done": r["maze_done"],
    }
    # Only the revealer (Subhi) sees the code sequence
    if role == "revealer":
        base["code_seq"] = r["code_seq"]
    return base

@api.post("/adventure/{room}/code_press")
async def adv_code_press(room:str, player:str, symbol:str):
    if room not in _ADV_ROOMS: return {"ok":False}
    r = _ADV_ROOMS[room]
    if r["level"]!=1 or r["code_done"] or r["code_failed"]: return {"ok":False}
    r["code_input"].append(symbol)
    pos = len(r["code_input"])-1
    if r["code_input"][pos] != r["code_seq"][pos]:
        # Wrong — fail this attempt
        r["code_attempts"] += 1
        r["code_input"] = []
        if r["code_attempts"] >= 3:
            r["code_failed"] = True
        return {"ok":True,"wrong":True}
    if len(r["code_input"]) == 4:
        r["code_done"] = True
        r["completed"].append(1)
        r["level"] = 2
        r["code_input"] = []
    return {"ok":True,"wrong":False}

@api.post("/adventure/{room}/code_reset")
async def adv_code_reset(room:str):
    if room not in _ADV_ROOMS: return {"ok":False}
    r = _ADV_ROOMS[room]
    seq = _rnd.sample(SYMBOLS, 4)
    r["code_seq"] = seq
    r["code_input"] = []
    r["code_attempts"] = 0
    r["code_failed"] = False
    r["code_done"] = False
    return {"ok":True}

@api.post("/adventure/{room}/balance_push")
async def adv_balance(room:str, player:str, direction:str):
    """direction: left | right"""
    if room not in _ADV_ROOMS: return {"ok":False}
    r = _ADV_ROOMS[room]
    if r["level"]!=2 or r["balance_done"]: return {"ok":False}
    delta = -0.08 if direction=="left" else 0.08
    r["balance_pos"] = max(-1.0, min(1.0, r["balance_pos"]+delta))
    # Natural drift back toward 0 (gravity)
    r["balance_pos"] *= 0.95
    # Check hold in zone
    now = int(_adv_time.time()*10)
    if abs(r["balance_pos"]) < 0.15:
        if r["balance_last"]==0: r["balance_last"]=now
        held = now - r["balance_last"]
        r["balance_hold"] = held
        if held >= 30:   # 3 seconds at ~10 updates/sec
            r["balance_done"] = True
            r["completed"].append(2)
            r["level"] = 3
    else:
        r["balance_last"] = 0
        r["balance_hold"] = 0
    return {"ok":True}

@api.post("/adventure/{room}/maze_move")
async def adv_maze(room:str, player:str, direction:str):
    """direction: up|down|left|right"""
    if room not in _ADV_ROOMS: return {"ok":False}
    r = _ADV_ROOMS[room]
    if r["level"]!=3 or r["maze_done"]: return {"ok":False}
    dx,dy = {"up":(0,-1),"down":(0,1),"left":(-1,0),"right":(1,0)}.get(direction,(0,0))
    nx,ny = r["maze_px"]+dx, r["maze_py"]+dy
    maze = r["maze"]
    if 0<=nx<MAZE_W and 0<=ny<MAZE_H and maze[ny][nx]==0:
        r["maze_px"],r["maze_py"] = nx,ny
        if nx==MAZE_W-2 and ny==MAZE_H-2:
            r["maze_done"] = True
            r["completed"].append(3)
            r["won"] = True
    return {"ok":True}

@api.post("/adventure/{room}/chat")
async def adv_chat(room:str, player:str, msg:str):
    if room not in _ADV_ROOMS: return {"ok":False}
    r = _ADV_ROOMS[room]
    r["chat"].append({"player":player,"msg":msg[:200],"t":int(_adv_time.time())})
    if len(r["chat"])>100: r["chat"]=r["chat"][-100:]
    return {"ok":True}

@api.post("/adventure/{room}/reset")
async def adv_reset(room:str):
    if room not in _ADV_ROOMS: return {"ok":False}
    _ADV_ROOMS[room] = _new_adv()
    return {"ok":True}

# ─────────────────────────────────────────────────────────────────────────────
# Mom & Cub storefront integration
#   BillingsEasy PO (B2C)  ──► Mom & Cub admin "Purchase Orders" ──► website GRN
#   website GRN received qty ──► back onto the PO here
#   website order ──► Sales Invoice (SO) here (+ Money In receipt if prepaid)
# Auth: per-org secret key in the X-Integration-Key header (only its SHA-256 is stored).
# ─────────────────────────────────────────────────────────────────────────────
MOMCUB = "momcub"
GST_STATE_CODES = {
    "jammu and kashmir": "01", "himachal pradesh": "02", "punjab": "03", "chandigarh": "04", "uttarakhand": "05",
    "haryana": "06", "delhi": "07", "rajasthan": "08", "uttar pradesh": "09", "bihar": "10", "sikkim": "11",
    "arunachal pradesh": "12", "nagaland": "13", "manipur": "14", "mizoram": "15", "tripura": "16",
    "meghalaya": "17", "assam": "18", "west bengal": "19", "jharkhand": "20", "odisha": "21",
    "chhattisgarh": "22", "madhya pradesh": "23", "gujarat": "24", "dadra and nagar haveli and daman and diu": "26",
    "maharashtra": "27", "karnataka": "29", "goa": "30", "lakshadweep": "31", "kerala": "32",
    "tamil nadu": "33", "puducherry": "34", "andaman and nicobar islands": "35", "telangana": "36",
    "andhra pradesh": "37", "ladakh": "38",
}


def _key_hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


async def integration_ctx(request: Request) -> dict:
    key = (request.headers.get("X-Integration-Key") or "").strip()
    if not key:
        raise HTTPException(401, "Missing X-Integration-Key")
    row = await db.integration_keys.find_one({"key_hash": _key_hash(key), "provider": MOMCUB, "revoked": {"$ne": True}},
                                             {"_id": 0})
    if not row:
        raise HTTPException(401, "Invalid integration key")
    await db.integration_keys.update_one({"key_hash": row["key_hash"]}, {"$set": {"last_used_at": now_iso()}})
    return {
        "org_id": row["org_id"], "role": "owner", "permissions": [], "allowed_modes": [],
        "biz_type": "b2c", "entity_id": None, "entity": None,
        "user": {"id": f"integration:{MOMCUB}", "name": "Mom & Cub website", "email": ""},
    }


@api.get("/integrations/momcub")
async def momcub_integration_status(ctx=Depends(require_permission("settings.view"))):
    row = await db.integration_keys.find_one({"org_id": ctx["org_id"], "provider": MOMCUB, "revoked": {"$ne": True}},
                                             {"_id": 0, "key_hash": 0})
    orders = await db.invoices.count_documents({"org_id": ctx["org_id"], "external_source": MOMCUB})
    grns = 0
    async for p in db.purchases.find({"org_id": ctx["org_id"], "website_grns.0": {"$exists": True}}, {"_id": 0, "website_grns": 1}):
        grns += len(p.get("website_grns") or [])
    return {"connected": bool(row), "key_hint": (row or {}).get("key_hint", ""),
            "created_at": (row or {}).get("created_at"), "last_used_at": (row or {}).get("last_used_at"),
            "orders_synced": orders, "grns_received": grns,
            "api_base": str(os.environ.get("PUBLIC_API_BASE", "")).rstrip("/")}


@api.post("/integrations/momcub/key")
async def momcub_generate_key(request: Request, ctx=Depends(require_permission("settings.edit"))):
    """Create (or rotate) the Mom & Cub key. The full key is returned only once."""
    key = "be_mc_" + secrets.token_urlsafe(32)
    await db.integration_keys.update_many({"org_id": ctx["org_id"], "provider": MOMCUB},
                                          {"$set": {"revoked": True, "revoked_at": now_iso()}})
    await db.integration_keys.insert_one({
        "id": str(uuid.uuid4()), "org_id": ctx["org_id"], "provider": MOMCUB,
        "key_hash": _key_hash(key), "key_hint": key[-4:], "created_at": now_iso(),
        "created_by": ctx["user"].get("id"),
    })
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="integration.key_created",
                    entity_type="integration", entity_id=MOMCUB, metadata={}, request=request)
    return {"key": key, "key_hint": key[-4:]}


@api.get("/integrations/momcub/ping")
async def momcub_ping(ictx=Depends(integration_ctx)):
    org = await db.organizations.find_one({"id": ictx["org_id"]}, {"_id": 0, "name": 1})
    return {"ok": True, "org_name": (org or {}).get("name", "")}


def _momcub_po_view(pur: dict, pmap: dict) -> dict:
    received: Dict[str, float] = {}
    for g in pur.get("website_grns") or []:
        for ln in g.get("lines") or []:
            received[ln["line_key"]] = received.get(ln["line_key"], 0) + (ln.get("qty") or 0)
    lines, ordered_total, received_total = [], 0.0, 0.0
    for idx, it in enumerate(pur.get("items") or []):
        prod = pmap.get(it.get("product_id") or "") or {}
        key = it.get("product_id") or f"line-{idx}"
        qty = float(it.get("qty") or 0)
        got = min(received.get(key, 0), qty)
        ordered_total += qty; received_total += got
        lines.append({
            "line_key": key, "product_id": it.get("product_id") or "", "name": it.get("name", ""),
            "sku": prod.get("sku", ""), "upc": prod.get("upc", ""), "barcode": prod.get("barcode", ""),
            "hsn": it.get("hsn", ""), "unit": it.get("unit", ""), "rate": it.get("rate", 0),
            "gst_rate": it.get("gst_rate", 0), "qty": qty, "received_qty": got,
            "pending_qty": round(qty - got, 3),
        })
    status = "pending" if received_total <= 0 else ("received" if received_total >= ordered_total - 1e-6 else "partial")
    return {
        "id": pur["id"], "po_no": po_label(pur), "bill_no": pur.get("bill_no", ""),
        "supplier": (pur.get("party_snapshot") or {}).get("name", ""),
        "supplier_gstin": (pur.get("party_snapshot") or {}).get("gstin", ""),
        "purchase_date": pur.get("purchase_date", ""), "created_at": pur.get("created_at", ""),
        "grand_total": (pur.get("totals") or {}).get("grand_total", 0),
        "grn_status": status, "lines": lines,
        "grns": [{k: g.get(k) for k in ("grn_id", "grn_no", "received_at", "note")} for g in pur.get("website_grns") or []],
    }


async def _momcub_purchases(org_id: str, pid: Optional[str] = None) -> list:
    q = {"org_id": org_id, "type": "purchase", "status": {"$ne": "cancelled"},
         "purchase_category": {"$ne": "service"}, "biz_type": "b2c"}
    if pid:
        q["id"] = pid
    purs = await db.purchases.find(q, {"_id": 0, "vendor_invoice_b64": 0}).sort("purchase_date", -1).to_list(300)
    pids = list({it.get("product_id") for p in purs for it in (p.get("items") or []) if it.get("product_id")})
    pmap = {p["id"]: p async for p in db.products.find({"org_id": org_id, "id": {"$in": pids}},
                                                        {"_id": 0, "id": 1, "sku": 1, "upc": 1, "barcode": 1})}
    return [_momcub_po_view(p, pmap) for p in purs]


@api.get("/integrations/momcub/purchase-orders")
async def momcub_list_pos(status: str = Query("open"), ictx=Depends(integration_ctx)):
    """B2C stock purchase orders for the website. status=open (not fully received) | all."""
    rows = await _momcub_purchases(ictx["org_id"])
    if status != "all":
        rows = [r for r in rows if r["grn_status"] != "received"]
    return rows


@api.get("/integrations/momcub/purchase-orders/{pid}")
async def momcub_get_po(pid: str, ictx=Depends(integration_ctx)):
    rows = await _momcub_purchases(ictx["org_id"], pid)
    if not rows:
        raise HTTPException(404, "Purchase order not found or not a B2C stock PO")
    return rows[0]


class MomcubGrnLine(BaseModel):
    line_key: str
    qty: float


class MomcubGrnIn(BaseModel):
    grn_id: str
    grn_no: str = ""
    received_at: str = ""
    note: str = ""
    lines: List[MomcubGrnLine]


@api.post("/integrations/momcub/purchase-orders/{pid}/grn")
async def momcub_record_grn(pid: str, body: MomcubGrnIn, ictx=Depends(integration_ctx)):
    """Record goods received on the website against a PO. Idempotent on grn_id.
    BillingsEasy stock was already added when the PO was saved, so stock is not changed here."""
    rows = await _momcub_purchases(ictx["org_id"], pid)
    if not rows:
        raise HTTPException(404, "Purchase order not found or not a B2C stock PO")
    po = rows[0]
    if any(g.get("grn_id") == body.grn_id for g in po["grns"]):
        return {"ok": True, "duplicate": True, "po": po}
    pending = {ln["line_key"]: ln["pending_qty"] for ln in po["lines"]}
    lines = []
    for ln in body.lines:
        if ln.qty <= 0:
            continue
        if ln.line_key not in pending:
            raise HTTPException(400, f"Line {ln.line_key} is not on this PO")
        if ln.qty > pending[ln.line_key] + 1e-6:
            raise HTTPException(400, f"Received qty {ln.qty:g} exceeds pending {pending[ln.line_key]:g} for {ln.line_key}")
        lines.append({"line_key": ln.line_key, "qty": ln.qty})
    if not lines:
        raise HTTPException(400, "Nothing received")
    grn = {"grn_id": body.grn_id, "grn_no": body.grn_no, "note": body.note,
           "received_at": body.received_at or now_iso(), "recorded_at": now_iso(), "lines": lines}
    res = await db.purchases.update_one(
        {"org_id": ictx["org_id"], "id": pid, "website_grns.grn_id": {"$ne": body.grn_id}},
        {"$push": {"website_grns": grn}})
    po = (await _momcub_purchases(ictx["org_id"], pid))[0]
    await db.purchases.update_one({"org_id": ictx["org_id"], "id": pid},
                                  {"$set": {"website_grn_status": po["grn_status"]}})
    return {"ok": True, "duplicate": res.modified_count == 0, "po": po}


class MomcubOrderItem(BaseModel):
    id: str = ""
    name: str
    qty: float
    price: float                 # GST-inclusive selling price per unit
    sku: str = ""
    upc: str = ""


class MomcubCustomer(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    city: str = ""
    state: str = ""
    pincode: str = ""


class MomcubOrder(BaseModel):
    id: str
    orderNumber: str = ""
    customer: MomcubCustomer = MomcubCustomer()
    items: List[MomcubOrderItem]
    subtotal: float = 0
    discount: float = 0
    shipping: float = 0
    total: float = 0
    paymentMethod: str = "cod"
    paymentStatus: str = "pending"
    createdAt: str = ""


class MomcubOrderEvent(BaseModel):
    event: str = "order.created"
    order: MomcubOrder


async def _momcub_customer_party(org_id: str, c: MomcubCustomer, seller_state_code: str) -> dict:
    phone = "".join(ch for ch in (c.phone or "") if ch.isdigit())[-10:]
    email = (c.email or "").strip().lower()
    party = None
    if phone:
        party = await db.parties.find_one({"org_id": org_id, "phone": {"$regex": f"{phone}$"}}, {"_id": 0})
    if not party and email:
        party = await db.parties.find_one({"org_id": org_id, "email": email}, {"_id": 0})
    if party:
        return party
    state_code = GST_STATE_CODES.get((c.state or "").strip().lower(), seller_state_code)
    addr = ", ".join(x for x in [c.address, c.city, c.state, c.pincode] if x)
    party = {
        "id": str(uuid.uuid4()), "org_id": org_id, "type": "customer", "biz_type": "b2c",
        "name": c.name or email or phone or "Website customer", "phone": phone, "email": email,
        "gstin": "", "pan": "", "state": (c.state or "").strip(),
        "state_code": state_code, "billing_address": addr,
        "shipping_address": addr, "shipping_addresses": [{"label": "Website", "address": addr}] if addr else [],
        "opening_balance": 0, "credit_limit": 0, "tds_opening_balance": 0,
        "source": MOMCUB, "created_at": now_iso(),
    }
    await db.parties.insert_one(party)
    party.pop("_id", None)
    return party


@api.post("/integrations/momcub/orders")
async def momcub_order_webhook(body: MomcubOrderEvent, request: Request, ictx=Depends(integration_ctx)):
    """Create a B2C sales invoice for a website order. Idempotent on the website order id."""
    o = body.order
    org_id = ictx["org_id"]
    existing = await db.invoices.find_one({"org_id": org_id, "external_source": MOMCUB, "external_id": o.id},
                                          {"_id": 0, "id": 1, "invoice_no": 1})
    if existing:
        return {"ok": True, "duplicate": True, "invoice_id": existing["id"], "invoice_no": existing["invoice_no"]}
    if not o.items:
        raise HTTPException(400, "Order has no items")
    org = await get_org_doc(org_id)
    await check_limit(db, org, "invoice")
    seller_state = org.get("state_code", "33")
    party = await _momcub_customer_party(org_id, o.customer, seller_state)

    # Match website items to BillingsEasy products by SKU, then UPC/barcode
    items, unmatched = [], []
    subtotal = sum(i.price * i.qty for i in o.items) or 1
    disc_pct = round(min(max(o.discount, 0) / subtotal * 100, 100), 4) if o.discount else 0
    for it in o.items:
        prod = None
        for field, val in (("sku", it.sku), ("upc", it.upc), ("barcode", it.upc)):
            if val:
                prod = await db.products.find_one({"org_id": org_id, field: val}, {"_id": 0})
                if prod:
                    break
        gst = float((prod or {}).get("gst_rate", 0) or 0)
        if not prod:
            unmatched.append(it.sku or it.name)
        items.append({
            "product_id": (prod or {}).get("id", ""), "name": (prod or {}).get("name") or it.name,
            "hsn": (prod or {}).get("hsn", ""), "qty": it.qty, "unit": (prod or {}).get("unit", "NOS"),
            "rate": round(it.price / (1 + gst / 100), 4),   # website prices include GST
            "discount_pct": disc_pct, "gst_rate": gst,
        })
    if o.shipping and o.shipping > 0:
        items.append({"product_id": "", "name": "Shipping charges", "hsn": "996812", "qty": 1, "unit": "NOS",
                      "rate": round(o.shipping, 2), "discount_pct": 0, "gst_rate": 0})

    notes = f"Mom & Cub website order {o.orderNumber or o.id} · {o.paymentMethod.upper()}"
    if unmatched:
        notes += f" · Not matched to a product (no stock deducted): {', '.join(unmatched)}"
    inv_in = InvoiceIn(party_id=party["id"], invoice_date=(o.createdAt or now_iso())[:10], due_date="",
                       items=[LineItem(**i) for i in items], notes=notes, status="finalized", type="sale",
                       invoice_category="stock", shipping_address=party.get("shipping_address", ""),
                       po_number=o.orderNumber or "")
    doc = await _build_invoice_doc(inv_in, ictx, "INV")
    doc.update({"external_source": MOMCUB, "external_id": o.id, "external_ref": o.orderNumber,
                "sales_channel": "Mom & Cub website"})
    try:
        await db.invoices.insert_one(doc)
    except Exception:
        existing = await db.invoices.find_one({"org_id": org_id, "external_source": MOMCUB, "external_id": o.id},
                                              {"_id": 0, "id": 1, "invoice_no": 1})
        if existing:
            return {"ok": True, "duplicate": True, "invoice_id": existing["id"], "invoice_no": existing["invoice_no"]}
        raise

    for it in items:
        if it["product_id"]:
            await db.products.update_one({"org_id": org_id, "id": it["product_id"]}, {"$inc": {"stock": -it["qty"]}})
            await _log_stock_movement(org_id, it["product_id"], -it["qty"], movement_type="sale",
                                      ref_id=doc["id"], ref_no=doc["invoice_no"], party_name=party["name"],
                                      date=doc["invoice_date"])

    receipt = None
    grand = doc["totals"]["grand_total"]
    if (o.paymentStatus or "").lower() == "paid" and grand > 0:
        receipt = {
            "id": str(uuid.uuid4()), "org_id": org_id, "party_id": party["id"], "direction": "received",
            "amount": grand, "mode": "Online", "date": doc["invoice_date"],
            "reference": o.orderNumber or o.id, "bank_account_id": "", "invoice_id": doc["id"],
            "linked_ref": doc["invoice_no"], "linked_type": "invoice", "expense_id": "",
            "notes": f"Prepaid on Mom & Cub ({o.paymentMethod})", "source": MOMCUB, "created_at": now_iso(),
        }
        await db.payments.insert_one(receipt)
        await db.invoices.update_one({"org_id": org_id, "id": doc["id"]},
                                     {"$set": {"status": "paid", "status_changed_at": now_iso()}})

    await audit_log(db, org_id=org_id, user=ictx["user"], action="invoice.created",
                    entity_type="invoice", entity_id=doc["id"],
                    metadata={"invoice_no": doc["invoice_no"], "total": grand, "source": MOMCUB,
                              "order": o.orderNumber}, request=request)
    return {"ok": True, "duplicate": False, "invoice_id": doc["id"], "invoice_no": doc["invoice_no"],
            "total": grand, "receipt_recorded": bool(receipt), "unmatched_items": unmatched}



# ─────────────────────────────────────────────────────────────────────────────
# Stay / Hotel: rooms, bookings, check-in/out, advances, folio -> GST invoice.
# GST on accommodation (SAC 996311): 5% when the room tariff is <= Rs 7,500 per night,
# 18% above (rates from 22 Sep 2025). A booking can override the rate.
# ─────────────────────────────────────────────────────────────────────────────
STAY_SAC = "996311"          # accommodation
TRIP_SAC = "998555"          # tour operator / trip packages
ACTIVE_BOOKING = ("booked", "checked_in")
BOOKING_CHANNELS = ["Direct", "Walk-in", "Phone", "Website", "Airbnb", "Booking.com", "MakeMyTrip",
                    "Goibibo", "Agoda", "Expedia", "TripAdvisor", "Other"]
COMMISSION_CATEGORY = "Channel commission"


def stay_gst_rate(tariff: float) -> float:
    """Accommodation: 5% up to Rs 7,500 per night, 18% above (rates from 22 Sep 2025)."""
    return 5.0 if (tariff or 0) <= 7500 else 18.0


def _nights(check_in: str, check_out: str, allow_same_day: bool = False) -> int:
    try:
        d = (datetime.fromisoformat(check_out[:10]) - datetime.fromisoformat(check_in[:10])).days
    except ValueError:
        raise HTTPException(400, "Dates must be YYYY-MM-DD")
    if d < 0 or (d == 0 and not allow_same_day):
        raise HTTPException(400, "Check-out must be at least one night after check-in")
    return max(d, 1) if allow_same_day else d


class RoomIn(BaseModel):
    number: str = Field(min_length=1, max_length=20)
    room_type: str = "Standard"
    capacity: int = 2
    tariff: float = 0            # per night, before GST
    status: str = "available"    # available | maintenance
    notes: str = ""


class StayChargeIn(BaseModel):
    name: str
    amount: float                # before GST
    gst_rate: float = 18
    date: str = ""


class BookingIn(BaseModel):
    party_id: str
    room_id: str = ""                    # required for a room stay; empty for a trip/package
    check_in: str
    check_out: str
    adults: int = 1
    children: int = 0
    tariff: Optional[float] = None       # per night; defaults to the room's tariff
    gst_rate: Optional[float] = None     # override the automatic rate
    source: str = "Walk-in"              # legacy label, kept for older bookings
    channel: str = "Direct"              # Direct | Website | Airbnb | Booking.com | ...
    channel_ref: str = ""                # the platform's own booking reference
    commission_amount: float = 0         # what the channel keeps (recorded as an expense)
    commission_gst_rate: float = 18
    booking_type: str = "room"           # room | package
    package_name: str = ""               # e.g. "Coorg 2N/3D homestay + trek"
    package_amount: float = 0            # total before GST, for a package booking
    id_proof: str = ""
    notes: str = ""


class StayAdvanceIn(BaseModel):
    amount: float = Field(gt=0)
    mode: str = "UPI"
    reference: str = ""
    date: str = ""
    bank_account_id: str = ""


async def _stay_ctx(ctx: dict) -> dict:
    await ensure_active_subscription(ctx)
    return ctx


async def _booking_parts(ctx: dict, body: "BookingIn", exclude_id: str = "") -> dict:
    """Validate a booking and return the room/party fields to store (room or package)."""
    is_pkg = body.booking_type == "package"
    _nights(body.check_in, body.check_out, allow_same_day=is_pkg)
    party = await db.parties.find_one({"org_id": ctx["org_id"], "id": body.party_id}, {"_id": 0})
    if not party:
        raise HTTPException(400, "Guest not found")
    out = {"party_snapshot": {k: party.get(k) for k in ("id", "name", "phone", "email", "gstin", "state", "state_code")}}
    if is_pkg:
        if not body.package_name.strip():
            raise HTTPException(400, "Give the trip / package a name")
        if (body.package_amount or 0) <= 0:
            raise HTTPException(400, "Enter the package amount")
        out.update({"room_id": body.room_id or "", "room_number": "", "room_type": "Package", "tariff": 0})
        if body.room_id:  # a package may still occupy a room
            room = await db.rooms.find_one({"org_id": ctx["org_id"], "id": body.room_id}, {"_id": 0})
            if room:
                out.update({"room_number": room["number"], "room_type": room.get("room_type", "")})
        return out
    room = await db.rooms.find_one({"org_id": ctx["org_id"], "id": body.room_id}, {"_id": 0})
    if not room:
        raise HTTPException(400, "Room not found")
    if room.get("status") == "maintenance":
        raise HTTPException(400, f"Room {room['number']} is under maintenance")
    clash = await _room_clash(ctx, body.room_id, body.check_in, body.check_out, exclude_id=exclude_id)
    if clash:
        raise HTTPException(409, f"Room {room['number']} is already booked {clash['check_in']} → {clash['check_out']} "
                                 f"({clash['booking_no']}, {(clash.get('party_snapshot') or {}).get('name', '')})")
    out.update({"room_number": room["number"], "room_type": room.get("room_type", ""),
                "tariff": body.tariff if body.tariff is not None else room.get("tariff", 0)})
    return out


async def _room_clash(ctx: dict, room_id: str, check_in: str, check_out: str, exclude_id: str = "") -> Optional[dict]:
    q = {"org_id": ctx["org_id"], "room_id": room_id, "status": {"$in": list(ACTIVE_BOOKING)},
         "check_in": {"$lt": check_out[:10]}, "check_out": {"$gt": check_in[:10]}}
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    return await db.bookings.find_one(q, {"_id": 0, "booking_no": 1, "check_in": 1, "check_out": 1, "party_snapshot": 1})


async def _booking(ctx: dict, bid: str) -> dict:
    b = await db.bookings.find_one({"org_id": ctx["org_id"], "id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    return b


async def _booking_view(ctx: dict, b: dict) -> dict:
    is_pkg = b.get("booking_type") == "package"
    nights = _nights(b["check_in"], b["check_out"], allow_same_day=is_pkg)
    if is_pkg:
        rate = b.get("gst_rate") if b.get("gst_rate") is not None else 5.0
        room_amt = round(b.get("package_amount") or 0, 2)
    else:
        rate = b.get("gst_rate") if b.get("gst_rate") is not None else stay_gst_rate(b.get("tariff", 0))
        room_amt = round(nights * (b.get("tariff") or 0), 2)
    charges = b.get("charges") or []
    taxable = room_amt + sum(c["amount"] for c in charges)
    tax = room_amt * rate / 100 + sum(c["amount"] * c.get("gst_rate", 0) / 100 for c in charges)
    advances = 0.0
    async for p in db.payments.find({"org_id": ctx["org_id"], "booking_id": b["id"]}, {"_id": 0, "amount": 1}):
        advances += p["amount"]
    total = round(taxable + tax)
    commission = round(b.get("commission_amount") or 0, 2)
    commission_gst = round(commission * (b.get("commission_gst_rate") or 0) / 100, 2)
    return {**b, "nights": nights, "gst_rate_applied": rate, "room_amount": room_amt,
            "estimated_total": total, "advance_paid": round(advances, 2),
            "balance": round(max(total - advances, 0), 2),
            "commission_total": round(commission + commission_gst, 2),
            "net_payout": round(total - commission - commission_gst, 2)}


@api.get("/stay/rooms")
async def stay_list_rooms(ctx=Depends(get_org_ctx)):
    rooms = await db.rooms.find({"org_id": ctx["org_id"]}, {"_id": 0}).to_list(500)
    rooms.sort(key=lambda r: (len(r["number"]), r["number"]))
    return rooms


@api.post("/stay/rooms")
async def stay_create_room(body: RoomIn, ctx=Depends(get_org_ctx)):
    await _stay_ctx(ctx)
    if await db.rooms.find_one({"org_id": ctx["org_id"], "number": body.number.strip()}):
        raise HTTPException(400, f"Room {body.number} already exists")
    doc = {"id": str(uuid.uuid4()), "org_id": ctx["org_id"], **body.model_dump(), "number": body.number.strip(),
           "created_at": now_iso()}
    await db.rooms.insert_one(doc)
    return strip_id(doc)


@api.put("/stay/rooms/{rid}")
async def stay_update_room(rid: str, body: RoomIn, ctx=Depends(get_org_ctx)):
    await _stay_ctx(ctx)
    dup = await db.rooms.find_one({"org_id": ctx["org_id"], "number": body.number.strip(), "id": {"$ne": rid}})
    if dup:
        raise HTTPException(400, f"Room {body.number} already exists")
    res = await db.rooms.update_one({"org_id": ctx["org_id"], "id": rid},
                                    {"$set": {**body.model_dump(), "number": body.number.strip(), "updated_at": now_iso()}})
    if not res.matched_count:
        raise HTTPException(404, "Room not found")
    return await db.rooms.find_one({"org_id": ctx["org_id"], "id": rid}, {"_id": 0})


@api.delete("/stay/rooms/{rid}")
async def stay_delete_room(rid: str, ctx=Depends(get_org_ctx)):
    if await db.bookings.find_one({"org_id": ctx["org_id"], "room_id": rid}):
        raise HTTPException(400, "Room has bookings — set it to maintenance instead of deleting")
    await db.rooms.delete_one({"org_id": ctx["org_id"], "id": rid})
    return {"ok": True}


@api.get("/stay/bookings")
async def stay_list_bookings(date_from: str = "", date_to: str = "", status: str = "", ctx=Depends(get_org_ctx)):
    q = {"org_id": ctx["org_id"]}
    if status:
        q["status"] = {"$in": status.split(",")}
    if date_from:
        q["check_out"] = {"$gt": date_from[:10]}
    if date_to:
        q["check_in"] = {"$lt": date_to[:10]}
    rows = await db.bookings.find(q, {"_id": 0}).sort("check_in", 1).to_list(1000)
    return [await _booking_view(ctx, b) for b in rows]


@api.get("/stay/bookings/{bid}")
async def stay_get_booking(bid: str, ctx=Depends(get_org_ctx)):
    return await _booking_view(ctx, await _booking(ctx, bid))


@api.post("/stay/bookings")
async def stay_create_booking(body: BookingIn, request: Request, ctx=Depends(get_org_ctx)):
    await _stay_ctx(ctx)
    parts = await _booking_parts(ctx, body)
    doc = {"id": str(uuid.uuid4()), "org_id": ctx["org_id"], "booking_no": await next_invoice_number(ctx["org_id"], "BK"),
           **body.model_dump(), "check_in": body.check_in[:10], "check_out": body.check_out[:10], **parts,
           "status": "booked", "charges": [], "created_at": now_iso(), "created_by": ctx["user"].get("id")}
    await db.bookings.insert_one(doc)
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="booking.created", entity_type="booking",
                    entity_id=doc["id"], metadata={"booking_no": doc["booking_no"], "room": parts.get("room_number", ""),
                                                   "channel": body.channel}, request=request)
    return await _booking_view(ctx, strip_id(doc))


@api.put("/stay/bookings/{bid}")
async def stay_update_booking(bid: str, body: BookingIn, ctx=Depends(get_org_ctx)):
    await _stay_ctx(ctx)
    b = await _booking(ctx, bid)
    if b["status"] not in ACTIVE_BOOKING:
        raise HTTPException(400, f"Booking is {b['status'].replace('_', ' ')} and can't be edited")
    parts = await _booking_parts(ctx, body, exclude_id=bid)
    patch = {**body.model_dump(), "check_in": body.check_in[:10], "check_out": body.check_out[:10],
             **parts, "updated_at": now_iso()}
    await db.bookings.update_one({"org_id": ctx["org_id"], "id": bid}, {"$set": patch})
    return await _booking_view(ctx, await _booking(ctx, bid))


@api.post("/stay/bookings/{bid}/check-in")
async def stay_check_in(bid: str, ctx=Depends(get_org_ctx)):
    await _stay_ctx(ctx)
    b = await _booking(ctx, bid)
    if b["status"] != "booked":
        raise HTTPException(400, f"Can't check in a booking that is {b['status'].replace('_', ' ')}")
    await db.bookings.update_one({"org_id": ctx["org_id"], "id": bid},
                                 {"$set": {"status": "checked_in", "checked_in_at": now_iso()}})
    return await _booking_view(ctx, await _booking(ctx, bid))


@api.post("/stay/bookings/{bid}/cancel")
async def stay_cancel(bid: str, ctx=Depends(get_org_ctx)):
    b = await _booking(ctx, bid)
    if b["status"] not in ACTIVE_BOOKING:
        raise HTTPException(400, f"Booking is already {b['status'].replace('_', ' ')}")
    await db.bookings.update_one({"org_id": ctx["org_id"], "id": bid},
                                 {"$set": {"status": "cancelled", "cancelled_at": now_iso()}})
    return await _booking_view(ctx, await _booking(ctx, bid))


@api.post("/stay/bookings/{bid}/charges")
async def stay_add_charge(bid: str, body: StayChargeIn, ctx=Depends(get_org_ctx)):
    await _stay_ctx(ctx)
    b = await _booking(ctx, bid)
    if b["status"] not in ACTIVE_BOOKING:
        raise HTTPException(400, "Charges can only be added before check-out")
    if body.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    charge = {"id": str(uuid.uuid4()), **body.model_dump(), "date": body.date or now_iso()[:10]}
    await db.bookings.update_one({"org_id": ctx["org_id"], "id": bid}, {"$push": {"charges": charge}})
    return await _booking_view(ctx, await _booking(ctx, bid))


@api.delete("/stay/bookings/{bid}/charges/{cid}")
async def stay_remove_charge(bid: str, cid: str, ctx=Depends(get_org_ctx)):
    b = await _booking(ctx, bid)
    if b["status"] not in ACTIVE_BOOKING:
        raise HTTPException(400, "Booking is closed")
    await db.bookings.update_one({"org_id": ctx["org_id"], "id": bid}, {"$pull": {"charges": {"id": cid}}})
    return await _booking_view(ctx, await _booking(ctx, bid))


@api.post("/stay/bookings/{bid}/advance")
async def stay_advance(bid: str, body: StayAdvanceIn, ctx=Depends(get_org_ctx)):
    await _stay_ctx(ctx)
    b = await _booking(ctx, bid)
    if b["status"] not in ACTIVE_BOOKING:
        raise HTTPException(400, "Booking is closed — record the payment against its invoice instead")
    pay = {"id": str(uuid.uuid4()), "org_id": ctx["org_id"], "party_id": b["party_id"], "direction": "received",
           "amount": round(body.amount, 2), "mode": body.mode, "date": (body.date or now_iso())[:10],
           "reference": body.reference or b["booking_no"], "bank_account_id": body.bank_account_id,
           "invoice_id": "", "expense_id": "", "booking_id": bid, "linked_ref": b["booking_no"],
           "linked_type": "booking", "biz_type": ctx.get("biz_type"), "created_at": now_iso()}
    if body.bank_account_id:
        bank = await db.bank_accounts.find_one({"org_id": ctx["org_id"], "id": body.bank_account_id}, {"_id": 0})
        if bank:
            pay["bank_account_name"] = f"{bank['bank_name']} – {bank['account_no'][-4:]}"
    await db.payments.insert_one(pay)
    return await _booking_view(ctx, await _booking(ctx, bid))


@api.post("/stay/bookings/{bid}/check-out")
async def stay_check_out(bid: str, request: Request, ctx=Depends(get_org_ctx)):
    """Close the folio: raise the GST invoice for room nights + extras and attach advances to it."""
    await _stay_ctx(ctx)
    b = await _booking(ctx, bid)
    if b["status"] != "checked_in":
        raise HTTPException(400, "Check the guest in before checking out")
    view = await _booking_view(ctx, b)
    rate = view["gst_rate_applied"]
    if b.get("booking_type") == "package":
        items = [LineItem(name=f"{b.get('package_name') or 'Package'} · {b['check_in']} to {b['check_out']}",
                          hsn=TRIP_SAC, qty=1, unit="NOS", rate=b.get("package_amount") or 0, gst_rate=rate)]
    else:
        items = [LineItem(name=f"Room {b['room_number']} ({b.get('room_type') or 'Room'}) · "
                               f"{b['check_in']} to {b['check_out']}", hsn=STAY_SAC, qty=view["nights"],
                          unit="NIGHT", rate=b.get("tariff") or 0, gst_rate=rate)]
    for c in b.get("charges") or []:
        items.append(LineItem(name=c["name"], hsn="", qty=1, unit="NOS", rate=c["amount"], gst_rate=c.get("gst_rate", 0)))
    org = await get_org_doc(ctx["org_id"])
    await check_limit(db, org, "invoice")
    inv_in = InvoiceIn(party_id=b["party_id"], invoice_date=now_iso()[:10], items=items, status="finalized",
                       type="sale", invoice_category="service",
                       notes=f"Stay {b['booking_no']} · {view['nights']} night(s) · {b.get('adults', 1)} adult(s)"
                             f"{(', ' + str(b['children']) + ' child(ren)') if b.get('children') else ''}")
    doc = await _build_invoice_doc(inv_in, ctx, "INV")
    doc.update({"booking_id": bid, "booking_no": b["booking_no"]})
    await db.invoices.insert_one(doc)
    await db.payments.update_many({"org_id": ctx["org_id"], "booking_id": bid},
                                  {"$set": {"invoice_id": doc["id"], "linked_ref": doc["invoice_no"], "linked_type": "invoice"}})
    grand = doc["totals"]["grand_total"]
    if view["advance_paid"] >= grand * 0.99 and grand > 0:
        await db.invoices.update_one({"org_id": ctx["org_id"], "id": doc["id"]},
                                     {"$set": {"status": "paid", "status_changed_at": now_iso()}})
    # A channel's commission is our cost — book it as an expense against this booking
    commission = round(b.get("commission_amount") or 0, 2)
    if commission > 0 and not b.get("commission_expense_id"):
        exp = {"id": str(uuid.uuid4()), "org_id": ctx["org_id"], "biz_type": ctx.get("biz_type"),
               "category": COMMISSION_CATEGORY, "amount": commission,
               "gst_rate": b.get("commission_gst_rate") or 0, "date": now_iso()[:10],
               "description": f"{b.get('channel') or 'Channel'} commission · {b['booking_no']}"
                              f"{' · ' + b['channel_ref'] if b.get('channel_ref') else ''}",
               "booking_id": bid, "created_at": now_iso()}
        await db.expenses.insert_one(exp)
        await db.bookings.update_one({"org_id": ctx["org_id"], "id": bid}, {"$set": {"commission_expense_id": exp["id"]}})
    await db.bookings.update_one({"org_id": ctx["org_id"], "id": bid},
                                 {"$set": {"status": "checked_out", "checked_out_at": now_iso(),
                                           "invoice_id": doc["id"], "invoice_no": doc["invoice_no"]}})
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="booking.checked_out", entity_type="booking",
                    entity_id=bid, metadata={"invoice_no": doc["invoice_no"], "total": grand}, request=request)
    return {"booking": await _booking_view(ctx, await _booking(ctx, bid)), "invoice_id": doc["id"],
            "invoice_no": doc["invoice_no"], "total": grand, "advance_paid": view["advance_paid"],
            "balance": round(max(grand - view["advance_paid"], 0), 2),
            "commission_expense": commission if commission > 0 else 0}


# ─────────────────────────────────────────────────────────────────────────────
# Booking intake: your own site or an OTA (Airbnb, Booking.com, MMT…) posts a
# booking here and it lands in the Stay business — guest, booking, advance and
# channel commission. Anything that can't be matched to a free room is parked in
# the inbox for a human, never dropped.
# Auth: X-Integration-Key (provider "bookings"), generated in Settings → Integrations.
# ─────────────────────────────────────────────────────────────────────────────
BOOKINGS_PROVIDER = "bookings"


async def bookings_ctx(request: Request) -> dict:
    key = (request.headers.get("X-Integration-Key") or "").strip()
    if not key:
        raise HTTPException(401, "Missing X-Integration-Key")
    row = await db.integration_keys.find_one(
        {"key_hash": _key_hash(key), "provider": BOOKINGS_PROVIDER, "revoked": {"$ne": True}}, {"_id": 0})
    if not row:
        raise HTTPException(401, "Invalid integration key")
    await db.integration_keys.update_one({"key_hash": row["key_hash"]}, {"$set": {"last_used_at": now_iso()}})
    org = await db.organizations.find_one({"id": row["org_id"]}, {"_id": 0, "business_type": 1, "name": 1})
    return {"org_id": row["org_id"], "role": "owner", "permissions": [], "allowed_modes": [],
            "biz_type": (org or {}).get("business_type") or "stay", "entity_id": None, "entity": None,
            "org_name": (org or {}).get("name", ""),
            "user": {"id": f"integration:{BOOKINGS_PROVIDER}", "name": "Booking channel", "email": ""}}


@api.get("/integrations/bookings")
async def bookings_key_status(ctx=Depends(require_permission("settings.view"))):
    row = await db.integration_keys.find_one(
        {"org_id": ctx["org_id"], "provider": BOOKINGS_PROVIDER, "revoked": {"$ne": True}}, {"_id": 0, "key_hash": 0})
    return {"connected": bool(row), "key_hint": (row or {}).get("key_hint", ""),
            "last_used_at": (row or {}).get("last_used_at"),
            "bookings_received": await db.bookings.count_documents({"org_id": ctx["org_id"], "intake": True}),
            "inbox_pending": await db.booking_inbox.count_documents({"org_id": ctx["org_id"], "status": "pending"}),
            "channels": BOOKING_CHANNELS}


@api.post("/integrations/bookings/key")
async def bookings_generate_key(request: Request, ctx=Depends(require_permission("settings.edit"))):
    key = "be_bk_" + secrets.token_urlsafe(32)
    await db.integration_keys.update_many({"org_id": ctx["org_id"], "provider": BOOKINGS_PROVIDER},
                                          {"$set": {"revoked": True, "revoked_at": now_iso()}})
    await db.integration_keys.insert_one({
        "id": str(uuid.uuid4()), "org_id": ctx["org_id"], "provider": BOOKINGS_PROVIDER,
        "key_hash": _key_hash(key), "key_hint": key[-4:], "created_at": now_iso(),
        "created_by": ctx["user"].get("id")})
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="integration.key_created",
                    entity_type="integration", entity_id=BOOKINGS_PROVIDER, metadata={}, request=request)
    return {"key": key, "key_hint": key[-4:]}


@api.get("/integrations/bookings/ping")
async def bookings_ping(ictx=Depends(bookings_ctx)):
    return {"ok": True, "org_name": ictx["org_name"], "business_type": ictx["biz_type"]}


@api.get("/integrations/bookings/availability")
async def bookings_availability(date_from: str, date_to: str, ictx=Depends(bookings_ctx)):
    """Rooms that are free for the whole window, so a website can show what's bookable."""
    _nights(date_from, date_to)
    rooms = await db.rooms.find({"org_id": ictx["org_id"]}, {"_id": 0}).to_list(500)
    out = []
    for r in rooms:
        busy = r.get("status") == "maintenance" or bool(await _room_clash(ictx, r["id"], date_from, date_to))
        out.append({"room_id": r["id"], "number": r["number"], "room_type": r.get("room_type", ""),
                    "capacity": r.get("capacity"), "tariff": r.get("tariff", 0),
                    "gst_rate": stay_gst_rate(r.get("tariff", 0)), "available": not busy})
    return {"date_from": date_from[:10], "date_to": date_to[:10], "rooms": out}


class IntakeGuest(BaseModel):
    name: str = ""
    phone: str = ""
    email: str = ""
    gstin: str = ""
    state: str = ""
    address: str = ""


class BookingIntakeIn(BaseModel):
    external_id: str = Field(min_length=1)      # the channel's booking id — used for idempotency
    channel: str = "Website"
    channel_ref: str = ""                       # human-readable reference shown to the guest
    status: str = "confirmed"                   # confirmed | cancelled
    guest: IntakeGuest = IntakeGuest()
    check_in: str
    check_out: str
    adults: int = 1
    children: int = 0
    booking_type: str = "room"                  # room | package
    room_id: str = ""
    room_number: str = ""
    room_type: str = ""                         # matched loosely when no id/number is given
    tariff: Optional[float] = None              # per night, before GST
    total_amount: Optional[float] = None        # gross the guest pays, incl. GST (used to derive the tariff)
    package_name: str = ""
    package_amount: Optional[float] = None      # before GST
    gst_rate: Optional[float] = None
    commission_amount: float = 0
    commission_gst_rate: float = 18
    advance_paid: float = 0                     # already collected by the channel / your site
    advance_mode: str = "Online"
    notes: str = ""


async def _intake_guest(org_id: str, g: IntakeGuest, fallback_state_code: str) -> dict:
    phone = "".join(ch for ch in (g.phone or "") if ch.isdigit())[-10:]
    email = (g.email or "").strip().lower()
    party = None
    if phone:
        party = await db.parties.find_one({"org_id": org_id, "phone": {"$regex": f"{phone}$"}}, {"_id": 0})
    if not party and email:
        party = await db.parties.find_one({"org_id": org_id, "email": email}, {"_id": 0})
    if party:
        return party
    party = {"id": str(uuid.uuid4()), "org_id": org_id, "type": "customer", "biz_type": "stay",
             "name": g.name.strip() or email or phone or "Guest", "phone": phone, "email": email,
             "gstin": (g.gstin or "").upper(), "pan": "",
             "state": (g.state or "").strip(),
             "state_code": GST_STATE_CODES.get((g.state or "").strip().lower(), fallback_state_code),
             "billing_address": g.address or "", "shipping_address": "", "shipping_addresses": [],
             "opening_balance": 0, "credit_limit": 0, "tds_opening_balance": 0,
             "source": "booking-intake", "created_at": now_iso()}
    await db.parties.insert_one(party)
    party.pop("_id", None)
    return party


async def _pick_room(org_id: str, ictx: dict, body: BookingIntakeIn) -> Optional[dict]:
    """Find the room the channel means: by id, then number, then a free room of that type."""
    if body.room_id:
        r = await db.rooms.find_one({"org_id": org_id, "id": body.room_id}, {"_id": 0})
        if r and not await _room_clash(ictx, r["id"], body.check_in, body.check_out):
            return r
        return None
    if body.room_number:
        r = await db.rooms.find_one({"org_id": org_id, "number": body.room_number.strip()}, {"_id": 0})
        if r and r.get("status") != "maintenance" and not await _room_clash(ictx, r["id"], body.check_in, body.check_out):
            return r
        return None
    q = {"org_id": org_id, "status": {"$ne": "maintenance"}}
    if body.room_type:
        q["room_type"] = {"$regex": f"^{re.escape(body.room_type.strip())}$", "$options": "i"}
    async for r in db.rooms.find(q, {"_id": 0}).sort("number", 1):
        if not await _room_clash(ictx, r["id"], body.check_in, body.check_out):
            return r
    return None


@api.post("/integrations/bookings")
async def booking_intake(body: BookingIntakeIn, request: Request, ictx=Depends(bookings_ctx)):
    """Create (or cancel) a booking sent by a channel. Idempotent on channel + external_id."""
    org_id = ictx["org_id"]
    existing = await db.bookings.find_one({"org_id": org_id, "channel": body.channel, "external_id": body.external_id},
                                          {"_id": 0})
    if body.status == "cancelled":
        if not existing:
            return {"ok": True, "status": "unknown_booking"}
        if existing["status"] in ACTIVE_BOOKING:
            await db.bookings.update_one({"org_id": org_id, "id": existing["id"]},
                                         {"$set": {"status": "cancelled", "cancelled_at": now_iso(),
                                                   "cancelled_by_channel": True}})
        return {"ok": True, "status": "cancelled", "booking_no": existing["booking_no"]}
    if existing:
        return {"ok": True, "duplicate": True, "booking_id": existing["id"], "booking_no": existing["booking_no"],
                "status": existing["status"]}

    org = await get_org_doc(org_id)
    is_pkg = body.booking_type == "package"
    _nights(body.check_in, body.check_out, allow_same_day=is_pkg)
    room = None if is_pkg else await _pick_room(org_id, ictx, body)
    if not is_pkg and not room:
        parked = {"id": str(uuid.uuid4()), "org_id": org_id, "status": "pending",
                  "reason": "No free room matched — assign one to accept this booking",
                  "payload": body.model_dump(), "channel": body.channel, "external_id": body.external_id,
                  "guest_name": body.guest.name, "check_in": body.check_in[:10], "check_out": body.check_out[:10],
                  "created_at": now_iso()}
        await db.booking_inbox.update_one({"org_id": org_id, "channel": body.channel, "external_id": body.external_id},
                                          {"$setOnInsert": parked}, upsert=True)
        return JSONResponse(status_code=202, content={"ok": True, "status": "needs_attention",
                                                      "message": "No free room matched — parked in the BillingsEasy inbox"})

    nights = _nights(body.check_in, body.check_out, allow_same_day=is_pkg)
    party = await _intake_guest(org_id, body.guest, org.get("state_code", "33"))
    gst = body.gst_rate
    if is_pkg:
        amount = body.package_amount
        if amount is None and body.total_amount is not None:
            amount = round(body.total_amount / (1 + (gst if gst is not None else 5.0) / 100), 2)
        amount = amount or 0
    else:
        tariff = body.tariff
        if tariff is None and body.total_amount is not None:
            r = gst if gst is not None else stay_gst_rate(body.total_amount / max(nights, 1))
            tariff = round(body.total_amount / (1 + r / 100) / max(nights, 1), 2)
        tariff = tariff if tariff is not None else (room or {}).get("tariff", 0)
        amount = 0
    doc = {"id": str(uuid.uuid4()), "org_id": org_id, "booking_no": await next_invoice_number(org_id, "BK"),
           "party_id": party["id"], "party_snapshot": {k: party.get(k) for k in ("id", "name", "phone", "email", "gstin", "state", "state_code")},
           "room_id": (room or {}).get("id", ""), "room_number": (room or {}).get("number", ""),
           "room_type": (room or {}).get("room_type", "Package" if is_pkg else ""),
           "check_in": body.check_in[:10], "check_out": body.check_out[:10],
           "adults": body.adults, "children": body.children,
           "tariff": 0 if is_pkg else tariff, "gst_rate": gst,
           "booking_type": body.booking_type, "package_name": body.package_name, "package_amount": amount,
           "channel": body.channel, "channel_ref": body.channel_ref or body.external_id,
           "external_id": body.external_id, "intake": True, "source": body.channel,
           "commission_amount": body.commission_amount, "commission_gst_rate": body.commission_gst_rate,
           "status": "booked", "charges": [], "notes": body.notes, "id_proof": "",
           "created_at": now_iso(), "created_by": f"channel:{body.channel}"}
    await db.bookings.insert_one(doc)
    if body.advance_paid and body.advance_paid > 0:
        await db.payments.insert_one({
            "id": str(uuid.uuid4()), "org_id": org_id, "party_id": party["id"], "direction": "received",
            "amount": round(body.advance_paid, 2), "mode": body.advance_mode, "date": now_iso()[:10],
            "reference": body.channel_ref or body.external_id, "bank_account_id": "", "invoice_id": "",
            "expense_id": "", "booking_id": doc["id"], "linked_ref": doc["booking_no"], "linked_type": "booking",
            "biz_type": ictx["biz_type"], "notes": f"Collected by {body.channel}", "created_at": now_iso()})
    view = await _booking_view(ictx, strip_id(doc))
    return {"ok": True, "status": "booked", "booking_id": doc["id"], "booking_no": doc["booking_no"],
            "room": doc["room_number"], "estimated_total": view["estimated_total"], "balance": view["balance"]}


@api.get("/stay/inbox")
async def stay_inbox(ctx=Depends(get_org_ctx)):
    return await db.booking_inbox.find({"org_id": ctx["org_id"], "status": "pending"}, {"_id": 0}) \
        .sort("created_at", -1).to_list(200)


class InboxAssignIn(BaseModel):
    room_id: str = ""
    tariff: Optional[float] = None


@api.post("/stay/inbox/{iid}/accept")
async def stay_inbox_accept(iid: str, body: InboxAssignIn, ctx=Depends(get_org_ctx)):
    """Accept a parked channel booking into a room chosen by the user."""
    await _stay_ctx(ctx)
    item = await db.booking_inbox.find_one({"org_id": ctx["org_id"], "id": iid, "status": "pending"}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Inbox item not found")
    p = BookingIntakeIn(**item["payload"])
    if body.room_id:
        p.room_id = body.room_id
        p.room_number = ""
        p.room_type = ""
    if body.tariff is not None:
        p.tariff = body.tariff
    ictx = {**ctx, "org_name": ""}
    res = await booking_intake(p, ctx["request"], ictx)
    if isinstance(res, JSONResponse):
        raise HTTPException(409, "That room isn't free for these dates — pick another")
    await db.booking_inbox.update_one({"org_id": ctx["org_id"], "id": iid},
                                      {"$set": {"status": "accepted", "booking_id": res.get("booking_id"),
                                                "accepted_at": now_iso()}})
    return res


@api.delete("/stay/inbox/{iid}")
async def stay_inbox_dismiss(iid: str, ctx=Depends(get_org_ctx)):
    await db.booking_inbox.update_one({"org_id": ctx["org_id"], "id": iid},
                                      {"$set": {"status": "dismissed", "dismissed_at": now_iso()}})
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Split a legacy multi-type company into standalone businesses.
# Transactions move by their b2b/b2c tag (payments follow their invoice/bill);
# masters (parties, products) are copied with balances/stock zeroed; anything
# untagged stays put. Every change is recorded so the split can be undone.
# ─────────────────────────────────────────────────────────────────────────────
SPLIT_TXN_COLLECTIONS = ("invoices", "purchases", "expenses")


class SplitTargetIn(BaseModel):
    biz_type: str
    name: str = Field(min_length=2, max_length=80)
    state_code: str = ""
    gstin: str = ""


class SplitIn(BaseModel):
    targets: List[SplitTargetIn]


async def _split_plan(org_id: str, targets: List[SplitTargetIn]) -> dict:
    """Work out what goes where. A master (party/product) moves outright when it is
    used by exactly one new business and by nothing that stays behind; otherwise it is
    shared, i.e. copied with balance/stock zeroed."""
    wanted = {t.biz_type for t in targets}
    untagged_q = {"$or": [{"biz_type": None}, {"biz_type": {"$exists": False}}, {"biz_type": {"$nin": list(wanted)}}]}
    stay_inv = await db.invoices.find({"org_id": org_id, **untagged_q}, {"_id": 0, "party_id": 1, "items": 1}).to_list(5000)
    stay_pur = await db.purchases.find({"org_id": org_id, **untagged_q}, {"_id": 0, "party_id": 1, "items": 1}).to_list(5000)
    staying_parties = {d.get("party_id") for d in stay_inv + stay_pur if d.get("party_id")}
    staying_products = {i.get("product_id") for d in stay_inv + stay_pur for i in (d.get("items") or []) if i.get("product_id")}

    plan, party_use, product_use, docs_by_type = {}, {}, {}, {}
    for t in targets:
        bt = t.biz_type
        inv = await db.invoices.find({"org_id": org_id, "biz_type": bt}, {"_id": 0, "id": 1, "party_id": 1, "items": 1}).to_list(5000)
        pur = await db.purchases.find({"org_id": org_id, "biz_type": bt}, {"_id": 0, "id": 1, "party_id": 1, "items": 1}).to_list(5000)
        exp = await db.expenses.count_documents({"org_id": org_id, "biz_type": bt})
        doc_ids = [d["id"] for d in inv + pur]
        pay = await db.payments.count_documents({"org_id": org_id, "invoice_id": {"$in": doc_ids}}) if doc_ids else 0
        pay += await db.payments.count_documents({"org_id": org_id, "biz_type": bt,
                                                  "$or": [{"invoice_id": ""}, {"invoice_id": {"$exists": False}}]})
        pids = {d.get("party_id") for d in inv + pur if d.get("party_id")}
        prods = {i.get("product_id") for d in inv + pur for i in (d.get("items") or []) if i.get("product_id")}
        # products tagged for this business only also belong here, even if never traded yet
        async for pr in db.products.find({"org_id": org_id, "modes": bt}, {"_id": 0, "id": 1, "modes": 1}):
            if [m for m in (pr.get("modes") or []) if m in wanted] == [bt]:
                prods.add(pr["id"])
        for i in pids: party_use.setdefault(i, set()).add(bt)
        for i in prods: product_use.setdefault(i, set()).add(bt)
        docs_by_type[bt] = {"parties": pids, "products": prods, "doc_ids": doc_ids}
        plan[bt] = {"biz_type": bt, "name": t.name, "invoices": len(inv), "purchases": len(pur),
                    "expenses": exp, "payments": pay}
        if bt == "stay":
            plan[bt]["bookings"] = await db.bookings.count_documents({"org_id": org_id})
            plan[bt]["rooms"] = await db.rooms.count_documents({"org_id": org_id})

    party_ids, product_ids = {}, {}
    for bt, d in docs_by_type.items():
        move_p = {i for i in d["parties"] if party_use.get(i) == {bt} and i not in staying_parties}
        move_pr = {i for i in d["products"] if product_use.get(i) == {bt} and i not in staying_products}
        party_ids[bt] = {"move": move_p, "copy": d["parties"] - move_p}
        product_ids[bt] = {"move": move_pr, "copy": d["products"] - move_pr}
        plan[bt].update({"parties_moved": len(move_p), "parties_copied": len(party_ids[bt]["copy"]),
                         "products_moved": len(move_pr), "products_copied": len(product_ids[bt]["copy"])})
    moving_parties = set().union(*[v["move"] for v in party_ids.values()]) if party_ids else set()
    moving_products = set().union(*[v["move"] for v in product_ids.values()]) if product_ids else set()
    all_doc_ids = [i for d in docs_by_type.values() for i in d["doc_ids"]]
    untagged = {
        "invoices": len(stay_inv), "purchases": len(stay_pur),
        "expenses": await db.expenses.count_documents({"org_id": org_id, **untagged_q}),
        "payments": await db.payments.count_documents({"org_id": org_id, "invoice_id": {"$nin": all_doc_ids}}),
        "parties": await db.parties.count_documents({"org_id": org_id}) - len(moving_parties),
        "products": await db.products.count_documents({"org_id": org_id}) - len(moving_products),
        "bank_accounts": await db.bank_accounts.count_documents({"org_id": org_id}),
    }
    return {"targets": list(plan.values()), "stays_in_source": untagged,
            "_party_ids": party_ids, "_product_ids": product_ids}


@api.post("/businesses/split/preview")
async def split_preview(body: SplitIn, ctx=Depends(require_permission("settings.edit"))):
    """Dry run: what each new business would receive. Changes nothing."""
    org = await get_org_doc(ctx["org_id"])
    if org.get("business_type"):
        raise HTTPException(400, "This company is already a single-type business — nothing to split")
    plan = await _split_plan(ctx["org_id"], body.targets)
    acct = await _business_account(await db.users.find_one({"id": org["owner_user_id"]}, {"_id": 0}) or {"id": ""})
    room = acct["limits"]["max_businesses"] - acct["owned_count"]
    return {"source": {"id": org["id"], "name": org["name"]},
            "targets": plan["targets"], "stays_in_source": plan["stays_in_source"],
            "can_create": room >= len(body.targets), "businesses_free": room,
            "notes": [
                "Payments follow the invoice or bill they are linked to; GRNs, delivery orders and stock history follow theirs.",
                "A party or product used by only one new business moves there outright, with its stock / opening balance.",
                "One used by more than one business (or still needed here) is copied instead, with stock and opening balance set to 0 so nothing is counted twice.",
                "Bank accounts, GST settings and staff are not moved; add them per business.",
                "Anything without a B2B/B2C tag stays in this company.",
            ]}


@api.post("/businesses/split/execute")
async def split_execute(body: SplitIn, request: Request, ctx=Depends(require_permission("settings.edit"))):
    org = await get_org_doc(ctx["org_id"])
    if org.get("business_type"):
        raise HTTPException(400, "This company is already a single-type business")
    user = await db.users.find_one({"id": org["owner_user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(400, "Owner not found")
    plan = await _split_plan(ctx["org_id"], body.targets)
    mig = {"id": str(uuid.uuid4()), "source_org_id": org["id"], "created_at": now_iso(),
           "created_by": ctx["user"].get("id"), "status": "done", "targets": [], "moves": [], "copies": []}
    for t in body.targets:
        acct = await _business_account(user)
        if not acct["can_add"]:
            raise HTTPException(402, f"Business limit reached after creating {len(mig['targets'])} of {len(body.targets)} — raise the limit and run the split again")
        new_org = await _create_org_internal(t.name.strip(), user["id"], org.get("state", "Tamil Nadu"),
                                             t.state_code or org.get("state_code", "33"))
        billing_root = (await billing_org_for(org))["id"]
        await db.organizations.update_one({"id": new_org["id"]}, {"$set": {
            "business_type": t.biz_type, "business_mode": t.biz_type, "gstin": (t.gstin or "").upper(),
            "billing_org_id": billing_root, "subscription_status": "addon", "trial_ends_at": None,
            "split_from_org_id": org["id"], "address": org.get("address", ""), "phone": org.get("phone", ""),
            "email": org.get("email", "")}})
        tid, bt = new_org["id"], t.biz_type
        mig["targets"].append({"org_id": tid, "name": t.name, "biz_type": bt})

        # 1. transactions by tag
        moved_docs = []
        for coll in SPLIT_TXN_COLLECTIONS:
            async for d in db[coll].find({"org_id": org["id"], "biz_type": bt}, {"_id": 0, "id": 1}):
                moved_docs.append((coll, d["id"]))
        # 2. payments that belong to those invoices/bills, plus tagged unlinked ones
        doc_ids = [i for c, i in moved_docs if c in ("invoices", "purchases")]
        if doc_ids:
            async for p in db.payments.find({"org_id": org["id"], "invoice_id": {"$in": doc_ids}}, {"_id": 0, "id": 1}):
                moved_docs.append(("payments", p["id"]))
        async for p in db.payments.find({"org_id": org["id"], "biz_type": bt,
                                         "$or": [{"invoice_id": ""}, {"invoice_id": {"$exists": False}}]}, {"_id": 0, "id": 1}):
            moved_docs.append(("payments", p["id"]))
        # 3. stay: bookings and rooms move whole
        if bt == "stay":
            for coll in ("bookings", "rooms"):
                async for d in db[coll].find({"org_id": org["id"]}, {"_id": 0, "id": 1}):
                    moved_docs.append((coll, d["id"]))
        for coll, did in moved_docs:
            await db[coll].update_one({"org_id": org["id"], "id": did},
                                      {"$set": {"org_id": tid, "biz_type": bt, "split_migration_id": mig["id"],
                                                "split_from_org_id": org["id"]}})
            mig["moves"].append({"coll": coll, "id": did, "to": tid})

        # 4. records that hang off those documents: GRNs, delivery orders, stock history
        inv_ids = [i for c, i in moved_docs if c == "invoices"]
        pur_ids = [i for c, i in moved_docs if c == "purchases"]
        extra = []
        if pur_ids:
            async for d in db.grns.find({"org_id": org["id"], "purchase_id": {"$in": pur_ids}}, {"_id": 0, "id": 1}):
                extra.append(("grns", d["id"]))
        if inv_ids:
            async for d in db.delivery_orders.find({"org_id": org["id"], "invoice_id": {"$in": inv_ids}}, {"_id": 0, "id": 1}):
                extra.append(("delivery_orders", d["id"]))
        for coll, did in extra:
            await db[coll].update_one({"org_id": org["id"], "id": did},
                                      {"$set": {"org_id": tid, "split_migration_id": mig["id"], "split_from_org_id": org["id"]}})
            mig["moves"].append({"coll": coll, "id": did, "to": tid})

        # 5. masters: move the ones only this business uses (stock and balances come along),
        #    copy the shared ones with stock/opening balance zeroed so nothing is double-counted
        for coll, ids, zero in (("parties", plan["_party_ids"].get(bt, {}), {"opening_balance": 0, "tds_opening_balance": 0}),
                                ("products", plan["_product_ids"].get(bt, {}), {"stock": 0})):
            for mid in ids.get("move", set()):
                res = await db[coll].update_one({"org_id": org["id"], "id": mid},
                                                {"$set": {"org_id": tid, "split_migration_id": mig["id"],
                                                          "split_from_org_id": org["id"]}})
                if res.modified_count:
                    mig["moves"].append({"coll": coll, "id": mid, "to": tid})
                    if coll == "products":
                        async for sm in db.stock_movements.find({"org_id": org["id"], "product_id": mid}, {"_id": 0, "id": 1}):
                            await db.stock_movements.update_one({"org_id": org["id"], "id": sm["id"]},
                                                                {"$set": {"org_id": tid, "split_migration_id": mig["id"]}})
                            mig["moves"].append({"coll": "stock_movements", "id": sm["id"], "to": tid})
                        async for ws in db.warehouse_stock.find({"org_id": org["id"], "product_id": mid}, {"_id": 0, "product_id": 1, "warehouse_id": 1}):
                            await db.warehouse_stock.update_one(
                                {"org_id": org["id"], "product_id": mid, "warehouse_id": ws["warehouse_id"]},
                                {"$set": {"org_id": tid, "split_migration_id": mig["id"]}})
                            mig["moves"].append({"coll": "warehouse_stock", "id": f"{mid}:{ws['warehouse_id']}", "to": tid})
            for mid in ids.get("copy", set()):
                src = await db[coll].find_one({"org_id": org["id"], "id": mid}, {"_id": 0})
                if not src or await db[coll].find_one({"org_id": tid, "id": mid}, {"_id": 0, "id": 1}):
                    continue
                await db[coll].insert_one({**src, **zero, "org_id": tid, "copied_from_org_id": org["id"],
                                           "split_migration_id": mig["id"], "created_at": now_iso()})
                mig["copies"].append({"coll": coll, "id": mid, "org_id": tid})
    await db.split_migrations.insert_one(mig)
    await audit_log(db, org_id=org["id"], user=ctx["user"], action="business.split", entity_type="organization",
                    entity_id=org["id"], metadata={"migration_id": mig["id"],
                                                   "targets": [t["name"] for t in mig["targets"]],
                                                   "moved": len(mig["moves"])}, request=request)
    return {"ok": True, "migration_id": mig["id"], "targets": mig["targets"],
            "moved": len(mig["moves"]), "copied": len(mig["copies"])}


class SetBusinessTypeIn(BaseModel):
    business_type: str
    force: bool = False


@api.post("/businesses/current/business-type")
async def set_business_type(body: SetBusinessTypeIn, request: Request, ctx=Depends(require_permission("settings.edit"))):
    """Turn a legacy multi-type company into a single-type business, so the type
    switcher disappears and it behaves like every other business."""
    bt = body.business_type.strip().lower()
    if bt not in BUSINESS_TYPES:
        raise HTTPException(400, "Unknown business type")
    org = await get_org_doc(ctx["org_id"])
    if org.get("business_type"):
        raise HTTPException(400, "This is already a single-type business")
    others = {}
    for coll in ("invoices", "purchases", "expenses"):
        async for d in db[coll].aggregate([
            {"$match": {"org_id": ctx["org_id"], "biz_type": {"$nin": [bt, None]}}},
            {"$group": {"_id": "$biz_type", "n": {"$sum": 1}}}]):
            if d["_id"]:
                others[d["_id"]] = others.get(d["_id"], 0) + d["n"]
    if others and not body.force:
        detail = ", ".join(f"{n} {BUSINESS_TYPES.get(t, t)} record(s)" for t, n in sorted(others.items()))
        raise HTTPException(409, f"This company still holds {detail}. Split them into their own businesses first, "
                                 f"or confirm to keep them here under {BUSINESS_TYPES[bt]}.")
    await db.organizations.update_one({"id": ctx["org_id"]},
                                      {"$set": {"business_type": bt, "business_mode": bt, "updated_at": now_iso()}})
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="business.type_set",
                    entity_type="organization", entity_id=ctx["org_id"],
                    metadata={"business_type": bt, "kept_other_types": others}, request=request)
    return {"ok": True, "business_type": bt, "kept_other_types": others}


@api.get("/businesses/split/history")
async def split_history(ctx=Depends(require_permission("settings.view"))):
    rows = await db.split_migrations.find({"source_org_id": ctx["org_id"]}, {"_id": 0, "moves": 0, "copies": 0}) \
        .sort("created_at", -1).to_list(20)
    return rows


@api.post("/businesses/split/{mid}/undo")
async def split_undo(mid: str, request: Request, ctx=Depends(require_permission("settings.edit"))):
    """Put everything back and remove the businesses this split created (only if nothing new was added to them)."""
    mig = await db.split_migrations.find_one({"id": mid, "source_org_id": ctx["org_id"]}, {"_id": 0})
    if not mig:
        raise HTTPException(404, "Split not found")
    if mig["status"] != "done":
        raise HTTPException(400, f"This split is already {mig['status']}")
    moved_ids = {(m["coll"], m["id"]) for m in mig["moves"]}
    for t in mig["targets"]:
        for coll in ("invoices", "purchases", "payments", "expenses", "bookings", "rooms", "grns", "delivery_orders"):
            async for d in db[coll].find({"org_id": t["org_id"]}, {"_id": 0, "id": 1, "split_migration_id": 1}):
                if d.get("split_migration_id") != mid and (coll, d["id"]) not in moved_ids:
                    raise HTTPException(409, f"{t['name']} already has new records — undo would delete them. "
                                             f"Move them out first, or keep the split.")
    for m in mig["moves"]:
        if m["coll"] == "warehouse_stock":
            pid, wid = m["id"].split(":", 1)
            q = {"org_id": m["to"], "product_id": pid, "warehouse_id": wid}
        else:
            q = {"org_id": m["to"], "id": m["id"]}
        await db[m["coll"]].update_one(q, {"$set": {"org_id": mig["source_org_id"]},
                                           "$unset": {"split_migration_id": "", "split_from_org_id": ""}})
    for cpy in mig["copies"]:
        await db[cpy["coll"]].delete_one({"org_id": cpy["org_id"], "id": cpy["id"], "split_migration_id": mid})
    for t in mig["targets"]:
        await db.organizations.update_one({"id": t["org_id"]}, {"$set": {"deleted": True, "deleted_at": now_iso()}})
        await db.memberships.delete_many({"org_id": t["org_id"]})
    await db.split_migrations.update_one({"id": mid}, {"$set": {"status": "undone", "undone_at": now_iso()}})
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="business.split_undone",
                    entity_type="organization", entity_id=ctx["org_id"], metadata={"migration_id": mid}, request=request)
    return {"ok": True, "restored": len(mig["moves"]), "removed_copies": len(mig["copies"])}


# ─────────────────────────────────────────────────────────────────────────────
# GST filing: e-invoice (IRN) and e-way bill through a GSP/ASP, per business.
# The government IRP is only reachable with credentials in the taxpayer's own
# name, so each business stores its own. We speak the common GSP JSON style
# (the GSP handles NIC's encryption); endpoint paths and response field names
# are configurable, so any provider can be pointed at without a code change.
# ─────────────────────────────────────────────────────────────────────────────
GSP_PRESETS = {
    "custom":        {"label": "Custom / other GSP", "base_url": "", "auth_style": "headers"},
    "mastersindia":  {"label": "Masters India", "base_url": "https://api.mastersindia.co", "auth_style": "headers",
                      "einvoice_path": "/api/v1/einvoice/", "ewaybill_path": "/api/v1/ewayBill/"},
    "cleartax":      {"label": "ClearTax", "base_url": "https://api-einv.cleartax.in", "auth_style": "headers",
                      "einvoice_path": "/v2/einvoice/generate", "ewaybill_path": "/v2/ewaybill/generate"},
    "nic_sandbox":   {"label": "NIC sandbox (testing only)", "base_url": "https://einv-apisandbox.nic.in",
                      "auth_style": "headers", "einvoice_path": "/eicore/v1.03/Invoice",
                      "ewaybill_path": "/ewaybillapi/v1.03/ewayapi"},
}
GST_SETTINGS_ID = "gst_filing"


class GstFilingSettingsIn(BaseModel):
    provider: str = "custom"
    base_url: str = ""
    einvoice_path: str = ""
    ewaybill_path: str = ""
    client_id: str = ""
    client_secret: str = ""
    username: str = ""
    password: str = ""
    gstin: str = ""
    extra_headers: Dict[str, str] = {}
    auto_einvoice: bool = False          # raise the IRN as soon as an invoice is finalized
    einvoice_threshold: float = 0        # only for invoices at/above this value (0 = all)
    enabled: bool = False


def fmt_ddmmyyyy(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso[:10]).strftime("%d-%m-%Y")
    except Exception:
        return iso


def _mask(v: str) -> str:
    return ("•" * max(len(v) - 4, 0) + v[-4:]) if v else ""


async def _gst_settings(org_id: str) -> dict:
    row = await db.gst_settings.find_one({"org_id": org_id, "id": GST_SETTINGS_ID}, {"_id": 0}) or {}
    preset = GSP_PRESETS.get(row.get("provider", "custom"), GSP_PRESETS["custom"])
    return {**{k: "" for k in ("base_url", "einvoice_path", "ewaybill_path", "client_id", "client_secret",
                               "username", "password", "gstin")},
            "provider": "custom", "extra_headers": {}, "auto_einvoice": False, "einvoice_threshold": 0,
            "enabled": False, **row,
            "base_url": (row.get("base_url") or preset.get("base_url", "")).rstrip("/"),
            "einvoice_path": row.get("einvoice_path") or preset.get("einvoice_path", ""),
            "ewaybill_path": row.get("ewaybill_path") or preset.get("ewaybill_path", "")}


def _gsp_headers(cfg: dict) -> dict:
    h = {"Content-Type": "application/json"}
    if cfg.get("client_id"): h["client_id"] = cfg["client_id"]
    if cfg.get("client_secret"): h["client_secret"] = cfg["client_secret"]
    if cfg.get("username"): h["username"] = cfg["username"]
    if cfg.get("password"): h["password"] = cfg["password"]
    if cfg.get("gstin"): h["gstin"] = cfg["gstin"]
    h.update(cfg.get("extra_headers") or {})
    return h


def _dig(data: Any, *names: str) -> Optional[str]:
    """Pull a field like Irn / irn / data.Irn out of whatever shape the GSP returns."""
    found = {}

    def walk(node):
        if isinstance(node, dict):
            for k, v in node.items():
                if isinstance(v, (dict, list)):
                    walk(v)
                elif k.lower() not in found:
                    found[k.lower()] = v
        elif isinstance(node, list):
            for v in node:
                walk(v)
    walk(data)
    for n in names:
        if found.get(n.lower()) not in (None, ""):
            return str(found[n.lower()])
    return None


async def _gsp_post(cfg: dict, path: str, payload: dict) -> dict:
    if not cfg.get("enabled"):
        raise HTTPException(400, "GST filing is switched off for this business — turn it on in Settings → GST filing")
    if not cfg.get("base_url") or not path:
        raise HTTPException(400, "Your GSP's API URL is not set — add it in Settings → GST filing")
    url = f"{cfg['base_url']}{path}"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(url, json=payload, headers=_gsp_headers(cfg))
    except httpx.TimeoutException:
        raise HTTPException(504, "The GSP did not respond in time — nothing was filed, try again")
    except Exception as e:
        raise HTTPException(502, f"Could not reach the GSP: {str(e)[:150]}")
    try:
        data = r.json()
    except Exception:
        raise HTTPException(502, f"GSP returned a non-JSON reply ({r.status_code}): {r.text[:200]}")
    if r.status_code >= 400 or str(_dig(data, "Status", "status") or "").lower() in ("0", "error", "failed"):
        msg = _dig(data, "ErrorMessage", "error_message", "message", "Desc", "errorDesc") or f"GSP rejected it ({r.status_code})"
        raise HTTPException(422, f"GSP: {msg}")
    return data


@api.get("/gst/gstr1/portal-json")
async def gstr1_portal_json(month: Optional[str] = Query(None, description="YYYY-MM"), ctx=Depends(get_org_ctx)):
    """GSTR-1 in the JSON shape the GST offline utility / portal accepts (schema v2.1).
    Needs no credentials — download it and upload on gst.gov.in."""
    month = month or now_dt().strftime("%Y-%m")
    org = await get_org_doc(ctx["org_id"])
    gstin = (org.get("gstin") or "").upper()
    if not gstin:
        raise HTTPException(400, "Add your GSTIN in Settings before exporting GSTR-1")
    fp = f"{month[5:7]}{month[0:4]}"                      # MMYYYY
    b2b: Dict[str, list] = {}
    b2cs: Dict[tuple, dict] = {}
    hsn: Dict[tuple, dict] = {}
    gt = 0.0
    async for inv in db.invoices.find({"org_id": ctx["org_id"], "type": "sale",
                                       "invoice_date": {"$regex": f"^{month}"},
                                       "status": {"$nin": ["cancelled", "void", "draft"]}}, {"_id": 0}):
        t = inv.get("totals") or {}
        party = inv.get("party_snapshot") or {}
        pos = (party.get("state_code") or org.get("state_code") or "33").zfill(2)
        intra = t.get("igst", 0) == 0
        gt += t.get("grand_total", 0)
        rows = {}
        for idx, it in enumerate(inv.get("items") or [], start=1):
            rt = float(it.get("gst_rate", 0) or 0)
            r = rows.setdefault(rt, {"num": idx, "itm_det": {"rt": rt, "txval": 0, "iamt": 0, "camt": 0, "samt": 0, "csamt": 0}})
            d = r["itm_det"]
            d["txval"] = round(d["txval"] + it.get("taxable", 0), 2)
            d["iamt"] = round(d["iamt"] + it.get("igst", 0), 2)
            d["camt"] = round(d["camt"] + it.get("cgst", 0), 2)
            d["samt"] = round(d["samt"] + it.get("sgst", 0), 2)
            key = (str(it.get("hsn") or ""), (it.get("unit") or "NOS").upper(), rt)
            h = hsn.setdefault(key, {"num": len(hsn) + 1, "hsn_sc": key[0], "desc": (it.get("name") or "")[:30],
                                     "uqc": key[1], "qty": 0, "rt": rt, "txval": 0, "iamt": 0, "camt": 0, "samt": 0, "csamt": 0})
            h["qty"] = round(h["qty"] + it.get("qty", 0), 3)
            for src, dst in (("taxable", "txval"), ("igst", "iamt"), ("cgst", "camt"), ("sgst", "samt")):
                h[dst] = round(h[dst] + it.get(src, 0), 2)
        itms = list(rows.values())
        if party.get("gstin"):
            b2b.setdefault(party["gstin"].upper(), []).append({
                "inum": inv.get("invoice_no", ""), "idt": fmt_ddmmyyyy(inv.get("invoice_date", "")),
                "val": round(t.get("grand_total", 0), 2), "pos": pos, "rchrg": "N", "inv_typ": "R", "itms": itms})
        else:
            for r in itms:
                d = r["itm_det"]
                k = ("INTRA" if intra else "INTER", d["rt"], pos)
                e = b2cs.setdefault(k, {"sply_ty": k[0], "rt": d["rt"], "typ": "OE", "pos": pos,
                                        "txval": 0, "iamt": 0, "camt": 0, "samt": 0, "csamt": 0})
                for f in ("txval", "iamt", "camt", "samt"):
                    e[f] = round(e[f] + d[f], 2)
    out = {"gstin": gstin, "fp": fp, "version": "GST3.2.1", "hash": "hash",
           "gt": round(gt, 2), "cur_gt": round(gt, 2)}
    if b2b:
        out["b2b"] = [{"ctin": c, "inv": invs} for c, invs in b2b.items()]
    if b2cs:
        out["b2cs"] = list(b2cs.values())
    if hsn:
        out["hsn"] = {"data": list(hsn.values())}
    return out


INVOICE_TEMPLATES = [
    {"id": "classic", "name": "Classic GST", "desc": "Full India GST layout — company header, Bill To / Ship To, itemised CGST/SGST columns"},
    {"id": "modern", "name": "Modern", "desc": "Colour header bar, shaded rows, prominent grand total"},
    {"id": "compact", "name": "Compact", "desc": "Dense spreadsheet style — best for long item lists"},
    {"id": "elegant", "name": "Elegant", "desc": "Letterhead feel: centred title, hairline rules, lots of white space"},
    {"id": "professional", "name": "Professional", "desc": "Coloured side band, meta card, zebra rows, filled total bar"},
    {"id": "minimal", "name": "Minimal", "desc": "Monochrome and airy — no boxes, just fine rules"},
]


@api.get("/business/invoice-templates")
async def list_invoice_templates(ctx=Depends(get_org_ctx)):
    return {"templates": INVOICE_TEMPLATES,
            "current": (((await get_org_doc(ctx["org_id"])).get("invoice_theme")) or {}).get("template", "classic")}


@api.get("/business/invoice-preview.pdf")
async def invoice_theme_preview(template: str = "classic", primary_color: str = "", watermark: str = "",
                                show_logo: bool = True, show_bank: bool = True, show_terms: bool = True,
                                show_signature: bool = True, show_ship_to: bool = True,
                                ctx=Depends(get_org_ctx)):
    """Render a sample invoice with the chosen look — nothing is saved."""
    biz = await get_org_doc(ctx["org_id"])
    theme = {**(biz.get("invoice_theme") or {}), "template": template,
             "show_logo": show_logo, "show_bank": show_bank, "show_terms": show_terms,
             "show_signature": show_signature, "show_ship_to": show_ship_to, "watermark": watermark}
    if primary_color:
        theme["primary_color"] = primary_color
    sample = {
        "invoice_no": "INV-2026-0055", "invoice_date": now_iso()[:10], "due_date": now_iso()[:10],
        "type": "sale", "status": "finalized", "same_state": True, "po_number": "PO-4417",
        "party_snapshot": {"name": "63Ideas Infolabs Private Limited", "gstin": "33AAACZ8597L1ZJ",
                           "state": "Tamil Nadu", "state_code": "33",
                           "billing_address": "IndiQube Viceroy, Sardar Patel Rd,\nGuindy, Chennai 600032",
                           "shipping_address": "Warehouse 2, Ambattur Industrial Estate,\nChennai 600058"},
        "items": [
            {"name": "Sugar 50 KGS", "hsn": "17011490", "qty": 1900, "unit": "BAGS", "rate": 2200,
             "discount_pct": 0, "gst_rate": 5, "taxable": 4180000, "cgst": 104500, "sgst": 104500,
             "igst": 0, "total": 4389000},
            {"name": "Freight & handling", "hsn": "996511", "qty": 1, "unit": "NOS", "rate": 25000,
             "discount_pct": 0, "gst_rate": 5, "taxable": 25000, "cgst": 625, "sgst": 625,
             "igst": 0, "total": 26250},
        ],
        "totals": {"subtotal": 4205000, "discount": 0, "taxable_amount": 4205000, "cgst": 105125,
                   "sgst": 105125, "igst": 0, "round_off": 0, "grand_total": 4415250},
    }
    pdf = generate_invoice_pdf(sample, {**biz, "invoice_theme": theme}, template=template)
    return StreamingResponse(BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": 'inline; filename="invoice-preview.pdf"'})


@api.get("/gst/filing-settings")
async def get_gst_filing_settings(ctx=Depends(require_permission("settings.view"))):
    cfg = await _gst_settings(ctx["org_id"])
    safe = {**cfg, "client_secret": _mask(cfg.get("client_secret", "")), "password": _mask(cfg.get("password", ""))}
    filed = await db.invoices.count_documents({"org_id": ctx["org_id"], "irn": {"$exists": True, "$ne": ""}})
    ewb = await db.invoices.count_documents({"org_id": ctx["org_id"], "ewb_no": {"$exists": True, "$ne": ""}})
    return {"settings": safe, "presets": GSP_PRESETS, "irn_generated": filed, "eway_bills": ewb}


@api.put("/gst/filing-settings")
async def save_gst_filing_settings(body: GstFilingSettingsIn, request: Request,
                                   ctx=Depends(require_permission("settings.edit"))):
    cur = await _gst_settings(ctx["org_id"])
    data = body.model_dump()
    # keep stored secrets when the form sends the masked value back
    for k in ("client_secret", "password"):
        if not data.get(k) or set(data[k]) <= {"•"} or data[k] == _mask(cur.get(k, "")):
            data[k] = cur.get(k, "")
    await db.gst_settings.update_one({"org_id": ctx["org_id"], "id": GST_SETTINGS_ID},
                                     {"$set": {**data, "org_id": ctx["org_id"], "id": GST_SETTINGS_ID,
                                               "updated_at": now_iso()}}, upsert=True)
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="gst.filing_settings_updated",
                    entity_type="organization", entity_id=ctx["org_id"],
                    metadata={"provider": data["provider"], "enabled": data["enabled"]}, request=request)
    return await get_gst_filing_settings(ctx)


async def _generate_irn(ctx: dict, inv: dict, org: dict) -> dict:
    if inv.get("irn"):
        return {"ok": True, "duplicate": True, "irn": inv["irn"], "ack_no": inv.get("ack_no", ""),
                "invoice_no": inv["invoice_no"]}
    cfg = await _gst_settings(ctx["org_id"])
    if not cfg.get("enabled"):
        raise HTTPException(400, "GST filing is switched off for this business — turn it on in Settings → GST filing")
    check = einvoice_precheck(inv, org)
    if not check["ok"]:
        raise HTTPException(400, "; ".join(check["errors"]))
    data = await _gsp_post(cfg, cfg["einvoice_path"], build_einvoice_json(inv, org))
    irn = _dig(data, "Irn", "irn")
    if not irn:
        raise HTTPException(502, "The GSP replied without an IRN — check the response format with your provider")
    patch = {"irn": irn, "ack_no": _dig(data, "AckNo", "ack_no") or "",
             "ack_date": _dig(data, "AckDt", "ack_date") or "",
             "signed_qr_code": _dig(data, "SignedQRCode", "signed_qr", "qr_code") or "",
             "signed_invoice": _dig(data, "SignedInvoice") or "",
             "einvoice_status": "generated", "einvoice_at": now_iso()}
    ewb = _dig(data, "EwbNo", "ewb_no")
    if ewb:
        patch.update({"ewb_no": ewb, "ewb_date": _dig(data, "EwbDt", "ewb_date") or ""})
    await db.invoices.update_one({"org_id": ctx["org_id"], "id": inv["id"]}, {"$set": patch})
    return {"ok": True, "duplicate": False, "invoice_no": inv["invoice_no"], **patch}


@api.post("/invoices/{iid}/einvoice/generate")
async def invoice_generate_irn(iid: str, request: Request, ctx=Depends(require_permission("invoice.create"))):
    """Register the invoice on the IRP through your GSP and store the IRN + signed QR."""
    inv = await db.invoices.find_one(org_filter(ctx, {"id": iid}), {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    org = await get_org_doc(ctx["org_id"])
    res = await _generate_irn(ctx, inv, org)
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="invoice.irn_generated",
                    entity_type="invoice", entity_id=iid,
                    metadata={"invoice_no": inv["invoice_no"], "irn": res.get("irn")}, request=request)
    return res


class IrnCancelIn(BaseModel):
    reason_code: str = "1"      # 1 duplicate, 2 data entry mistake, 3 order cancelled, 4 other
    remark: str = "Cancelled"


@api.post("/invoices/{iid}/einvoice/cancel")
async def invoice_cancel_irn(iid: str, body: IrnCancelIn, request: Request,
                             ctx=Depends(require_permission("invoice.create"))):
    """Cancel an IRN. The IRP only allows this within 24 hours of generation."""
    inv = await db.invoices.find_one(org_filter(ctx, {"id": iid}), {"_id": 0})
    if not inv or not inv.get("irn"):
        raise HTTPException(400, "This invoice has no IRN")
    cfg = await _gst_settings(ctx["org_id"])
    path = (cfg.get("einvoice_path") or "").rstrip("/") + "/Cancel"
    await _gsp_post(cfg, path, {"Irn": inv["irn"], "CnlRsn": body.reason_code, "CnlRem": body.remark})
    await db.invoices.update_one({"org_id": ctx["org_id"], "id": iid},
                                 {"$set": {"einvoice_status": "cancelled", "einvoice_cancelled_at": now_iso(),
                                           "einvoice_cancel_reason": body.remark}})
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="invoice.irn_cancelled",
                    entity_type="invoice", entity_id=iid, metadata={"irn": inv["irn"]}, request=request)
    return {"ok": True, "irn": inv["irn"], "status": "cancelled"}


@api.post("/invoices/{iid}/eway-bill/generate")
async def invoice_generate_ewb(iid: str, body: dict, request: Request,
                               ctx=Depends(require_permission("invoice.create"))):
    """File the e-way bill through your GSP and store the EWB number."""
    inv = await db.invoices.find_one(org_filter(ctx, {"id": iid}), {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.get("ewb_no"):
        return {"ok": True, "duplicate": True, "ewb_no": inv["ewb_no"], "ewb_date": inv.get("ewb_date", "")}
    built = await invoice_eway_bill(iid, body, ctx)          # reuse the existing validation + NIC payload
    if not built.get("ok"):
        raise HTTPException(400, "; ".join(built.get("errors") or ["E-way bill data is incomplete"]))
    cfg = await _gst_settings(ctx["org_id"])
    payload = dict(built["payload"])
    if inv.get("irn"):
        payload["Irn"] = inv["irn"]
    data = await _gsp_post(cfg, cfg["ewaybill_path"], payload)
    ewb = _dig(data, "EwbNo", "ewayBillNo", "ewb_no")
    if not ewb:
        raise HTTPException(502, "The GSP replied without an e-way bill number")
    patch = {"ewb_no": ewb, "ewb_date": _dig(data, "EwbDt", "ewayBillDate", "ewb_date") or "",
             "ewb_valid_till": _dig(data, "EwbValidTill", "validUpto") or "", "ewb_at": now_iso()}
    await db.invoices.update_one({"org_id": ctx["org_id"], "id": iid}, {"$set": patch})
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="invoice.ewb_generated",
                    entity_type="invoice", entity_id=iid,
                    metadata={"invoice_no": inv["invoice_no"], "ewb_no": ewb}, request=request)
    return {"ok": True, "duplicate": False, **patch}


@api.post("/gst/filing-settings/test")
async def test_gst_filing(ctx=Depends(require_permission("settings.edit"))):
    """Check the GSP is reachable with the saved credentials (no invoice is filed)."""
    cfg = await _gst_settings(ctx["org_id"])
    if not cfg.get("base_url"):
        raise HTTPException(400, "Add your GSP's API URL first")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(cfg["base_url"], headers=_gsp_headers(cfg))
        return {"ok": r.status_code < 500, "status_code": r.status_code,
                "message": f"{cfg['base_url']} responded with {r.status_code}. "
                           f"Credentials are only truly verified on the first real invoice."}
    except Exception as e:
        raise HTTPException(502, f"Could not reach {cfg['base_url']}: {str(e)[:150]}")


# ─────────────────────────────────────────────────────────────────────────────
# Public API: let your own website / app post straight into a business.
# One key per business (Settings → Integrations), sent as X-API-Key.
# Everything is idempotent on your own reference, so retries are safe.
# ─────────────────────────────────────────────────────────────────────────────
PUBLIC_API_PROVIDER = "public_api"


async def api_key_ctx(request: Request) -> dict:
    key = (request.headers.get("X-API-Key") or request.headers.get("X-Integration-Key") or "").strip()
    if not key:
        raise HTTPException(401, "Missing X-API-Key")
    row = await db.integration_keys.find_one(
        {"key_hash": _key_hash(key), "provider": PUBLIC_API_PROVIDER, "revoked": {"$ne": True}}, {"_id": 0})
    if not row:
        raise HTTPException(401, "Invalid API key")
    await db.integration_keys.update_one({"key_hash": row["key_hash"]}, {"$set": {"last_used_at": now_iso()}})
    org = await db.organizations.find_one({"id": row["org_id"]}, {"_id": 0, "business_type": 1, "name": 1})
    return {"org_id": row["org_id"], "role": "owner", "permissions": list(PERMISSIONS), "allowed_modes": [],
            "biz_type": (org or {}).get("business_type"), "entity_id": None, "entity": None,
            "org_name": (org or {}).get("name", ""), "request": request,
            "user": {"id": "integration:api", "name": "Website API", "email": ""}}


@api.get("/integrations/api-key")
async def public_api_key_status(ctx=Depends(require_permission("settings.view"))):
    row = await db.integration_keys.find_one(
        {"org_id": ctx["org_id"], "provider": PUBLIC_API_PROVIDER, "revoked": {"$ne": True}}, {"_id": 0, "key_hash": 0})
    return {"connected": bool(row), "key_hint": (row or {}).get("key_hint", ""),
            "last_used_at": (row or {}).get("last_used_at"),
            "invoices_via_api": await db.invoices.count_documents({"org_id": ctx["org_id"], "source": "api"})}


@api.post("/integrations/api-key")
async def public_api_key_create(request: Request, ctx=Depends(require_permission("settings.edit"))):
    key = "be_api_" + secrets.token_urlsafe(32)
    await db.integration_keys.update_many({"org_id": ctx["org_id"], "provider": PUBLIC_API_PROVIDER},
                                          {"$set": {"revoked": True, "revoked_at": now_iso()}})
    await db.integration_keys.insert_one({"id": str(uuid.uuid4()), "org_id": ctx["org_id"],
                                          "provider": PUBLIC_API_PROVIDER, "key_hash": _key_hash(key),
                                          "key_hint": key[-4:], "created_at": now_iso(),
                                          "created_by": ctx["user"].get("id")})
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="integration.key_created",
                    entity_type="integration", entity_id=PUBLIC_API_PROVIDER, metadata={}, request=request)
    return {"key": key, "key_hint": key[-4:]}


@api.get("/v1/ping")
async def public_ping(ictx=Depends(api_key_ctx)):
    return {"ok": True, "business": ictx["org_name"], "business_type": ictx["biz_type"]}


@api.get("/v1/products")
async def public_products(search: str = "", ictx=Depends(api_key_ctx)):
    q = {"org_id": ictx["org_id"]}
    if search:
        q["$or"] = [{"name": {"$regex": re.escape(search), "$options": "i"}},
                    {"sku": {"$regex": f"^{re.escape(search)}$", "$options": "i"}}]
    rows = await db.products.find(q, {"_id": 0, "id": 1, "name": 1, "sku": 1, "upc": 1, "hsn": 1, "unit": 1,
                                      "sale_price": 1, "gst_rate": 1, "stock": 1}).sort("name", 1).to_list(500)
    return {"products": rows}


@api.get("/v1/parties")
async def public_parties(search: str = "", type: str = "", ictx=Depends(api_key_ctx)):
    q = {"org_id": ictx["org_id"]}
    if type: q["type"] = type
    if search:
        q["$or"] = [{"name": {"$regex": re.escape(search), "$options": "i"}},
                    {"phone": {"$regex": f"{re.escape(search)}$"}}, {"email": search.lower()}]
    rows = await db.parties.find(q, {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1, "gstin": 1,
                                     "state": 1, "state_code": 1, "type": 1}).sort("name", 1).to_list(500)
    return {"parties": rows}


class PublicPartyIn(BaseModel):
    name: str
    phone: str = ""
    email: str = ""
    gstin: str = ""
    state: str = ""
    address: str = ""
    type: str = "customer"


@api.post("/v1/parties")
async def public_create_party(body: PublicPartyIn, ictx=Depends(api_key_ctx)):
    """Find an existing customer/supplier by phone or email, or create one."""
    org = await get_org_doc(ictx["org_id"])
    g = IntakeGuest(name=body.name, phone=body.phone, email=body.email, gstin=body.gstin,
                    state=body.state, address=body.address)
    party = await _intake_guest(ictx["org_id"], g, org.get("state_code", "33"))
    if body.type != "customer" and party.get("type") == "customer":
        await db.parties.update_one({"org_id": ictx["org_id"], "id": party["id"]}, {"$set": {"type": body.type}})
        party["type"] = body.type
    return {"party": {k: party.get(k) for k in ("id", "name", "phone", "email", "gstin", "state", "state_code", "type")}}


class PublicInvoiceItem(BaseModel):
    name: str = ""
    sku: str = ""
    product_id: str = ""
    qty: float = 1
    rate: Optional[float] = None         # before GST; taken from the product when omitted
    price_incl_gst: Optional[float] = None
    gst_rate: Optional[float] = None
    hsn: str = ""
    unit: str = ""
    discount_pct: float = 0


class PublicInvoiceIn(BaseModel):
    external_id: str = Field(min_length=1)     # your own order id — resending is safe
    customer: PublicPartyIn
    items: List[PublicInvoiceItem]
    invoice_date: str = ""
    notes: str = ""
    shipping: float = 0
    paid_amount: float = 0                     # already collected, recorded as Money In
    payment_mode: str = "Online"
    reference: str = ""


@api.post("/v1/invoices")
async def public_create_invoice(body: PublicInvoiceIn, request: Request, ictx=Depends(api_key_ctx)):
    """Create a GST sales invoice from your website. Idempotent on external_id."""
    org_id = ictx["org_id"]
    dup = await db.invoices.find_one({"org_id": org_id, "external_source": "api", "external_id": body.external_id},
                                     {"_id": 0, "id": 1, "invoice_no": 1, "totals": 1})
    if dup:
        return {"ok": True, "duplicate": True, "invoice_id": dup["id"], "invoice_no": dup["invoice_no"],
                "total": (dup.get("totals") or {}).get("grand_total", 0)}
    if not body.items:
        raise HTTPException(400, "The invoice has no items")
    org = await get_org_doc(org_id)
    await ensure_active_subscription(ictx)
    await check_limit(db, org, "invoice")
    party = await _intake_guest(org_id, IntakeGuest(**{k: getattr(body.customer, k) for k in
                                                       ("name", "phone", "email", "gstin", "state", "address")}),
                                org.get("state_code", "33"))
    items, unmatched = [], []
    for it in body.items:
        prod = None
        if it.product_id:
            prod = await db.products.find_one({"org_id": org_id, "id": it.product_id}, {"_id": 0})
        if not prod and it.sku:
            prod = await db.products.find_one({"org_id": org_id, "sku": it.sku}, {"_id": 0}) or \
                   await db.products.find_one({"org_id": org_id, "upc": it.sku}, {"_id": 0})
        if not prod and (it.product_id or it.sku):
            unmatched.append(it.sku or it.product_id)
        gst = it.gst_rate if it.gst_rate is not None else float((prod or {}).get("gst_rate", 0) or 0)
        if it.rate is not None:
            rate = it.rate
        elif it.price_incl_gst is not None:
            rate = round(it.price_incl_gst / (1 + gst / 100), 4)
        else:
            rate = float((prod or {}).get("sale_price", 0) or 0)
        name = it.name or (prod or {}).get("name") or it.sku
        if not name:
            raise HTTPException(400, "Each item needs a name, sku or product_id")
        items.append(LineItem(product_id=(prod or {}).get("id", ""), name=name,
                              hsn=it.hsn or (prod or {}).get("hsn", ""), qty=it.qty,
                              unit=it.unit or (prod or {}).get("unit", "NOS"), rate=rate,
                              discount_pct=it.discount_pct, gst_rate=gst))
    if body.shipping and body.shipping > 0:
        items.append(LineItem(name="Shipping charges", hsn="996812", qty=1, unit="NOS", rate=body.shipping, gst_rate=0))
    notes = body.notes or f"Website order {body.external_id}"
    if unmatched:
        notes += f" · not matched to a product (no stock deducted): {', '.join(unmatched)}"
    inv_in = InvoiceIn(party_id=party["id"], invoice_date=(body.invoice_date or now_iso())[:10], items=items,
                       status="finalized", type="sale", invoice_category="stock", notes=notes)
    doc = await _build_invoice_doc(inv_in, ictx, "INV")
    doc.update({"external_source": "api", "external_id": body.external_id, "source": "api"})
    await db.invoices.insert_one(doc)
    for it in items:
        if it.product_id:
            await db.products.update_one({"org_id": org_id, "id": it.product_id}, {"$inc": {"stock": -it.qty}})
            await _log_stock_movement(org_id, it.product_id, -it.qty, movement_type="sale", ref_id=doc["id"],
                                      ref_no=doc["invoice_no"], party_name=party["name"], date=doc["invoice_date"])
    grand = doc["totals"]["grand_total"]
    receipt = None
    if body.paid_amount and body.paid_amount > 0:
        receipt = {"id": str(uuid.uuid4()), "org_id": org_id, "party_id": party["id"], "direction": "received",
                   "amount": round(body.paid_amount, 2), "mode": body.payment_mode, "date": doc["invoice_date"],
                   "reference": body.reference or body.external_id, "bank_account_id": "", "invoice_id": doc["id"],
                   "expense_id": "", "linked_ref": doc["invoice_no"], "linked_type": "invoice",
                   "biz_type": ictx.get("biz_type"), "source": "api", "created_at": now_iso()}
        await db.payments.insert_one(receipt)
        if body.paid_amount >= grand * 0.99:
            await db.invoices.update_one({"org_id": org_id, "id": doc["id"]},
                                         {"$set": {"status": "paid", "status_changed_at": now_iso()}})
    # optional: raise the IRN straight away when the business has that switched on
    einvoice = None
    cfg = await _gst_settings(org_id)
    if cfg.get("enabled") and cfg.get("auto_einvoice") and grand >= (cfg.get("einvoice_threshold") or 0):
        try:
            fresh = await db.invoices.find_one({"org_id": org_id, "id": doc["id"]}, {"_id": 0})
            einvoice = await _generate_irn(ictx, fresh, org)
        except HTTPException as e:
            einvoice = {"ok": False, "error": e.detail}
    return {"ok": True, "duplicate": False, "invoice_id": doc["id"], "invoice_no": doc["invoice_no"],
            "total": grand, "balance": round(max(grand - (body.paid_amount or 0), 0), 2),
            "payment_recorded": bool(receipt), "unmatched_items": unmatched, "einvoice": einvoice}


@api.get("/v1/invoices/{iid}")
async def public_get_invoice(iid: str, ictx=Depends(api_key_ctx)):
    inv = await db.invoices.find_one({"org_id": ictx["org_id"], "id": iid},
                                     {"_id": 0, "signed_invoice": 0}) or \
          await db.invoices.find_one({"org_id": ictx["org_id"], "external_id": iid, "external_source": "api"},
                                     {"_id": 0, "signed_invoice": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    paid = 0.0
    async for p in db.payments.find({"org_id": ictx["org_id"], "invoice_id": inv["id"]}, {"_id": 0, "amount": 1}):
        paid += p["amount"]
    return {"invoice": inv, "paid": round(paid, 2),
            "balance": round((inv.get("totals") or {}).get("grand_total", 0) - paid, 2)}


class PublicPaymentIn(BaseModel):
    external_id: str = Field(min_length=1)
    invoice_id: str = ""
    amount: float = Field(gt=0)
    direction: str = "received"
    mode: str = "Online"
    date: str = ""
    reference: str = ""
    party_id: str = ""


@api.post("/v1/payments")
async def public_create_payment(body: PublicPaymentIn, ictx=Depends(api_key_ctx)):
    """Record money in/out. Idempotent on external_id."""
    org_id = ictx["org_id"]
    dup = await db.payments.find_one({"org_id": org_id, "external_id": body.external_id}, {"_id": 0, "id": 1})
    if dup:
        return {"ok": True, "duplicate": True, "payment_id": dup["id"]}
    inv = None
    if body.invoice_id:
        inv = await db.invoices.find_one({"org_id": org_id, "id": body.invoice_id}, {"_id": 0, "id": 1, "invoice_no": 1, "party_id": 1, "totals": 1}) or \
              await db.invoices.find_one({"org_id": org_id, "external_id": body.invoice_id, "external_source": "api"},
                                         {"_id": 0, "id": 1, "invoice_no": 1, "party_id": 1, "totals": 1})
        if not inv:
            raise HTTPException(404, "Invoice not found")
    party_id = body.party_id or (inv or {}).get("party_id", "")
    if not party_id:
        raise HTTPException(400, "Give an invoice_id or a party_id")
    doc = {"id": str(uuid.uuid4()), "org_id": org_id, "party_id": party_id, "direction": body.direction,
           "amount": round(body.amount, 2), "mode": body.mode, "date": (body.date or now_iso())[:10],
           "reference": body.reference or body.external_id, "bank_account_id": "",
           "invoice_id": (inv or {}).get("id", ""), "expense_id": "",
           "linked_ref": (inv or {}).get("invoice_no", ""), "linked_type": "invoice" if inv else "",
           "external_id": body.external_id, "source": "api", "biz_type": ictx.get("biz_type"),
           "created_at": now_iso()}
    await db.payments.insert_one(doc)
    if inv:
        total_paid = 0.0
        async for p in db.payments.find({"org_id": org_id, "invoice_id": inv["id"]}, {"_id": 0, "amount": 1}):
            total_paid += p["amount"]
        if total_paid >= (inv.get("totals") or {}).get("grand_total", 0) * 0.99:
            await db.invoices.update_one({"org_id": org_id, "id": inv["id"]},
                                         {"$set": {"status": "paid", "status_changed_at": now_iso()}})
    return {"ok": True, "duplicate": False, "payment_id": doc["id"], "linked_invoice": (inv or {}).get("invoice_no", "")}


# ─────────────────────────────────────────────────────────────────────────────
# Live bank feed: anything that can POST (an account-aggregator webhook, your
# bank's corporate API, Zapier/n8n on bank alert emails, a script) pushes
# transactions here and they land on the Bank Statement page, auto-matched.
# Duplicates are impossible: same external_id, or same account+date+amount+text.
# ─────────────────────────────────────────────────────────────────────────────
BANK_FEED_SETTINGS_ID = "bank_feed"


def _bank_row_fingerprint(account_id: str, date: str, debit: float, credit: float, desc: str) -> str:
    raw = f"{account_id}|{date[:10]}|{round(debit, 2)}|{round(credit, 2)}|{(desc or '').strip().lower()[:80]}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


async def match_bank_row(ctx: dict, date: str, description: str, debit: float, credit: float) -> dict:
    """Find what a bank line corresponds to: a recorded payment first, then an
    unpaid invoice (money in) or purchase bill (money out)."""
    out = {"matched": False, "match_type": None, "match_id": None, "match_ref": None}
    amount = credit if credit > 0 else debit
    if amount <= 0:
        return out
    is_credit = credit > 0
    try:
        dt = datetime.fromisoformat(date[:10])
        d_from, d_to = (dt - timedelta(days=3)).date().isoformat(), (dt + timedelta(days=3)).date().isoformat()
    except Exception:
        d_from = d_to = date[:10]
    lo, hi = amount * 0.99, amount * 1.01

    payment = await db.payments.find_one(org_filter(ctx, {
        "direction": "received" if is_credit else "paid",
        "amount": {"$gte": lo, "$lte": hi}, "date": {"$gte": d_from, "$lte": d_to}}), {"_id": 0})
    if not payment and description:
        for ref in re.findall(r"[A-Z0-9]{8,}", description.upper())[:3]:
            payment = await db.payments.find_one(
                org_filter(ctx, {"reference": {"$regex": re.escape(ref), "$options": "i"}}), {"_id": 0})
            if payment:
                break
    if payment:
        party = await db.parties.find_one(org_filter(ctx, {"id": payment.get("party_id")}), {"_id": 0, "name": 1})
        return {"matched": True, "match_type": "payment", "match_id": payment["id"],
                "match_ref": " · ".join(x for x in [(party or {}).get("name", ""), payment.get("reference", "")] if x)}

    if is_credit:
        inv = await db.invoices.find_one(org_filter(ctx, {
            "type": "sale", "status": {"$nin": ["draft", "cancelled", "void"]},
            "totals.grand_total": {"$gte": lo, "$lte": hi}}), {"_id": 0, "id": 1, "invoice_no": 1})
        if inv:
            return {"matched": True, "match_type": "invoice", "match_id": inv["id"],
                    "match_ref": inv.get("invoice_no", inv["id"])}
    else:
        pur = await db.purchases.find_one(org_filter(ctx, {
            "status": {"$ne": "cancelled"},
            "totals.grand_total": {"$gte": lo, "$lte": hi}}), {"_id": 0, "id": 1, "bill_no": 1, "po_no": 1})
        if pur:
            return {"matched": True, "match_type": "purchase", "match_id": pur["id"],
                    "match_ref": pur.get("po_no") or pur.get("bill_no") or pur["id"]}
    return out


class BankFeedTxn(BaseModel):
    external_id: str = ""              # the bank's / provider's own id, when there is one
    date: str
    description: str = ""
    amount: Optional[float] = None     # positive = money in, negative = money out
    debit: float = 0
    credit: float = 0
    balance: float = 0
    reference: str = ""
    bank_account_id: str = ""
    account_no: str = ""               # last 4 digits are enough


class BankFeedIn(BaseModel):
    transactions: List[BankFeedTxn]
    bank_account_id: str = ""
    account_no: str = ""
    source: str = "feed"


async def _resolve_bank_account(org_id: str, account_id: str, account_no: str) -> Optional[dict]:
    if account_id:
        acc = await db.bank_accounts.find_one({"org_id": org_id, "id": account_id}, {"_id": 0})
        if acc:
            return acc
    digits = "".join(ch for ch in (account_no or "") if ch.isdigit())
    if digits:
        async for acc in db.bank_accounts.find({"org_id": org_id}, {"_id": 0}):
            if str(acc.get("account_no", "")).endswith(digits[-4:]):
                return acc
    accounts = await db.bank_accounts.find({"org_id": org_id}, {"_id": 0}).to_list(5)
    return accounts[0] if len(accounts) == 1 else None


@api.post("/v1/bank-transactions")
async def bank_feed_push(body: BankFeedIn, ictx=Depends(api_key_ctx)):
    """Push bank transactions as they happen. Safe to resend — duplicates are ignored."""
    org_id = ictx["org_id"]
    cfg = await db.gst_settings.find_one({"org_id": org_id, "id": BANK_FEED_SETTINGS_ID}, {"_id": 0}) or {}
    added, duplicates, matched, payments_created, unknown_account = 0, 0, 0, 0, 0
    rows = []
    for t in body.transactions:
        acc = await _resolve_bank_account(org_id, t.bank_account_id or body.bank_account_id,
                                          t.account_no or body.account_no)
        if not acc:
            unknown_account += 1
            continue
        debit, credit = t.debit, t.credit
        if t.amount is not None and not debit and not credit:
            credit, debit = (t.amount, 0) if t.amount >= 0 else (0, abs(t.amount))
        if debit <= 0 and credit <= 0:
            continue
        fp = _bank_row_fingerprint(acc["id"], t.date, debit, credit, t.description)
        q = {"org_id": org_id, "external_id": t.external_id} if t.external_id else {"org_id": org_id, "fingerprint": fp}
        if await db.bank_statement_rows.find_one(q, {"_id": 0, "id": 1}):
            duplicates += 1
            continue
        m = await match_bank_row(ictx, t.date, t.description or t.reference, debit, credit)
        entry = {"id": str(uuid.uuid4()), "org_id": org_id, "bank_account_id": acc["id"],
                 "batch_id": f"feed-{t.date[:10]}", "date": t.date[:10],
                 "description": t.description or t.reference, "debit": debit, "credit": credit,
                 "balance": t.balance, "reference": t.reference, "external_id": t.external_id or "",
                 "fingerprint": fp, "source": body.source, "created_at": now_iso(), **m}
        # optionally turn a confident invoice/bill match straight into a receipt/payment
        if cfg.get("auto_create_payment") and m["matched"] and m["match_type"] in ("invoice", "purchase"):
            party_id, linked_ref = "", m["match_ref"]
            if m["match_type"] == "invoice":
                doc = await db.invoices.find_one({"org_id": org_id, "id": m["match_id"]}, {"_id": 0, "party_id": 1})
            else:
                doc = await db.purchases.find_one({"org_id": org_id, "id": m["match_id"]}, {"_id": 0, "party_id": 1})
            party_id = (doc or {}).get("party_id", "")
            if party_id:
                pay = {"id": str(uuid.uuid4()), "org_id": org_id, "party_id": party_id,
                       "direction": "received" if credit > 0 else "paid",
                       "amount": round(credit or debit, 2), "mode": "Bank Transfer", "date": entry["date"],
                       "reference": t.reference or t.external_id or "", "bank_account_id": acc["id"],
                       "bank_account_name": f"{acc['bank_name']} – {str(acc.get('account_no',''))[-4:]}",
                       "invoice_id": m["match_id"], "expense_id": "", "linked_ref": linked_ref,
                       "linked_type": "invoice", "biz_type": ictx.get("biz_type"), "source": "bank-feed",
                       "created_at": now_iso()}
                await db.payments.insert_one(pay)
                entry.update({"match_type": "payment", "match_id": pay["id"], "auto_payment": True})
                payments_created += 1
        await db.bank_statement_rows.insert_one(entry)
        added += 1
        matched += 1 if entry["matched"] else 0
        rows.append({"date": entry["date"], "amount": credit or -debit, "matched": entry["matched"],
                     "match_ref": entry["match_ref"]})
    await db.gst_settings.update_one({"org_id": org_id, "id": BANK_FEED_SETTINGS_ID},
                                     {"$set": {"org_id": org_id, "id": BANK_FEED_SETTINGS_ID,
                                               "last_received_at": now_iso(), "last_source": body.source}},
                                     upsert=True)
    return {"ok": True, "added": added, "duplicates": duplicates, "matched": matched,
            "payments_created": payments_created, "unknown_account": unknown_account, "rows": rows}


class BankFeedSettingsIn(BaseModel):
    auto_create_payment: bool = False


@api.get("/bank-feed/status")
async def bank_feed_status(ctx=Depends(require_permission("settings.view"))):
    cfg = await db.gst_settings.find_one({"org_id": ctx["org_id"], "id": BANK_FEED_SETTINGS_ID}, {"_id": 0}) or {}
    key = await db.integration_keys.find_one(
        {"org_id": ctx["org_id"], "provider": PUBLIC_API_PROVIDER, "revoked": {"$ne": True}}, {"_id": 0, "key_hint": 1})
    return {"auto_create_payment": bool(cfg.get("auto_create_payment")),
            "last_received_at": cfg.get("last_received_at"), "last_source": cfg.get("last_source", ""),
            "api_key_present": bool(key), "key_hint": (key or {}).get("key_hint", ""),
            "fed_rows": await db.bank_statement_rows.count_documents({"org_id": ctx["org_id"], "source": {"$exists": True, "$ne": ""}}),
            "auto_payments": await db.payments.count_documents({"org_id": ctx["org_id"], "source": "bank-feed"})}


@api.put("/bank-feed/status")
async def bank_feed_settings(body: BankFeedSettingsIn, ctx=Depends(require_permission("settings.edit"))):
    await db.gst_settings.update_one({"org_id": ctx["org_id"], "id": BANK_FEED_SETTINGS_ID},
                                     {"$set": {"org_id": ctx["org_id"], "id": BANK_FEED_SETTINGS_ID,
                                               "auto_create_payment": body.auto_create_payment,
                                               "updated_at": now_iso()}}, upsert=True)
    return await bank_feed_status(ctx)


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
