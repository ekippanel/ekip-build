#!/usr/bin/env python3
"""Seçilen dosyaları tarayıcıda açılır biçime çevirir ve görüntüleyici sayfasını yazar.

Girdi (ortam): FILES (JSON yol listesi, src/ içinde), LINKS (JSON [{url, title}]), TITLE, SRC_REPO, SRC_SHA, PANEL_ORIGIN
Çıktı: out/test/index.html + viewer.js + viewer.css + manifest.json + media/*
"""
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(__file__))
from media_types import BLENDER_EXT, MAGICK_EXT, kind_of  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath("src")
OUT = os.path.abspath(os.path.join("out", "test"))
MEDIA = os.path.join(OUT, "media")
MAX_BYTES = 1_500_000_000
os.makedirs(MEDIA, exist_ok=True)

warnings = []
items = []


def run(cmd, timeout=1800):
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
    if r.returncode != 0:
        tail = r.stdout.decode("utf-8", "replace")[-1500:]
        raise RuntimeError(tail)


def safe_name(rel, ext=None):
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", rel.replace("/", "__"))[:120]
    if ext:
        base = os.path.splitext(base)[0] + ext
    return base


def magick():
    return shutil.which("magick") or shutil.which("convert")


def add(kind, rel, src_rel, title=None, poster=None, size=None, extra=None):
    item = {
        "id": f"i{len(items) + 1}",
        "type": kind,
        "title": title or os.path.basename(rel),
        "original": rel,
        "src": src_rel,
    }
    if poster:
        item["poster"] = poster
    if size is not None:
        item["size"] = size
    if extra:
        item.update(extra)
    items.append(item)


