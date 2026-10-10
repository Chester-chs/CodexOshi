# 阶段 2 验收记录

日期：2026-10-10。Windows x64；Codex CLI 0.162.0-alpha.17.2（由 0.156.1 自动升级）；Electron 44.3.0；Node.js 24.19.0。系统显示缩放 100%，宿主和挂件仍报告 144 DPI，沿用阶段 1 的待观察项，本阶段不修复。

本阶段实现真实额度读取与 B+C 布局，没有实现 token 用量统计、自定义立绘或音频。C# WindowApi.cs、80ms 焦点恢复以及既有窗口跟随均未修改。阶段 1 未受改动影响的门槛沿用既有验收，只复测形状与交互相关的门槛 4/5/6。

## 第 8 节逐条验收

| 项目 | 证据 | 结果 |
|---|---|---|
| 1. 同刻额度对照 | 13:27:49 UTC，HTTP 与 Codex 应用 get_usage_limits（自带卡片的数据源）均为 prolite、primary.usedPercent=41、windowDurationMins=10080、resetAt=1792005174、secondary=null；即每周剩余 59%。同一轮工具调用对照，未截取宿主卡片图片。 | 数值一致 |
| 2. 单一每周窗口 | 实际 HTTP/window-state 只有每周窗口，常驻显示 59%，详情只生成一张卡片，没有预设的空白 5 小时窗口。 | 通过 |
| 3. 0/1/2 窗口 | 隐藏真实 Electron 加载正式 HTML/preload/renderer，分别生成 0/1/2 张卡片；0 窗口显示“暂无可用额度数据”，不伪造 0%。双窗口常驻显示较低剩余比例。 | 通过 |
| 4. 倒计时 | 每秒重新显示；测试从 1 天 1 小时降至 1 天 0 小时，过期显示“等待更新”，保留原来的 3% 而非恢复 100%。 | 通过 |
| 5. 剩余比例与阈值 | 21 正常、20/11 橙、10/0 红；条形 width=remainingPercent%，常驻 5px，详情 8px。真实渲染截图核验双色方向。 | 通过 |
| 6. 窄宽降级 | 119 DIP 隐藏条、120 DIP 显示条；真实 Electron 窄视口返回 hidden=true、text=65%。 | 通过 |
| 7. 点击展开 | 受控 SendInput 将 clicks 6→7，要求 expanded=true 且 region=2 才继续；真实详情为名称、左倒计时、右剩余比例和下方整宽条，双窗口纵向排列。 | 通过 |
| 8. 口径声明 | 三种窗口数量的真实 DOM 均包含共享池、Chat 不计入及非插件估算；截图完整显示，详情内容无需滚动。 | 通过 |
| 9. 401 恢复 | 实际 GET 第一遍使用内存坏 token，返回 401；第二遍重新只读真实 auth.json，返回 200；tokenReads=2，剩余 59%。另有持续 401 测试验证只请求两次。 | 通过；未修改真实凭据文件 |
| 10. 零额度消耗 | 13:37:45.470～13:47:45.494 UTC，600024ms；216→216 个会话文件，120 次扫描，新增 task_started/turn_started/token_count 均为 0。 | 静置 10 分钟通过 |
| 11. 焦点、穿透、异常形状 | 展开点击后 121ms 恢复宿主，10 步拖动和位置文件同步，25 个网格点与区域间空隙命中宿主；默认及展开形状的 10 个异常原生案例均回退 1×1 DIP。 | 通过 |

## 数据读取与边界

运行时只有固定 GET https://chatgpt.com/backend-api/wham/usage、只读 CODEX_HOME/auth.json 与 sessions/**/*.jsonl，以及兜底的 initialize/account/rateLimits/read。HTTP 禁止重定向、单次超时 8 秒、401 仅重试一次；令牌每次从文件重读且不输出。HTTP 成功时不扫描会话、不启动 RPC。

失败依次尝试本地和 RPC，RPC 至少间隔 300000ms，时间戳保存在自己的 quota-state.json；请求一发一读且回收自己启动的子进程。没有会话快照时才使用 RPC。所有数据读取均由 Electron 主进程负责，MCP 只读自己的诊断。额度缓存只含来源、时间、套餐、窗口及安全错误代码，没有访问令牌、账户 ID、credits、聊天或 token 用量。

HTTP、会话 snake_case、RPC camelCase 与 rateLimitsByLimitId.codex 均归一化。旧离线快照不覆盖更近的已成功数值；失败显示更新年龄。未知剩余/套餐/重置时间分别显示未知，没有凭空数值。

常驻尺寸上限 160×112 DIP，详情实际按 0/1/2 窗口为 320×214/270/352 DIP，受视口限制缩小。shape 同时校验当前实际面积预算、硬尺寸上限和总面积上限（160×112 + 340×352），最多两个矩形，保留右/下 24 DIP。非法尺寸、空数组、整窗、非整数或越界均返回 1×1；不存在空形状恢复全窗的路径。

## 原生交互原始数值

宿主 HWND=264322，挂件 HWND=656332。展开探针 clicks 6→7：

