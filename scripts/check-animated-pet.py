import bpy, os, math, json, sys
from mathutils import Vector
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
folder = os.path.join(root,'assets/pet-models/tripo-fixed')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps=30
bpy.ops.import_scene.gltf(filepath=os.path.join(root,'public/pets/nailong-animated.glb'))
rig = next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
assert len(rig.data.bones)==17
clips={a.name:a for a in bpy.data.actions}
assert set(['Idle','Walk','Wave','Eat','Shy']).issubset(clips)
scene=bpy.context.scene
scene.render.fps=30
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.render.resolution_x=600
scene.render.resolution_y=600
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.world=bpy.data.worlds.new('Studio')
scene.world.color=(.3,.3,.3)
scene.view_settings.view_transform='AgX'
center=Vector((.07,.045,0))
def aim(o): o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
for loc,power in [((3,-3,4),260),((3,3,2),160),((-3,1,3),180)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    o=bpy.context.object
    o.data.energy=power
    o.data.size=3
    aim(o)
bpy.ops.object.camera_add(location=(3,-.7,.15))
cam=bpy.context.object
cam.data.type='ORTHO'
cam.data.ortho_scale=1.25
aim(cam)
scene.camera=cam
for track in rig.animation_data.nla_tracks: track.mute=True
rig.animation_data.use_nla=False
report={}
walk=clips['Walk']
rig.animation_data.action=walk
rig.animation_data.action_slot=walk.slots[0]
support=[]
for frame in range(1,36):
    scene.frame_set(frame)
    support.append((rig.matrix_world@rig.pose.bones['footL'].head).z)
assert max(support)-min(support)<.001, ('support foot drifts vertically',support)
report['support_height_range']=max(support)-min(support)
for name,frame in [('Idle',1),('Wave',22),('Walk',10),('Eat',54),('Shy',32)]:
    if '--shy-only' in sys.argv and name!='Shy': continue
    clip=clips[name]
    rig.animation_data.action=clip
    if clip.slots: rig.animation_data.action_slot=clip.slots[0]
    max_extent=0
    for sample in range(1,int(clip.frame_range[1])+1,3):
        scene.frame_set(sample)
        depsgraph=bpy.context.evaluated_depsgraph_get()
        for obj in scene.objects:
            if obj.type!='MESH' or not any(m.type=='ARMATURE' for m in obj.modifiers): continue
            evaluated=obj.evaluated_get(depsgraph)
            evaluated_mesh=evaluated.to_mesh()
            for vertex in evaluated_mesh.vertices:
                p=evaluated.matrix_world@vertex.co
                assert all(math.isfinite(c) for c in p)
                max_extent=max(max_extent,p.length)
            evaluated.to_mesh_clear()
    assert max_extent<1, (name,max_extent)
    report[name]={'frames':list(clip.frame_range),'max_extent':max_extent}
    scene.frame_set(frame)
    scene.render.filepath=os.path.join(folder,'animated-'+name+'.png')
    bpy.ops.render.render(write_still=True)
with open(os.path.join(folder,'animation-validation.json'),'w') as f: json.dump(report,f,indent=2)
print('ANIMATION_VALID',json.dumps(report))
