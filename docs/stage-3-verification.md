# 阶段 3 验收记录：本机 token 用量

2026-10-10，在阶段 2 的 1084f4a 上实现；本次不做阶段 4，不 push。环境为 Windows x64、Node v24.19.0、Electron 44.3.0、Codex CLI 0.162.0-alpha.17.2（此前由 0.156.1 自动升级）。显示缩放 100%，窗口仍报告 144 DPI 的既有待观察项保持不动。

用户在验收中要求改为柱状图，最终采用三个并排竖柱，而非原提示词的三行横条。柱顶保留完整整数和千分位，共用 token 单位，按 30 天值统一缩放；全部沿用正常蓝色，不套用额度阈值配色。

## 验收标准逐项结果

| 项目 | 结果 | 证据 |
|---|---|---|
| 1. 三个数值与单调性 | 通过 | 固定截点 119,761,959 ≤ 302,190,254 ≤ 674,236,205；真实 DOM 三柱高度也单调 |
| 2. 独立复算一致 | 通过 | Python 独立扫描 216 文件、9,069 条 token 记录，三桶及文件高水位总和完全一致 |
| 3. 口径声明可见 | 通过 | 真实 renderer 中声明完整；214/270 高度滚动到底后可见，352 高度直接可见 |
| 4. 覆盖状态可见 | 通过 | 冷 Worker 发出索引中→完成；三种状态的真实 DOM 测试通过，实际历史完成 216/216 |
| 5. 首屏不卡 | 通过 | 实机首个预览 35ms、完整索引 1,253ms；隐藏 UI 负载读取时 renderer 计时继续，主循环最大间隔 21ms；更新后用户回复“可以探针” |
| 6. 缓存及偏移增量 | 通过 | 缓存命中读取 0 字节；两次 5 分钟刷新仅读 86,502 / 15,811 字节，fullBytes=tailBytes=0 |
| 7. 固定尺寸与内部滚动 | 通过 | 真实 DOM 320×214/270/352；较矮两档 scrollHeight=320，声明可滚动到完整可见；没有第三区域或新产品窗口 |
| 8. 零消耗静置 | 通过 | 连续 600,021ms、120 次新增事件扫描，216→216 文件，turn/token 监测事件为空 |
| 9. 原生门槛 4/5/6 | 通过 | 点击计数增加，121ms 恢复宿主；22 个形状外点命中宿主；10 个异常形状案例仍回退 1×1 DIP |
| 10. 事件时间分桶 | 通过 | 只用根级 timestamp；单元测试将 mtime 设置在事件之后，24h 仍只计后续事件增量 |

## 聚合、读取边界与覆盖口径

仅提取根 type=event_msg、payload.type=token_count、payload.info.total_token_usage.total_tokens 为非负安全整数的行。根级 ISO timestamp 用于滚动 24 小时、7 天、30 天窗口；文件 mtime 只用于发现、排序和变化判断。

每个文件按记录顺序维护历史最大累计值。新累计值超过最大值才产生增量，归入当前事件时间；相同值和回退值不产生增量。例如 100→60→90 的高水位为 100，最后一段不再加 30；100→60→120 只在末条分配 20。首次从完整文件头读取时，相对零的首条增量归到该事件时间。每文件最大值之和是历史累计诊断，不等同于任何时间桶，界面仅显示三个时间桶。

冷启动先读取最多 300 个新候选文件、每个最多尾部 768 KiB，截断开头的半行丢弃，第一条完整累计值仅作基线。随后在 Worker 内以 256 KiB 块从文件头补齐，保存偏移检查点，完整历史原子替换尾部预览，避免重复计入。小于尾部预算的完整文件直接复用，不再读一遍。首次结果前仅扫描有界尾部；后台完整覆盖所有发现文件。

Worker 只引用本地文件与只读允许清单，不引用网络或子进程接口。主进程只接收小型汇总、转发 renderer 并保存自己的诊断；MCP 仅读取本挂件诊断。索引位于运行时目录 token-index.json，保存相对文件名、身份/大小/mtime、偏移、高水位及增量的时间和值，不保存正文、输入/输出 token 分项或凭据。

缓存 5 分钟，同一次缓存保持相同统计截点。缓存过期后，已有文件只从保存偏移读取，新文件进入有界预览及后台索引；删除文件移除，截断/替换文件重新建立索引；窗口过期值重新计算。最后一个未写完的 JSON 保留前一检查点，后续追加后再解析。持久化索引重载后的缓存命中也不读会话内容。

单行缓冲上限 1 MiB。超过上限的行用前 4 KiB 元数据头判定是否为非 token 行，跳过正文；未知类型、缺失正增量事件时间、读取错误或历史未补齐时显示部分覆盖。实机 109 条超大行独立确认为 62 条 response_item、21 条 compacted、26 条 event_msg/item_completed，无超大 token_count；因此本次 token 记录覆盖为完成。

