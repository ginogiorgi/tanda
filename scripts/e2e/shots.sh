#!/usr/bin/env bash
# Capturas de revisión visual (390×844 y 1440×900) contra el Supabase LOCAL. Reusa el entorno de
# `flow.sh` (aborta si la API no es local). Las PNG quedan en `SHOTS_DIR` (default: artifacts/shots).
#
#   pnpm e2e:stack && bash scripts/e2e/shots.sh [filtro]       # E2E_SKIP_BUILD=1 reusa el .next
set -euo pipefail
cd "$(dirname "$0")/../.."
export SHOTS_DIR="${SHOTS_DIR:-$PWD/artifacts/shots}"
mkdir -p "$SHOTS_DIR"
E2E_CONFIG=playwright.shots.config.ts exec bash scripts/e2e/flow.sh "$@"
