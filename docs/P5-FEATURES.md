# P5 功能规划 · 任务计划 / 备忘录 / 个人资料库

> 调研基础：Capacitor Local Notifications v8 官方文档、MDN Storage 配额标准、滴答清单 / Microsoft To Do / 主流证件管理类应用的功能范式。

## 一、调研结论（技术可行性）

| 关键问题 | 结论 |
| --- | --- |
| 网页能做提醒吗 | 能但有限：Notification API 仅在页面开着时可靠，关掉就失效 |
| 安卓 APP 能关机后提醒吗 | 能。`@capacitor/local-notifications` 走系统原生闹钟，APP 被杀也能触发 |
| 安卓提醒的限制 | Android 13+ 需运行时申请通知权限；Android 12+ 精确闹钟需在 Manifest 声明 `SCHEDULE_EXACT_ALARM` 且用户可在系统设置关闭（需降级兜底）；Doze 省电模式下 `allowWhileIdle` 通知最快约 9 分钟一次 |
| 浏览器能存文件吗 | 能。localStorage 仅 5MB 弃用；IndexedDB 配额 ≈ 磁盘 60%（Chromium），个人文档场景几乎无限 |
| 文件会被浏览器清掉吗 | 默认 best-effort 模式磁盘紧张时可被回收；调用 `navigator.storage.persist()` 申请持久化后基本不会 |
| 新增数据如何同步 | 任务/备忘录/文件元数据都是小 JSON → 并入现有加密信封，**现有 LWW 云同步零改动直接生效**；文件本体二进制不进信封（见分阶段方案） |

## 二、功能完善清单

优先级说明：P0 = 核心必做；P1 = 显著提升体验；P2 = 远期可选。

### A. 每日计划与任务（对应需求 1）

| 优先级 | 功能 | 说明 |
| --- | --- | --- |
| P0 | 今日计划页 `/today` | 日历选日、输入框回车秒加任务、勾选完成带划线动画、今日完成度进度环 |
| P0 | 定时提醒 | 任务可设时间；到点 Web 通知 / 安卓系统通知；逾期任务红色标记并自动顺延到今日 |
| P1 | 重复任务 | 每天 / 每周 / 工作日 / 自定义周几；完成后自动生成下一次实例 |
| P1 | 优先级与标签 | 高/中/低三档颜色区分；标签筛选与跨日聚合视图 |
| P2 | 子步骤清单 | 任务下挂多个 Steps，类 Microsoft To Do |
| P2 | 周视图 / 月历视图 | 直观看每日负载 |

### B. 工作备忘录（对应需求 1）

| 优先级 | 功能 | 说明 |
| --- | --- | --- |
| P0 | 便签卡片墙 `/memos` | 快速新建、自由编辑、六色卡片、置顶、瀑布流布局 |
| P1 | 清单式备忘录 | 备忘录内嵌 checkbox 行（购物清单/待办草稿场景） |
| P1 | 一键转任务 | 把备忘录内容直接生成一条今日任务 |
| P2 | Markdown 渲染 | 引入 marked，长文笔记排版更好 |

### C. 个人文件资料库（对应需求 2）

| 优先级 | 功能 | 说明 |
| --- | --- | --- |
| P0 | 加密存储 | 任意格式文件经 AES-256-GCM 加密后写入 IndexedDB；元数据进加密信封；单文件上限 50MB |
| P0 | 分类 + 检索 | 预设分类（证件 / 文书合同 / 账号凭证 / 票据收据 / 其他）+ 自定义标签；按名称/备注/标签即时搜索 |
| P0 | 快速取用 | 图片灯箱预览、PDF 内嵌预览、其余类型一键下载；收藏置顶；备注栏可贴关键信息（如证件号）一键复制 |
| P1 | 存储管理 | `storage.estimate()` 用量可视化、`persist()` 持久化申请、批量选择删除、全部解密导出为 zip 备份 |
| P2 | 过期提醒 | 给票据/合同设到期日，接入任务提醒通道 |

### D. 密码库增强（延伸打磨）

| 优先级 | 功能 | 说明 |
| --- | --- | --- |
| P1 | TOTP 两步验证码 | RFC 6238 纯前端实现，30 秒动态码 + 倒计时环，替代 Google Authenticator 部分场景 |
| P1 | 收藏与最近使用 | 常用账号置顶区 |
| P2 | 安全报告页 | 弱密码 / 重复密码 / 长期未改清单 |

### E. 总览与全局体验

| 优先级 | 功能 | 说明 |
| --- | --- | --- |
| P0 | 仪表盘整合 | 今日任务摘要卡（含下一提醒倒计时）、备忘录入口、资料库统计卡 |
| P0 | 导航改版 | 五模块侧边栏（总览/计划/备忘录/资料库/密码库）+ 移动端底部 Tab |
| P2 | Ctrl+K 命令面板 | 跨模块全局搜索跳转 |

### F. 数据安全与备份（必须配套）

