# CodexOshi changelog / 更新记录

This page records published CodexOshi versions. The project was called Codi through 0.3.3. For downloads and installation, use the linked GitHub releases.

这里记录已正式发布的 CodexOshi 版本；0.3.3 及以前的名称为 Codi。下载和安装请使用对应的 GitHub 发布页。

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
