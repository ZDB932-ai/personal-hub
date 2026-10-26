# 桌宠现有形象接入（2026-10-22）

按用户“先把已经完成的形象放进去，不管效果咋样”的要求，开放现有文件为测试版伙伴，不再等待外观精修。此变更不将 Tripo 工程中的质量关卡或正式候选改为已验收。

设置 → 桌面玩偶 → 桌面角色现有五项：奶龙、星际维修员、圆润机器人、小宇航员、卷发男孩。角色选择由同一份 available.json 同时供前端和 Rust 校验。

| 角色 | 本次开放内容 | 文件来源（E:/Tripo pipline/assets/ 下） |
| --- | --- | --- |
| 奶龙 | 原功能保留 | 沿用原资产 |
| 星际维修员 | 鼓掌，测试版 | 沿用 public/pets/samples/official-clap.glb |
| 圆润机器人 | 灰模，待机/行走/跑步/跳跃 | rounded-robot/work/hybrid-four-20261022/four-actions.glb |
| 小宇航员 | 现有模型、行走 | little-astronaut/runs/run005/exports/native-rig-animation.glb |
| 卷发男孩 | 静态模型，无动画按钮 | curly-haired-boy/runs/001/exports/source.glb |

未开放问候动作；没有实测地面速度的角色不启用屏幕巡游。男孩文件约 45.8 MB，暂优先复用，不进行可能改变外观的压缩。灰模、面部、动画完整度等仍可后续升级，不声称最终精修完成。

新文件 SHA256：

- rounded-robot-preview.glb: bcf1eb283f5ab21a84d078250e59811888a0402cdff6bab106e8decc7426608c
- little-astronaut-preview.glb: 27c2737c115df16fb6a6215c2739c76dedef61e35af43e411a8eecc81524c7d6
- curly-haired-boy-preview.glb: 0326d1f7e3162447d96d9f50eae82aa74dbd8b8ea57e4567bbd1bdf63ac5a881

验证命令：npm run build；相关 pet 单元测试；node scripts/verify-pet-preview-library.mjs。后者用实际 Three.js 加载器和 WebGL 顺序加载四个角色并调用其开放动作，输出 .visual-qa/pet-preview-library/report.json。此检查不替代原生 Windows 窗口交互验收。

本次实际 WebGL 加载四项均成功，所开放的动作均能进入对应播放状态，浏览器脚本错误为零；48 项相关单元测试通过。实际绘制三角数：维修员 71,430、机器人 9,160、宇航员 47,924、男孩 1,910,050。男孩目前为高面数静态原模，低配置设备可能较慢，尚未做减面。

现有已安装桌面程序需重新构建/安装后才会取得这些资源与新的原生允许列表；仅更新源码不会自动更新旧安装包。
