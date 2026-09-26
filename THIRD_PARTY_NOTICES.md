# 素材与依赖清单

本清单记录已知来源及尚待确认事项，不代替代码或素材授权书，也不授予新的分发权限。项目原创代码与文档采用 MIT；项目所有者要求完整开源并自行上传。第三方依赖及角色相关权利不属于项目可代为授予的范围。

| 内容 | 随包位置 | 来源记录与状态 |
| --- | --- | --- |
| 奶龙动画模型 | public/pets/nailong-animated.glb | 用户提供/Tripo 生成模型经 Blender 精修，17 骨骼、八段动画；见 docs/PET-HANDOFF.md；角色及参考素材公开分发范围待所有者确认 |
| 当前可编辑模型工程 | assets/pet-models/tripo-fixed/nailong-expression-polish.blend | 随源码提供的最新 Blender 工程；历史实验工程仍只保留本机，第三方角色权利说明同上 |
| 静态角色回退图 | public/pets/nailoong-reference.png | 模型加载失败时实际使用；公开分发范围待确认，不能视作仅供内部参考 |
| 早期模型数据 | public/pets/nailong-tripo.glb、nailong-sculpt.json | 历史资源，后者仍用于模型测试；暂保留，发布权限同样待确认 |
| 壁纸 | public/wallpapers/ | 包含早期壁纸与新增艺术壁纸，原始工程在本机 assets/wallpaper-originals；须由所有者确认来源及分发范围 |
| 产品图标 | public/*icon*、src-tauri/icons、Android mipmap | 日光折页方案，见 assets/ICON-DESIGN.md；原始候选不纳入源码发布清单，分发范围待确认 |
| 字体 | src/style.css 等 | 使用样式定义的系统字体回退；没有在本清单中假定额外字体授权 |
| npm / Rust 依赖 | package-lock.json、src-tauri/Cargo.lock | 各依赖保留自身许可证；可从安装依赖中的 LICENSE/COPYING 文件核对，不因项目代码许可改变 |

assets/pet-reference、模型历史实验工程、自动备份、图标候选、壁纸原件不纳入当前 Git 候选集，但仍保留本机文件。最新可编辑 Blender 工程与运行 GLB 纳入源码候选；这不等于已确认第三方角色的分发权限。

素材的原始来源链接、许可文本或授权依据、署名要求及适用文件列表仍应补充。完整开源的发布意愿不等同于取得第三方角色授权；本表不将尚缺依据的素材描述为授权已完成。运行资源保留在源码候选中，不隐藏或删除桌面宠物功能。
