import bpy, os, math, json
from mathutils import Vector

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
folder = os.path.join(root, 'assets/pet-models/tripo-fixed')
bpy.ops.wm.open_mainfile(filepath=os.path.join(folder, 'nailong-rigged.blend'))
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
if mesh.data.shape_keys:
    for shape in mesh.data.shape_keys.key_blocks: shape.value = 0
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
specs = {
    'chest': ((.14,.045,-.08), 'body'),
    'neck': ((.18,.045,.07), 'chest'),
    'handL': ((.29,-.27,-.045), 'forearmL'),
    'handR': ((.29,.34,-.12), 'forearmR'),
    'footL': ((.15,-.12,-.44), 'legL'),
    'footR': ((.15,.20,-.44), 'legR'),
    'tailMid': ((-.15,.035,-.29), 'tail'),
    'tailTip': ((-.25,.035,-.24), 'tailMid'),
}
for name,(position,parent) in specs.items():
    bone = rig.data.edit_bones.new(name)
    bone.head = position
    bone.tail = Vector(position)+Vector((0,0,.07))
    bone.parent = rig.data.edit_bones[parent]
rig.data.edit_bones['head'].parent = rig.data.edit_bones['neck']
for name in ['armL','armR']:
    rig.data.edit_bones[name].parent = rig.data.edit_bones['chest']
bpy.ops.object.mode_set(mode='OBJECT')
for name in specs: mesh.vertex_groups.new(name=name)
def smooth(a,b,x):
    t = max(0,min(1,(x-a)/(b-a)))
    return t*t*(3-2*t)
blink_source=mesh.data.shape_keys.key_blocks['Blink']
basis=mesh.data.shape_keys.key_blocks['Basis']
for name,left in [('BlinkLeft',True),('BlinkRight',False)]:
    shape=mesh.shape_key_add(name=name,from_mix=False)
    for index,vertex in enumerate(shape.data):
        vertex.co=basis.data[index].co
        y=vertex.co.y
        side=1-smooth(.008,.045,y) if left else smooth(.008,.045,y)
        vertex.co+=(blink_source.data[index].co-basis.data[index].co)*side
chew=mesh.shape_key_add(name='Chew',from_mix=False)
for index,vertex in enumerate(chew.data):
    vertex.co=basis.data[index].co
    x,y,z=vertex.co
    influence=smooth(.30,.39,x)*(1-smooth(.09,.15,abs(y-.035)))*smooth(.025,.065,z)*(1-smooth(.13,.19,z))
    vertex.co.z+=.009*influence
    vertex.co.x-=.0025*influence
smile=mesh.shape_key_add(name='ShySmile',from_mix=False)
for index,vertex in enumerate(smile.data):
    vertex.co=basis.data[index].co
    x,y,z=vertex.co
    influence=smooth(.32,.4,x)*(1-smooth(.08,.14,abs(y-.035)))*smooth(.025,.065,z)*(1-smooth(.13,.18,z))
    vertex.co.z+=(.112-z)*.23*influence
    vertex.co.y+=(.035-y)*.035*influence
for vertex in mesh.data.vertices:
    x,y,z = vertex.co
    weights = {mesh.vertex_groups[g.group].name:g.weight for g in vertex.groups}
    for side,distance in [('L',.045-y),('R',y-.045)]:
        mask=smooth(.17,.23,distance)*smooth(.12,.23,x)*(1-smooth(.06,.115,z))
        removed=0
        for name in ['arm'+side,'forearm'+side]:
            weight=weights.get(name,0)
            weights[name]=weight*mask
            removed+=weight*(1-mask)
        head_share=smooth(.035,.13,z)
        weights['head']=weights.get('head',0)+removed*head_share
        weights['body']=weights.get('body',0)+removed*(1-head_share)
    def split(parent,child,amount):
        w = weights.get(parent,0)*amount
        weights[parent] = weights.get(parent,0)-w
        weights[child] = weights.get(child,0)+w
    split('body','chest',smooth(-.23,.06,z)*.65)
    split('head','neck',(1-smooth(.08,.18,z))*.55)
    split('forearmL','handL',smooth(.26,.32,.045-y)*.65)
    split('forearmR','handR',smooth(.28,.34,y-.045)*.65)
    for side in ['L','R']: split('leg'+side,'foot'+side,(1-smooth(-.47,-.41,z))*.9)
    split('tail','tailMid',1-smooth(-.19,-.08,x))
    split('tailMid','tailTip',1-smooth(-.29,-.19,x))
    weights = sorted(((n,w) for n,w in weights.items() if w>1e-6), key=lambda p:p[1],reverse=True)[:4]
    total = sum(w for n,w in weights)
    for group in mesh.vertex_groups: group.remove([vertex.index])
    for name,w in weights: mesh.vertex_groups[name].add([vertex.index],w/total,'REPLACE')
