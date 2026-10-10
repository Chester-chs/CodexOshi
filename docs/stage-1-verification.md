# 阶段 1 验收记录

日期：2026-10-09。Windows x64；Codex Desktop 26.1007.2314.0；CLI 0.162.0-alpha.17.2；Electron 44.3.0；Node.js 24.19.0；Windows PowerShell 5.1。

**2026-10-10 MCP 加载复核：验收方报告完整重启后新建聊天仍拿不到 widget_status，重启后 MCP 加载不通过。按要求仅将 .mcp.json 的 args 改为 runtime/mcp.cjs，重装后 Args 已更新，但 codex mcp list 的 Cwd 仍为 `-`。已触发用户指定的停止条件，不继续猜测配置、不使用绝对路径兜底、不将该门槛标为通过。**

**2026-10-10 第二轮：按新授权显式设置缓存绝对 cwd 与 10 秒启动超时，并增加静默启动日志。配置重装后 mcp list 的 Cwd 已为指定缓存目录；11 项测试通过。完整退出重开后的真实启动日志和新聊天 widget_status 调用尚未验证，MCP 加载门槛仍未标为通过。下方保留首轮失败的历史证据。**

**2026-10-09 路线 A 修复：按新授权采用 focusable:true + C# 激活事件恢复，允许短暂激活，要求点击后 300ms 内回到宿主。立即恢复会打断输入；仅改为延后 80ms 后，点击、拖动、形状外穿透与切走防护均通过原生探针。跨 DPI 切换与重启后 MCP 加载仍待验收。没有进入阶段 2。此前 focusable:false 的通过结论仍已撤回，不将“短暂激活后恢复”等同于“从不激活”。**

| 条件 | 当前证据 | 结论 |
|---|---|---|
| 1. 安装与自动跟随 | 窗口安装与跟随的既有证据保留。首轮相对路径配置 Cwd=`-`；第二轮显式 cwd 重装后，mcp list 显示指定缓存目录。启动日志写入和失败静默回归通过。 | 窗口与 CLI 安装已验证；**第二轮配置解析通过，完整重启后的进程启动与新聊天工具调用待验收** |
| 2. 无托盘、任务栏 | 无 Tray 对象；BrowserWindow 设置 skipTaskbar、toolbar、focusable:true，原生扩展样式包含 TOOLWINDOW、没有 APPWINDOW，且 owner 是 Codex。无独立挂件任务栏窗口。 | 通过 |
| 3. 移动、最小化/还原、DPI | 用户明确确认移动、最小化消失和还原出现正常。诊断记录 DPI=144，即 150%；100%/150%/200% 的物理尺寸→DIP 单元测试通过。用户确认只有 150% 显示环境。 | 生命周期通过；跨 DPI 切换未实测 |
| 4. 首次点击、拖动、恢复宿主焦点 | 路线 A 延后 80ms 后 clicks 0→1；复测 1→2、2→3，约 112～113ms 时已回到宿主 HWND=328082。完整 10 步拖动 (499,382)→(539,406)，position.json 同步。切走测试在定时器到期前将前台转到测试窗口，随后保持该窗口，未被拉回。用户确认“操作正常，闪烁可接受”。 | **按新授权的 300ms 恢复判据通过**；用户接受瞬间闪烁 |
| 5. 宿主输入穿透 | 用户此前确认角色区域外能点击输入框、滚动聊天和选择文字。本次原生 WindowFromPoint 网格采样排除角色形状后全部命中宿主；窗口区域只裁剪到角色，右侧/底侧保留 24 DIP。 | 通过用户实测与窗口命中对照；不把有限采样等同于全部像素穷举 |
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

## 历史鼠标输入缺陷：最小变量实验（5970180）

只修改 BrowserWindow 的 `focusable:false` 一项，不修改 type、showInactive、形状、光标轮询、渲染器或原生跟随。每次根据最新 region、DPI 与物理窗口原点计算中心，准备 Codex 为前台，注入 SendInput 点击；等待 1.5 秒后读取点击计数和 GetForegroundWindow。拖动前再次准备 Codex 为前台，执行按下、10 步移动、松开，再等待 1.5 秒，检查 widget 和 position.json。

| 实验 | 点击计数 | 点击前/后前台 HWND | 拖动 widget/position.json | WM_MOUSEACTIVATE | 综合结论 |
|---|---|---|---|---|---|
| 对照 1，原配置 focusable:false | 0 → 0，SendInput 返回 2 | 328082 → 328082 | widget 保持 (8,8)，position.json 保持 (1586,915) | 4：MA_NOACTIVATEANDEAT | 保持焦点，但点击和拖动失败 |
| 对照 2，仅去掉 focusable:false | 0 → 1，SendInput 返回 2 | 328082 → 5375684 | widget (1586,915) → (1550,894)，position.json 写入 {"x":1550,"y":894} | 1：MA_ACTIVATE | 输入恢复，但抢焦点 |

