# CodexOshi 0.3.11 — reliable Windows monitor startup

Fix a startup path that could leave the widget missing after Codex restarted. When the Windows startup task is enabled, manual starts and update restarts now run through Task Scheduler instead of creating a process owned by the calling app. Update handoff is supported while the existing launcher mutex prevents duplicate monitors.

Explicit startup opt-outs and disabled startup tasks remain unchanged. This fix applies to Windows.

## Downloads

- **CodexOshi-Setup-0.3.11-win-x64.exe** — full installer with Node.js 24; downloads Electron during setup.
- **CodexOshi-Node24-Git-0.3.11.zip** — lightweight installer for users with Node.js 24+, npm and Git. Extract and run `Install-CodexOshi.cmd`.
- **SHA256SUMS.txt** — checksums for both packages.

Both installers require internet access. Existing users can update through CodexOshi Settings. The EXE remains unsigned.

## 中文

修复 Codex 重启后挂件可能不再出现的启动问题。启用了 Windows 启动任务时，手动启动和更新重启都会交给任务计划程序，避免后台进程依附于调用它的应用。支持更新过程中的新旧进程交接，并继续防止重复启动挂件。

用户明确关闭自启动或禁用启动任务的设置保持不变。本次修复适用于 Windows。

普通用户选完整 EXE；已有 Node.js 24+、npm 和 Git 的用户选轻量 ZIP，解压后双击 `Install-CodexOshi.cmd`。已安装用户可在设置中检查更新。安装需要联网，EXE 暂未签名。
