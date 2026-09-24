#!/usr/bin/env bash
# Builds dist/ and publishes it to the gh-pages branch, which GitHub Pages serves at
# https://elzuzu.github.io/fasttracker2-web/. The branch holds a single commit, replaced on each
# publish, so the repository history doesn't pile up WebAssembly binaries.
# .github/workflows/pages.yml does the same on every push to main, when GitHub Actions is available.
set -euo pipefail
cd "$(dirname "$0")"

./build.sh

REV="$(git rev-parse --short HEAD)"
REMOTE="$(git remote get-url origin)"
SITE="$(mktemp -d)"
trap 'rm -rf "$SITE"' EXIT

cp -R dist/. "$SITE/"
touch "$SITE/.nojekyll"
git -C "$SITE" init -q -b gh-pages
git -C "$SITE" add -A
git -C "$SITE" commit -q -m "Built site from main@$REV"
git -C "$SITE" push -q -f "$REMOTE" gh-pages

echo "Published main@$REV to gh-pages"
