import bpy
from mathutils import Quaternion, Vector
bpy.ops.wm.open_mainfile(filepath='E:/炫酷主页/assets/pet-models/tripo-fixed/nailong-animated.blend')
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
rig.animation_data.action=bpy.data.actions['Shy']
rig.animation_data.action_slot=rig.animation_data.action.slots[0]
rig.animation_data.use_nla=False
bpy.context.scene.frame_start=1
bpy.context.scene.frame_end=108
bpy.context.scene.frame_set(22)
for area in [area for window in bpy.context.window_manager.windows for area in window.screen.areas]:
    if area.type=='VIEW_3D':
        area.spaces.active.shading.type='MATERIAL'
        area.spaces.active.overlay.show_overlays=False
        area.spaces.active.region_3d.view_location=Vector((.08,.045,0))
        area.spaces.active.region_3d.view_distance=1.8
        area.spaces.active.region_3d.view_rotation=Vector((1,-.2,.12)).to_track_quat('Z','Y')
        area.spaces.active.region_3d.view_perspective='ORTHO'
print('READY Shy preview, 17 bones')
window=next(iter(bpy.context.window_manager.windows))
with bpy.context.temp_override(window=window,screen=window.screen):
    if not window.screen.is_animation_playing: bpy.ops.screen.animation_play()
