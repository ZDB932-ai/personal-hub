import bpy, os, json
import numpy as np
from mathutils import Vector

root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
folder=os.path.join(root,'assets/pet-models/tripo-fixed')
bpy.ops.wm.open_mainfile(filepath=os.path.join(folder,'nailong-rigged.blend'))
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
keys=mesh.data.shape_keys.key_blocks
for key in keys: key.value=0
mesh.active_shape_key_index=0
original=np.array([v.co[:] for v in keys['Basis'].data],dtype=np.float64)
x,y,z=original.T
def smooth(a,b,v):
    t=np.clip((v-a)/(b-a),0,1)
    return t*t*(3-2*t)
mask=np.ones(len(original))
for ey,ez in [(-.073,.290),(.126,.256)]:
    radius=np.sqrt(((y-ey)/.088)**2+((z-ez)/.083)**2)
    mask*=1-(1-smooth(1,1.5,radius))*smooth(.28,.35,x)
mouth=np.sqrt(((y-.035)/.155)**2+((z-.10)/.09)**2)
mask*=1-(1-smooth(1,1.45,mouth))*smooth(.26,.36,x)
mask*=smooth(-.42,-.34,z)
hand_band=(1-smooth(.07,.16,z))*smooth(-.27,-.16,z)*smooth(.16,.24,np.abs(y-.045))
mask*=1-hand_band
edges=np.array([e.vertices[:] for e in mesh.data.edges],dtype=np.int32)
from collections import Counter
usage=Counter(edge for polygon in mesh.data.polygons for edge in polygon.edge_keys)
boundary={vertex for edge,count in usage.items() if count==1 for vertex in edge}
neighbors=[set() for _ in original]
for a,b in edges:
    neighbors[a].add(b)
    neighbors[b].add(a)
frontier=boundary.copy()
visited=boundary.copy()
for ring in range(5):
    for vertex in frontier: mask[vertex]*=ring/5
    frontier={neighbor for vertex in frontier for neighbor in neighbors[vertex]}-visited
    visited.update(frontier)
_,representatives,inverse=np.unique(np.round(original,6),axis=0,return_index=True,return_inverse=True)
surface=original[representatives]
surface_mask=mask[representatives]
edges=np.unique(np.sort(inverse[edges],axis=1),axis=0)
edges=edges[edges[:,0]!=edges[:,1]]
src=np.concatenate((edges[:,0],edges[:,1]))
dst=np.concatenate((edges[:,1],edges[:,0]))
degree=np.bincount(src,minlength=len(surface))
positions=surface.copy()
for iteration in range(36):
    for coefficient in [.45,-.47]:
        summed=np.zeros_like(positions)
        np.add.at(summed,src,positions[dst])
        average=summed/np.maximum(1,degree)[:,None]
        positions+=(average-positions)*surface_mask[:,None]*coefficient
delta=(positions-surface)[inverse]
length=np.linalg.norm(delta,axis=1)
delta*=np.minimum(1,.006/np.maximum(length,1e-12))[:,None]
for key in keys:
    for vertex,offset in zip(key.data,delta): vertex.co+=Vector(offset)
for vertex,position in zip(mesh.data.vertices,original+delta): vertex.co=position
for polygon in mesh.data.polygons: polygon.use_smooth=True
for material in mesh.data.materials:
    if not material or not material.use_nodes: continue
    for node in material.node_tree.nodes:
        if node.type=='NORMAL_MAP': node.inputs['Strength'].default_value=.5
mesh.data.update()
report={'vertices':len(original),'moved_vertices':int(np.sum(np.linalg.norm(delta,axis=1)>1e-6)),'max_displacement':float(np.max(np.linalg.norm(delta,axis=1))),'mean_displacement':float(np.mean(np.linalg.norm(delta,axis=1))),'normal_strength':.5}
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder,'nailong-refined-rigged.blend'))
with open(os.path.join(folder,'surface-refinement.json'),'w') as f: json.dump(report,f,indent=2)
print('SURFACE_REFINED',json.dumps(report))
