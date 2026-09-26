import bpy,json
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=r'E:\炫酷主页\assets\pet-models\tripo-review\desktop-candidate.glb')
o=next(o for o in bpy.context.scene.objects if o.type=='MESH')
bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
import bmesh
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=0.00001);bm.to_mesh(o.data);bm.free()
adj=[[] for v in o.data.vertices]
for e in o.data.edges:
 a,b=e.vertices;adj[a].append(b);adj[b].append(a)
seen=set();groups=[]
for i in range(len(adj)):
 if i in seen:continue
 stack=[i];seen.add(i);ids=[]
 while stack:
  j=stack.pop();ids.append(j)
  for k in adj[j]:
   if k not in seen:seen.add(k);stack.append(k)
 groups.append(ids)

main=max(groups,key=len)
fragments=[ids for ids in groups if ids is not main and all(o.data.vertices[i].co.y<-.32 and o.data.vertices[i].co.z<-.44 for i in ids)]
if len(fragments)!=1:raise RuntimeError('Expected one isolated foot text fragment')
removed=[i for ids in fragments for i in ids]
bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm,geom=[bm.verts[i] for i in removed],context='VERTS');bm.to_mesh(o.data);bm.free()
import math,os
for v in o.data.vertices:
 x,y,z=v.co
 if x<-.06:
  v.co.x=-.06+(x+.06)*.72
 mouth=math.exp(-((y-.07)/.15)**4-((z-.155)/.07)**4)*max(0,min(1,(x-.33)/.09))
 v.co.x-=.016*mouth
 arm=math.exp(-((z+.015)/.12)**4)*max(0,min(1,(abs(y-.045)-.16)/.10))*max(0,min(1,(x-.08)/.12))
 v.co.y+=(1 if y>.045 else -1)*.025*arm
for p in o.data.polygons:p.use_smooth=True
o.data.update()
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out=os.path.join(root,'assets/pet-models/tripo-fixed');os.makedirs(out,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out,'nailong-fixed.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(out,'nailong-fixed.glb'),export_format='GLB',use_selection=True)
print('REMOVED',len(removed),'REMAINING',len(o.data.vertices),len(o.data.polygons))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=os.path.join(out,'nailong-fixed.glb'))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
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
