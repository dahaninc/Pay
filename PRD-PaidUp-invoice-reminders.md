# PRD — "PaidUp" (working title)
### Automated invoice reminders + cash-flow advisor for trades businesses

**Version:** 1.0 · **Date:** 2026-07-11 · **Owner:** Rich · **Status:** Draft for build
**Markets:** US, UK, Canada, Australia · **Currencies:** USD, GBP, CAD, AUD
**Stack:** Claude Code · GitHub · Vercel (Next.js 15) · Supabase · Stripe Connect · Twilio · Resend · Claude API

> Working title alternatives: ChaseLess, OwedApp, SquaredUp, PaidMate. Decide before domain purchase.

---

## 1. One-liner

**"Send the invoice. We'll chase it. You stay on the tools."**
PaidUp automatically follows up unpaid invoices by SMS + email until they're paid — with a Pay Now link — and gives tradespeople a plain-English view of who owes them what.

## 2. Problem

Plumbers, electricians, HVAC techs, builders, landscapers send invoices and forget to follow up. Customers don't refuse to pay — nobody reminds them. The tradesperson is on the next job, not playing accounts-receivable manager. Result: 30–60+ day payment delays, cash-flow stress, awkward "sorry to bother you" texts written at 9pm.

Validated demand: 3,536-upvote Reddit thread on exactly this pain; an existing operator at ~$14K MRR; 600K+ trades businesses in the US alone, plus UK/CA/AU equivalents.

## 3. Target user

**Primary persona — "Dave, 38, self-employed plumber" (1–5 person crew)**
- Invoices from QuickBooks, Jobber, Word template, or carbon-copy pad
- Does admin from his phone, in the van, between jobs
- Has £8–40K outstanding at any time; 2–6 invoices past due
- Hates confrontation about money; loves anything that removes it
- Will not watch a tutorial. Will not read docs. 5-minute patience budget.

**Secondary persona — office manager / spouse doing the books** for a 5–20 person trades firm. Desktop user, wants the list view and exports.

**Design law derived from persona:** every core action must be doable on a phone, one-handed, in under 30 seconds, in daylight (high contrast), with dirty hands (big tap targets).

## 4. Goals & success metrics

| Goal | Metric | Target (6 months post-launch) |
|---|---|---|
| Activation | Signup → first reminder scheduled | ≥ 60% within 24h |
| Core value | Median days-to-pay reduction per account | ≥ 30% vs. baseline |
| Wow proof | "Recovered" ledger per user | Visible $ figure ≥ 10× subscription cost |
| Retention | Month-3 logo retention | ≥ 85% |
| Revenue | MRR | $10K |
| Referral | Reviews mentioning "paid faster" | Top-3 quote theme |

North-star metric: **dollars recovered per account per month** (rendered prominently in-app — it is also the retention argument).

## 5. End-user workflow (the whole product in one loop)

```
Invoice gets into PaidUp  →  Reminder sequence armed  →  Customer nudged (SMS+email, Pay Now link)
        ↑                                                            ↓
   (4 input paths)                    Paid → auto-detected → sequence stops → "🎉 You got paid" push
                                                                     ↓
                                              Dashboard/advisor updates → weekly digest
```

### 5.1 Getting invoices IN (the make-or-break moment — 4 paths, zero-typing bias)

1. **Forward the invoice email** to `bills@paidup.app` (personal alias per account). Claude API extracts customer, amount, due date, invoice #. Confirmation card sent back; one tap to arm reminders. *Primary path — meets users where invoices already live.*
2. **Snap a photo** of a paper invoice in the mobile web app. Same Claude extraction pipeline (PDF/image → structured JSON), user confirms 4 fields, done.
3. **Connect QuickBooks Online / Xero** (OAuth). Invoices + payment status sync both ways. Payment webhooks auto-stop reminders.
4. **CSV import / manual add.** Manual add is a single screen: customer (name + mobile + email), amount, due date. 20 seconds.

Extraction UX rule: AI output is **always shown for confirmation** — 4 fields, pre-filled, big "Looks right ✓" button. Never silently trusted.

### 5.2 The reminder engine (set-and-forget)

- **Default sequence (editable):**
  - Due date −3d: friendly heads-up email ("invoice due Friday")
  - Due date +1d: polite SMS + email with Pay Now link
  - +5d: firmer SMS ("quick nudge — invoice #142 is now overdue")
  - +10d: firm email, CC business owner, offer payment plan link
  - +21d: final notice template (mentions next steps, still polite)
