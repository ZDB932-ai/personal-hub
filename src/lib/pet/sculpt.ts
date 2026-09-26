import * as T from 'three'

export async function loadSculpt(material: T.Material, bones: T.Bone[]) {
  const response = await fetch('/pets/nailong-sculpt.json')
  if (!response.ok) throw new Error('角色模型加载失败')
  const data = await response.json() as { positions: number[]; normals: number[]; indices: number[] }
  const geometry = new T.BufferGeometry()
  geometry.setAttribute('position', new T.Float32BufferAttribute(data.positions, 3))
  geometry.setAttribute('normal', new T.Float32BufferAttribute(data.normals, 3))
  geometry.setIndex(data.indices)
  const closedMouth = data.positions.slice()
  for(let i=0;i<closedMouth.length;i+=3) {
    const mx=closedMouth[i]!/.345, my=(closedMouth[i+1]!-2.44)/.24
    if(closedMouth[i+2]!>.38 && Math.abs(mx)<1 && my>-1 && my<.05) {
      const mask=Math.max(0,1-mx*mx)*Math.max(0,1-((my+.475)/.525)**2)
      closedMouth[i+2]!+=.15*mask**.65
    }
  }
  geometry.morphAttributes.position=[new T.Float32BufferAttribute(closedMouth,3)]
  const closedGeometry=new T.BufferGeometry()
  closedGeometry.setAttribute('position',new T.Float32BufferAttribute(closedMouth,3))
  closedGeometry.setIndex(data.indices)
  closedGeometry.computeVertexNormals()
  geometry.morphAttributes.normal=[closedGeometry.getAttribute('normal').clone()]
  closedGeometry.dispose()
  const weights: number[] = [], indices: number[] = []
  for (let i=0;i<data.positions.length;i+=3) {
    const x=data.positions[i]!, y=data.positions[i+1]!, z=data.positions[i+2]!
    const head=T.MathUtils.smoothstep(y,1.73,2.22)
    const arm=T.MathUtils.smoothstep(Math.abs(x),.75,.96)*(1-T.MathUtils.smoothstep(y,1.62,1.95))*T.MathUtils.smoothstep(y,.64,.95)
    const forearm=arm*(1-T.MathUtils.smoothstep(y,1.28,1.55))
    const wrist=forearm*(1-T.MathUtils.smoothstep(y,1.08,1.28))
    const foot=(1-T.MathUtils.smoothstep(y,.25,.58))*T.MathUtils.smoothstep(Math.abs(x),.08,.32)
    const tail=T.MathUtils.smoothstep(-x,.67,1.05)*(1-T.MathUtils.smoothstep(z,-.26,-.05))*(1-T.MathUtils.smoothstep(y,.9,1.15))
    const candidates=[[1,head],[x<0?2:3,arm-forearm],[x<0?9:10,forearm-wrist],[x<0?7:8,wrist],[x<0?4:5,foot],[6,tail]]
    const sum=candidates.reduce((n,p)=>n+p[1]!,0)
    candidates.push([0,Math.max(0,1-sum)])
    candidates.sort((a,b)=>b[1]!-a[1]!)
    const selected=candidates.slice(0,4)
    const total=selected.reduce((n,p)=>n+p[1]!,0)
    for(const pair of selected) {indices.push(pair[0]!);weights.push(pair[1]!/total)}
  }
  geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4))
  geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4))
  const mesh=new T.SkinnedMesh(geometry,material)
  mesh.add(bones[0]!)
  bones[0]!.updateMatrixWorld(true)
  mesh.bind(new T.Skeleton(bones))
  mesh.frustumCulled=false
  return mesh
}
