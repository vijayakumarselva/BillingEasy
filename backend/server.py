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
from ai_helpers import ai_chat_stream, ai_hsn_suggest, ai_categorize_expense, ai_product_suggest

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
    return {"status": "ok", "v": "2.3"}

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
    return {"user": user, "org_id": org_id, "role": membership["role"], "permissions": perms,
            "allowed_modes": allowed_modes, "request": request}


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
    summary = subscription_status_summary(org)
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
    shipping_address: str = ""
    opening_balance: float = 0
    credit_limit: float = 0


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


class PurchaseIn(BaseModel):
    party_id: str
    bill_no: str
    purchase_date: str
    items: List[LineItem]
    notes: str = ""
    type: str = "purchase"
    branch_id: str = ""
    eway_bill_no: str = ""
    vehicle_no: str = ""
    bank_account_id: Optional[str] = None
    purchase_category: str = "stock"  # "stock" | "service"


class PaymentIn(BaseModel):
    party_id: str
    direction: str
    amount: float
    mode: str = "Cash"
    date: str
    reference: str = ""
    bank_account_id: str = ""
    invoice_id: str = ""


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
            out.append({**org, "role": m["role"], "subscription": subscription_status_summary(org)})
    return out


@api.post("/orgs")
async def create_org(body: OrgCreateIn, user=Depends(get_current_user)):
    org = await _create_org_internal(body.name, user["id"], body.state, body.state_code)
    return {**org, "role": "owner", "subscription": subscription_status_summary(org)}


@api.get("/orgs/current")
async def get_current_org(ctx=Depends(get_org_ctx)):
    org = await get_org_doc(ctx["org_id"])
    return {**org, "role": ctx["role"], "allowed_modes": ctx.get("allowed_modes", []),
            "subscription": subscription_status_summary(org)}


@api.put("/orgs/current")
async def update_current_org(body: OrgUpdateIn, request: Request, ctx=Depends(require_permission("settings.edit"))):
    data = body.model_dump()
    data["updated_at"] = now_iso()
    await db.organizations.update_one({"id": ctx["org_id"]}, {"$set": data})
    await audit_log(db, org_id=ctx["org_id"], user=ctx["user"], action="settings.updated",
                    entity_type="organization", entity_id=ctx["org_id"], request=request)
    return await db.organizations.find_one({"id": ctx["org_id"]}, {"_id": 0})


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


@api.get("/billing/status")
async def billing_status(ctx=Depends(get_org_ctx)):
    org = await get_org_doc(ctx["org_id"])
    summary = subscription_status_summary(org)
    summary["limits"] = get_plan_limits(org.get("plan_code") or "FREE")
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
        "allowed_modes": [m for m in body.allowed_modes if m in ("b2b", "b2c", "restaurant", "pos")],
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
    if role.get("is_system"):
        raise HTTPException(400, "System roles cannot be edited")
    new_perms = [p for p in body.permissions if p in PERMISSIONS or p == "*" or p.endswith(".*")]
    new_modes = [m for m in body.allowed_modes if m in ("b2b", "b2c", "restaurant", "pos")]
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


@api.get("/parties")
async def list_parties(type: Optional[str] = None, search: Optional[str] = None, ctx=Depends(get_org_ctx)):
    q = org_filter(ctx)
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
    doc = {**body.model_dump(), "id": str(uuid.uuid4()),
           "org_id": ctx["org_id"], "created_at": now_iso()}
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
    await db.parties.update_one(org_filter(ctx, {"id": pid}), {"$set": body.model_dump()})
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
@api.get("/products")
async def list_products(search: Optional[str] = None, mode: Optional[str] = None, ctx=Depends(get_org_ctx)):
    q = org_filter(ctx)
    if search: q["name"] = {"$regex": search, "$options": "i"}
    if mode:
        # Return products that include this mode OR have no modes field (legacy)
        q["$or"] = [{"modes": mode}, {"modes": {"$exists": False}}, {"modes": []}]
    return await db.products.find(q, {"_id": 0}).sort("name", 1).to_list(1000)


@api.post("/products")
async def create_product(body: ProductIn, ctx=Depends(get_org_ctx)):
    await ensure_active_subscription(ctx)
    doc = {**body.model_dump(), "id": str(uuid.uuid4()),
           "org_id": ctx["org_id"], "created_at": now_iso()}
    await db.products.insert_one(doc)
    return strip_id(doc)


@api.put("/products/{pid}")
async def update_product(pid: str, body: ProductIn, ctx=Depends(get_org_ctx)):
    await ensure_active_subscription(ctx)
    await db.products.update_one(org_filter(ctx, {"id": pid}), {"$set": body.model_dump()})
    return await db.products.find_one(org_filter(ctx, {"id": pid}), {"_id": 0})


@api.delete("/products/{pid}")
async def delete_product(pid: str, ctx=Depends(require_permission("product.delete"))):
    await db.products.delete_one(org_filter(ctx, {"id": pid}))
    return {"ok": True}


# ---------------- INVOICES ----------------
@api.get("/invoices")
async def list_invoices(status: Optional[str] = None, type: Optional[str] = None,
                        party_id: Optional[str] = None, ctx=Depends(get_org_ctx)):
    q = org_filter(ctx)
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
    party = await db.parties.find_one(org_filter(ctx, {"id": body.party_id}), {"_id": 0})
    if not party: raise HTTPException(400, "Party not found")
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
        "invoice_no": await next_invoice_number(ctx["org_id"], prefix),
        "party_id": body.party_id, "party_snapshot": party,
        "invoice_date": body.invoice_date, "due_date": body.due_date,
        "items": totals["items"],
        "totals": {k: v for k, v in totals.items() if k != "items"},
        "notes": body.notes, "status": body.status, "type": body.type,
        "is_recurring": body.is_recurring, "same_state": same_state,
        "branch_id": body.branch_id, "branch_snapshot": branch,
        "invoice_category": getattr(body, "invoice_category", "stock"),
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
        for it in body.items:
            if it.product_id:
                await db.products.update_one(org_filter(ctx, {"id": it.product_id}), {"$inc": {"stock": -it.qty}})
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
    pdf_bytes = generate_invoice_pdf(inv, biz)
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


