# Personal Hub · 个人信息管理台

非 AI 优化增量见 `docs/HUB-IMPROVEMENTS.md`：全局搜索与收集、任务来源关联、按分钟容量排期、本机回收站与修改历史、字段冲突对比、前台周期同步、附件按需下载与密文断点缓存、会话内文本/PDF 正文搜索。AI 远程功能按用户要求暂缓；下方历史路线中的全局搜索、附件同步等待办以专题文档为准。

当前 1.1.1 预览发布准备见 `docs/PREVIEW-RELEASE.md`：桌面宠物纳入 Windows 交付；Android 锁定保留系统提醒，Windows/Web 锁定暂停扫描。托盘已实现。桌面通知通过原生 IPC 等待提交回执，通知点击跳转尚未实现，不沿用历史“点击唤窗”描述。Tailwind 扫描范围限定 src，避免文档与本机实验文件影响 CSS。

一个本地优先的个人信息 + 账号密码管理网页。当前为 **P6 全功能版**：P2 加密 + P3 可选云同步 + P4 安卓 APP + P5 每日计划（周计划/长期计划/精力管理）/工作备忘录/个人资料库 + P6 AI 工作台（五 agent）+ Agent 资源库。三端同构：**Web / Windows 桌面（Tauri 2）/ Android（Capacitor 8）**。

## 技术栈

- 构建：Vite 8 + TypeScript 5.9
- 框架：Vue 3.5（`<script setup>` 组合式 API）+ Vue Router 5（hash 模式，便于以后 Capacitor 打包）
- 样式：Tailwind CSS v4（通过 `@tailwindcss/vite` 插件，无 tailwind.config）
- 图标：@lucide/vue
- 加密：hash-wasm（Argon2id WASM）+ WebCrypto（AES-256-GCM）
- 预览：pdfjs-dist（PDF 分页渲染，安卓 WebView 唯一可行方案）、docx-preview、xlsx(SheetJS 0.20.x，官方 CDN 版)——全部动态 import 独立分包，主包零增量
- 桌面：Tauri 2（`@tauri-apps/api` + notification/opener 插件；`lib/desktop.ts` 适配通知点击唤窗、外链打开，`isTauriDesktop()` 区分运行环境）
- 测试：Vitest（`npm run test`），覆盖 crypto/totp（RFC 官方向量）

## 常用命令

```bash
npm run dev        # 启动开发服务器（默认 http://localhost:5173）
npm run build      # 类型检查 + 打包到 dist/
npm run typecheck  # 仅类型检查
npm run test       # Vitest 单元测试（crypto/totp）
npm run preview    # 预览构建产物
npm run desktop:dev / desktop:build   # Tauri 桌面端开发 / 出 NSIS 安装包
```

## 目录结构

