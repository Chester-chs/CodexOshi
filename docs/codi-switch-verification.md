# Codi 可见开关与双语文档验收（2026-10-11）

## 实现与交互

- 设置卡片顶部新增可点的 Codi 开关。关闭后隐藏立绘、进度条、对话及卡片；Codex 客户区右下角留下 120×42 DIP 的小开关，再点恢复。这个控件由插件叠加显示，不修改 Codex 原生设置页。
- widgetEnabled 保存到现有 panel-preferences.json；缺少字段的旧设置默认开启。开关只接收合法 sender 的 boolean，不接受拖动或卡片调整中的请求。保存失败时保持原状态并提示。
- 关闭后不发起新的额度刷新或 token 读取，终止当前 token Worker；已发出的额度请求可能完成，但关闭状态下不落快照或发渲染通知。恢复后重新读取。后台窗口跟随与小开关继续运行，完整退出仍可使用 stop.ps1。
- 关闭时不改角色尺寸、不写 position.json，不将小开关坐标覆盖到原立绘位置。开启恢复原尺寸与自由拖动位置；默认固定模式继续跟随右下角。
- 大小和宽度位于角色页相邻两行，保留滑杆与数字输入。倍数输入、编辑焦点例外、卡片稳定、形状预算与异常回退沿用现有路径。

## 测试证据

- 改动前，两行相邻断言失败（false !== true）；可见开关 IPC 回归失败（没有 widget-enabled handler）。改动后均通过。
- `scripts/verify.ps1 -Native`：**110/110** 通过，10 个异常形状仍回退 1×1 DIP（本机 144 DPI 为 2×2 物理像素）。既有拖动写盘回归通过，geometry.cjs、C# 80ms 焦点恢复与网络允许清单未改。
- 主进程回归：拒绝 null／1／字符串／对象；关闭保存 widgetEnabled=false；120×42 开关正确夹紧；不写位置文件；假时钟推进 31 秒，额度／token 请求计数不增加。开启后恢复原自由位置，并重新读取一次额度与 token。以关闭偏好重新加载时，启动额度与 token 读取均为 0。
- `tests/Invoke-ResidentSmoke.ps1`：真实隐藏 Electron 验证设置顶部开关关闭、立绘隐藏、关闭偏好落盘。1600×1000 视口中 off region 为 **120×42 @ (1456,934)**。通过真实 Chromium 指针事件点小开关，恢复 **240×300 @ (1336,676)**；数字输入、两行相邻、卡片稳定、视口缩小等回归通过。
- `tests/Invoke-ResidentSmoke.ps1 -Restart`：在上一进程通过 UI 保存关闭状态后重启，确认 `restartedOff=true`、仅小开关可见；点小开关恢复保存的 240×300、3.2× 与固定偏好。
- `tests/Invoke-CardSmoke.ps1`：两段对话、气泡关闭后第一段重置、页内编辑、两种语言、滚轮、关闭、调整卡片大小及小视口夹紧通过。

上述鼠标输入只发生在隐藏 Electron 测试窗口，不操作用户真实鼠标。未进行新的现场 300ms 焦点与形状外实际滚动／选中测试；不将隐藏测试当作这些项目的现场证据。原始证据：运行时 resident-dock-ui/resident-ui.json、restart.json。

## 仓库与文档

GitHub 仓库改名为 Chester-chs/Codi，保留私有属性；本地 origin 指向新地址。About 保留 Codex、quota、token usage 与原 codex-quota-widget 名称，增加对应 topics。旧名字的跳转行为遵循 [GitHub 改名说明](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)。私有仓库不会因此公开。

参照 CS2 HLTV Chinese Reader：README.md 为英文，README.zh-CN.md 为中文，顶部互相切换。更新当前柱状图、七套主题、自定义色、两段对话、尺寸与开关行为，保留安装固定路径、读取范围、隐私、token 统计限制、许可证与详细验收链接。插件 ID 和数据目录保留旧名称，兼容现有安装。

截图只包含几何测试角色和合成数据：

![相邻大小与宽度及顶部开关](images/resident-framing-width.png)

![关闭后保留的小开关](images/codi-switch-off.png)

## 本机部署

stop → 更新缓存 → start 完成。源码与缓存 **199/199** 文件 SHA256 一致，部署前后用户素材及偏好 **7/7** 文件哈希一致。缓存进程 PID **18436**，visible=true、focused=false，用户当前尺寸 **300×253 @ (1383,742)**，视口 1707×1019。原始部署记录为运行时 resident-dock-deployment.json。文档补记后再次同步并核对哈希。

## 后续整理：安装说明与控件分组（2026-10-11）

中英文 README 将安装改为两种方法：优先复制提示词让 Codex 检查依赖并安装，或按三步手动安装。提示词保留固定安装路径、现有数据与修改，并由用户自行重启 Codex；文档同时说明私有仓库下载权限。新增透明背景、全身完整 Q 版形象建议，普通立绘仍可使用；删除项目原名介绍。

角色页按「大小 → 宽度 → 取景倍数」相邻排列，取景不再放在预览下方。顶部标题与 Codi 开关使用同一布局分组，间距 10 DIP，关闭按钮留在右侧。隐藏 Electron 对两处相邻关系及标题／开关实际间距新增断言，修改前失败、修改后通过，截图更新为当前布局。

连续尺寸编辑测试发现旧保存快照偶尔覆盖新编辑：360 的保存回执将尚未保存的 240 恢复为 360。现在按角色保留最新本地草稿；服务端快照到达时合并未完成的草稿，仅最新保存成功的回执解除保护。回归验证旧回执不能覆盖 240，240 保存确认后仍可接收外部新快照 280，未通过忽略所有快照来掩盖问题。

`scripts/verify.ps1 -Native`：**111/111** 通过，10 个异常 shape 输入仍回退 1×1 DIP；`Invoke-ResidentSmoke.ps1` 及 `-Restart` 再次通过，数字编辑、卡片稳定、关闭状态重启及小开关恢复正常。测试只使用本机占位数据，不操作用户鼠标。README 的语言互链、安装提示词和相对文件链接均已校验。

本次部署：源码与缓存 **200/200** 文件 SHA256 一致，用户素材及偏好 **7/7** 文件保持一致。缓存进程 PID **6920**，visible=true、focused=false；CardSmoke 亦通过。文档补记后再次同步并核对全部文件。

## GitHub 预览修正（2026-10-11）

预览图在隐藏 Electron 的 panel-reveal 淡入动画早期捕获，旧 PNG alpha 最大值仅 21/255，GitHub 白底显示近乎透明。新增截图不透明像素占比 >95% 的断言，先复现失败，再在捕获前完成该卡片动画并确认 computed opacity=1；ResidentSmoke 通过。重新生成的 720×840 PNG 有 99.90% 完全不透明像素，已人工查看。产品动画和挂件行为不变。中英文 README 同步解释 Node.js 的安装／状态接口用途、24+ 的已测试基线，以及 Git 仅用于下载更新、ZIP 可替代。
