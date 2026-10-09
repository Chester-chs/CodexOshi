# 阶段 1 验收记录

日期：2026-10-09。Windows x64；Codex Desktop 26.1007.2314.0；CLI 0.162.0-alpha.17.2；Electron 44.3.0；Node.js 24.19.0；Windows PowerShell 5.1。

**窗口骨架已实现，本机 150% 下已验证。阶段 1 尚不能宣称六项全部通过：跨 DPI 切换缺少实机环境，重启 Codex 后的新聊天 MCP 加载也待确认。没有进入阶段 2。**

| 条件 | 当前证据 | 结论 |
|---|---|---|
| 1. 安装与自动跟随 | 实际运行安装脚本；CLI `plugin add` 返回安装路径，`plugin list` 显示 installed/enabled。C# owner 为当前 Codex HWND，WinEvent 跟随启用；用户确认移动跟随正常。首次完整重开 Codex、新建聊天尚未进行。 | 窗口与 CLI 安装已验证；重启后的 MCP 加载待确认 |
| 2. 无托盘、任务栏 | 无 Tray 对象；BrowserWindow 设置 skipTaskbar、toolbar、focusable:false，原生扩展样式包含 TOOLWINDOW、没有 APPWINDOW，且 owner 是 Codex。无独立挂件任务栏窗口。 | 通过 |
| 3. 移动、最小化/还原、DPI | 用户明确确认移动、最小化消失和还原出现正常。诊断记录 DPI=144，即 150%；100%/150%/200% 的物理尺寸→DIP 单元测试通过。用户确认只有 150% 显示环境。 | 生命周期通过；跨 DPI 切换未实测 |
| 4. 首次点击、拖动、不抢焦点 | `toolbar` 单独使用，真实自动化点击使计数从 0→1，但 Win32 前台变成挂件，故失败。改为 focusable:false 后，用户真实鼠标确认首次点击显示计数且保留 Codex 焦点，并确认拖动正常。诊断记录点击 7 次、角色已移至右下角、focused:false。 | 当前版本通过用户实测；未引入原生适配 |
| 5. 宿主输入穿透 | 用户确认角色区域外能点击输入框、滚动聊天和选择文字。窗口区域只裁剪到角色，右侧/底侧保留 24 DIP。自动化的目标保护拒绝无任务栏挂件点击，拒绝结果不计成功证据。 | 通过用户实测；不把有限采样等同于全部像素穷举 |
| 6. 异常形状 1×1 | Node 测试覆盖空、非法、负尺寸、非整数、坐标超限、65 个矩形、越界及整窗形状；全部输出 1×1 DIP。真实隐藏 Electron 窗口顺序应用五类异常输入后，Win32 GetWindowRgn 返回简单矩形；150% 下是 2×2 物理像素，即 1×1 DIP，未恢复全窗。 | 通过 |

## 实际落盘位置

安装命令返回后，已在文件系统核验 `.codex-plugin/plugin.json` 存在：

`C:\Users\Chester\.codex\plugins\cache\personal\codex-quota-widget\0.1.0`

Electron 运行时已下载并运行：

`C:\Users\Chester\.codex\codex-quota-widget\desktop-runtime\node_modules\electron\dist\electron.exe`

本插件配置、窗口诊断、位置、编译产物及 npm/Chromium 缓存位于：

`C:\Users\Chester\.codex\codex-quota-widget`

上述位置均不在源码仓库内。未读取 `auth.json`，未复制用户图片或音频。插件运行时没有额度、会话或模型调用实现。

## 新问题与处理

- 本机证明 `toolbar` 单独不能保证不激活，采用纯 Electron `focusable:false` 后由用户真实鼠标验收。没有 MSVC、C++ 模块或跨线程子类化。
- Electron 在 Windows 下的 stdin 生命周期不适合这条启动链，窗口状态改用本地随机命名管道及随机认证令牌；令牌只落用户数据目录，MCP 不返回它。
- 停止后立即重启会遇到 launcher 单例尚未释放，停止脚本现在等待自身 launcher 退出。
- 已运行的 Electron 会锁住 DLL，安装更新现在先停止自身监督进程，再执行锁定依赖安装。
- 状态读取增加诊断新鲜度判定，避免退出后残留文件显示“正在运行”。

## 重现

在源码目录运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\verify.ps1 -Native`，随后按 README 进行真实窗口验收。原生形状测试窗口隐藏，不附着宿主，不注入输入。测试与安装不启动任何 Codex agent 回合。

自动化验证包含 9 项 Node 测试、JS 语法检查、PowerShell 解析检查、Windows 自带 C# 编译，以及真实 stdio MCP 初始化/工具枚举/本地状态调用。真实 stdio 测试仅启动自己的 Node 服务，不启动 Codex。插件缓存与 30 个源码文件逐一 SHA256 比对一致。

默认安装已注册当前用户登录任务 `Codex Quota Widget`。停止挂件后从该任务实际启动成功，任务状态为 Running；launcher 记录 WinExe、consoleAttached:false、createNoWindow:true、killChildrenOnExit:true。随后窗口诊断为 attached:true、visible:true、focused:false、dpi:144。验证了任务入口能启动与跟随；没有为了测试登录触发而注销用户。

本地复核确认：初始窗口在显示前设为 1×1 形状；所有生产形状经过同一校验函数；窗口显示用 showInactive，不调用 focus；C# 移动使用 NOACTIVATE 且不改变尺寸；监督进程死亡时 launcher Job Object 清理自身子进程；数据读取策略在阶段 1 对所有源拒绝。不存在托盘对象、模型请求或 Codex agent 子进程调用。

待拥有不同缩放环境后，完成跨 DPI 移动/缩放验收。待当前聊天结束后完全退出并重开 Codex、新建聊天，检查插件状态工具是否加载。以上通过前不推进阶段 2。

远端建议：`Chester-chs/codex-quota-widget`，private。未创建远端，未推送；创建远端与每次 push 均须用户明确确认。
