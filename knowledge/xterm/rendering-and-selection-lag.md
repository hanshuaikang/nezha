# 终端渲染与选区卡顿——已经踩过的坑

- **描述**：WKWebView 下 `.xterm` 合成层长帧的定论 + 两条不能反向走的决策，面向后续动渲染链路前的对齐
- **标签**：`xterm`, `wkwebview`, `composite`, `webgl`, `selection`, `regression-guard`

> 动 `terminalShared.ts` / `TerminalView.tsx` / `App.css` 的 `.xterm` 相关规则之前必读 §1。两条结论都已用 Safari Timeline 录制 A/B 过（数据见 §4），不要再重复实验。

---

## 1. 决策表（动手前必读）

| 项 | 当前 | 不要变更 | 锚点 |
|---|---|---|---|
| `.xterm { contain / isolation / will-change / 3D transform }` | **禁用** | 不要重新加任何一条 | `src/App.css` 上 `.xterm` 选择器位置已替换为防回归注释段 |
| `WebglAddon` | **启用** | 不要关 / 不要改 noop | `src/components/terminalShared.ts::loadWebglAddon` |
| `createSmartWriter` watermark 128KB/16KB | 保留 | 数值可调，不能取消 | `src/components/terminalShared.ts::createSmartWriter` |
| macOS WebKit terminal guard | 保留 | 不要删 inert / xterm selection 监听 / document 级 pointerup | `src/components/terminalShared.ts::attachMacWebKitTerminalGuard` |
| `tauri::ipc::Channel` 直投 agent 输出 | 保留 | 不要换回 `emit/listen` | `src-tauri/src/pty.rs::OutputSink::Channel` |

---

## 2. 为什么 `.xterm` 不能加 containment

- Chromium 把 compositor 放 GPU 进程，多一层免费；**WKWebView 的 compositor 在主线程**。
- `.xterm` 内部本来就有 canvas / helpers / decoration / link / selection 多个潜在子层。`contain: paint` 或 `isolation: isolate` 让这些子层更激进地 promote 成 sub-layer，单次 composite 主线程上 100–700 ms。
- 理论收益（防 xterm 内部变化外溢）在 xterm 的绝对定位 + 固定尺寸结构下几乎不发生。性价比负数。

数据见 §4 录制 A → 录制 B 列的 composite 对比。

---

## 3. 为什么不能为了"避免选区爆点"关 WebGL

xterm v6 只剩 WebGL 和 DOM 两种 renderer（Canvas 已废）。关 WebGL = 必走 DOM = 每行一个 DOM 节点，**mousemove 高频时持续小卡顿**比 WebGL 偶发爆点更差。

Nezha 的工作流以"鼠标在终端区域活动"为主（hover、点击、移动），长拖选区罕见 → WebGL 的偶发爆点比 DOM 的持续小卡顿更可接受。

数据见 §4 录制 B → C → D 列。其中 C（静态）单独看 DOM 更快，但 D（鼠标频繁）反弹接近原始水平——必须同时看 C 和 D 才不会被误导。

---

## 4. 四份 Safari Timeline 录制并排对照

每列对应一种代码状态 × 一种交互场景。**结论的所有证据都在这张表里**。

| 指标 | A. 原始（有 containment + WebGL） | B. 删 containment（保 WebGL） | C. 删 containment + 关 WebGL，静态 | D. 删 containment + 关 WebGL，鼠标频繁 |
|---|---|---|---|---|
| 时长 | 3.3 s | 3.5 s | 3.1 s | 2.7 s |
| **composite 总耗** | **985 ms** | 672 ms | **358 ms** | 554 ms |
| **composite 峰值** | **744 ms** | 409 ms | 151 ms | 353 ms |
| paint 总 | 2 ms | 1 ms | 118 ms | 47 ms |
| layout 总 | 1 ms | 3 ms | 145 ms | **203 ms** |
| 最长 rendering frame | — | — | 1143 ms | **511 ms** |
| JS 堆 | 834 MB | 486 MB | 383 MB | 443 MB |
| **mousemove 事件计数** | — | 197 | 21 | **1233** |
| 主线程 CPU 峰值 | 98% | 98% | 97% | 96% |

**读法：**

