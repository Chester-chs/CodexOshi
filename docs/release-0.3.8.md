# CodexOshi 0.3.8 — update checks and reliability

- Removed Tibo reset announcements, background timeline requests and announcement notifications. Settings now offer release updates only.
- Kept automatic/manual version checks, update notifications and one-click updates. Account quota reset countdowns and reset-credit data are unchanged.
- Fixed concurrent preference saves and failed-save rollback, empty quota fallback responses, character directory link checks and failed updater temporary-file cleanup.
- Includes experimental macOS support contributed by @dennis940. Native Mac following, permissions, Spaces and fullscreen behavior still require device validation; this release provides Windows x64 installers.

Validation: 253 automated tests passed. A hidden real Electron renderer passed update-only UI, both languages, update progress, failure/retry and restart-state recovery checks with isolated data and synthetic network/notification/update boundaries. The Windows setup payload is checked separately before publication. The installed user widget is not replaced during these checks.

## 中文

- 移除 Tibo 重置公告、后台时间线请求及公告通知，设置页只保留版本更新。
- 保留自动/手动检查更新、更新提醒和一键更新；账户额度重置倒计时、重置卡数据继续保留。
- 修复并发设置保存与失败回退、空配额响应覆盖有效数据、角色目录链接校验和更新失败后的临时文件残留。
- 包含 @dennis940 贡献的实验性 macOS 支持，Mac 原生跟随、权限、Spaces 和全屏仍需真机验证；本次提供 Windows x64 安装包。

验证：253 项自动测试通过；隔离数据、模拟网络/通知/安装边界的真实隐藏 Electron 界面验证通过。发布前另行检查 Windows 安装包内容，本轮不会替换用户已安装的挂件。
