#!/bin/sh
set -eu

repository_root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repository_root"

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' "Node.js >=22.5.0 is required." >&2
  exit 1
fi

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 5) ? 0 : 1)' || {
  printf '%s\n' "Node.js >=22.5.0 is required (found $(node --version))." >&2
  exit 1
}

if ! command -v git >/dev/null 2>&1; then
  printf '%s\n' "Git is required." >&2
  exit 1
fi

if [ ! -x node_modules/.bin/tsx ]; then
  printf '%s\n' "Installing workspace dependencies..."
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install --frozen-lockfile
  elif command -v corepack >/dev/null 2>&1; then
    corepack pnpm install --frozen-lockfile
  else
    printf '%s\n' "pnpm 11 or Corepack is required to install workspace dependencies." >&2
    exit 1
  fi
fi

exec node_modules/.bin/tsx examples/smoke-demo/run.ts
