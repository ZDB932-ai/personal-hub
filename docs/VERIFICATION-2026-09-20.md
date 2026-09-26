# 同步验证记录 · 2026-09-20

更新：手机连接并完成安装授权后，Android 16 真机、Windows 新构建程序、Edge 已完成核心同步联调。手机使用 USB 端口转发，尚非局域网或公网 HTTPS 验收。下文为最终结果。

## 已通过

- `npm run build`：前端生产构建通过。
- `npm run sync:typecheck`：服务端类型检查通过。
- `npm run test -- --maxWorkers=2`：18 个测试文件、140 项测试通过，包括原生保存边界、附件校验、真实 HTTP 和 SQLite 集成。默认并行执行出现过 5 秒超时，限制并行数后通过。
- `npx cap sync android`：构建资源和原生插件同步成功。此项不是 APK 构建或真机测试。
- Edge 生产构建双设备端到端验证：使用两套独立 BrowserContext 和临时 SQLite，直接操作编译后的界面，没有在页面中导入开发模块或写入业务状态。
- `assembleDebug`：Android APK 构建成功并安装到 Android 16 手机。使用独立包名 `com.zdb.personalhub.debug`，名称「Personal Hub 测试版」。
- `npm run desktop:build`：Windows release exe 与 NSIS 安装包构建成功。实际运行本次 exe，并使用独立 WebView2 数据目录验收，未安装 NSIS 包。
- 三端使用同一测试保险库、三个不同主密码：手机修改同步至 Windows/Web，Windows 修改同步至手机/Web，数据一致；服务重启后的补传成功。
- 初次三端测试验证了进程重启后数据保留；第六阶段起，连接凭据改为使用数据密钥加密持久化，最新回归结果见下方附件专项。

端到端检查包含：

1. A 创建设备并升级，下载设备加入文件；B 上传文件并使用不同的本机主密码加入。
2. 两边连接同一实际 HTTP 服务，A 在界面修改资料后自动推送，B 拉取并显示相同内容。
3. 停止服务，A 修改后显示重试；同一 SQLite 服务重启后自动恢复，B 收到更新。
4. 两边离线修改同一记录，恢复网络后出现冲突，双方内容得到保留，默认不显示敏感内容；选择远端版本后数据一致。
5. 初次测试 B 刷新并重新解锁，数据和游标保持，再次输入令牌连接成功。第六阶段浏览器回归已验证解锁自动连接，以及主动移除配置后不再自动连接。

浏览器没有页面运行时异常。测试仅使用新建的隔离浏览器存储和合成数据，未读取或修改用户已有保险库。

## 未通过或未执行

| 项目 | 结果与原因 |
| --- | --- |
| 跨设备 HTTPS | 本次手机通过 USB 转发访问回环 HTTP，尚未验证局域网或公网 HTTPS |
| 正式安装发布流程 | Windows NSIS 已生成但未安装；手机验证的是独立 Debug APK，不是正式签名发布包 |
| 原生功能与边界 | 不覆盖指纹、通知、后台长时间调度、50 MiB 上限性能及完整安装升级流程；附件专项见下方 |

此前 Cargo/rustc/Java 的执行拒绝，在用户于普通 PowerShell 验证工具后重试已恢复；未修改安全软件、ACL、系统安全策略或执行权限。安卓首次安装被用户关闭，按用户指示重试并安装成功。Android 页面截图超时影响首轮脚本，后续取消对手机截图的依赖，沿用保存的冲突状态完成验收。ADB 清空测试数据被系统拒绝，未绕过权限，后续沿用同一测试保险库。

## 复现

脚本：`scripts/verify-sync-ui.mjs`。需要 Node.js 24、已安装的 Edge 和 Playwright 模块。

先运行 `npm run build`，另一个终端运行：

```powershell
npm run preview -- --host 127.0.0.1 --port 4183 --strictPort
```

随后运行 `node scripts/verify-sync-ui.mjs`。若 Playwright 未在项目依赖中，可用 `PHUB_PLAYWRIGHT_MODULE` 指向已安装的 Playwright 模块目录；本次使用机器已有的 npm 缓存模块，没有添加项目依赖。`PHUB_VERIFY_URL` 可调整预览地址。

脚本自行启动、停止和重启临时同步服务，结束后关闭测试浏览器。记录保存在 Git 忽略的 `.visual-qa/sync-<时间戳>/`，包含报告、截图及合成测试数据；不包含访问令牌或设备转移码。

本次通过记录：`.visual-qa/sync-1789865204046/report.json`。第一次脚本未等待防抖保存完成即断言，修正等待真实上传回执后完整重跑通过，此问题属于验收脚本时序。

真机首轮记录：`.visual-qa/sync-1789866478265/report.json`，前三项通过，随后截图超时。续测记录：`.visual-qa/native-1789866750985/report.json`，7 项通过，页面异常为零；Windows 截图在同目录 `windows-connected.png`。

`scripts/verify-sync-ui.mjs` 可通过 `PHUB_ANDROID_SERIAL` 使用已安装的空 Debug 应用代替第二个浏览器。`scripts/verify-native-sync.mjs` 则继续已有 QA 手机保险库：设置相同 `PHUB_ANDROID_SERIAL`，将 `PHUB_VERIFY_RESUME` 指向该 QA SQLite 目录。它专用于本项目合成测试数据，使用脚本中的测试密码，不适用于用户保险库。手机生成的设备文件由测试桩截获 Blob 用于后续导入，此步骤不代表安卓系统文件分享/下载流程已经验收。

所有测试服务、浏览器及 USB 转发已关闭；手机独立测试应用保留合成数据并已停止运行。Windows 测试数据位于 Git 忽略的 `.visual-qa/native-<时间戳>/webview-profile`。

产物 SHA-256：

