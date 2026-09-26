import bpy, json, math, sys
import numpy as np
from pathlib import Path
from mathutils import Vector

root = Path(__file__).resolve().parents[1]
folder = root / 'assets/pet-models/tripo-fixed'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30
expression = '--expression' in sys.argv
bpy.ops.import_scene.gltf(filepath=str(folder / ('nailong-expression-polish.glb' if expression else 'nailong-motion-polish.glb')))
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
meshes = [o for o in scene.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]
assert len(meshes) == 5, [(o.name, o.type) for o in scene.objects]
assert len(rig.data.bones) == 17, [b.name for b in rig.data.bones]
clips = {a.name: a for a in bpy.data.actions}
assert set(clips) == {'Idle', 'Walk', 'Run', 'Wave', 'Eat', 'Shy', 'Dance'} | ({'Peek'} if expression else set())
rig.animation_data.use_nla = False
report = {}
for name, clip in clips.items():
    rig.animation_data.action = clip
    rig.animation_data.action_slot = clip.slots[0]
    extent = 0
    for frame in range(int(clip.frame_range[0]), int(clip.frame_range[1])+1, 3):
        scene.frame_set(frame)
        for obj in meshes:
            evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            mesh = evaluated.to_mesh()
            p = np.array([v.co[:] for v in mesh.vertices])
            assert np.isfinite(p).all()
            extent = max(extent, float(np.linalg.norm(p, axis=1).max()))
            evaluated.to_mesh_clear()
    assert extent < 1
    report[name] = {'max_extent': extent}
    if name in ['Walk', 'Run']:
        heights = []
        for frame in range(int(clip.frame_range[0]), int(clip.frame_range[0])+35):
            scene.frame_set(frame)
            heights.append((rig.matrix_world @ rig.pose.bones['footL'].head).z)
        report[name]['support_joint_height_range'] = max(heights)-min(heights)
        assert max(heights)-min(heights) < .001
(folder / ('expression-export-validation.json' if expression else 'polished-export-validation.json')).write_text(json.dumps(report, indent=2), encoding='utf-8')
scene.render.engine = 'CYCLES'
scene.cycles.samples = 12
scene.cycles.use_denoising = True
scene.render.resolution_x = 480
scene.render.resolution_y = 480
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.world = bpy.data.worlds.new('Polish studio')
scene.world.color = (.25, .25, .25)
center = Vector((.08, .035, -.01))
def aim(obj):
    obj.rotation_euler = (center-obj.location).to_track_quat('-Z', 'Y').to_euler()
for position, energy in [((3,-3,4), 260), ((3,3,2), 160), ((-3,1,3), 130)]:
    bpy.ops.object.light_add(type='AREA', location=position)
    lamp = bpy.context.object
    lamp.data.energy = energy
    lamp.data.size = 3
    aim(lamp)
bpy.ops.object.camera_add(location=(3,-.7,.2))
camera = bpy.context.object
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 1.2
scene.camera = camera
for name, frames in ([('Peek', [28,46,68]), ('Wave', [22,32,42]), ('Dance', [35,60,100])] if expression else [('Run', [8,20,40]), ('Dance', [35,60,100]), ('Shy', [28,52,70])]):
    clip = clips[name]
    rig.animation_data.action = clip
    rig.animation_data.action_slot = clip.slots[0]
    for i, frame in enumerate(frames):
        camera.location = [(3,-.7,.2), (1.8,-2,.15), (1.8,2,.15)][i]
        aim(camera)
        scene.frame_set(frame)
        scene.render.filepath = str(folder / f'{"expression" if expression else "polish"}-review-{name}-{i}.png')
        bpy.ops.render.render(write_still=True)
print('POLISHED_EXPORT_VALID', json.dumps(report))
