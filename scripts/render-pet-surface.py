import bpy, os, sys
from mathutils import Vector
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
folder=os.path.join(root,'assets/pet-models/tripo-fixed')
for variant,filename in [('before','nailong-rigged.blend'),('after','nailong-refined-rigged.blend')]:
    if '--after-only' in sys.argv and variant!='after': continue
    bpy.ops.wm.open_mainfile(filepath=os.path.join(folder,filename))
    mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    for key in mesh.data.shape_keys.key_blocks: key.value=0
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.samples=32
    scene.cycles.use_denoising=True
    scene.render.resolution_x=800
    scene.render.resolution_y=800
    scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('SurfaceStudio')
    scene.world.color=(.28,.28,.28)
    center=Vector((.08,.03,0))
    def aim(o): o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
    for loc,power in [((3,-3,4),300),((3,3,2),180),((-3,1,3),220)]:
        bpy.ops.object.light_add(type='AREA',location=loc)
        o=bpy.context.object
        o.data.energy=power
        o.data.size=3
        aim(o)
    bpy.ops.object.camera_add()
    camera=bpy.context.object
    camera.data.type='ORTHO'
    scene.camera=camera
    for view,location,scale,target in [('front',(3,-.6,.15),1.2,(.08,.03,0)),('face',(3,-.3,.4),.7,(.2,.03,.23)),('back',(-3,-1,.3),1.2,(.08,.03,0))]:
        center=Vector(target)
        camera.location=location
        camera.data.ortho_scale=scale
        aim(camera)
        scene.render.filepath=os.path.join(folder,'surface-'+variant+'-'+view+'.png')
        bpy.ops.render.render(write_still=True)
