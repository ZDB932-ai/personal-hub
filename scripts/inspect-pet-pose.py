import bpy,json
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
print('pose',rig.data.pose_position,'slot',rig.animation_data.action_slot.identifier)
for f in [1,22,32]:
 bpy.context.scene.frame_set(f)
 print(f,list(rig.pose.bones['armL'].rotation_euler),list(rig.pose.bones['armL'].rotation_quaternion))

