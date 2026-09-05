# Personal Hub · Design System（MASTER）

> 生成来源：ui-ux-pro-max v2.13.0 Design System Generator
> 检索输入：`personal productivity dashboard warm light restrained` · Dials: variance 3 / motion 3 / density 5
> 命中：Personal productivity dashboard → **Minimalism & Swiss Style**
> 本文件是全项目 UI 唯一规范。新增/修改页面必须引用本文 Token，禁止随意引入规范外颜色、字体、圆角、阴影、间距。
> 注：`--stack vue` 检索无数据库命中，Vue 侧规范回退至通用 Vue3 + Tailwind 最佳实践（官方声明）。

## 1. 设计原则

1. **平面优先**：无渐变、无毛玻璃（backdrop-blur）、无彩色光晕；层次只靠「明度差 + 1px 边框」
2. **单一强调色**：全站唯一品牌色 teal；彩色只允许出现在语义功能上（成功/警告/危险/分类标识）
3. **内容即界面**：装饰性元素为零；留白与字重承担层级
4. **动效克制**：150–200ms 标准过渡；列表入场 300–450ms；`prefers-reduced-motion` 时全部动画降为瞬时
5. **浅色优先**：暖白纸感基座，墨绿灰文字与低饱和青绿交互；深色是等价的可选外观，不是亮色反相

## 2. Design Tokens

### 2.1 色彩（亮色 · 默认）

| Token | 值 | 用途 |
| --- | --- | --- |
| `--color-body` | `#F7F6F2` | 页面背景 |
| `--color-surface` | `#FFFEFA` | 卡片 / 输入框 / 次级按钮 |
| `--color-surface-2` | `#F3F1EB` | 悬停态 / 嵌套块 / 选中底 |
| `--color-inset` | `#F8F6F0` | 卡片内嵌芯片（密码框、备注条） |
| `--color-line` | `#E4E0D7` | 全部 1px 边框 / 分隔线 |
| `--color-primary` | `#427D72` | 品牌色：主按钮、激活态、链接、焦点环 |
| `--color-primary-strong` | `#326C63` | 主按钮悬停 |
| `--color-ink` | `#F9FBF8` | primary 之上的文字/图标（对比度 ≥ 4.5:1） |
| foreground | `#202925` | 正文 |
| muted | `#62706A` | 次要文字的**下限**，禁止更浅的灰正文 |
| success | 深绿语义色 | 完成、正常态 |
| warning | 暖褐语义色 | 逾期、提醒 |
| danger | 豆沙红语义色 | 删除、错误、弱密码 |
| 分类色板 | 低饱和 sky/emerald/amber/rose/fuchsia/cyan（浅底 + 细边 + 深色文字） | 仅用于分类徽章，不作装饰 |

规则：
- 正文对比度 ≥ 4.5:1；元数据使用语义 `text-t3/text-t4`，禁止原始 slate 调色
- 主按钮：`bg-primary text-ink hover:bg-primary-strong`，**禁用渐变与投影**
- 危险操作：rose 边框 + 10% 底，不用填充按钮

### 2.2 字体

| 层级 | 规格 |
| --- | --- |
| 字族 | `'Plus Jakarta Sans', 'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif`（Web 字体后续自托管，离线回退系统栈） |
| 数据/密码 | `ui-monospace, Consolas, monospace` |
| 页面标题 | 24–30px / 700 |
| 区块标题 | 16px / 600 |
| 正文 | 14px / 400，行高 1.6 |
| 辅助 | 12px / slate-500 |
| 数字（统计/时间/星数） | `tabular-nums` |

### 2.3 主题系统（运行时切换）

两层维度，用户可在「设置 → 外观」自由组合，偏好存于 `xk.theme.v1`：

| 维度 | 取值 | 切换机制 |
| --- | --- | --- |
| 外观模式 | `dark` / `light` / `system` | `<html data-theme>`；system 监听 `prefers-color-scheme` |
| 主题色调 | `teal` / `indigo` / `blue` / `violet` / `rose` / `amber` | `<html data-accent>` |

- Token 链：`@theme inline` 把 `--color-*` 映射到 `--tk-*` 运行时变量；工具类（含 `/透明度`）经 `color-mix` 即时解析，切换零重渲染
- 亮色为默认基线（见 §2.1）；深色 Token 需独立校对表面、线条与文字对比度，不可机械反相
- 每个色调预设三件套：`primary / primary-strong / ink(on-primary)`，teal 与 amber 用深色 ink，其余用白色
- 分类徽章与便签色板走语义类（`.badge-*` / `.memo-*`），CSS 内含双主题色值；**禁止**在组件里写死分类颜色

