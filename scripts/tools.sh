#!/usr/bin/env bash
# Yalnızca gereken dönüştürme araçlarını kurar.
set -euo pipefail

if [ -n "${NEED_FFMPEG:-}" ] || [ -n "${NEED_MAGICK:-}" ]; then
  PKGS=""
  [ -n "${NEED_FFMPEG:-}" ] && ! command -v ffmpeg > /dev/null && PKGS="$PKGS ffmpeg"
  [ -n "${NEED_MAGICK:-}" ] && ! command -v convert > /dev/null && ! command -v magick > /dev/null && PKGS="$PKGS imagemagick"
  if [ -n "$PKGS" ]; then
    sudo apt-get update -qq
    # shellcheck disable=SC2086
    sudo apt-get install -y -qq $PKGS > /dev/null
  fi
fi

if [ -n "${NEED_BLENDER:-}" ]; then
  V=4.2.3
  curl -fsSL "https://download.blender.org/release/Blender4.2/blender-${V}-linux-x64.tar.xz" -o /tmp/blender.tar.xz
  mkdir -p /opt/blender
  tar -xf /tmp/blender.tar.xz -C /opt/blender --strip-components=1
  sudo apt-get install -y -qq libxi6 libxkbcommon0 libsm6 libgl1 > /dev/null || true
  echo "/opt/blender" >> "$GITHUB_PATH"
fi

if [ -n "${NEED_GDOWN:-}" ]; then
  pip install -q gdown==5.2.0
fi
