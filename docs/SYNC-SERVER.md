# 本机逐条同步服务 · 第五阶段

后续更新：第六阶段支持加密保存连接与自动重连；第七阶段支持附件密文分块传输，详见 [ATTACHMENT-SYNC.md](./ATTACHMENT-SYNC.md)。下文第五阶段“附件不在范围”的说明已被第七阶段取代，旧 PocketBase 模式仍不支持附件传输。

已实现实际 HTTP 传输、SQLite 持久化、令牌认证和保险库归属校验。无需购买云服务器。服务端保存密文、必要元数据、幂等回执和完整变更历史，不接收主密码或数据密钥。当前是个人使用的本机服务，不是已部署的公网服务。

## 启动与连接

需要 Node.js 24，使用内置 `node:sqlite`，无需额外安装数据库。

在项目根目录打开终端：

```powershell
npm run sync:server
```

默认只监听 `http://127.0.0.1:8787`。首次运行创建 `.sync-data/access.local.json` 和 `.sync-data/sync.sqlite`；终端只显示文件路径，不打印令牌。访问文件包含 `account` 和随机 `token`，仅用于本机管理，不要上传或发送给无关人员。默认目录已被 Git 忽略。更换令牌后重启服务会使旧令牌失效。

另一个终端运行 `npm run dev`。在应用中：

1. 「设置 → 安全」启用设备独立密码（v3）。
2. 「设置 → 同步 → 逐条加密同步」填写服务地址和访问文件中的 token。
3. 点击「连接并同步记录」。成功后本机会自动推送修改，网络恢复或回到前台时拉取；也可点击「立即同步记录」。当前无定时轮询。
4. 另一设备必须先通过 `.phub-device` 加入同一保险库，再连接同一服务、同一账号。独立创建的保险库不会自动合并。

第六阶段：访问令牌和连接配置加密保存在本机，解锁后自动重连。锁定或保险库维护操作会暂停同步；“断开并移除配置”删除本机保存的凭据。服务端数据、客户端待发送队列和同步游标仍会保存，断开不会删除服务器数据。详见 [SYNC-EXPERIENCE.md](./SYNC-EXPERIENCE.md)。

## 其他设备与 HTTPS

`127.0.0.1` 指向各设备自己；手机不能通过该地址连接电脑。客户端仅允许回环地址使用 HTTP，其他地址必须使用 HTTPS。手机及其他电脑联调需配置可信 HTTPS 反向代理和对应来源，不能仅把回环地址替换为局域网 IP。此阶段未修改防火墙或开放公网端口。

开发验收可通过已授权的 USB 调试使用 `adb reverse` 将测试服务端口映射到手机回环地址，无需开放网络端口。`scripts/verify-sync-ui.mjs` 设置 `PHUB_ANDROID_SERIAL` 后可用独立 Debug 包运行 Edge 与 Android WebView 联调；脚本结束移除其端口映射。这验证真实 APK 与设备存储，但不替代局域网 HTTPS 或公网链路验收。

可用环境变量：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| PHUB_SYNC_DIR | .sync-data | 服务数据与访问文件目录 |
| PHUB_SYNC_HOST | 127.0.0.1 | 监听地址 |
| PHUB_SYNC_PORT | 8787 | 端口 |
| PHUB_SYNC_ORIGINS | 内置开发/原生来源列表 | 逗号分隔的精确 Origin 白名单，配置时替换默认列表 |

默认来源：`http://localhost:5173`、`http://127.0.0.1:5173`、`http://localhost`、`https://localhost`、`http://tauri.localhost`、`tauri://localhost`。开发端口变化或使用 Web HTTPS 地址时需调整。原生 WebView 的实际 Origin 仍需真机验证。

## 协议与持久化

- `POST /v1/connect`：认证账号后首次绑定保险库，返回与账号关联的稳定 serverId。已属于其他账号的保险库拒绝访问。
- `POST /v1/push`：在同一 SQLite 事务中检查版本，写入记录、变更历史和回执。同一设备与操作 ID 重试返回原回执，改变原请求则拒绝。
- `POST /v1/pull`：读取按保险库连续递增的游标，默认每页 20 条。游标超过服务端历史时拒绝静默重置。
- 所有接口要求 Bearer 令牌，数据库仅保存令牌 SHA-256 摘要。deviceId 本身不授予权限。
- SQLite 使用 WAL、FULL 同步和事务；删除保存墓碑。当前不压缩变更历史或回执。
- 单条密文最多约 1.5 MB Base64；HTTP 请求上限 1.6 MB。附件通过独立 blobs 接口按密文分块同步，详见 ATTACHMENT-SYNC.md。

服务元数据中的 serverId 必须随数据库保留。客户端绑定服务和保险库范围，不能直接切换到新建的空数据库继续使用旧游标。备份应停止服务后复制整个数据目录；恢复应使用一致的完整备份。在线备份、历史裁剪和迁移到不同服务尚未提供。

## 验证与边界

```powershell
npm run sync:typecheck
npm run test
npm run build
```

HTTP 集成测试通过真实监听端口访问临时 SQLite 数据库，覆盖双设备合并、冲突选择、删除、重启后幂等回执和 serverId、并发版本检查、账号隔离、来源校验、无效密文和游标检查。测试数据目录会自动移除。

第五阶段验收：13 个测试文件、118 项测试通过，前端构建和服务端类型检查通过。Edge 隔离环境验证了设置页连接真实 HTTP 服务、远端修改持久化、锁定断开、刷新后不保留令牌以及重新连接；页面无运行时异常。

当前使用一个共享个人账号令牌，没有用户注册、逐设备令牌或设备撤销界面；凭据不随保险库同步。公网使用前还需 HTTPS 部署、限流/容量配额、运维备份和恢复演练。2026-09-20 已构建 Android Debug APK 与 Windows release/NSIS，并通过手机 USB 转发完成 Android/Windows/Web 核心同步验收，详见 [验证记录](./VERIFICATION-2026-09-20.md)。局域网/公网 HTTPS、Android 正式包覆盖升级仍未验收；Windows NSIS 隔离目录静默覆盖升级与数据保留已通过，详见 RELEASE-VERIFICATION.md。

Node.js SQLite API 参考：[官方文档](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)。


## 停机备份恢复演练

2026-09-20：scripts/verify-server-restore.mjs 已通过真实 HTTP/SQLite 演练。停止服务并关闭数据库后复制完整数据目录，再恢复到独立目录启动：serverId、账号鉴权、记录密文、附件密文、游标和幂等回执保持一致；重发同一操作不新增变更，错误令牌及超前游标被拒绝。报告 .visual-qa/server-restore-1789878675786/report.json。仅采用合成数据；不代表在线热备份、旧备份追赶最新客户端游标或公网灾备验收。
