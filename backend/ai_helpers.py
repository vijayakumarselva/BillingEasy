"""LLM helpers powered by Claude via Anthropic SDK."""
from __future__ import annotations
import json
import os
import re
from typing import Any, AsyncGenerator, Dict, List, Optional

import anthropic

MODEL_NAME = "claude-sonnet-4-6"


def _client() -> anthropic.AsyncAnthropic:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    return anthropic.AsyncAnthropic(api_key=key)


BOOKKEEPER_SYSTEM = """You are BillEasy — a friendly AI bookkeeper assistant for small Indian business owners (Tier-2/3 cities).
Audience: shop owners, traders, freelancers who often don't speak English fluently or know accounting jargon.

How you respond:
- Be concise (2-6 short sentences usually). Plain English by default, but if the user writes in Hindi/Hinglish, reply in the same style.
- Use real numbers from the BUSINESS CONTEXT block below. Never invent numbers.
- If the answer requires data not in the context, say so clearly and tell the user where to find it in BillEasy.
- For GST / TDS / accounting concepts, explain in 1-2 lines as if to a non-accountant.
- Format money as ₹X,XXX (Indian comma style). Format dates as DD MMM YYYY.
- If the user asks something illegal (tax evasion, fake invoices, ITC fraud) — politely refuse and suggest the lawful alternative.
- Never reveal you are Claude or that you use AI internally — just say "I'm your BillEasy assistant".
"""


async def ai_chat_stream(*, session_id: str, user_text: str,
                          business_context: Dict[str, Any]) -> AsyncGenerator[str, None]:
    """Async generator that yields text deltas for SSE/streaming responses."""
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        yield "[AI features require ANTHROPIC_API_KEY to be configured]"
        return

    context_block = json.dumps(business_context, default=str, ensure_ascii=False)[:6000]
    sys = BOOKKEEPER_SYSTEM + "\n\nBUSINESS CONTEXT (live snapshot, JSON):\n" + context_block

    client = anthropic.AsyncAnthropic(api_key=key)
    async with client.messages.stream(
        model=MODEL_NAME,
        max_tokens=1024,
        system=sys,
        messages=[{"role": "user", "content": user_text}],
    ) as stream:
        async for text in stream.text_stream:
            yield text


HSN_SYSTEM = """You are an expert in Indian GST HSN/SAC codes (CBIC). Given a free-text
product or service description, return the most likely HSN (for goods, 4-8 digits)
or SAC (for services, starts with 99, 6 digits).

ALWAYS respond with a JSON object of this exact shape and nothing else:
{
  "code": "string (e.g. '8471' or '998314')",
  "description": "official-style description of that HSN/SAC",
  "gst_rate": number (one of 0, 5, 12, 18, 28),
  "category": "high-level grouping (e.g. 'Computers', 'IT Service')",
  "is_service": boolean (true if SAC, false if HSN),
  "confidence": number (0.0-1.0),
  "reasoning": "1-sentence justification for the chosen code"
}
If the description is too vague, still return your best guess but set confidence < 0.5.
"""


async def ai_hsn_suggest(description: str) -> Dict[str, Any]:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        return {"error": "ANTHROPIC_API_KEY not configured"}

    client = anthropic.AsyncAnthropic(api_key=key)
    msg = await client.messages.create(
        model=MODEL_NAME,
        max_tokens=512,
        system=HSN_SYSTEM,
        messages=[{"role": "user", "content": f"Description: {description}\n\nReturn ONLY the JSON object."}],
    )
    return _parse_json(msg.content[0].text)


CATEGORIZE_SYSTEM = """You are an expert Indian accountant. Given a free-text expense
description (vendor name, what was purchased, possibly an amount), classify it.

ALWAYS respond with a JSON object of this exact shape and nothing else:
{
  "category": "one of: Rent, Salaries & Wages, Professional Fees, Utilities, Office Supplies, Travel & Conveyance, Repairs & Maintenance, Bank Charges, Advertising, Subscriptions, Internet & Telephone, Insurance, Printing & Stationery, Freight & Transportation, Postage & Courier, Miscellaneous Expense, Capital Asset (Equipment), Capital Asset (Furniture), Cost of Goods Sold, Other Direct Expense",
  "tds_section": "one of: '194C', '194J', '194I', '194H', '194Q', 'None'",
  "tds_rate": number (e.g. 1, 2, 5, 10, 0),
  "is_input_gst_claimable": boolean,
  "suggested_ledger": "specific ledger name suggestion",
  "confidence": number (0.0-1.0),
  "reasoning": "1-sentence justification"
}
"""


