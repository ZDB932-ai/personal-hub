import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Spring, PetActionBlend } from './motion'
import { distancePhase } from './gait'
import { turnToward } from './navigation'
import { gesture, shyExpression, peekExpression } from './personality'

export async function createNailong(canvas: HTMLCanvasElement) {
  const loader = new GLTFLoader()
  loader.register(parser => {
    parser.textureLoader = new T.TextureLoader(loader.manager)
    return { name: 'PetImageTextures' }
  })
  const gltf = await loader.loadAsync('/pets/nailong-animated.glb')
  let missingTexture = false
  gltf.scene.traverse(object => {
    if (object instanceof T.Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      if (materials.some(material => material instanceof T.MeshStandardMaterial && !material.map)) missingTexture = true
    }
  })
  if (missingTexture) throw new Error('奶龙颜色贴图加载失败')
  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.toneMapping = T.NeutralToneMapping
  const scene = new T.Scene()
  const camera = new T.OrthographicCamera(-.65,.65,.65,-.65,.1,10)
  camera.position.set(0,.03,3)
  camera.lookAt(0,0,0)
  scene.add(new T.HemisphereLight(0xffffff,0xb2a48d,2.2))
  const key = new T.DirectionalLight(0xfff8ec,2.5)
  key.position.set(-3,4,5)
  scene.add(key)
  const fill = new T.DirectionalLight(0xffffff,1)
  fill.position.set(3,2,1)
  scene.add(fill)
  const root = new T.Group()
  root.rotation.y = -Math.PI/2
  root.add(gltf.scene)
  scene.add(root)
  const cake = new T.Group()
  const cakeBase = new T.Mesh(new T.CylinderGeometry(.065,.065,.045,24),new T.MeshStandardMaterial({color:0xe7ae6b,roughness:.8}))
  const icing = new T.Mesh(new T.CylinderGeometry(.067,.067,.015,24),new T.MeshStandardMaterial({color:0xfff1d7,roughness:.65}))
  icing.position.y = .03
  const berry = new T.Mesh(new T.SphereGeometry(.018,16,12),new T.MeshStandardMaterial({color:0xd85848,roughness:.6}))
  berry.position.y = .05
  cake.add(cakeBase,icing,berry)
  root.add(cake)
  const bones = new Map<string,T.Bone>()
  const faces: T.Mesh[] = []
  const rests = new Map<string,T.Quaternion>()
  gltf.scene.traverse(o => {
    if (o instanceof T.Bone) { bones.set(o.name,o); rests.set(o.name,o.quaternion.clone()) }
    if (o instanceof T.SkinnedMesh) o.frustumCulled = false
    if (o instanceof T.Mesh && o.morphTargetDictionary && ['Blink','BlinkLeft','BlinkRight'].some(key=>o.morphTargetDictionary![key]!==undefined)) faces.push(o)
  })
  const mixer = new T.AnimationMixer(gltf.scene)
  const clips = new Map(gltf.animations.map(clip => [clip.name,mixer.clipAction(clip)]))
  for (const name of ['Idle','Walk','Run','Wave','Eat','Shy','Dance','Peek']) {
    const clip = clips.get(name)
    if (!clip) throw new Error(`缺少宠物动画：${name}`)
    clip.setEffectiveWeight(0).play()
    if (name !== 'Idle' && name !== 'Walk' && name !== 'Run') { clip.setLoop(T.LoopOnce,1); clip.clampWhenFinished = true }
  }
  function pose(name: string,x: number,y: number,z: number) {
    const bone = bones.get(name)
    const rest = rests.get(name)
    if (bone && rest) bone.quaternion.multiply(delta.setFromEuler(euler.set(x,y,z)))
  }
  const delta = new T.Quaternion()
  const euler = new T.Euler()
  const gazeX = new Spring(0,80,18), gazeY = new Spring(0,80,18)
  const actions = new PetActionBlend()
  let eatStart = 0, bellyStart = 0
  let targetX = 0, targetY = 0, time = 0, looking = false
  let nextBlink = 2.5, blinkStart = -10
  let doubleBlink = false
  const eyelids = new Spring(0,110,22)
  const heading = new Spring(0,65,18)
  let rotation = 0, runDirection = 1, previewRun = false
  let paceTarget = 0, gaitPhase = 0
  let traveled = 0, previousDistance = 0
  let spinBase = 0, spinTarget = 0, spinStart = -10, peekStart = -10, shyStart = -10
  const spinSpring = new Spring(0,95,22)
  const paceSpring = new Spring(0,95,22)
  let visible = true, frame = 0, previous = 0, disposed = false, canvasHeight = 240
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const resize = new ResizeObserver(() => {
    const rect = canvas.getBoundingClientRect()
    canvasHeight = Math.max(1,rect.height)
    renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false)
    const ratio = rect.width/Math.max(1,rect.height)
    camera.left = -.65*ratio; camera.right = .65*ratio
    camera.updateProjectionMatrix()
  })
  resize.observe(canvas)
  function tick(now: number) {
    if (disposed) return
    const dt = previous ? Math.min((now-previous)/1000,.05) : 0
    previous = now; time += dt
    const weights = actions.step(dt)
    const peeking = peekExpression(time-peekStart)
    const bashful = shyExpression(time-shyStart)
    const twirl = gesture(time-spinStart)
    const motion = reduced.matches ? .15 : 1
    const sleep = weights.sleep
    if (time >= nextBlink && sleep < .1 && !reduced.matches) {
      blinkStart = time
      const repeat = !doubleBlink && Math.random()<.18
      doubleBlink = repeat
      nextBlink = time+(repeat ? .38 : 3+Math.random()*4)
    }
    const blinkTime = time-blinkStart
    const blinkAt = (t: number) => t<0 ? 0 : t<.075 ? T.MathUtils.smoothstep(t,0,.075) : 1-T.MathUtils.smoothstep(t,.09,.25)
    const restingLids = T.MathUtils.clamp(eyelids.step(sleep+(weights.shy*bashful.lids+weights.peek*peeking.lids)*motion,dt),0,1)
    const chewTime = time-eatStart
    const chewing = weights.eat*motion*T.MathUtils.smoothstep(chewTime,.9,1.2)*(1-T.MathUtils.smoothstep(chewTime,2.9,3.4))
    const idleLook = looking || reduced.matches ? 0 : Math.sin(time*.48)*Math.pow(Math.max(0,Math.sin(time*.19)),4)*.45*(1-sleep)
    const attention = (1-weights.shy*(1-bashful.attention))*(1-weights.dance*.8)*(1-weights.peek*(1-peeking.attention))
    const gx = gazeX.step((targetX+idleLook)*(1-sleep)*attention,dt), gy = gazeY.step(targetY*(1-sleep)*attention,dt)
    const breath = Math.sin(time*2.2)*(reduced.matches ? .001 : .004)
    const run = weights.run*motion
    const pace = paceSpring.step(paceTarget,dt)
    const sprint = T.MathUtils.smoothstep(pace,1.2,2.1)
    if (previewRun) gaitPhase += dt*(1.6+.9*sprint)*Math.min(1,Math.max(0,pace))
    else gaitPhase += distancePhase(Math.max(0,traveled-previousDistance),sprint,canvasHeight)
    previousDistance = traveled
    const clipWeights = { Walk: run*(1-sprint), Run: run*sprint, Wave: (weights.wave+weights.happy)*motion, Eat: weights.eat*motion, Shy: weights.shy*motion, Dance: weights.dance*motion, Peek: weights.peek*motion }
    const clipTotal = Object.values(clipWeights).reduce((sum,value) => sum+value,0)
    clips.get('Idle')!.setEffectiveWeight(Math.max(0,1-clipTotal))
    for (const [name,weight] of Object.entries(clipWeights)) clips.get(name)!.setEffectiveWeight(weight/Math.max(1,clipTotal))
    for(const name of ['Walk','Run']) {
      const walking=clips.get(name)!
      walking.time=(gaitPhase%1)*walking.getClip().duration
      walking.setEffectiveTimeScale(0)
    }
    for (const [name,bone] of bones) bone.quaternion.copy(rests.get(name)!)
    mixer.update(dt)
    for (const [name,bone] of bones) rests.get(name)!.copy(bone.quaternion)
    for (const face of faces) {
      const dictionary=face.morphTargetDictionary!, values=face.morphTargetInfluences!
      const left=Math.max(restingLids,reduced.matches ? 0 : blinkAt(blinkTime))
      const right=Math.max(restingLids,reduced.matches ? 0 : blinkAt(blinkTime-.018))
      const separate=dictionary.BlinkLeft!==undefined || dictionary.BlinkRight!==undefined
      if(dictionary.Blink!==undefined) values[dictionary.Blink]=separate ? 0 : left
      if(dictionary.BlinkLeft!==undefined) values[dictionary.BlinkLeft]=left
      if(dictionary.BlinkRight!==undefined) values[dictionary.BlinkRight]=right
      const closure=dictionary.BlinkLeft!==undefined ? left : right
      for(let step=1;step<8;step++) {
        const index=dictionary[`LidArc${step}`]
        if(index!==undefined) values[index]=Math.max(0,1-Math.abs(closure*8-step))
      }
      if(dictionary.Chew!==undefined) values[dictionary.Chew]=chewing*(.5-.5*Math.cos(chewTime*11))
      if(dictionary.ShySmile!==undefined) values[dictionary.ShySmile]=Math.min(1,weights.shy*bashful.smile+weights.peek*peeking.smile)*motion
    }
    const eat = weights.eat*motion
    const eatTime = time-eatStart, bellyTime = time-bellyStart
    cake.visible = eat > .005
    const liftCake = T.MathUtils.smoothstep(eatTime,.25,1.05)
    const bite = 1-.72*T.MathUtils.smoothstep(eatTime,1.4,2.9)
    const finishCake = 1-T.MathUtils.smoothstep(eatTime,3.1,3.7)
    cake.scale.setScalar(eat*bite*finishCake)
    cake.position.set(.48+.045*liftCake,-.02+.19*liftCake,-.01)
    cake.rotation.z = -.12*liftCake
    const belly = weights.belly*motion
    const spin = weights.spin*motion
    const squash = spin*twirl.prepare*.045
    root.scale.set(1+squash*.5,1-squash,1+squash*.5)
    const drag = weights.drag*.07*motion
    const spinAngle = spinSpring.step(spinBase+(spinTarget-spinBase)*twirl.turn,dt)
    const facing = weights.run>.15 ? runDirection*1.25 : rotation
    heading.value = turnToward(heading.value,facing,dt)
    root.rotation.y = -Math.PI/2+heading.value+spinAngle
    root.position.x = previewRun ? Math.sin(time*1.4)*.11*run : 0
    root.position.y = breath*(1-run)*(1-weights.dance)-squash*.5+spin*twirl.hop
    root.rotation.z = belly*Math.sin(bellyTime*12)*.045
    pose('body',0,0,drag)
    pose('head',gx*.09,-gx*.10,gy*.07-sleep*.13)
    pose('armL',spin*twirl.reveal*.15,0,0)
    pose('armR',-spin*twirl.reveal*.15,0,belly*.12)
    pose('forearmR',belly*Math.sin(bellyTime*10)*.12,0,0)
    renderer.render(scene,camera)
    frame = requestAnimationFrame(tick)
  }
  function schedule() {
    cancelAnimationFrame(frame); previous = 0
    if (!disposed && visible && !document.hidden) frame = requestAnimationFrame(tick)
  }
  const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; schedule() })
  observer.observe(canvas)
  document.addEventListener('visibilitychange',schedule)
  schedule()
  return {
    setMood(value: string) {
      const clipName = ({ happy:'Wave', wave:'Wave', eat:'Eat', shy:'Shy', dance:'Dance', peek:'Peek' } as Record<string,string>)[value]
      if (clipName) clips.get(clipName)!.reset().play()
      if(value==='eat') eatStart = time
      if(value==='belly') bellyStart = time
      if(value==='peek') peekStart = time
      if(value==='shy') shyStart = time
      if(value==='spin') {
        spinBase = spinSpring.value
        spinTarget = reduced.matches ? spinBase : (Math.round(spinBase/(Math.PI*2))+1)*Math.PI*2
        spinStart = time
      } else if(actions.mood==='spin') {
        spinBase = spinSpring.value
        spinTarget = spinBase
        spinSpring.velocity = 0
        spinStart = time
      }
      actions.trigger(value)
    },
    setPace(value: number) { paceTarget = T.MathUtils.clamp(value,0,3.3) },
    setDistance(value: number) { traveled = Math.max(0,value) },
    setView(degrees: number,direction: number,preview: boolean) { rotation = degrees*Math.PI/180; runDirection = direction; previewRun = preview },
    look(x: number,y: number) { looking = true; targetX = T.MathUtils.clamp(x,-1,1); targetY = T.MathUtils.clamp(y,-1,1) },
    leave() { looking = false; targetX = 0; targetY = 0 },
    dispose() {
      disposed = true; cancelAnimationFrame(frame)
      mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene)
      resize.disconnect(); observer.disconnect()
      document.removeEventListener('visibilitychange',schedule)
      const textures = new Set<T.Texture>(), materials = new Set<T.Material>(), geometries = new Set<T.BufferGeometry>()
      scene.traverse(o => {
        if (o instanceof T.Mesh) {
          geometries.add(o.geometry)
          for (const material of Array.isArray(o.material) ? o.material : [o.material]) materials.add(material)
        }
        if (o instanceof T.SkinnedMesh) o.skeleton.dispose()
      })
      for (const material of materials) {
        for (const value of Object.values(material)) if (value instanceof T.Texture) textures.add(value)
        material.dispose()
      }
      textures.forEach(t => t.dispose()); geometries.forEach(g => g.dispose()); renderer.dispose()
    },
  }
}

