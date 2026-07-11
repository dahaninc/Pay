#!/bin/bash
# Interactive: points both PaidUp app copies at a Supabase project.
# Run:  bash scripts/connect-supabase.sh
set -euo pipefail

APPS=(
  "/Users/yos/Desktop/paydup/paidup"
  "/Users/yos/Desktop/design 1/paidup"
)

echo "── PaidUp ▸ connect to Supabase ──────────────────────────"
echo "Find both values in the project dashboard → Settings → API keys"
echo ""

DEFAULT_URL="https://sxufwgdlxtyobncjutdv.supabase.co"
read -rp "Project URL [press Enter for $DEFAULT_URL]: " URL
URL="${URL:-$DEFAULT_URL}"
URL="${URL%/}"
if [[ ! "$URL" =~ ^https://[a-z0-9]+\.supabase\.co$ ]]; then
  echo "✗ That doesn't look like a Supabase project URL. Expected https://<ref>.supabase.co"
  exit 1
fi

read -rp "Publishable key (sb_publishable_...): " KEY
if [[ ! "$KEY" =~ ^sb_publishable_ ]]; then
  echo "✗ That doesn't look like a publishable key (must start with sb_publishable_)."
  echo "  Never use the sb_secret_ key here."
  exit 1
fi

for APP in "${APPS[@]}"; do
  ENVFILE="$APP/.env.local"
  if [[ ! -f "$ENVFILE" ]]; then
    echo "· skipping $APP (no .env.local)"
    continue
  fi
  sed -i '' \
    -e "s|^NEXT_PUBLIC_SUPABASE_URL=.*|NEXT_PUBLIC_SUPABASE_URL=$URL|" \
    -e "s|^NEXT_PUBLIC_SUPABASE_ANON_KEY=.*|NEXT_PUBLIC_SUPABASE_ANON_KEY=$KEY|" \
    "$ENVFILE"
  echo "✓ updated $ENVFILE"
done

echo ""
echo "Checking the project is reachable…"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "apikey: $KEY" "$URL/rest/v1/" || true)
if [[ "$STATUS" == "200" ]]; then
  echo "✓ Supabase project responds (HTTP $STATUS)"
else
  echo "⚠ Project responded with HTTP $STATUS — double-check the URL/key"
fi

echo ""
echo "Done. Remaining one-time steps in the Supabase dashboard:"
echo "  1. SQL Editor → paste supabase/schema.sql → Run   (tables + RLS)"
echo "  2. Optional demo login: SQL Editor → paste supabase/demo-user.sql → Run"
echo "Then restart the dev server."
