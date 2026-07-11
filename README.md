# PaidUp

**Send the invoice. We'll chase it.** Automated invoice reminders + plain-English cash-flow view for trades businesses. Built per [the PRD](../PRD-PaidUp-invoice-reminders.md).

## What works today

The complete core loop, end to end:

- **Auth** — magic link / 6-digit email code (Supabase Auth), 30-second business onboarding
- **Invoices in, 4 ways** — manual add (4 fields, ~20s) · photo/PDF scan with Claude extraction + confirm card · CSV import with preview · email-forward webhook (`/api/inbound`)
- **Reminder engine** — 5-step default sequence (heads-up −3d → final notice +21d), tone dial (Friendly/Professional/Firm), per-step editable templates with merge tags, idempotent scheduler, auto-stop on payment
- **Compliance built in** — sends only 9:00–20:00 local, never Sundays; STOP replies halt SMS instantly (`/api/webhooks/twilio`); UK/AU messages carry an opt-out link instead; one reminder max per invoice per 24h
- **Get paid** — public pay page per invoice (`/pay/<token>`), Stripe Connect Standard onboarding, Pay Now checkout on the user's own Stripe account, webhook auto-marks paid + stops reminders; manual "mark paid" always works
- **Dashboard** — You're owed / Overdue / **Recovered by PaidUp** / avg days-to-pay with trend, aging buckets (tap to filter), upcoming reminders
- **Money Monday digest** — weekly email cron
- **Billing** — 14-day trial (no card), Solo $29 / Crew $49 / Pro $99 via Stripe Billing, plan limits enforced, trial-expiry lockout of sends
- **Multi-tenant security** — Postgres RLS on every table, keyed by business membership

**Graceful degradation:** with no Resend/Twilio/Stripe/Anthropic keys, sends are recorded as `simulated`, payments fall back to manual mark-paid, and scanning falls back to manual entry — the whole product is demoable with zero keys.

## Run it

```bash
npm install
npm run dev
```

`.env.local` is already wired to the provisioned Supabase project (`sxufwgdlxtyobncjutdv`, us-east-2).

Local dev login (dev builds only): `http://localhost:3000/api/dev/login?email=demo@paidup.local&password=paidup-demo-2026`

The dashboard has a **"Process due reminders now"** button that runs the scheduler for your business — in production the Vercel cron does this every 5 minutes.

## Go-live checklist

| Step | What to do |
|---|---|
| **Deploy** | Push to GitHub → import to Vercel. `vercel.json` already defines the crons. Set all env vars from `.env.example`. Set `NEXT_PUBLIC_APP_URL` to the prod domain. |
| **Supabase service key** | Dashboard → Settings → API keys → create secret key → `SUPABASE_SECRET_KEY`. Required for cron sends, webhooks, inbound email. |
| **Supabase auth URLs** | Dashboard → Auth → URL Configuration: set Site URL to prod domain, add `https://<domain>/auth/callback` to redirect URLs. |
| **Resend** | Create API key → `RESEND_API_KEY`. Verify your sending domain and set `PAIDUP_FROM_EMAIL` (e.g. `PaidUp <remind@mail.paidup.app>`). Add webhook → `https://<domain>/api/webhooks/resend` (delivered/opened/clicked/bounced). |
| **Inbound email** | Point an inbound route (Resend Inbound or Cloudflare Email Workers) for `bills+*@paidup.app` at `https://<domain>/api/inbound`. Aliases are per-business (`businesses.inbound_alias`). |
| **Twilio** | Account SID/token/from number → env. **US launch requires A2P 10DLC brand + campaign registration before sending.** Set the number's inbound webhook to `https://<domain>/api/webhooks/twilio` (STOP handling). |
| **Stripe** | `STRIPE_SECRET_KEY` + create 3 subscription prices → `STRIPE_PRICE_SOLO/CREW/PRO`. Webhook endpoint `https://<domain>/api/webhooks/stripe` with `checkout.session.completed`, `account.updated`, `customer.subscription.*` — **enable "listen to Connect accounts" for checkout events**. `STRIPE_WEBHOOK_SECRET` from the endpoint. |
| **Anthropic** | `ANTHROPIC_API_KEY` for photo/PDF/email extraction. |
| **Cron auth** | Set `CRON_SECRET` in Vercel (crons send it automatically). |
| **Domain** | PRD suggests deciding the name (PaidUp/ChaseLess/OwedApp/…) before buying. |

## Architecture

- **Next.js 15** (App Router, server actions) · **Tailwind v4** · Vercel crons
- **Supabase** Postgres + Auth. Tables: `businesses` (tenant), `business_members`, `customers`, `invoices`, `sequences`, `invoice_sequences`, `messages`, `payments`, `events`. RLS everywhere via `is_member(business_id)`.
- **`invoices_view`** derives `late` status in exactly one place (`status='outstanding' AND due_at < today`), per the PRD's single-source-of-truth rule.
- **Scheduler** (`lib/scheduler.ts`): pulls due `invoice_sequences`, enforces quiet hours + plan status, renders template, inserts a `messages` row keyed by `(sequence, step)` idempotency key (unique index = at-most-once), sends via Resend/Twilio, advances the pointer. Runs identically from the cron (service role) or the in-app button (RLS-scoped).
- **Extraction** (`lib/extraction.ts`): Claude tool-forced JSON with per-field confidence; anything <0.7 is highlighted amber on the confirm card. AI output is never trusted silently.
- **Pay pages** are public via two token-scoped `security definer` RPCs (`get_invoice_by_token`, `optout_sms_by_token`) — no service key in the public path.

## Deliberately deferred (v1.1 per PRD)

QuickBooks/Xero sync · AI advisor cards · cash-flow forecast · customer league table · payment plans · team seats · Zapier. The schema supports these without changes.
