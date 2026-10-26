#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-}" in
  install) exec bash scripts/with-node24.sh pnpm install --frozen-lockfile ;;
  build)
    bash scripts/with-node24.sh pnpm build:web
    exec bash scripts/with-node24.sh node scripts/verify-makers-output.mjs
    ;;
  *) echo 'Usage: bash scripts/makers.sh install|build' >&2; exit 1 ;;
esac
