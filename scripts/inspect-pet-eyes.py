import bpy, os, numpy as np
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(root,'assets/pet-models/tripo-fixed/nailong-fixed.blend'))
mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
material = mesh.data.materials[0]
shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
image = shader.inputs['Base Color'].links[0].from_node.image
pixels = np.array(image.pixels[:]).reshape(image.size[1],image.size[0],4)
found = [[],[]]
for loop in mesh.data.loops:
    p = mesh.data.vertices[loop.vertex_index].co
    if p.x < .3 or p.z < .2: continue
    uv = mesh.data.uv_layers.active.data[loop.index].uv
    r,g,b,_ = pixels[min(int(uv.y*image.size[1]),image.size[1]-1),min(int(uv.x*image.size[0]),image.size[0]-1)]
    if g > r*1.25 and g > b*1.2 and g > .04:
        found[int(p.y>.04)].append(list(p))
for points in found:
    a = np.array(points)
    print('EYE',len(a),'MIN',a.min(axis=0),'MAX',a.max(axis=0),'CENTER',a.mean(axis=0))
