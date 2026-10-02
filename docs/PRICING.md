# Subscriptions, pricing and AI credits

The subscription belongs to the **login**, not to a business. Every business
that login owns shares one plan, one set of user seats and one AI credit
balance, while keeping its books completely separate.

| File | What lives there |
|---|---|
| `backend/pricing.py` | The catalogue: plans, prices, limits, features, add-ons, credit packs, founding offer. **Money is in paise.** |
| `backend/subscriptions.py` | Runtime state: trial, grace, proration, downgrades, the plan/pack credit buckets |
| `backend/offers.py` | Coupons, founding offer, referrals |
| `backend/payment_provider.py` | `PaymentProvider` interface + Cashfree (add Razorpay here) |
| `backend/billing_invoice.py` | Our own GST tax invoice for each payment |
| `backend/migrate_pricing.py` | One-off, idempotent migration from the old per-organisation plans |
| `frontend/src/pages/Pricing.jsx` | Public page at `/pricing` |
| `frontend/src/pages/Billing.jsx` | In-app Plan & Billing |
| `frontend/src/components/UpgradeModal.jsx` | The prompt shown whenever a limit is hit |

## Changing prices

Two ways, and you rarely need the first:

1. **Permanently, in code** — edit `PLAN_TIERS`, `ADDONS` or `CREDIT_PACKS` in
   `backend/pricing.py` and deploy. Amounts are paise: `249900` is ₹2,499.

2. **Live, with no deploy** — Super Admin → Pricing, or:

   ```bash
   curl -X PUT https://billingeasy-backend-production.up.railway.app/api/super/pricing \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"tiers": {"BUSINESS": {"yearly_paise": 199900, "credits_per_year": 1500}}}'
   ```

   The override is a partial document in `platform_settings/pricing_catalogue`;
   anything you leave out keeps the value from `pricing.py`. It takes effect on
   the next request, for the website and the apps at once.

   Existing subscribers are **not** re-priced mid-period — they renew at the new
   price. Founding members keep `price_lock_paise` for as long as they renew
   without a gap.

## Adding a coupon

Super Admin → Coupons, or:

```bash
curl -X POST .../api/super/coupons -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"DIWALI25","kind":"percent","value":25,"usage_cap":100,
       "per_account_cap":1,"first_purchase_only":true,
       "applies_to":["plan","pack"],"valid_to":"2026-11-15T23:59:59+00:00"}'
```

- `kind` is `percent` (1–100) or `flat` (paise).
- `max_discount_paise` caps a percentage coupon.
- `plan_codes` limits it to specific plans; empty means any.
- Deleting a coupon only deactivates it, so past redemptions stay explainable.

The discount applies to the pre-GST amount; GST is charged on what is left.

## Granting a plan or credits by hand

Super Admin → Subscriptions → Grant, or:

```bash
curl -X POST .../api/super/subscriptions/grant -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id":"<user id>","plan_code":"PRO_YEARLY","months":12,
       "credits":500,"reason":"Migrated enterprise customer, invoice #4412"}'
```

A reason is required and goes into `admin_grants` and the audit log. Granted
credits land in the **pack** bucket, so they never expire.

## How credits work

- One credit = one AI invoice scan. Taken before the call, refunded
  automatically if the scan fails or cannot be read.
- **Plan credits** come with the plan and are replaced at each renewal — they do
  not roll over. **Pack credits** are bought and never expire.
- Spending always draws down plan credits first, then packs.
- Every movement is a row in `credit_ledger` with its source and reason.

## Plan enforcement

Checks run on the server, never only in the UI:

```python
await guard_feature(ctx, "einvoicing")        # 402 FEATURE_NOT_IN_PLAN
await guard_account_limit(ctx, "users")       # 402 PLAN_LIMIT_USERS
await spend_scan_credit(ctx, ref_id=scan_id)  # 402 INSUFFICIENT_CREDITS
```

Each 402 carries `{code, message, suggested_plan, suggested_plan_name,
suggested_plan_paise}`; `lib/api.js` turns it into the `be:plan-limit` event and
`UpgradeModal` shows a prompt naming that exact plan.

## Lifecycle

- **Signup**: 14 days of Business, no card, plus 50 signup credits.
- **Expiry**: 7 days of grace with full access and a banner, then Free.
- **Downgrade**: applies at renewal. Businesses beyond the new cap become
  read-only (`readonly_reason: "plan_limit"`) — data is never deleted, and the
  owner picks which stay active via `POST /subscription/keep-active`.
- **Upgrade**: immediate, charged pro rata for the days left, with credits
  topped up pro rata.
- **Renewals and reminders**: `POST /api/super/billing/run-renewals` applies
  scheduled downgrades, expires lapsed plans and queues reminders at 15, 7 and
  1 day. It is idempotent — run it from cron as often as you like.

## Payments

Cashfree keys live in Super Admin → Payment Gateway (encrypted at rest). With no
keys configured everything runs in mock mode, so the whole flow is testable
without money moving. Activation only happens through a signature-verified
webhook (`/api/billing/webhook/payments`) or a verified return trip
(`/api/billing/verify/{order_id}`); both are idempotent, and `webhook_events`
makes replays a no-op.

Every paid purchase raises a GST tax invoice from our own invoicing engine.
Set our registered details once in `platform_settings/billing_entity`
(`name`, `gstin`, `address`, `state_code`, `invoice_prefix`) — or via the
environment variables `BILLINGSEASY_GSTIN` and `BILLINGSEASY_PAN`.

## Tests

```bash
python tests/test_pricing.py        # catalogue, credits, limits, proration, migration
python tests/test_billing_api.py    # the API end to end, against mongomock
```

## Migrating an existing deployment

```bash
cd backend && python migrate_pricing.py --dry-run   # prints what it would do
cd backend && python migrate_pricing.py
```

Paying customers are moved to **Pro at no charge until their current period
ends**, in-flight trials become the 14-day Business trial counted from their
original signup, and wallet credits they had already paid for carry over as
non-expiring pack credits.
