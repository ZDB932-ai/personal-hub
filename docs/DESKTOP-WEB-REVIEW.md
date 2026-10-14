# 桌面与网页体验检查（2026-10-14）

本轮以 1.1.3 工作区为基线，检查共享应用外壳、导航、全局搜索、通用弹窗、路由和 Windows 适配代码。保留现有设计系统与本地加密账户架构。

## 已落实

- 全局搜索支持上下方向键循环选择、选中高亮、结果数量及当前项提示、回车打开选中项。中文输入法组合输入期间不触发打开，长按快捷键不反复开关搜索。
- 搜索打开后保持输入焦点；通用弹窗不再抢走已经进入内部控件的焦点。Tab 从容器或外部焦点进入时回到弹窗内部，关闭时恢复入口焦点且不滚动页面。
- 弹窗打开时禁止根页面滚动，内部滚动到边缘不会继续带动背景；多个弹窗通过计数共享滚动锁，关闭或卸载后恢复原有 overflow。
- 锁定时清除设置、个人资料弹窗的打开状态，重新解锁不自动重新打开上次弹窗。
- 不存在的路由返回首页，避免只有导航、没有内容的空白工作区。

## 验证

- Node 24.19.0 下生产构建通过。
- `npm run test -- --maxWorkers=2`：39 个文件、234 项测试通过。初次使用环境默认 Node 26 且并行构建时出现两项失败（下载测试超时、HTTP 测试连接重置）；复核同时改用了项目要求的 Node 24 和较低并发，不能单独归因于 Node 版本。
- `node scripts/verify-desktop-web-polish.mjs`：独立合成账户验证搜索聚焦、方向键、IME、弹窗间切换、滚动恢复、焦点返回、未知路由，以及 768/1024/1280/1440px 首页无横向溢出。截图保存在 `.visual-qa/desktop-web-polish/`。
- 启动 4183 端口的本地生产预览后，`npm run test:ui` 五组现有回归全部通过，覆盖账户恢复、收集与搜索、任务、宠物预览、55 项响应式检查、主题与壁纸、密码显隐和锁定重载。首次未启动预览服务导致连接被拒，启动后完成复核。
- 本轮没有构建或实机运行 Windows 安装包。共享 Vue 层的浏览器验收不能替代托盘、通知、多屏 DPI 与安装升级验收。

## 后续优先级

以下记录首轮发现，第二、三轮已完成外链失败反馈、浏览器历史位置恢复、设置分区按需加载，以及 Windows 单实例和窗口布局恢复。通知点击定位与大型业务视图拆分仍属于后续候选。

1. Windows 原生可靠性：`openExternalUrl` 当前吞掉 opener 错误，用户可能只感到点击无响应；应在统一调用契约中增加失败反馈。通知点击定位尚未实现，应结合原生事件和锁定状态设计，再做真实 Windows 验收。
2. 导航恢复：路由目前统一回到顶部。应区分页面跳转、列表内部筛选与历史返回，验证列表上下文恢复，同时兼顾日历内部滚动容器。
3. 启动性能：应用外壳同步引入设置及各设置分区；可先记录冷启动网络与耗时，再将低频分区按需加载。已有文档预览与三维资源分包，构建中三维分包仍约 634 kB；分包大小警告本身不等于首屏加载缺陷。
4. 维护性：TodayView、AiView 仍集中承担多种交互状态；在下一次对应业务改动前按排期、撤销、会话连接等职责拆出 composable，避免一次性大规模重写。

这些是后续候选工作，不代表本轮已实现或已完成原生验收。

## 第二轮：成熟产品实践与落地

参考资料与选择：

