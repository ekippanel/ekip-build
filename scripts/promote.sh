#!/usr/bin/env bash
# Onay: <yol>/_staged içeriği canlı klasöre taşınır (test, prev, _staged, p ve site dosyaları korunur).
set -euo pipefail

if [ "$SITE" = "main" ]; then SITE_REPO="$MAIN_SITE_REPO"; else SITE_REPO="$PREVIEW_SITE_REPO"; fi
git clone -q --depth 1 "https://x-access-token:${TOKEN}@github.com/${SITE_REPO}.git" site
P="${SITE_PATH:-}"
case "$P" in *..*) echo "::error::Geçersiz yol"; exit 1 ;; esac
ROOT="site${P:+/$P}"
S="$ROOT/_staged"
[ -d "$S" ] || { echo "::error::Onay bekleyen test derlemesi yok"; exit 1; }
SHA="$(cat "$S/.ekip-sha" 2> /dev/null || echo "")"

(cd "$ROOT" && find . -mindepth 1 -maxdepth 1 ! -name test ! -name prev ! -name _staged ! -name p ! -name .git \
  ! -name .nojekyll ! -name CNAME -exec rm -rf {} +)
cp -r "$S"/. "$ROOT"/
rm -f "$ROOT/.ekip-sha"
touch site/.nojekyll

cd site
git config user.name "ekip-panel-bot"
git config user.email "bot@ekippanel.local"
git add -A
git commit -q -m "canlı: ${SRC_REPO}@${SHA:0:7}" || echo "değişiklik yok"
for i in 1 2 3 4 5 6; do
  if git push -q; then break; fi
  [ "$i" = 6 ] && { echo "::error::Siteye yazılamadı"; exit 1; }
  sleep $((i * 4))
  git pull -q --rebase || { git rebase --abort || true; exit 1; }
done
echo "sha=$SHA" >> "$GITHUB_OUTPUT"