- 分类徽章与便签色板走语义类（`.badge-*` / `.memo-*`），CSS 内含双主题色值；**禁止**在组件里写死分类颜色

### 2.7 背景图片（可选层）

- 层级：壁纸图（fixed, z-0）→ 主题色暗度遮罩（`color-mix(var(--tk-body), X%)`）→ 内容（z-10，卡片保持不透明）
- 内置 6 款程序化抽象壁纸（`public/wallpapers/w1~w6.jpg`，约 38KB/张）；自定义图片存本机 IndexedDB `xk-wallpaper`（≤8MB，不参与云同步）
- 可读性：默认暗度 65%，可调 0–85%；建议 ≥50%。文字对比度由遮罩保证，卡片内容永不受壁纸干扰
- 锁屏页不使用壁纸（隐私优先）

### 2.4 间距与圆角

- 间距：4px 基数（1=4 / 2=8 / 3=12 / 4=16 / 6=24 / 8=32）；卡片内边距 20px（p-5）
- 圆角：卡片/弹窗 `rounded-xl`(12px)；按钮/输入框/徽章 `rounded-lg`(8px)；头像/图标座 `rounded-full/xl`
- **禁用** rounded-2xl 及以上

### 2.5 阴影与高度

唯一允许的投影：弹窗层 `shadow-2xl shadow-black/50`。其余元素零阴影，层次靠 surface 明度。

### 2.6 动效

| 场景 | 规格 |
| --- | --- |
| 悬停/状态 | 150–200ms ease（颜色/边框/明度，禁止位移缩放类大动效） |
| 路由切换 | 淡入 + 6px 上移，180ms |
| 弹窗 | 淡入 + 12px 上移，200ms |
| 列表入场 | 300–450ms，每项 stagger 60ms（暂以 CSS transition 实现，不引 GSAP） |
| 骨架屏 | 1.4s 扫光循环（`.skeleton`） |
| reduced-motion | 全部动画/过渡 ≤ 0.01ms |

## 3. 组件规范

| 组件 | 规范 |
| --- | --- |
| 主按钮 | `bg-primary text-ink hover:bg-primary-strong` rounded-lg px-4 py-2.5 text-sm font-semibold |
| 次按钮 | `border border-line bg-surface text-t2 hover:bg-surface-2 hover:text-t1` |
| 幽灵按钮（图标） | `p-1.5 rounded-lg text-t3 hover:bg-surface-2 hover:text-t1` |
| 危险按钮 | `border border-danger/35 bg-danger/10 text-danger hover:bg-danger/18` |
| 状态确认弹窗 | 完成、删除等会改变记录状态的操作，先展示标题与关键详情，再提供取消与明确的确认操作；确认按钮是唯一主按钮 |
| 任务优先级 | 待办按高→中→低优先级、再按时间排序；使用带文字与圆点的紧凑语义标记：高=danger、中=warn、低=neutral，禁止只以颜色区分 |
| 今日工作台 | 每日最多突出 5 项重点；根据逾期、收集箱、当天待办与临近高优先级给出可一键采纳的建议；完成任务自动移出重点 |
| 周计划 | 用周一至周日的柔性日期轨道展示每一天的负载与留白，不用僵硬等高方格；自动安排必须先预览、尊重留白日和容量，并允许撤回；撤销周计划时须明确列出会同步移除的每日行动，并提供即时恢复 |
| 长期方向 | 以“想靠近的事 + 下一小步”表达；可暂停或放进愿望，不以进度落后、连续打卡或失败提示施压 |
| 温和支持 | 节奏选择、留白日、重新安放未完成任务与短暂停完全可选；休息不计为任务、不生成未完成记录、不作情绪诊断或治疗承诺；任务移动必须由用户勾选、确认，不能自动滚入明天 |
| Agent 资源库 | 用搜索 + 类型 / 功能 / Agent 三维分类器管理 SKILL 与 MCP；卡片优先展示名称、作用、兼容 Agent 与来源，细节渐进展开；“带到工作台”只能预填说明，不能暗示资源已安装或会自动执行 |
| 输入框 | `bg-surface border border-line rounded-lg text-sm focus:border-primary/60 focus:ring-2 focus:ring-primary/25` |
| 日期选择 | `AppDatePicker`：暖白弹层、中文周标题、主题化选中态；禁止直接使用浏览器原生 `input[type=date]` |
| 卡片 | `bg-surface border border-line rounded-xl p-5`，悬停 `hover:border-primary/40 hover:bg-surface-2`；重复条目使用独立卡片 + 16–20px 间距，允许以 1px primary 左边线建立扫描节奏，禁止共享方格底板；备忘录颜色仅用于 1px 侧边提示，卡面保持 surface；同一集合使用统一最小高度并使底部元数据对齐 |
| 徽章 | 分类色板公式（§2.1），rounded-lg px-2 py-1 text-xs |
| 弹窗 | `bg-elevated border border-line rounded-xl` + 唯一投影；遮罩 `bg-black/60`（无模糊） |
| 空态 | 虚线边框容器 + lucide 图标（text-t4）+ 主句（text-t2）+ 辅句（text-t4）+ 可选 CTA |
| 加载态 | 骨架屏 `.skeleton`（形状近似内容）；短等待（<300ms）不显示 |
| Toast | 底部居中胶囊，success=emerald 边 / error=rose 边，`bg-black/80` |
| 选中态（导航/筛选片） | `bg-primary/12 text-primary border-primary/50`（禁渐变填充） |
| 桌面侧栏 | 品牌区使用独立 surface 容器；分组标题仅作低对比度文字标记、以留白分段；当前页使用 surface + 细边框 + 2px primary 左侧标记，图标座只在当前页着色 |

