# Personal Hub · 个人信息管理台

一个本地优先的个人信息 + 账号密码管理网页。当前为 **P5 全功能版**：P2 加密 + P3 可选云同步 + P4 安卓 APP + 每日计划/工作备忘录/个人资料库（P5）。

## 技术栈

- 构建：Vite 8 + TypeScript 5.9
- 框架：Vue 3.5（`<script setup>` 组合式 API）+ Vue Router 5（hash 模式，便于以后 Capacitor 打包）
- 样式：Tailwind CSS v4（通过 `@tailwindcss/vite` 插件，无 tailwind.config）
- 图标：@lucide/vue
- 加密：hash-wasm（Argon2id WASM）+ WebCrypto（AES-256-GCM）
- 预览：pdfjs-dist（PDF 分页渲染，安卓 WebView 唯一可行方案）、docx-preview、xlsx(SheetJS)——全部动态 import 独立分包，主包零增量

## 常用命令

```bash
npm run dev        # 启动开发服务器（默认 http://localhost:5173）
npm run build      # 类型检查 + 打包到 dist/
npm run typecheck  # 仅类型检查
npm run preview    # 预览构建产物
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
│   ├── backup.ts         # 加密备份导出/导入（.phub 文件，含信封+附件密文，支持跨主密码恢复）
│   ├── biometric.ts      # 指纹解锁：Keystore 硬件保护凭据（@capgo/capacitor-native-biometric）
│   ├── sync.ts           # PocketBase REST 客户端 + 时间戳 LWW 同步引擎 + 自动推送调度
│   └── toast.ts          # 轻量 toast + copyText 复制工具
├── stores/
│   ├── profile.ts        # 个人资料（纯内存 reactive，持久化由 database 负责）
│   ├── vault.ts          # 密码条目内存状态与 CRUD；含 seedEntries 示例数据
│   ├── tasks.ts          # 每日计划：智能快捷输入解析(parseQuickInput)、标签/子任务、重复滚动
│   ├── memos.ts          # 工作备忘录便签（六色卡片、置顶）
│   ├── repos.ts          # GitHub 项目收藏：CRUD + API 元数据抓取 + 语言配色 + 分类常量
│   ├── docs.ts           # 资料库：元数据进信封同步；文件本体加密存 IndexedDB（≤50MB）
│   ├── database.ts       # 加密数据库层：信封读写(含 tasks/memos/docMetas/repos)、水合/持久化、保存事件广播
│   └── lock.ts           # 锁定状态机：fresh/legacy/encrypted 三态、解锁/设置/改密、自动锁定
├── components/
│   ├── ModalShell.vue    # 通用弹窗外壳（遮罩+面板+过渡+ESC 关闭）
│   ├── LockScreen.vue    # 锁屏：首次创建主密码 / 解锁 / 忘记密码重置
│   ├── SettingsModal.vue # 设置：自动锁定、修改主密码、云同步配置与管理
│   ├── ProfileModal.vue  # 编辑个人资料表单
│   ├── EntryModal.vue    # 新增/编辑账号表单（含密码生成器、强度条）
│       ├── TaskRow.vue       # 任务行（子任务展开/进度/标签/勾选/派发AI），四视图共用
│   ├── TaskModal.vue     # 新增/编辑任务（日期时间/优先级/重复/标签/子任务；设时间时申请通知权限）
│   ├── MemoModal.vue     # 新增/编辑便签（颜色选择、置顶）
│   ├── RepoModal.vue     # 收藏 GitHub 项目（粘贴链接自动抓取元数据，失败降级手动）
│   ├── AiConfigModal.vue # AI 工作台连接配置：多配置档案（五 agent/双通道/bridge 凭据，另存/删除/快速切换）
│   ├── DocThumb.vue      # 图片文件缩略图（懒解密 + 卸载回收 objectURL）
│   ├── DocPreviewModal.vue # 资料预览：图片缩放旋转平移/PDF分页/docx/表格/文本/音视频
│   ├── EditDocModal.vue  # 编辑资料元信息（名称/分类/标签/备注/置顶）
│   ├── settings/         # 设置弹窗分区组件：SecuritySection / BackupSection / SyncSection / AboutSection
│   └── ToastHost.vue     # 全局提示渲染
└── views/
    ├── DashboardView.vue # 总览页：问候语、资料卡、统计(含今日任务/下一提醒倒计时)、最近更新
    ├── TodayView.vue     # 每日计划：四视图(今天/本周/全部/已完成)、智能快捷输入(自然语言+标签)、子任务、搜索/标签筛选
    ├── MemosView.vue     # 备忘录：瀑布流便签墙、#标签筛选、[ ]清单勾选、一键转任务、搜索、字数统计
    ├── ReposView.vue     # 项目收藏 + 我的项目：GitHub 关键词搜索/链接抓取、六分类、连接账号读仓库与 Issue（Token 加密存储）
    ├── AiView.vue        # AI 工作台：双通道连接 opencode，真流式输出/TODO透视/权限审批(永久允许)/diff/文件浏览/模型与Agent切换/分享/常用指令/任务派发
    ├── （pi agent 经 bridge/phub-bridge.mjs v2 的 --agent pi 模式接入，协议为 pi --mode rpc JSONL）
    ├── DocsView.vue      # 资料库：上传加密入库、分类检索、批量管理、排序、图片/PDF/docx/xlsx/文本/音视频在线预览、存储用量
    └── VaultView.vue     # 密码库页：搜索(/聚焦)、分类筛选、排序、TOTP 实时动态码、复制/显隐(20s自动隐藏)/收藏/删除
```

