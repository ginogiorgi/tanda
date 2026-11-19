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
export E2E_FLOW_PORT="${E2E_FLOW_PORT:-3101}"
export NEXT_PUBLIC_SITE_URL="http://localhost:$E2E_FLOW_PORT"
export RESEND_API_KEY=""
export E2E_DB_URL="$(get DB_URL)"   # solo el test (lee la correcta en champion.spec)
export E2E_FLOW=1

# `E2E_CONFIG` elige la config de Playwright (las capturas usan `playwright.shots.config.ts`) y
# `E2E_SKIP_BUILD=1` reusa el `.next` ya construido contra la DB local.
if [ "${E2E_SKIP_BUILD:-}" = "1" ]; then
  # 19/11: un `pnpm build` suelto (env de prod) + E2E_SKIP_BUILD=1 mandó el flujo contra PROD. Solo se reusa
  # el `.next` si su bundle de cliente apunta a ESTA API local; si no, se reconstruye.
  if ! grep -rqF "$api" .next/static/chunks 2>/dev/null; then
    echo "⚠ .next no apunta a $api (¿build de prod?): reconstruyo contra la DB local"
    pnpm build
  fi
else
  pnpm build
fi
pnpm exec playwright test --config "${E2E_CONFIG:-playwright.flow.config.ts}" "$@"
