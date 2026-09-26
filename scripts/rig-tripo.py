import bpy, os, math

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(root, 'assets/pet-models/tripo-fixed/nailong-fixed.blend'))
mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
armature = bpy.data.armatures.new('NailongRig')
rig = bpy.data.objects.new('NailongRig', armature)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
positions = {'body': (.12,.045,-.28), 'head': (.19,.045,.08), 'armL': (.19,-.15,.015), 'armR': (.19,.24,-.025), 'tail': (-.06,.03,-.29), 'legL': (.13,-.12,-.34), 'legR': (.13,.20,-.34)}
positions.update({'forearmL':(.25,-.225,-.015),'forearmR':(.26,.31,-.09)})
for name, p in positions.items():
    bone = armature.edit_bones.new(name)
    bone.head = p
    bone.tail = (p[0],p[1],p[2]+.12)
    if name != 'body': bone.parent = armature.edit_bones[{'forearmL':'armL','forearmR':'armR'}.get(name,'body')]
bpy.ops.object.mode_set(mode='OBJECT')
groups = {name: mesh.vertex_groups.new(name=name) for name in positions}
def smooth(a,b,x):
    t = max(0,min(1,(x-a)/(b-a)))
    return t*t*(3-2*t)
for v in mesh.data.vertices:
    x,y,z = v.co
    left = smooth(.14,.245,.045-y)*(1-smooth(.09,.17,z))*smooth(-.23,-.12,z)*smooth(-.01,.15,x)
    right = smooth(.14,.255,y-.045)*(1-smooth(.07,.15,z))*smooth(-.25,-.15,z)*smooth(-.01,.15,x)
    tail = 1-smooth(-.12,.015,x)
    head = smooth(.035,.17,z)*(1-left)*(1-right)
    leg = (1-smooth(-.41,-.30,z))*(1-tail)
    weights = {'head':head, 'armL':left, 'armR':right, 'tail':tail, 'legL':leg*(1-smooth(.015,.07,y)), 'legR':leg*smooth(.015,.07,y)}
    for side, amount, distance in [('L',left,.045-y),('R',right,y-.045)]:
        forearm = amount*smooth(.23,.32,distance)
        weights['arm'+side] -= forearm
        weights['forearm'+side] = forearm
    total = sum(weights.values())
    weights['body'] = max(0,1-total)
    weights = dict(sorted(weights.items(),key=lambda item:item[1],reverse=True)[:4])
    total = sum(weights.values())
    for name,w in weights.items():
        if w > 0: groups[name].add([v.index],w/total,'REPLACE')
modifier = mesh.modifiers.new('Pet skin','ARMATURE')
modifier.object = rig
mesh.parent = rig
for v in mesh.data.vertices:
    assert abs(sum(g.weight for g in v.groups)-1)<1e-5
mesh.shape_key_add(name='Basis')
blink = mesh.shape_key_add(name='Blink')
for vertex in blink.data:
    x,y,z = vertex.co
    for ey,ez in [(-.073,.290),(.126,.256)]:
        dy,dz = y-ey,z-ez
        influence = (1-smooth(.039,.071,abs(dy)))*(1-smooth(.040,.078,abs(dz)))*smooth(.32,.375,x)
        vertex.co.z -= dz*.96*influence
        vertex.co.x -= .004*influence
out = os.path.join(root,'assets/pet-models/tripo-fixed')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out,'nailong-rigged.blend'))
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True); rig.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(root,'public/pets/nailong-tripo.glb'),export_format='GLB',use_selection=True,export_animations=False)
print('RIG_VALID',len(mesh.data.vertices),'vertices',len(positions),'bones')
