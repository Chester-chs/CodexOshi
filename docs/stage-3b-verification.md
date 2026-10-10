# 阶段 3b 验收记录：本机角色系统

2026-10-10，在 d4ed252 上实现。环境：Windows x64、Node v24.19.0、Electron 44.3.0、Codex CLI 0.162.0-alpha.17.2。阶段 3a 的 token 核心、Worker、高水位/事件时间口径及索引保持原样；不引入 AI、分割模型、音效、尺寸调节、吸附或 MSVC。显示缩放 100% 但窗口报告 144 DPI 的已知待观察项不改动。

## 18 项验收结果

| 项目 | 结果 | 证据 |
|---|---|---|
| 1. 新建、四态上传、切换、删除 | 通过 | 真实文件系统测试创建、四态复制、更名、切换、删除；用户在运行中的角色页测试后回复“可以探针” |
| 2. 上传只复制，原文件不变 | 通过 | 原 PNG 字节及 mtime 与上传前相同；四态目录副本字节相同，删除角色后原图仍存在 |
| 3. 四档及颜色一致 | 通过 | 边界 100/50/21/20/6/5/0 对应 ready/tired/tired/low/low/exhausted/exhausted；真实 DOM 用 80/40/15/3 验证，进度条同步 |
| 4. 一张图降级 | 通过 | 仅传 ready 图，真实 DOM tired 饱和度 .72、low 饱和度 .42 且 .94 尺寸、exhausted 灰度/.65 透明度/.94 尺寸，已视觉核验 |
| 5. 没图用占位 | 通过 | store 初始为空；运行挂件和真实 renderer 均使用自绘几何 PNG，不空白或报错 |
| 6. 无窗口/无数据中性占位 | 通过 | characterState 返回 null，DOM 标 unknown，使用占位，灰度等旧状态滤镜清除，无额度档猜测 |
| 7. 多窗取最少者 | 通过 | 90%/3% 两窗返回 exhausted；与现有 compact 的最少剩余选择一致 |
| 8. 即时换图、换角色、取景 | 通过 | IPC 发布快照，renderer 当场更新；实际 Worker 加载 PNG/WebP/GIF，无重启；用户已测试 |
| 9. GIF 播放、静态静止 | 通过 | 本机合成两帧 GIF 读出多帧，间隔 110ms 的 canvas 内容不同；静态图 130ms 内 frame 计数不变；WebP 解码通过 |
| 10. 大文件/尺寸错误 | 通过 | 10 MiB+1 文件被拒绝；5000px PNG 头被拒绝；错误返回面板 role=alert，服务器不退出 |
| 11. 源码无用户角色素材 | 通过 | assets 仅 placeholder-ready.png；git check-ignore characters/check.txt 命中，git status 无 characters/ 用户文件 |
| 12. 固定常驻矩形角色布局 | 通过 | 真实 DOM 160×112，角色区高约 82.67 DIP；contain、矩形区域、轻投影，细条和百分比保留 |
| 13. 透明边距裁剪 | 通过 | 9×9 透明图的单像素主体裁为 1×1；几何 PNG 原图/显示预览可见主体占比增大 |
| 14. 去背景开关及原图保护 | 通过 | 白底几何 WebP 预览提示已去除；开关关闭回到原图显示；复杂背景与整图纯色保留原图；源字节不改 |
| 15. 缩放/平移与持久化 | 通过 | zoom=1.5、x=.2、y=-.1 保存，更名/切换/重新加载 store 后仍为同值；真实 DOM zoom=1.5 与开关值一致；用户测试拖动预览 |
| 16. 10 分钟零事件 | 通过 | 600,014ms，216→216 文件，120 次事件扫描，events={}；12 个检查点挂件持续运行且 focused=false |
| 17. 无网络图片上传 | 通过 | 字符路径逐项审查；唯一图片 fetch 限定 character://，仅本机 fs 响应，无 HTTP、上传服务、子进程或模型入口 |
| 18. 焦点、穿透、异常回退 | 通过 | clicks 2→3，107ms 回到 Codex；22 个形状外点命中宿主；拖动保存；10 个异常形状仍回退 1×1 DIP |

## 存储、输入与本机边界

角色素材位于 `<CODEX_HOME>/codex-quota-widget/characters/<角色名>/`，四态分别为 ready/tired/low/exhausted，保留真实 png/webp/gif 扩展名及原始文件字节。settings.json 保存去底、zoom/x/y 和四态文件名；characters/active.json 保存当前角色。未设置 CODEX_HOME 时使用 C:/Users/Chester/.codex/codex-quota-widget/。

上传从系统文件选择器取得路径，只读打开，先检查 10 MiB 上限、文件格式和尺寸，再复制到本机用户数据。原图不移动、不改写，不判断素材来源。命名使用系统名称对话框（showSaveDialog 只取名称，不另建文件），避免要求用户在自动归还焦点的主挂件中键入文字。系统对话框正常持有操作焦点，关闭后现有窗口事件钩子负责恢复宿主；主挂件焦点实现未改变。删除有本机对话框确认，仅删除已验证在角色根目录内的副本。

