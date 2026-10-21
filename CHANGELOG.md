# CodexOshi changelog / 更新记录

This page records published CodexOshi versions. The project was called Codi through 0.3.3. For downloads and installation, use the linked GitHub releases.

这里记录已正式发布的 CodexOshi 版本；0.3.3 及以前的名称为 Codi。下载和安装请使用对应的 GitHub 发布页。

## [0.3.8](https://github.com/Chester-chs/CodexOshi/releases/tag/v0.3.8) — 2026-10-21

- Remove Tibo reset announcements, their background requests and notifications. Keep release checks, update notifications and one-click updates.
- Preserve account quota reset countdowns and reset-credit data.
- Serialize preference saves, roll back failed setting changes, retain useful quota when a response has no data, and clean failed update writes.
- Recheck character storage links before access. Include experimental macOS support contributed by @dennis940; Mac behavior still needs device validation.
- 移除 Tibo 重置公告及其后台请求和通知，保留版本检查、更新提醒及一键更新；账户额度倒计时和重置卡数据继续保留。
- 修复并发设置保存、失败回退、空配额响应覆盖有效数据、更新临时文件残留及角色目录链接边界。
- 包含 @dennis940 贡献的实验性 macOS 支持，仍需 Mac 真机验证。

## [0.3.7](https://github.com/Chester-chs/CodexOshi/releases/tag/v0.3.7) — 2026-10-14

- Reconcile actual window visibility so an unexpected native hide does not leave the widget invisible.
- Recover short heartbeat interruptions without replacing Electron, and give cold startup its own handshake budget.
- Retry a failed native follower on the same Codex window, with a bounded retry rate.
- Compile and cache the native window component during install/update; older updaters create the cache on first launch. Show the widget before starting quota reads and token scans.
- Keep a bounded local lifecycle log for diagnosing future startup or visibility issues.
- 检查窗口的实际可见状态，意外隐藏后能自动恢复。
- 短暂心跳停顿后复用原 Electron 进程恢复；冷启动有独立握手等待时间。
- 同一个 Codex 窗口的原生跟随线程失效后，也会限速重试挂接。
- 安装和更新时缓存原生窗口组件；旧版更新器升级后首次启动会补建缓存。优先显示挂件，再读取额度和扫描 token。
- 新增有大小上限的本机生命周期日志，便于追查后续启动或隐藏问题。

## [0.3.6](https://github.com/Chester-chs/CodexOshi/releases/tag/v0.3.6) — 2026-10-12

- Recover the Codex bridge after broken-pipe writes or cleanup, instead of letting the supervisor exit.
- Retry the Windows background task after a crash, and keep it eligible while the laptop runs on battery power.
- Require the bridge recovery helper in update packages so an incomplete download cannot replace a working installation.
- 修复桥接管道写入或清理时断线导致监控进程退出的问题，并自动重连。
- 后台任务崩溃后自动重试；笔记本使用电池时仍允许挂件运行。
- 更新包必须包含桥接恢复文件，避免不完整的下载替换正常安装。

## [0.3.5](https://github.com/Chester-chs/CodexOshi/releases/tag/v0.3.5) — 2026-10-11

- Settings keyboard mode now turns on automatically whenever the card opens, and the bilingual README lists its shortcuts.
- 每次打开设置卡片都会自动开启键盘操作；中英文 README 已列明快捷键。
- Made both language choices equal-width, visibly filled segments.
- 语言切换的两格固定等宽并分别填色，避免选中态看起来宽窄不一。
- Old local test settings containing the withdrawn voice option continue to load without resetting other preferences.
- 旧本机测试设置如含已撤回的朗读字段，仍可正常加载，不会重置其他偏好。

## [0.3.4](https://github.com/Chester-chs/CodexOshi/releases/tag/v0.3.4) — 2026-10-11

