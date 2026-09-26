# 1.1.1 预览发布记录

准备日期：2026-09-22。桌面宠物属于本次预览版交付功能，默认关闭但随 Windows 安装包完整提供；Web/Android 提供角色预览。不是另行下载的可选资源包。

## 构建

版本源为 package.json：1.1.1 / Android 3。执行 `npm run version:sync` 后构建。GitHub Release 应标记为预发布，版本号用于三端一致和覆盖升级。

Windows：`npm run desktop:build`。

Android：配置 SDK 与 JDK 后执行 `npm run build`、`npx cap sync android`、`android/gradlew.bat assembleDebug assembleRelease`。使用其他 JDK 启动 Gradle 时，以 `PHUB_JDK21_HOME` 指向 JDK 21。已移除仓库内固定的 E 盘工具链路径。

签名属性文件为 `android/keystore.properties`（已忽略）：

```properties
storeFile=/absolute/path/to/your-keystore
storePassword=YOUR_LOCAL_STORE_PASSWORD
keyAlias=YOUR_KEY_ALIAS
keyPassword=YOUR_LOCAL_KEY_PASSWORD
```

以上为占位符；不要提交真实值。更新已发布 Android 应用必须使用对应的原签名。没有签名配置时，不应把生成的未签名 Release APK 当作可安装正式包。

## 仓库范围

代码、文档、测试、运行资源与构建配置纳入候选；release、QA 数据、日志、模型阶段工程、.blend1、图标候选与壁纸原件排除。原始文件没有被删除，需自行保留独立备份。

项目所有者已决定自行上传 GitHub、完整开源。原创代码和文档采用 MIT，随包运行资源保留；第三方素材权利范围见 THIRD_PARTY_NOTICES.md。当前未创建或推送远程仓库，上传不属于本次后续执行范围。

## 提醒行为

Android 锁定不取消已安排提醒，通知仅显示通用提示；最多最近 60 条，不包含后台自动递补。解锁、任务编辑和手动重试会重新安排。重置保险库会先清理提醒。

Windows/Web 保持解锁时扫描任务；锁定后暂停。这同样适用于桌面宠物任务提醒，后台陪伴不代表后台解锁。系统通知提交成功也不保证操作系统一定展示，必须结合权限和系统策略验收。

## 验收记录

本轮已完成：

- 34 个测试文件、190 项测试通过；Vitest 已限定 src/server，避免本机 QA 源码副本被重复计数。
- 前端类型检查与生产构建、服务端类型检查通过。
- 干净候选目录 `npm ci` 与构建通过。Tailwind 限定扫描 src，主 CSS 约 118.11 kB，避免历史文档和本机副本影响构建。
- `npm run test:ui` 通过：全局收集、任务关联、历史副本恢复、时间容量、正文索引锁定清除、四档搜索布局、今天页添加/筛选，以及版本、解锁、宠物加载、互动和移动端宽度。
- 宠物 GLB 校验通过：6,447,352 字节，八段动画与内嵌纹理/缓冲；SHA-256 为 `2d9f4958e493fadbc1c49f2a61d89563bd3ddac3ac2b71be5c75a3272ac66d03`。
- Android Debug/Release 构建通过；Release APK 签名 v2 通过，包名 com.zdb.personalhub，versionCode 3 / versionName 1.1.1，证书 SHA-256 与历史包一致。当前没有连接手机，未进行本版本真机提醒、指纹、正式覆盖升级验收。
- Windows/Web 锁定暂停扫描；Windows 通知直接等待原生 IPC 回执，点击跳转尚未实现。不要沿用旧文档的通知点击唤窗承诺。

界面报告：`.visual-qa/hub-1790063354426/report.json`、`.visual-qa/release-ui/report.json`。README 截图均使用独立合成保险库。

Windows `npm run desktop:build` 已通过，生成 1.1.1 release exe 与 NSIS。实际运行新 exe，使用全新独立 WebView2 数据目录，验证创建保险库、关于页版本、锁定解锁、设置页和原生宠物窗口模型/贴图加载成功；页面异常为零。报告 `.visual-qa/windows-preview-1790063554438/report.json`，复现脚本 `scripts/verify-windows-preview.mjs`。未改变用户共享的玩偶偏好、未覆盖个人保险库，也未运行安装器覆盖正式安装。

新候选源码在独立目录重新 `npm ci`、构建、190 项测试通过；发布快照不包含该目录的 node_modules 和构建产物。当前工作区未提交，因此以发布目录的逐文件源码 SHA-256 清单关联候选内容，不假称已绑定 Git 提交。

旧的 RELEASE-VERIFICATION.md 和 PET-HANDOFF.md 均为历史记录，不代表本版本已通过。多显示器/DPI/长时间运行、原生备份恢复和安装器升级仍须单独验收。当前只完成本地候选交付，尚未满足最终公开发布的全部条件。

依赖初筛：2026-09-22 npm audit 报告 3 个 moderate，来自开发依赖 @capacitor/cli → xcode → uuid；未执行破坏性自动降级。后续以保存的本轮报告为准，不把依赖审计等同完整安全审计。

`npm audit --omit=dev --json` 本次报告 0 个生产依赖漏洞。候选文件名及常见令牌/私钥格式初筛通过，不代表覆盖全部敏感信息或依赖风险。

另对全部现有 Git 提交检查常见私钥/令牌格式和签名/备份敏感文件名，未命中；未输出文件中的敏感值。此项仍仅为规则初筛。

## Android 真机续验

2026-09-22 手机连接后的新增结果，更新上方“当前没有连接手机”的历史边界：

- 独立 `com.zdb.personalhub.debug` 使用 `adb install -r` 从 1.1.0-debug / 2 覆盖至 1.1.1-debug / 3，没有清除数据，也没有覆盖正式包。
- 旧测试密码解锁成功，关于页版本正确。8 个既有 10 MiB 合成附件全部解密下载，SHA-256 与原始合成内容一致；保存接口使用捕获替身，不等于系统文件落盘验收。报告 `.visual-qa/android-preview-attachments.json`。
- 初次通知权限为 prompt，用户在手机授予后，新增测试任务进入真实系统队列；锁定清空内存后仍保留提醒，后台到点送达系统通知，正文不含任务名称；返回前台重新解锁，测试任务保留。报告 `.visual-qa/android-preview-1790065253244/report.json`。
- 旧脚本曾在电脑端按本机时区匹配手机时间而误判，已改为手机端比较。后台 WebView 会暂停调试脚本，系统送达情况在返回前台后读取系统记录确认；复现脚本已改为宿主等待后恢复前台读取，不用后台 JS 定时器判断送达。
- 仍未验收正式包覆盖安装、重启手机后的提醒、厂商长时间省电策略及全部权限组合。

项目所有者要求全部开源并自行上传；本轮加入 MIT 许可，并提供当前可编辑 Blender 工程，保留桌面宠物。第三方权利说明仍独立保留。
