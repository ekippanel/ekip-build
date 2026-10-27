#!/usr/bin/env bash
# Derlemeyi siteye yazar: <yol>/test (yeni), <yol>/prev (bir önceki test), <yol>/_staged (onay bekleyen canlı kopya).
# Proje kodu burada çalıştırılmaz; yalnızca dosya kopyalanır.
set -euo pipefail

if [ "$SITE" = "main" ]; then SITE_REPO="$MAIN_SITE_REPO"; else SITE_REPO="$PREVIEW_SITE_REPO"; fi
[ -n "$SITE_REPO" ] && [ "$SITE_REPO" != "ekippanel-onizleme/ekippanel-onizleme.github.io" ] || { echo "::error::Önizleme sitesi ayarlı değil"; exit 1; }

git clone -q --depth 1 "https://x-access-token:${TOKEN}@github.com/${SITE_REPO}.git" site
P="${SITE_PATH:-}"
case "$P" in *..*) echo "::error::Geçersiz yol"; exit 1 ;; esac
ROOT="site${P:+/$P}"
mkdir -p "$ROOT"

PREV=""
if [ -d "$ROOT/test" ]; then
  rm -rf "$ROOT/prev"
  mv "$ROOT/test" "$ROOT/prev"
  PREV=1
fi
rm -rf "$ROOT/_staged"
mkdir -p "$ROOT/test" "$ROOT/_staged"
cp -r out/test/. "$ROOT/test/"
cp -r out/live/. "$ROOT/_staged/"
touch site/.nojekyll

cd site
git config user.name "ekip-panel-bot"
git config user.email "bot@ekippanel.local"
git add -A
git commit -q -m "test: ${SRC_REPO}@${SRC_SHA:0:7}" || echo "değişiklik yok"
for i in 1 2 3 4 5 6; do
  if git push -q; then break; fi
  [ "$i" = 6 ] && { echo "::error::Siteye yazılamadı"; exit 1; }
  sleep $((i * 4))
  git pull -q --rebase || { git rebase --abort || true; echo "::error::Aynı projede eş zamanlı derleme çakıştı"; exit 1; }
done
echo "prev=$PREV" >> "$GITHUB_OUTPUT"
