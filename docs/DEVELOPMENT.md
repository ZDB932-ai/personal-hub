# 开发与构建

[返回项目首页](../README.md) · [贡献约定](../CONTRIBUTING.md)

使用 **Node.js 24.x**。技术栈为 Vue 3、TypeScript、Vite、Tailwind CSS，原生壳分别为 Tauri 2 和 Capacitor 8。

```bash
git clone https://github.com/ZDB932-ai/personal-hub.git
cd personal-hub
npm ci
npm run dev
```

开发服务默认地址为 `http://localhost:5173`。可直接克隆公开仓库，无需配置 GitHub 访问凭据。

```bash
npm run test           # 单元测试
npm run sync:typecheck # 同步服务类型检查
npm run build          # 版本检查、前端类型检查与生产构建
npm run preview -- --host 127.0.0.1 --port 4183
```

保持预览服务运行，在另一个终端执行 `npm run test:ui`。UI 验收默认使用 Edge；其他环境安装对应 Playwright 浏览器，并通过 `PHUB_BROWSER_CHANNEL` 指定，例如 `chromium`。

## 原生构建

原生构建需要另行安装工具链：Windows 需要 Rust、MSVC C++ 构建工具和 WebView2；Android 需要 SDK 36 与 JDK 21 工具链。通过 `ANDROID_HOME` / `ANDROID_SDK_ROOT` 指定 SDK，通过 `PHUB_JDK21_HOME` 或 `JAVA_HOME` 提供 JDK 21。

Windows 安装程序：

```bash
npm run desktop:build
```

输出位于 `src-tauri/target/release/bundle/nsis/`。

Android 测试包（在 Windows PowerShell 中）：

```powershell
npm run build
npx cap sync android
Set-Location android
.\gradlew.bat assembleDebug
```

输出位于 `android/app/build/outputs/apk/debug/app-debug.apk`。

正式 Android 包需自行配置 `android/keystore.properties` 与签名文件，再执行 `assembleRelease`；签名文件和密码不得提交到仓库。建议使用纯英文项目路径；当前 Windows 开发环境通过目录联接处理中文路径的构建兼容问题。

## 版本与目录

版本以 `package.json` 的 `version` 与 `androidVersionCode` 为源，修改后运行 `npm run version:sync` 同步原生配置。

```text
src/           Vue 页面、组件、本地数据与加密逻辑
src-tauri/     Windows 桌面壳与桌宠窗口
android/       Android 原生工程
server/        可选的逐条同步服务
bridge/        AI 工作台桥接服务
scripts/       构建检查与 UI 验收脚本
docs/          设计、部署与验证说明
design-system/ 视觉规范与语义设计 Token
```

## 可选服务

单独运行网页或原生客户端不需要启动以下服务。

| 服务 | 说明 | 文档 |
| --- | --- | --- |
| 逐条同步 | Node.js 24 + SQLite，自托管；默认仅监听本机回环地址 | [部署](SYNC-SERVER.md) / [连接与重连](SYNC-EXPERIENCE.md) |
| AI bridge | 连接外部 Agent，需按所选服务配置地址、权限与凭据 | [AI 工作台](AI-WORKBENCH.md) |

同步部署文档包含阶段历史说明，请同时阅读文首更新提示。新账户直接使用 v3；其他设备应先加入同一保险库，再配置持续同步。跨设备网络地址需要可信 HTTPS，不能简单将 `127.0.0.1` 改成局域网 IP。

## 验证约定

UI 验收使用独立浏览器上下文和合成账户。Android 真机脚本仅用于指定的独立测试应用，Windows 生命周期脚本会构建隔离应用标识；运行前阅读 [Android 验证说明](ANDROID-POLISH.md) 和 [Windows 验证说明](DESKTOP-WEB-REVIEW.md)。不要把脚本直接指向真实个人保险库。

修改代码后运行生产构建；涉及加密、迁移或同步时补充兼容与失败恢复验证，涉及原生能力时补充对应设备验证。完整要求见 [CONTRIBUTING.md](../CONTRIBUTING.md)。
