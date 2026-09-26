import bpy, math, json
import numpy as np
from pathlib import Path

root = Path(__file__).resolve().parents[1]
folder = root / 'assets/pet-models/tripo-fixed'
scene = bpy.context.scene
assert Path(bpy.data.filepath).name == 'nailong-mcp-detail.blend'
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
mesh = max((o for o in scene.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices))
rig.animation_data.use_nla = False

def smooth(a, b, x):
    t = max(0, min(1, (x-a)/(b-a)))
    return t*t*(3-2*t)

def strain():
    p = np.array([v.co[:] for v in mesh.data.vertices])
    e = np.array([edge.vertices[:] for edge in mesh.data.edges])
    lengths = np.linalg.norm(p[e[:, 0]]-p[e[:, 1]], axis=1)
    valid = lengths > .001
    result = {}
    for name in ['Run', 'Shy', 'Dance']:
        a = bpy.data.actions.get(name)
        if not a:
            continue
        rig.animation_data.action = a
        rig.animation_data.action_slot = a.slots[0]
        maximum, p99 = 0, 0
        for frame in range(1, int(a.frame_range[1])+1, 5):
            scene.frame_set(frame)
            obj = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
            evaluated = obj.to_mesh()
            q = np.array([v.co[:] for v in evaluated.vertices])
            ratios = np.linalg.norm(q[e[:, 0]]-q[e[:, 1]], axis=1)/np.maximum(lengths, 1e-9)
            maximum = max(maximum, float(max(ratios[valid])))
            p99 = max(p99, float(np.quantile(ratios[valid], .99)))
            obj.to_mesh_clear()
        result[name] = {'max_edge_stretch': maximum, 'p99_edge_stretch': p99}
    return result

before = strain()
rig.animation_data.action = None
changed = 0
for v in mesh.data.vertices:
    x, y, z = v.co
    if z > -.27:
        continue
    weights = {mesh.vertex_groups[g.group].name: g.weight for g in v.groups}
    removed = 0
    for side, distance in [('L', .045-y), ('R', y-.045)]:
        influence = smooth(.015, .105, distance)
        for name in ['leg'+side, 'foot'+side]:
            old = weights.get(name, 0)
            weights[name] = old*influence
            removed += old*(1-influence)
    if removed < 1e-7:
        continue
    weights['body'] = weights.get('body', 0)+removed
    strongest = sorted(weights.items(), key=lambda item: item[1], reverse=True)[:4]
    total = sum(w for name, w in strongest)
    for group in mesh.vertex_groups:
        group.remove([v.index])
    for name, w in strongest:
        if w > 1e-7:
            mesh.vertex_groups[name].add([v.index], w/total, 'REPLACE')
    changed += 1

for v in mesh.data.vertices:
    x, y, z = v.co
    if z < .015:
        continue
    weights = {mesh.vertex_groups[g.group].name: g.weight for g in v.groups}
    if sum(w for name, w in weights.items() if name.startswith(('arm', 'forearm', 'hand'))) > 1e-6:
        continue
    head = smooth(.035, .17, z)
    neck = head*(1-smooth(.08, .18, z))*.55
    chest = (1-head)*smooth(-.23, .06, z)*.65
    weights = {'head': head-neck, 'neck': neck, 'chest': chest, 'body': 1-head-chest}
    for group in mesh.vertex_groups:
        group.remove([v.index])
    for name, w in weights.items():
        if w > 1e-7:
            mesh.vertex_groups[name].add([v.index], w, 'REPLACE')
    changed += 1
def action(name, frames):
    old = bpy.data.actions.get(name)
    if old:
        for track in list(rig.animation_data.nla_tracks):
            if any(s.action == old for s in track.strips):
                rig.animation_data.nla_tracks.remove(track)
        bpy.data.actions.remove(old)
    clip = bpy.data.actions.new(name)
    rig.animation_data.action = clip
    for frame, rotations, locations in frames:
        for bone in rig.pose.bones:
            bone.rotation_mode = 'XYZ'
            bone.rotation_euler = rotations.get(bone.name, (0, 0, 0))
            bone.location = locations.get(bone.name, (0, 0, 0))
            bone.scale = (1, 1, 1)
            bone.keyframe_insert('rotation_euler', frame=frame)
            bone.keyframe_insert('location', frame=frame)
    for layer in clip.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = 'LINEAR'
    clip.use_fake_user = True
    rig.animation_data.action = None

