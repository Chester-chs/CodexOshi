# 角色图片格式修复验收

2026-10-10，基于 60d420e。环境：Windows x64、Node v24.19.0、Electron 44.3.0、Codex CLI 0.162.0-alpha.17.2。所有自动测试图片仅为自绘矩形/椭圆或项目几何占位，按 MIT 许可自由分发，无动漫素材、用户上传图片或凭据。

## 修复范围

- desktop/characters.cjs：系统选图过滤器加入 jpg/jpeg/bmp，仍支持 png/webp/gif；增加“所有文件（按图片内容校验）”，使未知扩展名的合法内容也可选。未加入 HEIC。
- runtime/characters.cjs：imageInfo 根据内容识别 JPEG SOI/长度分段/SOF（基线与渐进）、BMP BM/DIB（12 字节核心头及 40 字节以上信息头，包含负高度），取得尺寸和 MIME；不按原文件扩展名拒绝。JPEG 副本统一保存 .jpg，PNG 改名 .jpg 仍保存 .png。
- 同步放开 read() 的持久化文件名白名单为 png/jpg/jpeg/webp/gif/bmp，否则 JPEG/BMP 保存后会被读取侧丢弃。importFile 原来没有独立的源扩展名白名单，其内容校验及此读取白名单均已同步。
- 无效内容提示“请选择 PNG / JPG / JPEG / WebP / GIF / BMP 格式的图片。文件内容无效或不受支持。”面板可见，不退出进程。10 MiB、4096px、仅复制、源字节不变的限制保持。

真实 Electron 的 ImageDecoder.isTypeSupported('image/bmp') 返回 true；JPEG/BMP 均走原有本机 Worker，所以 image-worker.js 无需修改。没有增加依赖、MSVC 或任何网络图片路径。

## 自动验收

tests/character-formats.test.cjs 新增 2 项回归测试：最初均因 JPEG/BMP 内容不支持而失败；修复后通过。真实 Electron tests/character-format-smoke.cjs 最初在对话框边界报“dialog must expose .jpg”，修复过滤器后通过。自动 fixture 仅替代操作系统选图交互来提供预定文件，IPC、CharacterStore、character:// 协议、正式 renderer 与 Worker 均为实际实现；它不替代下面的用户原生对话框确认。

| 验收项 | 自动实测结果 |
|---|---|
| 1. JPG | 63×47 基线 JPEG 导入成功，MIME image/jpeg，常驻 canvas 非空且 source 指向新素材 |
| 2. JPEG | 63×47 渐进 JPEG 同上，副本 .jpg，原 .jpeg 保留 |
| 3. PNG/WebP/GIF/BMP | 四种均导入及真实 Worker 显示成功，MIME 分别 image/png、image/webp、image/gif、image/bmp |
| 4. PNG 改名 JPG | 导入成功，MIME image/png；未知 .dat 文件的相同 PNG 内容也成功 |
| 5. TXT 改名 PNG | IPC ok=false，列出全部支持格式；通过正式上传按钮的面板错误文字也一致；随后再次上传 JPEG 成功，进程未崩溃 |
| 6. 上限 | 10 MiB+1 文件明确拒绝；4097px JPEG/BMP 明确拒绝；原有 5000px PNG 拒绝测试仍通过 |
| 7. 原文件保护 | 每种真实 fixture 上传前后字节与 mtime 相同，原路径仍存在；所有四态 JPEG 副本逐字节相同 |
| 8. 即时更新 | 不重启 renderer，8 次换源均观察到 canvas.dataset.source 更新到对应快照 URL，像素非空，未回退占位 |
| 9. 四态 JPG | ready/tired/low/exhausted 分别导入 JPG，并用 80/40/15/3% 观察到实际对应态 URL；重载 store 后四态 MIME/原字节保持 |

自动测试总计 40/40，通过 scripts/verify.ps1 -Native；异常形状共 10 类，真实 Electron/Win32 region 为 2×2 物理像素（144 DPI，即 1×1 DIP），测试窗保持隐藏。

