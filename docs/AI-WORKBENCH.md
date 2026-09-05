# P6 · AI 工作台方案（AI Agent 远程连接与控制）

> 目标：在 Personal Hub（网页 + 安卓 APP）中新增「AI 工作台」模块，连接开发机上运行的 AI coding agent（opencode / pi / codex / DeepSeek Harness / zcode），实现**随时查看进度、发送任务、审批权限请求**。
> 调研对象：opencode server 官方文档、slopus/happy（手机端 agent 客户端）、badlogic/pi-mono RPC 协议、pi-rpc-bridge、deepseek-ai/deepseek-harness、dsh-Agentlink、Open Interpreter harness census。

## 一、调研结论：各 Agent 的连接方式

| Agent | 暴露接口 | 适配方式 | 可达能力上限 |
| --- | --- | --- | --- |
| **opencode** ★一等 | `opencode serve` → HTTP + OpenAPI 3.1（端口 4096，支持 Basic Auth / CORS / mDNS） | **HTTP 直连客户端**，无需任何 wrapper | 会话增删查、发消息(同步/异步)、SSE 全局事件流、**权限请求远程审批**、文件读写/搜索、session diff、todo、TUI 驱动（append-prompt/submit）、中止、模型切换 |
| **pi** ★一等 | `pi --mode rpc` → JSONL（stdin/stdout），协议含 prompt/steer/follow_up/abort/set_model/bash/get_messages/**扩展 UI 确认框远程应答** | 桥接器 spawn 子进程 + JSONL 管道（社区已有 pi-rpc-bridge 可借鉴：HTTP+WS + Bearer） | 完整交互：流式输出、中途插话(steer)、换模型、执行 bash、会话树/fork/compact |
| **codex** ★★ | `codex exec`（非交互，read-only 沙盒默认）+ `codex app-server`（JSON-RPC stdio，IDE 同款）+ `codex mcp` | 桥接器子进程适配器：v1 用 exec 包装，v2 升级 app-server | 非交互执行 + 会话事件流（app-server 模式） |
| **DeepSeek Harness (dsh)** ★★ | `dsh --profile headless "job"`（持久会话）+ `-p` 一次性 + 内置 Web UI + 结构化事件/**审批(pending interactions)**/恢复 | v1：headless 会话包装；v2：对接 host API（dsh-Agentlink 已验证 delegate/tail/approve 语义） | 会话持久化、事件流、审批应答、取消 |
| **zcode** ★ | `zcode -p "prompt"` 一次性（headless-only，无 TUI/守护协议；bare 默认 yolo 需注意） | **通用 exec 适配器**（发 prompt → 收最终输出） | 一次性任务，无会话/审批 |
| **任意其他 CLI** | 非交互 `-p` 模式 | 同上通用适配器，模板可配置 | 一次性任务 |

> 结论：**不存在统一协议，但存在统一的适配器模式**。opencode 与 pi 覆盖度最高（会话+流式+审批），codex/dsh 次之，zcode 只做一次性执行。

## 二、总体架构（三层）

```
┌─ 手机 / 网页：Personal Hub「AI 工作台」UI ─────────────┐
│   设备卡 · 会话列表 · 发消息 · 流式输出 · 审批卡        │
└──────────────┬──────────────────────────────────────┘
               │ 通道A: PocketBase 中继（复用现有 PB，出站连接，外网可用）
               │ 通道B: 局域网 / Tailscale 直连（低延迟，零依赖）
┌──────────────┴──────────────────────────────────────┐
│   桌面桥接守护进程 phub-bridge（Node 单服务，装开发机）  │
│   · 设备注册/心跳 · 会话路由 · 事件转发 · 权限通知      │
│   · 适配器注册表（可扩展，per-agent 一适配器）          │
└──┬──────────┬──────────┬──────────┬─────────────────┘
   │HTTP/SSE  │RPC管道    │子进程     │子进程/HTTP
[opencode] [pi rpc]  [codex]  [dsh] [zcode] [通用exec...]
```