```
src/
├── main.ts               # 入口
├── App.vue               # 全局布局 + 锁屏门禁(isGated) + 绑定自动云推送 + 路由过渡
├── router/index.ts       # 路由（/ 总览、/vault 密码库），hash 模式
├── types.ts              # ProfileInfo / VaultEntry / KdfParams / DataEnvelope / VaultPayload
├── lib/
│   ├── utils.ts          # 密码强度、随机密码生成、日期工具(YMD/重复规则)、分类与配色常量
│   ├── crypto.ts         # Argon2id 密钥派生、AES-256-GCM 加解密(JSON+字节)、旧版 PBKDF2 兼容
│   ├── keyring.ts        # 内存中的主密钥持有者（避免 store 间循环依赖）
│   ├── docdb.ts          # IndexedDB 封装：加密文件二进制存取（xk-docs/blobs）
│   ├── reminders.ts      # 提醒引擎：Web 30s 扫描通知 + 安卓原生闹钟调度/重排
│   ├── totp.ts           # TOTP 动态验证码（RFC 6238，纯 WebCrypto，经 RFC 官方向量验证）
│   ├── aiopencode.ts     # opencode serve HTTP 客户端（AI 工作台：双通道调度/流式/TODO/文件/模型/审批/分享/派发）
│   ├── github.ts         # GitHub REST 客户端（仓库/Issue 抓取，PAT 加密存储）
│   ├── quickparse.ts     # 快捷输入自然语言解析（日期/时间/标签/优先级）
│   ├── desktop.ts        # Tauri 桌面适配：通知点击唤窗、外链 opener、isTauriDesktop 判定
│   ├── wallpaper.ts / wallpaperdb.ts  # 背景壁纸：6 内置 + 自定义上传（IndexedDB xk-wallpaper）
│   ├── backup.ts         # 加密备份导出/导入（.phub 文件，含信封+附件密文，支持跨主密码恢复）
│   ├── biometric.ts      # 指纹解锁：Keystore 硬件保护凭据（@capgo/capacitor-native-biometric）
│   ├── sync.ts           # PocketBase REST 客户端 + 时间戳 LWW 同步引擎 + 自动推送调度
│   ├── toast.ts          # 轻量 toast + copyText 复制工具
│   └── __tests__/        # Vitest：crypto.test.ts / totp.test.ts（RFC 6238 官方向量）
├── stores/
│   ├── profile.ts        # 个人资料（纯内存 reactive，持久化由 database 负责）
│   ├── vault.ts          # 密码条目内存状态与 CRUD；含 seedEntries 示例数据
│   ├── tasks.ts          # 每日计划：智能快捷输入解析(parseQuickInput)、标签/子任务、重复滚动
│   ├── planning.ts       # 规划系统：周计划(每周 N 次×偏好星期自动排期)→长期计划(月/季/年/愿望)→每日精力(gentle/steady/focused)
│   ├── agentResources.ts # Agent 资源库：skill/mcp/plugin 台账（GitHub 元数据抓取、MCP 传输/能力标注、自定义分类体系）
│   ├── theme.ts          # 主题：外观模式/色调/壁纸，驱动 <html data-theme/data-accent>
│   ├── memos.ts          # 工作备忘录便签（六色卡片、置顶）
│   ├── repos.ts          # GitHub 项目收藏：CRUD + API 元数据抓取 + 语言配色 + 分类常量
│   ├── docs.ts           # 资料库：元数据进信封同步；文件本体加密存 IndexedDB（≤50MB）
│   ├── database.ts       # 加密数据库层：信封读写(tasks/weeklyPlans/longPlans/planner/agentResources/memos/docMetas/repos)、水合/持久化、保存事件广播
│   └── lock.ts           # 锁定状态机：fresh/legacy/encrypted 三态、解锁/设置/改密、自动锁定
├── components/
│   ├── ModalShell.vue    # 通用弹窗外壳（遮罩+面板+过渡+ESC 关闭）
│   ├── PageHeader.vue    # 页头（标题/描述/主操作），各视图共用
│   ├── AppDatePicker.vue / AppSelect.vue / PasswordInput.vue  # 基础表单控件（日期、下拉、密码显隐）
│   ├── CardActionMenu.vue # 卡片右上角操作菜单（置顶/编辑/删除）
│   ├── LockScreen.vue    # 锁屏：首次创建主密码 / 解锁 / 忘记密码重置
│   ├── SettingsModal.vue # 设置：外观、安全、备份、云同步、关于（分区见 settings/）
│   ├── ProfileModal.vue  # 编辑个人资料表单
│   ├── EntryModal.vue    # 新增/编辑账号表单（含密码生成器、强度条）
│   ├── TaskRow.vue       # 任务行（子任务展开/进度/标签/勾选/派发AI），四视图共用
│   ├── TaskModal.vue     # 新增/编辑任务（日期时间/优先级/重复/标签/子任务；设时间时申请通知权限）
│   ├── WeeklyPlanModal.vue      # 新增/编辑周计划（标题/次数/偏好星期/关联长期计划）
│   ├── WeekSchedulePreviewModal.vue # 周排期预览：按精力与偏好星期生成任务，可逐条调整
│   ├── LongPlanModal.vue # 新增/编辑长期计划（领域/期限/目标日/下一步）
│   ├── OverdueTaskQueueModal.vue # 逾期任务队列：批量顺延到今日
│   ├── GentlePauseModal.vue / GentleResetModal.vue # 温和暂停/重置流程
│   ├── TaskCompletionModal.vue   # 任务完成庆祝
│   ├── TaskDeleteModal.vue / PlanDeleteModal.vue # 删除确认（含关联任务提示）
│   ├── AgentResourceModal.vue / AgentResourceDeleteModal.vue # Agent 资源新增/编辑/删除
│   ├── PiProjectModal.vue # pi agent 项目配置
│   ├── MemoModal.vue     # 新增/编辑便签（颜色选择、置顶）
│   ├── RepoModal.vue     # 收藏 GitHub 项目（粘贴链接自动抓取元数据，失败降级手动）
│   ├── AiConfigModal.vue # AI 工作台连接配置：多配置档案（五 agent/双通道/bridge 凭据，另存/删除/快速切换）
│   ├── DocThumb.vue      # 图片文件缩略图（懒解密 + 卸载回收 objectURL）
│   ├── DocPreviewModal.vue # 资料预览：图片缩放旋转平移/PDF分页/docx/表格/文本/音视频
│   ├── EditDocModal.vue  # 编辑资料元信息（名称/分类/标签/备注/置顶）
│   ├── settings/         # 设置弹窗分区：SecuritySection / BackupSection / SyncSection / AppearanceSection / AboutSection
│   └── ToastHost.vue     # 全局提示渲染
└── views/
    ├── DashboardView.vue # 总览页：问候语、资料卡、统计(含今日任务/下一提醒倒计时)、最近更新
    ├── TodayView.vue     # 每日计划：四视图(今天/本周/全部/已完成)、智能快捷输入(自然语言+标签)、子任务、搜索/标签筛选
    ├── MemosView.vue     # 备忘录：瀑布流便签墙、#标签筛选、[ ]清单勾选、一键转任务、搜索、字数统计
    ├── ReposView.vue     # 项目收藏 + 我的项目：GitHub 关键词搜索/链接抓取、六分类、连接账号读仓库与 Issue（Token 加密存储）
    ├── AiView.vue        # AI 工作台：双通道连接五 agent(opencode/pi/codex/dsh/zcode)，真流式输出/TODO透视/权限审批(永久允许)/diff/文件浏览/模型与Agent切换/分享/常用指令/任务派发
    ├── AgentLibraryView.vue # Agent 资源库：skill/mcp/plugin 台账，GitHub 链接抓取、kind/分类/agent 多维筛选、MCP 传输与能力标注
    ├── DocsView.vue      # 资料库：上传加密入库、分类检索、批量管理、排序、图片/PDF/docx/xlsx/文本/音视频在线预览、存储用量
    └── VaultView.vue     # 密码库页：搜索(/聚焦)、分类筛选、排序、TOTP 实时动态码、复制/显隐(20s自动隐藏)/收藏/删除
```