名称拒绝路径分隔符、空名、Windows 保留名和非法尾字符。素材/设置路径固定在角色目录内，拒绝目录及素材链接；实际 Windows junction 测试删除被拒绝，外部 keep.txt 原样保留。IPC 只接受当前 webContents，图片路径不从 renderer 参数接受；角色操作串行执行。

characters/ 已加入 .gitignore；scripts/verify.ps1 同时把该目录加入源码禁入扫描，防止强制暂存用户素材后误提交。新包内唯一图片为 assets/placeholder-ready.png，563 字节，由 scripts/generate-placeholder.cjs 用椭圆、点、线生成，采用项目 MIT 许可自由分发；没有动漫/同人/官方角色素材。SHA256：137916C3C95CE77014F9E10D810F05327E059CB4CE3DDAC37F620D5D6D683402。

素材提示位于角色面板底部：“请上传你有权使用的图片。素材保存在本机，不会上传。”

## 状态、降级与颜色

剩余最少的有效额度窗口决定状态：>50% ready，>20% tired，>5% low，≤5% exhausted。21–50 / 6–20 是整数显示口径；分数百分比使用连续边界 >20 / >5。无有效值使用中性占位，独立于用户已选角色的图片；实际额度刷新回升后回到 ready，不把倒计时过期当作已重置。

本阶段指令要求与新状态表一致，故把此前进度条 10% 的红色界线同步改为 5%：>20 正常，>5 且 ≤20 橙色，≤5 红色。token 颜色及统计不改。

状态专属图优先且不额外套降级效果；无专属图用 ready 图，再缺才用占位。仅在降级时使用：tired saturate(.72)，low saturate(.42) + .94 缩放，exhausted grayscale(1) + opacity(.65) + .94 缩放。图片主体保持宽高比、contain 缩放，可按角色参数取景；不采用圆形裁切。数字、细条与 aria-label 保留精确值冗余。

真实 renderer 回归曾发现从 exhausted 返回 unknown 后滤镜残留。复现显示 `none drop-shadow(...)` 是无效 CSS，浏览器保留旧滤镜；修为中性状态只设置投影。回归先失败、修后通过，ready/unknown 均不残留灰度或透明度。

## 去底、裁剪、动画与取景

图片由本机浏览器 Worker 的 ImageDecoder 解码，工作帧按比例缩至单边最多 512px。四周 alpha=0 边界从显示用像素副本裁掉，不改源文件。原图预览直接读原始副本，显示效果由 canvas 展示。

默认去底的判据和算法：

1. 采样四条边的一圈像素；至少 80% 边缘像素 alpha≥240 才尝试纯色背景，否则仅裁透明边距。
2. RGB 各通道按 32 色阶分簇，主簇至少覆盖不透明边缘的 80%；取簇内平均色作为背景。
3. 只从边缘开始四邻域洪泛，通道最大色差≤40 才进入，避免扣掉被主体轮廓包围的同色内部。
4. 色差≤18 变为全透明，18～40 线性降低 alpha，形成轻羽化。
5. 主色不够一致时判复杂背景；连通区覆盖≥97% 全图时视为无法分离主体，保留原图，避免整张擦掉。结果文字可见，用户可关闭开关。

9×9 白底、中央 3×3 主体裁为 3×3；关闭去底仍为 9×9。复杂边缘不误判；整幅纯白不擦空；封闭白色主体内部保持 alpha=255；色差 26 的边缘获得 0～255 之间的羽化 alpha。输入数组在处理前后字节相同。

GIF 保留原始格式，按各帧 duration 循环解码和处理，最短间隔 20ms；动画取景边界累积扩展并跨循环保留，保持帧间位移，不把 GIF 静态化。静态 PNG/WebP 仅解码一帧。最终真实 Electron GIF frame 计数达到 12，110ms 间隔的 canvas 内容变化；静态源计数为 3（累计换源），130ms 间隔无增加。计数受调度及换源时序影响，不要求每次运行相同；几何 WebP 显示“已去除边缘纯色背景”。

缩放 0.5～3×，平移 x/y=-1～1，由右侧预览 pointer capture 拖动。参数先作用于常驻 canvas，再去抖保存，切换角色后继续生效。不创建新的产品窗口，角色设置为已有面板的第三页签；较长内容在原面板滚动。

## 原生门槛与零消耗

mouse-probe-stage-3b-character.json：宿主 HWND=264322、挂件 HWND=1639212，最新 region 计算点击中心。SendInput 返回 2，clicks 2→3；前台记录 8ms 为挂件、107ms 为宿主。

