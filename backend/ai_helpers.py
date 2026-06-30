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