## 4. 布局

- 桌面：左侧固定导航 256px；内容区 `max-w-7xl` 居中，内边距 24/40px
- 移动（<768px）：顶部条 + 底部 Tab（6 项，安全区 padding）；内容区底部预留 Tab 高度
- 断点：375 / 768 / 1024 / 1440；卡片网格 1→2→3 列
- 弹窗：移动端全宽 -32px 边距，最大高 85vh 内滚动

## 5. UX 准则与反模式（检索自 ux-guidelines，按严重度）

**必须（CRITICAL/HIGH）**
- 对比度 4.5:1；键盘可达；焦点环可见（primary 色）
- 触控目标 ≥ 44×44；加载反馈匹配预期等待时长（瞬时操作不显示 loading）
- 表单：label 可见、错误就近展示、必填标注
- 通知/删除等破坏性操作需确认
- 图标用 SVG（lucide），禁止 emoji 当图标

**避免（Anti-patterns）**
- 灰上灰文字、占位符当 label、错误只在表单顶部
- 仅 hover 才能发现的操作（移动端无 hover）→ 主要操作必须常显
- 0ms 瞬变与 >500ms 拖沓动效并存；宽度/高度动画
- 渐变、玻璃模糊、彩色光晕（本系统明确弃用）
- 复杂引导流程、首屏性能债

## 6. 交付前检查清单

- [ ] 响应式：375 / 768 / 1024 / 1440 无横向滚动
- [ ] 键盘走查：Tab 顺序、焦点环、Esc 关弹窗
- [ ] 对比度：正文 4.5:1，元数据 ≥ slate-500
- [ ] 悬停：所有可点元素有 hover 反馈（150–200ms）
- [ ] 焦点：`:focus-visible` primary 环
- [ ] 加载：异步操作有骨架屏/行内 spinner
- [ ] 空态：每列表有图标+主句+辅句(+CTA)
- [ ] 无 emoji 图标、无渐变、无 backdrop-blur、无规范外色值

## 7. 旧样式迁移映射

| 旧（禁用） | 新 |
| --- | --- |
| `bg-gradient-to-r from-indigo-500 to-fuchsia-500` | `bg-primary text-ink hover:bg-primary-strong` |
| `shadow-lg shadow-indigo-500/25` 等彩色投影 | 删除 |
| `backdrop-blur*` | 删除 |
| `bg-white/[0.03–0.08]` / `bg-white/5` / `bg-white/10` | `bg-surface` / `bg-surface-2` |
| `border-white/5|10` | `border-line` |
| `text/border/bg-indigo-*` | `primary` 系 Token |
| `bg-black/25|30|40`（内嵌芯片） | `bg-inset` |
| 卡片 `rounded-2xl` | `rounded-xl` |
| `text-slate-*` 原始颜色 | `text-t1~text-t4` 语义 Token |
| 头像/图标座渐变 | 对应语义纯色 |