async def ai_categorize_expense(description: str, amount: Optional[float] = None) -> Dict[str, Any]:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        return {"error": "ANTHROPIC_API_KEY not configured"}

    client = anthropic.AsyncAnthropic(api_key=key)
    text = f"Expense description: {description}"
    if amount:
        text += f"\nAmount: ₹{amount}"
    text += "\n\nReturn ONLY the JSON object."
    msg = await client.messages.create(
        model=MODEL_NAME,
        max_tokens=512,
        system=CATEGORIZE_SYSTEM,
        messages=[{"role": "user", "content": text}],
    )
    return _parse_json(msg.content[0].text)


PRODUCT_SUGGEST_SYSTEM = """You are an expert Indian product cataloguer and GST consultant.
Given either a product image, a product name, or both, return structured product details.

ALWAYS respond with a JSON object of this exact shape and nothing else:
{
  "name": "clean product name (e.g. 'Basmati Rice 1kg')",
  "category": "product category (e.g. 'Groceries', 'Electronics', 'Clothing', 'Stationery')",
  "hsn": "4-8 digit HSN code (e.g. '1006')",
  "gst_rate": number (one of 0, 5, 12, 18, 28),
  "unit": "standard unit (e.g. 'KGS', 'NOS', 'PCS', 'LTR', 'MTR', 'BOX')",
  "brand": "brand name if visible or known, else empty string",
  "confidence": number (0.0-1.0)
}
If unsure about a field, set it to a reasonable default. Always return valid JSON.
"""


async def ai_product_suggest(*, name: str = "", image_b64: str = "") -> Dict[str, Any]:
    """Suggest product fields from image and/or name using Claude vision."""
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        return {"error": "ANTHROPIC_API_KEY not configured"}

    client = anthropic.AsyncAnthropic(api_key=key)
    content: list = []

    if image_b64:
        # Strip data-URI prefix if present
        if "," in image_b64:
            media_type_part, data = image_b64.split(",", 1)
            media_type = media_type_part.split(":")[1].split(";")[0] if ":" in media_type_part else "image/jpeg"
        else:
            data = image_b64
            media_type = "image/jpeg"

        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": data},
        })

    user_text = f"Product: {name}" if name else "Identify this product from the image."
    user_text += "\n\nReturn ONLY the JSON object."
    content.append({"type": "text", "text": user_text})

    msg = await client.messages.create(
        model=MODEL_NAME,
        max_tokens=512,
        system=PRODUCT_SUGGEST_SYSTEM,
        messages=[{"role": "user", "content": content}],
    )
    return _parse_json(msg.content[0].text)


INVOICE_EXTRACT_SYSTEM = """You are a billing assistant for an Indian business. The user wants to create an invoice by describing it in plain text or Hindi/Hinglish.

Extract the invoice details and return ONLY a JSON object with this exact structure:
{
  "type": "sale" or "purchase",
  "party_name": "customer or vendor name (string)",
  "party_phone": "phone number if mentioned, else ''",
  "invoice_date": "YYYY-MM-DD (use today if not specified)",
  "items": [
    {
      "name": "product/service name",
      "qty": number,
      "unit": "NOS/KGS/LTR/PCS/BOX etc",
      "rate": number (price per unit, excluding GST),
      "gst_rate": number (0/5/12/18/28 — guess from item type if not mentioned),
      "hsn": "HSN code if known, else ''"
    }
  ],
  "notes": "any extra notes",
  "payment_method": "cash/upi/credit (default: credit)",
  "confidence": 0.0-1.0
}

Rules:
- If qty or rate missing from any item, set to 0.
- Infer GST rate from product category (food/agriculture=5, services=18, etc.)
- If type not clear, default to "sale".
- Return ONLY the JSON, no explanation.
"""


async def ai_extract_invoice(user_text: str, today: str) -> Dict[str, Any]:
    """Extract structured invoice data from a natural language description."""
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        return {"error": "ANTHROPIC_API_KEY not configured"}

    client = anthropic.AsyncAnthropic(api_key=key)
    msg = await client.messages.create(
        model=MODEL_NAME,
        max_tokens=1024,
        system=INVOICE_EXTRACT_SYSTEM,
        messages=[{"role": "user", "content": f"Today's date: {today}\n\n{user_text}\n\nReturn ONLY the JSON."}],
    )
    return _parse_json(msg.content[0].text)