| 产物 | SHA-256 |
| --- | --- |
| Android Debug APK | 3AB4A5A25208DA549A530B0FA83BD5561A6C7E6A7E8D090BC37C35058E65738E |
| Windows release exe | C42FEEE1DE06B46070825F336C62F6A515D4B3EE4B4F3E0756C3281B23E9EAA6 |
| Windows NSIS | E5826E73749F72566963620A4C0FEC32B2D356148DA505707B4618B293EB4578 |

## 第七阶段附件与自动重连专项

第七阶段记录：`.visual-qa/native-1789869163049/report.json`，10 项通过，页面运行时异常为零。使用当时构建的 Android Debug APK、Windows release exe 与 Edge，三个设备分别使用不同主密码。新增原生保存后的最新回归见下节。

- Android 上传新 10 MiB 文件，Windows/Web 解密后大小和 SHA-256 一致，全流程 10 秒。
- Windows 上传另一新 10 MiB 文件，Android/Web 解密后大小和 SHA-256 一致，全流程 12 秒。
- 双向资料修改、服务中断后的自动补传通过。
- Windows exe、Android 进程完整重启后，解锁即自动恢复加密保存的连接，附件再次解密校验通过。

耗时包含界面操作、同步和校验，不能作为网络吞吐量。附件内容通过应用下载按钮生成的 Blob 校验，系统保存/分享界面尚未验收。首轮 Windows 测试桩使用 `fetch(blob:)` 失败，改为直接读取 Blob 后通过，产品 CSP 未放宽。手机仍通过 USB 转发访问回环 HTTP；未验证公网、50 MiB 上限或峰值内存。

## 原生保存专项

附件、备份与设备加入文件已统一接入原生系统保存接口，Android 插件分块写入，Windows 使用官方 dialog/fs 插件。取消不会报告导出成功。Android 16 系统文件选择器实际保存 10 MiB 文件后取回校验通过，取消选择也通过，记录 `.visual-qa/android-save-1789870169292/report.json`。Windows 系统保存窗口实际落盘仍未验收。实现、复现方式及限制见 `docs/NATIVE-FILE-SAVE.md`。

最新完整三端回归记录：`.visual-qa/native-1789871086479/report.json`，10 项通过，页面异常为零。Android、Windows 分别上传新 10 MiB 附件至另两端，解密后大小和 SHA-256 一致，全流程分别 13 秒、17 秒。双向记录修改、SQLite 服务重启补传、Android/Windows 应用进程重启后自动连接及附件解密均通过。保存接口使用测试替身，不代表 Windows 系统落盘已验收。

本轮修正验收脚本的启动等待、超过 50 MB 的设备文件选择，以及只读 Tauri 调用入口无法替换的问题。大设备文件在同步期间生成会因版本变化而被拒绝；本次通过界面断开同步后导出，再重新连接完成验收，未跳过产品一致性检查。该使用限制见 `DEVICE-KEYS.md`。

## 文案修正

安全设置原先仍显示“逐条同步尚未接入”和“之后的修改不会自动同步”。现已说明需要在各设备连接同一服务，避免误导；修正后生产构建通过。

## Windows 实际保存与发布包检查

Windows 系统保存窗口实际保存的 10 MiB 附件，磁盘内容 SHA-256 与源文件一致。续测取消窗口，原生回执为 null，未调用写入且页面异常为零，报告 `.visual-qa/windows-save-1789872015179/report.json`。首次保存由用户操作，续测复核其已保存文件；此专项未替换原生保存接口。测试程序已退出。

Android Release 构建和签名校验通过，签名证书与旧正式包一致，但 versionCode 尚未递增，版本名存在历史不一致。Windows NSIS 尚未数字签名。未覆盖安装正式版，详情见 `RELEASE-VERIFICATION.md`。

下一步是可信 HTTPS 的局域网或公网部署验收，以及统一发布版本、备份与设备文件原生导出专项、正式安装升级流程。


## 备份与暂停同步补充

最新回归 .visual-qa/native-1789873243602/report.json 共 12 项通过、页面异常为零，含 Android/Windows 分别导出并在独立 Web 换用不同主密码恢复，各 8 个 10 MiB 附件逐个哈希一致。详见 BACKUP-VERIFICATION.md。版本配置已统一到 1.1.0 / Android versionCode 2，构建时自动检查。

Android 1.1.0 测试版覆盖更新与 8 个既有附件校验通过：.visual-qa/android-upgrade-1789877657900/report.json。正式 APK 同签名检查和 Windows 1.1.0 安装包构建通过，详见 RELEASE-VERIFICATION.md。

## 50 MiB 与 Windows 安装升级

三端 50 MiB 回归 .visual-qa/native-1789878220200/report.json，13 项通过、页面异常为零，包含手机上传中断恢复、双向大文件、重启、超限拒绝及删除传播。详见 LARGE-FILE-VERIFICATION.md。Windows NSIS 从旧包升级到 1.1.0，密码、资料与 8 个附件保留，详见 RELEASE-VERIFICATION.md。

## 原生落盘与服务端恢复补充

Android 50 MiB 系统保存及取消专项通过；Windows 50 MiB 实际磁盘文件大小与哈希一致，取消回执尚未确认。详见 LARGE-FILE-VERIFICATION.md。服务端停机复制完整目录到新目录后的恢复演练通过，包含身份、鉴权、记录、附件、游标与幂等回执：.visual-qa/server-restore-1789878675786/report.json。

Windows 弹窗专项最终通过：.visual-qa/windows-save-1789888331110/report.json。旧 QA 附件本体缺失导致未触发保存框，新建完整测试附件后真实保存取消和删除取消均通过，附件保留、无页面异常。新增窗口恢复防护，详见 NATIVE-FILE-SAVE.md。
