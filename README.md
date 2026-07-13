# PayPigeon

**Send the invoice. We'll chase it.** Automated invoice reminders + plain-English cash-flow view for trades businesses. Built per [the PRD](../PRD-PaidUp-invoice-reminders.md).

## What works today

The complete core loop, end to end:

- **Auth** — magic link / 6-digit email code (Supabase Auth), 30-second business onboarding
- **Invoices in, 4 ways** — manual add (4 fields, ~20s) · photo/PDF scan with Claude extraction + confirm card · CSV import with preview · email-forward webhook (`/api/inbound`)
- **Reminder engine** — 5-step default sequence (heads-up −3d → final notice +21d), tone dial (Friendly/Professional/Firm), per-step editable templates with merge tags, idempotent scheduler, auto-stop on payment
- **Compliance built in** — sends only 9:00–20:00 local, never Sundays; STOP replies halt SMS instantly (`/api/webhooks/telnyx`, Ed25519-signed); UK/AU messages carry an opt-out link instead; one reminder max per invoice per 24h
- **SMS replies notify, not forward** — customer text replies land in the invoice timeline and trigger an email to the business owner (industry-standard pattern — see e.g. Podium/Jobber); raw SMS is never relayed to the owner's personal phone, which would break STOP compliance and double SMS cost
- **Get paid** — public pay page per invoice (`/pay/<token>`), Stripe Connect Standard onboarding, Pay Now checkout on the user's own Stripe account, webhook auto-marks paid + stops reminders; manual "mark paid" always works
- **Dashboard** — You're owed / Overdue / **Recovered by PayPigeon** / avg days-to-pay with trend, aging buckets (tap to filter), upcoming reminders
- **Money Monday digest** — weekly email cron
- **Billing** — 14-day trial (no card), Solo $29 / Crew $49 / Pro $99 via Stripe Billing, plan limits enforced, trial-expiry lockout of sends
- **Multi-tenant security** — Postgres RLS on every table, keyed by business membership

**Graceful degradation:** with no Resend/Telnyx/Stripe/Anthropic keys, sends are recorded as `simulated`, payments fall back to manual mark-paid, and scanning falls back to manual entry — the whole product is demoable with zero keys.

## Run it

```bash
npm install
npm run dev
```

`.env.local` is already wired to the provisioned Supabase project (`tmzcixefvfbozzmokduq`, us-east-1).

Local dev login (dev builds only): `http://localhost:3000/api/dev/login?email=demo@paidup.local&password=paidup-demo-2026`

The dashboard has a **"Process due reminders now"** button that runs the scheduler for your business — in production the Vercel cron does this every 5 minutes.

## Go-live checklist

| Step | What to do |
|---|---|
| **Deploy** | Push to GitHub → import to Vercel. `vercel.json` already defines the crons. Set all env vars from `.env.example`. Set `NEXT_PUBLIC_APP_URL` to the prod domain. |
| **Supabase service key** | Dashboard → Settings → API keys → create secret key → `SUPABASE_SECRET_KEY`. Required for cron sends, webhooks, inbound email. |
| **Supabase auth URLs** | Dashboard → Auth → URL Configuration: set Site URL to prod domain, add `https://<domain>/auth/callback` to redirect URLs. |
| **Resend** | Create API key → `RESEND_API_KEY`. Verify the `paypigeon.io` sending domain and set `PAYPIGEON_FROM_EMAIL=PayPigeon <reminder@paypigeon.io>` (reminders send from `reminder@`; `info@` is the separate support address shown on the site — see `lib/brand.ts`). Add webhook → `https://<domain>/api/webhooks/resend` (delivered/opened/clicked/bounced). |
| **Inbound email** | Point an inbound route (Resend Inbound or Cloudflare Email Workers) for `bills+*@paypigeon.io` at `https://<domain>/api/inbound`. Aliases are per-business (`businesses.inbound_alias`). |
| **Telnyx** | `TELNYX_API_KEY`, `TELNYX_PUBLIC_KEY` (webhook signature verification), `TELNYX_MESSAGING_PROFILE_ID`, `TELNYX_FROM_NUMBER` → env. **US launch requires 10DLC brand + campaign registration before sending.** Messaging profile's inbound webhook already points at `https://<domain>/api/webhooks/telnyx` (STOP handling + delivery receipts). |
| **Stripe** | `STRIPE_SECRET_KEY` + create 3 subscription prices → `STRIPE_PRICE_SOLO/CREW/PRO`. **Two webhook destinations**, both pointing at `https://<domain>/api/webhooks/stripe`: (1) scope "Your account" — `customer.subscription.created/updated/deleted` → its signing secret is `STRIPE_WEBHOOK_SECRET`; (2) scope "Connected accounts" — `checkout.session.completed`, `account.updated` → its signing secret is `STRIPE_CONNECT_WEBHOOK_SECRET`. The route tries both secrets automatically. |
| **Anthropic** | `ANTHROPIC_API_KEY` for photo/PDF/email extraction. |
| **Cron auth** | Set `CRON_SECRET` in Vercel (crons send it automatically). |
| **Domain** | Name decided: **PayPigeon**, `www.paypigeon.io`. Register it, point DNS at Vercel, set `NEXT_PUBLIC_APP_URL=https://www.paypigeon.io`. |

## Architecture

- **Next.js 15** (App Router, server actions) · **Tailwind v4** · Vercel crons
- **Supabase** Postgres + Auth. Tables: `businesses` (tenant), `business_members`, `customers`, `invoices`, `sequences`, `invoice_sequences`, `messages`, `payments`, `events`. RLS everywhere via `is_member(business_id)`.
- **`invoices_view`** derives `late` status in exactly one place (`status='outstanding' AND due_at < today`), per the PRD's single-source-of-truth rule.
- **Scheduler** (`lib/scheduler.ts`): pulls due `invoice_sequences`, enforces quiet hours + plan status, renders template, inserts a `messages` row keyed by `(sequence, step)` idempotency key (unique index = at-most-once), sends via Resend/Telnyx, advances the pointer. Runs identically from the cron (service role) or the in-app button (RLS-scoped).
- **Extraction** (`lib/extraction.ts`): Claude tool-forced JSON with per-field confidence; anything <0.7 is highlighted amber on the confirm card. AI output is never trusted silently.
- **Pay pages** are public via two token-scoped `security definer` RPCs (`get_invoice_by_token`, `optout_sms_by_token`) — no service key in the public path.

## Deliberately deferred (v1.1 per PRD)

QuickBooks/Xero sync · AI advisor cards · cash-flow forecast · customer league table · payment plans · team seats · Zapier. The schema supports these without changes.
