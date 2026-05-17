#!/bin/bash
# UniHub Workshop — Database setup helper
# Usage: bash data/setup.sh  (run from repo root)

set -e

echo "📦  Installing dependencies..."
pnpm install

echo "🗄   Running database migrations..."
pnpm --filter=server db:migrate

echo "🌱  Seeding demo data..."
pnpm db:seed

echo ""
echo "✅  Database ready."
echo "    See data/README.md for default accounts and test credentials."
