# BillEasy — Product Requirements (Living Document)

## Original Problem Statement
Full-stack Indian GST billing/accounting SaaS with multi-tenant orgs, granular RBAC, audit, billing, and Tier-2-friendly UX.

## Tech Stack
FastAPI + MongoDB + ReportLab · React + Tailwind + Shadcn/UI + Recharts · JWT (access + refresh) · Cashfree (mock-mode)

## What's been implemented

### Iteration 1 (MVP) — all 10 modules
Auth, Business, Parties (+ ledger), Products, Sales (PDF + WhatsApp), Purchases, Payments, Expenses, GSTR-1/3B + HSN, P&L/Trial Balance/Day Book/Stock, TDS, Settings.

### Iteration 2 — Multi-org + Billing
`organizations` + `memberships`; X-Org-Id scoping on every endpoint; org switcher dropdown; "Create new org" flow with 7-day trial; `/billing` page (Monthly ₹199 / Yearly ₹1,990); Cashfree mock checkout; HMAC webhook ready.

### Iteration 3 — Performance + UX
N+1 → aggregation pipelines (dashboard, parties, invoices, trial-balance); bulk party balance helper; PDF font fix (FreeSans, ₹ glyph) + DD/MM/YYYY + invoice-number filename; QuickStartGuide; plain-language labels; brand logo.

### Iteration 4 — RBAC + Audit + Auth Hardening (this session)
- **Granular RBAC**: 34-permission catalogue across 13 modules; system roles (Owner/Accountant/Sales) seeded per org; custom roles via `POST /api/roles`; permission check via `require_permission(perm)` dep replacing `require_roles`.
- **Audit log**: `audit_logs` collection captures login, role/CRUD events with user, IP, user-agent, timestamp; viewer at Settings → Audit Log.
- **Auth hardening**: access tokens reduced to 30 min; refresh tokens (30-day TTL); axios auto-refresh on 401; `/forgot-password` (rate-limited, returns dev_token until SMTP set); `/reset-password`; `/change-password` (Settings → Security); login rate limit 8 req / 15 min / IP; `last_login` tracked.
- **Brand**: custom SVG `Logo` component (rounded blue card + stylised ₹/B + cyan tick) used in sidebar, login hero, register, mobile header, favicon; `Bill**Easy**` Outfit wordmark.

## Deferred / Backlog
- **A** Super Admin platform console (`/super`): list/suspend all orgs, impersonate, system metrics.
- **C** Email-based invitation links (needs Resend/SMTP).
- **E** Plans with hard limits (Free/Starter/Pro/Enterprise) — currently 1 paid tier; storage/user/invoice caps.
- Plus pre-existing: Excel import/export, Hindi/Tamil labels, customer portal link, multi-branch, WhatsApp overdue reminders, balance sheet & cash flow.

## Test Credentials
See `/app/memory/test_credentials.md`.

## Cashfree Status
DB-backed configuration via Super Admin → Payment Gateway tab. Stored in `system_settings` (id=`payment_gateway`) with secret Fernet-encrypted (key derived from `JWT_SECRET`). Environments: MOCK (default), SANDBOX, PROD. Endpoints: `GET/POST /api/super/settings/payment` and `POST /api/super/settings/payment/test`. `.env` keys (`CASHFREE_CLIENT_ID/SECRET/ENV`) remain as a backward-compat fallback.