## 安全架构（P2）

第三阶段更新：安全设置可将 v2 显式升级至 v3 随机数据密钥 + 密码封装（`lib/vaultKeys.ts`）；v3 改密只更新封装，禁止按密码直接派生业务密钥，统一用 `unlockEnvelope`。支持 `.phub-device` 离线加入空设备，保留源 vaultId/keyId；旧整库 PocketBase 同步在 v3 停用。首次创建目前仍为 v2。详见 `docs/DEVICE-KEYS.md`，下方原派生流程仅适用于 v2。

- 主密码 → Argon2id（64MB / t=3 / p=4，参数见信封明文头）→ 256 位 AES 密钥（non-extractable CryptoKey，仅存内存）
- 全部业务数据（profile + entries）序列化为单个 JSON，AES-256-GCM 加密后存 `xk.data.v2`
- **KDF 盐放在密文信封的明文头**：所有设备按同一套参数派生同一把钥匙，这是多端可互解的关键
- 锁屏校验 = 尝试解密（GCM 认证失败即密码错误），不存独立验证器
- 主密码忘记 = 数据永久无法解密；锁屏提供「清除本机全部数据」逃生口（双重确认）
- P1.5 明文老数据自动迁移：旧 PBKDF2 锁记录先验旧密码，成功后无缝升级为加密存储并清理旧键
- 自动锁定后清空内存中的密钥与已解密数据

