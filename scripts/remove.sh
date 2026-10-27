#!/usr/bin/env bash
# Askıya alınan projenin önizleme klasörünü siteden kaldırır. Ana sitenin köküne asla dokunmaz.
set -euo pipefail

P="${SITE_PATH:-}"
[ -n "$P" ] || { echo "::error::Kök klasör kaldırılamaz"; exit 1; }
case "$P" in *..*|/*) echo "::error::Geçersiz yol"; exit 1 ;; esac
if [ "$SITE" = "main" ]; then SITE_REPO="$MAIN_SITE_REPO"; else SITE_REPO="$PREVIEW_SITE_REPO"; fi
git clone -q --depth 1 "https://x-access-token:${TOKEN}@github.com/${SITE_REPO}.git" site
[ -d "site/$P" ] || { echo "Klasör zaten yok"; exit 0; }
rm -rf "site/$P"
cd site
git config user.name "ekip-panel-bot"
git config user.email "bot@ekippanel.local"
git add -A
git commit -q -m "kaldırıldı: ${SRC_REPO}" || exit 0
for i in 1 2 3 4 5; do
  git push -q && exit 0
  sleep $((i * 4))
  git pull -q --rebase || { git rebase --abort || true; exit 1; }
done
exit 1
