"""TDS under Section 194Q — tax deducted when buying goods.

The rule, plainly:

* It applies to a **buyer** whose turnover in the preceding financial year was
  above ₹10 crore.
* For each seller, the first **₹50 lakh** of purchases in a financial year is
  free of TDS. Only the amount *above* that is taxed, at **0.1%**.
* The ₹50 lakh is per seller, per financial year, counted cumulatively — so
  once it is used up, later bills from that seller are taxed in full.
* Where GST is shown separately on the bill, TDS is worked out on the value
  **excluding GST** (CBDT Circular 13/2021).
* If the seller has not given a PAN, the rate is 5% instead of 0.1%.

The mistake worth guarding against is charging 0.1% on the whole bill. On a
₹2.2 crore first purchase that is ₹22,000 deducted where the law asks for
₹17,000 — the buyer over-deducts and the seller is short-paid.
"""
from typing import Any, Dict, Optional

THRESHOLD = 5_000_000.0        # ₹50 lakh per seller, per financial year
RATE = 0.1                     # 0.1% once the threshold is crossed
RATE_NO_PAN = 5.0              # 5% where the seller has given no PAN
BUYER_TURNOVER_LIMIT = 100_000_000.0   # ₹10 crore — below this, 194Q does not apply


def fy_start(today) -> str:
    """1 April of the financial year `today` falls in."""
    year = today.year if today.month >= 4 else today.year - 1
    return f"{year:04d}-04-01"


def rate_for(seller: Optional[dict] = None) -> float:
    """0.1%, or 5% when the seller has no PAN on record."""
    pan = ((seller or {}).get("pan") or "").strip()
    gstin = ((seller or {}).get("gstin") or "").strip()
    # A GSTIN carries the PAN in characters 3-12, so either one proves it.
    return RATE if (pan or len(gstin) >= 12) else RATE_NO_PAN


def compute(prior_ytd: float, current_taxable: float, *, rate: float = RATE,
            threshold: float = THRESHOLD) -> Dict[str, Any]:
    """How much TDS this one bill attracts.

    `prior_ytd` is what has already been bought from this seller this financial
    year, excluding the bill being entered. Both figures exclude GST.
    """
    prior_ytd = max(0.0, float(prior_ytd or 0))
    current = max(0.0, float(current_taxable or 0))
    cumulative = prior_ytd + current

    if cumulative <= threshold:
        return {
            "applicable": False,
            "prior_ytd": round(prior_ytd, 2),
            "current": round(current, 2),
            "cumulative": round(cumulative, 2),
            "exempt_used": round(min(cumulative, threshold), 2),
            "exempt_left": round(max(0.0, threshold - cumulative), 2),
            "taxable_for_tds": 0.0,
            "rate": rate,
            "tds": 0.0,
            "reason": f"₹{cumulative:,.0f} so far this year is within the "
                      f"₹{threshold:,.0f} free of TDS",
        }

    # Only the slice above the threshold, and only the part of it in this bill.
    taxable_for_tds = min(current, cumulative - threshold)
    tds = round(taxable_for_tds * rate / 100, 2)
    exempt_in_bill = round(current - taxable_for_tds, 2)
    return {
        "applicable": True,
        "prior_ytd": round(prior_ytd, 2),
        "current": round(current, 2),
        "cumulative": round(cumulative, 2),
        "exempt_used": round(threshold, 2),
        "exempt_left": 0.0,
        "exempt_in_this_bill": exempt_in_bill,
        "taxable_for_tds": round(taxable_for_tds, 2),
        "rate": rate,
        "tds": tds,
        "reason": (f"The first ₹{threshold:,.0f} from this seller is free of TDS. "
                   + (f"₹{exempt_in_bill:,.0f} of this bill falls inside it, so "
                      f"TDS is on ₹{taxable_for_tds:,.0f}."
                      if exempt_in_bill > 0 else
                      f"That was used up earlier this year, so TDS is on the "
                      f"whole ₹{taxable_for_tds:,.0f}.")),
    }


def bill_taxable(purchase: Dict[str, Any]) -> float:
    """A bill's value excluding GST — what 194Q is worked out on.

    Falls back to the grand total for older rows that never stored a split.
    """
    totals = purchase.get("totals") or {}
    taxable = totals.get("taxable_amount")
    if taxable is None:
        return float(totals.get("grand_total") or 0)
    return float(taxable or 0)
