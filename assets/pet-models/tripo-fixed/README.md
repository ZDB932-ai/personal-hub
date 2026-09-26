# Tripo 模型修复版

## 当前入口（2026-09-22）

最新工程为 `nailong-expression-polish.blend`，导出为 `nailong-expression-polish.glb`，发布副本为 `../../../public/pets/nailong-animated.glb`。17 根骨骼、五个蒙皮网格、八段动画。完整状态、验证边界与接手说明见 [PET-HANDOFF.md](../../../docs/PET-HANDOFF.md)。

| 文件或前缀 | 用途 |
| --- | --- |
| `nailong-expression-polish.*` | 最新源工程与导出；`.blend1` 为自动备份，不作为发布依据 |
| `nailong-motion-polish.*` | 第一轮跑步、害羞、舞蹈和权重修复 |
| `nailong-mcp-detail.blend` | 第一轮输入工程，保留原局部修形 |
| `expression-validation.json` | 第二轮候选权重评估；候选已拒绝，最终恢复第一轮权重 |
| `expression-export-validation.json` | 最终八段动画 GLB 重新导入检查 |
| `expression-review-*.png` | 最终 Peek/Wave/Dance 多角度静帧，不含网页表情叠加 |
| `motion-polish-validation.json`、`polished-export-validation.json`、`polish-review-*.png` | 第一轮指标与检查图 |
| `*study*`、`*candidate*` | 历史实验或候选，不等同于可发布版本 |
| `pre-motion-polish/` | 本次精修前的 GLB 备份，回滚时需配套旧播放器 |
| 其他早期工程、检查图和日志 | 保留供追溯；以交接索引判断当前状态 |

当前阶段已收尾；未移动或删除历史资产，避免破坏脚本路径与复现依赖。

## 早期静态修复与九骨骼绑定记录

原文件未修改；修改基于独立 desktop-candidate.glb 副本。

- 在保留 UV 的前提下合并位置重合顶点，识别出主体与脚边文字两个连通区域。仅删除文字区域 1,138 顶点。
- 尾巴在根部以后的纵向长度缩短 28%，保留根部位置和圆钝尾梢。
- 嘴周按局部平滑权重回收，最大 0.016 模型单位，保留原有嘴、牙齿和贴图。
- 手臂外侧局部平滑外移，最大 0.025 模型单位，增大腋下空间，保留抬手姿势。
- 导出为 nailong-fixed.glb，并重新导入进行正面、侧前方、背面渲染。未见明显破面或贴图丢失。
- 96,173 三角面；编辑网格 52,993 顶点（GLB 导出时会因 UV/法线拆分顶点）。

腋下、下巴的暗部仍保留，不把照明或贴图暗色当作几何凹陷强行抹除。`nailong-fixed` 是静态修复源文件。

后续绑定版 `nailong-rigged.blend` 已增加身体、头、双上臂、双前臂、双腿、尾巴共九根骨骼，以及 Blink 闭眼形态键，发布到 `public/pets/nailong-tripo.glb`。顶点最多四项权重且归一化检查通过；重新导入发布 GLB 渲染静止、挥手、闭眼和休息姿势。眼周褶皱、大幅肩部运动仍需继续精修，尚无嘴型和手腕绑定。

文件：nailong-fixed.blend 为可编辑修复副本；nailong-fixed.glb 为导出模型；front.png、three-quarter.png、back.png 为导出后重新导入的检查图。
