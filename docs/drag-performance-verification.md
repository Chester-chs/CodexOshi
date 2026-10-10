# 拖动滞后修复验收

2026-10-10，Windows，Codex CLI 0.162.0-alpha.17.2。起点为 bab3619（支持完整立绘自适应尺寸并修复面板滚轮输入），原工作区干净；阶段 4a 已单独提交，本修复另行提交，不 push。

## 修改与边界

desktop/main.cjs 的 drag 回调只更新内存坐标、经过既有 layout/shape 校验设置原生形状并预约通知，不调用磁盘写入或 JSON.stringify。geometry.cjs、吸附、视口夹紧、图片路径及 C# 延后 80ms 恢复焦点均未改。

诊断通过单个 500ms 定时器合并，layout 通知通过单个 16ms 定时器发送最新值。renderer 拖动期间只移动元素、必要时调整画布，跳过卡片和角色设置重建，结束通知立即恢复完整渲染。额度/token 快照只保留最新待保存值，结束再落盘。

position.json 在 end 时按原吸附/夹紧结果写一次。若一直没有 end，从拖动开始 3 秒起，每 1 秒由独立定时器保存最新位置；end 取消该定时器并立即保存。退出清理新增定时器。异常退出前 3 秒可能丢失本次位置，之后检查点最多落后约 1 秒（不含事件循环调度延迟）。

“零写盘”指高频 drag 回调本身。用户要求的 500ms 诊断与长拖动位置检查点仍会写盘；token Worker 的既有索引保存也不是指针回调。不宣称整个进程或系统在拖动区间完全没有 I/O。

## 写盘前后实测

`node tests/measure-drag-io.cjs <输出路径>` 读取 `git show bab3619:desktop/main.cjs`，前后执行同一实际 IPC 处理函数，替换 Electron/账户/磁盘外部边界，统计写入及序列化函数调用。受控时钟复现定时行为；不是操作系统物理刷盘计数。

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/Invoke-DragIoSmoke.ps1` 在隔离目录、隐藏真实 Electron 窗口中执行前后实际 main.cjs，保留真实 fs.writeFileSync、原生窗口与 setShape，仅替换账户 reader/token Worker，无账户或网络读取。每组连续同步发送 120 个 drag，记录区间内真实写入调用与耗时，再发送 end。Git 历史只读获取，不移动 HEAD。

| 120 事件场景 | 修复前诊断 / 位置写入 | 修复后诊断 / 位置写入 | 前 / 后处理时间 |
| --- | --- | --- | --- |
| 视口内逐步移动 | 120 / 0 | 0 / 0 | 523.411 / 23.096ms |
| 超出视口来回移动，触发夹紧 | 120 / 120 | 0 / 0 | 562.196 / 20.135ms |

修复后 end 各写位置与诊断一次，共 2 次；普通组最终坐标 (369,150)，边缘组 (676,396)。批次处理约改善 22.7 倍 / 27.9 倍，这是本机单轮处理耗时，不等同于端到端鼠标显示延迟或稳定 FPS。旧版普通位置不是每事件写位置；仅夹紧等造成二次坐标变化时才额外写位置，但每事件必写诊断。

受控时钟连续 6 秒、120Hz、720 事件：诊断 720→12 次，位置 0→4 次（第 3/4/5/6 秒检查点），布局通知 720→360 次。修复后同步 120 事件 JSON.stringify 为 0 次。真实 renderer 收到 120 拖动布局通知时完整 render 为 0 次，最新 left=431px；结束后完整 render 恢复。

运行时原始证据：drag-io-comparison.json、drag-io-native/before.json、drag-io-native/after.json、stage-4a-ui/portrait-ui-smoke.json。测试窗口均隐藏，不将账户统计或用户素材收入仓库。

## 逐项验收

| 标准 | 结果与证据 |
| --- | --- |
| 1. 拖动跟手 | 高频阻塞已消除，120 事件 523→23ms；用户完成操作后回复“可以探针”“可以复测”。未取得单独的主观延迟量表，不将批次耗时称为鼠标显示延迟。 |
| 2. 快速来回不积累延迟 | 边缘交替 120 事件约 20ms 完成；单定时器合并最新布局，720 事件无通知队列积累。 |
| 3. 高频路径无磁盘写 | VM 与真实 Electron 均为 120 个 drag 回调内 0 写入；定时器例外见上文。 |
| 4. 松手保存 | 大角色 10 步 SendInput 拖动后 widget/position.json 均为 (1355,567)，dragPass=true；自动回归验证一次保存吸附后的最新值。 |
| 5. 重启恢复 | 稳定尺寸 288×404 DIP，stop→缓存 start 后 widget/position.json 均恢复 (1395,591)，visible/attached=true，见 drag-fix-restart.json。首次检查因角色由 200×280 恢复为 288×404 后夹紧到新边界；按最终尺寸重测通过。 |
| 6. 吸附 | snap 调用未改；回归 (570,290) 在 800×600 视口吸附为 (577,296)，另覆盖多尺寸及视口缩小。 |
| 7. 形状与穿透 | 大角色 23 个形状外采样点（含角色/面板空隙）WindowFromPoint 全命中宿主919662，outsidePass=true；120 回调有120次 shape 更新。 |
| 8. 展开/收起 | 两轮实机点击成功并展开两个 region；隐藏 Electron 验证 0/1/2 额度面板、角色设置及结束恢复渲染。 |
| 9. 焦点 | 大角色 clicks 0→1，113ms 回到宿主，113/301/1003ms 实际采样均为宿主；另一轮121ms恢复。切走后不抢回焦点也通过。 |
| 10. 异常回退 | verify.ps1 -Native 的10组异常输入回退；144 DPI下2×2物理像素=1×1 DIP，窗口隐藏；geometry.cjs 未改。 |
| 11. 零消耗、图片本机 | 允许清单、网络与图片协议未改，未运行 exec/review/agent turn；真实 I/O fixture 使用空 reader/Worker。52项回归包含只读RPC/HTTP路径限制，无新增上传/素材。未重复4a的10分钟静置，已有证据见 stage-4a-verification.md，不记为本次新测量。 |
| 12. 量化证据 | 实际处理函数与真实 Electron 双重写入计数；上述命令可复现普通/夹紧/长拖动/结束保存。 |

最终自动测试52/52通过，Native形状回退通过。隐藏 UI smoke 首次与其他原生fixture并行时滚轮断言失败（scrollTop=0），随后同一源码通过 Invoke-PortraitSmoke.ps1 串行复测，scrollTop达标且focused=false；保留时序敏感性记录，未删除断言。

大角色探针：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/Invoke-MouseProbe.ps1 -Label drag-io-large -RequirePass -VerifySwitchAway -ExpandDetails`。从 window-state.json 动态计算中心，校验 HWND 后注入点击/10步拖动，检查外部命中与切走焦点；mouse-probe-drag-io-large.json 的 passed=true。

## 安装与审查

stop→plugin add→逐文件 SHA256→缓存 start。最终文件数及逐文件结果见运行时 drag-fix-cache-hashes.json；比较 Git 管理及未忽略源码文件，缓存 .git 元数据不纳入发布文件计数。

对 bab3619 到当前变更单独只读审查：end/退出取消定时器、布局不排队、非拖动诊断仍即时、最终渲染恢复，形状/焦点/网络边界不变；未发现阻塞问题。系统DPI96/窗口144的待观察项沿用4a，本次未处理。
