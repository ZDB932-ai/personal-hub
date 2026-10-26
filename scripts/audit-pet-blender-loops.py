import argparse
import bpy
import hashlib
import json
import math
import numpy as np
from pathlib import Path
import sys

parser = argparse.ArgumentParser()
parser.add_argument('source')
parser.add_argument('output')
parser.add_argument('--clips', nargs='+', default=['Idle', 'Walk'])
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
source = Path(args.source).resolve()
output = Path(args.output).resolve()
if output.exists():
    raise RuntimeError('Evidence output already exists')
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
scene = bpy.context.scene
bindings = {}
for obj in scene.objects:
    data = obj.animation_data
    if not data:
        continue
    for track in data.nla_tracks:
        for strip in track.strips:
            bindings.setdefault(track.name, []).append((obj, strip.action, strip.action_slot))
    data.action = None
    data.use_nla = False
bone_shapes = {bone.custom_shape for obj in scene.objects if obj.type == 'ARMATURE' for bone in obj.pose.bones if bone.custom_shape}
meshes = sorted((obj for obj in scene.objects if obj.type == 'MESH' and obj not in bone_shapes), key=lambda obj: obj.name)

def sample(frame):
    scene.frame_set(math.floor(frame), subframe=frame % 1)
    graph = bpy.context.evaluated_depsgraph_get()
    chunks = []
    for obj in meshes:
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        coords = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
        mesh.vertices.foreach_get('co', coords)
        coords = coords.reshape((-1, 3))
        matrix = np.array(evaluated.matrix_world)
        chunks.append(coords @ matrix[:3, :3].T + matrix[:3, 3])
        evaluated.to_mesh_clear()
    return np.concatenate(chunks)

rest = sample(0)
height = float(np.ptp(rest[:, 2]))
if height <= 0:
    raise RuntimeError('Invalid imported height')
fps = scene.render.fps / scene.render.fps_base
results = []
for name in args.clips:
    if name not in bindings:
        raise RuntimeError(f'Missing imported clip {name}; actual: {list(bindings)}')
    for obj in scene.objects:
        if obj.animation_data:
            obj.animation_data.action = None
    assigned = []
    for obj, action, slot in bindings[name]:
        obj.animation_data.action = action
        obj.animation_data.action_slot = slot
        assigned.append({'object': obj.name, 'action': action.name, 'slot': slot.identifier})
    start = min(float(action.frame_range[0]) for _, action, _ in bindings[name])
    end = max(float(action.frame_range[1]) for _, action, _ in bindings[name])
    step = min(0.5, (end - start) / 4)
    if step <= 0:
        raise RuntimeError(f'Empty clip {name}')
    first, after, before, last = [sample(frame) for frame in [start, start + step, end - step, end]]
    error = np.linalg.norm(last - first, axis=1)
    velocity = np.linalg.norm(((last - before) - (after - first)) * fps / step, axis=1)
    results.append({
        'clip': name, 'frames': [start, end], 'seconds': (end - start) / fps,
        'assigned_bindings': assigned,
        'endpoint_max_height_ratio': float(error.max() / height),
        'endpoint_p95_height_ratio': float(np.percentile(error, 95) / height),
        'endpoint_centroid_delta': (last.mean(axis=0) - first.mean(axis=0)).tolist(),
        'endpoint_velocity_max_height_per_second': float(velocity.max() / height),
        'step_frames': step,
    })
if hashlib.sha256(source.read_bytes()).hexdigest() != source_hash:
    raise RuntimeError('Source changed during audit')
report = {
    'source': str(source), 'sha256': source_hash, 'blender': bpy.app.version_string,
    'fps': fps, 'rest_height': height, 'evaluated_vertices': len(rest),
    'meshes': [obj.name for obj in meshes], 'excluded_bone_display_shapes': sorted(obj.name for obj in bone_shapes), 'available_clips': sorted(bindings),
    'clips': results,
    'scope': 'Read-only GLB clean import and evaluated world-space endpoint comparison. No root removal, no source save. Finite-difference velocity only; not sole contact, interior deformation, aesthetic acceptance or final delivery approval.',
}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
