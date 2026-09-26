# 原生文件保存

附件下载、加密备份和设备加入文件统一通过 `src/lib/saveFile.ts` 导出。原先三个入口只触发网页 Blob 下载，无法证明 Android 系统文件保存成功。

Android 使用项目内 `DocumentSaverPlugin` 调用系统 `ACTION_CREATE_DOCUMENT`。用户选定文件后，前端按 512 KiB 分块传给原生输出流；插件校验会话、偏移和完整大小，关闭输出流后才报告成功。不申请全盘存储权限，不在应用缓存中另存明文副本。`capacitor.config.ts` 设置 `loggingBehavior: 'none'`，避免框架调试日志记录含文件内容的桥接参数。实现依据 [Android Storage Access Framework](https://developer.android.com/training/data-storage/shared/documents-files) 和 [Capacitor 插件活动回调](https://capacitorjs.com/docs/plugins/android)。

Windows 使用 Tauri 官方 dialog/fs 插件，保存对话框授权所选文件，能力仅增加 `dialog:allow-save` 和 `fs:allow-write-file`，没有配置全盘路径通配符。Web 保持浏览器下载行为；网页触发下载不代表用户最终保存成功。

取消选择不会写入，也不会显示导出成功或设备转移码。同一窗口不允许同时发起多个保存。附件及设备加入文件在选定目标后重新检查解锁状态；Android 在每个分块前检查。已经提交的原生写入不能撤回。备份内容本身为密文，不因锁定中止其导出。

Android 可处理的失败或锁定会关闭输出流并尝试删除不完整文件，清理失败会明确提示。进程被系统强杀或断电时不保证清理；Windows 写入失败也可能留下部分文件，文件系统保存不等于事务替换已有文件。仍需保留原备份。文件解密和备份序列化目前在内存中进行，分块桥接不代表恒定内存占用。

## 验证

- 18 个测试文件、137 项通过，命令 `npm run test -- --maxWorkers=2`。覆盖分块内容、取消、写失败、锁定、清理失败和 Windows 选择路径；插件替身单测不代表操作系统文件选择器验收。
- 默认并行测试两次出现 5 秒超时；限制同时运行的 worker 数后通过，未放宽断言或超时。新增大数组断言改为对完整拼接字节计算 SHA-256。
- 生产 Web 实际下载回归通过：`.visual-qa/sync-1789869945298/report.json`。
- Android 16 真机，更新独立 Debug APK 后，通过系统文件选择器保存 10 MiB 合成附件到 Download；ADB 取回文件，大小和 SHA-256 与源文件一致。再次选择取消，确认没有调用分块写入。记录：`.visual-qa/android-save-1789870169292/report.json`。
- Windows release exe 与 NSIS 已重新构建。用户在真实系统保存窗口保存了 `phone-1789871086479.bin`；磁盘文件为 10485760 字节，SHA-256 为 `44f9296993796e201208c6c245b9515d36b62c87d0be4459ff347bfa054cd527`，与合成源文件一致。初次脚本因保存路径不同于预设而提前退出，此项路径断言已移除。续测复核已有文件，并收到系统取消回执，未调用写入，页面异常为零：`.visual-qa/windows-save-1789872015179/report.json`。本次只观察并原样转发 IPC 响应，没有替换系统保存接口。备份、设备文件共用保存接口，但本轮系统落盘专项仅覆盖附件。
- 新版本三端完整回归：`.visual-qa/native-1789871086479/report.json`，10 项通过、页面异常为零。Android 与 Windows 各上传 10 MiB 附件，另两端解密内容 SHA-256 一致；双向记录同步、服务断线补传、两端进程重启后的自动连接和附件解密均通过。两次附件操作全流程分别 13 秒、17 秒，不是吞吐量测量。Android 使用 USB 回环端口转发，尚未验证公网 HTTPS。

`scripts/verify-android-save.mjs` 使用已存在的 QA 手机保险库，不清空测试应用。运行前设置 `PHUB_PLAYWRIGHT_MODULE` 和 `PHUB_ANDROID_SERIAL`，在脚本提示后选择 Download 保存，第二次取消；文件名来自此前三端测试生成的 `desktop-<时间戳>.bin`。再次运行应避免与已有测试输出重名，或明确核对系统自动编号后的实际路径。

三端同步脚本 `verify-native-sync.mjs` 通过 `capture-native-download.mjs` 截取发送给原生保存接口的字节，继续校验跨端解密内容；不会打开系统保存窗口。此类截取不能代替上述 Android 实际落盘专项，也不能证明 Windows 系统对话框行为。

Windows 测试通过本机 CDP 选择磁盘上的设备文件，避免 Playwright 远程传输文件的 50 MB 限制。Tauri 的 `invoke` 属性不可写，测试改在 `fetch` 层拦截两个保存相关 IPC 请求，其余请求原样转发；未改变产品权限、CSP 或原生接口。设备文件生成前通过界面暂停同步，生成后恢复，无需移除配置或重新输入令牌，避免生成期间同步修改存储版本。


Android 50 MiB 系统保存与取消已通过，实际落盘后经 ADB 取回并核对大小及 SHA-256：.visual-qa/android-save-1789878715623/report.json。详见 LARGE-FILE-VERIFICATION.md。

## Windows 确认框修复

50 MiB 保存取消回执已收到，未调用文件写入；续测清理合成附件时暴露 dialog confirm ACL 错误，因此 .visual-qa/windows-save-1789879347102/report.json 的总状态仍为失败，不能称页面零异常。检查本机 tauri-plugin-dialog 2.7.3 源码发现，其初始化脚本将 window.confirm 改为异步并调用已不在处理器中的 confirm 命令。原同步调用不能正确等待选择。

新增 confirmAction：Windows 通过官方 JS confirm API 调用 message 命令，显式等待布尔结果；Web/Android 等待原有确认框。删除、重置、备份覆盖和同步确认入口统一迁移，异常时返回 false 并提示。权限只增 dialog:allow-message，不扩大文件权限。141 项测试与前端构建通过，Web 备份恢复回归 .visual-qa/backup-1789879719264/report.json 通过。原生修复后交互待验证。

完整修复后的 Windows exe/NSIS 构建成功。原生复测在等待系统保存回执时用户两次未发现窗口，按用户回复停止该测试进程；未将此项记为通过。新增保存检查点保存了已有 50 MiB 文件大小及 SHA-256 通过结果，原生删除确认取消后的附件保留仍待可见窗口验收。

## 主窗口可见性修复

系统保存与确认框绑定调用方主窗口；原流程未在弹窗前恢复隐藏或最小化窗口，已有 revealDesktopWindow 会吞掉错误。本轮新增 prepareDesktopDialog，在系统弹窗前依次显示、取消最小化、聚焦并检查可见状态；失败则停止操作并提示。main 窗口能力增加 show/unminimize/set-focus，文件访问范围不变。测试脚本记录弹窗调用前的窗口状态。此项解决代码中的可见性缺口，是否消除现场不可见现象仍需真机交互确认，不能仅凭代码认定根因。

142 项全量测试通过；随后补充窗口恢复失败不打开选择器也不写入的用例，相关 3 文件 10 项通过。前端生产构建通过。

现场不可见的直接原因已定位：旧 QA 附件 qa-windows-save-50-1789878781111.bin 的元数据仍在，但对应本地文件本体缺失。下载入口提示『文件数据在本设备不存在，请在源设备同步附件』，未发出保存请求。此前脚本未捕获短暂 toast，错误地等待原生弹窗。新建完整合成附件后已观测到真实保存 IPC 请求，等待人工取消复测。主窗口可见性修复属于额外防护，不应将其表述为已证实的本次根因。

最终复测通过：.visual-qa/windows-save-1789888331110/report.json。用户看到保存窗口与删除确认框并分别取消；保存返回 null 且没有写入，删除确认返回『取消』，新测试附件仍保留，页面异常为零。此前磁盘 50 MiB 文件仅作为已保存文件复核，本轮未再次保存。脚本已增加错误 toast 捕获，下载前置失败不再误报为等待弹窗。