对照 2 的点击返回瞬间前台仍是 328082，1.5 秒后为 5375684；说明不能只检查 SendInput 刚返回时的瞬间。拖动前重置前台为 328082，拖动立即结束时以及 1.5 秒后均为 5375684。用户也在对照 2 运行期间反馈“现在可以点击了”，与输入恢复相符，但不撤销不抢焦点的要求。

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

当时的回归要求点击计数增加一次、拖动及位置持久化改变、点击和拖动后宿主仍为前台。两个对照均以非零退出码失败，分别准确捕获输入失败与焦点失败。日常 Node 测试通过不意味着这个回归通过。新授权后的判据与测量升级见下文。

对照实验重装使用：先 `scripts/stop.ps1`，再对已配置的个人市场执行 `codex plugin add codex-quota-widget@personal --json` 更新 0.1.0 缓存，核对源码与缓存 main.cjs SHA256，一致后 `scripts/start.ps1` 重启监督进程。此版本 launcher 的 supervisor 路径实际指向稳定源码目录，缓存仍同步更新，避免以后 MCP 载入旧文件。Electron 依赖未变，不重复下载或替换运行时 DLL。

5970180 交付时已还原实验的 main.cjs（与 a182d12 相同），停止自身监督进程，enabled.json=false；登录任务注册保留。以下为之后获得授权的新实验与交付状态。

## 新授权：路线 A 激活恢复

跨进程 C# 无法用 WH_CALLWNDPROC 可靠改写 Electron/Chromium WndProc 的返回值；本轮没有安装 SetWindowsHookEx 钩子、替换 WndProc 或注入 DLL。采用独立进程的 [SetWinEventHook](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwineventhook) OUTOFCONTEXT 通知，回调运行在已有 C# 消息循环。只观察挂件进程的 EVENT_SYSTEM_FOREGROUND / EVENT_OBJECT_FOCUS，恢复前检查当前前台仍为挂件、host/overlay PID 与 owner 未变、宿主可见且启用且未最小化。直接 SetForegroundWindow 被拒绝时才临时 AttachThreadInput，finally 总是解除；停止时清理事件钩子与定时器。

先把 focusable 设为 true，测无恢复逻辑的失败基线；再只增加 C# 恢复逻辑；立即恢复失败后，只增加 80ms 延迟。该延迟合并事件、不因事件突发而重置到期时间，不阻塞窗口跟随循环，也不修改任何鼠标激活返回值。WM_MOUSEACTIVATE 仍为 1。

| 实验 | clicks（1.5s 后） | 100 / 300 / 1000ms 前台（括号为实际采样 ms） | 拖动/穿透 | 结果 |
|---|---|---|---|---|
| route-a-control，无恢复钩子，overlay=2230788 | 3→4 | 挂件(111) / 挂件(313) / 挂件(1010) | 拖动、25 点穿透成功 | 焦点失败，探针退出 1 |
| route-a-immediate，overlay=15796778 | 0→0 | 宿主(112) / 宿主(313) / 宿主(1013) | 拖动不动，24 点穿透成功 | 恢复太早打断输入，探针退出 1 |
| route-a-delay80，overlay=2949170 | 0→1 | 宿主(113) / 宿主(314) / 宿主(1012) | (1514,873)→(1478,852)，24 点穿透成功 | 三条判据通过 |
| route-a-repeat2，overlay=1903400 | 1→2 | 宿主(112) / 宿主(314) / 宿主(1009) | (463,361)→(499,382)，25 点穿透成功 | 通过，观测到 112ms 恢复 |
| route-a-switch-away，overlay=1903400 | 2→3 | 宿主(113) / 宿主(302) / 宿主(1001) | (499,382)→(539,406)，position.json={"x":539,"y":406}，25 点穿透成功 | 通过，观测到 113ms 恢复 |
| route-a-reinstalled，overlay=6752232 | 27→28 | 挂件(110) / 宿主(315) / 宿主(1015) | (1516,650)→(1476,626)，position.json 同步，25 点穿透成功 | 通过，变化曲线在 **125ms** 观测到宿主 |