- Renamed the app and repository to **CodexOshi**, reflecting a favorite anime or game character beside Codex.
- Updated the visible switch, settings, update source, install packages, and bilingual documentation.
- Kept the existing plugin ID and local data directories so characters and settings survive the rename.

**中文**

- 应用与仓库更名为 **CodexOshi**，表达「喜欢的角色陪你使用 Codex」。
- 更新可见开关、设置页、更新来源、安装包与中英文说明。
- 保留原插件 ID 和本机数据目录；已上传角色与设置不会因改名丢失。

## [0.3.3](https://github.com/Chester-chs/CodexOshi/releases/tag/v0.3.3) — 2026-10-11

- When the direct quota request fails, a newer successful Codex read now replaces an older local snapshot.
- Update checks and downloads now use the latest published GitHub release instead of unreleased changes on `main`.
- Tibo timeline failures no longer leave announcements older than seven days visible in settings.

**中文**

- 在线额度读取失败时，较新的 Codex 只读额度会替换旧的本地快照。
- 检查和下载更新改为使用最新正式发布版本，不再使用 `main` 上尚未发布的改动。
- Tibo 公开时间线暂不可用时，设置页不再显示超过七天的旧公告。

## [0.3.2](https://github.com/Chester-chs/CodexOshi/releases/tag/v0.3.2) — 2026-10-11

- Added a saved **Show quota bar only** option for narrow Codex windows; the gear remains available and the portrait returns when switched off.
- Marked stale quota readings directly on the resident bar while retaining the last known percentage.
- Added an explicit keyboard mode in Codi Settings. Click the keyboard icon, use Tab and arrow keys to navigate, and press Escape to close the card.
- Corrected the native focus, pinned-position, and minimize/restore probes so they evaluate the actual pinned behavior and preserve a maximized host window.

**中文**

- 新增可保存的「仅显示额度条」选项，缩窄 Codex 窗口时可暂时收起人物，齿轮仍可使用；关闭选项后恢复立绘。
- 常驻额度条直接标出过期数据，同时保留最后一次读到的百分比。
- Codi 设置新增键盘操作模式：点击键盘图标后可用 Tab、方向键操作，按 Esc 收起卡片。
- 修正实机探针，使其按固定模式的实际行为检查拖动与位置，并在最小化复测后恢复原来的最大化状态。

## [0.3.1](https://github.com/Chester-chs/CodexOshi/releases/tag/v0.3.1) — 2026-10-11

- Refined the compact quota bar with softer rounded corners and spacing guided by the golden ratio.
- Replaced the settings gear with a crisp vector icon and kept its button clickable when the Codex window shrinks.
- Refreshed the README screenshots. The READMEs now credit GPT for the demo chibi and explain that users can upload favorite anime or game characters.

**中文**

- 优化额度进度条的圆角、间距和整体比例，参考黄金比例调整视觉效果。
- 将设置齿轮换成清晰的矢量图标，并确保缩小 Codex 窗口时仍可点击。
- 更新 README 截图，注明示例 Q 版人物由 GPT 生成，并说明可上传喜欢的动漫或游戏角色。

## [0.3.0](https://github.com/Chester-chs/CodexOshi/releases/tag/v0.3.0) — 2026-10-11

- Published the first Windows x64 installer. It bundles a private Node.js 24 runtime and downloads Electron during setup; users do not need to install Git or Node.js separately.
- Released quota and reset countdown, 24-hour / 7-day / 30-day token charts, character and dialogue controls, click sounds, seven themes and custom colors, a visible on/off switch, Tibo announcement checks, and one-click updates together.
- Added bilingual installation instructions and interface screenshots.

**中文**

- 首次提供 Windows x64 安装包，自带独立 Node.js 24，安装时下载 Electron；普通用户无需单独安装 Git 或 Node.js。
- 汇总发布额度和重置倒计时、24 小时／7 天／30 天 token 图表、角色与对话设置、点击音效、七套主题与自定义配色、可见开关、Tibo 公告检查和一键更新。
- 加入中英文安装步骤与界面截图。
