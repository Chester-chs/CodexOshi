# CodexOshi 0.3.9 — responsive scaling and stable pin controls

- The pin is now next to the settings gear. Click once to toggle; highlighted means pinned.
- Portrait and quota bar shrink together with the Codex window in both pinned and free modes, including bar-only mode.
- Unpinning keeps the current size and coordinates. Consistent rendering prevents the portrait and footer from shifting left when toggling without dragging.
- Pinned placement stays near the lower-right corner, with 24 DIP right and bottom margins. Narrow bars keep the percentage, pin and gear accessible.

## Downloads

- **CodexOshi-Setup-0.3.9-win-x64.exe**: full Windows x64 installer; includes a private Node.js 24 runtime and downloads Electron during installation.
- **CodexOshi-Node24-Git-0.3.9.zip**: smaller installer for users who already have Node.js 24+, npm and Git. Extract and run `Install-CodexOshi.cmd`.
- **SHA256SUMS.txt**: checksums for both downloads.

Existing users can use **CodexOshi Settings → Quota → Check for updates → Update now**. Local characters and settings are preserved.

Validation: 259 automated tests and the real Electron responsive-pin fixture passed, including rectangle/pixel comparisons across pin toggles, four lifecycle recovery scenarios and ten native shape cases. Physical cross-DPI moves and arbitrary model-menu/composer overlap are not covered. Installers remain unsigned.

## 中文

- 图钉移到设置齿轮旁，点一下切换固定，亮起表示固定。
- 固定和自由移动模式下，人物与额度条都会一起随 Codex 窗口缩放，仅显示额度条时也适用。
- 取消固定保留当前大小和坐标；统一绘制对齐方式，未拖动时来回切换不再向左偏移。
- 固定位置靠近窗口右下角，右侧和底部各留 24 DIP；窄额度条仍能使用图钉和齿轮。

**安装包**：完整安装请选 EXE；已有 Node.js 24+、npm 和 Git 的用户可选轻量 ZIP，解压后双击 `Install-CodexOshi.cmd`。两个包均需要网络，校验值见 `SHA256SUMS.txt`。

已安装用户可在 **CodexOshi 设置 → 额度管理 → 检查更新 → 一键更新** 中升级，保留本机角色与设置。

验证：259 项自动测试、真实 Electron 切换前后位置/像素对比、4 种生命周期恢复场景及 10 项原生窗口形状检查通过。跨不同 DPI 实体显示器及任意展开菜单/输入框的遮挡情况尚未验证。安装包仍未签名。
