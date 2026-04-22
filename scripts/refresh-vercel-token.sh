#!/bin/zsh

# Refresh Vercel OIDC token and push to apps/web/.env.local
# Run from the main repo root

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Pulling fresh Vercel env..."
vc env pull "$REPO_ROOT/.env.local" --cwd "$REPO_ROOT"

if [[ -f "$REPO_ROOT/apps/web/.env.local" ]]; then
  grep -v "^VERCEL_OIDC_TOKEN=" "$REPO_ROOT/apps/web/.env.local" > "$REPO_ROOT/apps/web/.env.local.tmp" || true
  mv "$REPO_ROOT/apps/web/.env.local.tmp" "$REPO_ROOT/apps/web/.env.local"
  grep "^VERCEL_OIDC_TOKEN=" "$REPO_ROOT/.env.local" >> "$REPO_ROOT/apps/web/.env.local"
  echo "✓ Updated apps/web/.env.local"
fi

echo "Done!"
