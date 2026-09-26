# 备份恢复与暂停同步验收

本轮仅使用合成 QA 数据和独立浏览器、Windows 配置目录、Android Debug 应用。

## 改动

- 同步页新增暂停/恢复，配置仍加密保存在本机，暂停时等待在途任务结束，锁定解锁不会解除当前窗口的手动暂停，刷新或进程重启则恢复自动连接。
- 大设备加入文件生成前可暂停同步，无需删除配置再重新输入令牌。
- 含附件备份按实际导出的加密信封读取文件清单，避免使用可能已变化的当前页面列表。本机缺失附件时明确拒绝完整备份，不再静默跳过。用户仍可主动选择仅数据备份。
- 备份密码错误或文件无法解密时显示明确的中文提示，恢复失败保留目标数据；设置页说明新设备可采用不同主密码。

## 已通过

- `npm run test -- --maxWorkers=2`：18 个文件、140 项测试通过。包含暂停等待在途任务、锁定后保持暂停、恢复复用配置，以及错误密码和缺失附件保护。
- 生产 Web 备份导出与恢复：`.visual-qa/backup-1789872930240/report.json`。v3 备份包含文件密文，错误密码被拒绝；使用不同目标主密码恢复，刷新后仍能解锁，下载附件逐字节一致。
- 生产 Web 双设备同步：`.visual-qa/sync-1789872687654/report.json`。暂停期间修改只保留在本机，恢复后无需输入令牌即可补传；既有断线恢复、冲突与重启回归通过。

复现脚本：`scripts/verify-backup-ui.mjs`、`scripts/verify-sync-ui.mjs`。运行前启动 `npm run preview -- --host 127.0.0.1 --port 4183 --strictPort`，必要时通过 `PHUB_PLAYWRIGHT_MODULE` 指向机器已安装的 Playwright。脚本生成的加密文件与校验产物保留在 Git 忽略的 `.visual-qa` 下。

## 验证边界

Web 实际下载通过浏览器下载事件获取文件。原生备份内容验证使用 `capture-native-download.mjs` 截取发送给保存接口的内容，因此不能替代 `.phub` 和 `.phub-device` 系统文件选择器的专项验证。先前 Android/Windows 系统保存专项实际覆盖的是 10 MiB 二进制附件。公网 HTTPS 与 Android 正式包覆盖升级仍待验收。Windows NSIS 隔离目录覆盖升级已通过，见 RELEASE-VERIFICATION.md；50 MiB 真机传输上限已通过，见 LARGE-FILE-VERIFICATION.md。

## 原生端回归结果

三端回归记录：.visual-qa/native-1789873243602/report.json，12 项通过、页面异常为零。Android 和 Windows 分别暂停同步后导出完整备份，独立 Web 使用不同主密码恢复、重启解锁，每份备份 8 个附件（各 10 MiB）逐个 SHA-256 一致。恢复同步无需再次输入令牌。原生备份在保存接口截取内容，未重复执行系统文件选择器专项。

