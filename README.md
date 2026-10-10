# Codex 额度挂件

阶段 3：Codex 插件包装、透明 Electron 挂件、C#/Win32 窗口跟随、真实额度常驻细条，以及本机 token 用量柱状图。角色继续使用 CSS 占位，不实现自定义立绘、音频或尺寸调节。

阶段 1、2 已全部验收；阶段 3 保留 focusable:true 和 C# 延后 80ms 恢复宿主焦点。形状外穿透、异常形状回退和 300ms 焦点门槛按修改范围复测。详见 `docs/stage-1-verification.md`、`docs/stage-2-verification.md` 与 `docs/stage-3-verification.md`。

## 安装

Windows x64，Node.js 24+，Codex 桌面应用。使用 Windows 自带 Windows PowerShell 5.1 和 .NET Framework C# 编译器；无需 MSVC、C++ 模块或额外 C# SDK。

源码放在 `C:\Users\Chester\plugins\codex-quota-widget`，用户数据放在 `$CODEX_HOME\codex-quota-widget`，未设置 CODEX_HOME 时为 `C:\Users\Chester\.codex\codex-quota-widget`。源码、Codex 插件缓存与用户数据分离。

在源码目录运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1
```

安装使用锁定的 Electron 44.3.0，下载文件与编译产物只写用户数据目录。它合并个人市场的本插件条目，使用 Codex 的 `plugin add` 安装；不会修改其他插件条目。默认添加当前用户登录启动任务 `Codex Quota Widget`，不请求管理员权限。调试安装可加 `-NoStartup -NoStart`。

首次加载或更新 MCP 服务需要**完全退出并重开 Codex，再新建聊天**。正在进行的聊天不能用来证明更新后的服务已经加载。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\start.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\stop.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\verify.ps1 -Native
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\uninstall.ps1
```

停止会禁用本挂件的跟随；重新启动会启用。卸载停止自身进程、移除自身登录任务及市场条目，保留用户数据。Codex 内停用 MCP 插件与停止登录任务是两个入口；停用挂件应运行停止脚本，卸载应运行卸载脚本。

## 窗口与交互

透明窗口按 Codex 客户区定位，C# 控制物理位置、owner 和激活后的宿主焦点恢复；Electron 同步 Chromium 的 DIP 视口。常驻区域为 160×112 DIP，空间不足时缩小；宽度低于 120 DIP 隐藏进度条，只显示百分比。点击展开独立的详情区域（320 DIP 宽，按实际 0/1/2 窗口分配高度）。形状仅包含可见界面的矩形，两块之间和形状外的点击、滚动、选择文字交给宿主。实际面积预算与固定尺寸上限同时校验；空、非法、超限及整窗形状统一回退 1×1，绝不传入空形状。没有托盘、任务栏挂件。

点击展开或收起，拖动保存客户区坐标；点击计数继续用于诊断。当前使用 `focusable:true`、`showInactive()` 和形状外穿透。C# 在独立消息循环中监听挂件的前台/焦点事件，合并为一次 80ms 定时恢复；直接 SetForegroundWindow 被拒绝时才临时 AttachThreadInput，结束即解除。恢复前重新检查前台、宿主可见/启用状态、owner 和 PID；用户已切到其他应用时不恢复。立即恢复会打断 Chromium 输入，80ms 延迟在本机同时保留点击与完整拖动。

**该方案允许瞬间激活及可能的焦点闪烁，验收标准是点击后 300ms 内恢复宿主。** `tests/Invoke-MouseProbe.ps1 -Label acceptance -RequirePass -VerifySwitchAway` 会计算最新 region 中心、注入点击与 10 步拖动、记录 100/300/1000ms 及前台变化时间，并用测试自有窗口验证切到其他应用后不会被拉回。它不属于插件运行时。

**只承诺避让窗口外侧滚动条**，内部各分栏的滚动条不做承诺：外部进程无法可靠获取宿主 DOM 中全部滚动条位置。角色与右侧、底侧外缘保留至少 24 DIP；可拖到合适位置。

## 零额度消耗

挂件每 30 秒先 GET 固定的额度接口，读取前重读 auth.json，401 再重读并最多重试一次。失败时使用只读会话额度快照；没有可用快照才启动 `codex app-server --stdio`，逐条发送 `initialize`、`account/rateLimits/read`，最多每 5 分钟一次，完成即退出。额度回退只解析最近 4 MiB 的额度快照；token 统计使用独立的只读 Worker。访问令牌只留内存，不进入诊断、日志或源码。

`runtime/read-policy.cjs` 拒绝允许清单外的操作。没有模型补全、会话生成或启动 agent turn 的实现。MCP 仅提供 `widget_status`，读取本挂件自己保存的归一化额度、token 汇总与窗口诊断，不重复拉取账户数据。

界面显示剩余百分比，实心条代表剩余；>20% 为正常色，>10% 且 ≤20% 为橙色，≤10% 为红色。按实际时长显示 5 小时、每周、长期或短期窗口，双窗口时常驻条显示剩余比例较低者。没有窗口就显示“暂无可用额度数据”；重置时间过后显示“等待更新”，不会自行恢复 100%。读取失败保留较新的已有数值并标出更新年龄。

额度是 Codex / Work / 工作空间智能体 / ChatGPT for Excel 共享池，Chat 模式下的对话不计入此用量。数据来自 Codex 自己的额度接口，非本插件估算。上述说明在展开详情中可见；离线快照或 RPC 数据同时标明来源。

默认角色由 CSS 和 Unicode 符号组成，不使用参考项目的立绘与音频。改编代码署名见 `THIRD_PARTY_NOTICES.md`。远端仓库和推送仍须获得用户确认。

## 本机 token 用量

详情面板内切换「套餐限额」与「token 用量」。token 页签的三根柱显示最近 24 小时、7 天、30 天，统一按 30 天值缩放，柱顶显示整数与千分位，单位为 token；不套用额度阈值颜色。面板仍为 320×214/270/352 DIP，较矮面板内滚动查看完整声明。

只读 sessions/**/*.jsonl 的 event_msg/token_count，累计字段为 payload.info.total_token_usage.total_tokens。每文件保留最大累计值，只有超过历史高水位的正增量进入后一条事件的时间桶；累计回退和重复不叠加，mtime 只用于发现与排序。冷启动先读最多 300 个候选文件、每文件最多尾部 768 KiB；截断尾部的首条累计值只作基线。Worker 后台以 256 KiB 块补齐历史，完整历史替换预览，不重复相加。

结果缓存 5 分钟；过期只读新增偏移，未变化文件不重扫。索引保存在本挂件用户数据目录 token-index.json，仅保存文件元数据、高水位及增量时间和值，不保存会话正文。界面显示「索引中 / 部分覆盖 / 完成」和更新时间。超大非 token 行只解析有界元数据头；无法分类的超大行、读取错误或缺失事件时间会保留部分覆盖提示。

这是本机现存会话的汇总，并非 OpenAI 账户官方统计；不含已删除会话及其他电脑上的会话。历史缺失、截断或累计值异常均可能影响结果，不承诺误差方向。token 统计无网络及子进程入口。
