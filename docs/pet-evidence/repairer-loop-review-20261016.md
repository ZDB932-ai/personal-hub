# 维修员桌宠循环回读

正式导出批次 local-024 的橙白 GLB 哈希与源项目 final-delivery-report.json 一致：`c5c4ce3917de76dbe7728f389689ed711e30ca62c4ec81404d6bafb7d63913cf`。原始文件和母版未修改，也没有更新正式质量关卡或用户验收。

使用 Blender 5.2 空场景回读；同时绑定根节点与骨架对应 Action slot，禁用 NLA，比较实际蒙皮后世界坐标。有效报告为 `repairer-loop-readback-20261016-v2.json`。

| 片段 | 时长 | 首尾最大位置差 / 身高 | 首尾半帧有限差分速度差 / 身高每秒 |
| --- | --- | --- | --- |
| Idle | 15.333 秒 | 0.03096% | 0.09694 |
| Walk | 2.333 秒 | 0.05742% | 0.44755 |

结论：首尾位置接近不代表速度连续。Walk 仍需动态循环检查和基于接触相的脚滑验证，不能仅凭旧导出成功便启用桌面巡游。上述数值不代替阈值契约、全片段形变检查或用户审阅。

初次报告 `repairer-loop-readback-20261016.json` 误计了 Blender glTF 导入器生成的骨骼显示用 Icosphere，导致高度分母为 2 米。该报告的归一化数值无效，保留供追溯。v2 按 pose bone 的 custom_shape 对象身份排除显示辅助物，实际角色和背包共 41898 顶点，身高约 1.00023 米；不是按对象名字猜测排除。该 Icosphere 不是 GLB 额外角色网格。

现有三套外观可作为后续候选，但均未进入桌宠可选目录。额外 14 条原生动作沿用原交付限制：只核对存在与时长，不宣称已经逐动作精修。用户取消男孩问候动作的意见不自动扩展为删除维修员历史动作。

可复现命令：

```powershell
& 'D:\Blender\blender.exe' -b --factory-startup --python scripts/audit-pet-blender-loops.py -- 'E:\Tripo pipline\assets\stellar-repairer\delivery\release\Repairer_orange_17clips.glb' '<新的报告绝对路径>'
```

脚本拒绝覆盖已有证据，并在结束时再次检查输入哈希。此步骤为只读用途适配核验，不消耗本地模型修改轮次，也不把原先停止权重返工的分支重新启动。