表中宿主 HWND 均为 328082。每次先将 Codex 置前台，再从最新 region、DPI 与原生窗口原点计算中心；SendInput 均返回 2。测试同时记录前台变化曲线，必须在实际经过不超过 300ms 时观测到宿主，并在后续样本及 1.5s 时维持宿主，不能把约 314ms 的采样单独当成“300ms 内”证据。拖动由按下、10 步移动、松开组成；末步留出 40ms 投递时间后才松开，确认完整 40×24 DIP 的移动与持久化。

route-a-switch-away 额外点击后，在恢复定时器到期前切到测试自有窗口 HWND=721144；58ms 时已经切走，104 / 306 / 1005ms 的前台仍为该窗口，clicks 3→4，防止迟到恢复把用户从其他应用拉回的测试通过。测试结束销毁自有窗口并恢复 Codex，不操控第三方应用界面。

复测中两次中心命中 ShellExperienceHost 的系统通知窗口，均在 SendInput 前中止，未计成功；随后将本挂件移到客户区内部再测。启动后旧诊断短暂残留的准备失败也未注入输入，探针增加最多 5 秒等待真实进程和附着完成。一次复测实际在 117ms 恢复，但初版探针只接受 100ms 样本，误判失败；已按新授权使用前台变化曲线修正，随后重跑通过。证据保存在用户数据目录的 mouse-probe-route-a-*.json，不提交用户数据。

重装后准备阶段遇到 DSH 为前台、Codex 最小化及实际光标被移走，均中止测试而未向错误目标点击。测试辅助程序的宿主准备步骤增加临时 AttachThreadInput 与最小化还原；连接在注入和测量前全部解除，不介入被测的焦点恢复。用户确认暂停鼠标后，最终 route-a-reinstalled 回归成功。切走防护的自有窗口为 HWND=920066，52ms 时切走，105 / 306 / 1005ms 仍为该窗口，clicks 28→29。

重装过程的一次监督进程在 22:33:23 UTC 退出，exitCode=-1，launcher 的尾日志仅有既有 True 输出，应用日志无匹配崩溃记录，现有证据未定位退出原因；未将其归因于焦点恢复。重新启动后监控正常运行，最终交互验收通过。这一独立的退出记录保存在用户数据目录 launcher-error.json，不以重启成功掩盖该观测。

路线 A 已满足用户给定的点击/300ms 恢复/形状外穿透判据，用户随后明确确认“操作正常，闪烁可接受”。路线 B 未尝试；路线 C 未实施，当前无需原生注入或架构调整；路线 D 无需取舍。

`desktop/geometry.cjs` 与读取允许清单未改；阶段 1 仍禁止账户/会话读取，没有模型、agent turn、codex exec 或 review 操作，没有 MSVC 依赖。普通 9 项测试与真实隐藏 Electron 的 5 类异常形状测试通过，150% 下仍为 2×2 物理像素（1×1 DIP）。

