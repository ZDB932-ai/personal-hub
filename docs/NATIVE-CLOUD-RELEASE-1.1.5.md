# 1.1.5 原生云同步交付

日期：2026-10-22。服务器：https://111.91.19.235 。

## 变更

版本源 package.json 更新为 1.1.5 / Android 7，通过 versions.mjs 同步 Tauri、Cargo、Android 和 npm 锁文件。

同步设置默认地址改为已部署服务器，新增连接文件导入并连接入口。文件验证用途、版本、URL、令牌长度及字符集，限制为 4096 字节；文件读取后核对当前界面/解锁会话，避免关闭或锁定后的异步结果发起连接。连接凭据仍通过现有会话逻辑加密持久化。

私有连接文件仅生成在 Git 忽略的 `.sync-data/cloud-111.91.19.235/Personal-Hub-private-sync.json`，没有复制到 release 或服务器下载目录。源代码和安装包只内置公开服务器地址。

## 构建与验证

- Node 24.19.0；生产构建通过，新增连接文件和既有同步会话测试共 11 项通过。
- Android 经 Capacitor 同步后以 Gradle 8.14.3 构建 Release/Debug；使用 JDK 24 启动、PHUB_JDK21_HOME 提供 JDK 21 工具链。
- 正式包 com.zdb.personalhub，versionName 1.1.5，versionCode 7，minSdk 24、targetSdk 36。APK v2 签名验证通过，证书 SHA-256 与 1.1.4 一致：4f318ada0e55d55297d2cd16b89c69818f47e5175b9edf54da62d9b1eb058e22。
- APK 内前端资源与本次 dist 逐文件匹配，新同步入口和服务器地址存在；dist、Android 资源及正式 APK 未发现当前服务器令牌。
- Windows Rust stable 工具链路径显式置于 PATH 首位，解决 Tauri 调用 rustup Cargo 代理时的拒绝访问错误。NSIS 构建成功，安装器 Authenticode 状态 NotSigned。
- 使用新 Windows exe、独立 WebView2 数据目录与合成账户实测，实际 Origin 为 http://tauri.localhost。预设服务器、导入私有连接文件、任务经公网上传、刷新重新登录后自动恢复均通过，无页面异常。报告 `.visual-qa/windows-cloud-1792656757623/report.json`，脚本 `scripts/verify-windows-cloud.mjs`。未使用跳过 HTTPS 校验；测试进程显式直连，未修改系统代理。
- 不运行旧安装器覆盖用户环境；没有连接 Android 真机，因此不声称本轮原生 Android 网络或覆盖升级已验收。

## 交付

本机安装包及哈希位于 `release/1.1.5/`。服务器仅公开正式 APK、Windows NSIS 和对应校验值，目录 `/opt/personal-hub/client-downloads/1.1.5/`，HTTPS 路径 `/downloads/1.1.5/`。下载路由不启用目录浏览，未上传私有连接文件。

服务器业务服务和网页版本保持 1.1.4；API 协议与新原生客户端兼容。Caddy 仅新增下载路由，未修改同步数据或访问令牌。
