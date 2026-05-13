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
| `selectionPaused` 的 pointerup 监听挂 `document` | 保留 | 不要挪到 container（拖出窗外漏 pointerup） | `src/components/TerminalView.tsx` useEffect |
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

**相关：**

- [`AGENTS.md`](../../AGENTS.md) — 防劣化规则的终端相关条目
