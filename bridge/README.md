# phub-bridge · AI 桥接守护进程 v2

在开发机上常驻运行，把本机 AI agent 接入 Personal Hub。**支持多 agent**（`--agent` 选择）：

| Agent | 模式 | 说明 |
| --- | --- | --- |
| `opencode` | HTTP 连接本机 serve | 会话/流式/审批（默认） |
| `pi` | spawn `pi --mode rpc` 子进程 | prompt/steer/换模型/消息历史 |
| `codex` | spawn `codex exec` 一次性 | 单发模式 |
| `dsh` | spawn `dsh --profile headless -p` | 单发模式（工作区可写） |
| `zcode` | spawn `zcode -p` | 单发模式（yolo 默认，注意） |

## 两种入口（可同时启用）

1. **PocketBase 中继**（外网可用）：bridge 出站连接 PB，Hub 指令经 PB 下发——需 PB 参数 + 后台建 `hub_ai_dev` / `hub_ai_cmd`（+pi 模式 `hub_ai_evt`）集合
2. **本机 HTTP**（局域网/Tailscale）：`--http 端口 --http-token 至少32位随机值`，Hub 直连——**pi/codex/dsh/zcode 无 PB 时必用此项**

## 快速开始

### pi + 纯局域网（无需 PB、无需公网）

```bat
双击 bridge\pi-bridge.bat（先编辑 Token；项目在 Hub 中管理）
```

Hub：Agent=pi · 通道=局域网 · 地址 `http://电脑IP:8811` · Token 对应。进入 AI 工作台后，在「Pi 项目」中添加和切换项目目录。

### pi 多项目

- 项目注册表默认保存在 `bridge/pi-projects.local.json`，已被 Git 忽略。
- 添加项目只登记目录；首次选择时才在该目录启动独立的 `pi --mode rpc` 进程。
- 多个项目可同时保留各自的 pi 上下文。Hub 每条 pi 指令都携带项目 ID，不存在 bridge 全局“当前项目”。
- bridge 会记住每个项目最后使用的 pi session，重启后首次选择该项目会自动恢复。
- 默认运行 `pi-bridge.bat` 启动原生 pi TUI，并通过 `phub-pi-tui-bridge.ts` 将同一个 TUI 会话暴露给 Hub。电脑端与远程 Hub 看到和控制的是同一个 pi 进程。
- `pi-headless-bridge.bat` 保留旧的隐藏 RPC 多项目模式，适合无人值守启动；不要与原生 TUI bridge 同时监听 `8811`。
- `pi-console.bat` 是 headless RPC 的可选同步终端，在原生 TUI 模式下无需使用。
- 移除项目会停止对应 pi 进程并删除注册表记录，不会删除项目文件或 pi 历史记录。

### opencode + PB 中继

```powershell
node phub-bridge.mjs --pb http://pb:8090 --email you@x.com --pass 密码 --device 我的电脑 --oc http://127.0.0.1:4096
```

## 参数总表

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--agent` | opencode | opencode / pi / codex / dsh / zcode |
| `--pb` `--email` `--pass` | 空 | PB 中继三件套（留空 = 跳过 PB） |
| `--device` | 我的电脑 | 设备名（须与 Hub 配置名一致，中继模式用于路由） |
| `--oc` | http://127.0.0.1:4096 | opencode serve 地址（opencode 模式） |
| `--oc-user` / `--oc-pass` | 空 | opencode serve Basic Auth |
| `--pi-bin` | pi | pi 可执行文件（pi 模式） |
| `--pi-projects` | `bridge/pi-projects.local.json` | pi 多项目注册表路径 |
| `--pi-cwd` | 空 | 可选的一次性迁移项目；之后在 Hub 中管理项目目录 |
| `--pi-session` | 空 | 配合 `--pi-cwd` 导入既有 pi session 文件，仅迁移时使用 |
| `--codex-bin` / `--dsh-bin` / `--zcode-bin` | 对应名 | 单发模式可执行文件 |
| `--cwd` | 当前目录 | 单发模式 agent 工作目录 |
| `--http` | 0（关闭） | 局域网 HTTP 指令入口端口 |
| `--http-token` | 必填 | HTTP 入口 Bearer Token（至少 32 位随机值） |
| `--poll` | 1500 | PB 指令轮询间隔（毫秒） |

## 安全提醒

能驱动此桥接 = 能操作你的 agent（间接具备项目文件写入与命令执行能力）：
- HTTP Token 视同 SSH 密钥保管
- PB 集合规则严格限定 user = 本人
- 不用时关闭 bridge 窗口
