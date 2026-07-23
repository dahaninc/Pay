# PayPigeon — conventions

Automated invoice reminders for trades businesses, solopreneurs, and institutional AR teams.
PRD lives at `../PRD-PaidUp-invoice-reminders.md`.

**Status as of 2026-07-23: live on paypigeon.io, moving real money, no-card freemium funnel
shipped, new brand redesign shipped. ⚠️ NOTHING this session (or several before it) is
committed to git** — production runs directly off the deployed working tree via
`vercel deploy --prod --yes`. There is no commit history, no rollback point, no branch. This
is the single biggest operational risk right now, independent of any feature work. Confirm
with the user before assuming it's safe to `git checkout`/`reset`/discard anything.

## Stack
Next.js 15 App Router + server actions · Tailwind v4 (theme tokens in `app/globals.css`) ·
Supabase (project `tmzcixefvfbozzmokduq`) · Stripe Billing (no-card freemium → paid subscription,
see Billing model below) + Stripe Connect Standard (pay-links) · Telnyx SMS (+ Alphanumeric
Sender ID for international) · Resend email (also powers Supabase Auth SMTP) · Claude API
extraction.

## Hard rules
- `late` is computed ONLY in the `invoices_view` SQL view. Never re-derive it in app code.
- Every table has RLS keyed by `is_member(business_id)`. New tables must too.
- **Quiet hours are business-configurable within a legal floor/ceiling of 7am–10pm local**
  (widened from an earlier 8am–8pm this session) — enforced in `lib/tz.ts`
  `nextAllowedSendTime(date, tz, quietStart, quietEnd, allowSunday, fallbackHour?)`. The
  suggested/default standard is **8am–9pm** (`businesses.quiet_start`/`quiet_end` column
  defaults: 8/21) — every business can move their own window anywhere inside 7–22 via
  `components/QuietHoursEditor.tsx` (Settings), but the outer 7–22 bound itself must never be
  widened without the user explicitly signing off — it exists for TCPA/PECR-style automated-
  message-hour regulations, not as a UI preference. DB check constraints enforce the same
  7–22 bound server-side.