- **Tone dial per sequence: Friendly / Professional / Firm.** Copy pre-written by us (trade-appropriate, sounds like a human, never legalistic). Users can edit any message; merge tags: `{first_name} {amount} {invoice_no} {days_overdue} {pay_link}`.
- **Sends "from" the tradesperson:** email via their reply-to; SMS from a dedicated local number with their business name in the message. Replies go to the user's phone/inbox — PaidUp never talks to the customer as a third party (this keeps relationships intact; key differentiator vs. debt-collection feel).
- **Auto-stop on payment** (Stripe webhook, QBO/Xero webhook, or manual "mark paid").
- **Quiet hours + local-law guardrails** baked in and non-optional: sends only 9:00–20:00 recipient local time, never Sundays (configurable stricter, never looser). Per-market compliance handled by us (see §10).
- **Escalation pause:** one tap "pause reminders for this customer" (dispute, mate's rates, known situation).

### 5.3 Getting PAID (Stripe Connect)

- Every reminder carries a **Pay Now link** → Stripe Checkout on the user's own connected Stripe account (Stripe Connect **Standard**; funds go direct to user, we never touch money).
- Cards + Apple Pay/Google Pay + local rails (ACH in US, BACS/Open Banking "Pay by bank" in UK, PAD in CA, BECS in AU) — whatever Stripe enables per market.
- Payment → webhook → invoice auto-marked paid → sequence stops → push notification "💰 Sarah Miller paid $840 (invoice #142)". That notification is the product's dopamine loop; never bury it.
- No Stripe? Product still works: reminders + "mark paid" manually. Stripe connect is prompted at the moment of first arm-reminder, not at signup (don't front-load friction).

### 5.4 The invoice list (home screen)

Single list, three states, zero learning curve:

- **Tabs: Outstanding · Late · Paid** (+ "All"). Default view = Late first, sorted by amount desc.
- Each row: customer, amount, days overdue (red pill), next reminder ("SMS Tue 9am"), last activity ("opened email 2h ago").
- Row tap → invoice detail: full timeline (sent/delivered/opened/clicked/replied/paid), message previews, one-tap actions: Remind now · Pause · Mark paid · Edit · Payment plan.
- Global search + filters (customer, amount range, age bucket).
- **Empty state sells:** "Forward your first invoice to bills@paidup.app — we'll take it from there."

### 5.5 Dashboard = business advisor (the "global view")

Not charts for charts' sake — a **plain-English cash-flow advisor**, top to bottom:

1. **Header stats (always visible):** Outstanding total · Overdue total · **Recovered by PaidUp (lifetime)** · Avg days-to-pay (with trend arrow vs. last quarter).
2. **Aging bar:** 0–30 / 31–60 / 61–90 / 90+ buckets, tap-to-filter the list.
3. **Cash-flow forecast (4 weeks):** expected inflows by week based on due dates × each customer's historical pay behavior.
4. **Advisor cards (Claude-generated weekly, max 3, plain English, each with one action button):**
   - "Sarah Miller pays on average 34 days late and owes $2,300 across 2 invoices. Consider requiring a deposit on her next job." → [Flag customer]
   - "Your average days-to-pay dropped from 41 → 26 since you started. That's ~$4,100 arriving earlier each month."
   - "3 invoices have no mobile number — SMS reminders convert 3× better. Add numbers?" → [Fix now]
5. **Customer league table:** best payers / slowest payers, avg days, total volume.
6. **Weekly "Money Monday" email digest:** same content, pushed — the dashboard comes to the user (Dave doesn't open dashboards; his inbox opens him).

Advisor guardrails: insights are descriptive statistics + templated recommendations. No credit advice, no legal advice, no "sue them" suggestions. Every AI-generated card passes a rules filter before display.

## 6. Feature list (MoSCoW)

**Must (MVP, ~4–6 weeks):**
Auth (magic link + Google) · manual invoice add · email-forward ingestion with Claude extraction · photo/PDF extraction · reminder sequences (default + tone dial + editor) · SMS (Twilio) + email (Resend) sending with per-market compliance · Pay Now via Stripe Connect Standard · auto-stop on payment · invoice list (Outstanding/Late/Paid) · invoice timeline · header stats + aging + recovered counter · Money Monday digest · mobile-first responsive web app · CSV import · settings (business profile, branding on emails, quiet hours) · Stripe billing for subscriptions (trial 14 days, no card).

**Should (v1.1, weeks 7–12):**
QuickBooks Online sync · Xero sync · advisor cards (Claude) · cash-flow forecast · customer league table · payment plans (split into N Stripe payment links) · deposit requests · team seats/roles · Zapier/Make triggers.

**Could (later):**
Jobber/ServiceM8/Tradify integrations (AU/UK trades platforms) · native mobile wrapper (Capacitor) · late-fee automation · statement-of-account sends · multi-business.

**Won't (explicitly):**
Full invoicing/quoting suite (stay the reminder layer, don't fight Jobber) · debt collection service · lending/factoring · accounting.

## 7. Integrations map

| Integration | Purpose | MVP? |
|---|---|---|
| Stripe Connect (Standard) | Customer payments direct to user | ✅ |
| Stripe Billing | Our subscriptions | ✅ |
| Twilio (+ A2P 10DLC US registration) | SMS in US/CA; UK/AU alphanumeric or local numbers | ✅ |
| Resend | Transactional + reminder emails, open/click tracking | ✅ |
| Claude API | Invoice extraction (email/photo/PDF) + advisor cards + message-tone rewrites | ✅ (extraction) |
| Inbound email (Resend inbound or Cloudflare Email Workers → webhook) | bills@ forwarding ingestion | ✅ |
| QuickBooks Online | Invoice + payment sync | v1.1 |
| Xero | Invoice + payment sync (UK/AU/NZ strong) | v1.1 |
| Zapier / Make | Long-tail (Jobber, ServiceTitan, sheets) | v1.1 |
| PostHog | Product analytics + session replay | ✅ |
| Sentry | Error tracking | ✅ |

## 8. Technical architecture

```
Next.js 15 (App Router, RSC) on Vercel
 ├─ UI: Tailwind + shadcn/ui (Claude Design pass later)
 ├─ API routes / server actions
 ├─ Vercel Cron → /api/cron/scheduler (every 5 min)
Supabase
 ├─ Postgres (+ RLS on every table, tenant = business_id)
 ├─ Auth (magic link, Google OAuth)
 ├─ Storage (invoice PDFs/photos, private buckets, signed URLs)
 └─ Edge Functions: webhook receivers (Stripe, Twilio status, Resend events, QBO/Xero)
Queues: scheduler writes due sends to a `message_jobs` table; worker (cron-invoked, idempotent,
        batched) sends via Twilio/Resend and records results. At-least-once + idempotency keys.
GitHub: trunk-based, PR previews on Vercel, GitHub Actions (typecheck, lint, Playwright smoke,
        supabase db diff check). Claude Code as primary dev agent; CLAUDE.md with conventions.
```

**Core data model (simplified):**
`businesses` (tenant, market, currency, quiet_hours, branding) · `users` (↔ business, role) · `customers` (name, email, phone, notes, flags, pay_stats) · `invoices` (customer_id, number, amount_cents, currency, issued_at, due_at, status: draft/outstanding/late/paid/paused/written_off, source: manual/email/photo/csv/qbo/xero, stripe_payment_link) · `sequences` (steps jsonb, tone) · `invoice_sequences` (invoice ↔ sequence, state, next_run_at) · `messages` (invoice_id, channel, direction, body, status: queued/sent/delivered/opened/clicked/failed, provider_ids) · `payments` (invoice_id, amount, method, stripe refs) · `insights` (business_id, week, cards jsonb, dismissed) · `integration_accounts` (provider, tokens encrypted) · `events` (audit log).

**Status derivation rule (single source of truth):** `late` = outstanding AND due_at < now(). Computed in one SQL view, never duplicated in app code.

**AI pipelines:**
- *Extraction:* file/email → Claude (structured output JSON schema: customer_name, email, phone, amount, currency, invoice_no, issue_date, due_date, confidence per field) → confidence < threshold ⇒ field highlighted for user review. Store raw doc + extraction for audit.
- *Advisor:* weekly cron → per-business stats pack (SQL) → Claude with strict system prompt + output schema → rules filter (no legal/credit advice, amounts must match source data) → store cards. Cost: ~1 call/business/week — negligible.

## 9. UX & design spec (marketing-grade, benchmarked)

Benchmarks — the "top-3 UI/UX feels" this product borrows from, deliberately:

1. **Linear** → speed-as-a-feature: optimistic UI, <100ms perceived interactions, keyboard shortcuts on desktop (`R` remind, `P` mark paid), command-K palette.
2. **Stripe Dashboard** → data trust: tabular clarity, monospaced numerals, restrained color (semantic red/amber/green only for money states), impeccable empty/loading states.
3. **Mercury** → calm finance aesthetic: generous whitespace, one accent color, big friendly numbers, zero clutter. Finance that lowers blood pressure instead of raising it.

House rules:
- **Mobile-first, thumb-first.** Primary actions bottom-anchored. Min 48px tap targets. Works in bright daylight (WCAG AA contrast minimum, test at max brightness outdoors).
- **Three-tap rule:** any core job (add invoice, remind now, mark paid) ≤ 3 taps from home.
- **Numbers are the hero.** The Recovered counter and Outstanding total get typographic top billing on every screen.
- **Human copy, trade voice.** "You're owed $4,200" not "Accounts receivable: $4,200". Microcopy sounds like a helpful office manager, never a bank.
- **Celebration moments:** payment received = confetti-lite + push. Weekly digest opens with the win, not the problem.
- **Onboarding = one real invoice.** Signup → "forward or snap your first invoice" → armed sequence → done. Time-to-armed target: < 5 minutes. No tour, no checklist longer than 3 items.
- Design tokens + components in shadcn/ui now; full visual identity via Claude Design later (this PRD defines structure and behavior, not final skin).

## 10. Compliance & trust (per market — non-negotiable, built-in)

| Market | SMS rules | Implementation |
|---|---|---|
| US | TCPA + A2P 10DLC | Twilio brand/campaign registration; consent checkbox on customer record ("customer agreed to receive billing texts"); mandatory STOP handling; 9am–8pm recipient-local send window |
| Canada | CASL | Implied consent via existing business relationship documented per contact; unsubscribe in every message |
| UK | PECR/GDPR | B2C texts require consent capture; lawful-basis note per contact; UK data subject rights flow |
| Australia | Spam Act 2003 | Inferred consent via business relationship; sender ID rules; unsubscribe |

- STOP/unsubscribe immediately halts that channel per contact, logged. **Nuance:** alphanumeric sender IDs (UK/AU option) can't receive replies — in those configurations every SMS carries an opt-out link instead of "Reply STOP"; US/CA use two-way local numbers where STOP works natively.
- GDPR/UK-GDPR: DPA, data export + delete per business; Supabase region choice (US project; EU project if EU expansion later); PII encrypted at rest; signed URLs only for documents.
- Email: SPF/DKIM/DMARC on sending domain; reminders sent from `remind@usernames-business.paidup.app` with user reply-to (deliverability isolation per tenant group).
- Clear positioning line in ToS: *we are a reminder tool, not a debt collector* (keeps us outside FDCPA/collections licensing since we act as the business itself, first-party).
- Money: Stripe Connect Standard = funds never touch our platform; we are not a money transmitter.

## 11. Pricing & packaging

| Plan | Price (USD-equiv per market) | Limits |
|---|---|---|
| Solo | $29/mo or $290/yr | 1 user, 30 active invoices/mo, SMS pack included (100/mo, then metered) |
| Crew | $49/mo or $490/yr | 3 users, 100 active invoices, 300 SMS |
| Pro | $99/mo | Unlimited invoices, 10 users, priority support, API/Zapier |

- 14-day trial, no card. Trial converts on the first "you got paid" event — surface upgrade there.
- SMS overage metered at cost + margin (protects unit economics; Twilio ~$0.008–0.08/msg by market).
- **AppSumo LTD (launch phase only):** Tier 1 $59 (Solo-equivalent, capped 25 invoices/mo), Tier 2 $119, Tier 3 $199 (Crew-equivalent). SMS **not** unlimited in LTD — credits/month, top-ups paid. This is the classic LTD trap; metered SMS is the survival clause.

## 12. Go-to-market (Reddit / X / AppSumo — in that order)

**Phase 0 — validation (week 1, before code):** post in r/Plumbing, r/electricians, r/HVAC, r/sweatystartup, r/smallbusiness asking how they chase invoices today (no pitch). Landing page + waitlist, $50 Reddit ads on "unpaid invoice" pain keywords. Gate: 20+ waitlist signups.

**Phase 1 — Reddit-native launch:** founder answers every "how do I get customers to pay" thread with genuinely useful advice + soft mention. Recovered-money screenshots (with permission) are the content engine. Target: the same subreddits that validated the demand.

**Phase 2 — X build-in-public:** weekly MRR + "recovered for users" counter posts; the aggregate recovered number is the marketing asset ("PaidUp users have recovered $214,000 in late invoices").

**Phase 3 — AppSumo:** launch after churn/activation are healthy (month 3+, never month 1). Purpose: cash + review volume + SEO, accepting ~70% rev share on LTDs. Prep: onboarding videos, review-request automation, support macros.

**Evergreen SEO:** programmatic pages "invoice reminder template for [plumbers/electricians/…]", "[state/country] late payment rules", free tools (late-fee calculator, reminder-letter generator) — each captures panic-keyword traffic and feeds the funnel.

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| SMS deliverability/compliance failure | A2P 10DLC registration before US launch; templated copy pre-vetted; STOP handling day one |
| Jobber/QBO ship "good enough" reminders | Our moat = multi-source ingestion + tone-crafted sequences + advisor + recovered counter; stay the best at one job |
| AI extraction errors → wrong amount texted to customer | Mandatory confirm step; confidence thresholds; amount always shown in confirm card; audit trail |
| LTD buyers drain SMS costs | Metered SMS credits in all LTD tiers |
| Users fear annoying their customers | Tone presets, preview-before-arm, quiet hours, our brand invisible to end customers |
| Single-founder bus factor | Boring stack, managed services, CLAUDE.md-documented codebase, IaC via supabase migrations |

## 14. MVP acceptance checklist (definition of done)

- [ ] Signup → armed first reminder in < 5 min on a phone (tested with 3 real tradespeople)
- [ ] Email-forward → correct extraction → confirm card round-trip < 2 min
- [ ] Reminder fires on schedule, respects quiet hours + market rules, logs delivery
- [ ] Stripe payment → invoice auto-paid → sequence stops → push sent (E2E test)
- [ ] STOP reply halts SMS instantly
- [ ] List tabs (Outstanding/Late/Paid) always agree with the SQL status view
- [ ] Recovered counter accurate against payments table
- [ ] RLS verified: cross-tenant access impossible (automated test)
- [ ] Lighthouse mobile ≥ 90 perf / ≥ 95 a11y on list + dashboard
- [ ] Money Monday digest renders correctly in Gmail/Outlook/Apple Mail

## 15. Build sequence with Claude Code (suggested)

1. Repo scaffold: Next.js 15 + Tailwind + shadcn/ui + Supabase client, CLAUDE.md, CI. (day 1)
2. Schema + RLS + status view + seed data. (days 2–3)
3. Invoice CRUD + list UI + manual add. (days 4–6)
4. Sequence engine + message_jobs worker + Resend email sends. (week 2)
5. Twilio SMS + compliance layer (quiet hours, STOP, per-market rules table). (week 2–3)
6. Stripe Connect onboarding + Pay Now links + webhooks + auto-stop. (week 3)
7. Email-forward + photo ingestion with Claude extraction + confirm cards. (week 4)
8. Dashboard stats, aging, recovered counter, Money Monday digest. (week 5)
9. Billing (Stripe), trial logic, settings, polish, E2E tests, beta with 5 tradespeople. (week 6)

---

## Appendix A — Default message copy (tone: Professional)

- **Due −3d (email):** "Hi {first_name}, a quick heads-up that invoice {invoice_no} for {amount} is due on {due_date}. You can pay online here: {pay_link}. Thanks — {business_name}"
- **+1d (SMS):** "Hi {first_name}, invoice {invoice_no} ({amount}) from {business_name} was due yesterday. Pay in 30 seconds: {pay_link}. Reply STOP to opt out."
- **+5d (SMS):** "Hi {first_name}, just a nudge — invoice {invoice_no} ({amount}) is now {days_overdue} days overdue. {pay_link} — {business_name}"
- **+10d (email):** firmer template, offers payment plan link, CCs owner.
- **+21d (email):** final notice, states next steps (late fee if configured / account hold), still human.

## Appendix B — Advisor card prompt contract (summary)

Input: per-business stats JSON (aging, per-customer avg days-to-pay, trend deltas, missing-data flags). Output: max 3 cards, JSON schema {headline ≤ 90 chars, body ≤ 240 chars, action_type ∈ enum, entity_ref}. Hard rules in system prompt: no legal advice, no creditworthiness claims, every number must appear in input JSON verbatim, tone = helpful office manager.