| 目标时间 | 实际采样时间 | 前台 HWND |
|---|---|---|
| 100ms | 105ms | 656332 |
| 300ms | 309ms | 264322 |
| 1000ms | 1007ms | 264322 |

连续采样记录 13ms 激活挂件，121ms 回到宿主；1.5s 后仍是宿主。拖动 (840,358)→(880,382)，position.json 同值更新，拖动结束 100/300/1000ms 前台均为宿主。25 个网格点加空隙点 (1251,621) 的 WindowFromPoint root 全部为宿主。

第一轮 clicks 3→4，127ms 恢复，位置 (800,334)→(840,358)；另用测试自有窗口验证点击后主动切走时不会被拉回（原始探针 passed=true）。两轮均由最新 region 算中心，未硬编码挂件坐标。

真实异常形状测试 10 个案例，Win32 区域为 2×2 物理像素，在窗口报告 144 DPI 时对应 1×1 DIP，隐藏测试窗口未附着宿主。

## 可重现命令与产物

在源码目录运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1 -Native
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/Invoke-MouseProbe.ps1 -Label stage-2-expanded -RequirePass -ExpandDetails
node tests/observe-quota.cjs C:/Users/Chester/.codex/codex-quota-widget/stage-2-observation.json 600000
```

隐藏 UI fixture：用已安装 Electron 启动 tests/ui-smoke.cjs --output <自己创建的输出目录>。输入均为合成额度，仅验证界面，不请求账户或启动 turn。0/1/2 窗口与窄宽截图在运行时目录 stage-2-ui/，已视觉核验。

自动测试 22 项通过。RPC 的顺序与精确参数用合成流验证；由于真实 HTTP 成功，生产回退 RPC 未被拉起，未为验收故意启动不必要的 Codex 进程。

运行时证据仅保存在 C:/Users/Chester/.codex/codex-quota-widget/：window-state.json、quota-state.json、mouse-probe-stage-2.json、mouse-probe-stage-2-expanded.json、shape-smoke.json、stage-2-ui/ui-smoke.json 与截图、stage-2-observation.json、stage-2-idle-observation.json。不将用户会话、凭据、编译产物或截图写入源码仓库。

## 零消耗观察的原始结果

第一轮在实现和验收工具调用仍进行时观察（13:28:47.536～13:38:47.567 UTC），记录了 20 个 token_count、0 个 task_started/turn_started，216→216 个文件。事件文件对应当前 Codex额度 验收聊天及另一个 HLTV 聊天；只读检查其 cwd 和事件时间，未读取或输出聊天内容。用户随后确认其他任务已暂停。该轮包含正常模型执行，不能判为“零新增事件”，也不能将这些事件直接归因于挂件。

最终静置轮避免继续模型执行，由同一工具调用内的只读观察器完成整段观察，每 50 秒报告等待进度，没有启动额外聊天或任务。以每个 jsonl 的初始字节长度为基线，之后每 5 秒只解析新增完整行的事件类型，同时纳入期间出现的新文件；监测 task_started、turn_started 与 token_count，不保存事件 payload 或 token 数。

stage-2-idle-observation.json：

```json
{
  "startedAt": "2026-10-10T13:37:45.470Z",
  "endedAt": "2026-10-10T13:47:45.494Z",
  "elapsedMs": 600024,
  "initialFiles": 216,
  "finalFiles": 216,
  "scans": 120,
  "resetFiles": 0,
  "events": {},
  "eventFiles": []
}
```

events={} 表示所监测三类事件均无新增，未发生文件截断。期间挂件保持运行；结束后的诊断仍为 attached=true、visible=true、focused=false、source=http、remainingPercent=59、stale=false、lastRpcAttemptAt=null。此结果证明本次静置运行没有新增 turn/token 事件，不能代替所有未来环境下的无限期保证；运行时允许清单和禁止 turn 的实现边界同时保留。

## 缓存与交付

收尾按 stop.ps1 → codex plugin add codex-quota-widget@personal --json → 逐文件 SHA256 核对 → start.ps1 的顺序重装。源码文件清单使用 git ls-files --cached --others --exclude-standard，不含 .git 和运行时数据。本阶段共 39 个文件，缓存同名文件逐一一致；最终核对输出为 files=39、matched=39、differences=[]。

首次 plugin add 返回 failed to back up plugin cache entry / 拒绝访问 (os error 5)，该次仅 17/39 文件一致，未将其记为成功。只读核对两个 Node MCP 进程（PID 1416、28824）的实际 cwd 均为本插件缓存 0.1.0，commandLine 均为 node.exe runtime/mcp.cjs；Windows 仍占用该目录。仅停止这两个已核对的本插件 MCP 进程，再执行重装，未结束 Codex 或其他插件进程。当前聊天的旧 widget_status 连接因而断开，重开聊天/应用时才能加载更新后的服务；这不影响独立挂件运行。

提交使用中文信息，未 push。阶段 1 的重启加载验收不重做；正在运行的聊天保留旧 MCP 进程，完全退出重开后才加载已更新的 stage 2 状态实现。独立 stdio 测试已验证新服务初始化、工具枚举与本地状态应答正常，不启动 Codex turn。