界面明确显示“本机现存会话的汇总，并非 OpenAI 账户官方统计；不含已删除会话及其他电脑上的会话。”缺失/截断历史、异常累计值可能造成偏差，不承诺“只会偏小”。

## 实机性能与独立复算

固定统计截点：2026-10-10T14:21:16.948Z（15:21:16.948 BST）。实机冷读指标：

```json
{
  "candidateFiles": 216,
  "tailFiles": 216,
  "tailBytes": 93821450,
  "fullBytes": 684422152,
  "incrementalBytes": 0,
  "bytesReadThisCycle": 778243602,
  "chunks": 3077,
  "firstResultMs": 35,
  "durationMs": 1253
}
```

216 个已捕获文件实际总长 717,688,338 字节。Worker 总读量较大是因为大文件先读尾部，再后台读取完整历史；并非重复叠加数值。该指标不含界面启动时间，firstResultMs 从刷新开始计到首个预览发出。

独立复算工具 tests/recompute-tokens.py 不调用运行时 JS，也不复用索引存储的增量，只取已捕获的文件清单、字节长度和统计截点；逐行重新解析累计值、高水位与事件时间。固定字节边界避免当前实现聊天继续写入导致两次扫描不可比。输出：

```json
{
  "asOf": 1791642076948,
  "files": 216,
  "values": {"hours24": 119761959, "days7": 302190254, "days30": 674236205},
  "highWaterTotal": 1034149601,
  "tokenRecords": 9069,
  "bytesRead": 717688338,
  "elapsedMs": 2122
}
```

三个桶与高水位总和均与 Worker 相等，差异为 0。后续界面数值会随事件新增及窗口过期变化，不能拿不同截点直接比较。

初次完成后的缓存命中 cacheHit=true、cacheHits=2，metrics.bytesReadThisCycle=0；持久化重启也命中已有缓存。另一轮实际增量仅读 254,178 字节 / 2 块，143ms 完成，候选/尾部/全量均为 0。

静置期间观察到连续两次刷新截点 1791643029676 / 1791643329749：仅增量 86,502 / 15,811 字节，耗时 29 / 36ms，fullBytes=tailBytes=0。前后截点分别相隔约 300 秒。期间 cacheHits=8→24、refreshes=1→3，缓存命中读量始终为 0。新增字节可能为工具调用/返回记录，不能把文件变长等同于新增 turn/token 事件。

## 柱状图、滚动与响应验证

隐藏测试自有 Electron 窗口加载正式 HTML/preload/renderer；不会附着或覆盖宿主。合成约 25 MiB 会话由实际 Worker 索引，24h=440，发出索引中→完成；renderer 10ms 计时器执行 4 次，主循环最大间隔 21ms。尾部读取 786,432 字节，后台 26,233,629 字节，首次 2ms、全量 29ms。该合成用例证明解析在 Worker，不用作实机历史耗时。

三种窗口数对应面板 DOM 宽度均 320、高度分别 214/270/352。柱高约 18.93/47.44/105.59 DIP，配色均 rgb(62,113,139)，数字为千分位整数。较矮面板 clientHeight 为 213/269、scrollHeight=320；滚动到底后口径 footer 完全落在面板内。352 高度无需滚动。三种覆盖状态均实际渲染。

截图位于运行时目录 stage-3-ui/chart-0.png、chart-1.png、chart-2.png，已视觉核验。柱状图的 renderer 集成用例先在旧横条界面失败（columns=0，预期 3），改为竖柱后通过。用户要求改图后已重启运行中的挂件，用户再次回复“可以探针”。

## 原生交互与异常形状

只复测本次涉及的形状外穿透、焦点恢复与异常回退，未重新做阶段 1/2 的安装跟随、跨 DPI 或额度容错人工验收。desktop/geometry.cjs、desktop/WindowApi.cs、runtime/read-policy.cjs、runtime/quota.cjs 均无改动。

mouse-probe-stage-3-chart.json：宿主 HWND=264322，挂件 HWND=14289138；由最新 region 算中心，Win32 SendInput 返回 2，clicks 1→2。采样记录：

| 目标时间 | 实际采样 | 前台 HWND |
|---|---|---|
| 100ms | 105ms | 14289138 |
| 300ms | 310ms | 264322 |
| 1000ms | 1013ms | 264322 |