### 通道决策（关键）

| 通道 | 优点 | 缺点 | 定位 |
| --- | --- | --- | --- |
| **A. LAN/Tailscale 直连** | 零新增组件（opencode serve 原生支持）、低延迟 | 出门不可用（Tailscale 可解但要装） | **v1 首选**：手机与开发机同网/tailnet 即用 |
| **B. PocketBase 中继** | 复用现有 PB 与账号；外网随时可达；无需公网 IP | 多一跳延迟；需常驻 bridge | **v2**：bridge 主动出站连 PB，Hub 下行指令走 PB 记录轮询/SSE |
| C. 隧道（cloudflared/ngrok） | 公网 HTTPS | 额外组件/暴露面 | 备选，不默认 |

安全基线：所有通道要求 Token；**文档与 UI 明确警告「桥接 Token ≈ 电脑 shell 权限」**（pi-rpc-bridge 同款警告）；PB 通道 v2+ 可做端到端加密（借鉴 happy 的 E2E 思路，密钥不入服务器）。

## 三、AI 工作台功能设计（新模块 `/ai`）

1. **设备与 Agent 卡片**：在线/离线心跳、agent 清单与版本、当前项目路径、连接通道标识
2. **会话管理**：列表（按 agent/项目筛选）、新建会话、删除、中止运行中的任务
3. **对话**：发送 prompt（同步/异步）、流式输出渲染、steer 插话（pi/opencode 支持）、历史消息
4. **权限审批**：agent 请求权限 → 工作台出现审批卡 → **安卓本地通知**推送 → 一键批准/拒绝（opencode 原生端点；pi 走扩展 UI 应答；dsh 走 approval rpc）
5. **代码可见性**（opencode 优先）：session diff、文件树/读文件、todo 列表
6. **快捷能力**：bash 执行（pi/opencode，默认隐藏需开启）、模型切换、导出会话

## 四、分期实施

| 阶段 | 内容 | 依赖 | 预估 |
| --- | --- | --- | --- |
| **P6.1** | 工作台 UI 骨架 + **opencode LAN 直连适配器**（serve + Basic Auth）：设备卡/会话/发消息/SSE 流/审批 | 手机与 PC 同网或 Tailscale | 1–2 次会话 |
| **P6.2** | **phub-bridge 守护进程**（Node，Windows 常驻）+ PB 中继协议（agents/devices 集合）+ 设备注册与 Token | 现有 PocketBase | 1 次会话 |
| **P6.3** | **pi RPC 适配器**（参考 pi-rpc-bridge）+ **codex exec 适配器** + **dsh headless 适配器** + 通用 exec 适配器 | 对应 CLI 已安装 | 1 次会话 |
| P6.4 | 安卓审批推送、diff/文件查看、会话导出、E2E 加密（可选） | P6.2 | 半次–1 次 |

## 五、风险与对策

1. **各 agent 迭代快**：适配器按接口版本探测（opencode /doc、pi get_state），失败给出「版本不匹配」提示而非崩溃
2. **安全**：桥接 Token 即 shell；默认仅绑定 127.0.0.1/LAN，外网必须走 PB 中继 + Token；审批类操作永远需要人确认
3. **Windows PTY**：zcode/dsh/zcode 的交互式 TUI 在 Windows ConPTY 有坑 → 一律走非交互模式规避
4. **zcode 无会话**：只提供一次性执行，UI 上标注「单发模式」
5. **PB 中继延迟**：轮询间隔 2s + SSE 升级（PB 支持 realtime 订阅，可做到准实时）

## 六、待拍板决策点

1. v1 通道：**LAN/Tailscale 直连先行**（最快见效）还是直接上 PB 中继（外网但多一步部署 bridge）？
2. v1 agent 范围：**只做 opencode 跑通全链路**，还是 opencode + pi 一起？
3. UI 形态：新增第六个导航模块「AI」，还是并入现有页面？