run = []
for f in range(61):
    phase = f/60
    angle = phase*math.tau
    bob = .004*(1-math.cos(angle*2))
    rotations = {'chest': (.014*math.sin(angle), 0, .028), 'neck': (0, 0, -.015), 'head': (0, -.018*math.sin(angle-.3), -.01)}
    locations = {'body': (0, bob, 0)}
    for side, offset, sign in [('L', 0, 1), ('R', .5, -1)]:
        cycle = (phase+offset)%1
        if cycle < .6:
            forward = .035*(1-2*cycle/.6)
            lift, pitch = 0, 0
        else:
            t = (cycle-.6)/.4
            forward = -.035+.07*t*t*(3-2*t)
            lift = .039*math.sin(math.pi*t)**2
            pitch = -.14*math.sin(math.tau*t)*math.sin(math.pi*t)
        locations['leg'+side] = (forward, lift-bob, 0)
        rotations['foot'+side] = (0, 0, pitch)
        rotations['arm'+side] = (sign*.025, 0, -sign*.20*math.sin(angle))
        rotations['forearm'+side] = (sign*.025, 0, -.065+sign*.045*math.sin(angle-.45))
        rotations['hand'+side] = (0, 0, sign*.03*math.sin(angle-.8))
    for name, amount, delay in [('tail', .025, .4), ('tailMid', .055, .8), ('tailTip', .08, 1.2)]:
        rotations[name] = (0, amount*math.sin(angle-delay), 0)
    run.append((f+1, rotations, locations))
action('Run', run)

dance = []
for f in range(181):
    t = f/30
    envelope = smooth(.15, .65, t)*(1-smooth(5, 5.8, t))
    beat = (t-.65)*math.tau*1.25
    sway = math.sin(beat*.5)*envelope
    bounce = .010*(1-math.cos(beat))*envelope
    side_shift = .018*sway
    rotations = {'chest': (.045*sway, .04*math.sin(beat*.5-.3)*envelope, .015*envelope), 'neck': (-.02*sway, 0, -.01*envelope), 'head': (-.025*sway, -.055*math.sin(beat*.5-.5)*envelope, .025*math.sin(beat-.3)*envelope), 'tailMid': (0, .10*math.sin(beat*.5-.7)*envelope, 0), 'tailTip': (0, .12*math.sin(beat*.5-1)*envelope, 0)}
    locations = {'body': (0, bounce, side_shift)}
    for side, sign in [('L', 1), ('R', -1)]:
        swing = max(0, sign*math.sin(beat*.5))**2*envelope
        locations['leg'+side] = (.01*swing, .018*swing-bounce, -side_shift)
        rotations['foot'+side] = (0, 0, -.045*swing)
        rotations['arm'+side] = (sign*(.055+.07*math.sin(beat*.5))*envelope, 0, (.035+.055*math.sin(beat+sign*.4))*envelope)
        rotations['forearm'+side] = (sign*.10*math.sin(beat-.4)*envelope, 0, .065*envelope)
        rotations['hand'+side] = (sign*.08*math.sin(beat-.8)*envelope, 0, 0)
    dance.append((f+1, rotations, locations))
action('Dance', dance)

shy = []
for f in range(109):
    t = f/30
    settle = smooth(.2, .9, t)*(1-smooth(2.5, 3.5, t))
    peek = smooth(1.5, 1.95, t)*(1-smooth(2.3, 2.7, t))
    rotations = {'neck': (0, .015*settle, -.018*settle), 'head': (.015*settle, .065*settle-.09*peek, -.060*settle+.045*peek), 'chest': (0, 0, 0), 'tailMid': (0, .055*settle, 0), 'tailTip': (0, -.06*settle, 0)}
    for side, sign in [('L', 1), ('R', -1)]:
        rotations['arm'+side] = (sign*.025*settle, 0, .035*settle)
        rotations['forearm'+side] = (sign*(.035+.012*math.sin(t*7))*settle, 0, .095*settle)
        rotations['hand'+side] = (0, sign*.035*settle, .025*settle)
    shy.append((f+1, rotations, {}))
action('Shy', shy)
after = strain()
rig.animation_data.action = None
for bone in rig.pose.bones:
    bone.rotation_euler = (0, 0, 0)
    bone.location = (0, 0, 0)
for obj in scene.objects:
    if obj.type == 'MESH' and obj.data.shape_keys:
        for key in obj.data.shape_keys.key_blocks:
            key.value = 1 if key.name == 'CheekContour' else 0
scene.frame_set(1)
scene.frame_end = 181
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'nailong-motion-polish.blend'))
report = {'before': before, 'after': after, 'weight_vertices': changed, 'source': 'nailong-mcp-detail.blend'}
(folder / 'motion-polish-validation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
for obj in scene.objects:
    obj.select_set(obj.type in {'MESH', 'ARMATURE'})
bpy.ops.export_scene.gltf(filepath=str(folder / 'nailong-motion-polish.glb'), export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True, export_anim_slide_to_zero=True)
print(json.dumps(report))

