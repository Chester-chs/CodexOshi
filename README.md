# Codex 额度挂件

阶段 1：Codex 插件包装、透明 Electron 挂件、C#/Win32 owner 与 WinEvent 跟随。只有原创 CSS 占位角色和点击计数；尚不读取额度、凭据或会话，也不实现图片、音频和统计。

按用户授权的路线 A，鼠标交互已通过原生探针：挂件允许短暂激活，C# 延后 80ms 恢复 Codex 前台，实测在 300ms 内恢复，点击、拖动和形状外穿透均通过。跨 DPI 切换与重启后 MCP 加载仍待验收。详见 `docs/stage-1-verification.md`。

## 安装

Windows x64，Node.js 24+，Codex 桌面应用。使用 Windows 自带 Windows PowerShell 5.1 和 .NET Framework C# 编译器；无需 MSVC、C++ 模块或额外 C# SDK。

源码放在 `C:\Users\Chester\plugins\codex-quota-widget`，用户数据放在 `$CODEX_HOME\codex-quota-widget`，未设置 CODEX_HOME 时为 `C:\Users\Chester\.codex\codex-quota-widget`。源码、Codex 插件缓存与用户数据分离。

在源码目录运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1
```

安装使用锁定的 Electron 44.3.0，下载文件与编译产物只写用户数据目录。它合并个人市场的本插件条目，使用 Codex 的 `plugin add` 安装；不会修改其他插件条目。默认添加当前用户登录启动任务 `Codex Quota Widget`，不请求管理员权限。调试安装可加 `-NoStartup -NoStart`。

首次加载 MCP 骨架需要**完全退出并重开 Codex，再新建聊天**。正在进行的聊天不能用来证明新插件已经加载。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\start.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\stop.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\verify.ps1 -Native
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\uninstall.ps1
```

停止会禁用本挂件的跟随；重新启动会启用。卸载停止自身进程、移除自身登录任务及市场条目，保留用户数据。Codex 内停用 MCP 插件与停止登录任务是两个入口；停用挂件应运行停止脚本，卸载应运行卸载脚本。

## 窗口与交互

透明窗口覆盖 Codex 客户区。C# 控制物理位置、owner 和激活后的宿主焦点恢复；Electron 同步 Chromium 的 DIP 视口。形状仅包含 96×80 DIP 的占位角色；形状外的点击、滚动和文本选择交给宿主。空、非法、超限及整窗形状统一回退 1×1，绝不传入空形状。没有托盘、任务栏挂件。

点击计数用于首次点击验收，拖动保存客户区坐标。当前使用 `focusable:true`、`showInactive()` 和形状外穿透。C# 在独立消息循环中监听挂件的前台/焦点事件，合并为一次 80ms 定时恢复；直接 SetForegroundWindow 被拒绝时才临时 AttachThreadInput，结束即解除。恢复前重新检查前台、宿主可见/启用状态、owner 和 PID；用户已切到其他应用时不恢复。立即恢复会打断 Chromium 输入，80ms 延迟在本机同时保留点击与完整拖动。

**该方案允许瞬间激活及可能的焦点闪烁，验收标准是点击后 300ms 内恢复宿主。** `tests/Invoke-MouseProbe.ps1 -Label acceptance -RequirePass -VerifySwitchAway` 会计算最新 region 中心、注入点击与 10 步拖动、记录 100/300/1000ms 及前台变化时间，并用测试自有窗口验证切到其他应用后不会被拉回。它不属于插件运行时。

**只承诺避让窗口外侧滚动条**，内部各分栏的滚动条不做承诺：外部进程无法可靠获取宿主 DOM 中全部滚动条位置。角色与右侧、底侧外缘保留至少 24 DIP；可拖到合适位置。

## 零额度消耗

阶段 1 禁止所有账户和会话数据读取。MCP 仅提供 `widget_status`，读取本挂件自己的本地诊断，不自动发起任何模型任务。监督进程只启动自己的 Electron，不启动 Codex agent。

`runtime/read-policy.cjs` 仅保留未来允许清单：指定额度接口的 GET、只读本地会话文件、RPC `initialize` 和 `account/rateLimits/read`。阶段 1 中，即使清单内的读取也会拒绝。没有任何 HTTP 请求、模型补全或会话生成实现。

默认角色由 CSS 和 Unicode 符号组成，不使用参考项目的立绘与音频。改编代码署名见 `THIRD_PARTY_NOTICES.md`。远端仓库和推送仍须获得用户确认。
