# PayPigeon — conventions

Automated invoice reminders for trades businesses. PRD lives at `../PRD-PaidUp-invoice-reminders.md`.

## Stack
Next.js 15 App Router + server actions · Tailwind v4 (theme tokens in `app/globals.css`) · Supabase (project `tmzcixefvfbozzmokduq`) · Stripe Connect Standard + Billing · Telnyx SMS · Resend email · Claude API extraction.

## Hard rules
- `late` is computed ONLY in the `invoices_view` SQL view. Never re-derive it in app code.
- Every table has RLS keyed by `is_member(business_id)`. New tables must too.
- Quiet hours (9–20 local, no Sundays) are enforced in `lib/tz.ts` `nextAllowedSendTime` — senders must go through the scheduler or respect it.
- AI extraction output is always user-confirmed before an invoice arms. Never auto-arm from extraction.
- Providers degrade to `simulated` message status when keys are missing — keep that property when touching senders.
- Money is integer cents (`amount_cents`), formatted via `lib/money.ts`.
- Mobile-first: primary actions ≥48px tap targets, forms single-column.

## Layout
- `lib/` — scheduler, senders, templates (tone copy), tz, plans, stats, extraction
- `app/actions/` — server actions (invoices, business, billing, scheduler, auth)
- `app/api/` — crons (`cron/*`), webhooks (`webhooks/{stripe,telnyx,resend}`), `inbound` (email-forward), `extract`, `pay/checkout`
- `app/(app)/` — authed shell (invoices, dashboard, settings)
- DB migrations applied via Supabase MCP (`apply_migration`)

## Testing locally
Dev login: `/api/dev/login?email=demo@paidup.local&password=paidup-demo-2026` (dev builds only).
Dashboard → "Process due reminders now" runs the scheduler RLS-scoped without the service key.

## Browser preview quirk
The Claude preview launcher cannot chdir into ~/Desktop (macOS folder protection), so
`.claude/launch.json` (repo root, one level up) starts a TCP proxy (`/private/tmp/paidup-proxy.py`,
:3000 → :3001) instead of the app. Run the real server yourself first:
`cd paidup && npm run dev -- -p 3001`, then `preview_start`. If the preview shows connection
errors, the :3001 dev server has stopped — restart it.

## Deployment

- **Vercel project:** `paypigeon`, team `dahanked-8602s-projects` (⚠️ different account from the
  "Lucas' projects" team the Vercel *MCP connector* sees — the connector can't see or manage this
  project; all deploys go through the `vercel` CLI, already authenticated locally as `dahanked-8602`).
- **GitHub:** `github.com/dahaninc/Pay`, branch `main`. Linked to the Vercel project — every
  `git push origin main` auto-deploys. `vercel deploy --prod --yes` also works directly and is
  what's actually been used all session (faster feedback loop, same result).
- **Live URL:** `https://paypigeon.vercel.app` (works now). Custom domain `paypigeon.io` /
  `www.paypigeon.io` added to the Vercel project (`vercel domains add`) but DNS not yet pointed at
  it — see "Pending" below.
- **After any env var change:** must redeploy for it to take effect. `vercel deploy --prod --yes`.

## Environment variables (Vercel production) — 21 set, all confirmed working

| Var | Source | Unlocks |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | DB connection (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API keys → publishable | DB connection (public) |
| `SUPABASE_SECRET_KEY` | Supabase → Settings → API keys → secret | Cron scheduler, Telnyx/inbound-email webhooks |
| `NEXT_PUBLIC_APP_URL` | — | Currently `https://paypigeon.vercel.app`; update once the custom domain is live |
| `PAYPIGEON_FROM_EMAIL` | — | `PayPigeon <reminder@paypigeon.io>` |
| `CRON_SECRET` | generated (`openssl rand -hex 32`) | Protects `/api/cron/*` |
| `RESEND_API_KEY` | Resend → API Keys (**a fresh Resend account, not the older one with `powernode.app`**) | Email sending |
| `TELNYX_API_KEY` | Telnyx → API Keys | SMS sending (Bearer auth) |
| `TELNYX_PUBLIC_KEY` | Telnyx → API Keys → Public Key | Verifies inbound webhook signatures (Ed25519) |
| `TELNYX_MESSAGING_PROFILE_ID` | Telnyx → Messaging Profile → top of page | Which profile/senders to use |
| `TELNYX_FROM_NUMBER` | Telnyx → Numbers → My Numbers | The number reminders send from (shared across all businesses — see "SMS replies notify, not forward" in README) |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys | All Stripe calls |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → destination scoped **"Your account"** (`customer.subscription.*`) | Subscription billing events |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Stripe → Webhooks → destination scoped **"Connected accounts"** (`checkout.session.completed`, `account.updated`) | Pay Now + Connect onboarding events. Both destinations point at the same URL (`/api/webhooks/stripe`); the route tries both secrets. |
| `STRIPE_PRICE_{SOLO,CREW,PRO}` | Stripe → Product catalog → each product's monthly price | Monthly billing ($29/$49/$99) |
| `STRIPE_PRICE_{SOLO,CREW,PRO}_YEARLY` | Stripe → same products → the yearly price on each | Yearly billing, `.99` pricing ($259.99/$439.99/$889.99) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | Photo/PDF/email invoice extraction |

To (re)set any of these: `bash scripts/add-vercel-env.sh` (interactive, hidden input, safe to
re-run). Manual one-off: `vercel env add NAME production` (prompts for value), or
`vercel env rm NAME production --yes` first if it already exists and needs replacing.

## Pending (not yet done, as of the last session)

1. **DNS for `paypigeon.io`** — domain is registered (Spaceship), Vercel project has both
   `paypigeon.io` and `www.paypigeon.io` added, but DNS still points at Spaceship's default
   parking host. Fix: add two A records at Spaceship — `@ → 76.76.21.21` and `www → 76.76.21.21`
   (replacing whatever's there now, not adding a duplicate).
2. **Resend domain verification for `paypigeon.io`** — 3 DNS records needed (DKIM TXT on
   `resend._domainkey`, MX on `send`, SPF TXT on `send`) — same DNS panel as #1, do both at once.
   Until verified, `RESEND_API_KEY` is set but real sends will fail/be unreliable.
3. **Supabase Auth redirect URLs** — only allows `localhost` right now. Add
   `https://paypigeon.vercel.app/auth/callback` (and later the custom domain) in Supabase →
   Auth → URL Configuration, or magic-link login breaks for anyone but local dev.
4. **Telnyx 10DLC campaign registration** — not started. Blocks real-volume US SMS regardless of
   everything else being configured.
5. **ToS / Privacy Policy** — not written.
6. **No real end-to-end transaction yet** — no real signup, real Stripe payment, real SMS, or
   real email has actually happened in production. Everything is "verified the endpoint responds
   correctly," not "confirmed working with real money/messages." Do this once #1–3 are done.
