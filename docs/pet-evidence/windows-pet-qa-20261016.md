# Windows 桌宠原生验证

## 2026-10-17 工具恢复后的真实窗口检查

### 用户停用输入后的原生交互结果

用户明确回复「已停用」后继续通过 `@oai/sky` 操作，同一个隔离 QA 程序完成以下检查：

- 点击「跳个舞」后出现「一起摇摆一下！」反馈，菜单收起到 280×340；动作结束后反馈清除。此次不据截图断言全程动画流畅度。
- 实际左键拖动角色：工具坐标从 (145,210) 拖向 (65,120)，窗口屏幕原点由 (2110,988) 移到 (1990,853)，对应 150% 缩放的 (-120,-135) 位移；后续快照仍为 (1990,853)，松手后未漂移。
- 开启自主巡游后，窗口原点从 (1985,853) 继续移动到 (1804,853)，角色转向侧面。键盘 Tab/Return 能打开互动菜单，角色按钮有可见焦点环。菜单打开后窗口停止在 (1786,853)，本次菜单向右展开到 472×340。
- 点击「停止自主走动」显示「好啦，我停在这里陪你。」；菜单收起后后续快照仍为 (1786,853)。
- 菜单滚动可以到达下方选项；点击「小憩一下」显示休息反馈，后续快照确认闭眼。点击头部后显示摸头反馈，后续快照确认恢复睁眼。
- 点击「关闭玩偶」后，下一次窗口枚举已无「桌面伙伴」。独立 QA 配置变为 `{"enabled":false,"background":true,"reminders":false,"character":"nailong"}`，未覆盖其他偏好。结束并重启 QA 程序后，仍无桌宠可见窗口，确认关闭偏好持久化有效。

测试结束后，仅结束了核对过可执行路径的本轮 QA 进程。保留独立 QA 配置为关闭状态，未更改正式配置。本轮没有修改产品代码，因此未重复生产构建；使用的是前述已构建且核对哈希的 QA 程序。

仍未原生验收：跨显示器 DPI 动态切换、真实设置页「找回位置」、主窗口与桌宠并发修改偏好、系统锁屏及任务到点提醒。QA 主窗口特意不加载保险库设置页，因此本轮没有为了这些检查进入正式账户。已有模拟 IPC 与单元测试结论保持其原有范围。

重置 node_repl、重新导入 `@oai/sky` 后，`sky.list_windows()` 恢复。使用上一轮 SHA256 为 `47b4a6b8fce2fe42d83a2f18f7ed6d0e00f054be7ea469b5e895ebe79a8e579f` 的隔离 QA 程序。检查确认 QA 的 Roaming/Local 目录原先均不存在；仅新建 Roaming 下 `com.zdb.personalhub.petqa/desktop-pet.json`，设 enabled/background 为 true、reminders 为 false、character 为 nailong。未读取或更改正式账户配置。

通过 Computer Use 启动后，唯一「桌面伙伴」窗口正常展示带贴图奶龙，透明区域可见后方桌面内容。真实点击互动菜单成功：屏幕右侧菜单向左展开，工具返回窗口捕获区域为 x=1822、y=988、472×340。菜单中文字与按钮可识别。

展开后工具一次报告窗口边界变化，重新绑定窗口后恢复观察；随后两次点击均被 `user input was detected in this window; call get_window_state before continuing` 阻止。已请求用户短暂停用鼠标键盘，尚未验证舞蹈、拖动、巡游、复位或跨屏 DPI。隔离 QA 程序保持运行，等待继续操作。此前工具不可用的记录仅描述当时状态，不再代表当前连接状态。

## 隔离配置

新增 `src-tauri/tauri.pet-qa.conf.json`，仅在显式传给 Tauri CLI 时使用。独立应用标识 `com.zdb.personalhub.petqa`，名称 Personal Hub Pet QA，不生成安装包；主窗口只加载桌宠页面且默认隐藏，不加载保险库页面。不修改正式版配置和正式版偏好，不复制用户账户数据。

构建命令：

```powershell
$env:PATH='C:\Program Files\nodejs;C:\Users\ZDB\.cargo\bin;'+$env:PATH
npx tauri build --debug --no-bundle --config src-tauri/tauri.pet-qa.conf.json
```

该构建使用常规 debug 输出位置；这里产出的 exe 是隔离 QA 版本，不能当作正式发布包。普通构建仍需不传 QA 配置重新执行。配置没有自动启用桌宠，运行测试前还需要在独立 QA 数据目录准备测试偏好；本轮没有启动应用或写入 AppData。

## 已确认

`cargo test --manifest-path src-tauri/Cargo.toml --lib pet::tests --locked` 成功，2 passed：旧偏好缺少 character 时保留既有开关并默认奶龙；原生可选角色白名单拒绝样片和未知角色。

前端类型检查与 Vite 构建成功。桌宠权限文件只授予 pet 窗口事件、位置、尺寸、缩放、显示状态与显示器查询权限；本轮没有增加系统权限。