_JSON_BLOCK = re.compile(r"\{.*\}", re.S)


def _parse_json(raw: str) -> Dict[str, Any]:
    raw = (raw or "").strip()
    if not raw:
        return {"error": "empty_response"}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    m = _JSON_BLOCK.search(raw)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            return {"error": "invalid_json", "raw": raw[:500]}
    return {"error": "no_json_found", "raw": raw[:500]}


BANK_ANALYSIS_SYSTEM = """You are an expert Indian business financial analyst.
You will receive a list of bank transaction vendor names (extracted from bank descriptions) and their total amounts.
Your job is to:
1. Assign each vendor to a business expense/income CATEGORY
2. Identify the vendor's likely real name (clean it up from bank codes)
3. Return structured JSON only

Categories to use (pick the best fit):
Sales Income, Customer Receipts, Vendor Payments, Rent & Utilities, Salaries & Payroll,
Bank Charges & Fees, Tax & GST Payments, Loan & EMI, Travel & Transport, Raw Materials,
Office Supplies, Software & Subscriptions, Marketing & Advertising, Insurance,
Logistics & Delivery, Food & Hospitality, Miscellaneous Debit, Miscellaneous Credit

ALWAYS respond with a JSON array of this exact shape and nothing else:
[
  {
    "raw_vendor": "original vendor string passed in",
    "clean_name": "human-readable vendor name",
    "category": "one of the categories above",
    "sub_type": "income | expense | transfer"
  }
]
"""

async def ai_analyze_bank_vendors(vendors: List[Dict]) -> List[Dict]:
    """Categorize a list of {raw_vendor, total_debit, total_credit} using Claude."""
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        return [{"raw_vendor": v["raw_vendor"], "clean_name": v["raw_vendor"],
                 "category": "Uncategorized", "sub_type": "expense"} for v in vendors]
    client = anthropic.AsyncAnthropic(api_key=key)
    # Send at most 80 vendors at once to stay within token limits
    vendor_list = "\n".join(
        f"- {v['raw_vendor']} (debit ₹{v['total_debit']:.0f}, credit ₹{v['total_credit']:.0f})"
        for v in vendors[:80]
    )
    msg = await client.messages.create(
        model=MODEL_NAME,
        max_tokens=4096,
        system=BANK_ANALYSIS_SYSTEM,
        messages=[{"role": "user", "content": f"Categorise these vendors:\n{vendor_list}\n\nReturn only JSON array."}],
    )
    raw = msg.content[0].text.strip()
    # Extract JSON array
    arr_match = re.search(r"\[.*\]", raw, re.S)
    if arr_match:
        try:
            return json.loads(arr_match.group(0))
        except Exception:
            pass
    return [{"raw_vendor": v["raw_vendor"], "clean_name": v["raw_vendor"],
             "category": "Uncategorized", "sub_type": "expense"} for v in vendors]


async def ai_bank_insights(summary: Dict) -> str:
    """Generate 5-6 plain-English insights from a bank statement summary dict."""
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        return ""
    client = anthropic.AsyncAnthropic(api_key=key)
    system = """You are a sharp Indian business financial advisor. 
Given a bank statement summary JSON for a small/medium Indian business, write 5-6 bullet-point insights.
Be specific with numbers. Use ₹ symbol. Focus on: top spends, income patterns, anomalies, cash flow health, actionable suggestions.
Write in plain English. Each bullet starts with an emoji. Do NOT use markdown headers. Output plain text only."""
    msg = await client.messages.create(
        model=MODEL_NAME, max_tokens=800, system=system,
        messages=[{"role": "user", "content": json.dumps(summary, default=str)[:4000]}],
    )
    return msg.content[0].text.strip()