rig.animation_data_clear()
scene = bpy.context.scene
scene.render.fps = 30
def key(frame,poses,locations=None):
    for bone in rig.pose.bones:
        bone.rotation_mode = 'XYZ'
        bone.rotation_euler = poses.get(bone.name,(0,0,0))
        bone.location = (locations or {}).get(bone.name,(0,0,0))
        bone.keyframe_insert('rotation_euler',frame=frame)
        bone.keyframe_insert('location',frame=frame)
def action(name,frames):
    rig.animation_data_create()
    clip = bpy.data.actions.new(name)
    rig.animation_data.action = clip
    for frame,poses,locations in frames:
        if name=='Wave':
            poses={bone:rotation for bone,rotation in poses.items() if bone in ['armL','forearmL','handL']}
            if 'armL' in poses:
                x,y,z=poses['armL']
                poses['armL']=(x*.35,y,z*.55)
            for part in ['forearmL','handL']:
                if part in poses:
                    x,y,z=poses[part]
                    poses[part]=(x*1.7,y,z)
        key(frame,poses,locations)
    for layer in clip.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for point in curve.keyframe_points:
                        point.interpolation = 'LINEAR' if name=='Walk' else 'BEZIER'
                        point.handle_left_type = 'AUTO_CLAMPED'
                        point.handle_right_type = 'AUTO_CLAMPED'
    clip.use_fake_user = True
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name,1,clip)
    strip.name = name
    track.mute = True
    rig.animation_data.action = None
    return clip
action('Idle',[(1,{},{}),(31,{'chest':(0,0,.012),'neck':(0,0,-.008),'tailMid':(0,.07,0)},{}),(61,{},{}),(91,{'chest':(0,0,.010),'head':(.025,-.025,0),'tailTip':(0,-.09,0)},{}),(121,{}, {})])
walk=[]
for f in range(1,62):
    phase=(f-1)/60*math.tau
    s=math.sin(phase)
    bob=.004*(1-math.cos(phase*2))
    poses={'chest':(.023*s,0,.018),'neck':(-.012*s,0,-.008),'head':(0,-.018*s,-.010),'armL':(0,0,-s*.20),'armR':(0,0,s*.20),'forearmL':(.02,0,-.06+.035*math.sin(phase-.6)),'forearmR':(-.02,0,-.06-.035*math.sin(phase-.6)),'handL':(0,0,.035*math.sin(phase-1)),'handR':(0,0,-.035*math.sin(phase-1)),'tail':(0,.045*math.sin(phase-.6),0),'tailMid':(0,.09*math.sin(phase-1),0),'tailTip':(0,.10*math.sin(phase-1.4),0)}
    locations={'body':(0,bob,0)}
    for side,p in [('L',phase),('R',phase+math.pi)]:
        cycle=(p/math.tau)%1
        if cycle<.6:
            forward=.025*(1-2*cycle/.6)
            lift=0
            pitch=0
        else:
            t=(cycle-.6)/.4
            forward=-.025+.05*t*t*(3-2*t)
            lift=math.sin(math.pi*t)**2*.030
            pitch=-.12*math.sin(math.tau*t)*math.sin(math.pi*t)
        locations['leg'+side]=(forward,lift-bob,0)
        poses['foot'+side]=(0,0,pitch)
    walk.append((f,poses,locations))
