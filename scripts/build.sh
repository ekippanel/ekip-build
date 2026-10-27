#!/usr/bin/env bash
# Projeyi derler: out/test (test adresi), out/live (onaylanınca canlıya gidecek kopya).
# Bu adım GİZLİ ANAHTAR OLMADAN çalışır; projenin kendi derleme betikleri burada koşar.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(pwd)"
OUT="$ROOT/out"
rm -rf "$OUT"
mkdir -p "$OUT/test" "$OUT/live"

P="${SITE_PATH:-}"
BASE="/"
[ -n "$P" ] && BASE="/$P/"

LOG="$ROOT/build.log"
quiet() {
  # Derleme çıktısı herkese açık günlükte görünmesin; hata olursa son satırlar basılır.
  if ! "$@" >> "$LOG" 2>&1; then
    echo "::error::Derleme adımı başarısız: $1"
    tail -n 40 "$LOG" | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/***/g'
    exit 1
  fi
}

spa_copy() {
  cp "$1/index.html" "$1/404.html" 2> /dev/null || true
}

case "$KIND" in
  flutter)
    cd "$ROOT/src"
    if [ -n "${ENV_B64:-}" ]; then
      echo "$ENV_B64" | base64 -d > .env
    elif [ ! -f .env ] && [ -f .env.example ]; then
      cp .env.example .env
    fi
    quiet flutter pub get
    quiet flutter build web --release --no-web-resources-cdn --base-href "${BASE}test/" --dart-define=PREVIEW=1 -o "$OUT/test"
    quiet flutter build web --release --no-web-resources-cdn --base-href "$BASE" -o "$OUT/live"
    spa_copy "$OUT/test"
    spa_copy "$OUT/live"
    ;;

  node)
    cd "$ROOT/src"
    if [ -f package-lock.json ]; then quiet npm ci; else quiet npm install; fi
    export PUBLIC_URL=.
    if ! npm run build -- --base=./ >> "$LOG" 2>&1; then
      quiet npm run build
    fi
    SRC_DIR=""
    for d in dist build out public; do
      if [ -f "$d/index.html" ]; then SRC_DIR="$d"; break; fi
    done
    [ -n "$SRC_DIR" ] || { echo "::error::Derleme bitti ama index.html bulunamadı (dist/, build/, out/, public/)"; exit 1; }
    rsync -a --exclude .git --exclude node_modules "$SRC_DIR"/ "$OUT/test"/
    rsync -a "$OUT/test"/ "$OUT/live"/
    ;;

  static)
    cd "$ROOT/src"
    SRC_DIR=""
    for d in dist public web build docs site _site out .; do
      if [ -f "$d/index.html" ]; then SRC_DIR="$d"; break; fi
    done
    # Kökteki index.html: depo olduğu gibi kopyalanır (.git, .github, node_modules hariç; kendi içine kopyalanmaz).
    rsync -a --exclude .git --exclude .github --exclude node_modules "$SRC_DIR"/ "$OUT/test"/
    rsync -a "$OUT/test"/ "$OUT/live"/
    ;;

  media)
    cd "$ROOT"
    if [ "${MODE:-}" = "web" ] && [ -f auto_files.json ]; then
      export FILES="$(cat auto_files.json)"
    fi
    python3 "$HERE/media.py"
    rsync -a "$OUT/test"/ "$OUT/live"/
    ;;

  *)
    echo "::error::Bilinmeyen tür: $KIND"
    exit 1
    ;;
esac

echo "$SRC_SHA" > "$OUT/live/.ekip-sha"
echo "Derleme tamam ($KIND)"
