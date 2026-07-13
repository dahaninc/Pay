# PayPigeon — conventions

Automated invoice reminders for trades businesses. PRD lives at `../PRD-PayPigeon-invoice-reminders.md`.

## Stack
Next.js 15 App Router + server actions · Tailwind v4 (theme tokens in `app/globals.css`) · Supabase (project `sxufwgdlxtyobncjutdv`) · Stripe Connect Standard + Billing · Twilio SMS · Resend email · Claude API extraction.

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
- `app/api/` — crons (`cron/*`), webhooks (`webhooks/{stripe,twilio,resend}`), `inbound` (email-forward), `extract`, `pay/checkout`
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
