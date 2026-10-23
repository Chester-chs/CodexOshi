# CodexOshi 0.3.10 — keep the input box clear

On Windows, a pinned character and quota bar now move above the input box only when they overlap. Widen the window and they return to the lower-right corner. Multiline input is supported, and unpinning preserves the current position and size.

The bilingual README is shorter, with detailed instructions in separate user guides.

## Downloads

- **CodexOshi-Setup-0.3.10-win-x64.exe** — full Windows x64 installer; includes Node.js 24 and downloads Electron during setup.
- **CodexOshi-Node24-Git-0.3.10.zip** — lightweight installer for users with Node.js 24+, npm and Git; extract and run `Install-CodexOshi.cmd`.
- **SHA256SUMS.txt** — checksums for both packages.

Both installers need an internet connection. Existing users can check for updates in CodexOshi Settings. The EXE is unsigned, so Windows or antivirus software may require a trust review.

Validation: 266 automated tests and Electron UI checks passed; the narrow-window fix was also confirmed on the user's Windows desktop. Input avoidance uses control bounds, not input text. This change is Windows-specific.

## 中文

修复固定后缩小窗口遮挡输入框的问题：只有重叠时，人物和额度条才一起移到输入框上方；窗口变宽、空间足够后回到右下角。支持多行输入，取消固定保持当前位置和大小。

中英文 README 已精简，详细说明移至独立使用指南。

**下载选择**：普通用户选完整 EXE；已有 Node.js 24+、npm 和 Git 的用户选轻量 ZIP，解压后双击 `Install-CodexOshi.cmd`。两个包都需要联网，校验值见 `SHA256SUMS.txt`。已安装用户可在 CodexOshi 设置中检查更新。

266 项自动化测试及 Electron 界面测试通过，用户也已在 Windows 实机确认缩小窗口后不再遮挡。避让只读取控件边界，不读取输入文字。本次避让修复适用于 Windows；EXE 暂未签名，系统或杀毒软件可能要求信任确认。
