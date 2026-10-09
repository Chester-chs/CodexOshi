# 阶段 1 验收记录

日期：2026-10-09。Windows x64；Codex Desktop 26.1007.2314.0；CLI 0.162.0-alpha.17.2；Electron 44.3.0；Node.js 24.19.0；Windows PowerShell 5.1。

**2026-10-09 缺陷复核：撤回门槛 4 的“通过”结论。当前配置不接收点击/拖动；去掉 focusable:false 后输入恢复，但抢宿主焦点。门槛 4 未通过，实验配置已还原、挂件已停止，等待架构方向决定。跨 DPI 切换与重启后 MCP 加载也仍待验收。没有进入阶段 2。**

| 条件 | 当前证据 | 结论 |
|---|---|---|
| 1. 安装与自动跟随 | 实际运行安装脚本；CLI `plugin add` 返回安装路径，`plugin list` 显示 installed/enabled。C# owner 为当前 Codex HWND，WinEvent 跟随启用；用户确认移动跟随正常。首次完整重开 Codex、新建聊天尚未进行。 | 窗口与 CLI 安装已验证；重启后的 MCP 加载待确认 |
| 2. 无托盘、任务栏 | 无 Tray 对象；BrowserWindow 设置 skipTaskbar、toolbar、focusable:false，原生扩展样式包含 TOOLWINDOW、没有 APPWINDOW，且 owner 是 Codex。无独立挂件任务栏窗口。 | 通过 |
| 3. 移动、最小化/还原、DPI | 用户明确确认移动、最小化消失和还原出现正常。诊断记录 DPI=144，即 150%；100%/150%/200% 的物理尺寸→DIP 单元测试通过。用户确认只有 150% 显示环境。 | 生命周期通过；跨 DPI 切换未实测 |
| 4. 首次点击、拖动、不抢焦点 | 新增 Win32 SendInput 回归探针推翻此前通过记录：focusable:false 时 clicks 0→0、位置不变、WM_MOUSEACTIVATE=4；仅去掉此参数后 clicks 0→1、拖动持久化成功，但前台由 Codex 328082 变成挂件 5375684。此前点击 7 次等旧记录不足以证明当前配置同时满足条件。 | **不通过，缺陷尚未修复**；未引入原生适配 |
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

- 本机证明 `toolbar` 单独不能保证不激活；此前认为 `focusable:false` 可同时保留鼠标交互的结论，现已被 Win32 对照实验推翻。没有 MSVC、C++ 模块或跨线程子类化。
- Electron 在 Windows 下的 stdin 生命周期不适合这条启动链，窗口状态改用本地随机命名管道及随机认证令牌；令牌只落用户数据目录，MCP 不返回它。
- 停止后立即重启会遇到 launcher 单例尚未释放，停止脚本现在等待自身 launcher 退出。
- 已运行的 Electron 会锁住 DLL，安装更新现在先停止自身监督进程，再执行锁定依赖安装。
- 状态读取增加诊断新鲜度判定，避免退出后残留文件显示“正在运行”。

## 重现

在源码目录运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\verify.ps1 -Native`，随后按 README 进行真实窗口验收。原生形状测试窗口隐藏，不附着宿主，不注入输入。测试与安装不启动任何 Codex agent 回合。

此前自动化验证包含 9 项 Node 测试、JS 语法检查、PowerShell 解析检查、Windows 自带 C# 编译，以及真实 stdio MCP 初始化/工具枚举/本地状态调用。真实 stdio 测试仅启动自己的 Node 服务，不启动 Codex。此前插件缓存与 30 个源码文件逐一 SHA256 比对一致。**这些检查不覆盖真实 Windows 指针投递；不能用它们替代本次失败的交互回归。**

默认安装已注册当前用户登录任务 `Codex Quota Widget`。停止挂件后从该任务实际启动成功，任务状态为 Running；launcher 记录 WinExe、consoleAttached:false、createNoWindow:true、killChildrenOnExit:true。随后窗口诊断为 attached:true、visible:true、focused:false、dpi:144。验证了任务入口能启动与跟随；没有为了测试登录触发而注销用户。

本地复核确认：初始窗口在显示前设为 1×1 形状；所有生产形状经过同一校验函数；窗口显示用 showInactive，不调用 focus；C# 移动使用 NOACTIVATE 且不改变尺寸；监督进程死亡时 launcher Job Object 清理自身子进程；数据读取策略在阶段 1 对所有源拒绝。不存在托盘对象、模型请求或 Codex agent 子进程调用。

待拥有不同缩放环境后，完成跨 DPI 移动/缩放验收。待当前聊天结束后完全退出并重开 Codex、新建聊天，检查插件状态工具是否加载。以上通过前不推进阶段 2。

原建议远端：`Chester-chs/codex-quota-widget`，private。当前 Git 已配置 origin 为 `https://github.com/Chester-chs/codex-quota-widget.git`；本轮未创建或修改远端、未执行 push。远端可见性未在本轮核验；每次 push 仍须用户明确确认。

