import * as T from 'three'
import { loadSculpt } from './sculpt'
import { Spring, actionEnvelope, type PetMood } from './motion'

const palette = { skin: '#ffda43', belly: '#fff3c2', claws: '#916134', iris: '#399421', dark: '#20130b', white: '#fffefa' }

export async function createNailong(canvas: HTMLCanvasElement) {
  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.toneMapping = T.NeutralToneMapping
  renderer.toneMappingExposure = .95
  const scene = new T.Scene()
  const camera = new T.OrthographicCamera(-1.85, 1.85, 3.8, -.2, .1, 30)
  camera.position.set(0, 2.5, 10)
  camera.lookAt(0, 1.8, 0)
  camera.top = 2; camera.bottom = -2
  camera.updateProjectionMatrix()
  scene.add(new T.HemisphereLight(0xfff9e9, 0xf6d795, 2.5))
  const key = new T.DirectionalLight(0xfff4db, 2.0)
  key.position.set(-3, 6, 5); scene.add(key)
  const rim = new T.DirectionalLight(0xffffff, 1.2)
  rim.position.set(3, 4, -3); scene.add(rim)
  const fill = new T.DirectionalLight(0xffffff, .45)
  fill.position.set(3, 2, 5); scene.add(fill)
  const skin = new T.MeshStandardMaterial({ color: palette.skin, roughness: .47, metalness: 0 })
  const bellyMat = new T.MeshStandardMaterial({ color: palette.belly, roughness: .8 })
  const clawMat = new T.MeshStandardMaterial({ color: palette.claws, roughness: .72 })
  const whiteMat = new T.MeshStandardMaterial({ color: palette.white, roughness: .28 })
  const irisMat = new T.MeshStandardMaterial({ color: palette.iris, roughness: .35 })
  const darkMat = new T.MeshStandardMaterial({ color: palette.dark, roughness: .5 })
  const pupilMat = new T.MeshBasicMaterial({ color: '#0c1007' })
  const shineMat = new T.MeshBasicMaterial({ color: '#ffffff' })
  const tongueMat = new T.MeshStandardMaterial({ color: '#ef9980', roughness: .8 })
  const ball = new T.SphereGeometry(1, 40, 32)
  function ellipsoid(parent: T.Object3D, material: T.Material, position: number[], scale: number[]) {
    const mesh = new T.Mesh(ball, material)
    mesh.position.set(position[0]!, position[1]!, position[2]!)
    mesh.scale.set(scale[0]!, scale[1]!, scale[2]!)
    parent.add(mesh)
    return mesh
  }
  const clawGeometry = new T.LatheGeometry([new T.Vector2(0,0),new T.Vector2(.70,0),new T.Vector2(.85,.12),new T.Vector2(.72,.38),new T.Vector2(.45,.72),new T.Vector2(.20,.94),new T.Vector2(0,1)],24)
  function claw(parent: T.Object3D, x: number, y: number, z: number, scale: number, tilt: number) {
    const mesh=new T.Mesh(clawGeometry,clawMat)
    mesh.position.set(x,y,z); mesh.scale.set(scale,scale*1.6,scale*.75)
    mesh.rotation.x=1.0; mesh.rotation.z=tilt; parent.add(mesh)
  }
  function curve(parent: T.Object3D, points: number[][], radius: number, mat: T.Material) {
    const path = new T.CatmullRomCurve3(points.map(p => new T.Vector3(p[0], p[1], p[2])))
    const mesh = new T.Mesh(new T.TubeGeometry(path, 28, radius, 8, false), mat)
    parent.add(mesh)
    return mesh
  }
  const root = new T.Group(); scene.add(root)
  const body = new T.Bone()
  const skinColor = new T.Color(palette.skin); const bellyColor = new T.Color(palette.belly)
  const expression = { value: .65 }
  const torsoMaterial = new T.MeshStandardMaterial({color:'#ffffff',roughness:.64})
  torsoMaterial.onBeforeCompile = shader => {
    shader.uniforms.petExpression = expression
    shader.uniforms.petSkin = { value: skinColor }
    shader.uniforms.petBelly = { value: bellyColor }
    shader.vertexShader = 'varying vec3 petPosition;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\npetPosition = position;')
    shader.fragmentShader = 'varying vec3 petPosition;\nuniform float petExpression;\nuniform vec3 petSkin;\nuniform vec3 petBelly;\n' + shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec2 spot = vec2(petPosition.x / (0.59 - (petPosition.y-1.13)*0.10), (petPosition.y - 1.13) / 0.77);
      float coverage = (1.0 - smoothstep(0.82, 1.12, dot(spot, spot))) * smoothstep(0.18, 0.36, petPosition.z);
      diffuseColor.rgb = mix(petSkin, petBelly, coverage);
      vec2 palm = vec2((abs(petPosition.x)-1.10)/.15,(petPosition.y-1.16)/.16);
      float pad = (1.0-smoothstep(.85,1.05,dot(palm,palm)))*smoothstep(.30,.35,petPosition.z);
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(1.0,.40,.29),pad);
      vec2 mouth = vec2(petPosition.x/.345,(petPosition.y-2.44)/(.25*petExpression+.055));
      float lower = -sqrt(max(0.0,1.0-mouth.x*mouth.x));
      float upper = .09-.15*mouth.x*mouth.x;
      float opening = smoothstep(lower-.035,lower+.035,mouth.y)*(1.0-smoothstep(upper-.025,upper+.025,mouth.y))*(1.0-smoothstep(.97,1.01,abs(mouth.x)))*smoothstep(.42,.52,petPosition.z);
      vec3 mouthColor = vec3(.055,.009,.009);
      float teeth = smoothstep(upper-.22,upper-.18,mouth.y);
      mouthColor = mix(mouthColor,vec3(1.0,.94,.75),teeth);
      float tongue = (1.0-smoothstep(.9,1.0,pow(mouth.x/.65,2.0)+pow((mouth.y+.97)/.24,2.0)))*(1.0-teeth);
      mouthColor = mix(mouthColor,vec3(.40,.10,.12),tongue);
      diffuseColor.rgb = mix(diffuseColor.rgb,mouthColor,opening);
    `)
  }
  const head = new T.Bone(); head.position.y = 1.84; body.add(head)
  const eyeGroups: T.Group[] = []
  const irises: T.Group[] = []
  for (const side of [-1, 1]) {
    const eye = new T.Group(); eye.position.set(side * .39, 1.01, .705); eye.rotation.y = side * .11; head.add(eye); eyeGroups.push(eye); eye.scale.setScalar(1.16)
    ellipsoid(eye, skin, [0, 0, -.018], [.174, .198, .050])
    ellipsoid(eye, whiteMat, [0, 0, .021], [.164, .184, .055])
    const iris = new T.Group(); iris.position.z = .068; eye.add(iris); irises.push(iris)
    ellipsoid(iris, darkMat, [0, 0, 0], [.136, .153, .021])
    ellipsoid(iris, irisMat, [0, 0, .015], [.121, .139, .023])
    ellipsoid(iris, pupilMat, [0, .008, .04], [.099, .117, .014])
    ellipsoid(iris, shineMat, [-.027, .06, .057], [.029, .033, .006])
    ellipsoid(iris, shineMat, [.04, -.04, .055], [.011, .012, .003])
  }
  const lids: T.Mesh[] = []
  for (const side of [-1,1]) {
    const lid = curve(head, [[side*.39-.14,1.00,.77],[side*.39,.965,.795],[side*.39+.14,1.00,.77]], .012, clawMat)
    lids.push(lid)
  }
  const arms: T.Bone[] = []
  const hands: T.Bone[] = []
  const elbows: T.Bone[] = []
  for (const side of [-1,1]) {
    const arm = new T.Bone(); arm.position.set(side*.73,1.67,0); body.add(arm); arms.push(arm)
    const elbow = new T.Bone(); elbow.position.set(side*.26,-.28,.05); arm.add(elbow); elbows.push(elbow)
    const hand = new T.Bone(); hand.position.set(side*.11,-.23,.135); elbow.add(hand); hands.push(hand)
    for (let i=0;i<3;i++) claw(hand,(i-1)*.13,-.13+Math.abs(i-1)*.025,.17,.057,(1-i)*.18)
  }
  const feet: T.Bone[] = []
  for (const side of [-1,1]) {
    const foot = new T.Bone(); foot.position.set(side*.46,.16,.13); body.add(foot); feet.push(foot)
    for(let i=0;i<3;i++) claw(foot,(i-1)*.135,-.09,.27,.072,(1-i)*.1)
  }
  const tail = new T.Bone(); tail.position.set(-.46,.6,-.32); body.add(tail)
  const sculpt = await loadSculpt(torsoMaterial,[body,head,...arms,...feet,tail,...hands,...elbows]).catch(error => {
    const geometries = new Set<T.BufferGeometry>()
    const materials = new Set<T.Material>([skin,bellyMat,clawMat,whiteMat,irisMat,darkMat,pupilMat,shineMat,tongueMat,torsoMaterial])
    body.traverse(object => { if (object instanceof T.Mesh) geometries.add(object.geometry) })
    geometries.forEach(geometry => geometry.dispose())
    materials.forEach(material => material.dispose())
    renderer.dispose()
    throw error
  })
  root.add(sculpt)
  const snack = new T.Group(); snack.position.set(0,1.5,.8); body.add(snack)
  ellipsoid(snack,clawMat,[0,0,0],[.23,.12,.12])
  ellipsoid(snack,bellyMat,[0,.065,0],[.23,.08,.12])
  ellipsoid(snack,tongueMat,[0,.14,0],[.055,.055,.055])
  const particles = new T.Group(); scene.add(particles)
  const hearts: T.Mesh[] = []
  const heartShape = new T.Shape()
  heartShape.moveTo(0,-.11); heartShape.bezierCurveTo(-.3,.08,-.14,.3,0,.14); heartShape.bezierCurveTo(.14,.3,.3,.08,0,-.11)
  const heartGeometry = new T.ShapeGeometry(heartShape)
  for(let i=0;i<4;i++) {
    const material = new T.MeshBasicMaterial({color:'#ee9470', transparent:true, depthWrite:false, side:T.DoubleSide})
    const h = new T.Mesh(heartGeometry,material); particles.add(h); hearts.push(h)
  }
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width=128; shadowCanvas.height=128
  const ctx=shadowCanvas.getContext('2d')!
  const gradient=ctx.createRadialGradient(64,64,4,64,64,64)
  gradient.addColorStop(0,'rgba(75,48,12,.25)'); gradient.addColorStop(1,'rgba(75,48,12,0)')
  ctx.fillStyle=gradient; ctx.fillRect(0,0,128,128)
  const shadowTexture=new T.CanvasTexture(shadowCanvas)
  const shadow = new T.Mesh(new T.PlaneGeometry(2.7,1.2),new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false}))
  shadow.rotation.x=-Math.PI/2; shadow.position.y=-.025; scene.add(shadow)
  let mood: PetMood='idle'; let actionTime=0; let time=0; let previous=0
  let nextBlink=2; let blinkTime=10; let nextLook=3; let wandering=0; let pointerInside=false
  let targetX=0; let targetY=0; let visible=true; let disposed=false
  const reduce=matchMedia('(prefers-reduced-motion: reduce)')
  const springs = { x:new Spring(0,85,16), y:new Spring(0,85,16), bounce:new Spring(0,220,19), turn:new Spring(.08,75,15), tilt:new Spring(0,90,15), squash:new Spring(1,180,16), left:new Spring(0,110,16), right:new Spring(0,110,16), sleep:new Spring(0,65,16), grin:new Spring(0,120,20), head:new Spring(0,80,13), belly:new Spring(0,100,9) }
  function resize() {
    const rect=canvas.getBoundingClientRect()
    if(rect.width && rect.height) renderer.setSize(rect.width,rect.height,false)
  }
  const observer=new ResizeObserver(resize); observer.observe(canvas); resize()
  const observerVisible=new IntersectionObserver(([entry]) => { visible=entry?.isIntersecting ?? true; updateLoop() })
  observerVisible.observe(canvas)
  function render(now: number) {
    if(disposed) return
    const dt=previous ? Math.min((now-previous)/1000,.05) : 1/60; previous=now
    if(!reduce.matches) { time+=dt; actionTime+=dt; blinkTime+=dt }
    if(time>nextBlink) { blinkTime=0; nextBlink=time+3+Math.random()*3 }
    if(time>nextLook) { wandering=(Math.random()-.5)*.5; nextLook=time+3+Math.random()*4 }
    const awake=mood==='sleep' ? 0 : 1
    const sleeping=springs.sleep.step(1-awake,dt)
    const action=reduce.matches ? 0 : actionEnvelope(actionTime,mood==='dance'?6:2.5)
    const happy=mood==='happy'?action:0
    const dance=mood==='dance'?action:0
    const eat=mood==='eat'?actionEnvelope(actionTime,4.6):0
    const wave=mood==='wave'?action:0
    const drag=mood==='drag'?1:0
    const bellyPoke=mood==='belly'?action:0
    const gazeX=springs.x.step(pointerInside?targetX:wandering,dt)*awake
    const gazeY=springs.y.step(pointerInside?targetY:0,dt)*awake
    const hop=happy*Math.max(0,Math.sin((actionTime-.18)*Math.PI*1.35))*.42
    const anticip=happy*Math.max(0,1-actionTime/.25)*-.1
    const jump=springs.bounce.step(hop+anticip,dt)
    const sway=dance*Math.sin(actionTime*5.2)
    const tilt=springs.tilt.step(.025-gazeX*.055+sway*.14+drag*.13,dt)
    root.position.y=jump+drag*.08
    root.rotation.y=springs.turn.step(.1+gazeX*.2+dance*Math.sin(actionTime*2.6)*.3,dt)
    body.rotation.z=tilt
    const squash=springs.squash.step(1+Math.sin(time*1.8)*.008-sway*.016+happy*Math.sin(actionTime*8)*.018-sleeping*.065,dt)
    body.scale.set(1/Math.sqrt(squash),squash,1/Math.sqrt(squash))
    body.position.y=Math.sin(time*1.8)*.006
    head.rotation.z=springs.head.step(-.085+Math.sin(time*.65)*.028-tilt*.55+happy*Math.sin(actionTime*5)*.06-sleeping*.12,dt)
    head.rotation.x=gazeY*.065+sleeping*.18+eat*Math.sin(actionTime*14)*.035
    head.rotation.y=gazeX*.06
    head.position.y=1.84-sleeping*.06
    const leftTarget=-.35-sway*.55-happy*.8-eat*.6-drag*.65
    const rightTarget=.03+sway*.55+happy*.8+wave*(1.6+Math.sin(actionTime*8)*.22)+eat*.6+drag*.65
    arms[0]!.rotation.z=springs.left.step(leftTarget,dt)
    arms[1]!.rotation.z=springs.right.step(rightTarget,dt)
    arms[0]!.rotation.x=-eat*.8; arms[1]!.rotation.x=-eat*.8
    elbows.forEach((elbow,i)=>{
      const side=i===0?-1:1
      elbow.rotation.z=side*(.10+wave*(i===1?.20:0)+dance*.12*Math.sin(actionTime*5.2-.5))
      elbow.rotation.x=-.12-eat*.48-wave*(i===1?.20:0)
    })
    hands.forEach((hand,i)=>{hand.rotation.z=Math.sin(time*1.5-i)*.045+wave*(i===1?Math.sin(actionTime*8-0.5)*.24:0); hand.rotation.y=(i===0?-.12:.12)+eat*.25})
    feet.forEach((foot,i)=>{foot.position.y=.16+Math.max(0,Math.sin(actionTime*5.2+i*Math.PI))*dance*.11; foot.rotation.z=i===0?-.035:.035; foot.rotation.x=-dance*.12*Math.sin(actionTime*5.2+i*Math.PI)})
    const jiggle=springs.belly.step(bellyPoke*Math.sin(actionTime*13)*.12,dt)
    body.scale.z += Math.abs(jiggle)*.25
    tail.rotation.y=Math.sin(time*2.2-.6)*.12+tilt*.6
    const blink=blinkTime<.19?Math.sin(blinkTime/.19*Math.PI):0
    const eyeOpen=Math.max(.035,(1-blink)*(1-sleeping))
    eyeGroups.forEach(eye=>{eye.scale.y=eyeOpen*1.16; eye.visible=sleeping<.9})
    lids.forEach(lid=>{lid.visible=sleeping>=.9})
    irises.forEach(iris=>{iris.position.x=gazeX*.027; iris.position.y=gazeY*.03})
    const grin=springs.grin.step( .2+happy*.5+eat*(.45+Math.sin(actionTime*13)*.15)+bellyPoke*.6,dt)
    expression.value=.65+grin*.4-sleeping*.62
    if(sculpt.morphTargetInfluences) sculpt.morphTargetInfluences[0]=sleeping
    snack.visible=eat>.04
    snack.position.y=1.5+eat*.48+Math.sin(actionTime*13)*.015
    snack.scale.setScalar(Math.max(.03,1-actionTime/4.8))
    shadow.scale.setScalar(1-jump*.3)
    hearts.forEach((heart,i)=>{
      const phase=(actionTime*.7+i*.23)%1
      heart.visible=happy>.15
      heart.position.set((i%2?1:-1)*(.8+i*.12),2.2+phase*1.3,.5)
      heart.rotation.z=Math.sin(time*2+i)*.2
      heart.scale.setScalar(.55+i*.08)
      ;(heart.material as T.MeshBasicMaterial).opacity=(1-phase)*happy
    })
    renderer.render(scene,camera)
  }
  function updateLoop() {
    previous=0
    renderer.setAnimationLoop(visible&&!document.hidden?render:null)
  }
  document.addEventListener('visibilitychange',updateLoop)
  updateLoop()
  return {
    setMood(next: string) { mood=next as PetMood; actionTime=0 },
    look(x: number,y: number) { targetX=T.MathUtils.clamp(x,-1,1); targetY=T.MathUtils.clamp(y,-1,1); pointerInside=true },
    leave() { pointerInside=false },
    dispose() {
      disposed=true; renderer.setAnimationLoop(null); observer.disconnect(); observerVisible.disconnect()
      document.removeEventListener('visibilitychange',updateLoop)
      const geometries=new Set<T.BufferGeometry>(); const materials=new Set<T.Material>()
      scene.traverse(object=>{ if(object instanceof T.Mesh) { geometries.add(object.geometry); (Array.isArray(object.material)?object.material:[object.material]).forEach(mat=>materials.add(mat)) } })
      geometries.forEach(geometry=>geometry.dispose()); materials.forEach(material=>material.dispose()); shadowTexture.dispose(); sculpt.skeleton.dispose(); renderer.dispose()
    },
  }
}