@api.get("/purchases")
async def list_purchases(ctx=Depends(get_org_ctx)):
    items = await db.purchases.find(org_filter(ctx), {"_id": 0}).sort("purchase_date", -1).to_list(500)
    if not items: return items
    party_ids = list({i["party_id"] for i in items})
    pmap = {p["id"]: p["name"] async for p in db.parties.find(
        {"id": {"$in": party_ids}, "org_id": ctx["org_id"]}, {"_id": 0, "id": 1, "name": 1})}
    for i in items:
        i["party_name"] = pmap.get(i["party_id"], "—")
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
    doc = {
        "id": str(uuid.uuid4()), "org_id": ctx["org_id"],
        "party_id": body.party_id, "party_snapshot": party,
        "bill_no": body.bill_no, "purchase_date": body.purchase_date,
        "items": totals["items"],
        "totals": {k: v for k, v in totals.items() if k != "items"},
        "notes": body.notes, "type": body.type, "same_state": same_state,
        "branch_id": body.branch_id, "branch_snapshot": branch,
        "eway_bill_no": body.eway_bill_no or "",
        "vehicle_no": body.vehicle_no or "",
        "purchase_category": body.purchase_category or "stock",
        "created_at": now_iso(),
    }
    await db.purchases.insert_one(doc)
    # Only add stock for stock purchases (not service purchases)
    if body.type == "purchase" and body.purchase_category == "stock":
        for it in body.items:
            if it.product_id:
                await db.products.update_one(org_filter(ctx, {"id": it.product_id}), {"$inc": {"stock": it.qty}})
    return strip_id(doc)


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
    pdf_bytes = generate_invoice_pdf(adapted, biz, kind="purchase")
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
        i["party_name"] = pmap.get(i["party_id"], "—")
    return items


@api.post("/payments")
async def create_payment(body: PaymentIn, ctx=Depends(get_org_ctx)):
    await ensure_active_subscription(ctx)
    doc = {**body.model_dump(), "id": str(uuid.uuid4()),
           "org_id": ctx["org_id"], "created_at": now_iso()}
    await db.payments.insert_one(doc)
    return strip_id(doc)


@api.delete("/payments/{pid}")
async def delete_payment(pid: str, ctx=Depends(require_permission("payment.delete"))):
    await db.payments.delete_one(org_filter(ctx, {"id": pid}))
    return {"ok": True}


# ---------------- EXPENSES ----------------
@api.get("/expenses")
async def list_expenses(ctx=Depends(get_org_ctx)):
    return await db.expenses.find(org_filter(ctx), {"_id": 0}).sort("date", -1).to_list(1000)


@api.post("/expenses")
async def create_expense(body: ExpenseIn, ctx=Depends(get_org_ctx)):
    await ensure_active_subscription(ctx)
    doc = {**body.model_dump(), "id": str(uuid.uuid4()),
           "org_id": ctx["org_id"], "created_at": now_iso()}
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

@api.post("/bank-statement/upload")
async def upload_bank_statement(body: BankStatementUpload, ctx=Depends(get_org_ctx)):
    """Accept parsed bank statement rows and auto-match against invoices/purchases."""
    results = []
    for row in body.rows:
        entry = {
            "id": str(uuid.uuid4()),
            "org_id": ctx["org_id"],
            "bank_account_id": body.bank_account_id,
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
        # Auto-match: credit → customer invoices, debit → vendor purchases
        amount = row.credit if row.credit > 0 else row.debit
        match_direction = "sales" if row.credit > 0 else "purchases"
        if match_direction == "sales":
            invoice = await db.invoices.find_one(
                org_filter(ctx, {"total": {"$gte": amount * 0.99, "$lte": amount * 1.01}, "status": {"$ne": "paid"}}),
                {"_id": 0}
            )
            if invoice:
                entry["matched"] = True
                entry["match_type"] = "invoice"
                entry["match_id"] = invoice["id"]
                entry["match_ref"] = invoice.get("invoice_number", invoice["id"])
        else:
            purchase = await db.purchases.find_one(
                org_filter(ctx, {"total": {"$gte": amount * 0.99, "$lte": amount * 1.01}, "status": {"$ne": "paid"}}),
                {"_id": 0}
            )
            if purchase:
                entry["matched"] = True
                entry["match_type"] = "purchase"
                entry["match_id"] = purchase["id"]
                entry["match_ref"] = purchase.get("bill_number", purchase["id"])
        await db.bank_statement_rows.insert_one(entry)
        results.append({k: v for k, v in entry.items() if k != "_id"})
    matched = sum(1 for r in results if r["matched"])
    return {"uploaded": len(results), "matched": matched, "rows": results}

@api.get("/bank-statement")
async def get_bank_statement(bank_account_id: str = Query(None), ctx=Depends(get_org_ctx)):
    q = org_filter(ctx)
    if bank_account_id:
        q["bank_account_id"] = bank_account_id
    rows = await db.bank_statement_rows.find(q, {"_id": 0}).sort("date", -1).to_list(1000)
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
                                         "purchase_date": {"$regex": f"^{month}"}}, {"_id": 0, "totals": 1}):
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
    async for i in db.purchases.find(q_pur, {"_id": 0, "totals": 1}):
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
        o["subscription"] = subscription_status_summary(o)
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


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
