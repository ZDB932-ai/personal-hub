<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window'
import { PhysicalPosition, LogicalSize } from '@tauri-apps/api/dpi'
import DragonPet from './DragonPet.vue'
import { configurePet, initializePet, petPreferences } from '@/lib/pet'
import { isTauriDesktop } from '@/lib/desktop'
import { moveToward } from '@/lib/pet/navigation'
import { approachSpeed } from '@/lib/pet/gait'
import { nextCuriousAction } from '@/lib/pet/personality'
import { afterInteraction, PetReactions } from '@/lib/pet/reactions'
const desktop = isTauriDesktop()
const mood = ref('idle')
const actionId = ref(0)
const message = ref('你好呀！拖动我，陪你换个位置。')
const menu = ref(false)
const menuSide = ref<'left' | 'right'>('right')
const menuExpanded = ref(false)
let menuLayout = Promise.resolve()
watch(menu, () => {
  if (!desktop) return
  menuLayout = menuLayout.then(async () => {
    const open = menu.value
    if (open === menuExpanded.value) return
    const petWindow = getCurrentWindow()
    const [position, scale, monitor] = await Promise.all([petWindow.outerPosition(),petWindow.scaleFactor(),currentMonitor()])
    const extra = Math.round(192*scale)
    if (open) {
      menuSide.value = monitor && position.x+472*scale > monitor.workArea.position.x+monitor.workArea.size.width ? 'left' : 'right'
      await petWindow.setSize(new LogicalSize(472,340))
      try {
        if (menuSide.value === 'left') await petWindow.setPosition(new PhysicalPosition(position.x-extra,position.y))
      } catch (error) {
        await petWindow.setSize(new LogicalSize(280,340))
        throw error
      }
    } else {
      if (menuSide.value === 'left') await petWindow.setPosition(new PhysicalPosition(position.x+extra,position.y))
      await petWindow.setSize(new LogicalSize(280,340))
    }
    menuExpanded.value = open
    roamBounds = undefined; walkPosition = undefined
  }).catch(() => { menu.value = false; message.value = '菜单暂时无法展开，请再试一次。' })
})
const rotation = ref(0)
const roaming = ref(false)
const runActive = ref(false)
const runDirection = ref(-1)
const runPace = ref(0)
const runDistance = ref(0)
let turnUntil = 0
let walkPosition: {x:number;y:number} | undefined
let destination: {x:number;y:number} | undefined
let walkSpeed = 0
const choosingTarget = ref(false)
const renderMood = computed(() => mood.value === 'idle' && runActive.value ? 'run' : mood.value)
const hover = ref(false)
let ended = false
let roamTimer: ReturnType<typeof setTimeout> | undefined
let roamLast = 0
let roamBounds: { min: number; max: number; top: number; bottom: number; speed: number; at: number } | undefined
function canRoam() { return (roaming.value || !!destination) && !choosingTarget.value && !menu.value && !menuExpanded.value && !down && mood.value === 'idle' && !document.hidden && !ended }
function toggleRoaming() {
  destination = undefined; walkPosition = undefined; walkSpeed = 0
  clearTimeout(timer); mood.value = 'idle'
  roaming.value = !roaming.value
  choosingTarget.value=false; turnUntil=0
  runActive.value = false
  menu.value = false
  message.value = roaming.value ? (desktop ? '左右巡游中，点击我或打开菜单暂停。' : '小跑预览已开启，桌面版会在屏幕内移动。') : '好啦，我停在这里陪你。'
}
async function roamTick() {
  const now = performance.now()
  const dt = roamLast ? (now-roamLast)/1000 : 0
  roamLast = now
  try {
    if (!canRoam()) { runActive.value = false; runPace.value = 0; walkSpeed = 0; return }
    if (!desktop) { runActive.value = true; runPace.value = approachSpeed(runPace.value,1,dt); return }
    const window = getCurrentWindow()
    if (!roamBounds || now-roamBounds.at > 1000) {
      const [monitor,size,visible] = await Promise.all([currentMonitor(),window.outerSize(),window.isVisible()])
      if (!monitor || !visible) { runActive.value = false; return }
      const area = monitor.workArea
      roamBounds = { min:area.position.x, max:area.position.x+area.size.width-size.width, top:area.position.y, bottom:area.position.y+area.size.height-size.height, speed:35*monitor.scaleFactor, at:now }
    }
    if (!walkPosition) walkPosition = await window.outerPosition()
    if (!canRoam()) return
    const scale = roamBounds.speed/35
    walkPosition.x = Math.max(roamBounds.min,Math.min(roamBounds.max,walkPosition.x))
    walkPosition.y = Math.max(roamBounds.top,Math.min(roamBounds.bottom,walkPosition.y))
    if (now < turnUntil) { runActive.value = false; runPace.value = 0; walkSpeed = 0; return }
    const target = destination
      ? {x:Math.max(roamBounds.min,Math.min(roamBounds.max,destination.x)),y:Math.max(roamBounds.top,Math.min(roamBounds.bottom,destination.y))}
      : {x:runDirection.value>0 ? roamBounds.max : roamBounds.min,y:walkPosition.y}
    const dx=target.x-walkPosition.x
    if (Math.abs(dx)>.5) runDirection.value=dx>0 ? 1 : -1
    const next=moveToward({x:walkPosition.x/scale,y:walkPosition.y/scale},{x:target.x/scale,y:target.y/scale},walkSpeed,dt)
    walkSpeed=destination ? next.speed : Math.min(next.speed,28)
    const travel=destination ? next.distance : Math.min(next.distance,walkSpeed*Math.min(dt,.1))
    const distance=Math.hypot(target.x-walkPosition.x,target.y-walkPosition.y)/scale
    const arrived=distance<=.5 || travel>=distance
    const ratio=distance>0 ? Math.min(1,travel/distance) : 1
    walkPosition={x:walkPosition.x+(target.x-walkPosition.x)*ratio,y:walkPosition.y+(target.y-walkPosition.y)*ratio}
    if (!canRoam()) return
    await window.setPosition(new PhysicalPosition(Math.round(walkPosition.x),Math.round(walkPosition.y)))
    runDistance.value+=travel
    runActive.value=!arrived && travel>0
    runPace.value=walkSpeed/28
    if(arrived) {
      walkSpeed=0; runPace.value=0
      if(destination) { destination=undefined; message.value='到啦！就在这里陪你。' }
      else { runDirection.value=runDirection.value>0 ? -1 : 1; turnUntil=now+220 }
    }
  } catch {
    roaming.value = false; destination = undefined; runActive.value = false
    message.value = '暂时无法自动走动，可以继续手动拖动。'
  } finally {
    if (!ended) roamTimer = setTimeout(roamTick,16)
  }
}
let timer: ReturnType<typeof setTimeout> | undefined
let idleTimer: ReturnType<typeof setTimeout> | undefined
let lastCurious = ''
const personalityActions = [
  { mood:'peek',label:'偷看被发现',text:'偷偷看一眼……哎呀，被你发现了。' },
  { mood:'spin',label:'开心转圈',text:'快乐转一圈，送给你！' },
  { mood:'shy',label:'害羞一下',text:'被你发现啦……让我缓一缓。' },
]
function scheduleCuriosity() {
  idleTimer = setTimeout(() => {
    if (!ended && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches && mood.value==='idle' && !menu.value && !roaming.value && !destination && !choosingTarget.value && !down) {
      lastCurious = nextCuriousAction(lastCurious,Math.random())
      act(lastCurious,'',4000)
    }
    if(!ended) scheduleCuriosity()
  },18000+Math.random()*24000)
}
let unlisten: UnlistenFn | undefined
let down: { x: number; y: number; pointer: number; mode: 'drag' | 'rotate' | 'target'; angle: number } | undefined
const rotating = ref(false)
let dragged = false
let dragOrigin: Promise<{ x: number; y: number; scale: number }> | undefined
let pendingPosition: { x: number; y: number } | undefined
let moving = false
const phrases = ['摸摸头，元气补充完毕！', '今天也陪你慢慢来。', '收到！给你一个小小的拥抱。']
let touches = 0
const reactions = new PetReactions()
function act(next: string, text: string, duration = 3000, follow = true) {
  clearTimeout(timer)
  mood.value = next; message.value = text; actionId.value++
  timer = setTimeout(() => {
    const reaction = follow ? afterInteraction(next) : undefined
    if(reaction && !menu.value && !down && !document.hidden) act(reaction.mood,reaction.text,reaction.duration,false)
    else { mood.value = 'idle'; message.value = '' }
  }, duration)
}
function touch(event: MouseEvent) {
  if (event.button !== 0) return
  if (dragged) { dragged = false; return }
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const belly = event.detail > 0 && (event.clientY - bounds.top) / bounds.height > .56
  if(!belly && reactions.touch(performance.now())==='shy') {
    act('shy','哎呀，摸得我都不好意思了。',3800)
    return
  }
  act(belly ? 'belly' : 'happy', belly ? '肚肚好痒！嘿嘿，再摸一下？' : phrases[touches++ % phrases.length]!)
}
function pointerDown(event: PointerEvent) {
  if (down || ![0,1,2].includes(event.button)) return
  ;(event.currentTarget as HTMLElement).focus({ preventScroll:true })
  const mode = event.button === 2 ? 'rotate' : event.button === 1 || event.shiftKey || choosingTarget.value ? 'target' : 'drag'
  down = { x: event.screenX, y: event.screenY, pointer:event.pointerId, mode, angle:rotation.value }; dragged = false
  if(mode==='target') { event.preventDefault(); menu.value=false; message.value='拖向目的地后松开，我会跑过去。' }
  destination=undefined; walkPosition=undefined; walkSpeed=0
  rotating.value = mode === 'rotate'
  if (rotating.value) { event.preventDefault(); menu.value = false; clearTimeout(timer); mood.value='idle'; actionId.value++ }
  runActive.value = false; roamBounds = undefined
  if (desktop && mode !== 'rotate') {
    const window = getCurrentWindow()
    dragOrigin = Promise.all([window.outerPosition(), window.scaleFactor()]).then(([position, scale]) => ({ x: position.x, y: position.y, scale }))
    void dragOrigin.catch(() => { message.value = '暂时无法读取玩偶位置。' })
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
async function pointerMove(event: PointerEvent) {
  if (!down || down.pointer !== event.pointerId) return
  if (down.mode === 'target') { dragged=true; return }
  if (down.mode === 'rotate') {
    rotation.value = down.angle+(event.screenX-down.x)*.65
    return
  }
  if (Math.hypot(event.screenX - down.x, event.screenY - down.y) < 5) return
  const dx = event.screenX - down.x
  const dy = event.screenY - down.y
  if (!dragged) act('drag', desktop ? '起飞咯！轻轻放下我。' : '桌面版中可以把我拖到喜欢的位置。', 1500)
  dragged = true
  if (!desktop || !dragOrigin) return
  try {
    const origin = await dragOrigin
    pendingPosition = { x: Math.round(origin.x + dx * origin.scale), y: Math.round(origin.y + dy * origin.scale) }
    if (moving) return
    moving = true
    try {
      while (pendingPosition) {
        const next = pendingPosition
        pendingPosition = undefined
        await getCurrentWindow().setPosition(new PhysicalPosition(next.x, next.y))
      }
    } finally { moving = false }
  }
  catch { message.value = '拖动失败，请再试一次。' }
}
async function pointerEnd(event: PointerEvent) {
  if (down?.pointer !== event.pointerId) return
  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
  const gesture=down
  down = undefined
  rotating.value = false
  if(gesture.mode==='drag' && dragged) { clearTimeout(timer); mood.value='idle'; message.value='' }
  if(gesture.mode==='target') {
    dragged=true; choosingTarget.value=false
    if(event.type==='pointerup' && desktop && dragOrigin) {
      const origin=await dragOrigin.catch(()=>undefined)
      if(origin) {
        await menuLayout
        destination={x:origin.x+(event.screenX-gesture.x)*origin.scale,y:origin.y+(event.screenY-gesture.y)*origin.scale}
        roaming.value=false; clearTimeout(timer); mood.value='idle'; message.value='来啦！'; turnUntil=0
      }
    } else if(!desktop) message.value='指定屏幕地点需要桌面版；这里可预览左右小跑。'
  }
}
function rotationKey(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    rotation.value += event.key === 'ArrowLeft' ? -15 : 15
  } else if (event.key === 'Home') { event.preventDefault(); rotation.value = 0 }
}
async function home() {
  if (!isTauriDesktop()) { message.value = '桌面版中可以直接打开主页。'; return }
  try { await invoke('pet_home') } catch { message.value = '暂时无法打开主页。' }
}
async function hide() {
  if (!isTauriDesktop()) { message.value = '这是互动预览，桌面版可在设置中关闭。'; menu.value = false; return }
  try { await configurePet({ enabled: false }) }
  catch { message.value = '关闭失败，请在设置中重试。' }
}
async function toggleBackground() {
  try {
    await configurePet({ background: !petPreferences.background })
    message.value = petPreferences.background ? '你忙你的，我在桌面陪你。' : '主页收起来时，我也一起休息。'
    menu.value = false
  } catch { message.value = '设置未保存，请再试一次。' }
}
onMounted(async () => {
  try {
    await initializePet()
    if (isTauriDesktop()) unlisten = await listen('pet://reminder', () => {
      if (petPreferences.enabled && petPreferences.reminders && mood.value !== 'sleep') act('happy', '有任务到时间啦，打开主页看看吧。', 12000)
    })
  } catch { message.value = '连接失败，请重新打开应用。' }
  timer = setTimeout(() => { message.value = '' }, 6000)
  void roamTick()
  scheduleCuriosity()
})
onUnmounted(() => { ended = true; clearTimeout(roamTimer); clearTimeout(timer); clearTimeout(idleTimer); unlisten?.() })
</script>
<template>
  <div :class="desktop ? 'native-pet-host' : 'pet-playground'">
    <header v-if="!desktop" class="pet-preview-heading">
      <p class="text-xs font-semibold tracking-widest text-primary">你的桌面小伙伴</p>
      <h1 class="mt-3 text-3xl font-semibold text-t1">奶龙，今天也陪着你。</h1>
      <p class="mt-3 text-sm text-t3">移近鼠标和它对视，摸摸头，或者挠挠肚肚。</p>
    </header>
  <main class="pet-stage" :class="{ 'pet-menu-open':menu, 'pet-menu-left':desktop && menuExpanded && menuSide === 'left' }" @contextmenu.prevent @keydown.esc="menu = false">
    <div class="pet-message" :class="{ 'pet-message-hidden': !message }" role="status">{{ message }}</div>
    <div v-if="menu" class="pet-menu rounded-xl border border-line bg-surface p-2 text-t1">
      <button v-for="action in personalityActions" :key="action.mood" @click="act(action.mood,action.text,4000); menu = false">{{ action.label }}</button>
      <button @click="choosingTarget = true; menu = false; message = '在我身上按住左键，拖向目的地后松开。'">指定目的地</button>
      <button :aria-pressed="roaming" @click="toggleRoaming">{{ roaming ? '停止自主走动' : '开始自主走动' }}</button>
      <button @click="act('eat', '啊呜！一口小蛋糕，快乐加倍。', 5000); menu = false">喂一口</button>
      <button @click="act('dance', '一起摇摆一下！', 6500); menu = false">跳个舞</button>
      <button @click="act('wave', '嗨！我一直在呢。'); menu = false">打招呼</button>
      <button @click="act('sleep', '眯一会儿，点击我就醒啦。', 300000); menu = false">小憩五分钟</button>
      <button @click="home">打开主页</button>
      <button v-if="desktop" @click="toggleBackground">后台陪伴：{{ petPreferences.background ? '开' : '关' }}</button>
      <button @click="hide">关闭玩偶</button>
    </div>
    <button class="pet-character" :class="{ 'pet-rotating':rotating }" aria-label="摸摸奶龙；左键拖动位置，右键拖动旋转，方向键旋转，Home 恢复正面，双击打开主页" title="按住右键左右拖动旋转；Home 恢复正面" @pointerenter="hover = true; runActive = false" @pointerleave="hover = false" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerEnd" @pointercancel="pointerEnd" @lostpointercapture="pointerEnd" @keydown="rotationKey" @click="touch" @dblclick="home">
      <DragonPet :mood="renderMood" :action-id="actionId" :rotation="rotation" :direction="runDirection" :pace="runPace" :distance="runDistance" :preview-run="!desktop" />
    </button>
    <button class="pet-menu-toggle rounded-lg border border-line bg-surface text-t2" :aria-expanded="menu" aria-label="玩偶互动菜单" @click="menu = !menu">···</button>
  </main>
    <footer v-if="!desktop" class="pet-preview-actions">
      <div class="flex flex-wrap justify-center gap-2">
        <button v-for="action in personalityActions" :key="action.mood" @click="act(action.mood,action.text,4000)">{{ action.label }}</button>
        <button @click="choosingTarget = true; menu = false; message = '在我身上按住左键，拖向目的地后松开。'">指定目的地</button>
      <button :aria-pressed="roaming" @click="toggleRoaming">{{ roaming ? '停止自主走动' : '开始自主走动' }}</button>
        <button @click="act('happy', '摸摸头，元气补充完毕！')">摸摸头</button>
        <button @click="act('belly', '肚肚好痒！嘿嘿。')">挠挠肚肚</button>
        <button @click="act('eat', '啊呜！这口蛋糕归我啦。', 5000)">喂蛋糕</button>
        <button @click="act('dance', '跟着我，一起摇摆～', 6500)">跳个舞</button>
        <button @click="act('wave', '嗨！我一直在呢。')">打招呼</button>
        <button @click="act('sleep', '眯一会儿，摸摸我就醒啦。', 300000)">小憩一下</button>
      </div>
      <p class="mt-4 text-xs text-t3">右键拖动旋转 · Shift＋左键拖向目的地后松开 · Home 恢复正面</p>
    </footer>
  </div>
</template>
<style>
html.pet-window,html.pet-window body,html.pet-window #app { background:transparent!important; width:100%; height:100%; overflow:hidden; margin:0; min-width:0; }
.pet-stage { position:relative; height:340px; width:280px; user-select:none; }
.pet-message { position:absolute; top:8px; left:16px; right:16px; padding:12px; border:1px solid var(--tk-line); border-radius:12px; background:var(--tk-surface); color:var(--tk-t1); font-size:13px; line-height:1.6; transition:opacity .25s ease,transform .35s cubic-bezier(.22,1,.36,1); }
.pet-message-hidden { opacity:0; transform:translateY(6px); pointer-events:none; }
.pet-character { position:absolute; left:20px; bottom:12px; width:240px; padding:0; background:none; border:0; cursor:grab; touch-action:none; }
.pet-character:active { cursor:grabbing; }
.pet-character:focus,.pet-character:focus-visible { outline:none; }
.pet-menu-toggle { position:absolute; bottom:4px; right:12px; width:44px; height:36px; font-size:24px; line-height:1; }
.pet-menu { position:absolute; z-index:2; top:8px; left:calc(100% + 8px); width:184px; max-height:324px; overflow-y:auto; box-sizing:border-box; }
.native-pet-host .pet-menu-left { margin-left:192px; }
.pet-menu-left .pet-menu { left:auto; right:calc(100% + 8px); }
.pet-character.pet-rotating { cursor:ew-resize; }
.pet-menu button { display:block; width:100%; min-height:40px; text-align:left; padding:8px; font-size:13px; border-radius:8px; }
.pet-menu button:hover { background:var(--tk-surface-2); }
.pet-playground { height:100%; overflow:auto; display:flex; align-items:center; flex-direction:column; background:var(--tk-body); padding:40px 16px 24px; }
.pet-preview-heading { text-align:center; flex-shrink:0; }
.pet-playground .pet-stage { --pet-stage-height:460px; width:min(460px,100%); height:var(--pet-stage-height); flex-shrink:0; margin-top:28px; }
.pet-playground .pet-character { width:380px; max-width:100%; left:50%; transform:translateX(-50%); bottom:0; }
.pet-playground .pet-message { left:48px; right:48px; text-align:center; }
.pet-playground .pet-menu-toggle { bottom:24px; right:24px; }
.pet-playground .pet-menu { position:relative; left:auto; top:auto; width:100%; max-height:240px; margin-top:var(--pet-stage-height); }
.pet-playground .pet-stage.pet-menu-open { height:auto; min-height:var(--pet-stage-height); padding-bottom:16px; }
.pet-playground .pet-stage.pet-menu-open .pet-character { top:calc(var(--pet-stage-height) - min(380px, 100vw - 32px)); bottom:auto; }
.pet-playground .pet-stage.pet-menu-open .pet-menu-toggle { top:calc(var(--pet-stage-height) - 60px); bottom:auto; }
.pet-preview-actions { text-align:center; width:min(620px,100%); padding-bottom:20px; }
.pet-preview-actions button { min-height:44px; padding:8px 16px; border:1px solid var(--tk-line); background:var(--tk-surface); border-radius:8px; font-size:13px; color:var(--tk-t2); }
.pet-preview-actions button:hover { color:var(--tk-primary); border-color:var(--tk-primary); background:var(--tk-surface-2); }
@media(max-width:480px) { .pet-playground { padding-top:24px; } .pet-playground .pet-stage { --pet-stage-height:390px; } .pet-playground .pet-message { left:4px; right:4px; } }
@media(prefers-reduced-motion:reduce) { .pet-message { transition:none; } }
</style>