def process_file(rel, abs_path, title=None):
    kind = kind_of(rel)
    ext = os.path.splitext(rel)[1].lower()
    size = os.path.getsize(abs_path)
    if size > MAX_BYTES:
        warnings.append(f"{rel}: çok büyük ({size // 1_000_000} MB), atlandı")
        return
    if kind is None:
        warnings.append(f"{rel}: önizlenemeyen tür")
        return

    if kind == "model":
        out_name = safe_name(rel, ".glb")
        dst = os.path.join(MEDIA, out_name)
        if ext == ".glb":
            shutil.copy2(abs_path, dst)
        elif ext == ".gltf":
            # .gltf yanındaki .bin ve dokularla gelir: klasörü kopyala
            folder = safe_name(rel + "_dir")
            shutil.copytree(os.path.dirname(abs_path), os.path.join(MEDIA, folder), dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns(".git", "node_modules"))
            add("model", rel, f"media/{folder}/{os.path.basename(rel)}", title, size=size)
            return
        elif ext in BLENDER_EXT:
            if not shutil.which("blender"):
                warnings.append(f"{rel}: Blender kurulamadı, dönüştürülmedi")
                return
            script = os.path.join(HERE, "blender_export.py")
            if ext == ".blend":
                cmd = ["blender", "-b", abs_path, "--disable-autoexec", "--python-exit-code", "1", "--python", script, "--", dst]
            else:
                cmd = ["blender", "-b", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1", "--python", script, "--", dst, abs_path]
            try:
                run(cmd, timeout=1200)
            except Exception as e:  # noqa: BLE001
                warnings.append(f"{rel}: Blender dönüştürmesi başarısız ({str(e)[-200:]})")
                return
        add("model", rel, f"media/{out_name}", title, size=os.path.getsize(dst), extra={"converted": ext != ".glb"})
        return

    if kind == "video":
        out_name = safe_name(rel, ".mp4")
        dst = os.path.join(MEDIA, out_name)
        poster = safe_name(rel, ".jpg")
        try:
            run(["ffmpeg", "-y", "-loglevel", "error", "-i", abs_path,
                 "-vf", "scale='min(1920,iw)':-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                 "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", dst])
            run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "1", "-i", dst, "-frames:v", "1", "-vf", "scale=960:-2",
                 os.path.join(MEDIA, poster)])
        except Exception as e:  # noqa: BLE001
            if ext in (".mp4", ".webm") and not os.path.exists(dst):
                shutil.copy2(abs_path, os.path.join(MEDIA, safe_name(rel)))
                add("video", rel, f"media/{safe_name(rel)}", title, size=size)
                warnings.append(f"{rel}: dönüştürülemedi, olduğu gibi kondu")
                return
            warnings.append(f"{rel}: video dönüştürülemedi ({str(e)[-160:]})")
            return
        add("video", rel, f"media/{out_name}", title,
            poster=f"media/{poster}" if os.path.exists(os.path.join(MEDIA, poster)) else None,
            size=os.path.getsize(dst))
        return

    if kind == "audio":
        if ext == ".mp3":
            out_name = safe_name(rel)
            shutil.copy2(abs_path, os.path.join(MEDIA, out_name))
        else:
            out_name = safe_name(rel, ".mp3")
            try:
                run(["ffmpeg", "-y", "-loglevel", "error", "-i", abs_path, "-codec:a", "libmp3lame", "-b:a", "192k",
                     os.path.join(MEDIA, out_name)])
            except Exception as e:  # noqa: BLE001
                warnings.append(f"{rel}: ses dönüştürülemedi ({str(e)[-160:]})")
                return
        add("audio", rel, f"media/{out_name}", title, size=os.path.getsize(os.path.join(MEDIA, out_name)))
        return

    if kind == "image":
        if ext in MAGICK_EXT:
            tool = magick()
            out_name = safe_name(rel, ".png")
            if not tool:
                warnings.append(f"{rel}: ImageMagick yok, dönüştürülmedi")
                return
            try:
                run([tool, f"{abs_path}[0]", "-flatten", "-resize", "4000x4000>", os.path.join(MEDIA, out_name)])
            except Exception as e:  # noqa: BLE001
                warnings.append(f"{rel}: görsel dönüştürülemedi ({str(e)[-160:]})")
                return
            add("image", rel, f"media/{out_name}", title, size=os.path.getsize(os.path.join(MEDIA, out_name)),
                extra={"converted": True})
            return
        out_name = safe_name(rel)
        shutil.copy2(abs_path, os.path.join(MEDIA, out_name))
        add("image", rel, f"media/{out_name}", title, size=size)
        return

    if kind == "lottie":
        if ext == ".json":
            try:
                data = json.load(open(abs_path, encoding="utf-8"))
            except Exception:  # noqa: BLE001
                data = {}
            if not (isinstance(data, dict) and "layers" in data and "fr" in data):
                warnings.append(f"{rel}: Lottie animasyonu değil, atlandı")
                return
        out_name = safe_name(rel)
        shutil.copy2(abs_path, os.path.join(MEDIA, out_name))
        add("lottie", rel, f"media/{out_name}", title, size=size)
        return

    if kind in ("rive", "pdf"):
        out_name = safe_name(rel)
        shutil.copy2(abs_path, os.path.join(MEDIA, out_name))
        add(kind, rel, f"media/{out_name}", title, size=size)
        return

    if kind == "html":
        folder = safe_name(os.path.dirname(rel) or "kok") + "_site"
        shutil.copytree(os.path.dirname(abs_path), os.path.join(MEDIA, folder), dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns(".git", ".github", "node_modules"))
        add("html", rel, f"media/{folder}/{os.path.basename(rel)}", title)
        return


EMBED_HOSTS = ("youtube.com", "youtu.be", "vimeo.com", "sketchfab.com", "figma.com", "drive.google.com", "docs.google.com")


def process_link(link):
    url = str((link or {}).get("url", "")).strip()
    title = str((link or {}).get("title", "")).strip() or None
    if not re.match(r"^https://", url):
        warnings.append(f"{url[:60]}: yalnızca https bağlantıları")
        return
    host = urllib.parse.urlparse(url).netloc.lower()
    if "drive.google.com" in host and shutil.which("gdown"):
        # Drive: dosyayı indirip türüne göre işle (100 MB üstü dosyalar için)
        tmp = os.path.abspath("drive_dl")
        os.makedirs(tmp, exist_ok=True)
        try:
            run(["gdown", "--fuzzy", "-q", "-O", tmp + "/", url], timeout=1800)
            got = [f for f in os.listdir(tmp)]
            if got:
                name = got[-1]
                process_file(f"drive/{name}", os.path.join(tmp, name), title or name)
                return
        except Exception as e:  # noqa: BLE001
            warnings.append(f"Drive dosyası indirilemedi, bağlantı olarak eklendi ({str(e)[-120:]})")
    if any(h in host for h in EMBED_HOSTS):
        add("embed", url, url, title or host)
    else:
        add("link", url, url, title or host)


try:
    files = json.loads(os.environ.get("FILES") or "[]")
except Exception:  # noqa: BLE001
    files = []
try:
    links = json.loads(os.environ.get("LINKS") or "[]")
except Exception:  # noqa: BLE001
    links = []

for rel in files[:80]:
    if not isinstance(rel, str):
        continue
    rel = rel.strip().lstrip("/")
    abs_path = os.path.abspath(os.path.join(SRC, rel))
    if not abs_path.startswith(SRC + os.sep) or ".." in rel.split("/"):
        warnings.append(f"{rel}: geçersiz yol")
        continue
    if not os.path.isfile(abs_path):
        warnings.append(f"{rel}: bu commit'te yok")
        continue
    try:
        process_file(rel, abs_path)
    except Exception as e:  # noqa: BLE001
        warnings.append(f"{rel}: {str(e)[-200:]}")

for link in links[:20]:
    if isinstance(link, dict):
        process_link(link)

if not items:
    print("::error::Önizlenecek dosya üretilemedi: " + " | ".join(warnings[:5]))
    sys.exit(1)

manifest = {
    "title": os.environ.get("TITLE") or os.environ.get("SRC_REPO", ""),
    "repo": os.environ.get("SRC_REPO", ""),
    "sha": os.environ.get("SRC_SHA", ""),
    "built_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "panel_origin": os.environ.get("PANEL_ORIGIN", ""),
    "items": items,
    "warnings": warnings,
}
with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as fh:
    json.dump(manifest, fh, ensure_ascii=False, indent=1)
for f in ("index.html", "viewer.js", "viewer.css"):
    shutil.copy2(os.path.join(HERE, "..", "viewer", f), os.path.join(OUT, f))
for w in warnings:
    print("::warning::" + w)
print(f"{len(items)} öğe hazır")