## 安全架构（P2）

- 主密码 → Argon2id（64MB / t=3 / p=4，参数见信封明文头）→ 256 位 AES 密钥（non-extractable CryptoKey，仅存内存）
- 全部业务数据（profile + entries）序列化为单个 JSON，AES-256-GCM 加密后存 `xk.data.v2`
- **KDF 盐放在密文信封的明文头**：所有设备按同一套参数派生同一把钥匙，这是多端可互解的关键
- 锁屏校验 = 尝试解密（GCM 认证失败即密码错误），不存独立验证器
- 主密码忘记 = 数据永久无法解密；锁屏提供「清除本机全部数据」逃生口（双重确认）
- P1.5 明文老数据自动迁移：旧 PBKDF2 锁记录先验旧密码，成功后无缝升级为加密存储并清理旧键
- 自动锁定后清空内存中的密钥与已解密数据

## 云同步（P3 · 可选）

- 后端：PocketBase 单文件（集合 `vaults`：user 关联 users、data 存整个加密信封 JSON）
- 零知识：服务器只存密文信封；API Rules 四项均为 `@request.auth.id != "" && user = @request.auth.id`
- 冲突策略：信封级时间戳 LWW（拉取较新者整包覆盖），主密码不一致时提示用户选择是否用本机覆盖云端
- PocketBase 登录密码不明文本地保存——用主密钥加密存放于 `xk.sync.secure`
- 触发：手动「立即同步」、修改后约 5 秒自动推送（可关）、解锁后自动拉取一次

## 数据存储键名

| 键 | 内容 |
| --- | --- |
| `xk.data.v2` | 加密数据信封 { v, kdf, ts, ivB64, ctB64 }，payload 含 profile/entries/tasks/memos/docMetas/repos |
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
- 表单输入统一使用各组件内 `inputCls` 同款样式的类组合
- 改完代码必须跑 `npm run build` 验证

## 安卓打包（P4 · Capacitor 8）

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
- `E:\phub` → 项目根、`E:\phub-sdk` → `.android-sdk` 是目录联接（junction），用于规避 AGP 对中文路径的检查；`android/gradle.properties` 已加 `android.overridePathCheck=true` 双保险
- SDK 组件：platform-tools + platforms;android-36 + build-tools;36.0.0；Gradle wrapper 8.14.3（-bin）；JDK 24 跑构建
- local-notifications 插件要求 JDK 21 工具链：项目 `.jdks/jdk-21`（Temurin 便携版），已在 `android/gradle.properties` 注册 `org.gradle.java.installations.paths`
- 通知权限：Manifest 已声明 POST_NOTIFICATIONS + SCHEDULE_EXACT_ALARM + USE_EXACT_ALARM；运行时由 TaskModal 保存带时间任务时触发申请
- 指纹解锁：设置里验证主密码后，主密码经 `accessControl: BIOMETRY_ANY` 存入 Android Keystore（读取需过 BiometricPrompt）；改主密码时自动同步更新凭据
- 正式签名包：`gradlew.bat assembleRelease` → `app-release.apk`；签名配置在 `android/keystore.properties`（gitignore），keystore 文件为项目根 `personal-hub.keystore`——**两者都丢失将无法再出同签名更新包**，务必另行备份

## 后续路线

1. AI 工作台 P6.3：五 agent 适配器全部完成（opencode/pi/codex/dsh/zcode，bridge v2 多 agent 架构）；剩余安卓审批推送、E2E 加密（详见 docs/AI-WORKBENCH.md）
2. 正式发布：keystore 已生成，后续版本迭代记得递增 versionCode/versionName
3. 远期备选：Ctrl+K 全局搜索、备忘录 Markdown、docs 文件本体云同步、日历视图（详见 docs/P5-FEATURES.md）

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