隔离 QA 原生构建随后成功，退出码 0，产物 `src-tauri/target/debug/personal-hub-desktop.exe`，SHA256 `3c1dea174fa90a08ef1ecc74bcd1a02fb55e88a80813fd024f2deeb094a69942`。它证明该时点的代码能完成原生编译，不证明窗口行为，也不包含随后新增的复位边界修复。

## 复位边界增量

原实现固定减去 300×360 逻辑像素，在工作区过小、菜单已展开时可能把窗口放出边界。修正为查询实际窗口尺寸、按目标显示器 DPI 换算，并将偏移钳制在工作区起点以内；坐标加法使用 i64 防溢出。窗口大于工作区时只能保证左上角可见，不宣称整个窗口都能容纳。新增测试覆盖常规尺寸、负坐标显示器、展开菜单、高 DPI、小工作区及溢出边界。尚需真实多屏复位验收。

增量验证：`cargo test --manifest-path src-tauri/Cargo.toml --lib pet::tests --locked` 退出码 0，3 passed；`npm run build` 退出码 0。本轮未重建带该修复的独立 QA exe，前述 exe 哈希仅对应修复前构建。

## 环境限制

Tauri CLI 首次调用 cargo 报拒绝访问。直接 Cargo metadata/version 和 Node 子进程检查成功；显式本机工具路径重试曾遇到 CLI Option unwrap 异常，随后带回溯运行已进入编译。未修改系统 ACL、安全设置或执行权限。

Windows Computer Use 的 node_repl 初始化两次及重置后的尝试均返回 `failed to write kernel assets: 系统找不到指定的路径。 (os error 3)`。按技能恢复路径检查后停止窗口操作，未用自制 UI 自动化绕过。因此尚不能核验真实透明窗口、拖动、巡游、菜单扩展、跨显示器缩放和角色切换；浏览器模拟 IPC 通过不替代这些项目。

## 2026-10-17 当前代码重建

### 交互修复后的补充验证（11:10）

再次运行隔离 QA 构建，退出码 0；前端生产构建通过。产物 `src-tauri/target/debug/personal-hub-desktop.exe`，37,070,336 字节，SHA256 `47b4a6b8fce2fe42d83a2f18f7ed6d0e00f054be7ea469b5e895ebe79a8e579f`。包含配置字段合并、迟到拖动请求丢弃、复位停止巡游及订阅清理修复。它仍是独立 QA 程序，不是正式安装包。

扩展 `scripts/verify-pet-roaming.mjs`，通过 `PHUB_PET_TEST_SCALE` 分别以 1、1.25、1.5 验证实际构建组件配合模拟 Tauri IPC。三组均通过：负坐标显示器右边缘菜单向左展开，连续开关三次后位置与尺寸无漂移，巡游、减少动态效果暂停与恢复、悬停暂停与恢复、找回位置后停止巡游、丢弃松手后才返回的拖动位置请求。无页面脚本错误或未知 IPC。证据目录分别为 `.visual-qa/pet-roaming-1792206647471`、`.visual-qa/pet-roaming-1792206669688`、`.visual-qa/pet-roaming-1792206647468`。

本次 Computer Use 初始化成功，但 `sky.list_windows()` 仍报 `failed to launch codex app-server: 拒绝访问。 (os error 5)`。停止依赖该工具的 Windows 窗口操作，没有启动 QA 程序或写入 AppData，也没有修改执行权限或改用自制 UI 自动化。真实透明窗口、跨屏 DPI 切换、原生拖动和多窗口事件同步仍未验收；静态缩放参数的模拟结果不代表真实跨屏验收。

显式设置上述 Node/Cargo PATH，并设置 `RUST_BACKTRACE=1` 后，隔离 QA 构建退出码 0。未显式设置路径的首次调用在 Tauri CLI `rust.rs:1166` 出现 Option unwrap 异常；未修改 ACL 或系统安全配置。

本次 `npm run build`（版本 1.1.4 / Android 6）通过；仅有既知大分包警告。原生 debug 构建完成，包含复位边界修复及当前前端。产物仍是 `src-tauri/target/debug/personal-hub-desktop.exe`，37,062,656 字节，SHA256 `e5926a558a90551789497f0c58d06156fb9ddcbd72758437a34edc6273d59aee`。这是独立 QA 程序，不是正式安装包。再次执行 Rust 桌宠测试，3 passed / 0 failed。

Windows Computer Use 本次初始化成功，但首个 `sky.list_windows()` 返回 `failed to launch codex app-server: 拒绝访问。 (os error 5)`。依照技能边界停止依赖该工具的窗口操作，不尝试修改执行权限或自制 UI 自动化替代。没有启动 QA 程序，没有写入 AppData；透明窗口、真实拖动、跨屏 DPI、偏好同步等原生行为仍未验收。当前构建成功不改变新增角色的质量状态或可用白名单。
