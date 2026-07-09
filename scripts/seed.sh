#!/usr/bin/env bash
# Alias de seed-env.sh — mismo flujo que otras apps Renace:
#   .evolution.local + scripts/seed.local.sh → /etc/rnv-manager/rnv.env → .env
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$ROOT/scripts/seed-env.sh" "$@"
