import bpy, os, math, json
from mathutils import Vector
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
folder=os.path.join(root,'assets/pet-models/tripo-fixed')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(root,'public/pets/nailong-animated.glb'))
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
rig.animation_data_clear()
keys=mesh.data.shape_keys.key_blocks
report={}
for name in ['BlinkLeft','BlinkRight','Chew','ShySmile']:
    assert name in keys
    distances=[(a.co-b.co).length for a,b in zip(keys[name].data,keys['Basis'].data)]
    assert all(math.isfinite(d) for d in distances)
    print('MORPH_RANGE',name,min(distances),max(distances))
    assert 0.001<max(distances)<.08, (name,max(distances))
    report[name]={'max_displacement':max(distances),'affected_vertices':sum(d>1e-6 for d in distances)}
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.render.resolution_x=640
scene.render.resolution_y=640
scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('FaceStudio')
scene.world.color=(.3,.3,.3)
center=Vector((.2,.03,.23))
def aim(o): o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
for loc,power in [((3,-3,4),300),((3,3,2),200)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    o=bpy.context.object
    o.data.energy=power
    o.data.size=3
    aim(o)
bpy.ops.object.camera_add(location=(3,-.3,.4))
scene.camera=bpy.context.object
scene.camera.data.type='ORTHO'
scene.camera.data.ortho_scale=.7
aim(scene.camera)
for name,values in [('open',{}),('shy',{'BlinkLeft':.12,'BlinkRight':.12,'ShySmile':.65})]:
    for key in keys: key.value=values.get(key.name,0)
    scene.render.filepath=os.path.join(folder,'face-'+name+'.png')
    bpy.ops.render.render(write_still=True)
with open(os.path.join(folder,'face-validation.json'),'w') as f: json.dump(report,f,indent=2)
print('FACE_VALID',json.dumps(report))
