# Android 真机交互打磨 · 2026-10-14

本轮在 USB 连接的 PLB110 / Android 16 上完成，物理分辨率 1080×2374，有效 WebView 宽度 360 CSS px。使用独立包 `com.zdb.personalhub.mobileqa`，名称「Personal Hub 手机调试」，版本 1.1.3-debug。手机原有 `com.zdb.personalhub.debug` 的 1.1.1 账户和数据未覆盖、未读取。

## 发现和修复

1. 打开更多菜单后按系统返回会退出 Activity。接入官方 `@capacitor/app` 8.1.2，返回先交给最上层选择器、弹窗及日历面板，再处理路由历史；无历史的二级页回今天，首页和锁屏退到后台。监听器随组件卸载清理。
2. 页面内的 ModalShell 被 main 的 z-index:10 限制，底部导航 z-index:40 会盖住任务弹窗。统一 Teleport 至 body，保留焦点管理、滚动锁和关闭行为；小屏留白 16px、宽屏 24px，最大高度使用 85dvh。
3. 360px 页面中日期和时间两列挤压，日期按钮超过列宽覆盖时间输入。小屏改为单列，640px 起恢复双列。
4. Escape / 系统返回关闭日期或下拉菜单后，不再同时关闭外层表单；日历移动侧栏关闭时标记事件已处理。

