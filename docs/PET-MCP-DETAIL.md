# MCP 局部修形

2026-09-22：动作和蒙皮修订保存在 `nailong-motion-polish.blend`；最新入口为新增 Peek 动作的 `nailong-expression-polish.blend`，共八段动画。详见 [PET-MOTION-POLISH.md](PET-MOTION-POLISH.md)，以下为原精修记录。

当前精修源文件为 `assets/pet-models/tripo-fixed/nailong-mcp-detail.blend`。通过 Blender MCP 在实时场景中操作并渲染验证，非手工笔刷雕刻。新增 CheekContour 形态键，对两侧脸颊和下巴共 1,984 个顶点进行小幅定向填充；保留 Basis、原贴图、17 骨骼和五个 Action。形态键默认权重为 1，可归零对比。

修改前后同灯光近景：`mcp-detail-before.png`、`mcp-detail-after.png`。效果是局部轮廓微调，眼口结构尚未重建。

最新 GLB 从此 MCP 工程导出。不要直接运行旧 `animate-tripo.py` 覆盖发布模型：它从此前的九骨骼精修源重建，会丢失本次实时编辑。后续应编辑此工程并仅选择角色网格和骨架导出，摄影灯与相机留在工程内。

材质精修：MCP 中将皮肤、眼球与口部分为三个材质区，全部保留颜色贴图和 UV。皮肤粗糙度 0.64、眼球 0.19、口部 0.43，金属度归零；眼球单独控制涂层反光，按颜色贴图排除眼周黄色皮肤，避免亮面扩散到眼眶。睁眼与闭眼渲染分别为 `mcp-material-front.png`、`mcp-material-blink.png`。

此前眼角修正：通过 MCP 重塑 BlinkLeft、BlinkRight，并同步组合 Blink。扩大眼周变形的平滑过渡范围，减轻闭眼时向下延伸的斜折痕；验证图 `eyelid-closed-refined.png`。半闭修正实验 `eyelid-mid-refined.png` 仍有眼球压扁感，未采用。

当前眼睑结构：MCP 场景新增 EyelidLeft/Right、LowerLidLeft/Right 四个独立网格，沿原眼部曲面贴合，绑定 head 骨骼并以骨架为父级。原主网格 Blink/BlinkLeft/BlinkRight 归零位移，停止挤压眼球；保留键名兼容加载。上眼睑承担约 80% 闭合、下眼睑约 20%，使用原皮肤材质和额部采样 UV。眼球仍保留在原融合网格内，并未重建独立眼球或眼球转动骨骼。

眼睑以独立 BlinkLeft 或 BlinkRight 控制，LidArc1–7 是每 1/8 闭合位置的曲面修正，运行时采用相邻修正键的三角权重，避免仅用线性插值穿入原眼表。睁眼时修正权重全部为零；害羞、眨眼、睡眠共用相同闭合驱动。源工程仍为 nailong-mcp-detail.blend，实验备份 nailong-lid-structure-study.blend。GLB 必须导出全部五个角色网格及骨架，不得只选主网格。

验证图：`lid-final-open.png`、`lid-corrected-threequarter.png`、`lid-structure-closed4.png`。闭合时眼周仍可见边界，属于局部结构升级，不能视为完整面部重拓扑完成。

运行验证：网页构建和桌面 custom-protocol 调试构建通过。构建版预览已检查睡眠闭眼、切换害羞，未见控制台错误；未做全动作逐帧验收。Vite 开发监听曾因 src-tauri/target 中锁定 DLL 报 EBUSY 退出，现已排除此目录。当前 5179 为 dist 静态预览，修改后需重新构建才能反映。

导航更新：移除角色焦点外框；朝向采用最短角路径和速度上限，取消随机自动转圈。巡游保留浮点坐标，边缘停顿 220ms 后折返；指定地点使用 Shift+左键或中键从角色拖向目的地后松开，仅限当前显示器工作区。跑向目的地最高 180 逻辑像素/秒，巡游 55；靠近目标减速，菜单和手动交互暂停移动。MCP 新增 Run Action（基于 Walk 增大步幅 1.6、摆臂 1.35），按速度混合 Walk/Run，步相按位移累计；共六段动画。已通过导航单元测试，跨屏指定与全动作真机验收未完成。

跑动节奏微调：快速奔跑动画相位统一乘以 0.75，慢走到快跑之间按 sprint 混合平滑过渡。Walk/Run 的手臂与腿仍使用同一相位，实际窗口移动速度不变。属于观感调节，会相应降低步伐与地面位移的严格匹配程度。
