# 圆角机器人外观提案 v001

状态：用户已确认概念方向（2026-10-16，原话“合适”，针对上轮展示的圆角机器人造型）。不是正式建模四图的批准，不是可用桌宠，不改变现有角色生产状态。

产物：`assets/pet-concepts/robot-v001-qa.png`，使用内置 imagegen 生成。已实际查看：四个完整视角，主体配色与主要轮廓一致，肩肘膝结构可辨。侧视图存在远侧肢体遮挡，左右图高度相似；不能据此认证四个独立视图或左右结构正确。手指比提示要求更细碎，后续参考需简化为更易读取的手套形，并保留独立拇指。背面检修盖为推测设计。当前只供造型方向审阅，不进入 Tripo 生成。

依据：用户要求丰富桌宠形象、覆盖面广，动作优先 Tripo 预设并在 Blender 精修，且要求持续修改、不反复申请。现有目录仅奶龙可用，其他候选集中在人形、宇航员及小熊。机器人作为新增外观提案，不替代这些候选的剩余交付要求。

动画用途：animated。拟支持待机、行走、跳跃和一次性庆祝；具体预设必须在 Studio 核实，不凭外形推定支持。手脚有活动空间、膝肘可辨、双脚分离；不使用漂浮四肢、细天线、线缆或遮挡关节的大型装备。机械壳体与软关节为混合结构，后续须分别检查刚性随动与关节形变。没有新增问候需求。

本版使用内置 imagegen 的 stylized-concept 模式，输出为同一角色四角度概念审阅板（qa-only）。配色与后背结构均为设计提案，不是用户已指定或真实观测。正式参考阶段需按已选概念生成前、左、右、后四张独立图并审阅，不把此板直接提交 Tripo。

R01/R07：本轮采用内置生图做概念与风格探索；不启动 Studio 参考付费任务。R03：后续补独立多视图。R02/R04/R05/R06/R08/R09：当前无待编辑原图、多主体拆分、头部拆分、残缺身体、打印或场景拆分需求，不调用。当前 Studio 对此角色的绑定及动作兼容性仍为未知。

## 冻结提示词

Use case: stylized-concept. Asset type: QA-only character concept board for an animated desktop companion, not an upload-ready multiview reference. Design ONE original friendly compact humanoid robot, distinct from astronauts and humans: rounded rectangular ivory head, dark inset face screen with two simple warm expressive eyes, muted teal torso shell, short but clearly articulated limbs with dark flexible elbow and knee joints, rounded ivory hands with simple separate thumbs, two sturdy rounded boots. Approximately 3.5 heads tall. No helmet, no backpack, no antenna, no weapons, no logo, no floating components. Maintain visible gaps between arms and torso and between legs; natural relaxed A-pose with arms slightly out, feet planted, all joints mechanically understandable. Four equal panels on a clean warm light gray background, same robot in identical neutral pose and same scale: front, character-left side, character-right side, back. Orthographic-like product render, consistent soft neutral illumination and subdued materials, entire body visible with generous margins. Back has a simple flush service panel, no cables. Identity, colors, limb lengths, joint locations, and head shape must match across views. No lettering or watermark. This is an appearance proposal for later Tripo native rig/preset evaluation and Blender polish, not a claim of existing 3D geometry.
