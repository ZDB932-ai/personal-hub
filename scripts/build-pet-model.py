import bpy, math, json, os
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
parts=[]
def ell(name,pos,scale):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=32,location=pos)
    o=bpy.context.object; o.name=name; o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    parts.append(o)
    return o
torso=ell('weighted pear torso',(0,1.16,.015),(.79,.83,.64))
for v in torso.data.vertices:
    q=v.co.y/.83
    v.co.x*=1-.14*q
    v.co.z*=1-.09*q

ell('soft neck',(0,1.87,-.16),(.56,.54,.44))
head=ell('pear shaped head',(0,2.59,.11),(.92,.99,.70))
for v in head.data.vertices:
    q=max(-1,min(1,v.co.y/.99))
    shoulder=max(.03,1-q*q)**(-.065)
    v.co.x*=shoulder*(1-.035*max(q,0)+.055*max(-q,0))
    if q>0:v.co.y=.97*q
    if q<0:v.co.y=-.91*abs(q)**.88

for s in [-1,1]:
    ell('shoulder',(s*.73,1.67,-.01),(.23,.25,.245))
    for j in range(9):
        t=j/8
        x=(1-t)**2*.76+2*(1-t)*t*1.12+t*t*1.10
        y=(1-t)**2*1.65+2*(1-t)*t*1.36+t*t*1.16
        z=.015+.17*t*t
        r=.225-.045*math.sin(t*math.pi)
        ell('curved arm',(s*x,y,z),(r,r*1.15,r))
    ell('palm',(s*1.10,1.16,.185),(.255,.26,.205))
    ell('thigh',(s*.46,.39,-.005),(.30,.49,.34))
    ell('foot',(s*.46,.16,.13),(.32,.20,.37))
for i in range(12):
    t=i/11
    ell('tail',( -.48-.73*t,.61+.25*t*t,-.28-.26*math.sin(t*math.pi/2)),(.29*(1-t)+.055,.25*(1-t)+.045,.27*(1-t)+.045))
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.object.join()
o=bpy.context.object;o.name='Nailong_ContinuousSkin'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
o.data.remesh_voxel_size=.027
bpy.ops.object.voxel_remesh()
s=o.modifiers.new('Sculpt polish','SMOOTH');s.factor=1.2;s.iterations=16
bpy.ops.object.modifier_apply(modifier=s.name)
d=o.modifiers.new('Desktop topology','DECIMATE');d.ratio=.12
bpy.ops.object.modifier_apply(modifier=d.name)
s=o.modifiers.new('Surface finish','SUBSURF');s.levels=1
bpy.ops.object.modifier_apply(modifier=s.name)
for v in o.data.vertices:
    x,y,z=v.co
    mx=x/.345
    my=(y-2.44)/.24
    if z>.52 and abs(mx)<1 and -1<my<.05:
        mask=max(0,1-mx*mx)*max(0,1-((my+.475)/.525)**2)
        v.co.z-=.15*mask**.65
    if v.co.y<.035:v.co.y=.035
for p in o.data.polygons:p.use_smooth=True
o.data.calc_loop_triangles()
positions=[round(c,6) for v in o.data.vertices for c in v.co]
normals=[round(c,6) for v in o.data.vertices for c in v.normal]
indices=[i for tri in o.data.loop_triangles for i in tri.vertices]
adj=[set() for v in o.data.vertices]
for e in o.data.edges:
    a,b=e.vertices;adj[a].add(b);adj[b].add(a)
seen=set();components=0
for i in range(len(adj)):
    if i in seen:continue
    components+=1;stack=[i];seen.add(i)
    while stack:
        for j in adj[stack.pop()]:
            if j not in seen:seen.add(j);stack.append(j)
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(root,'public/pets/nailong-sculpt.json'),'w') as f:json.dump(dict(positions=positions,normals=normals,indices=indices),f,separators=(',',':'))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root,'assets/pet-models/nailong-sculpt.blend'))
print(json.dumps(dict(vertices=len(o.data.vertices),triangles=len(o.data.loop_triangles),connected_components=components)))

