# Personal Hub 1.1.4 预览版

发布日期：2026-10-14。基于 v1.1.3，集中完善 Windows、网页与手机端交互，业务数据格式与同步协议保持兼容。

## 本版变化

- Windows：重复启动唤回已有主窗口；恢复窗口大小、位置与最大化状态；关闭到托盘时保存布局，桌宠窗口单独管理。
- Web/桌面：全局搜索的键盘操作、弹窗焦点与滚动、浏览器前进后退位置恢复、未知路由回退、外链失败反馈。
- 设置：按需加载分区，本次打开期间保留表单草稿，关闭后清理；分包失败时提示重新加载及草稿影响。
- Android：系统返回逐层处理选择器、弹窗和路由；任务表单与更多导航采用底部面板；保存栏在软键盘弹出时保持可见。
- 手机布局：日历工具栏分行、设置分区固定、收集箱简化、资料库搜索与排序同排、长文件名和触控尺寸改善。
- 文档：README 按用途、下载、入门、功能、数据边界、开发的顺序重写，包含演示账户截图。组织方式参考 [Joplin](https://github.com/laurent22/joplin) 与 [AFFiNE](https://github.com/toeverything/AFFiNE) 的项目首页。

## 下载与更新

[GitHub Release v1.1.4](https://github.com/ZDB932-ai/personal-hub/releases/tag/v1.1.4)。仓库为私有仓库，需要访问权限。

| 文件 | 用途 |
| --- | --- |
| Personal-Hub_1.1.4_windows-x64-setup.exe | Windows x64 安装程序 |
| Personal-Hub_1.1.4_android.apk | Android 正式签名包 |
| Personal-Hub_1.1.4_android-test.apk | Android 独立测试版 |
| Personal-Hub_1.1.4_web.zip | Web 静态文件 |
| RELEASE-NOTES.md | 本版说明 |
| SHA256SUMS.txt | 上述文件校验值 |

更新前导出 `.phub` 加密备份。Android 正式包标识为 `com.zdb.personalhub`，versionCode 6，versionName 1.1.4；测试版标识为 `com.zdb.personalhub.debug`，versionName 1.1.4-debug。两者数据独立，不要卸载后再安装来进行更新。

正式 APK 已通过 apksigner 验证，签名证书 SHA-256 与 GitHub v1.1.3 正式包一致：

```text
4f318ada0e55d55297d2cd16b89c69818f47e5175b9edf54da62d9b1eb058e22
```

Windows 安装包尚无代码签名。Web 请部署到 HTTPS 根目录或 localhost，通过服务器访问，不能直接双击 index.html。

## 验证范围

- Node.js 24 下生产构建、同步服务类型检查、资源清单检查通过；单元测试 41 个文件、241 项通过。
- 核心 UI 五组脚本覆盖收集、搜索、任务历史恢复、正文索引、每日容量、本地账户恢复、桌宠预览与响应式页面。
- 专项回归覆盖 320/360/390px 手机布局、短视口保存按钮、设置固定导航与草稿、资料库预览和批量选择、桌面搜索与焦点、设置加载失败恢复、浏览器历史滚动。
- Windows NSIS、Android debug/release 均成功构建；APK 包名、版本与正式签名已检查。
- 本次 UI/Rust 改动在升版本前已完成 Windows 隔离身份程序的 10 项生命周期验证，以及 Android 16 独立 mobileqa 包的真机验证，详见下方专题记录。
- 1.1.4 额外原生复验曾因执行会话中断而未完成；恢复工作时手机已离线。本发布不将该次复验计为通过，也未用正式安装包覆盖个人账户。

验证脚本使用合成数据。README 截图来自 1.1.4 构建，不含个人保险库数据。详细记录见 [桌面与网页检查](DESKTOP-WEB-REVIEW.md)、[Android 真机打磨](ANDROID-POLISH.md)。

## 已知限制

- 尚未完成正式安装包覆盖升级、多显示器跨 DPI、Android 多机型/横屏/大字体、后台长期提醒和真实跨设备同步的完整验收。
- Windows/Web 提醒依赖应用运行且解锁；通知点击跳转尚未实现。Android 提醒受系统权限与省电策略影响。
- 恢复配置只属于本机，不随普通备份、设备加入或云同步迁移；恢复密钥不能代替备份。
- 文本/PDF 正文索引限当前会话；附件同步暂不自动回收服务端历史分块。
- 构建存在模型分包体积提示与 Gradle 9 兼容性弃用提示，不影响本次产物生成。
- 第三方素材许可边界继续遵循 [第三方声明](../THIRD_PARTY_NOTICES.md)，项目代码的 MIT 许可不覆盖第三方角色权利。