相关设计遵循 `design-system/MASTER.md`，未增加主题外的颜色或视觉风格。返回事件使用 [Capacitor App 官方 API](https://capacitorjs.com/docs/apis/app)。系统栏/键盘沿用 Capacitor 8 已有实现，未关闭 Android 安全检查或调整系统显示密度。

## 验证结果

- `npm run build` 通过；`npm run test -- --maxWorkers=2`：41 文件 / 241 测试通过。
- `node scripts/verify-desktop-web-polish.mjs` 通过，确认共享弹窗改动未破坏搜索、焦点和滚动。
- `node scripts/verify-ui-redesign.mjs` 通过，包括 55 项响应式检查、8 张风格/主题截图以及主要任务流程。
- `scripts/verify-android-polish.mjs` 8 组真机检查通过：更多菜单返回、真实软键盘与输入保持、日期/下拉逐层返回与保存、日历路由返回、设置分区、加密文本预览、取消系统保存、首页退后台再进入。
- 手机软键盘打开后视口高度由 707px 缩至 449px，弹窗底边约 416px，输入可见；弹窗底部命中元素属于弹窗而非背景导航。
- 今天、日历、设置、资料库的页面 scrollWidth 均为 360px，无页面横向溢出。
- 系统文件选择器实际保存到 Download 后，用 ADB 取回 67 字节合成文本并逐字节校验，SHA-256 为 `33ad7bd9d17f27e7369ad4debeb7f47787b6da266169454af6493955e9f85d4a`。
- 测试中长时间停留在系统保存窗口触发自动锁定，随后保存被中止；重新解锁后保存成功。未为通过测试而禁用锁定。

证据位于 `.visual-qa/android-polish/`：`report.json`、`save-report.json`、`task-keyboard-before.png`、`task-keyboard-after.png`、`today-after.png`、`calendar-after.png`、`settings-after.png`、`document-preview-after.png`。这些图片仅含合成测试数据。调试账户恢复信息保存在被 Git 忽略的 `test-account.json`。

## 构建与复测

独立包通过本机 `.visual-qa/android-polish/qa.init.gradle` 临时设置 debug applicationIdSuffix 和名称，生产配置不变。调试 APK 单独保存于 `.visual-qa/android-polish/personal-hub-mobileqa.apk`，仅此 APK 安装到了手机。

完成独立包后已运行默认 `:app:assembleDebug`，常规产物 `android/app/build/outputs/apk/debug/app-debug.apk` 的 applicationId 已恢复为 `com.zdb.personalhub.debug`，未覆盖安装到手机。

真机脚本仅连接 mobileqa 包，要求使用本轮合成账户，不适用于真实数据账户：

```powershell
$env:PHUB_ANDROID_SERIAL='<测试手机序列号>'
node scripts/verify-android-polish.mjs
```

厂商文件选择器以浮层呈现，WebView 的 visibilityState 不一定改变，因此脚本以原生 Activity 确认保存窗口。应用进入后台时 WebView 的 requestAnimationFrame 会暂停，退后台验证使用原生 Activity，避免轮询页面导致假超时。

本轮未验收正式版覆盖升级、其他手机/平板/横屏、指纹解锁、通知长时间后台送达、真实跨设备同步或 50 MiB 附件；不把本轮结果扩展为这些功能已通过。

## 第二轮：手机 UI 与布局

- 任务编辑和更多导航在小屏改为底部面板。ModalShell 新增可选 `mobileSheet` 与 header/footer 插槽，内容独立滚动，标题、操作栏固定，底部保留系统安全区；其余弹窗继续使用原布局。
- 任务错误提示放在保存栏上方；增加可点击的子任务添加按钮，完成/删除控件支持 44px 触控区域及明确名称，回车确认避开输入法组合输入。
- 更多入口按日常、内容、开发工具分组。个人资料、设置、锁定固定在底部。
- 日历以年月作为手机首行标题，将日期导航与月/周/日切换分开排列，所有工具栏按钮至少 44px。便签和方向入口保留在侧栏。
- 今天页减少重复提示与段落间距。计划页移除过大的固定页头，将新建按钮放在标题右侧，日期切换独占一行，今天/本周切换不再跳动。

验证：`npm run build`、桌面交互回归、完整 UI 回归（55 项响应式检查及主题/任务流程）均通过。新增 `node scripts/verify-mobile-layout.mjs` 覆盖 320/360/390px，检查短视口下保存栏可见、面板操作按钮与日历按钮至少 44px、按钮不重叠、子任务添加、分组导航，并保存亮/暗主题截图。

新版独立 mobileqa 包已更新至同一台 Android 16 手机，8 组真机回归通过。真实键盘打开后视口为约 449px，底栏范围约 380–449px，保存与取消按钮均为 44px；另实际点击日期并确认表单保留。Android 高密度屏存在 0.33 CSS px 的视口取整差异，边界断言采用 1px 容差。常规 debug 构建产物已恢复原包名，未覆盖安装原有账户。

完成态截图位于 `.visual-qa/mobile-layout/phone-more.png`、`phone-calendar.png`、`phone-task.png`、`phone-keyboard.png`。真机截图等待过渡完成后保存，避免将动画中的半透明帧当成最终布局。其他设备、横屏和系统大字体仍未验收。

## 第三轮：设置、收集箱和资料库

设置采用手机底部面板，六个分区单行固定在标题下方；移除嵌套的 62vh 滚动区，内容统一由 ModalShell 滚动。切换分区回到顶部，本次打开期间的表单草稿保留，关闭后清理逻辑维持不变。手机外观子分区隐藏辅助说明，腾出内容空间。

收集箱移除重复标题和引导段落，将输入区与待整理列表分开；专注任务侧栏的灵感口袋保留原说明。资料库手机端上传/批量管理并列，搜索与排序同排，分类独占一行；长文件名显示两行，收藏、预览、下载、编辑、删除及选择按钮至少 44px，并补充排序和选择按钮的无障碍名称。

验证通过：`npm run build`、`scripts/verify-ui-redesign.mjs`、`scripts/verify-settings-performance.mjs`。新增 `scripts/verify-mobile-content.mjs` 验证 320/360/390px 的收集保存、固定设置导航、草稿保持、资料搜索/预览/批量选择、按钮尺寸及无横向溢出。

同一台 PLB110 / Android 16 已安装本轮独立 mobileqa 包。8 组原有真机回归通过；另实测设置滚动与分区切换、收集箱真实软键盘返回保留文字并保存、合成文本加密入库及预览、资料库选择和退出管理。报告和应用截图位于 `.visual-qa/mobile-content/phone-report.json`、`phone-settings.png`、`phone-collect.png`、`phone-docs.png`。资料库和收集箱通过真机 WebView 截图取得，排除其他应用临时通知遮挡；设置采用先前已完成的原生截图，最后刷新该截图时调试接口超时，沿用已经检查的截图。

默认 debug 构建已恢复 `com.zdb.personalhub.debug`，仅 mobileqa APK 安装到手机。其他机型、横屏及系统大字体仍未验收。
