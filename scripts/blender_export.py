# Blender içinde çalışır: sahneyi (ya da içe aktarılan dosyayı) sıkıştırılmış GLB olarak dışa aktarır.
#   blender -b dosya.blend --disable-autoexec --python blender_export.py -- cikti.glb
#   blender -b --factory-startup --disable-autoexec --python blender_export.py -- cikti.glb girdi.fbx
import os
import sys

import bpy  # type: ignore

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
out = argv[0]
src = argv[1] if len(argv) > 1 else None

if src:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ext = os.path.splitext(src)[1].lower()
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=src)
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=src)
    elif ext == ".stl":
        bpy.ops.wm.stl_import(filepath=src)
    elif ext == ".ply":
        bpy.ops.wm.ply_import(filepath=src)
    elif ext == ".dae":
        bpy.ops.wm.collada_import(filepath=src)
    else:
        raise SystemExit(f"Desteklenmeyen tür: {ext}")

kwargs = dict(filepath=out, export_format="GLB", export_apply=True, export_yup=True)
try:
    bpy.ops.export_scene.gltf(**kwargs, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
except Exception:  # Draco yoksa sıkıştırmasız
    bpy.ops.export_scene.gltf(**kwargs)
print("GLB yazıldı:", out)