PAYMENT_PARSE_SYSTEM = """You are a payment-entry assistant for an Indian small business accounting app.
The user will describe a payment in natural language (English, Hinglish, or mixed). 
Extract structured payment details and return ONLY valid JSON with these fields:
{
  "direction": "received" | "paid",        // money in (from customer) or money out (to supplier)
  "party_name": string,                     // customer or supplier name
  "amount": number,                         // in INR, no commas or symbols
  "date": "YYYY-MM-DD",                    // today if not specified (use context date provided)
  "mode": string,                           // one of: Cash, Bank Transfer, UPI, NEFT, RTGS, IMPS, Cheque, Card, NACH
  "reference": string,                      // UTR, UPI ref, cheque number, or "" if none
  "notes": string                           // any extra context, or ""
}

Rules:
- If amount has ₹, lakh/lac (×100000), k (×1000) — convert to plain number.
- If "received", "from customer", "income", "sale payment" → direction=received
- If "paid", "sent", "to supplier", "purchase payment", "vendor" → direction=paid  
- Infer mode from keywords: "UPI", "gpay", "phonepe", "paytm" → UPI; "neft/rtgs/imps" → use as-is; "cash" → Cash; "cheque/check" → Cheque; "card/swipe" → Card; default → Bank Transfer
- Return ONLY the JSON object, no explanation."""


async def ai_parse_payment(text: str, today: str = "") -> Dict:
    """Parse a natural-language payment description into structured fields."""
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        return {}
    client = anthropic.AsyncAnthropic(api_key=key)
    user_msg = f"Today's date: {today or 'unknown'}\n\nPayment description: {text}"
    msg = await client.messages.create(
        model=MODEL_NAME, max_tokens=400, system=PAYMENT_PARSE_SYSTEM,
        messages=[{"role": "user", "content": user_msg}],
    )
    raw = msg.content[0].text.strip()
    obj_match = re.search(r"\{.*\}", raw, re.S)
    if obj_match:
        try:
            return json.loads(obj_match.group(0))
        except Exception:
            pass
    return {}

PARTY_PARSE_SYSTEM = """You are a business contact data extractor for an Indian GST billing app.
Extract supplier/customer details from text or OCR. Return ONLY a JSON object (no explanation):
{
  "name": "Company or person name",
  "phone": "phone number digits only",
  "email": "email address",
  "gstin": "15-char GSTIN if present",
  "pan": "10-char PAN if present",
  "billing_address": "full address string",
  "state": "Indian state name",
  "state_code": "2-digit state code e.g. 33 for Tamil Nadu"
}
Omit fields you cannot find. State code must match the GSTIN first 2 digits if GSTIN is present.
State codes: 01=JK, 02=HP, 03=PB, 04=CH, 05=UT, 06=HR, 07=DL, 08=RJ, 09=UP, 10=BR, 11=SK, 12=AR, 13=NL, 14=MN, 15=MZ, 16=TR, 17=ML, 18=AS, 19=WB, 20=JH, 21=OR, 22=CG, 23=MP, 24=GJ, 25=DD, 26=DNH, 27=MH, 28=AP, 29=KA, 30=GA, 31=LD, 32=KL, 33=TN, 34=PY, 35=AN, 36=TG, 37=AP"""

async def ai_parse_party(text: str = "", file_b64: str = "", media_type: str = "") -> Dict:
    """Extract party (supplier/customer) fields from pasted text and/or an
    image (visiting card, letterhead, GST certificate) or PDF, via Claude vision."""
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key or not (text.strip() or file_b64):
        return {}
    content: List[Dict[str, Any]] = []
    if file_b64:
        if file_b64.startswith("data:"):
            head, file_b64 = file_b64.split(",", 1)
            media_type = media_type or head[5:].split(";")[0]
        media_type = (media_type or "image/jpeg").lower()
        if media_type == "application/pdf":
            content.append({"type": "document",
                            "source": {"type": "base64", "media_type": "application/pdf", "data": file_b64}})
        else:
            if media_type not in ("image/jpeg", "image/png", "image/gif", "image/webp"):
                media_type = "image/jpeg"
            content.append({"type": "image",
                            "source": {"type": "base64", "media_type": media_type, "data": file_b64}})
    content.append({"type": "text", "text": text.strip() or
                    "Extract the business contact details visible in this visiting card / document."})
    client = anthropic.AsyncAnthropic(api_key=key)
    msg = await client.messages.create(
        model=MODEL_NAME, max_tokens=600, system=PARTY_PARSE_SYSTEM,
        messages=[{"role": "user", "content": content}],
    )
    raw = msg.content[0].text.strip()
    obj_match = re.search(r"\{.*\}", raw, re.S)
    if obj_match:
        try:
            return json.loads(obj_match.group(0))
        except Exception:
            pass
    return {}
