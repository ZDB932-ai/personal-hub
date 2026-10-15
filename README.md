<div align="center">

# Personal Hub

**本地优先的个人工作台 · 让记录接上行动**

任务计划 · 备忘录 · 加密资料 · 密码管理

[![CI](https://github.com/ZDB932-ai/personal-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/ZDB932-ai/personal-hub/actions/workflows/ci.yml)

[下载 v1.1.4](https://github.com/ZDB932-ai/personal-hub/releases/tag/v1.1.4) · [快速开始](#快速开始) · [功能与平台](#功能与平台) · [常见问题](#常见问题) · [开发指南](docs/DEVELOPMENT.md)

</div>

Personal Hub 将随手收集、日程安排、个人资料和账号密码放在同一个工作台里，支持 **Windows、Android 与 Web**。你可以先记下想法，再整理为任务，关联需要的资料，最后开始专注与复盘。

**核心功能无需云端账号，数据保存在自己的设备上；跨设备同步可按需部署。**

> 当前为 **1.1.4 预览版**，源码和安装包均已公开。更新前请导出加密备份；本版变化与验证范围见 [发布记录](docs/RELEASE-1.1.4.md)。

![桌面端「今天」：左侧模块导航、中间任务列表、右侧今日时间安排](docs/screenshots/today-1.1.4.png)

## 为什么做这个工作台

个人安排和相关资料经常散落在不同地方：想法记下了，迟迟没有安排；任务开始了，又要重新寻找文件。Personal Hub 围绕这条日常流程组织功能：

| 从哪里开始 | 在这里做什么 |
| --- | --- |
| 有一个想法 | 放进收集箱，暂时不必决定分类和日期 |
| 决定要去做 | 转为任务，补充子任务、时间与预计用时 |
| 准备开始 | 关联备忘录、文档或项目收藏，从任务进入专注 |
| 持续推进 | 用周计划、长期目标和每日精力安排下一步 |

适合希望集中管理个人待办、学习材料和常用信息的人。当前以个人使用为主，尚不提供团队协作、公开内容分享或企业权限管理。

## 下载安装

**第一次使用建议选择 Windows 安装程序或 Android 正式包。** 想与现有 Android 正式版分开试用，可选择独立测试包。

| 平台 | 下载 | 使用说明 |
| --- | --- | --- |
| Windows x64 | [下载安装程序](https://github.com/ZDB932-ai/personal-hub/releases/download/v1.1.4/Personal-Hub_1.1.4_windows-x64-setup.exe) | 需要 WebView2 运行时；包含托盘与桌面宠物 |
| Android | [下载正式 APK](https://github.com/ZDB932-ai/personal-hub/releases/download/v1.1.4/Personal-Hub_1.1.4_android.apk) | 正式签名，适合日常使用；本版本仍为预览版 |
| Android 测试版 | [下载测试 APK](https://github.com/ZDB932-ai/personal-hub/releases/download/v1.1.4/Personal-Hub_1.1.4_android-test.apk) | 可与正式版并存，数据独立 |
| Web | [下载静态文件 ZIP](https://github.com/ZDB932-ai/personal-hub/releases/download/v1.1.4/Personal-Hub_1.1.4_web.zip) | 自行托管到 HTTPS 站点根目录或 localhost |

[全部发布文件](https://github.com/ZDB932-ai/personal-hub/releases/tag/v1.1.4) · [SHA-256 校验文件](https://github.com/ZDB932-ai/personal-hub/releases/download/v1.1.4/SHA256SUMS.txt) · [更新记录](CHANGELOG.md)

Android 最低版本配置为 7.0，当前真机验证集中在 Android 16。Windows 安装程序尚无代码签名，系统可能显示未知发布者提示。macOS、Linux 和 iOS 暂无原生安装包。

<details>
<summary>更新已有安装、部署 Web 与校验下载文件</summary>

**更新安装**：先在「设置 → 备份」导出 `.phub`。Android 使用同包名、同签名的包覆盖安装，避免先卸载。正式包名为 `com.zdb.personalhub`，测试包名为 `com.zdb.personalhub.debug`；两者不会自动共享数据。

**部署 Web**：解压 ZIP，在解压目录运行以下命令（需要 Node.js），再打开终端显示的 localhost 地址：

```bash
npx serve .
```

不要直接双击 `index.html`。加密功能需要 HTTPS 或 localhost 安全上下文，当前构建按站点根目录部署。域名、协议或端口改变会使用另一份本地存储。目前没有公共在线演示站，也不应将 Web 包视为已验证的离线 PWA。

**校验下载**：在 PowerShell 中计算下载文件的 SHA-256，与发布页 `SHA256SUMS.txt` 对应条目比较：

```powershell
Get-FileHash .\Personal-Hub_1.1.4_windows-x64-setup.exe -Algorithm SHA256
```

</details>

## 快速开始

1. **创建本地账户**：设置主密码，将完整恢复密钥保存在应用之外，完成确认后进入工作台。
2. **安排第一件事**：在「今天」新建任务；例如“整理课程笔记”，再添加“阅读章节”“记录疑问”两个子任务。
3. **整理随手记录**：不确定何时处理的想法先放进「收集箱」，准备执行时再转成任务。
4. **带上所需资料**：在备忘录或资料库保存内容，再关联到任务；需要安排具体时间时打开「日历」。
5. **留一份备份**：在「设置 → 备份」导出加密文件。需要多设备使用时，按下方说明配置设备加入与同步。

桌面与网页端使用 `Ctrl / Cmd + K` 打开全局搜索与收集。手机端通过底部导航进入常用页面，设置和其他模块位于「更多」。

## 功能与平台

| 能力 | 主要功能 |
| --- | --- |
| 任务与计划 | 快捷输入、标签、优先级、子任务、重复任务、周计划、长期目标、精力与容量排期 |
| 日历与专注 | 查看时间安排、调整任务、进入专注、记录推进过程 |
| 收集与备忘录 | 随手记录、便签与清单、置顶筛选、转成任务 |
| 加密资料库 | 图片、PDF、Word、表格、文本、音视频预览；分类、搜索、批量管理；单文件上限 50 MiB |
| 密码与查找 | 密码生成、强度提示、TOTP 动态码；全局搜索、本机回收站与修改历史 |
| 备份与扩展 | 加密备份、设备加入、可选自托管同步；GitHub 项目收藏、Agent 资源库与 AI 工作台 |

三端共享核心业务界面，系统能力有所不同：

| 能力 | Windows | Android | Web |
| --- | --- | --- | --- |
| 任务、资料、密码库、加密备份 | 支持 | 支持 | 支持 |
| 可选自托管同步 | 支持 | 支持 | 支持 |
| 提醒 | 应用运行且解锁时扫描 | 系统调度，受权限和省电策略影响 | 页面运行且解锁时扫描，需通知权限 |
| 生物识别解锁 | 暂不支持 | 支持，需设备与系统能力 | 暂不支持 |
| 系统悬浮桌宠 | 支持 | 仅应用内预览 | 仅页面内预览 |
| 托盘、单实例与窗口恢复 | 支持 | 不适用 | 不适用 |

GitHub 与 AI 功能需要另外配置网络、服务和凭据；日常记录、计划与资料管理不依赖 AI。

### 手机界面

任务编辑采用底部面板，保存按钮固定在底部；设置分区保持可见，内容单独滚动。常用操作围绕窄屏与触控使用调整。

<p align="center">
  <img src="docs/screenshots/mobile-task-1.1.4.png" width="280" alt="手机任务编辑：日期、预计用时、子任务和固定底部保存按钮">
  <img src="docs/screenshots/mobile-settings-1.1.4.png" width="280" alt="手机设置：固定分区导航与主题选择">
</p>

截图来自 1.1.4 构建，使用演示账户和虚构内容。

Windows 桌宠可在「设置 → 玩偶」开启，默认关闭，支持动画、互动与走动，双击可打开主窗口。完整退出应用请使用托盘菜单。模型来源及授权边界见 [第三方声明](THIRD_PARTY_NOTICES.md)。

## 数据由你保管

业务数据和附件在本地加密保存，采用 Argon2id 与 AES-256-GCM。新账户直接使用 v3 随机数据密钥与密码封装，解锁后的密钥保留在内存，锁定后清除。项目尚未经过独立安全审计，具体边界见 [安全说明](SECURITY.md)。

有三种不同用途的恢复与迁移方式：

| 方式 | 解决什么问题 | 需要记住 |
| --- | --- | --- |
| 恢复密钥 | 在已配置恢复的设备上重设遗失的主密码 | 属于本机配置，不随普通备份、设备加入或同步转移；不能找回已删除的数据 |
| `.phub` 加密备份 | 保留可导入的数据副本 | 定期导出并另存；需要文件的对应密码，导出时确认包含需要的附件 |
| `.phub-device` 设备加入 | 将空设备加入已有保险库 | 使用文件与转移码，在新设备设置本机密码；持续同步还需另行配置 |

跨设备同步需要自行部署服务，并让设备加入**同一个保险库**。独立创建两个账户不会自动合并。服务端保存密文与同步所需元数据，不接收主密码或数据密钥。详见 [设备加入](docs/DEVICE-KEYS.md)、[同步部署](docs/SYNC-SERVER.md) 与 [同步体验](docs/SYNC-EXPERIENCE.md)。

## 常见问题

<details>
<summary>需要注册账号、购买服务器或连接 AI 才能用吗？</summary>

不需要。首次创建的是设备本地账户，不是云端账号。Windows 和 Android 的核心本地功能可离线使用；Web 需要先加载站点资源，离线重载未作为 PWA 能力交付。自托管同步、GitHub 和 AI 连接均为可选功能。

</details>

<details>
<summary>忘记主密码怎么办？</summary>

如果当前设备已启用恢复密钥，可在锁屏选择「忘记密码？」后重设。旧账户可提前在安全设置中配置恢复。未设置恢复方式且遗失密码时，无法解密数据；恢复密钥也不能替代数据备份。详见 [本地账户与恢复](docs/LOCAL-ACCOUNT.md)。

</details>

<details>
<summary>为什么换浏览器、换网址或安装测试版后，看不到原来的数据？</summary>

不同浏览器、不同站点来源，以及 Android 正式版和测试版，使用各自的本地存储。需要通过备份、设备加入或同步迁移数据。卸载应用或清除站点数据前，请先导出备份。

</details>

<details>
<summary>关掉程序后，还会提醒吗？</summary>

Android 使用系统提醒，安排最近 60 条，实际送达受系统权限与省电策略影响。Windows/Web 依赖应用运行且解锁时的扫描，退出后不扫描；通知点击跳转尚未实现。

</details>

<details>
<summary>当前还有哪些限制？</summary>

当前是预览版。尚未完成本版正式安装包覆盖升级、跨 DPI、多 Android 机型、横屏与大字体等完整验收。文本/PDF 正文搜索限当前会话，不包含 OCR 或 Office 全文索引；附件同步暂不自动清理服务端历史分块。新增远程 AI 能力暂缓。

本版已验证项目和未覆盖场景见 [1.1.4 发布记录](docs/RELEASE-1.1.4.md)，不将自动化测试通过视为所有设备都已验证。

</details>

## 本地开发

需要 **Node.js 24.x**。前端使用 Vue 3、TypeScript、Vite 与 Tailwind CSS；Windows 和 Android 分别使用 Tauri 2、Capacitor 8。

```bash
git clone https://github.com/ZDB932-ai/personal-hub.git
cd personal-hub
npm ci
npm run dev
```

打开终端显示的地址，默认是 `http://localhost:5173`。运行网页开发环境不需要安装 Rust 或 Android SDK。

测试命令、原生工具链、安装包构建、版本管理与目录说明见 [开发与构建指南](docs/DEVELOPMENT.md)。

## 文档与参与

| 想了解什么 | 从这里开始 |
| --- | --- |
| 版本变化和当前验证范围 | [更新记录](CHANGELOG.md) · [发布记录](docs/RELEASE-1.1.4.md) |
| 账户、密码恢复和设备迁移 | [本地账户](docs/LOCAL-ACCOUNT.md) · [设备加入](docs/DEVICE-KEYS.md) |
| 部署同步与传输附件 | [同步服务](docs/SYNC-SERVER.md) · [同步体验](docs/SYNC-EXPERIENCE.md) · [附件同步](docs/ATTACHMENT-SYNC.md) |
| 开发、设计与贡献 | [开发指南](docs/DEVELOPMENT.md) · [设计系统](design-system/MASTER.md) · [贡献说明](CONTRIBUTING.md) |
| 平台体验的实现与验证 | [桌面/Web](docs/DESKTOP-WEB-REVIEW.md) · [Android](docs/ANDROID-POLISH.md) |

欢迎通过 [Issues](https://github.com/ZDB932-ai/personal-hub/issues) 报告问题或提出建议，也欢迎按 [贡献约定](CONTRIBUTING.md) 提交改进。反馈请附平台、版本、复现步骤和脱敏截图。涉及安全问题先阅读 [安全说明](SECURITY.md)，不要在公开反馈中上传主密码、恢复密钥、访问令牌或私人资料。

## 许可证

项目自有代码与文档采用 [MIT License](LICENSE)。第三方依赖、模型与角色素材的权利不由该许可授予，具体来源、许可边界和待确认事项见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
