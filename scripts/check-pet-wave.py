import bpy, os, json
from mathutils import Vector
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
folder=os.path.join(root,'assets/pet-models/tripo-fixed')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps=30
bpy.ops.import_scene.gltf(filepath=os.path.join(root,'public/pets/nailong-animated.glb'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
rig.animation_data.use_nla=False
rig.animation_data.action=bpy.data.actions['Wave']
rig.animation_data.action_slot=rig.animation_data.action.slots[0]
scene=bpy.context.scene
def points(frame):
    scene.frame_set(frame)
    obj=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    evaluated=obj.to_mesh()
    result=[obj.matrix_world@v.co for v in evaluated.vertices]
    obj.to_mesh_clear()
    return result
rest=points(1)
protected=[i for i,p in enumerate(rest) if p.z>.13 or p.y>-.125 or p.x<.12 or p.z<-.24]
worst=0
hand_motion=0
for frame in range(1,85,3):
    current=points(frame)
    worst=max(worst,max((current[i]-rest[i]).length for i in protected))
    hand_motion=max(hand_motion,max((a-b).length for a,b in zip(current,rest)))
assert worst<.0001, ('body pulled by wave',worst)
assert hand_motion>.005, ('wave lost movement',hand_motion)
report={'protected_vertices':len(protected),'max_body_displacement':worst,'max_hand_displacement':hand_motion}
with open(os.path.join(folder,'wave-validation.json'),'w') as f: json.dump(report,f,indent=2)
scene.render.engine='CYCLES'
scene.cycles.samples=16
scene.cycles.use_denoising=True
scene.render.resolution_x=600
scene.render.resolution_y=600
scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Studio')
scene.world.color=(.3,.3,.3)
center=Vector((.08,.03,0))
def aim(o): o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
for loc,power in [((3,-3,4),300),((3,3,2),180)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    o=bpy.context.object
    o.data.energy=power
    o.data.size=3
    aim(o)
bpy.ops.object.camera_add(location=(3,-.5,.1))
scene.camera=bpy.context.object
scene.camera.data.type='ORTHO'
scene.camera.data.ortho_scale=1.2
aim(scene.camera)
for frame in [1,22,32]:
    scene.frame_set(frame)
    scene.render.filepath=os.path.join(folder,'wave-isolated-'+str(frame)+'.png')
    bpy.ops.render.render(write_still=True)
print('WAVE_VALID',json.dumps(report))