- **All reminder steps in a sequence aim for the SAME local clock time each day**
  (`businesses.preferred_send_hour`, default 10am, editable in the same Settings card, clamped
  to stay inside the business's own quiet-hours window). This was previously a hardcoded
  global constant (`SEND_HOUR = 10` in `lib/scheduler.ts`) — now per-business.
  `stepSendTime(step, dueAt, tz, sendHour)` takes it as a param.
- **`armingPlan`/`resumeSequence`/`armInvoice` must always be called with the business's real
  `quiet_start`/`quiet_end`/`preferred_send_hour`** — a real bug this session had them silently
  falling back to hardcoded defaults (9/20) even after a business customized their hours,
  because the values were never threaded through as arguments. Fixed by passing them
  explicitly at every call site (`app/actions/invoices.ts`, `lib/scheduler.ts`) — if you add a
  new call site, pass all three or the initial "next run" estimate will be wrong (the real
  send-time gate in `processOne()` was never affected, only the displayed estimate).
- Sunday blocking is **per-business, not hardcoded**: `businesses.allow_sunday` (default
  `false`), toggled in Settings, threaded through `armingPlan()` / `resumeSequence()` /
  `advance()` in `lib/scheduler.ts`. Don't reintroduce a hardcoded Sunday check anywhere.
- SMS opt-out language must key off the **customer's own phone number country**
  (`isDomesticSms()` in `lib/senders.ts`), never `business.country`.
- AI extraction output is always user-confirmed before an invoice arms. Never auto-arm from
  extraction.
- Providers degrade to `simulated` message status when keys are missing — keep that property
  when touching senders. SMS metering (below) only ever bills on a real `"sent"` status, never
  simulated/failed.
- Money is integer cents (`amount_cents`), formatted via `lib/money.ts`.
- Mobile-first: primary actions ≥48px tap targets, forms single-column.
- **Never build cancellation friction.** Self-serve billing-portal cancel stays one click — FTC
  click-to-cancel compliance, not a style preference. `/settings/cancel` retention screen →
  un-hidden one-click "No thanks, cancel" straight into Stripe's native cancel flow. Out of
  scope for casual changes — ask the user first.
- **No fabricated marketing claims — this includes testimonials and "trusted by" logos.**
  Stats/social proof must be true of PayPigeon itself and its real customers, or clearly framed
  as third-party/industry data. **This was tested hard this session**: a design-tool homepage
  prototype shipped with placeholder testimonials attributed to named individuals at FedEx,
  Marriott, Tesco, JD Sports UK, Norfolk Southern, Crown Holdings, Scotia Gas Networks, etc. —
  none of which are PayPigeon customers (verified directly against the production DB: the
  oldest account is 9 days old, all personal Gmail/Outlook addresses, several are the user's own
  QA test signups). Refused to publish those, and refused a follow-up request to create fake
  user accounts under those company names in the database (impersonation, would manufacture
  false "evidence" of customers that don't exist). The testimonials section
  (`components/TestimonialCarousel.tsx`) is BUILT and deployed but renders nothing — it's wired
  to `TESTIMONIALS` in `app/page.tsx`, currently an empty array with a comment explaining why.
  **Do not populate it without a real quote + real consent from an actual PayPigeon user.** The
  logo marquee band (same section) currently shows real product capabilities as filler text
  instead of customer logos, for the same reason — swap in real logos only once real customers
  consent to being shown.
- Pricing/trial terms shown anywhere (landing, onboarding, pricing cards) must match what the
  code actually charges — `lib/plans.ts` is the single source of truth for every number shown.
- **Pay-link messaging must be conditional on `business.stripe_charges_enabled`.** See
  `canPayOnline` prop pattern in `components/InvoiceActions.tsx`.
- All Stripe/webhook-facing server actions that can throw must catch and return a friendly
  `{ error }` instead of letting the exception 500 the page — see `connectStripe()` in
  `app/actions/billing.ts` (rethrow only on `NEXT_REDIRECT`).
- **AppSumo redemption is feature-flagged off** (`APPSUMO_ENABLED = false` in `lib/plans.ts`) —
  not registered with AppSumo yet. Both the Settings UI box (`components/RedeemCodeForm.tsx`)
  and the server action (`redeemAppsumoCode` in `app/actions/appsumo.ts`) check the flag
  independently, since server actions are network-callable regardless of what the UI hides.
  Flip the flag when the AppSumo listing goes live — don't delete anything, the whole path
  (schema, tiers, CLI scripts, admin views) still works underneath.

## Layout
- `lib/` — scheduler, senders, templates (tone copy + branded HTML), tz, plans (pricing +
  limits + SMS overage rates), stats, extraction, extractionCap (hidden AI cap, server-only),
  smsUsage (SMS pack metering + Stripe overage billing), trial (no-card free-tier cap), brand
  (name/contact/reply-to helpers, email header)
- `app/actions/` — server actions (invoices, business, billing, scheduler, auth, appsumo)
- `app/api/` — crons (`cron/*`, fail-closed on missing `CRON_SECRET`), webhooks
  (`webhooks/{stripe,telnyx,resend}`), `inbound` (email-forward ingestion + customer replies,
  Svix-signed, now also gated on the monthly invoice cap), `extract` (rate-limited 30/hr/business
  + the hidden monthly AI cap), `pay/checkout`
- `app/(app)/` — authed shell (invoices, dashboard, settings, `settings/templates`,
  `settings/cancel` retention screen)
- DB migrations applied via Supabase MCP (`apply_migration`) — **not tracked as `.sql` files in
  the repo**, only as applied migrations in the live Supabase project. There is no local
  migration history to diff against; `list_migrations` via the MCP is the source of truth.

## Brand & theming (redesigned this session)
- **New palette, light mode only**: navy ink `#0a1551`, bright orange accent `#f2600e`, white
  surfaces (`app/globals.css` `:root, html[data-theme="light"]` block) — replaces the earlier
  cream/amber palette entirely. Approved via a design-tool handoff (colors-only zip) plus a
  separately-supplied full HTML homepage prototype (`PayPigeon-homepage-standalone.html`, not
  committed anywhere — if you need to re-check it against the live site, ask the user for it
  again). Every existing Tailwind class (`bg-accent`, `.card`, `.btn-primary`, etc.) reads from
  CSS vars via the `@theme inline` block, so recoloring `globals.css` alone recolors the whole
  light-mode app — no component class-name changes needed for a future palette tweak.
- **`--accent-ink` vs `--accent-text`**: the handoff flipped `--accent-ink` (text ON a solid
  accent button) from dark to white. That broke ~13 places that were using it as accent-*toned
  text on light backgrounds* (active sidebar nav item, forward-address chips, upgrade banners,
  landing stat numbers) — they went white-on-pale, unreadable. Fixed by adding a second token,
  `--accent-text` (light: `#c24a06`; dark: same value dark `--accent-ink` already had, so dark
  mode is byte-identical), and repointing those ~13 spots at it. **Use `text-accent-ink` only
  for text on a solid `bg-accent` button; use `text-accent-text` for accent-colored text on
  `surface`/`accent-soft` backgrounds.**
- **Dark mode is explicitly untouched** (`#0b0c0e` bg, `#c9f23c` accent, etc.) — per standing
  user preference from an earlier session. Verified byte-identical dark-mode CSS block after
  every palette change this session (diffed computed `--bg`/`--accent`/`--accent-ink` before
  and after). Don't "improve" or re-theme dark mode as a side effect of touching light mode.
- **Logo is theme-aware now** (`components/Logo.tsx`): renders TWO `<Image>` elements
  (`/logo-mark.png` class `logo-light`, `/logo-mark-dark.png` class `logo-dark`), toggled purely
  via CSS (`html[data-theme="dark"] .logo-light { display:none }` etc. in `globals.css`) so the
  server-rendered markup is theme-agnostic. Both PNGs were regenerated from the same official
  line-art source this session — the original asset had the bird occupying only ~45% of a
  720×720 canvas at very low stroke opacity (illegible on white); re-processed with `sharp` to
  trim padding, re-center on a square canvas at ~90% fill, and boost stroke opacity, producing a
  navy variant (light mode) and a variant keeping the art's original slate stroke (dark mode,
  same value dark already rendered). No new art was commissioned — same line work, correctly
  sized/inked. If a bolder mark (thicker strokes) is ever wanted, that needs the source vector
  file and a designer, not another image-processing pass.
- **Landing page was fully rebuilt** (`app/page.tsx`) to match the approved homepage prototype:
  sticky nav (Platform/How it works/Pricing/Customers anchors), hero with dashboard-mockup card,
  scrolling gradient band (`.band` + `.anim-ticker` in `globals.css`, currently real capability
  chips — see the testimonials/logos hard-rule above for why), 4-feature "Platform" grid,
  "How it works" 3-step band, `TestimonialCarousel` (empty pending real quotes), dark navy stats
  band, pricing (`components/LandingPricing.tsx`, Crew as the dark "POPULAR" card matching the
  prototype), About section (kept — needed for the pending Google OAuth brand verification),
  footer. `components/TemplatesEditor.tsx` was found still on the *pre-redesign* styling
  (`bg-white`, `border-gray-200`, old `brand-*` compat classes) during this pass and brought
  current — if anything still looks visually stale elsewhere, it's likely a similarly-missed
  page; the `--color-brand-*` compat aliases in `globals.css` keep old class names from
  breaking, but they won't look like the new design.

## Billing model — no-card freemium, NOT card-required trial (rewritten this session)
The old model (`createBusiness` → Stripe Checkout with `trial_period_days: 7`, card required at
signup) is **gone**. New model:
- **Signup is email-only, no card.** `createBusiness` (`app/actions/business.ts`) inserts the
  business directly with `plan: "free"` — no Stripe call at all. `?plan=&interval=` from the
  pricing cards is preserved (via `businesses.signup_source` jsonb → `intended_plan`/
  `intended_interval`) so the eventual upgrade checkout can default to what they actually picked.
- **First 2 invoices ever (by creation order) are fully functional — armed, email-only.**
  `lib/trial.ts` `isFreeTierInvoiceBlocked(supabase, business, beforeInvoiceCreatedAt?)` derives
  this from real invoice rows (never a stored counter — can't drift, can't be reset by editing
  or deleting an invoice; there's no delete-invoice feature anyway). No timestamp arg = "would a
  new invoice be blocked" (creation time); pass an existing invoice's own `created_at` = "was
  THIS invoice within the free allowance" (used when arming/resuming later).
- **The 3rd+ invoice still gets CREATED** (nothing hidden/lost) but stays unarmed
  (`status: "paused"`) until the business adds a card. Gated at every arm entry point:
  `createInvoice`'s initial arm, `armReminders`'s first-time-arm branch, `setCustomSchedule`'s
  first-time-arm branch — all three call the same derived check. `resumeReminders` was NOT
  separately gated because a UI branch-logic bug was fixed instead (see below) — after the fix,
  `resumeReminders` is only ever reachable for a sequence that already exists (i.e. already
  passed the gate once), so it doesn't need its own check.
- **Real bug fixed in the same pass**: `components/InvoiceActions.tsx`'s button logic showed
  "Resume reminders" for ANY `status === "paused"` invoice, regardless of whether a sequence
  existed — for a never-armed invoice (free-cap-blocked, or an inbound-email invoice pending
  confirmation), clicking it called `resumeReminders`, which no-ops internally (`resumeSequence`
  returns early with no sequence) but STILL flipped status to `"outstanding"` — silently
  creating a "ghost" invoice with no reminders ever running, no error shown. Fixed by keying the
  branch on `status === "paused" && sequenceState` (existing armed-then-paused sequence) instead
  of `status` alone; the no-sequence case now correctly falls to the (gated) "Arm reminders" /
  upgrade-wall branch.
- **The upgrade wall**: `components/InvoiceActions.tsx` shows an inline card
  ("You've used your 2 free invoices...") + a button that calls the EXISTING
  `startSubscription()` (`app/actions/billing.ts`, unchanged) with the business's intended
  plan/interval, `successPath=/invoices/{id}?upgraded=1`. No new Stripe integration — reuses
  the same subscription-checkout path Settings' plan picker already used. Verified live:
  real sandbox Stripe Checkout session opened with correct plan/price prefilled.
- **Both invoice-creation paths gated**: manual/CSV goes through `createInvoice` directly.
  Inbound email-forward (`app/api/inbound/route.ts`) ALSO checks the monthly invoice cap
  (`invoiceLimitFor`) before spending a Claude extraction call, emailing the forwarder a
  friendly "limit reached" notice if blocked — arming itself was already covered since inbound
  invoices always land paused-pending-confirmation and go through the same gated `armReminders`.
- **SMS is free-tier-excluded**: `lib/scheduler.ts`'s channel-resolution logic treats
  `business.plan === "free"` as another reason SMS is unavailable (falls back to email, or skips
  the step if no email either) — reuses the existing opt-out/no-phone fallback logic rather than
  adding a new branch. `remindNow` (manual "Remind now") has the same gate. Never "simulated" —
  it just never attempts SMS for free-tier businesses.
- **Cancellation, Stripe Connect, admin dashboard, AppSumo** — all untouched by this rework.

## Plan limits & metering (finalized this session)
`lib/plans.ts` is the ONLY source for any number shown to a user. Final matrix:

| Plan | Price | Invoices/mo | Included SMS/mo | AI extractions/mo (HIDDEN) |
|------|-------|-------------|------------------|----------------------------|
| Solo | $29   | 30          | 100              | 50                         |
| Crew | $49   | 100         | 300              | 150                        |
| Pro  | $99   | 1,000       | 3,000            | 500                        |

- **Pro's invoice cap is now 1,000/mo, not Unlimited** — a visible pricing-page change, flag it
  if the user expects "Unlimited" copy to still be there.
- **SMS overage**: `SMS_OVERAGE_US_CENTS = 5` ($0.05), `SMS_INTL_OVERAGE_MULTIPLIER = 3` (15¢
  intl) — both in `lib/plans.ts`, shown on every pricing surface via `smsOverageRateDisplay()`.
  Metering lives in `lib/smsUsage.ts` `recordSmsUsage()`, called after every real (`"sent"`,
  never simulated/failed) SMS from the scheduler and manual "Remind now". Usage is DERIVED from
  the `messages` table per billing period (never a stored counter). Billing period = the
  Stripe subscription's `current_period_start` (new column, cached from the subscription
  webhook — the 2026 Stripe API moved this field from the subscription object onto the
  subscription *item*, handle both shapes if touching that webhook code again), falling back to
  calendar month for businesses without a subscription. Past the pack, each SMS creates a
  pending Stripe invoice item (idempotent per message via `idempotencyKey`), swept into the
  next subscription invoice automatically — no Stripe meter/price object needed. Owner gets
  80%/100% usage emails, deduped per threshold per period via an `events` marker written before
  the email. Free tier, lifetime, and expired businesses are excluded from metering entirely.
- **AI extraction cap is a HIDDEN infrastructure guardrail, never a plan feature** —
  `lib/extractionCap.ts` (`import "server-only"` — physically cannot ship to the client bundle;
  verified by grepping the built `.next/static/chunks/*.js` for the identifier, zero hits).
  Counts `extraction_used` events (logged at ATTEMPT time in `/api/extract`, before the Claude
  call — a failed/retried scan still cost real money) per calendar month, composes with the
  existing 30/hr rate limit. When hit, the scan UI (`components/ScanUpload.tsx`) flips to a
  soft-fallback state — "You've used this month's photo scans — CSV import or manual entry, both
  unlimited" — checked server-side on page load so a capped business never even calls the API;
  a stale-tab defense on the API itself returns `{capReached: true}` with no numbers if it is
  called anyway. CSV import and manual entry never touch this counter regardless of volume.
- **Invoice cap enforcement**: unchanged monthly-quota logic in `invoiceLimitFor`, now also
  checked in the inbound email-forward path (see Billing model above).

## Reminder message customization ("Custom" tone — added this session)
`components/TemplatesEditor.tsx` (`/settings/templates`) now has a 4th tone option next to
Friendly/Professional/Firm: **Custom**.
- Selecting Custom is non-destructive — it just tells the system "stop auto-resetting this
  business's wording," touching none of the 5 messages. Selecting a written preset still
  reseeds all 5 (with the existing confirm-before-overwrite dialog).
- **Editing any single message automatically flips the business to Custom** (`updateSequenceStep`
  in `app/actions/business.ts` now also sets `tone: "custom"` on both `businesses` and
  `sequences`) — so Settings never keeps showing "Professional" once the actual wording has been
  hand-edited, and the other 4 messages are never touched by that save.
- `Tone` type (`lib/types.ts`) and both `businesses_tone_check`/`sequences_tone_check` DB
  constraints now include `'custom'`. `lib/templates.ts` `defaultSteps()` takes the narrower
  `PresetTone` type (`Exclude<Tone, "custom">`) since it's only ever called for the 3 written
  presets — "custom" by definition is never reseeded from there.

## Growth instrumentation (viral loop + attribution)
- **Viral loop links**: the email footer ("Sent on behalf of X by PayPigeon" + "Get your
  invoices paid on autopilot →" in `lib/templates.ts` `emailHtml`) and the `/pay/[token]`
  "Reminders powered by PayPigeon" line are clickable, pointing at
  `https://paypigeon.io/?utm_source=paypigeon&utm_medium={email|pay_page}&utm_campaign=...`.
- **First-touch signup attribution**: `middleware.ts` sets a 30-day `pp_attr` cookie (utm_source/
  medium/campaign, external referrer, landing path) on first visit — first touch wins, never
  overwritten. `createBusiness` copies it into `businesses.signup_source` (jsonb), which now
  ALSO carries `intended_plan`/`intended_interval` (see Billing model above) — `sourceFor()` /
  `sourceDetailFor()` in `lib/adminData.ts` still correctly fall through to "direct" for
  businesses with only the intended-plan keys and no UTM data (verified, no admin regression).

## Admin dashboard
`/admin` — internal, staff-only, untouched by this session's redesign/billing work except where
noted. Access checked independently on every page/route, not via `middleware.ts` — non-admin or
logged-out requests 404 (not 403). `admin_users` table, RLS zero-policy service-role-only,
keyed by verified email. Per-business page at `/admin/users/[id]` (plan change, free-until-date,
lifetime tier). All real-data, gaps flagged instead of invented (e.g. AppSumo businesses show
"N/A (AppSumo)" for total paid rather than a fabricated Stripe figure). See git history / ask
the user if you need the full admin build story — it predates this session's work and hasn't
been re-verified against the new palette page-by-page.

## AppSumo lifetime deals (LTD) — feature-flagged OFF
Schema, tiers, redemption action, CLI scripts (`scripts/generate-appsumo-codes.ts`,
`scripts/revoke-appsumo-code.ts`), and admin views all still exist and work — just not reachable
by customers right now (see `APPSUMO_ENABLED` in Hard rules above). `LTD_TIERS` limits in
`lib/plans.ts` are still placeholder numbers, unrelated to this session's finalized Solo/Crew/Pro
matrix — tune them before flipping the flag and going live with an AppSumo listing.

## Stripe Connect — LIVE (activated + configured; first real payment still unverified)
Unchanged this session. `connectStripe()` → Connect Standard hosted onboarding; `/pay/[token]`
gates Pay Now on `stripe_account_id && stripe_charges_enabled`. ⚠️ No real business has completed
live onboarding + received a real payment yet.

## Auth & login
Unchanged this session. Magic link/OTP + Google OAuth, `www→apex` redirect required for OAuth to
work, Google brand verification still pending (cosmetic only meanwhile).

## Testing locally
Dev login: `/api/dev/login?email=demo@paidup.local&password=paidup-demo-2026` (dev builds only).
To simulate a real authenticated user via SQL, insert into `auth.users` with
`instance_id = '00000000-0000-0000-0000-000000000000'` **and all of `confirmation_token`,
`recovery_token`, `email_change`, `email_change_token_new`, `email_change_token_current` set to
`''` (empty string, NOT null)** — a NULL in any of those makes GoTrue's password grant fail with
`"Database error querying schema"` (a real error hit this session; `supabase/demo-user.sql` has
the known-working shape, copy it rather than hand-rolling the insert). Also needs a matching
`auth.identities` row or you get `AuthApiError`/`AuthRetryableFetchError`. **Always clean up test
rows after** (`messages`, `invoice_sequences`, `payments`, `events`, `invoices`, `customers`,
`sequences`, `business_members`, `businesses`, `auth.identities`, `auth.users`, in that FK order)
— this project's Supabase is the SHARED PRODUCTION database, not a local/sandboxed copy; test
data left behind pollutes real dashboards and the live cron will process it for real (a QA pass
this session accidentally triggered a real Resend send attempt against a fake `@example.com`
address via the production cron before cleanup — harmless since it just failed, but a reminder
that anything created here is live the instant it's saved).

Sandbox Stripe artifacts (test customers/prices/products created for local checkout testing) must
also be cleaned up (`stripe.customers.del`, archive prices/products via `active: false` — prices
with usage can't be hard-deleted).

Note: `vercel env pull` returns empty strings for ALL env vars in this sandbox (confirmed
systemic). Don't trust it; get real values from the Vercel dashboard or `vercel env ls` directly.

## Browser preview quirk
Local dev server dies whenever a shell session backing it ends — if a preview looks down,
restart with `nohup npm run dev -- -p 3001 > /tmp/paypigeon-dev.log 2>&1 & disown` (survives
shell exit) from the repo root, then point the Browser pane's `preview_start` at
`http://localhost:3001` directly (skip the `.claude/launch.json` TCP-proxy config entirely if
just doing a plain `url` preview_start — the proxy is only needed if using
`preview_start {name:...}`). A production `npm run build` overwrites `.next` and crashes any dev
server already using it (`ENOENT ... _buildManifest.js.tmp`) — `rm -rf .next` and restart after
any production build. Also observed this session: the Browser pane's accessibility-tree
(`read_page`) and screenshot capture both intermittently glitch (empty tree, blank/duplicate
frames) right after a `navigate` call on this project — falling back to `get_page_text` for
content checks and direct DOM manipulation via `javascript_tool` (native property setters +
dispatched events for React-controlled inputs/selects) worked reliably as a workaround.

## Deployment
- **Vercel project:** `paypigeon`, team `dahanked-8602s-projects` (different account from the
  "Lucas' projects" team the Vercel MCP connector sees — connector can't manage this project;
  use the `vercel` CLI, authenticated locally as `dahanked-8602`).
- **GitHub:** `github.com/dahaninc/Pay`, branch `main` — but **nothing has been pushed/committed
  this session or several before it** (see the warning at the top of this file). `vercel deploy
  --prod --yes` is what's actually been used for every deploy; it ships the current working tree
  regardless of git state.
- **Live URL:** `https://paypigeon.io`. `NEXT_PUBLIC_APP_URL` must stay `https://paypigeon.io` —
  it's gone stale before (pointed at old `.vercel.app`) and broken pay-links in real SMS.
- **Domain registrar:** Spaceship. Root domain has a pre-existing Spacemail mailbox — never
  overwrite root MX records; reply-to-platform uses `reply.paypigeon.io` instead.
- **After any env var change:** must redeploy for it to take effect.

## Email system
Unchanged this session. Resend on `paypigeon.io` (sending) + `reply.paypigeon.io` (sending +
receiving). Supabase Auth SMTP routes through Resend. Reply-to-platform via
`reply+<invoiceId>@reply.paypigeon.io`, Svix-signature-verified. Owner BCC'd on outbound
reminders. SMS layout (signature + opt-out) applied at send time in `finalizeSms()`, never
stored in templates — survives the new "Custom" tone's hand-edited wording untouched.

## SMS system
Unchanged this session except metering (see Plan limits above). Telnyx for sending, domestic vs
Alphanumeric Sender ID international routing via `isDomesticSms()`. ⚠️ US 10DLC campaign
registration still pending Telnyx Brand approval — blocks real-volume US SMS until done.

## Failed-send visibility ("never fail silently")
Unchanged this session. Owner email on failed scheduled send (deduped per invoice+channel),
bounce handling flags the customer + notifies, dashboard advisor card + digest line, Svix-signed
delivery-events webhook.

## Security (audited previously, still holds)
`/api/inbound` Svix-verified, security headers set, `/api/extract` rate-limited (now also capped
monthly, see Plan limits), crons fail closed on missing `CRON_SECRET`, cross-tenant RLS
attack-tested clean. If you find another live-production security issue: identify exact
exploitability, ship the fix, don't just note it.

## Environment variables (Vercel production) — confirmed set
Unchanged this session — see git history for the full table if needed, or `vercel env ls`.
Notable: `STRIPE_PRICE_{SOLO,CREW,PRO}[_YEARLY]` are no longer read at signup (no-card model) —
only used when a business actually upgrades (invoice-#3 wall or Settings plan picker).

## Pending (not yet done) — the launch checklist, none of it is code

Every remaining item is a third-party/dashboard/human/legal task, or a decision only the user
can make:

1. **Testimonials & trusted-by logos** — sections built and deployed, deliberately empty. Needs
   real quotes + real consent from actual PayPigeon users, or real customer logos with
   permission. See the hard rule above for exactly why the prototype's placeholder content
   can't be used as-is.
2. **Nothing committed to git** — see the warning at the top of this file. Ask before assuming
   any destructive git operation is safe; there's no history to recover from yet.
3. **Telnyx 10DLC campaign registration** — Brand submitted, in review. Once approved: create
   the Campaign ("Account Notifications" or "Mixed", not "Marketing") and link it to the
   messaging profile. Blocks real-volume US SMS.
4. **Lawyer review of /terms + /privacy** — more relevant now than before: pricing terms changed
   (no-card free tier, metered SMS overage at $0.05/$0.15) and the wording needs to reflect that
   accurately, on top of the pre-existing TCPA/debt-collection-adjacent review need.
5. **First real Stripe Connect payment** — sandbox-verified only; run one real business through
   live Connect onboarding + a real payment before promoting "get paid online".
6. **Google OAuth brand verification** — waiting on Google, cosmetic only meanwhile.
7. **AppSumo LTD tier limits** — still placeholders; decide real numbers before flipping
   `APPSUMO_ENABLED` and launching the listing.
8. **Re-verify dark mode + every app page against the new palette individually** — the redesign
   pass covered landing, dashboard, invoices, settings, and templates explicitly; anything not
   named in this file may still be on old styling (compat CSS aliases keep it from breaking,
   just not matching the new look).
