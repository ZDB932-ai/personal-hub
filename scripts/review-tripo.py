import bpy, math, os, json
from mathutils import Vector
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out=os.path.join(root,'assets/pet-models/tripo-review')
os.makedirs(out,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=r'C:\Users\ZDB\Desktop\modela923d530b57701.glb')
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
print('IMPORTED',[(o.name,len(o.data.vertices),len(o.data.polygons)) for o in meshes])
print('TEXTURES',[(i.name,list(i.size)) for i in bpy.data.images])
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out,'source.blend'))
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=16
scene.cycles.use_denoising=True
scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.world.color=(.28,.28,.28)
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
points=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)])
center=(lo+hi)*.5; size=max(hi-lo)
print('BOUNDS',list(lo),list(hi))
def aim(o):o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
for loc,power,scale in [((3,-3,4),260,3),((3,3,2),160,3),((-3,1,3),180,2)]:
    bpy.ops.object.light_add(type='AREA',location=center+Vector(loc)*size)
    o=bpy.context.object;o.data.energy=power*size*size;o.data.shape='DISK';o.data.size=scale*size;aim(o)
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=size*1.3;scene.camera=cam
for name,loc in [('front',(3,0,.1)),('three-quarter',(3,-2,.25)),('back',(-3,0,.1))]:
    cam.location=center+Vector(loc)*size;aim(cam)
    scene.render.filepath=os.path.join(out,name+'.png');bpy.ops.render.render(write_still=True)

obj=meshes[0]
bpy.context.view_layer.objects.active=obj
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
dec=obj.modifiers.new('Desktop candidate','DECIMATE');dec.ratio=.07
bpy.ops.object.modifier_apply(modifier=dec.name)
print('CANDIDATE',len(obj.data.vertices),len(obj.data.polygons))
bpy.ops.export_scene.gltf(filepath=os.path.join(out,'desktop-candidate.glb'),export_format='GLB',use_selection=True)
cam.location=center+Vector((3,-2,.25))*size;aim(cam)
scene.render.filepath=os.path.join(out,'candidate.png');bpy.ops.render.render(write_still=True)
