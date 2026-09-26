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
for ids in sorted(groups,key=len,reverse=True)[:30]:
 ps=[o.data.vertices[i].co for i in ids]
 print('COMP',len(ids),[round(min(p[k] for p in ps),4) for k in range(3)],[round(max(p[k] for p in ps),4) for k in range(3)])