## 本次鼠标输入缺陷：最小变量实验

只修改 BrowserWindow 的 `focusable:false` 一项，不修改 type、showInactive、形状、光标轮询、渲染器或原生跟随。每次根据最新 region、DPI 与物理窗口原点计算中心，准备 Codex 为前台，注入 SendInput 点击；等待 1.5 秒后读取点击计数和 GetForegroundWindow。拖动前再次准备 Codex 为前台，执行按下、10 步移动、松开，再等待 1.5 秒，检查 widget 和 position.json。

| 实验 | 点击计数 | 点击前/后前台 HWND | 拖动 widget/position.json | WM_MOUSEACTIVATE | 综合结论 |
|---|---|---|---|---|---|
| A，原配置 focusable:false | 0 → 0，SendInput 返回 2 | 328082 → 328082 | widget 保持 (8,8)，position.json 保持 (1586,915) | 4：MA_NOACTIVATEANDEAT | 保持焦点，但点击和拖动失败 |
| B，仅去掉 focusable:false | 0 → 1，SendInput 返回 2 | 328082 → 5375684 | widget (1586,915) → (1550,894)，position.json 写入 {"x":1550,"y":894} | 1：MA_ACTIVATE | 输入恢复，但抢焦点 |

B 的点击返回瞬间前台仍是 328082，1.5 秒后为 5375684；说明不能只检查 SendInput 刚返回时的瞬间。拖动前重置前台为 328082，拖动立即结束时以及 1.5 秒后均为 5375684。用户也在 B 运行期间反馈“现在可以点击了”，与输入恢复相符，但不撤销不抢焦点的要求。

原始 JSON 证据保存在用户数据目录（不提交）：`mouse-probe-focusable-false.json`、`mouse-probe-focusable-default.json`。当前位置记录保留本次拖动结果 (1550,894)。基线启动时 widget=(8,8)，与旧 position.json 不同；重启 B 后加载已保存坐标，探针始终现读实际 region，未假设固定点击坐标。

### 根因及结论边界

[Electron 44.3.0 源码](https://github.com/electron/electron/blob/v44.3.0/shell/browser/native_window_views.cc#L1339) 显示 SetFocusable(false) 同时关闭 Chromium widget 的 CanActivate 并设置 Windows WS_EX_NOACTIVATE。本机对窗口查询 WM_MOUSEACTIVATE 返回 4。[Windows 文档](https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-mouseactivate) 明确该返回值会丢弃触发点击。去掉参数后返回值变为 1，点击和拖动进入渲染器，但 Windows 激活挂件。

因此，本缺陷是窗口激活策略导致鼠标按下被丢弃，不是几何、Z 序、穿透命中或 renderer.js 语法错误。当前 renderer.js 已用 Node --check 确认没有历史 location 重复声明错误。

实验 1 已恢复输入，所以没有进入“实验 1 无效时换 type”的分支。已测的两个纯 Electron 配置都无法同时通过门槛 4；这不等同于穷举所有 Electron 版本或参数。按用户“停下来汇报，不要自己决定架构方向”的要求停止，不新增原生运行时输入适配，也不安装编译工具链。

### 回归与重装方法

新增 `tests/MouseProbe.cs`、`tests/Invoke-MouseProbe.ps1`，只用于用户明确授权的交互验收，不由插件运行时加载。探针验证 Electron 进程路径、Codex 进程路径、窗口 owner、诊断新鲜度与中心命中后才注入鼠标；测试辅助 C# 使用 Windows 自带编译能力，无 MSVC。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests\Invoke-MouseProbe.ps1 -Label baseline -RequirePass
```

该回归要求点击计数增加一次、拖动及位置持久化改变、点击和拖动后宿主仍为前台。A、B 均以非零退出码失败，分别准确捕获输入失败与焦点失败。日常 Node 测试通过不意味着这个回归通过。

对照实验重装使用：先 `scripts/stop.ps1`，再对已配置的个人市场执行 `codex plugin add codex-quota-widget@personal --json` 更新 0.1.0 缓存，核对源码与缓存 main.cjs SHA256，一致后 `scripts/start.ps1` 重启监督进程。此版本 launcher 的 supervisor 路径实际指向稳定源码目录，缓存仍同步更新，避免以后 MCP 载入旧文件。Electron 依赖未变，不重复下载或替换运行时 DLL。

交付时已还原实验的 main.cjs（与 a182d12 相同），停止自身监督进程，enabled.json=false；登录任务注册保留。待用户决定后再验证输入转发或激活处理方向，不把去掉 focusable:false 当作修复提交。