### Iteration 7 — AI Bookkeeper + Indian GST/GOV Compliance Toolkit (this session)
- **AI integration** (`/app/backend/ai_helpers.py`): Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) via Emergent universal key. Streaming chat + JSON-extraction helpers (`ai_chat_stream`, `ai_hsn_suggest`, `ai_categorize_expense`).
- **Ask BillEasy AI** (`/app/frontend/src/pages/AskAi.jsx`): SSE-streaming bookkeeper chat with live business-context snapshot (sales/expenses/top customers/overdue). Multi-session history persisted in `db.ai_chats`. English & हिन्दी friendly. Endpoints: `POST /api/ai/chat`, `GET /api/ai/chat/history`, `GET /api/ai/chat/sessions`.
- **AI HSN/SAC Finder** (`POST /api/ai/hsn-finder`): returns bundled-DB matches + AI suggestion with code, GST rate, confidence, reasoning. Inline `HsnSuggestButton` integrated into the Products form.
- **AI Expense Categorizer** (`POST /api/ai/categorize-expense`): returns category, TDS section, suggested ledger, input-GST claimability, reasoning.
- **Bundled HSN/SAC database** (`/app/backend/hsn_data.py`): curated ~85 commonly-used CBIC codes across goods + services with keyword tags. Fuzzy search supports English/Hindi terms and partial codes. Free, no auth.
- **GSTIN Validator** (`/app/backend/gstin.py`): mod-36 checksum + 38 state-code lookup. Live inline validation in Parties form with auto-state-fill (`GstinField.jsx`).
- **E-Invoice JSON Generator** (`/app/backend/einvoice.py`): Schema 1.1 compliant payload for IRP. `GET /api/invoices/{id}/einvoice` returns pre-check errors OR ready-to-upload JSON. UI: dialog on InvoiceDetail with download button.
- **Public no-auth endpoints**: `/api/public/gstin/validate`, `/api/public/hsn/search`, `/api/public/hsn/{code}`.
- **Public landing**: new "Free GST tools" section + `/free/tools` public page (GSTIN + HSN tabs only).
- **In-app `/tools`**: 4-tab toolkit (GSTIN, HSN, AI HSN Finder, AI Expense Categorizer). Sidebar nav has 'Ask BillEasy AI' (AI badge) + 'GST Tools' (Free badge).
- **Seed data fix**: All 9 seeded GSTINs (org + customers + suppliers) recomputed to pass mod-36 checksum so e-invoice happy-path is reachable on demo data.
- Backend regression suite: `/app/backend/tests/test_iter7_ai_gst.py` (22/22 pass).

### Iteration 6 — Pricing Overhaul + Public Landing + SEO + Launch Offer
- New 4-tier pricing model in `plans.py`: Starter (₹499/mo, ₹4,990/yr) · Growth (₹999/mo, ₹9,999/yr) · Business (₹2,499/mo, ₹24,990/yr) · Enterprise (custom). Yearly = 2 months free.
- Add-ons catalogue (display-only): Extra user ₹99, Branch ₹199, Branding ₹299, WhatsApp ₹499, API ₹999, Storage ₹99.
- `LEGACY_PLAN_CODES` + `is_legacy_plan()` — orgs on old codes get `needs_replan: true` and are prompted to re-pick.
- Configurable Launch Offer (`/app/backend/launch_offer.py` + `/api/super/settings/launch-offer` + Super Admin tab). Window-aware (auto-hides outside start/end). Validates: enabling without plan_codes returns 400.
- New `/api/public/pricing` (no-auth) returns tiers + addons + active offer for the landing page.
- Public marketing page at `/` (`Landing.jsx`): hero with tagline "Professional Billing Software for Indian Businesses — Secure, Simple, Affordable.", 6-card features grid, 4-card pricing (Growth highlighted), addons block, Trust & Security section, FAQ, footer CTA. Logged-in users auto-redirect to `/dashboard`.
- Redesigned in-app `/billing` page (Billing.jsx) reusing the same `Pricing.jsx` components — monthly/yearly toggle, needs_replan banner, owner-only CTA, auto-checkout on `?plan=` query param.
- `Register.jsx` propagates `?plan=` and routes to `/billing?plan=` after signup.
- SEO: full meta tag overhaul in `index.html` (title, description, OG, Twitter, canonical) + Schema.org `SoftwareApplication` JSON-LD with 3 offers and aggregateRating.
- ENTERPRISE_CUSTOM blocked from online checkout; CTA opens mailto:sales@billeasy.in.
- Backend regression suite: `/app/backend/tests/test_pricing_overhaul.py` (11/11 pass).

### Iteration 5 — Super Admin Payment Gateway UI
- Added `system_settings` MongoDB collection + `payment_settings.py` (Fernet encrypt/decrypt/mask helpers).
- Super-admin endpoints: `GET/POST /api/super/settings/payment` (validates client_id+secret when enabling live mode; preserves stored secret when `client_secret=null`) and `POST /api/super/settings/payment/test` (short-circuits in MOCK mode).
- Refactored `/api/billing/subscribe` and `/api/billing/webhook` to read credentials via `get_cashfree_credentials(db)` at request time — no module-level Cashfree constants.
- New "Payment Gateway" tab in `SuperAdmin.jsx`: env select, client id, secret (password input + eye toggle), enable switch, save + test buttons, masked current-status panel, security warning banner.
- New `<SuperOnly>` route guard in `App.js` redirects non-super users from `/super` to `/dashboard` (replaces the crash-on-403 behaviour).
- Audit log entry `super.payment_settings.updated` written on every save.
- Backend regression suite: `/app/backend/tests/test_payment_gateway_settings.py`.