## 云同步（P3 · 可选）

第四阶段新增逐条客户端引擎（`recordSyncEngine.ts` / `recordSync.ts`），在途密文请求、游标、退避与冲突与业务一起事务保存。第五阶段新增 `server/` 下的 Node.js 24 + SQLite HTTP 服务（`npm run sync:server`）及 v3 设置页连接入口。令牌仅存当前解锁会话；锁定后断开，需手动重新连接。默认仅回环监听，跨设备要求 HTTPS。详见 `docs/RECORD-SYNC.md`、`docs/SYNC-SERVER.md`；不得把演练成功称为真机联网验收，下方 PocketBase 仅为旧 v2 整库模式。

- 后端：PocketBase 单文件（集合 `vaults`：user 关联 users、data 存整个加密信封 JSON）
- 零知识：服务器只存密文信封；API Rules 四项均为 `@request.auth.id != "" && user = @request.auth.id`
- 冲突策略：信封级时间戳 LWW（拉取较新者整包覆盖），主密码不一致时提示用户选择是否用本机覆盖云端
- PocketBase 登录密码不明文本地保存——用主密钥加密存放于 `xk.sync.secure`
- 触发：手动「立即同步」、修改后约 5 秒自动推送（可关）、解锁后自动拉取一次

## 数据存储键名

第七阶段：逐条同步支持附件本体密文分块上传下载（`attachmentSync.ts` / `attachmentSyncStore.ts`），DocMeta.attachment 为加密元信息中的分块描述，服务器 SQLite blobs 表按保险库隔离。单文件 50 MiB、服务端每库 1 GiB，暂不自动垃圾回收。详见 `docs/ATTACHMENT-SYNC.md`。下方“不随信封同步”仍指附件不直接嵌入业务信封，已可通过独立接口传输。

第六阶段：逐条同步连接配置使用数据密钥加密保存于 Repository 的 `xk.record-sync.secure`，解锁后自动重连，锁定时暂停；“断开并移除配置”删除保存的凭据。此前仅会话保留令牌的说明是第五阶段历史行为。详见 `docs/SYNC-EXPERIENCE.md`。

存储更新：`xk.data.v2`、三类加密连接凭据、`xk.lock.v2` 现由 `lib/vaultRepository.ts` 统一存入 IndexedDB `xk-vault/state`，启动前迁移旧 localStorage 数据；这些键禁止直接 `localStorage` 写入，必须使用异步 `commitRepository`。附件和普通设置仍保持原存储。详见 `docs/LOCAL-STORAGE.md` 和 `docs/OFFLINE-SYNC.md`。客户端原生 SQLite 尚未接入；第五阶段服务端使用 SQLite，已接入 HTTP 逐条同步。