- **A → B**：删 `.xterm` 上的 containment，composite 总耗 -32%，峰值 -45%。证明 containment 是 composite 长帧主因。
- **B → C**：再关 WebGL，静态场景下 composite 看似继续下降，但 paint 和 layout 同时 +100×。这是 DOM renderer 的固有代价转移。
- **C → D**：同样 DOM renderer，鼠标活动一密集（mousemove 从 21 → 1233），composite/layout 立刻反弹到与 A 同档。这正是 Nezha 日常画像，所以决定**保留 WebGL**。
- JS 堆从 834 → 443 MB 的下降是高分配率噪声减少的副作用，**不是改善卡顿的主因**——A 列的 744 ms composite 期间 JS 几乎没在跑。

录制原始文件保留在用户本地，未入仓。如需复现：`pnpm tauri dev` → Safari Develop → Web Inspector → Timeline，按 §5 的诊断小抄复测。

---

## 5. 卡顿诊断小抄

下次有人报告终端卡顿时按这个走，**不要靠直觉猜 JS 堆 / GC**：

1. **必须区分场景录 timeline**：静态 / 鼠标活动 / 选区拖动各录一份。同一现场不同交互表现完全不同（§4 的 C 和 D 是惨痛例子）。
2. **Safari Timeline 的 `timeline-record-type-layout` 必须按 `eventType` 拆开统计**：composite / paint / 真 layout / recalc-styles。直接看总和会把 composite 误判为 layout。
3. 长帧归因：
   - **composite 大头** → CSS containment / will-change / parent transform 之类的 layer promotion（→ §1, §2）
   - **layout/paint 大头** → DOM renderer 行为（→ §3，验证是不是 WebGL 被关）
   - **script 大头** → 看 callFrames
   - **rendering-frame 长但子项加起来不长** → 主线程被高频 event 队列填满（mousemove/pointermove 计数 / IPC backlog）

---

## 6. 已知缺口（未修，留给后续）

| 缺口 | 影响 | 触发条件 |
|---|---|---|
| `selectionPaused = true` 后 pointerup 丢失（pointercancel / 系统手势 / 拖出窗外） | SmartWriter `pendingChunks` 无上限增长直到下次成功 pointerdown→pointerup | 鼠标手势打断选区拖动 |
| `webglAddon.onContextLoss` 只 dispose 不 re-attach | context loss 后变成 DOM renderer，§3 的负向交易开始生效 | GPU 内存压力 / 系统休眠 |
| `SessionView` 同步 `marked(async:false)` + 全文件加载 JSONL | JS 堆短期飙升，加重高分配率（但与本文卡顿不直接相关） | 打开很长的 session |

---

## 7. macOS NSTextInputClient 风暴（与 §4 完全无关的另一条路径）

> 这是 2026-05-19 实测发现、2026-05-22 重新核对过的**独立卡顿来源**，sample 工具锁定。和 §1–§4 的 composite 长帧不是同一回事，**先看现象判断走哪条路径**：

| 现象 | 路径 |
|---|---|
| 鼠标在终端上移动时持续小卡顿 | §1–§4 composite/layout（保持 WebGL，不要加 containment） |
| 框选大段文本后 / 长会话运行很久后突发 100% CPU 卡死，reload 立刻好 | §7 NSTextInput 风暴（本节） |

### 7.1 现场

- pid 持续 100% CPU、状态 `R`
- `sample <pid> 5` 主线程 99.7% 在：
  ```
  IPC::handleMessageAsync<WebPage::CharacterIndexForPointAsync>
  └─ LocalFrame::rangeForPoint
     ├─ visiblePositionForPoint (HitTest)
     └─ canonicalPosition → PositionIterator::increment × 1500+
        └─ RenderText::nextOffset → CachedTextBreakIterator::setText
           → CFStringCreateImmutable / CFRelease（ICU emoji grapheme 簇）
           → __CFStringGetExtendedPictographicSequenceComponent
  ```
- reload 后立刻归零，物理内存 1.2G → 493M

### 7.2 触发链

1. WebGL renderer 启用后，xterm v6 会同步 dispose DOM renderer，当前 `.xterm-rows` 不存在；旧文档里“WebGL 仍写 row span”的模型是错的。
2. 用户在 xterm 内拖选或保留 selection 后，macOS NSTextInputClient（IME 候选词浮窗追踪 / 拼写检查 / AX）会持续轮询 `characterIndexForPointAsync`。2026-05-22 的 Timeline 录制显示，即使没有 pointerdown、只有 mousemove，也可能进入持续轮询。
3. WebKit 处理单次查询时走 `LocalFrame::rangeForPoint` → `canonicalPosition` → `PositionIterator::increment`。sample 栈里出现 `HTMLImageElement::canContainRangeEndPoint`，说明游走目标不是 `.xterm-rows`，而是 Nezha 自己的含 `<img>`/emoji 的 DOM 子树（task list、project rail、session markdown 等）。
4. 单次查询可能花 50–200ms；macOS 进入持续轮询后，主线程 CPU 正反馈到 100%。Safari Timeline 通常只看到短事件和 CPU 飙升，看不到 WebKit C++ 层长任务。

