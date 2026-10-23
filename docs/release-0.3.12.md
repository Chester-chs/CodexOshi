# CodexOshi 0.3.12 — keep hover hints inside Codex

Fix Windows quota tooltips appearing over a browser or video when hovering over the widget's usual position. The widget now hides and stops forwarding mouse events when another application is in the foreground. Pending hover is cleared, and normal interaction returns when you switch back to Codex. Owned widget windows and dialogs are recognized as part of Codex.

## Downloads

- **CodexOshi-Setup-0.3.12-win-x64.exe** — full installer with Node.js 24; downloads Electron during setup.
- **CodexOshi-Node24-Git-0.3.12.zip** — lightweight installer for users with Node.js 24+, npm and Git. Extract and run `Install-CodexOshi.cmd`.
- **SHA256SUMS.txt** — checksums for both packages.

Existing users can update in CodexOshi Settings. Both installers require internet access; the EXE remains unsigned.

## 中文

修复在浏览器、B 站等应用中，将鼠标移到挂件原来位置时仍弹出额度提示的问题。切换到其他应用后，挂件会隐藏、停止转发鼠标事件并清除悬停；回到 Codex 后恢复显示和交互。

普通用户选择完整 EXE；已有 Node.js 24+、npm 和 Git 的用户选择轻量 ZIP，解压后双击 `Install-CodexOshi.cmd`。已安装用户可在设置中检查更新。安装需要联网，EXE 暂未签名。
