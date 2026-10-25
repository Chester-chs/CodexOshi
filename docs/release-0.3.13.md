# CodexOshi 0.3.13 — show the complete quota percentage

Fix `100%` being clipped to `10…` in the quota bar. The percentage now reserves enough room for three digits and the percent sign, while the progress track gives up space first. Portrait and footer dimensions stay unchanged, and the pin/settings buttons remain within the bar.

## Downloads

- **CodexOshi-Setup-0.3.13-win-x64.exe** — full installer with Node.js 24; downloads Electron during setup.
- **CodexOshi-Node24-Git-0.3.13.zip** — lightweight installer for users with Node.js 24+, npm and Git. Extract and run `Install-CodexOshi.cmd`.
- **SHA256SUMS.txt** — checksums for both packages.

Existing users can update in CodexOshi Settings. Both installers require internet access; the EXE remains unsigned.

## 中文

修复额度达到 `100%` 时显示成 `10…` 的问题。为三位数字和百分号保留完整宽度，让进度条优先让出空间；人物和额度条整体尺寸保持不变，固定、设置按钮仍正常显示。

普通用户选择完整 EXE；已有 Node.js 24+、npm 和 Git 的用户选择轻量 ZIP，解压后双击 `Install-CodexOshi.cmd`。已安装用户可在设置中检查更新。安装需要联网，EXE 暂未签名。
