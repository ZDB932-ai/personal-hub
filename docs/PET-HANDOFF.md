# 奶龙宠物交接索引

整理日期：2026-09-22。按用户要求，本阶段停止模型和交互迭代，仅整理已有成果。本文是当前状态入口；其他文档中的历史阶段说明不代表最新发布状态。

## 当前交付

技术路线为 Tripo GLB → Blender MCP 精修与 Action 制作 → Three.js AnimationMixer → Vue / Tauri。当前仍是奶龙专用实现，尚未形成跨角色批量生产工作流。

| 用途 | 文件 |
| --- | --- |
| 最新可编辑工程 | [nailong-expression-polish.blend](../assets/pet-models/tripo-fixed/nailong-expression-polish.blend) |
| 最终导出模型 | [nailong-expression-polish.glb](../assets/pet-models/tripo-fixed/nailong-expression-polish.glb) |
| 应用实际加载资源 | [nailong-animated.glb](../public/pets/nailong-animated.glb) |
| Windows release 程序 | [personal-hub-desktop.exe](../src-tauri/target/release/personal-hub-desktop.exe) |
| 修改、指标和复现步骤 | [PET-MOTION-POLISH.md](PET-MOTION-POLISH.md) |
| 模型目录说明 | [README.md](../assets/pet-models/tripo-fixed/README.md) |

最终 GLB 为 6,447,352 字节，SHA-256 为 `2D9F4958E493FADBC1C49F2A61D89563BD3DDAC3AC2B71BE5C75A3272AC66D03`。本次构建时导出、public 与 dist 三份资源一致。dist 和 target 是可重新生成的构建产物。

网页预览地址为 `http://127.0.0.1:5179/?pet=1`，依赖本地预览服务运行；服务停止后可在项目根目录执行 `npm run preview -- --host 127.0.0.1 --port 5179`。它展示已构建的 dist，不能代替原生窗口验收。

## 已落地的行为

- 17 根骨骼、五个蒙皮网格；八段动画为 Idle、Walk、Run、Wave、Eat、Shy、Dance、Peek。
- 跑步重编支撑与抬脚节拍，修复腿间和后颈部分权重；步相随实际位移推进。巡游上限 28、目的地移动上限 62 逻辑像素/秒。
- 跳舞改为六秒骨骼片段，含点地、侧移、摆手和头尾跟随。
- 害羞使用避开、停顿、回看、回位；「偷看被发现」为 3.6 秒片段，并配合闭眼、微笑和注视权重。

播放器与动作资源需配套维护：当前播放器要求全部八段动画。只替换成历史 GLB 会因缺少 Dance 或 Peek 而加载失败。

## 验收状态

| 项目 | 已有结果与边界 |
| --- | --- |
| 动作逻辑测试 | 五个测试文件共 18 项通过；包含表情函数时序，不等于最终渲染逐帧验收 |
| GLB 导出检查 | 独立 Blender 重新导入，检查骨骼、网格、八段动画及每三帧坐标范围，通过 |
| 视觉检查 | Blender 多角度静帧及网页加载、动作触发检查；未覆盖每个中间姿势 |
| 网页构建 | `npm run build` 通过，存在大分包提示 |
| Windows 构建 | release 编译通过，生成 exe；本轮未生成安装包 |
| 新版原生运行 | 未完成透明窗口、长时间运行、多显示器与不同 DPI 的综合验收 |

第一轮 Run 最大边拉伸比从 3.093 降至 1.924，Shy 从 2.677 降至 2.032。该指标为特定采样规则下的结果，不能代表所有局部都改善。Walk/Run 支撑脚关节高度检查通过，不代表全脚底 IK 锁地。

## 保留的问题和未采用实验

- 肩肘大幅运动仍受拓扑和权重限制；强行捂脸实验未通过视觉验收，不在发布版本中。
- 第二轮肩部权重平滑候选使部分 Run/Dance 姿势劣化，已拒绝并恢复第一轮权重；详见 `expression-validation.json` 的 `weights_accepted: false`。
- 眼周接缝、独立眼球和口腔结构尚未完成；转弯和斜向移动仍可能滑步。
- 当前坐标区域、骨骼名称和动作幅度针对奶龙，不能直接批量套用其他体型。

若以后恢复迭代，优先进行肩肘局部结构与姿态修正，再扩展大幅表演；批量工作流需要先抽取角色骨骼映射、关节安全幅度、步幅与表情键配置。这些仅为后续建议，本阶段不继续执行。

## 维护入口与历史

| 范围 | 入口 |
| --- | --- |
| 播放与表情混合 | `src/lib/pet/tripo3d.ts`、`src/lib/pet/personality.ts` |
| 步态与导航 | `src/lib/pet/gait.ts`、`src/lib/pet/navigation.ts` |
| 交互与巡游 | `src/components/DesktopPet.vue` |
| 第一轮生成脚本 | `scripts/polish-pet-motion.py`，输入 `nailong-mcp-detail.blend` |
| 第二轮生成脚本 | `scripts/polish-pet-expression.py`，输入 `nailong-motion-polish.blend` |
| 最终导出验收 | `scripts/check-polished-pet.py`，添加 `-- --expression` 参数 |

历史记录见 [开发总结](NAILONG-DEVELOPMENT-SUMMARY.md)、[桌面宠物早期实现](DESKTOP-PET.md)、[最初 Blender 动画工程](PET-BLENDER-ANIMATION.md)、[MCP 局部修形](PET-MCP-DETAIL.md)、[捂脸实验](PET-COVER-FACE-STUDY.md)。

保留原始资源、阶段工程、实验工程和 `.blend1` 自动备份，不以文件修改时间判断哪个可发布。旧 GLB 备份在 `assets/pet-models/tripo-fixed/pre-motion-polish/`，但不是完整应用回滚包；回退需同时恢复对应播放器代码。不要用早期 `animate-tripo.py` 覆盖当前精修模型。
