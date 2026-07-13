#!/bin/bash
# Interactive: sets every production env var for the linked Vercel project, starting with Supabase.
#
# Run from the project root:  bash scripts/add-vercel-env.sh
# Values never touch chat — you type them straight into this terminal.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .vercel/project.json ]]; then
  echo "✗ Not linked to a Vercel project yet. Run: vercel link"
  exit 1
fi

add_var() {
  local name="$1" hint="$2" required="${3:-optional}" hidden="${4:-hide}"
  echo ""
  echo "── $name ──"
  echo "  $hint"
  if [[ "$hidden" == "hide" ]]; then
    read -rsp "  Value (leave blank to skip): " value
    echo ""
  else
    read -rp "  Value (leave blank to skip): " value
  fi
  if [[ -z "$value" ]]; then
    if [[ "$required" == "required-for-feature" ]]; then
      echo "  ⏭  skipped — that feature stays simulated until you add this"
    else
      echo "  ⏭  skipped"
    fi
    return
  fi
  # remove any existing value first so this is safe to re-run
  vercel env rm "$name" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$name" production >/dev/null
  echo "  ✓ set in Vercel (production)"
}

echo "── PayPigeon ▸ set production env vars on Vercel ─────────────────"
echo "Paste values from each provider's dashboard. Press Enter to skip any you don't have yet —"
echo "that feature just stays in simulated/demo mode until you come back and add it."

echo ""
echo "═══ Supabase ═══"

add_var "NEXT_PUBLIC_SUPABASE_URL" \
  "Supabase Dashboard → Settings → API → Project URL (https://<ref>.supabase.co). Public — safe to show." \
  required not-hidden

add_var "NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  "Supabase Dashboard → Settings → API keys → the publishable/anon key (sb_publishable_... or the legacy anon JWT). Public — safe to show." \
  required not-hidden

add_var "SUPABASE_SECRET_KEY" \
  "Supabase Dashboard → Settings → API keys → create/copy the SECRET key (not anon/publishable). Required for cron sends, webhooks, inbound email. Keep this hidden." \
  required-for-feature

echo ""
echo "═══ App config ═══"

add_var "NEXT_PUBLIC_APP_URL" \
  "Your production URL, e.g. https://paypigeon.vercel.app (or https://www.paypigeon.io once the domain is live)." \
  required not-hidden

add_var "PAYPIGEON_FROM_EMAIL" \
  "The reminder-sending address, e.g. PayPigeon <reminder@paypigeon.io>." \
  required not-hidden

echo ""
echo "── CRON_SECRET ──"
echo "  Protects /api/cron/* from being called by strangers. Generating a fresh random one automatically."
CRON_VALUE=$(openssl rand -hex 32)
vercel env rm CRON_SECRET production --yes >/dev/null 2>&1 || true
printf '%s' "$CRON_VALUE" | vercel env add CRON_SECRET production >/dev/null
echo "  ✓ set in Vercel (production): $CRON_VALUE"
echo "  (save this somewhere if you ever need to call a cron endpoint manually)"

echo ""
echo "═══ Email (Resend) ═══"

add_var "RESEND_API_KEY" \
  "resend.com/api-keys → Create API Key." \
  required-for-feature

echo ""
echo "═══ AI extraction (Anthropic) ═══"

add_var "ANTHROPIC_API_KEY" \
  "console.anthropic.com → API Keys → Create Key. Needed for photo/PDF/email invoice extraction." \
  required-for-feature

echo ""
echo "═══ SMS (Telnyx) ═══"

add_var "TELNYX_API_KEY" \
  "Telnyx Dashboard → API Keys → retrieve your auth key." \
  required-for-feature

add_var "TELNYX_PUBLIC_KEY" \
  "Telnyx Dashboard → API Keys → Public Key. Used to verify inbound webhook signatures." \
  required-for-feature

add_var "TELNYX_MESSAGING_PROFILE_ID" \
  "Telnyx Dashboard → Messaging Suite → Programmable Messaging → your profile → the UUID at the top." \
  required-for-feature

add_var "TELNYX_FROM_NUMBER" \
  "Telnyx Dashboard → Numbers → My Numbers → your purchased number, E.164 format e.g. +15551234567." \
  required-for-feature

echo ""
echo "═══ Payments (Stripe) ═══"

add_var "STRIPE_SECRET_KEY" \
  "Stripe Dashboard → Developers → API keys → Secret key (sk_test_... or sk_live_...)." \
  required-for-feature

add_var "STRIPE_PRICE_SOLO" \
  "Stripe Dashboard → Product catalog → Solo product → Price ID (price_...)." \
  required-for-feature

add_var "STRIPE_PRICE_CREW" \
  "Stripe Dashboard → Product catalog → Crew product → Price ID (price_...)." \
  required-for-feature

add_var "STRIPE_PRICE_PRO" \
  "Stripe Dashboard → Product catalog → Pro product → Price ID (price_...)." \
  required-for-feature

echo ""
echo "── STRIPE_WEBHOOK_SECRET ──"
echo "  This one needs your live URL first. In Stripe Dashboard → Developers → Webhooks → Add endpoint:"
echo "    URL:    https://paypigeon.vercel.app/api/webhooks/stripe"
echo "    Events: checkout.session.completed, account.updated, customer.subscription.*"
echo "  Then copy the 'Signing secret' (whsec_...) it gives you."
read -rsp "  Value (leave blank to skip): " whsec
echo ""
if [[ -n "$whsec" ]]; then
  vercel env rm STRIPE_WEBHOOK_SECRET production --yes >/dev/null 2>&1 || true
  printf '%s' "$whsec" | vercel env add STRIPE_WEBHOOK_SECRET production >/dev/null
  echo "  ✓ set in Vercel (production)"
else
  echo "  ⏭  skipped"
fi

echo ""
echo "── Done ──"
echo "Redeploying so the new variables take effect…"
vercel deploy --prod --yes

echo ""
echo "Re-run this script anytime to add whatever you skipped — it's safe to run repeatedly."