| 键 | 内容 |
| --- | --- |
| `xk.data.v2` | 加密数据信封 { v, kdf, ts, ivB64, ctB64 }，payload 含 profile/entries/tasks/weeklyPlans/longPlans/planner/agentResources/agentResourceTaxonomy/memos/docMetas/repos |
| `xk.lock.v2` | 设备本地偏好：密码提示、自动锁定分钟数 |
| `xk.sync.cfg` / `xk.sync.secure` / `xk.sync.meta` | 同步配置 / 加密的同步密码 / 上次同步信息 |
| `xk.github.cfg` / `xk.github.secure` | GitHub 连接（用户名 / 主密钥加密的 PAT，用于私有仓库与更高限额） |
| `xk.ai.cfg` / `xk.ai.profiles.v1` / `xk.ai.active.v1` | AI 工作台：多套连接配置档案（通道/地址/凭据）+ 当前激活档案 ID |
| IndexedDB `xk-docs/blobs` | 资料库文件本体（AES-GCM 加密二进制），不随信封同步 |
| IndexedDB `xk-wallpaper/imgs` | 自定义背景图片（明文 Blob，非敏感，≤8MB） |

## 锁定行为约定

- 主密钥只存内存：每次打开/刷新页面都需输入主密码重新解锁派生，无任何"保持登录"机制
- 自动锁定默认 5 分钟无操作，可在设置弹窗调整（1/5/10/30 分钟或从不）
- 忘记主密码 = 无法找回，锁屏提供「重置并清除全部本地数据」逃生口（双重确认）

## 约定

- UI 文案使用中文；代码内不写注释（除非用户要求）
- 新组件放 `src/components/`，页面放 `src/views/`
- **UI 必须遵循 `design-system/MASTER.md`**：语义 Token（surface/line/primary/t1–t4/ok/warn/danger 等）定义在 `src/style.css`，经 `@theme inline` 映射运行时变量；禁止引入规范外的颜色、渐变、阴影、圆角
- **主题系统**：外观模式（dark/light/system）+ 色调（6 预设）+ 背景图片（6 内置/自定义上传，`lib/wallpaper.ts` + IndexedDB `xk-wallpaper`）由 `stores/theme.ts` 驱动 `<html data-theme/data-accent>`；文字一律用 `text-t1~t4`，功能文字用 `text-ok/warn/danger/info`，分类徽章用 `badge badge-*` 语义类——**禁止写死 slate/indigo 等原始色**（彩色底上的 text-white 除外）
- 基础表单控件已沉淀为 `AppDatePicker` / `AppSelect` / `PasswordInput`，新表单优先复用；其余输入沿用各组件内 `inputCls` 同款类组合
- 改完代码必须跑 `npm run build` 验证

## 安卓打包（P4 · Capacitor 8）

原生导出：附件、备份、设备加入文件统一调用 `lib/saveFile.ts`。Android 项目内 `DocumentSaverPlugin` 使用系统文件选择器和分块写入；Windows 使用 dialog/fs 插件，权限限于用户选择的文件；Web 仍为浏览器下载。取消保存不得报告导出成功。详见 `docs/NATIVE-FILE-SAVE.md`。

```powershell
npm run build
npx cap sync android
```

然后在本机用 Gradle 出包（SDK 在项目 `.android-sdk/`，缓存也在项目内）：

```powershell
$env:ANDROID_HOME='E:\phub-sdk'; $env:ANDROID_SDK_ROOT='E:\phub-sdk'; $env:GRADLE_USER_HOME='E:\phub\.gradle-home'
cmd /c "cd /d E:\phub\android && gradlew.bat assembleDebug"
```

