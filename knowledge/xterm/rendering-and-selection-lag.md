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

## 7. macOS NSTextInputClient 风暴（与 §4 完全无关的另一条路径）

> 这是 2026-05-19 实测发现的**独立卡顿来源**，sample 工具锁定。和 §1–§4 的 composite 长帧不是同一回事，**先看现象判断走哪条路径**：

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

1. xterm v6 即使在 WebGL renderer 下，`_rowFactory.createRow()` 仍然往每个 row div `replaceChildren(...spans)` 写入完整字符内容（让浏览器原生 selection/copy 工作）
2. 长会话 + Claude Code 输出含大量 emoji / box drawing / Unicode → 每个 row span 都需要走 ICU pictographic 簇判断
3. 用户在 xterm 内拖选 → macOS 进入"有 selection 的文本输入状态" → NSTextInputClient（IME 候选词浮窗追踪 / 拼写检查 / AX）**持续轮询** `characterIndexForPointAsync`
4. 单次查询 → `canonicalPosition` 在整棵 xterm-rows 子树游走 1500+ RenderText → 50–200ms
5. 主线程被卡 → 后续事件堆积 → 系统继续轮询 → 正反馈到 100%

### 7.3 修复（分两档落地）

修复 V1 单独不够——实测仍有 ~20% IME 路径占主线程（拖选时偶发卡顿）。完整修复包含 V1 + V2 两层：

**V1：CSS 阻断 hit-test 入口**

`src/App.css`：
```css
.xterm-rows,
.xterm-rows * { pointer-events: none; }
```

`src/components/TerminalView.tsx`（关掉 helper textarea 上的 macOS 自动行为）：
```ts
term.textarea.setAttribute("autocomplete", "off");
term.textarea.setAttribute("autocorrect", "off");
term.textarea.setAttribute("autocapitalize", "off");
term.textarea.setAttribute("spellcheck", "false");
```

实测把 `CharacterIndexForPointAsync` 主线程占比从 **99.7% → 20.6%**。`pointer-events: none` 拦住了 WebKit hit-test 命中 row 子树，但 `canonicalPosition` 仍会从外层 hit-test 结果向前/向后游走候选 Position，进入 row span 的 RenderText——这一步不看 pointer-events。所以 V1 单独不够。

**V2：MutationObserver 替换 row span 文本为 ASCII**

`src/components/TerminalView.tsx` 的 `useEffect` 内：
```ts
const rowsEl = container.querySelector(".xterm-rows");
const processedSpans = new WeakSet<Element>();
const ASCII_ONLY = /^[\x20-\x7E]*$/;
const rowSanitizer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type !== "childList") continue;
    for (const n of m.addedNodes) {
      if (n.nodeType !== Node.ELEMENT_NODE) continue;
      const el = n as Element;
      if (el.tagName !== "SPAN" || processedSpans.has(el)) continue;
      const text = el.textContent;
      if (!text || text.length <= 1 || ASCII_ONLY.test(text)) {
        processedSpans.add(el);
        continue;
      }
      el.textContent = "x";
      processedSpans.add(el);
    }
  }
});
rowSanitizer.observe(rowsEl, { childList: true, subtree: true });
```

xterm v6 每帧 `_rowFactory.createRow()` → `rowDiv.replaceChildren(...newSpans)`，触发 MutationRecord。我们 hook 到 addedNodes 里的 span，把含非 ASCII 字符（emoji / box drawing）的 textContent 替换成单字符 `"x"`。

PositionIterator 仍游走 1500+ 次（这是 WebKit 内部行为，CSS / JS 都改不了），但每次 ICU TextBreakIterator setText 走 ASCII fast path——不再进入 `__CFStringGetExtendedPictographicSequenceComponent` 的 emoji 簇判断。

为什么 V2 不会破坏 xterm：
- xterm 的拖选用 `mouseService.getCoords(event, screenElement)`——读 event clientX/Y + screenElement boundingRect，不读 row span 内容
- xterm 的列宽对齐用 `_rowColumns.set(span, [...])` 存的期望列范围，**与 span.textContent 内容无关**；`_alignRowWidth(rowDiv)` 用 row div 的 boundingRect 算 scaleX，row div 内 span 只要还有内容（"x"）就不会触发除零
- xterm 的字符渲染是 WebGL canvas 上做的，**row span 视觉上被 canvas 覆盖**，textContent 改成什么都看不见
- Nezha 的复制走 `attachSmartCopy` → `terminal.buffer.translateToString` → 直接读 xterm core buffer，**完全不读 DOM**
- WeakSet 去重避免我们自己写入 textContent 触发的二次 mutation 死循环——`span.textContent = "x"` 会触发新一次 childList mutation（addedNodes 是 text node，不是 SPAN），回调里 `tagName !== "SPAN"` 直接跳过

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
| `selectionPaused = true` 后 pointerup 丢失（pointercancel / 系统手势 / 拖出窗外） | SmartWriter `pendingChunks` 无上限增长直到下次成功 pointerdown→pointerup | 鼠标手势打断选区拖动 |
| `webglAddon.onContextLoss` 只 dispose 不 re-attach | context loss 后变成 DOM renderer，§3 的负向交易开始生效 | GPU 内存压力 / 系统休眠 |
| `SessionView` 同步 `marked(async:false)` + 全文件加载 JSONL | JS 堆短期飙升，加重高分配率（但与本文卡顿不直接相关） | 打开很长的 session |
| §7 修复 V1+V2 实测前主线程峰值已从 99% 持续不降变为偶发短卡，但**未经长跑长会话+多终端实例的稳定性验证**。MutationObserver 跟 xterm DOM 写入对抗，xterm v6 升级如改 row 创建路径需要回归测试 | 修复需要长期 monitoring | xterm v6 主版本升级后 |

---

**相关：**

- [`AGENTS.md`](../../AGENTS.md) — 防劣化规则的终端相关条目
