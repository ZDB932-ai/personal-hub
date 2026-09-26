# 贡献说明

请先阅读 README 与 AGENTS.md。界面使用中文并遵循 `design-system/MASTER.md`；优先复用现有组件与语义颜色。

使用 Node 24，运行 `npm ci`。提交前执行 `npm run test -- --maxWorkers=2`、`npm run sync:typecheck`、`npm run build`；涉及界面时运行 README 中的 `npm run test:ui`，涉及原生行为时补充对应平台验收结果。

用合成数据测试，不清理或覆盖个人保险库。修改加密、迁移、备份和存储时，须验证失败恢复与旧格式兼容。不要将历史验证当作新改动的验证。

不要提交个人配置、令牌、签名材料、QA 文件、编译产物或日志。美术工作文件在本机保留并独立备份，运行资源在 public 中。许可未明确的素材不要作为新的公开资源加入。

版本以 package.json 为源，更新后运行 `npm run version:sync`。PR 描述说明问题、用户可见变化、验证结果及尚未覆盖的边界。