| 目标时间 | 实际采样 | 前台 HWND |
|---|---|---|
| 100ms | 107ms | 264322 |
| 300ms | 310ms | 264322 |
| 1000ms | 1006ms | 264322 |

1.5s 后仍为宿主，10 步拖动 (1483,859)→(1443,835)，position.json 同值更新；拖动后三次采样均为宿主。区域间隙加网格共 22 个 WindowFromPoint root 全部为宿主。passed/clickPass/dragPass/focusPass/outsidePass 均为 true。

真实 Electron 异常形状测试 10 例：区域 2×2 物理像素，在窗口报告 144 DPI 下对应 1×1 DIP，测试窗口隐藏。desktop/geometry.cjs、desktop/WindowApi.cs、runtime/quota.cjs、runtime/read-policy.cjs、runtime/tokens.cjs、runtime/token-worker.cjs、runtime/mcp.cjs 无修改；不重做前阶段安装、跨 DPI、额度容错或 token 独立复算。

用户确认操作测试完成和其他聊天暂停后，单一工具执行完成整段静置，不继续模型采样、不启动额外聊天或 agent turn；每约 50 秒只输出工具进度。观察器以 sessions 初始字节长度为基线，每 5 秒读取新增完整行的事件类型，纳入新文件，不保存 payload。

stage-3b-idle-observation.json：

```json
{
  "startedAt": "2026-10-10T15:07:48.995Z",
  "endedAt": "2026-10-10T15:17:49.009Z",
  "elapsedMs": 600014,
  "initialFiles": 216,
  "finalFiles": 216,
  "scans": 120,
  "resetFiles": 0,
  "events": {},
  "eventFiles": []
}
```

BST 为 16:07:49～16:17:49。12 个检查点均为同一 PID=14272、fresh=true、attached=true、visible=true、focused=false、tokenCoverage=complete。events={} 表示 task_started、turn_started、token_count 均无新增，非所有未来环境的无限期保证。

代码审查技能的模板在当前任务中完成单独检查轮，不派生 agent turn。图片 Worker 唯一 fetch 前检查 URL 必须以 character:// 开头；该协议只服务 placeholder 固定文件或已验证角色目录里的四态文件，GET 以外请求拒绝。主进程响应仅 fs 读取，角色模块不引用 net/http/子进程/模型 API；renderer CSP connect-src 仅 character:，img-src 仅 self/character:。不存在把用户图片发送到网络的路径。原额度 HTTP GET 与只读快照/RPC 允许清单不变。

## 验证、截图与缓存

自动测试 38 项全部通过，新增 5 项角色/像素/文件系统测试，现有视图边界测试同步验证新颜色表。真实 Electron tests/character-ui-smoke.cjs 加载正式 HTML/preload，验证五种状态、非空 canvas、精确值、固定 160×112、四入口、预览、取景参数、WebP、GIF 与无 renderer error；320×214/270/352 三档内部滚动和底部素材提示可见。单独测试窗口不附着宿主、不请求额度。

所有截图使用自绘几何占位或本机合成的矩形/椭圆，无第三方角色图；保存在运行时目录 stage-3b-ui/：ready.png、tired.png、low.png、exhausted.png、unknown.png、settings.png、background-preview.png，已视觉核验。用户要求后，将 PNG/GIF/WebP 示例复制到 C:/Users/Chester/Desktop/Codex挂件测试素材/ 方便用户选图，原示例未移动。截图和用户上传均不进入仓库。

可复现：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1 -Native
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/Invoke-MouseProbe.ps1 -Label stage-3b-character -RequirePass -ExpandDetails
node tests/observe-quota.cjs C:/Users/Chester/.codex/codex-quota-widget/stage-3b-idle-observation.json 600000
```

UI fixture 使用已安装 Electron 启动 tests/character-ui-smoke.cjs --output <自身运行时目录>，移除 ELECTRON_RUN_AS_NODE。先在该输出目录提供仅用于验收的 animated.gif（两帧、100ms、循环）及 geometry.webp（白底蓝矩形），测试仅操作输出目录下 characters/。真实 screenshot 使用 stayHidden/stayAwake，避免唤出测试窗口。

原始证据在 C:/Users/Chester/.codex/codex-quota-widget/：stage-3b-ui/character-ui-smoke.json 与截图、mouse-probe-stage-3b-character.json、shape-smoke.json、stage-3b-idle-observation.json、stage-3b-idle-checkpoints.json。源码、插件缓存和用户数据分离。

收尾执行 stop.ps1 → codex plugin add codex-quota-widget@personal --json → 逐文件 SHA256 → start.ps1。源码清单为 git ls-files --cached --others --exclude-standard；本次 57 个文件，最终 files=57、matched=57、differences=[]。characters/ 上传内容不在清单中。中文提交，不 push；已选角色与用户设置保留，不需要重启 Codex 即可换图/改取景。
