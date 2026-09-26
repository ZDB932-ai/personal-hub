# 奶龙动作精修 · 2026-09-22

本轮沿用 Tripo GLB → Blender MCP → Three.js。通过实时 Blender 5.2 的 Python 操作修改权重和 Action，不是手工笔刷雕刻。没有调用付费生成接口。

阶段已于 2026-09-22 收尾，后续接手先看 [交接索引](PET-HANDOFF.md)。

## 当前入口与恢复

- 最新源工程：`assets/pet-models/tripo-fixed/nailong-expression-polish.blend`；第一轮工程 `nailong-motion-polish.blend` 保留。
- 最新导出：同目录 `nailong-expression-polish.glb`，已经复制到应用资源 `public/pets/nailong-animated.glb`。
- 原精修工程 `nailong-mcp-detail.blend` 保持不变。
- 原发布 GLB 保存在同目录 `pre-motion-polish/nailong-animated.glb`。回退时须同时恢复对应播放器：当前播放器要求 Dance 和 Peek，不能只换回六段或七段动画模型。

## 第二轮：偷看被发现

新增 3.6 秒 Peek 骨骼动画，共八段动画。分为好奇侧探、被发现后回缩、低头微笑、回位；运行时配合短促闭眼、ShySmile 和鼠标注视权重，移除旧的程序化探头叠加。网页入口文案为「偷看被发现」。

尝试对肩臂区域做邻域平滑和柔和四权重投影，但候选使 Run 最大边拉伸比从 1.924 升至 2.178、Dance 从 2.413 升至 2.501。候选已自动拒绝并恢复第一轮权重；不可将本轮描述成完成肩部修复。完整指标在 `expression-validation.json`，`weights_accepted` 为 false，最终 Run/Shy/Dance 指标与第一轮一致。

`scripts/check-polished-pet.py --expression` 独立重新导入最终 GLB，验证八段动画、17 骨骼、五个蒙皮网格，以及每三帧有限坐标和范围检查，全部通过。输出 `expression-export-validation.json` 和 Peek/Wave/Dance 九张多角度图 `expression-review-*.png`。这些图不包含网页运行时表情叠加。

五个动作相关测试文件共 18 项通过；`npm run build` 通过，仍有原有的大分包提示。构建版预览确认新按钮和角色加载、动作触发；单元测试覆盖表情函数的闭眼、微笑阶段和恢复值，不覆盖播放器平滑后的最终视觉时序，截图也不构成逐帧视觉验收。

Windows 第二次构建成功：`cargo build --release --manifest-path src-tauri/Cargo.toml --features tauri/custom-protocol`，生成 `src-tauri/target/release/personal-hub-desktop.exe`。只有 linker 输出提示，未生成新安装包。未替换或终止正在运行的旧 debug 进程，尚未做新版原生透明窗口和长期运行验收。最新源 GLB、public 资源和 dist 资源 SHA-256 一致。

复现：在 Blender 打开第一轮 `nailong-motion-polish.blend`，执行 `scripts/polish-pet-expression.py`；重新导入验收命令为 `& 'D:\Blender\blender.exe' --background --python-exit-code 1 --python scripts/check-polished-pet.py -- --expression`。脚本保留指标门槛，拒绝劣化候选后继续导出新动作。

## 第一轮修改

1. 两腿交界处将不足以归属左右腿的权重平滑归还身体，减少两腿反向移动时的拉伸。
2. 后颈原有部分顶点受尾巴影响，并在四影响截断时突然切换到头骨。为无手臂影响的颈头区域重建 body/chest/neck/head 连续权重，保留面部形态键、UV、材质及四个独立眼睑。
3. Run 独立重编：单侧前后幅度 0.035、60% 支撑相、摆动相抬脚与脚尖滚动，手臂和尾巴使用滞后相位。仍是短腿快走式小跑，没有腾空冲刺或新膝关节 IK。
4. 新增六秒 Dance：准备、交替点地、重心侧移、错拍摆手、头尾跟随与回位。移除运行时旧的整身弹跳及舞蹈骨骼叠加，避免两套驱动竞争。
5. Shy 改为低头避开、停顿、回看与回位，保留克制的手部动作。没有启用失败的强行捂脸实验。
6. 按实际位移、Walk/Run 混合步幅、画布高度推进步相；取消原来的独立降频补丁。巡游上限由 55 调到 28 逻辑像素/秒，目的地移动上限由 180 调到 62，使短腿步幅与速度更协调。转向和斜向移动仍是近似匹配，不能宣称完全没有滑步。
7. 舞蹈期间降低鼠标注视干预；表情权重在动画混合后写入，避免未来动画包含形态键轨道时覆盖眼睑。

## 第一轮验证

`motion-polish-validation.json` 记录每五帧采样、忽略静止长度小于 0.001 的边的拉伸比。最大值：Run 3.093 → 1.924；Shy 2.677 → 2.032。Run 的第 99 百分位也改善；Shy 的第 99 百分位由 1.105 到 1.122，因动作修改略升。不能将最大值下降等同于所有顶点或所有姿势改善。

`scripts/check-polished-pet.py` 在独立 Blender 进程重新导入候选 GLB，检查七段动画、17 骨骼、五个蒙皮网格，每三帧检查有限坐标与包围范围。Walk/Run 支撑脚骨骼高度差均为 0；这是关节检查，不是全脚底接触解算。输出 `polished-export-validation.json` 和三类动作共九张多角度检查图 `polish-review-*.png`。

网页 `npm run build` 通过，保留现有大分包提示。步态、导航、动作混合、害羞时序四个测试文件共 15 项通过。构建版 `?pet=1` 检查了加载、走动、舞蹈、害羞和切换，未发现控制台错误。网页不能代替原生透明窗口和长时间桌面验收。

第一轮尝试构建 Windows release 时，Cargo 启动返回“拒绝访问 (os error 5)”。第二轮重试已成功，见上文；当前运行的旧桌面版不会自动包含此次更改。

## 第一轮复现

先在 Blender 打开保留的 `nailong-mcp-detail.blend`，通过 MCP 执行：

```python
import runpy
runpy.run_path(r'E:\炫酷主页\scripts\polish-pet-motion.py', run_name='__main__')
```

脚本明确检查输入工程名，从旧源生成新工程和候选 GLB，不自动覆盖应用资源。随后运行：

```powershell
& 'D:\Blender\blender.exe' --background --python-exit-code 1 --python scripts/check-polished-pet.py
```

查看多角度输出，确认后复制候选 GLB 到发布路径，并执行 `npm run build`。原始重建脚本 `animate-tripo.py` 仍不适合作为当前精修工程入口。

## 后续表情包与批量工作流

建议继续采用这一技术路线，先将每只宠物的骨骼映射、关节安全幅度、步幅和表情键整理成角色配置，再复用动作意图和验收脚本。当前脚本的坐标与权重区域专为奶龙设计，不能直接批量套用其他体型。

“偷看被发现”已在第二轮完成。若以后继续，可考虑“吃饱打嗝”“得意后害羞”等带明确节拍的短动作。较大的捂脸、叉腰和奔跑需要肩肘局部重拓扑、关节修正形态和足部 IK。眼周接缝、独立眼球和口腔结构仍未解决；不能用更大的旋转幅度掩盖这些结构限制。本阶段不继续执行这些建议。
