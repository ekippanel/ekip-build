"""Önizlenebilir dosya türleri (panelin listesiyle aynı tutulmalı: lib/features/projects/domain/models/repo_file.dart)."""
import os

MODEL_EXT = {".glb", ".gltf"}
BLENDER_EXT = {".blend", ".fbx", ".obj", ".stl", ".dae", ".ply"}
VIDEO_EXT = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"}
AUDIO_EXT = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aif", ".aiff"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"}
MAGICK_EXT = {".psd", ".psb", ".tif", ".tiff", ".tga", ".bmp"}
FFMPEG_EXT = VIDEO_EXT | (AUDIO_EXT - {".mp3"})
OTHER = {".pdf": "pdf", ".riv": "rive", ".json": "lottie", ".lottie": "lottie", ".html": "html", ".htm": "html"}


def kind_of(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in MODEL_EXT or ext in BLENDER_EXT:
        return "model"
    if ext in VIDEO_EXT:
        return "video"
    if ext in AUDIO_EXT:
        return "audio"
    if ext in IMAGE_EXT or ext in MAGICK_EXT:
        return "image"
    return OTHER.get(ext)