- [Linear Search](https://linear.app/docs/search)：学习跨内容搜索与键盘操作的一致性；项目已具备全局搜索，本轮保留上一轮的方向键交互，避免再增加重复入口。
- [GitHub Primer Navigation](https://primerstyle.azurewebsites.net/product/ui-patterns/navigation/)：借鉴跳过重复导航直达正文的模式。新增键盘聚焦时显示的「跳到主要内容」，移动实际焦点；阻止默认锚点修改 hash 路由。
- [Vue Performance](https://vuejs.org/guide/best-practices/performance) 与 [Async Components](https://vuejs.org/guide/components/async)：将低频设置分区拆为按需加载模块。保留设置外壳立即响应；加载超过 200ms 才显示提示，避免闪烁。
- [Tauri Opener](https://v2.tauri.app/plugin/opener/)：沿用官方系统浏览器接口，将失败交给调用方展示，修复点击外链无反馈的路径。

实现细节：外观、安全、备份、同步、关于、玩偶按第一次访问加载；同一次设置会话保留各分区草稿，关闭后卸载并清理。玩偶在切走分区时卸载，避免后台继续渲染。没有改变业务数据格式与同步协议。

故障注入发现浏览器会缓存失败的动态模块请求，普通重复 import 无法恢复。错误面板提供「重新加载应用」并通过现有确认接口提醒未保存编辑和重新解锁；取消会保留草稿，确认后重新加载。不会在资源失败时自动刷新。

外链失败提示延长到 5 秒；所有错误 toast 标记为 alert，成功反馈标记为 status，便于辅助技术感知。

构建比较：App 分包从 124.31 kB / gzip 41.78 kB 降至 57.21 kB / gzip 20.61 kB。此值仅指 App 分包，不是全部首屏字节数，也不代表加载时间减半。浏览器请求断言确认首页不会提前请求六个设置分区，外观打开时不会加载同步分区。

新增验证脚本 `scripts/verify-settings-performance.mjs` 已通过：请求时机、跳转正文、草稿切换保留与关闭清理、分包失败提示、取消刷新保留草稿、确认刷新后解锁恢复、同步入口直达。故障截图位于 `.visual-qa/settings-performance/`。生产构建通过；新增 opener 分支测试后共 40 个文件、236 项测试通过。原生 opener 失败使用替身测试，仍不等同 Windows 实机验收。

## 续做：浏览器历史位置恢复

按 [Vue Router 的滚动恢复与过渡衔接建议](https://router.vuejs.org/guide/advanced/scroll-behavior) 调整路由：前进/后退优先恢复历史位置，普通跨页进入顶部，同页 query 更新保留位置。等待 Vue 过渡结束后再恢复；锁定或卸载时释放等待，已经过期的导航不执行滚动。日历内部时间轴继续由日历管理，不宣称恢复其内部滚动位置。

`scripts/verify-navigation-history.mjs` 用 28 条合成任务构造真实长列表，验证往返位置、同页参数变化、从日历返回、减少动画与普通动画、锁定期间历史导航。已通过。最终 App 分包约 57.38 kB / gzip 20.68 kB，仍比本轮开始前缩小约 54% / 51%。

最终复核：Node 24 下生产构建、40 个测试文件共 236 项测试、三个新增交互脚本，以及 `npm run test:ui` 的五组现有回归全部通过，包括 55 项响应式检查和八组主题截图。所有浏览器验证使用独立合成账户；未生成新版 Windows 安装包。

## 第三轮：Windows 启动与窗口生命周期

参考 [Joplin 的实例协调设计](https://joplinapp.org/de/help/dev/spec/multiple_instances/) 和 [VS Code 的窗口复用与恢复行为](https://code.visualstudio.com/docs/editing/getting-started/userinterface)。Joplin 允许独立配置的第二实例；本项目没有这样的多账户隔离界面，因此同一个应用标识只运行一个主实例，重复启动唤回既有窗口，避免重复进程各自保留一份业务内存。

采用 [Tauri Single Instance](https://v2.tauri.app/plugin/single-instance/) 和 [Window State](https://v2.tauri.app/plugin/window-state/) 官方插件。Cargo.lock 新增 single-instance 2.4.5、window-state 2.4.1，未批量升级既有依赖。单实例插件最先注册，复用既有主窗口唤回逻辑；状态插件只管理 main，保存大小、位置、最大化状态。关闭到托盘前落盘；不持久化隐藏、最小化或全屏状态。玩偶继续沿用独立逻辑。

「设置 → 关于」补充桌面驻留/退出说明和全局搜索快捷键。没有改变解锁、自动锁定、业务密文或同步协议。

新增 `scripts/verify-desktop-lifecycle.mjs`：先以唯一 QA 应用标识编译 release 测试程序，使用独立 WebView2 数据目录和独立原生配置目录；额外窗口控制权限仅在临时 QA 配置中，生产 capability 文件不变。执行前先运行 `npm run build`。脚本结束后应运行默认 `npm run desktop:build` 重新生成正常应用标识的产物。仅需修复测试脚本并复验已有 QA 程序时，可将 `PHUB_DESKTOP_QA_RUN` 设置为对应目录的 13 位时间戳；修改 Rust 代码后必须重新构建。

本次真实 Windows / WebView2 验收 10 项通过：关闭到托盘、重复启动唤回同一进程、玩偶排除、最小化唤回、尺寸位置恢复、启动可见、最大化恢复、还原普通尺寸、离屏配置回退、损坏配置回退。报告 `.visual-qa/desktop-lifecycle-1791979815015/report.json`，测试过程中页面异常为零。没有操作个人保险库。

边界：离屏场景通过修改独立 QA 窗口配置模拟；未做实体多显示器插拔、跨 DPI 长时间使用、安装器覆盖升级与 Windows 通知点击验收。此次为本地开发候选，版本仍为 1.1.3，不是已发布的新版本。

原生验收结束后已再次使用默认配置执行 `npm run desktop:build` 成功，生成 `src-tauri/target/release/personal-hub-desktop.exe` 与 `src-tauri/target/release/bundle/nsis/Personal Hub_1.1.3_x64-setup.exe`。生产配置仍为 `com.zdb.personalhub`，未扩展 capability。产物哈希及测试标识初筛记录在同一报告目录的 `production-artifacts.json`。未运行安装器覆盖当前安装，也未发布或推送仓库。