连续前台变化：11ms 激活挂件，121ms 恢复宿主，满足 300ms 门槛；仍使用 focusable:true 与现有 C# 80ms 延后恢复。区域间隙加网格共 22 点 WindowFromPoint root 均为宿主。10 步拖动把 widget (1523,883)→(1483,859)，position.json 同步为 (1483,859)，拖动后 100/300/1000ms 前台均为宿主。clickPass/dragPass/focusPass/outsidePass/passed 全部 true。

真实 Electron 异常 shape fixture 10 例通过，Win32 region=2×2 物理像素，在窗口报告 144 DPI 时对应 1×1 DIP，测试窗口隐藏。不放松面积预算、硬尺寸上限、逐矩形校验或右下外缘留白。

## 10 分钟零消耗原始记录

用户确认其他 Codex 任务已暂停。以每个 sessions JSONL 的开始字节长度为基线，每 5 秒只解析新增完整行的事件类型，纳入新文件，监测 task_started、turn_started、token_count，不保存事件 payload。整段观察在同一工具执行内完成，没有继续模型采样、创建聊天或启动 agent turn；每约 50 秒只发送工具等待进度。

stage-3-idle-observation.json：

```json
{
  "startedAt": "2026-10-10T14:32:54.176Z",
  "endedAt": "2026-10-10T14:42:54.197Z",
  "elapsedMs": 600021,
  "initialFiles": 216,
  "finalFiles": 216,
  "scans": 120,
  "resetFiles": 0,
  "events": {},
  "eventFiles": []
}
```

BST 为 15:32:54～15:42:54。12 个只读诊断检查点均是同一挂件 PID=26440、fresh=true、attached=true、visible=true、coverage=complete。events={} 表示所监测的三类事件均无新增；本结果与不含模型/网络/子进程入口的 token 统计实现相互佐证，不代替未来环境的无限期保证。原额度读取允许清单及回退逻辑不变，无 MSVC 依赖。

## 自动验证、产物与交付

scripts/verify.ps1 -Native：33 项测试全部通过（新增 10 项 token 核心/Worker 用例、1 项视图用例，原 MCP stdio 用例增加 stage=3 和本地 token 汇总断言）。涵盖高水位回退/重复、尾部基线、事件时间与 mtime 区别、300 候选上限、缓存零读、精确追加字节数、持久化重载、半行追加、截断/删除、滚动窗口过期及超大非 token 行分类。

tests/token-ui-smoke.cjs 用实际 Electron 验证柱状图、三个固定高度、声明滚动可见和 Worker 负载响应。静态检查确认 token 模块无网络/子进程入口，安全几何与焦点实现没有变更；git diff --check 通过。按照代码审查技能模板完成单独检查轮，无阻塞问题；遵守零 turn 限制，没有派生审查任务。

可重现命令：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1 -Native
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/Invoke-MouseProbe.ps1 -Label stage-3-chart -RequirePass -ExpandDetails
node tests/observe-quota.cjs C:/Users/Chester/.codex/codex-quota-widget/stage-3-idle-observation.json 600000
```

隐藏 Electron 使用 tests/token-ui-smoke.cjs --output <自建运行时目录>，移除 ELECTRON_RUN_AS_NODE 后启动。独立复算使用 Python tests/recompute-tokens.py <捕获索引> <CODEX_HOME> <数字汇总输出>。

全部实机证据保存在 C:/Users/Chester/.codex/codex-quota-widget/：stage-3-captured-index.json、stage-3-captured-state.json、stage-3-reference.json、stage-3-before-idle.json、stage-3-idle-observation.json、stage-3-idle-checkpoints.json、stage-3-ui/、mouse-probe-stage-3-chart.json、shape-smoke.json，以及当前 tokens-state.json/window-state.json。用户会话、凭据、编译产物和截图不进入源码。

收尾按 stop.ps1 → codex plugin add codex-quota-widget@personal --json → 逐文件 SHA256 → start.ps1。源码清单为 git ls-files --cached --others --exclude-standard，共 45 个文件；最终核对 files=45、matched=45、differences=[]。验收记录与测试源码也计入哈希。

首次重装返回 failed to back up plugin cache entry / 拒绝访问 (os error 5)，没有视为成功。只读检查 Node PID=12424、23568 的 PEB 当前目录均为本插件缓存 0.1.0，命令均为 node.exe runtime/mcp.cjs；仅停止这两个核对过的本插件 MCP 进程以解除目录占用，再重装。未结束 Codex 或其他插件进程。当前聊天的旧 widget_status 连接会断开，应用/新聊天重新加载时恢复；独立挂件不依赖该连接。

提交使用中文信息，不 push。阶段 1 的 MCP 重启加载验收不重做；完全退出重开应用/聊天后才能加载更新后的 stage 3 widget_status。独立 Node stdio 用例已验证本地 token 汇总应答，不启动 Codex turn。
