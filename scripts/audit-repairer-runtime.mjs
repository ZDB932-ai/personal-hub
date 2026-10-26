import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, relative } from 'node:path'
import { chromium } from 'playwright'

const asset = 'E:/Tripo pipline/assets/stellar-repairer/delivery/release/Repairer_edited_17clips.glb'
const buffer = await readFile(asset)
const sha256 = createHash('sha256').update(buffer).digest('hex')
if (sha256 !== '659e4f826b491c5128ccfdf959e7db679930383770b5cfb853271945e28fa616') throw Error('Asset identity changed')
const output = resolve('.visual-qa', `repairer-runtime-${Date.now()}`)
await mkdir(output, { recursive: true })
const library = resolve('node_modules/three')
const html = `<html><head><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script></head><body style="margin:0;background:#333"><script type="module">
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
try {
const gltf=await new GLTFLoader().loadAsync('/asset.glb');
const scene=new T.Scene(); scene.add(gltf.scene,new T.HemisphereLight(0xffffff,0xffffff,2));
const light=new T.DirectionalLight(0xffffff,2.5);light.position.set(-3,4,5);scene.add(light);
const renderer=new T.WebGLRenderer({antialias:true,alpha:true});renderer.setSize(640,640);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NeutralToneMapping;document.body.append(renderer.domElement);
const camera=new T.OrthographicCamera(-.7,.7,.7,-.7,.01,20);
const bounds=new T.Box3().setFromObject(gltf.scene,true),center=bounds.getCenter(new T.Vector3());camera.position.copy(center).add(new T.Vector3(0,0,3));camera.lookAt(center);
const mixer=new T.AnimationMixer(gltf.scene);
const summary={revision:T.REVISION,clips:[],materials:[],meshes:[],textures:[]};const textures=new Set();
gltf.scene.traverse(o=>{if(o.isMesh){summary.meshes.push({name:o.name,vertices:o.geometry.attributes.position.count,skinned:!!o.isSkinnedMesh,bones:o.skeleton?.bones.length});for(const m of Array.isArray(o.material)?o.material:[o.material]){summary.materials.push({name:m.name,type:m.type});for(const value of Object.values(m))if(value?.isTexture&&!textures.has(value)){textures.add(value);summary.textures.push({width:value.image?.width,height:value.image?.height,colorSpace:value.colorSpace});}}}});
for(const clip of gltf.animations){const action=mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();const sampled=new T.Box3();for(let i=0;i<=16;i++){mixer.setTime(clip.duration*i/16);gltf.scene.updateMatrixWorld(true);sampled.union(new T.Box3().setFromObject(gltf.scene,true));renderer.render(scene,camera);}const firstKey=Math.min(...clip.tracks.map(t=>t.times[0]));const lastKey=Math.max(...clip.tracks.map(t=>t.times[t.times.length-1]));const bones=[];gltf.scene.traverse(o=>{if(o.isBone)bones.push(o)});const endpoints=[];for(const time of [0,firstKey,clip.duration]){action.reset().play();mixer.setTime(time);gltf.scene.updateMatrixWorld(true);endpoints.push(bones.map(b=>b.getWorldPosition(new T.Vector3())));}const maxDelta=(a,b)=>Math.max(...a.map((p,i)=>p.distanceTo(b[i])));summary.clips.push({name:clip.name,duration:clip.duration,firstKey,lastKey,keyedSpan:lastKey-firstKey,zeroToFirstKeyBoneDelta:maxDelta(endpoints[0],endpoints[1]),endpointBoneDelta:maxDelta(endpoints[0],endpoints[2]),tracks:clip.tracks.length,min:sampled.min.toArray(),max:sampled.max.toArray(),triangles:renderer.info.render.triangles,calls:renderer.info.render.calls});action.stop();}
window.showClip=(name,fraction)=>{mixer.stopAllAction();const clip=gltf.animations.find(c=>c.name===name);const action=mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(clip.duration*fraction);gltf.scene.updateMatrixWorld(true);renderer.render(scene,camera);};
window.audit=summary;
}catch(error){window.auditError=String(error);}
</script></body></html>`
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname
    if (path === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return }
    if (path === '/favicon.ico') { response.writeHead(204).end(); return }
    if (path === '/asset.glb') { response.setHeader('Content-Type', 'model/gltf-binary'); response.end(buffer); return }
    if (!path.startsWith('/three/')) { response.writeHead(404).end(); return }
    const file = resolve(library, path.slice(7))
    const rel = relative(library, file)
    if (rel.startsWith('..') || !file.endsWith('.js')) { response.writeHead(403).end(); return }
    response.setHeader('Content-Type', 'text/javascript'); response.end(await readFile(file))
  } catch { response.writeHead(500).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 640 } })
  const errors = []
  const failedResponses = []
  page.on('response', response => { if (response.status() >= 400) failedResponses.push({ url: response.url(), status: response.status() }) })
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.waitForFunction(() => window.audit || window.auditError, undefined, { timeout: 120000 })
  const result = await page.evaluate(() => ({ summary: window.audit, error: window.auditError }))
  if (result.error) throw Error(result.error)
  for (const clip of ['Idle', 'Walk', 'LookWaveTwice', 'run', 'jump']) {
    await page.evaluate(name => window.showClip(name, .5), clip)
    await page.screenshot({ path: resolve(output, `${clip}.png`) })
  }
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ asset, sha256, scope: 'Isolated Three.js import/render sampling; 17 samples per clip, not full deformation/contact/performance or desktop acceptance; catalog unchanged', ...result, errors, failedResponses }, null, 2))
  console.log(JSON.stringify({ output, sha256, clips: result.summary.clips.length, errors }))
  if (errors.length) process.exitCode = 1
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