| 优先级 | 功能 | 说明 |
| --- | --- | --- |
| P0 | 数据结构 v3 迁移 | VaultPayload 增加 tasks/memos/docMetas 字段，旧数据容错水合无感升级 |
| P0 | 加密备份导出/导入 | 一键导出当前信封为 `.phub.json` 文件、导入恢复——换设备/防丢刚需 |
| P2 | 生物识别解锁 | Capacitor Native Biometric，指纹替代输主密码 |

### G. 安卓端专项

| 优先级 | 功能 | 说明 |
| --- | --- | --- |
| P0 | 通知基建 | Manifest 加 `SCHEDULE_EXACT_ALARM` + `POST_NOTIFICATIONS`；首次创建提醒时引导授权；精确闹钟被关时降级提示 |
| P1 | 通知点击深链 | 点任务通知直达 `/today` 并高亮该任务 |
| P1 | 图标与启动屏 | 替换默认 Capacitor 图标 |

## 三、核心技术设计

### 1. 数据模型（v3）

```ts
interface Task {
  id: string
  title: string
  notes: string
  date: string        // YYYY-MM-DD，空=收集箱
  time: string        // HH:mm，空=全天
  priority: 1 | 2 | 3 // 低/中/高
  repeat: 'none' | 'daily' | 'weekly' | 'workdays'
  done: boolean
  doneAt?: number
  lastRemindedTs?: number
  createdAt: number
  updatedAt: number
}

interface Memo {
  id: string
  title: string
  content: string
  color: string       // 六色索引
  pinned: boolean
  createdAt: number
  updatedAt: number
}

interface DocMeta {   // 元数据进信封随云同步
  id: string
  name: string
  category: string
  tags: string[]
  note: string        // 可放证件号等关键信息
  size: number
  mime: string
  pinned: boolean
  createdAt: number
}
```

VaultPayload 升级为 `{ profile, entries, tasks, memos, docMetas }`，database.ts 水合处对缺失字段补默认值即可兼容旧信封。

### 2. 提醒引擎 `lib/reminders.ts`

双通道策略：

```
任务保存/修改
 ├─ Web 环境：不做预调度，引擎每 30s 扫描
 │    now >= remindAt 且 !lastRemindedTs → new Notification(...) → 记录 ts
 └─ Android(Capacitor)：立即 LocalNotifications.schedule({ at, id: hash(taskId) })
      完成/删除/改期 → cancel({ id }) 后重排
      repeat 任务触发后由监听器滚动生成下一次 schedule
```

- 通知点击：`localNotificationActionPerformed` 监听 → router.push('/today') + 高亮
- 权限引导集中在设置页「通知」区块：状态检测 + 一键申请 + Android 精确闹钟被禁时的降级警告文案

### 3. 文件加密存储 `stores/docs.ts` + `lib/docdb.ts`

```
上传：File.arrayBuffer()
   → crypto.subtle.encrypt(AES-GCM(vaultKey), iv)
   → IndexedDB 'xk-docs'/blobs: { id, ivB64, ct: ArrayBuffer }
   → DocMeta 推入信封 → 自动持久化+云同步

预览/下载：IndexedDB 取 ct → decrypt → Blob([pt],{type:mime}) → objectURL
删除：信封删 Meta + IndexedDB 删 blob（两步都执行防孤儿）
```

- 首次进入资料库页调用一次 `navigator.storage.persist()` + `estimate()` 展示用量条
- 大文件加密在主线程可能卡顿 >100MB 场景才需要 Worker，50MB 上限内主线程可接受（实测 AES-GCM 吞吐数百 MB/s）

### 4. 同步策略边界（重要）

- tasks / memos / docMetas：随信封 LWW 同步，多端一致 ✓
- 文件本体：**不随信封同步**（体积不可控）。多端表现：新设备能看到文件列表（元数据），点下载时若本机无 blob 则提示「此文件在本设备不存在，请从备份导入或重新添加」。远期 Phase E 再设计 PocketBase file 字段存加密分片的方案。

## 四、实施阶段

| 阶段 | 内容 | 预估工作量 |
| --- | --- | --- |
| **A 计划与备忘录** | Task/Memo store + 两个页面 + 提醒引擎(Web 通道) + 仪表盘整合 + 导航改版 + v3 迁移 | 一次会话 |
| **B 资料文件库** | IndexedDB 加密读写 + DocsView + 预览/下载 + 用量管理 | 一次会话 |
| **C 安卓落地** | 装 local-notifications 插件 + Manifest 权限 + 深链 + 图标 + 重出 APK | 半次会话 |
| D 远期可选 | TOTP、Ctrl+K、Markdown、日历视图、生物识别、zip 导出、docs 云同步 | 按需排期 |

## 五、待拍板决策点

1. 文件单体上限 50MB 是否合适？（更大的文件建议走网盘+把链接记进备忘录）
2. 备忘录是否需要 Markdown 渲染？（P1，会增加一个轻量依赖）
3. 实施顺序：A→B→C 连续推进，还是每阶段做完停下来验收？