原始真实 renderer 结果：运行时目录 character-format-smoke/format-smoke.json。复现命令（从仓库运行，脚本执行策略需 Bypass）：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/Invoke-CharacterFormatSmoke.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1 -Native
```

## 用户原生对话框与桌面门槛

修复版已启动，并将自绘测试文件放到 C:/Users/Chester/Desktop/Codex挂件测试素材/：几何格式.jpg、几何格式.jpeg、几何格式.bmp、PNG改名.jpg、文本伪装.png。用户在收到逐项原生选图/显示/错误提示测试请求后回复“可以探针”，未报告问题。该回复作为进入桌面探针的确认；各格式详细结果另由上述真实 renderer 自动实测提供，不把自动选择替身描述成原生对话框自动化。

执行 tests/Invoke-MouseProbe.ps1 -Label character-formats -RequirePass -ExpandDetails，结果 passed=true（运行时 mouse-probe-character-formats.json）：

- 宿主 HWND=1313360，挂件 HWND=395516。从 window-state.json 的 region 计算中心；Win32 SendInput 返回 2，clicks 3→4。
- 前台在 19ms 时为挂件，113ms 时恢复宿主；100/300/1000ms 目标的实际采样为 113/300/1013ms，全部为宿主 HWND，1.5 秒后仍为宿主。满足 300ms 恢复门槛。
- 按下→移动 10 步→松开，widget (1523,883)→(1483,859)，position.json 同步变成后者；拖动后 109/311/1010ms 均为宿主。
- 形状外 23 个 WindowFromPoint 采样（含两个可见矩形之间的空隙）全部命中宿主；clickPass、dragPass、focusPass、outsidePass 全为 true。有限采样不等同于逐像素穷举。
- 异常形状 10 类的真实 Electron/Win32 1×1 DIP 回退已通过，见前述 Native 输出。

desktop/geometry.cjs、desktop/WindowApi.cs、desktop/ui/image-worker.js 和额度/token/允许清单核心均未改动。focusable:true、C# 延后 80ms 恢复宿主焦点和形状异常回退保持原样。

## 零消耗静置

用户明确回复“已暂停，可以静置观察”，暂停其他聊天任务后执行。Europe/London 本地 16:45:09→16:55:09（BST/UTC+1），原始结果保存于运行时 character-formats-idle-observation.json：

```json
{"startedAt":"2026-10-10T15:45:09.292Z","endedAt":"2026-10-10T15:55:09.327Z","elapsedMs":600035,"initialFiles":219,"finalFiles":219,"scans":120,"resetFiles":0,"events":{},"eventFiles":[]}
```

另有 character-formats-idle-checkpoints.json 共 12 个检查点，均为运行进程 PID=21708、诊断新鲜、attached=true、visible=true、focused=false。观察期间一次连续工具编排，每约 50 秒报告状态，无模型中途采样；无新 turn/token 事件。观察器只读 session 新增事件的类型，不存事件内容；未执行 codex exec/review 或其他 agent turn。图片上传只读所选本机文件并复制到本机角色目录，协议限定 character://，未新增网络请求或图片上传。

## 缓存与交付

执行 stop → CLI plugin add → start。首轮重装失败“failed to back up plugin cache entry: 拒绝访问 (os error 5)”；实测两个 node runtime/mcp.cjs 的 cwd 都是本插件缓存目录，确认后仅停止这两个本插件进程，再执行 plugin add 成功。没有停止 Codex 或其他插件。

功能代码安装后初次逐文件 SHA256 66/66 相同，differences=[]。最终验收文档加入后包内 67 个文件；再次 stop → plugin add → 逐文件 SHA256 → start，最终实测 67/67 相同，differences=[]，原始结果保存运行时 character-formats-cache-hashes.json。

按 requesting-code-review 的当前聊天复核方式，对照 60d420e 检查生产改动与回归测试；未发现阻塞问题。JPEG 分段长度及 BMP 头尺寸读取均有边界校验，持久化白名单与内容扩展名/MIME 一致。中文提交，不 push。
