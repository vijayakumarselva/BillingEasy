"""GSTIN (Goods & Services Tax Identification Number) validator.

Format (15 chars): 22AAAAA0000A1Z5
  Pos  1-2  → State code (numeric, 01-37 + 96-99)
  Pos  3-7  → First 5 letters of PAN (uppercase A-Z)
  Pos  8-11 → Next 4 digits of PAN
  Pos 12    → Last letter of PAN (A-Z)
  Pos 13    → Entity / registration number (1-9 then A-Z)
  Pos 14    → Default 'Z'
  Pos 15    → Mod-36 checksum
"""
from __future__ import annotations
from typing import Dict, Any

# Official Indian state code mapping (TIN). Source: CBIC, 2024.
STATE_CODES: Dict[str, str] = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
    "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
    "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
    "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
    "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
    "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "25": "Daman & Diu (legacy)", "26": "Dadra & Nagar Haveli and Daman & Diu",
    "27": "Maharashtra", "28": "Andhra Pradesh (legacy)", "29": "Karnataka",
    "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
    "34": "Puducherry", "35": "Andaman & Nicobar Islands", "36": "Telangana",
    "37": "Andhra Pradesh", "38": "Ladakh",
    "96": "Other Territory", "97": "Other Territory", "99": "Centre Jurisdiction",
}

_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
_DIGITS = "0123456789"
# 36-char alphabet used in the GSTIN checksum (digits 0-9 then A-Z)
_BASE36 = _DIGITS + _ALPHA


def _checksum_char(first14: str) -> str:
    """Replicate the official GSTIN checksum (mod-36) used by CBIC.

    Each of the 14 chars is mapped to its index in `_BASE36`, multiplied
    alternately by 1 and 2 (left-to-right). For products >= 36 we sum the
    digits of the product (when expressed in base 36 — same as floor + remainder).
    Final = (36 - (total % 36)) % 36 → mapped back to BASE36.
    """
    total = 0
    for i, ch in enumerate(first14):
        if ch not in _BASE36:
            return ""
        val = _BASE36.index(ch)
        factor = 2 if (i % 2) == 1 else 1
        prod = val * factor
        total += (prod // 36) + (prod % 36)
    remainder = total % 36
    return _BASE36[(36 - remainder) % 36]


def validate(gstin: str) -> Dict[str, Any]:
    """Returns a structured validation result.

    Note: this is offline structural validation only — it does NOT confirm
    that the GSTIN is registered/active with the GST portal. For that you'd
    need to hit the GST GSP (paid API). 99% of typo/format errors are caught
    here, which is what most SMBs actually need.
    """
    if not gstin:
        return {"valid": False, "reason": "GSTIN is empty"}
    g = gstin.strip().upper()
    if len(g) != 15:
        return {"valid": False, "input": g, "reason": f"GSTIN must be 15 characters (got {len(g)})"}

    state_code, pan5, pan4, panL, entity, default_z, check = g[:2], g[2:7], g[7:11], g[11], g[12], g[13], g[14]

    if not state_code.isdigit() or state_code not in STATE_CODES:
        return {"valid": False, "input": g, "reason": f"Invalid state code '{state_code}' (positions 1-2)"}
    if not all(c in _ALPHA for c in pan5):
        return {"valid": False, "input": g, "reason": "PAN portion (positions 3-7) must be 5 uppercase letters"}
    if not all(c in _DIGITS for c in pan4):
        return {"valid": False, "input": g, "reason": "PAN portion (positions 8-11) must be 4 digits"}
    if panL not in _ALPHA:
        return {"valid": False, "input": g, "reason": "PAN portion (position 12) must be an uppercase letter"}
    if entity not in _BASE36:
        return {"valid": False, "input": g, "reason": "Entity character (position 13) is invalid"}
    if default_z != "Z":
        return {"valid": False, "input": g, "reason": "Position 14 must be 'Z' (reserved)"}
    if check not in _BASE36:
        return {"valid": False, "input": g, "reason": "Checksum character (position 15) is invalid"}

    expected_check = _checksum_char(g[:14])
    if expected_check != check:
        return {
            "valid": False, "input": g,
            "reason": "Checksum mismatch — this GSTIN format is structurally valid but the check digit is wrong (likely a typo).",
            "expected_checksum": expected_check, "got_checksum": check,
        }

    pan = pan5 + pan4 + panL
    return {
        "valid": True,
        "input": g,
        "state_code": state_code,
        "state": STATE_CODES[state_code],
        "pan": pan,
        "entity_code": entity,
        "checksum": check,
        "note": "Structurally valid GSTIN. This check does not confirm active registration on the GST portal.",
    }
