# 手机公网同步验收 · 2026-10-22

## 最新结果

正式账号双端验收：Windows 1.1.8 已安装至用户目录 PersonalHub 并登录用户云账号；电脑创建唯一标记测试任务，用户确认手机收到并勾选完成。电脑未手动刷新或点击同步，原生 WebView 中对应任务的 `aria-pressed=true`，按钮变为“取消完成”，标题带完成样式，证实手机完成状态自动回到电脑。随后仅删除本次创建的测试任务，等待本机待上传记录归零，回到首页。没有修改其他业务数据。

安装收尾已完成：用户完成系统安装确认后，ADB 实测正式包 `com.zdb.personalhub` 的 versionName=1.1.8、versionCode=10。已启动正式应用，并通过原生界面点击“首次使用，创建云账号”，确认显示“创建云账号 / 确认密码 / 注册并开始同步”。保留空白注册表单供用户自行填写，未创建或读取用户账号密码。下方安装阻塞内容为历史过程。

USB 恢复后，独立 Android 原生应用 1.1.8 真机公网自动同步验收通过，报告 `.visual-qa/phone-cloud-1792673991924/report.json`：手机到网页 4886ms，网页到手机 2708ms（含 UI 操作及观测时间），全程未点击手动同步；真实手机 WebView 模拟断网编辑后自动补传；切到后台再恢复前台自动接收变更。手机实际使用公网 HTTPS，无 USB 端口转发。此结果不覆盖系统杀进程后的后台持续同步，也不等于正式账号验收。

Windows 程序退出后重建成功，1.1.8 原生公网同步通过，报告 `.visual-qa/windows-account-1792673852459/report.json`。安装包已上传到 `/downloads/1.1.8/Personal-Hub_1.1.8_windows-x64-setup.exe`，SHA256 为 5420bce49193739353ee9c44509c1cfa6ec602be8319d2b7d6f12d2ef14778b5。Android 签名证书与既有正式包一致。正式版手机安装仍在处理系统安装确认，尚未创建用户账号。

## 过程记录

最终安装收尾时 ADB 再次离线；正式安装客户端退出，设备安装结果无法读取确认，不能宣称正式 APK 已安装。已验证的原生同步结果来自独立 syncqa.debug 包。用户可在手机浏览器从公开下载链接安装正式 APK；正式账号仍由用户自行创建，不索取密码。

目标：使用真实 Android 手机与 https://111.91.19.235 同账号自动同步，验证双向变更、离线补传及前后台切换。邮箱验证码找回暂缓。

版本 1.1.8 / Android versionCode 10，前台拉取间隔 3–4 秒；不是后台常驻推送。

已完成生产构建、52 个测试文件共 310 项测试。服务器更新前备份 `/opt/personal-hub/backups/phub-20261022T124300Z.tar.gz`；运行目录 `/opt/personal-hub/releases/1.1.8-20261022`，服务及 Caddy 均 active。

真实公网浏览器回归通过：同账号恢复数据、双向记录同步、跨块附件逐字节一致、离线冲突处理及刷新后重连。报告 `.visual-qa/cloud-account-1792673129129/report.json`。此报告不是手机真机证据。

手机最初识别为 PLB110，ADB 授权正常；已有独立 1.1.1 debug 和 1.1.4 mobileqa 包，无正式包。正式包安装过程中 USB 调试连接断开；重启 ADB 后显示无序列号 offline。未清除旧包数据。

独立验收包 com.zdb.personalhub.syncqa.debug 已生成；`scripts/verify-phone-cloud-live.mjs` 仅对该包执行合成数据验收，不点击手动同步按钮。最终安装与真机验收等待 USB 调试连接恢复，目前尚未通过。

用户重新连接后曾再次识别相同序列号，但随后的安装命令又报告 device not found，连接仍不稳定。正式 APK SHA256：412dc1fe2b61d7d9344c07682dfc29d16822ec5b4b691bc8d2faf6e905c2ea3e；已上传并核对服务器副本，可从 `/downloads/1.1.8/Personal-Hub_1.1.8_android.apk` 下载。尚未确认安装成功。

Windows 原生编译完成链接，但打包因正在运行的 `src-tauri/target/release/personal-hub-desktop.exe` 被占用而失败（Access denied）。没有强制终止用户程序；待用户完全退出后重跑 `npm run desktop:build`，不能将现有 1.1.7 安装包称作 1.1.8。