action('Walk',walk)
action('Wave',[(1,{},{}),(10,{'chest':(0,0,-.025),'head':(.03,-.05,.04),'armL':(.10,0,-.12)},{}),(22,{'armL':(.26,0,-.16),'forearmL':(.22,0,0),'handL':(.12,0,0),'head':(.03,-.06,.04)},{}),(32,{'armL':(-.14,0,-.16),'forearmL':(-.25,0,0),'handL':(-.18,0,0),'head':(.03,-.06,.04)},{}),(42,{'armL':(.26,0,-.16),'forearmL':(.25,0,0),'handL':(.18,0,0),'head':(.03,-.06,.04)},{}),(52,{'armL':(-.12,0,-.14),'forearmL':(-.18,0,0),'handL':(-.12,0,0)},{}),(68,{'armL':(.08,0,-.04)},{}),(84,{}, {})])
eat=[]
for f,amount,nod in [(1,0,0),(18,.5,-.015),(32,1,.04),(43,1,-.02),(54,1,.035),(65,1,-.018),(76,1,.03),(88,.8,0),(112,0,0),(138,0,0)]:
    eat.append((f,{'armL':(0,0,.15*amount),'armR':(0,0,.19*amount),'forearmL':(0,0,.16*amount),'forearmR':(0,0,.22*amount),'handL':(0,0,.045*amount),'handR':(0,0,.045*amount),'neck':(0,0,nod*.4),'head':(0,0,nod*.6),'tailMid':(0,nod*2,0)},{}))
action('Eat',eat)
cover_rotations={}
cover_locations={}
for side,target in [('L',Vector((.46,-.055,.20))),('R',Vector((.46,.13,.18)))]:
    for bone in rig.pose.bones:
        bone.rotation_mode='XYZ'
        bone.rotation_euler=(0,0,0)
        bone.location=(0,0,0)
    arm=rig.pose.bones['arm'+side]
    forearm=rig.pose.bones['forearm'+side]
    hand=rig.pose.bones['hand'+side]
    arm.location=(.035,.025,0)
    group=mesh.vertex_groups['hand'+side].index
    vertices=[v.co.copy() for v in mesh.data.vertices if any(g.group==group and g.weight>.15 for g in v.groups)]
    palm=sum(vertices,Vector())/len(vertices)
    local_palm=hand.bone.matrix_local.inverted()@palm
    def cost():
        bpy.context.view_layer.update()
        position=hand.matrix@local_palm
        return (position-target).length_squared+sum(a*a for b in [arm,forearm] for a in b.rotation_euler)*.00004
    for step in [.3,.15,.07,.03,.01]:
        for iteration in range(14):
            changed=False
            for bone in [arm,forearm]:
                for axis in range(3):
                    value=bone.rotation_euler[axis]
                    best=cost()
                    selected=value
                    for direction in [-1,1]:
                        candidate=max(-1.4,min(1.4,value+direction*step))
                        bone.rotation_euler[axis]=candidate
                        score=cost()
                        if score<best:
                            best=score
                            selected=candidate
                    bone.rotation_euler[axis]=selected
                    changed|=selected!=value
            if not changed: break
    cover_rotations[side]=(tuple(arm.rotation_euler),tuple(forearm.rotation_euler))
    arm.rotation_euler=(0,0,.2)
    forearm.rotation_euler=(0,0,.15)
    bpy.context.view_layer.update()
    difference=target-(hand.matrix@local_palm)
    local_difference=arm.bone.matrix_local.to_3x3().inverted()@difference
    cover_locations[side]=tuple(arm.location+local_difference)
    cover_rotations[side]=((0,0,.2),(0,0,.15))
    print('COVER_TARGET',side,list(hand.matrix@local_palm),cover_rotations[side])
shy=[]
for frame,cover in [(1,0),(12,.12),(30,1),(46,1),(64,.72),(82,.25),(108,0)]:
    poses={'neck':(0,0,-.02*cover),'head':(0,.025*cover,-.025*cover)}
    locations={}
    for side,sign in [('L',1),('R',-1)]:
        poses['arm'+side]=tuple(a*cover for a in cover_rotations[side][0])
        poses['forearm'+side]=tuple(a*cover for a in cover_rotations[side][1])
        locations['arm'+side]=tuple(a*cover for a in cover_locations[side])
    shy.append((frame,poses,locations))
action('Shy',shy)
scene.frame_set(1)
for bone in rig.pose.bones:
    bone.rotation_euler=(0,0,0)
    bone.location=(0,0,0)
rig.show_in_front = True
rig.data.display_type = 'STICK'
for shape in mesh.data.shape_keys.key_blocks: shape.value=0
mesh.active_shape_key_index=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder,'nailong-cover-face-study.blend'))
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
rig.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(root,'assets/pet-models/tripo-fixed/nailong-cover-face-study.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True)
print('ANIMATED_RIG',len(rig.data.bones),[a.name for a in bpy.data.actions])
