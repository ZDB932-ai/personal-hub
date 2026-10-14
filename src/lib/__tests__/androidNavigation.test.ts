import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'
import { bindAndroidNavigation } from '../androidNavigation'

const mocks = vi.hoisted(() => ({ platform: 'android', addListener: vi.fn(), minimizeApp: vi.fn(), toast: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => mocks.platform } }))
vi.mock('@capacitor/app', () => ({ App: mocks }))
vi.mock('../toast', () => ({ toast: mocks.toast }))

let back: (event: { canGoBack: boolean }) => void
let remove: ReturnType<typeof vi.fn>
let target: EventTarget
let dialog: boolean
let locked: boolean
let router: Router
let dispose: (() => void) | undefined

beforeEach(() => {
  vi.clearAllMocks()
  mocks.platform = 'android'
  remove = vi.fn().mockResolvedValue(undefined)
  mocks.addListener.mockImplementation(async (_name, callback) => { back = callback; return { remove } })
  mocks.minimizeApp.mockResolvedValue(undefined)
  target = new EventTarget()
  dialog = false
  locked = false
  vi.stubGlobal('KeyboardEvent', class extends Event { key = 'Escape' })
  vi.stubGlobal('document', { querySelector: (selector: string) => selector === '[role="dialog"]' && dialog ? {} : null, activeElement: target, body: target })
  router = { currentRoute: { value: { path: '/calendar' } }, options: { history: { state: { back: '/' } } }, back: vi.fn(), replace: vi.fn().mockResolvedValue(undefined) } as unknown as Router
})

afterEach(() => { dispose?.(); dispose = undefined; vi.unstubAllGlobals() })

async function bind() {
  dispose = bindAndroidNavigation(router, () => locked)
  await vi.waitFor(() => expect(mocks.addListener).toHaveBeenCalledOnce())
}

it('返回先交给弹窗和下拉菜单，避免关闭弹层时同时离开页面', async () => {
  await bind()
  dialog = true
  back({ canGoBack: true })
  expect(router.back).not.toHaveBeenCalled()
  dialog = false
  target.addEventListener('keydown', event => event.preventDefault())
  back({ canGoBack: true })
  expect(router.back).not.toHaveBeenCalled()
  expect(mocks.minimizeApp).not.toHaveBeenCalled()
})

it('二级页面返回路由历史，没有历史的深链接回到今天', async () => {
  await bind()
  back({ canGoBack: true })
  expect(router.back).toHaveBeenCalledOnce()
  back({ canGoBack: false })
  expect(router.replace).toHaveBeenCalledWith('/')
})

it('首页和锁屏返回桌面，不穿透锁屏操作路由', async () => {
  await bind()
  locked = true
  back({ canGoBack: true })
  locked = false
  router.currentRoute.value.path = '/'
  back({ canGoBack: true })
  expect(mocks.minimizeApp).toHaveBeenCalledTimes(2)
  expect(router.back).not.toHaveBeenCalled()
})

it('卸载移除原生监听器，晚到事件不再操作页面', async () => {
  await bind()
  dispose?.()
  dispose = undefined
  back({ canGoBack: true })
  expect(remove).toHaveBeenCalledOnce()
  expect(router.back).not.toHaveBeenCalled()
})

it('Web 不注册安卓原生事件', async () => {
  mocks.platform = 'web'
  dispose = bindAndroidNavigation(router, () => false)
  await Promise.resolve()
  expect(mocks.addListener).not.toHaveBeenCalled()
})
