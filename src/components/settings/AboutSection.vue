<template>
  <div class="space-y-3">
    <div class="rounded-xl border border-line bg-surface p-4">
      <p class="text-sm font-medium">Personal Hub v1.0</p>
      <p class="mt-1 text-xs leading-relaxed text-t4">
        本地优先的个人信息管理台：密码库 / 每日计划 / 备忘录 / 项目收藏 / 资料库，加密存储，可选云同步，安卓 APP 随身携带。
      </p>
    </div>

    <div class="rounded-xl border border-line bg-surface p-4 text-xs leading-relaxed text-t3">
      <p class="mb-2 text-sm font-medium text-t2">数据存在哪里</p>
      <ul class="space-y-1.5">
        <li>· 业务数据：浏览器本地，AES-256-GCM 加密信封（xk.data.v2）</li>
        <li>· 资料文件：IndexedDB（xk-docs），逐文件加密</li>
        <li>· 主密钥：仅存内存，锁定即销毁；主密码永不落盘</li>
        <li>· 云同步（如开启）：服务器只见密文，零知识</li>
      </ul>
    </div>

    <div class="rounded-xl border border-line bg-surface p-4 text-xs leading-relaxed text-t3">
      <p class="mb-2 text-sm font-medium text-t2">快捷键</p>
      <ul class="space-y-1.5">
        <li>· <kbd class="rounded bg-surface-2 px-1.5 py-0.5 font-mono">/</kbd> 密码库页快速聚焦搜索</li>
        <li>· <kbd class="rounded bg-surface-2 px-1.5 py-0.5 font-mono">Enter</kbd> 每日计划页快速创建任务</li>
        <li>· <kbd class="rounded bg-surface-2 px-1.5 py-0.5 font-mono">Esc</kbd> 关闭弹窗</li>
      </ul>
    </div>
  </div>
</template>
