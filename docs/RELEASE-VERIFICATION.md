# 发布包验证 · 2026-09-20

本次完成包构建与静态检查，未安装覆盖手机正式版，也未运行 Windows 安装器。不能把以下结果当作安装升级验收。

下方首节保留旧候选包的历史核验；最新 1.1.0 构建与覆盖更新结果见文末。

## Android

- `assembleRelease` 成功，`apksigner verify --verbose --print-certs` 通过 APK v2 签名校验。
- 包名 `com.zdb.personalhub`，minSdk 24、targetSdk 36，未设置 debuggable；Debug 包继续使用独立 `.debug` 后缀。
- 新包与保留的 2026-08-27 旧正式包签名证书 SHA-256 相同：`4f318ada0e55d55297d2cd16b89c69818f47e5175b9edf54da62d9b1eb058e22`。具备同签名更新的必要条件，尚未验证覆盖安装与真实数据迁移。
- 候选 APK SHA-256：`3C9952AB371C5F72C0FA1DD9A281D413297D6482CF7F30D22909E50A20A02713`。
- 旧正式包为 versionCode 1 / versionName 1.0，当前候选包为 1 / 0.1.0。发布前必须递增 versionCode 并确定一致的公开版本名称；当前产物仅用于验证，不应直接作为新版发布。
- Capacitor 配置已关闭桥接日志，避免文件分块参数进入调试日志。

## Windows

release exe 和 NSIS 已构建。`Get-AuthenticodeSignature` 检查安装包状态为 `NotSigned`；尚未配置发布者数字签名。安装器执行、卸载、覆盖升级与数据保留未验收。

## 验证记录

原生文件保存见 `NATIVE-FILE-SAVE.md`，三端同步见 `VERIFICATION-2026-09-20.md`。旧 APK 保存在 Git 忽略的 `.visual-qa/release-verification-20260920/previous-release.apk`，没有输出或复制签名私钥及密码。


## 1.1.0 版本配置与 Windows 新包

package.json 的 version/androidVersionCode 为版本来源，npm run version:sync 同步 Android、Tauri、Cargo 和 npm 锁文件；npm run build 自动检查配置一致性。关于页直接读取该版本。当前为 1.1.0 / Android 2，之前的 0.1.0 APK 信息仅为历史记录。

Windows 1.1.0 exe 和 NSIS 构建成功，安装包 SHA-256：890DF50A5063B0A87886EB22FFE893454390D10C01EC9A3C51168DBB5EA52F16。签名状态仍为 NotSigned。


## Android 1.1.0 构建与测试版覆盖更新

assembleDebug 与 assembleRelease 均成功。正式 APK 为 com.zdb.personalhub，versionCode 2 / versionName 1.1.0，apksigner v2 校验通过，证书 SHA-256 与历史正式包相同。APK SHA-256：D17A3770A34CC5653530867CD80AE15427B79179E45273B10246C9D0BFBED9E9。

手机独立 Debug 包通过 adb install -r 从 versionCode 1 / 0.1.0-debug 更新到 2 / 1.1.0-debug，未清除应用数据。验证记录 .visual-qa/android-upgrade-1789877657900/report.json：原主密码解锁、个人资料保留、关于页 1.1.0，8 个既有 10 MiB 附件逐个解密下载，SHA-256 一致，页面异常为零。附件在原生保存接口截取校验。此项不代表正式包覆盖安装或 Windows 安装器升级验收。

## Windows NSIS 覆盖升级验收

检测 HKCU/HKLM 未有 Personal Hub 安装记录后，在 .visual-qa/windows-installer-upgrade 独立目录以 /S /NS 安装旧 0.1.0 包，再覆盖安装 1.1.0，两次退出码均为 0，注册表 DisplayVersion 从 0.1.0 更新到 1.1.0。两次均运行实际安装目录中的 exe，并使用同一隔离 QA WebView2 配置目录：原主密码、资料和 8 个 10 MiB 附件全部保留，逐个 SHA-256 一致。

报告 .visual-qa/windows-upgrade-1.0.json（旧包关于页历史显示 1.0）、.visual-qa/windows-upgrade-1.1.0.json；复现脚本 scripts/verify-windows-upgrade.mjs。没有采用用户真实保险库，也未进行删除应用数据测试。此结果覆盖安装器静默升级路径，不代表所有交互式安装选项。

验收后核对注册表指向上述测试目录且没有运行中的程序，再调用该目录的卸载器 /S。退出码 0，卸载注册表记录已移除，独立 QA WebView2 数据目录仍保留。未选择删除应用数据。

## 确认对话框修复后的产物边界

本轮新增 confirmAction，统一等待用户确认，详见 NATIVE-FILE-SAVE.md。先前 APK 及 SHA-256 为修复前历史产物，尚未重新打包 Android；Windows 修复后重建中的产物不能用旧哈希标识。正式发布前需重新核对最终包。

Windows 完整确认逻辑修复后 npm run desktop:build 已通过，最终 NSIS SHA-256：FB7976355831021090B48AFA8EC5794277E8F7EFF973A30CDC089160A0CC1073。构建包含 confirmAction 与 dialog:allow-message；原生交互复测记录待补充。Android APK 尚不含这轮代码更新。