复现命令：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests\Invoke-MouseProbe.ps1 -Label route-a-acceptance -RequirePass -VerifySwitchAway
```

## 本轮交付与缓存核验

本轮仍为 32 个源码文件，首轮通过 CLI plugin add 重装后，逐文件 SHA256 核对 32/32 一致。补充最终探针和记录后，交付前再次按相同流程停止、重装、核对、启动，不重复下载 Electron。用户数据、临时测试窗口、日志及编译产物不进入源码或插件缓存。中文本地提交，不执行 push。最终挂件保持启用；跨 DPI 切换和完整重启后的 MCP 加载继续标记待验收。

最终检查包括 9 项 Node 测试、5 类原生异常形状、8 个 PowerShell 文件解析、10 个 JS 文件语法与 git diff --check。几何函数和 runtime/read-policy.cjs 均无 diff。自查确认只在挂件激活后恢复已验证宿主，迟到事件不恢复其他前台窗口；没有宿主 WndProc 注入、MSVC 或阶段 2 功能。

## 2026-10-10：MCP 启动路径的一行修复与停止记录

采用验收方给出的根因证据，不重新排查安装、市场、服务器实现或插件启用状态。唯一配置变更：

```diff
-      "args": ["${CLAUDE_PLUGIN_ROOT}/runtime/mcp.cjs"]
+      "args": ["runtime/mcp.cjs"]
```

执行 scripts/stop.ps1 后，运行 codex plugin add codex-quota-widget@personal --json，返回安装路径 C:\Users\Chester\.codex\plugins\cache\personal\codex-quota-widget\0.1.0。32 个源码文件与缓存逐文件 SHA256 比对一致。随后执行 codex mcp list，目标行如下（仅压缩列间空白，未改列值）：

```text
Name                Command  Args             Env  Cwd  Status   Auth
codex-quota-widget  node     runtime/mcp.cjs   -    -    enabled  Unsupported
```

该命令退出码为 0，但目标行的 **Cwd 仍为 `-`**；不能以命令正常退出或 Args 更新代替工作目录验收。因此按用户“如果 Cwd 仍为 `-`，停下来汇报”的要求，在步骤 2 停止。没有尝试补 cwd、绝对路径或其它配置，没有继续执行步骤 3～4 的完整退出重开及新聊天工具调用。**修复后新聊天调用 widget_status 的实测结果：未执行，不能标记通过。**

本机 codex --version 实测为 `codex-cli 0.162.0-alpha.17.2`。验收方报告从 0.156.1 自动升级到该 alpha 版本；将版本和升级方式记录为后续插件/MCP 异常的排查变量，不由本次输出推断其必然是根因。

本轮源码只改 .mcp.json 与本验收记录；桌面形状、1×1 回退、focusable:true、C# 80ms 恢复、读取允许清单及运行时实现均未修改。没有 MSVC、阶段 2、codex exec、review 或新 agent turn。挂件按要求停止，未重新启动；本轮提交为中文本地提交，不 push。补充本记录后再次同步缓存并核验最终文件哈希。

## 2026-10-10：第二轮显式 cwd 与启动诊断

按验收方指定格式，.mcp.json 新增 cwd=C:/Users/Chester/.codex/plugins/cache/personal/codex-quota-widget/0.1.0、startup_timeout_sec=10，args 保持 runtime/mcp.cjs。没有改成源码目录或使用占位符。runtime/mcp.cjs 在主程序启动时写一次 mcp-startup.json，字段仅为 at、pid、cwd、argv、codexHome、nodeVersion；导入模块不写日志，目录创建及写文件异常全部静默忽略，stdout 不增加任何协议外输出。

回归新增前，启动元数据测试因日志文件不存在失败；实现后全部 11 项测试通过。测试覆盖真实 Node 子进程的启动元数据、stdio 应答及数据目录被同名普通文件阻塞时的静默继续启动。所有子进程测试使用临时 CODEX_HOME，并清理自己创建的目录，未向正式运行目录制造启动证据。测试子进程不等于 Codex 加载 MCP 的证据。

步骤 1～5 已执行：停止挂件、CLI plugin add 重装、32/32 文件 SHA256 一致、清理正式 mcp-startup.json、运行 codex mcp list。CLI 版本实测 codex-cli 0.162.0-alpha.17.2；验收方报告这是从 0.156.1 自动升级的 alpha 版本。目标行原样如下（不压缩列间空白）：

```text
codex-quota-widget  node                                                                                              runtime/mcp.cjs                                                                                                                 -                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             C:/Users/Chester/.codex/plugins/cache/personal/codex-quota-widget/0.1.0           enabled   Unsupported
```

配置解析结果：Cwd 已不是 `-`，为用户指定缓存目录。mcp list 之后正式 mcp-startup.json 未出现；这是完整重启前的观察，不能据此判断 Codex 是否会在新会话拉起第三方 MCP，也不能提前触发“步骤 8 未出现”的根因结论。

步骤 6～9：尚未执行完整退出重开后的验收。当前聊天的工具清单里没有 widget_status；本次没有调用它，也没有用手动启动 Node 的应答替代新聊天工具调用。必须完全退出 Codex、在任务管理器确认 ChatGPT 进程全部消失，再重开 Codex并新建聊天，检查启动 JSON 并调用已加载的 widget_status。只有真实启动日志和真实工具调用都成功后，才能改为通过。

自动创建聊天并发送提示会启动额外 agent turn，受用户零额度约束限制，因此此处需要用户在重启后发起新聊天中的工具调用。新聊天可直接使用下列验收提示：

> 只使用已加载的 widget_status 工具调用一次并返回原始结果；不要运行 codex exec/review，不要手动启动 Node MCP。读取 C:\Users\Chester\.codex\codex-quota-widget\mcp-startup.json，原样返回其内容。源码仓库为 C:\Users\Chester\plugins\codex-quota-widget。若工具未加载或启动文件未出现，报告原始情况，不继续猜测或改配置。启动文件出现并且真实工具调用成功后，更新 docs/stage-1-verification.md 的第二轮验收结果，中文本地提交，不 push。

本轮修改仅涉及 .mcp.json、runtime/mcp.cjs、对应回归测试及本记录。桌面 geometry.cjs、focusable:true、C# 80ms 恢复与数据读取允许清单无修改；没有阶段 2、MSVC、模型或 agent 子进程调用。挂件仍保持停止。补充记录后再次同步缓存并核验哈希，中文本地提交，不 push。
