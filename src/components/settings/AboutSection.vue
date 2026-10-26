<script setup lang="ts">
import { isTauriDesktop } from '@/lib/desktop'
const version = __APP_VERSION__
const desktop = isTauriDesktop()
</script>

<template>
  <div class="settings-stack">
    <section class="settings-card space-y-3">
      <div class="settings-row"><div class="settings-row-copy"><h3 class="settings-section-title">Personal Hub</h3><p class="settings-description">让日程、资料和个人账户各有其所。</p></div><span class="settings-status text-t3">版本 {{ version }}</span></div>
      <p class="text-sm leading-relaxed text-t2">在同一个工作空间安排今天、整理想法、保存文件与密码。个人内容在本机加密保存，云同步帮助你在多个设备间继续工作。</p>
    </section>
    <section class="settings-card space-y-3">
      <h3 class="settings-section-title">数据与隐私</h3>
      <ul class="space-y-3 text-sm leading-relaxed text-t2">
        <li>离线时仍可使用，修改先保存在当前设备。</li>
        <li>个人内容和资料文件在设备上加密，云同步传输加密后的内容。</li>
        <li>锁定后释放内存中的解锁密钥，重新打开需要验证身份。</li>
        <li>备份独立于同步。清理浏览器或卸载应用前，请先导出备份并确认同步状态。</li>
      </ul>
      <details class="settings-disclosure settings-subsection"><summary class="text-sm font-medium text-t1">存储与加密详情</summary><div class="settings-disclosure-body space-y-2 text-xs leading-relaxed text-t3"><p>个人记录和连接凭据由本机 IndexedDB（xk-vault）事务保存，使用 AES-256-GCM 加密。资料文件在 xk-docs 中逐文件加密。</p><p>云服务存储加密内容及维持账户和同步所需的信息。开启生物识别解锁后，解锁凭据由系统安全存储保护。</p><p>壁纸与外观偏好属于设备设置，不与个人内容共用加密存储。</p></div></details>
    </section>
    <section class="settings-card space-y-3">
      <h3 class="settings-section-title">键盘快捷键</h3>
      <dl class="space-y-3 text-sm text-t2">
        <div class="settings-row"><dt class="settings-row-copy">搜索所有内容</dt><dd><kbd class="rounded bg-surface-2 px-2 py-1 text-xs">Ctrl / ⌘ + K</kbd></dd></div>
        <div class="settings-row"><dt class="settings-row-copy">密码库中搜索</dt><dd><kbd class="rounded bg-surface-2 px-2 py-1 text-xs">/</kbd></dd></div>
        <div class="settings-row"><dt class="settings-row-copy">提交快速任务</dt><dd><kbd class="rounded bg-surface-2 px-2 py-1 text-xs">Enter</kbd></dd></div>
        <div class="settings-row"><dt class="settings-row-copy">关闭当前弹窗</dt><dd><kbd class="rounded bg-surface-2 px-2 py-1 text-xs">Esc</kbd></dd></div>
      </dl>
      <p class="settings-description">全局搜索中使用 ↑ ↓ 选择结果，按 Enter 打开。</p>
    </section>
    <section v-if="desktop" class="settings-card space-y-3">
      <h3 class="settings-section-title">桌面窗口</h3>
      <ul class="space-y-3 text-sm leading-relaxed text-t2"><li>关闭主窗口后，应用继续在系统托盘运行。点击托盘图标或再次打开应用即可返回。</li><li>下次启动会恢复主窗口大小、位置和最大化状态。</li><li>完全退出请右键托盘图标，选择「退出」。退出后，任务提醒、桌面清单和桌面伙伴同时停止。</li></ul>
    </section>
  </div>
</template>
