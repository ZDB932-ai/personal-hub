import bpy, math, json, ast
from pathlib import Path

root = Path(__file__).resolve().parents[1]
folder = root / 'assets/pet-models/tripo-fixed'
assert Path(bpy.data.filepath).name == 'nailong-motion-polish.blend'
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
mesh = max((o for o in scene.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices))
rig.animation_data.use_nla = False
import numpy as np
source = ast.parse((root / 'scripts/polish-pet-motion.py').read_text(encoding='utf-8-sig'))
helpers = ast.Module(body=[n for n in source.body if isinstance(n, ast.FunctionDef)], type_ignores=[])
exec(compile(helpers, 'motion-helpers', 'exec'))
before = strain()
weights = np.zeros((len(mesh.data.vertices), len(mesh.vertex_groups)))
mask = []
for v in mesh.data.vertices:
    x,y,z = v.co
    for g in v.groups:
        weights[v.index,g.group] = g.weight
    mask.append(smooth(.12,.20,abs(y-.045))*smooth(.08,.17,x)*smooth(-.25,-.13,z)*(1-smooth(.10,.18,z)))
mask = np.array(mask)[:,None]
original_weights = weights.copy()
edges = np.array([e.vertices[:] for e in mesh.data.edges])
degree = np.bincount(edges.flatten(), minlength=len(weights))
positions = np.array([v.co[:] for v in mesh.data.vertices])
_, weld = np.unique(np.round(positions,4),axis=0,return_inverse=True)
weld_counts = np.bincount(weld)
for _ in range(32):
    welded = np.zeros((len(weld_counts),weights.shape[1]))
    np.add.at(welded,weld,weights)
    weights += mask*(welded[weld]/weld_counts[weld,None]-weights)
    sums = np.zeros_like(weights)
    np.add.at(sums,edges[:,0],weights[edges[:,1]])
    np.add.at(sums,edges[:,1],weights[edges[:,0]])
    weights += .5*mask*(sums/np.maximum(1,degree[:,None])-weights)
changed = 0
for v in mesh.data.vertices:
    if mask[v.index,0] < 1e-8:
        continue
    row = weights[v.index]
    threshold = np.sort(row)[-5]
    row = np.maximum(0,row-threshold)
    row /= row.sum()
    for group in mesh.vertex_groups:
        group.remove([v.index])
    for i,w in enumerate(row):
        if w > 1e-8:
            mesh.vertex_groups[i].add([v.index],float(w),'REPLACE')
    changed += 1
peek = []
for f in range(109):
    t = f/30
    lean = smooth(.15,.85,t)*(1-smooth(1.35,1.75,t))
    caught = smooth(1.35,1.55,t)*(1-smooth(1.75,2.05,t))
    shy = smooth(1.75,2.25,t)*(1-smooth(2.65,3.55,t))
    rotations = {'chest': (.025*lean, .025*lean, 0), 'neck': (-.015*lean, 0, -.015*shy), 'head': (.025*lean, -.10*lean+.055*shy, .025*lean+.035*caught-.055*shy), 'tailMid': (0,.07*lean-.04*shy,0), 'tailTip': (0,.09*lean-.07*shy,0)}
    for side, sign in [('L',1),('R',-1)]:
        rotations['arm'+side] = (sign*.035*caught,0,.025*shy)
        rotations['forearm'+side] = (sign*.025*shy,0,.065*shy)
    peek.append((f+1,rotations,{}))
action('Peek',peek)
after = strain()
candidate = after
accepted = all(after[name]['max_edge_stretch'] <= before[name]['max_edge_stretch']*1.01 for name in before)
if not accepted:
    for v in mesh.data.vertices:
        for group in mesh.vertex_groups:
            group.remove([v.index])
        for i,w in enumerate(original_weights[v.index]):
            if w > 0:
                mesh.vertex_groups[i].add([v.index],float(w),'REPLACE')
    after = strain()
rig.animation_data.action = None
for b in rig.pose.bones:
    b.rotation_euler = (0,0,0)
    b.location = (0,0,0)
for o in scene.objects:
    o.select_set(o.type in {'MESH','ARMATURE'})
    if o.type == 'MESH' and o.data.shape_keys:
        for key in o.data.shape_keys.key_blocks:
            key.value = 1 if key.name == 'CheekContour' else 0
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'nailong-expression-polish.blend'))
report = {'before':before,'after':after,'candidate':candidate,'arm_vertices':changed,'weights_accepted':accepted}
(folder / 'expression-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
window = next(iter(bpy.context.window_manager.windows))
with bpy.context.temp_override(window=window, scene=scene, view_layer=scene.view_layers[0]):
    bpy.ops.export_scene.gltf(filepath=str(folder / 'nailong-expression-polish.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_anim_slide_to_zero=True)

