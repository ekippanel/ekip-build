#!/usr/bin/env python3
"""Derleme türünü bulur ve gereken araçları söyler (GITHUB_OUTPUT satırları basar).

web modunda: pubspec.yaml → flutter, package.json + build betiği → node, index.html → static,
hiçbiri yoksa depodaki önizlenebilir dosyalardan galeri (media).
media modunda: seçilen dosyaların uzantısına göre Blender / FFmpeg / ImageMagick / gdown gerekir.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from media_types import BLENDER_EXT, FFMPEG_EXT, MAGICK_EXT, kind_of  # noqa: E402

SRC = "src"
mode = os.environ.get("MODE", "web")


def out(key, value):
    print(f"{key}={value}")


def find_index():
    for d in ("dist", "public", "web", "build", "docs", "site", "_site", "out", "."):
        if os.path.isfile(os.path.join(SRC, d, "index.html")):
            return d
    return None


def scan_previewable(limit=60):
    found = []
    for root, dirs, files in os.walk(SRC):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("node_modules", "build", "dist", "__pycache__")]
        for f in files:
            rel = os.path.relpath(os.path.join(root, f), SRC).replace("\\", "/")
            if kind_of(rel) not in (None, "html"):
                found.append(rel)
            if len(found) >= limit:
                return found
    return found


kind = "media"
files = []
if mode == "web":
    if os.path.isfile(os.path.join(SRC, "pubspec.yaml")):
        kind = "flutter"
    elif os.path.isfile(os.path.join(SRC, "package.json")):
        try:
            pkg = json.load(open(os.path.join(SRC, "package.json"), encoding="utf-8"))
        except Exception:
            pkg = {}
        kind = "node" if "build" in (pkg.get("scripts") or {}) else ("static" if find_index() else "media")
    elif find_index():
        kind = "static"
    if kind == "media":
        files = scan_previewable()
        with open("auto_files.json", "w", encoding="utf-8") as fh:
            json.dump(files, fh)
else:
    try:
        files = json.loads(os.environ.get("FILES") or "[]")
    except Exception:
        files = []

exts = {os.path.splitext(f)[1].lower() for f in files if isinstance(f, str)}
try:
    links = json.loads(os.environ.get("LINKS") or "[]")
except Exception:
    links = []
need_gdown = any("drive.google.com" in str((l or {}).get("url", "")) for l in links if isinstance(l, dict))

out("kind", kind)
out("need_blender", "1" if exts & BLENDER_EXT else "")
out("need_ffmpeg", "1" if (exts & FFMPEG_EXT) or need_gdown else "")
out("need_magick", "1" if exts & MAGICK_EXT else "")
out("need_gdown", "1" if need_gdown else "")
