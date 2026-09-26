import bpy, json
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
print(json.dumps({'file':bpy.data.filepath,'bones':list(rig.data.bones.keys()),'actions':[(a.name,list(a.frame_range)) for a in bpy.data.actions]}))