### 7.3 当前防线

当前防线在 `src/components/terminalShared.ts::attachMacWebKitTerminalGuard`，agent 终端和 shell 终端都必须使用：

1. 给终端容器加 `.xterm-macos-ime-guard`。`src/styles/xterm.css` 的 `.xterm-rows { pointer-events: none }` 现在主要是 WebGL context loss / DOM renderer fallback，不是当前主路径。
2. 关掉 helper textarea 的 `autocomplete` / `autocorrect` / `autocapitalize` / `spellcheck`，减少 macOS 主动文本定位查询。
3. 通过 xterm 自己的 `onSelectionChange` / `hasSelection()` 判断终端是否有 selection。不要用 `window.getSelection()`，WebGL renderer 下 xterm selection 不等价于浏览器原生 selection。
4. selection 或拖选期间，把“终端到 `body` 祖先链上的所有兄弟子树”设置为 `inert`。不要只遍历 `document.body.children`：React 应用通常只有一个 `#root`，直接子节点方案会跳过整个应用，实际 inert 不到 task list / project rail。
5. `pointerup` / `pointercancel` 挂 `document`，避免拖出终端后漏恢复；点击终端外或按 Escape 时清除 selection 并恢复 inert。

旧的 MutationObserver row sanitizer 已删除：WebGL 正常启用时 `.xterm-rows` 已被同步移除，observer 找不到目标，是死代码。

### 7.4 诊断小抄（覆盖原 §5）

下次终端卡顿先按这个走，**不要先怀疑 PTY backpressure / SmartWriter / IPC backlog**——这些都是猜测，浪费时间：

```bash
# 1. 找到 100% 的 WebContent pid（多个 WebContent 进程时挑 nezha 那个）
ps aux | grep WebKit.WebContent | grep -v grep | sort -k3 -rn | head

# 2. 采样 5–8 秒
sample <pid> 5 -file /tmp/nezha.sample

# 3. 看顶部 100 行栈
head -100 /tmp/nezha.sample
```

判断分支：

- 主线程顶部出现 **`CharacterIndexForPointAsync` / `LocalFrame::rangeForPoint` / `CFStringGetExtendedPictographicSequenceComponent`** → §7 NSTextInput 风暴
- 主线程顶部是 **composite / paint / layout** → §4 那张 A/B/C/D 表覆盖的路径
- 主线程顶部是 **JS / IPC dispatch / mach_msg 收消息频繁** → 应用层（前端 React rerender / 后端 emit 风暴）

**A/B 对照实验**（验证修复是否有效）：
1. 在 release 版重新构建后运行
2. 长输出任务跑到累积 5MB+ scrollback
3. 在终端拖选跨多屏的范围，松手
4. `sample <pid> 5` 看 `CharacterIndexForPointAsync` 是否消失
5. 应为 0 → 修复生效

### 7.5 fix_oom 分支与此问题无关

`fix_oom` 分支的 PTY backpressure 改动（`set_pty_paused` / `paused_flag` / SmartWriter `onPauseChange`）跟本节无关——sample 期间 PTY/IPC 路径 0 个采样。可以独立评估 backpressure 是否真的能防 OOM，但不要用它修这个 CPU 100% 现场。

---

## 8. 已知缺口（未修，留给后续）

| 缺口 | 影响 | 触发条件 |
|---|---|---|
| `webglAddon.onContextLoss` 只 dispose 不 re-attach | context loss 后变成 DOM renderer，§3 的负向交易开始生效 | GPU 内存压力 / 系统休眠 |
| `SessionView` 同步 `marked(async:false)` + 全文件加载 JSONL | JS 堆短期飙升，加重高分配率（但与本文卡顿不直接相关） | 打开很长的 session |
| §7 inert 防线需要真实长跑 sample 复验。代码已覆盖无 pointerdown 的已有 selection 场景，但 macOS 何时进入持续轮询仍由系统决定 | 修复需要长期 monitoring | 长会话、多终端实例、4K DPR 切换后 |

---

**相关：**

- [`AGENTS.md`](../../AGENTS.md) — 防劣化规则的终端相关条目
