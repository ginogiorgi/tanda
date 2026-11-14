#!/usr/bin/env bash
# E2E del flujo de juego (invitado → sala → partido) contra el Supabase LOCAL. NUNCA contra prod:
# crea usuarios reales. Las variables de abajo pisan a `.env.local` (que apunta a prod) tanto en el
# build como en `next start`, y el script aborta si la API no es local.
#
#   pnpm e2e:stack && pnpm db:reset   # Supabase local con auth + realtime + cron
#   pnpm test:e2e:flow
#
# Deja `.next` construido contra la DB local: correr `pnpm build` antes de usarlo para otra cosa.
set -euo pipefail
cd "$(dirname "$0")/../.."

env_out="$(pnpm exec supabase status -o env 2>/dev/null)" || { echo "✗ Supabase local no está corriendo (pnpm e2e:stack)"; exit 1; }
get() { printf '%s\n' "$env_out" | sed -n "s/^$1=\"\(.*\)\"$/\1/p"; }
api="$(get API_URL)"
case "$api" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "✗ API_URL no es local ($api): el e2e de flujo nunca corre contra prod"; exit 1 ;;
esac
curl -fsS -o /dev/null "$api/auth/v1/health" -H "apikey: $(get PUBLISHABLE_KEY)" \
  || { echo "✗ auth local no responde: levantá el stack completo con pnpm e2e:stack"; exit 1; }

export NEXT_PUBLIC_SUPABASE_URL="$api"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(get PUBLISHABLE_KEY)"
export SUPABASE_SECRET_KEY="$(get SECRET_KEY)"
export NEXT_PUBLIC_SITE_URL="http://localhost:3101"
export RESEND_API_KEY=""
export E2E_FLOW=1

pnpm build
pnpm exec playwright test --config playwright.flow.config.ts "$@"
