# 右下角默认位置与重置位置验收

2026-10-10，Windows，起点5759e4e，原工作区干净。桌面自带CLI实测为0.162.0-alpha.17.2；PATH中的npm codex.ps1实测为0.156.1，本轮 `codex plugin add` 使用后者，二者版本不能混同。仅修默认位置和重置入口，不 push。

## 根因与实现

geometry.cjs 的 layout 原本已经把空位置夹到右下角；问题是 main.cjs 的额度刷新在真实宿主视口到来前调用 updateShape，把 null 在1×1占位视口下变成 (8,8)。后续真实布局把该坐标当成已有位置，呈现在左上角。

updateShape 现在沿用宿主视口就绪检查，在没有 host.bounds 或仍是1×1时延后定位，保留空位置/读取到的保存位置。layout 明写默认计算 `x=width-compact.width-EDGE`、`y=height-compact.height-EDGE`，EDGE仍为24；先计算适应视口的实际挂件尺寸，再走原 position() 夹紧。

保存位置两个坐标均为有限数字时优先使用，缺失/损坏则使用默认位置。新启动的默认定位在图片异步解码、实际尺寸变化时继续对齐右下角；第一次有效 drag 即结束默认定位。读取已有位置的启动不会进入默认定位，不随布局更新强制回角落。位置文件格式仍为 `{x,y}`。

角色面板新增「重置位置」，与「重置取景」分开。真实按钮经 preload 的 reset-position IPC 到主进程，仅接受本窗口 sender；重置空坐标后调用既有 updateShape/notifyLayout，原有位置变化保存分支负责立即落盘。拖动期间拒绝重置，避免给热路径增加写盘。拖动/snap/诊断与检查点定时器未改；geometry 的 shape 校验、全局上限、1×1回退以及 C#80ms焦点恢复均未改。

## 验收结果

| 标准 | 实测结果 |
| --- | --- |
| 1. 删除位置文件后重启 | 先停止实际挂件，备份原 position.json，再删除原文件、重装缓存并启动。1707×1019 DIP视口、200×280实际尺寸，widget与新 position.json 均为 (1483,715)，符合右下角公式。default-position-live-fresh.json passed=true。 |
| 2. 拖动后重启沿用保存位置 | 隔离真实 Electron 实际 main/IPC 从右下角拖到 (120,140)，结束保存；另一个 Electron 进程重启后仍为 (120,140)，见 saved.json/restart-saved.json。真实桌面10步拖动保存 (1443,691) 后，重启角色恢复成288×404，旧坐标超界，按原夹紧规则变为 (1395,591)；原“坐标完全不变”检查为false，但与独立计算的夹紧值一致，见 live-drag-restart及live-drag-clamp证据。没有把该尺寸变化记为强制默认定位。 |
| 3. 小视口 | 删除隔离位置文件，100×80视口、原始角色约200×280，实际缩小至34×48，位置 (42,8)，区域右/下边界76/56，保留24边距。20×20极小视口自动测试仍返回1×1安全形状。 |
| 4. 重置立即生效并持久化 | 隔离真实 renderer 点击角色页签和「重置位置」按钮，经真实preload/主进程IPC，将 (120,140) 移至 (676,396)，900×700视口、200×280挂件，position.json同步一致。用户桌面操作后回复“可以探针”。 |
| 5. 重置后重启 | 再启动独立Electron进程，保存位置仍为 (676,396)，见 restart-reset.json。 |
| 6. 拖动性能 | 真实fs写入计数，每组120 drag回调的诊断/位置写入均0，end才各写一次。与5759e4e三轮配对数据见下表；没有热路径I/O回退。 |
| 7. 焦点与穿透 | clicks 2→3，122ms前台回到Codex HWND919662；实际106ms采样仍为挂件、308/1009ms为宿主。22个形状外点均命中宿主；切走后不抢回焦点，实机mouse-probe-default-position.json passed=true。 |
| 8. 异常回退 | verify.ps1 -Native：10组非法输入回退为1×1 DIP；144 DPI下原生形状2×2物理像素，窗口隐藏。 |
| 9. 零消耗/本机图片 | 允许清单、网络/图片协议没有改动；未运行exec/review/启动agent turn操作，无新增图片上传或素材。所有隐藏Electron fixture用空账户reader/token Worker，只有本机文件/管道。未将此前10分钟静置记为本轮新实测。 |

新增回归先在旧代码复现失败：1×1提前定位为 (8,8)，且无重置IPC；修复后56/56自动测试通过。测试包括损坏/null/非数字位置、保存位置、异步解码缩小、拖动0写入、重置持久化/重启、长拖动检查点、吸附与形状安全。

## 性能原始数据与复现

执行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/Invoke-DragIoSmoke.ps1 -Baseline 5759e4e -Runs 3`，历史主进程只读加载，不移动HEAD；真实隐藏Electron/setShape/fs写入，替换账户读取边界。

| 120事件场景 | 5759e4e三轮耗时ms | 本次三轮耗时ms | 中位数 前→后 |
| --- | --- | --- | --- |
| 视口内，第一批次 | 52.924 / 38.988 / 44.017 | 37.423 / 28.418 / 51.968 | 44.017→37.423ms |
| 边缘来回，第二批次 | 23.150 / 19.570 / 23.128 | 22.472 / 19.898 / 22.152 | 23.128→22.152ms |

两边每轮均0位置/诊断写入，松手共2次写入。边缘批次仍约20ms；首次批次存在约28–53ms的进程启动/运行时及系统调度波动，不声称所有测量均20ms，也不把批次耗时当鼠标显示延迟。配对中位数未回退。

首轮测量fixture因遗留 bridge.json 连到旧进程而超时；仅测试工具增加当前PID检查并显式捕获连接错误，后续重复执行通过。未为此修改生产桥接/拖动行为。

受控时钟测量：`node tests/measure-drag-io.cjs <输出文件>`。120回调零写入/序列化；6秒720事件有12次500ms诊断和4次位置检查点，与上一拖动修复相同。“零写盘”指高频回调，定时器例外不变。

位置复现：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/Invoke-DefaultPositionSmoke.ps1`，按fresh→saved→restart-saved→reset→restart-reset→small→corrupt运行真实main/preload/renderer，隔离文件且窗口隐藏。7个案例均passed=true。

证据保存在 `~/.codex/codex-quota-widget/`：default-position-native/*.json、default-position-live-fresh.json、default-position-live-drag-restart.json、default-position-live-drag-clamp.json、mouse-probe-default-position.json、default-position-drag-comparison.json、drag-io-native/5759e4e-run-{1,2,3}/{before,after}.json。

## 缓存与审查

完成验收后还原测试前备份的用户位置，最终stop→重装缓存→逐文件SHA256→缓存start。90/90文件SHA256一致，逐项结果见default-position-cache-hashes.json，不计缓存.git元数据。最终原位置 (1395,591) 恢复，visible/attached=true、focused=false，见default-position-final-state.json。文档之外未新增素材、凭据或账户数据。

单独只读审查5759e4e到本次变更：保存位置优先、占位视口不定位、默认坐标经过夹紧、重置复用现有保存分支、drag不写盘、IPC限定sender、焦点/形状/图片网络边界不变，未发现阻塞问题。系统DPI96而窗口报告144仍沿用待观察记录，本次不处理。
