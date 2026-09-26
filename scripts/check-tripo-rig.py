import bpy, os
from mathutils import Vector
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=os.path.join(root,'public/pets/nailong-tripo.glb'))
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 16; scene.cycles.use_denoising = True
scene.render.resolution_x = 640; scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.world.color = (.28,.28,.28)
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'
center = Vector((.07,.045,0))
def aim(o): o.rotation_euler = (center-o.location).to_track_quat('-Z','Y').to_euler()
for loc,power in [((3,-3,4),260),((3,3,2),160),((-3,1,3),180)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    o = bpy.context.object; o.data.energy = power; o.data.size = 3; aim(o)
bpy.ops.object.camera_add(location=(3,.045,.03))
cam = bpy.context.object; cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.3; aim(cam); scene.camera = cam
for name,poses in [('rig-rest',{}),('rig-wave',{'armL':(.28,0,-.12),'forearmL':(.30,0,0),'head':(.07,-.07,.06)}),('rig-run',{'legL':(0,0,.20),'legR':(0,0,-.20),'armL':(0,0,.18),'armR':(0,0,-.18)}),('rig-blink',{}),('rig-sleep',{'head':(0,0,-.13)})]:
    for obj in scene.objects:
        if obj.type == 'MESH' and obj.data.shape_keys:
            obj.data.shape_keys.key_blocks['Blink'].value = 1 if name in ['rig-blink','rig-sleep'] else 0
    for bone in rig.pose.bones:
        bone.rotation_mode = 'XYZ'; bone.rotation_euler = poses.get(bone.name,(0,0,0))
    bpy.context.view_layer.update()
    scene.render.filepath = os.path.join(root,'assets/pet-models/tripo-fixed',name+'.png')
    bpy.ops.render.render(write_still=True)