- 产物：`android/app/build/outputs/apk/debug/app-debug.apk`（约 4MB）
- Debug 变体使用独立包名 `com.zdb.personalhub.debug`、名称「Personal Hub 测试版」，与正式版并存，避免真机验收覆盖用户数据。
- `E:\phub` → 项目根、`E:\phub-sdk` → `.android-sdk` 是目录联接（junction），用于规避 AGP 对中文路径的检查；`android/gradle.properties` 已加 `android.overridePathCheck=true` 双保险
- SDK 组件：platform-tools + platforms;android-36 + build-tools;36.0.0；Gradle wrapper 8.14.3（-bin）；JDK 24 跑构建
- local-notifications 插件要求 JDK 21 工具链：项目 `.jdks/jdk-21`（Temurin 便携版），通过 `PHUB_JDK21_HOME` 或 `JAVA_HOME` 提供 JDK 21，仓库不固定个人路径
- 通知权限：Manifest 已声明 POST_NOTIFICATIONS + SCHEDULE_EXACT_ALARM + USE_EXACT_ALARM；运行时由 TaskModal 保存带时间任务时触发申请
- 指纹解锁：设置里验证主密码后，主密码经 `accessControl: BIOMETRY_ANY` 存入 Android Keystore（读取需过 BiometricPrompt）；改主密码时自动同步更新凭据
- 正式签名包：`gradlew.bat assembleRelease` → `app-release.apk`；签名配置在 `android/keystore.properties`（gitignore），keystore 文件为项目根 `personal-hub.keystore`——**两者都丢失将无法再出同签名更新包**，务必另行备份
- 版本号：`android/app/build.gradle` 的 versionCode/versionName（当前 3 / "1.1.1"，与 Tauri 1.1.1 对齐），以 package.json 的 version/androidVersionCode 为源，执行 npm run version:sync 同步；构建时自动检查一致性。每次发版递增

## 桌面打包（Tauri 2 · Windows）

```bash
npm run desktop:build   # = vue-tsc + vite build + cargo build + NSIS 打包
```

- 产物：`src-tauri/target/release/personal-hub-desktop.exe` 与 `bundle/nsis/Personal Hub_<版本>_x64-setup.exe`
- 配置：`src-tauri/tauri.conf.json`（窗口 1280×820、NSIS target、CSP 已收紧——含 `wasm-unsafe-eval`（hash-wasm）、`ipc: http://ipc.localhost`（Tauri v2 Windows IPC）、`connect-src http/https/ws/wss`（LAN 直连 agent 与 PocketBase）、`img/media/worker blob:`（IndexedDB 解密预览与 pdfjs worker））
- 插件：notification（桌面通知）、opener（外链安全打开）；`lib/desktop.ts` 统一封装，Web/安卓分支自动降级
- Rust 依赖走 cargo（`src-tauri/Cargo.toml`，已配置托盘、关闭隐藏和桌面宠物窗口）

## 后续路线

1. AI 工作台：五 agent 适配器已完成（opencode/pi/codex/dsh/zcode，bridge v2 多 agent 架构）；剩余安卓审批推送、E2E 加密（详见 docs/AI-WORKBENCH.md）
2. 远程备份：git 已有首次提交（main 分支），尚未配置远程私有仓库
3. 正式发布：keystore 已生成，版本迭代记得递增 versionCode/versionName（Android 与 Tauri 两处）
4. 巨型视图拆分：TodayView(1400+行)/AiView(1100+行) 下次大改前先下沉 composables
5. 远期备选：Ctrl+K 全局搜索、备忘录 Markdown、docs 文件本体云同步、日历视图（详见 docs/P5-FEATURES.md）

## opencode Skills

本项目专用 skill 位于 `.opencode/skills/`（仅对本项目生效）：

**工程流程类**
- `context-engineering` — 工程上下文管理
- `frontend-ui-engineering` — 前端 UI 工程规范
- `git-workflow-and-versioning` — Git 工作流
- `incremental-implementation` — 小步增量实现
- `ui-visual-composition` — UI 视觉构图设计

**UI/UX Pro Max 套件**（nextlevelbuilder/ui-ux-pro-max-skill，检索脚本依赖 Python）
- `ui-ux-pro-max` — 主入口：79 种 UI 风格 / 192 套产品配色 / 74 组字体搭配 / 119 条 UX 准则，`scripts/search.py` 按需检索
- `design` / `design-system` — 设计与设计系统专项
- `ui-styling` — 样式实现专项（22 技术栈适配）
- `brand` / `banner-design` / `slides` — 品牌 / 横幅 / 幻灯片专项

