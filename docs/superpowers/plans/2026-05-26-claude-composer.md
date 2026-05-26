# Claude 任务 Composer 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Claude 任务在 `RunningView` 底部显示与 Codex 同款的多行 composer，同时保证 Codex 输出字节级不变。

**Architecture:** 三处 rename（util、test、styles）把 Codex 专有命名升级为 agent 无关；`RunningView` 去掉 agent 门，placeholder 按 agent 切换。复用现有 bracketed-paste 函数体（`\x1b[200~ … \x1b[201~\r`），单元测试断言原样保留即回归保护。

**Tech Stack:** React 19 + TypeScript、Vite、Vitest、Tauri 2（不动 Rust）

**Spec:** `docs/superpowers/specs/2026-05-26-claude-composer-design.md`

**Working branch:** `desktop-enhancements`（当前分支即可，已有未提交改动；本计划只操作本计划涉及的文件）

---

### Task 1: 把 composer util + 单元测试改成 agent 无关命名

**Files:**
- Rename: `src/utils/codexComposer.ts` → `src/utils/composer.ts`
- Rename: `src/test/codexComposer.test.ts` → `src/test/composer.test.ts`
- Modify: `src/components/RunningView.tsx:13,90` （只动 util 的 import + 调用名，本任务暂不动 styles 和 show 条件）

- [ ] **Step 1: 用 `git mv` 重命名 util，保留 history**

```bash
git mv src/utils/codexComposer.ts src/utils/composer.ts
git mv src/test/codexComposer.test.ts src/test/composer.test.ts
```

- [ ] **Step 2: 改 util 导出名**

把 `src/utils/composer.ts` 内容改为：

```ts
const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

export function formatComposerSubmit(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  return `${BRACKETED_PASTE_START}${normalized}${BRACKETED_PASTE_END}\r`;
}
```

唯一变化：函数名 `formatCodexComposerSubmit` → `formatComposerSubmit`。函数体一字不动。

- [ ] **Step 3: 同步测试的 import / describe / 调用名（断言字节序列保持不变）**

把 `src/test/composer.test.ts` 内容改为：

```ts
import { describe, expect, it } from "vitest";
import { formatComposerSubmit } from "../utils/composer";

describe("formatComposerSubmit", () => {
  it("wraps multiline input in bracketed paste and submits once", () => {
    expect(formatComposerSubmit("line one\nline two")).toBe(
      "\x1b[200~line one\nline two\x1b[201~\r",
    );
  });

  it("normalizes CRLF newlines before sending to the PTY", () => {
    expect(formatComposerSubmit("line one\r\nline two\rline three")).toBe(
      "\x1b[200~line one\nline two\nline three\x1b[201~\r",
    );
  });
});
```

**关键：两条 `expect(...).toBe(...)` 的字符串字面量与原文件逐字节一致**——这是 Codex 字节级回归保护。

- [ ] **Step 4: 在 RunningView 里更新 import 和调用**

`src/components/RunningView.tsx:13`：

```ts
// 旧
import { formatCodexComposerSubmit } from "../utils/codexComposer";
// 新
import { formatComposerSubmit } from "../utils/composer";
```

`src/components/RunningView.tsx:90`：

```ts
// 旧
onInput(formatCodexComposerSubmit(composerValue));
// 新
onInput(formatComposerSubmit(composerValue));
```

本任务**先不**动 line 86（`showCodexComposer`）和 line 337 的 placeholder——下面 Task 3 处理。

- [ ] **Step 5: 跑测试确认 Codex 字节级不变**

```bash
pnpm test -- --run src/test/composer.test.ts
```

Expected: 2 passed。失败说明字节序列被动到了，立即停下检查。

- [ ] **Step 6: 跑 lint 和 build 确认引用没漏改**

```bash
pnpm lint
pnpm build
```

Expected: 两条命令均无 error。若 build 报「`codexComposer` 找不到」说明还有遗漏引用，按报错路径修复。

- [ ] **Step 7: 提交**

```bash
git add src/utils/composer.ts src/test/composer.test.ts src/components/RunningView.tsx
git commit -m "refactor: rename codex composer util to agent-neutral name

Preparation for sharing the composer with Claude tasks. Test
assertions remain byte-identical, regression-protecting Codex output."
```

---

### Task 2: 把 `codex*` 样式键改成 `composer*`

**Files:**
- Modify: `src/styles/terminal.ts:38-81`（5 个键名）
- Modify: `src/components/RunningView.tsx:306,325,326,339,347,348`（5 处 `s.codex*` 引用）

- [ ] **Step 1: 改样式键名**

`src/styles/terminal.ts` 把 5 个键的前缀 `codexComposer` 改成 `composer`：

```ts
// 38-43
composerWrap: {
  flexShrink: 0,
  padding: "10px 16px 14px",
  borderTop: "1px solid var(--border-dim)",
  background: "var(--bg-panel)",
},
// 44-52
composerBox: {
  display: "flex",
  alignItems: "flex-end",
  gap: 10,
  padding: "10px 10px 10px 12px",
  border: "1px solid var(--border-medium)",
  borderRadius: 8,
  background: "var(--bg-input)",
},
// 53-65
composerInput: {
  flex: 1,
  minHeight: 38,
  maxHeight: 130,
  resize: "vertical" as const,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--text-primary)",
  fontFamily: "var(--font-sans)",
  fontSize: 13,
  lineHeight: 1.45,
},
// 66-77
composerSend: {
  flexShrink: 0,
  height: 32,
  padding: "0 13px",
  border: "1px solid var(--control-active-fg)",
  borderRadius: 6,
  background: "var(--control-active-fg)",
  color: "var(--control-active-bg)",
  fontSize: 12,
  fontWeight: 650,
  cursor: "pointer",
},
// 78-81
composerSendDisabled: {
  opacity: 0.45,
  cursor: "default",
},
```

CSS 属性值一律不动——这是另一道 Codex 视觉回归保护。

- [ ] **Step 2: 同步 RunningView 里的 5 处引用**

按行号定位并替换（`s.codexComposer*` → `s.composer*`）：

- `:306` — `paddingBottom: showCodexComposer ? 10 : 16`（先不动 `showCodexComposer`，下面 Task 3 处理；本步骤这一行只是路过，不修改）
- `:325` — `<div style={s.codexComposerWrap}>` → `<div style={s.composerWrap}>`
- `:326` — `<div style={s.codexComposerBox}>` → `<div style={s.composerBox}>`
- `:339` — `style={s.codexComposerInput}` → `style={s.composerInput}`
- `:347` — `...s.codexComposerSend,` → `...s.composerSend,`
- `:348` — `...(!composerValue.trim() ? s.codexComposerSendDisabled : null),` → `...(!composerValue.trim() ? s.composerSendDisabled : null),`

- [ ] **Step 3: tsc 校验所有键名都对得上**

```bash
pnpm build
```

Expected: 无 error。`satisfies Record<string, React.CSSProperties>` 不会拦截误引用，但 TS 严格模式下访问不存在的 key 会报 `Property 'codexComposerWrap' does not exist on type ...`。若报错说明步骤 2 漏了某行，按报错路径修。

- [ ] **Step 4: 提交**

```bash
git add src/styles/terminal.ts src/components/RunningView.tsx
git commit -m "refactor: rename codexComposer* styles to composer*

Prep for sharing the composer UI with Claude tasks. Style values
unchanged."
```

---

### Task 3: 去掉 agent 门，按 agent 切换 placeholder

**Files:**
- Modify: `src/components/RunningView.tsx:86,306,324,337`

- [ ] **Step 1: `showCodexComposer` → `showComposer`，移除 agent 限制**

`:86`：

```ts
// 旧
const showCodexComposer = isActive && task.agent === "codex";
// 新
const showComposer = isActive;
```

- [ ] **Step 2: 同步 `showComposer` 在 JSX 里的两处引用**

`:306`：

```tsx
// 旧
<div style={{ ...s.terminalContainer, paddingBottom: showCodexComposer ? 10 : 16 }}>
// 新
<div style={{ ...s.terminalContainer, paddingBottom: showComposer ? 10 : 16 }}>
```

`:324`：

```tsx
// 旧
{showCodexComposer && (
// 新
{showComposer && (
```

- [ ] **Step 3: placeholder 按 agent 切换**

`:337` 当前是：

```tsx
placeholder="Type a Codex reply"
```

改为：

```tsx
placeholder={task.agent === "codex" ? "Type a Codex reply" : "Type a Claude reply"}
```

- [ ] **Step 4: 跑测试 + 类型检查**

```bash
pnpm test -- --run
pnpm build
```

Expected: 全部通过。`composer.test.ts` 的 2 条仍然 pass（util 没动）；其他测试不应受影响。

- [ ] **Step 5: 提交**

```bash
git add src/components/RunningView.tsx
git commit -m "feat: show multiline composer for claude tasks

Drop the agent === 'codex' gate so the composer also appears for
Claude tasks. Placeholder copy switches per agent. The bracketed-paste
submit format is identical for both agents, byte-level verified by
the unchanged composer test."
```

---

### Task 4: 桌面端手动验证

**Goal:** 用 `pnpm tauri dev` 在真机分别跑一次 Codex 任务和 Claude 任务，确认 composer 行为符合预期。这一步是 Spec 中「bracketed-paste 在 Claude TUI 未实测」风险的兜底。

- [ ] **Step 1: 启动桌面应用**

```bash
pnpm tauri dev
```

Expected: 桌面窗口起来，能选项目。

- [ ] **Step 2: Codex 任务回归验证**

1. 在某个测试项目里新建一个 Codex 任务（任意提示词，permissionMode `ask` 或 `auto_edit` 均可），等任务跑起来进入 `running` 状态。
2. 在底部 composer 输入三行：

```
line one
line two
line three
```

3. 按 Cmd+Enter（macOS）或 Ctrl+Enter 提交。

Expected：
- composer 清空、自动 focus 回来
- xterm 里 Codex 看到的是一次粘贴 + 一次提交，三行被作为整体 prompt 处理
- composer wrap 显示位置、按钮样式与改动前肉眼一致

若任一项不符合，停下并 git diff 检查 Task 2 的样式 rename 或 Task 1 的 util。

- [ ] **Step 3: Claude 任务首次验证**

1. 在同一项目新建一个 Claude 任务，等任务跑起来。
2. 同样在 composer 输入三行测试文本（同 Step 2），按 Cmd/Ctrl+Enter 提交。

Expected：
- composer 出现在 Claude 任务底部（这是新增行为）
- Claude TUI 的提示框接收到三行内容，**作为一次粘贴**注入提示框，可见保留换行
- 紧接着的 `\r` 触发 Claude 提交，Claude 开始按这三行 prompt 工作
- placeholder 文案是 "Type a Claude reply"

**若 Claude 把 `\n` 当成提前提交（即只看到第一行就开始响应）：** 这是 Spec 中已识别的风险落地。停下，记录 Claude 版本和现象，回到 brainstorming 阶段讨论回退方案（如把 `\n` 替换成 Claude 多行续行的转义序列）。**不要在本计划范围内强行修。**

- [ ] **Step 4: 状态切换确认**

- 让 Claude 任务自然完成（status → `done`）。Expected：RunningView 切到 SessionView 分支，composer 自动消失。
- 把同一个任务通过侧栏 Resume，进入 `running`。Expected：composer 重新显示。

- [ ] **Step 5: 收尾**

手动验证全过则计划完成。若有任何 Step 2-4 不符合预期，按上面的「若失败」分支处理，先不要继续合并。

---

## 自查

**1. Spec 覆盖：**
- 提交格式（同 Codex bracketed-paste）→ Task 1
- 代码组织 rename → Task 1（util/test）+ Task 2（styles）
- 展示规则去 agent 门 → Task 3 Step 1
- Placeholder 切换 → Task 3 Step 3
- 测试计划 a（单元测试断言不变）→ Task 1 Step 3 + Step 5
- 测试计划 b（手动验收 tauri dev）→ Task 4
- 已知遗留（Claude 实测）→ Task 4 Step 3 显式覆盖，含失败回退路径

无遗漏。

**2. Placeholder 扫描：** 无 TBD/TODO/"add appropriate handling"；所有需要代码的步骤都有完整代码块。

**3. 类型一致性：** 全计划用 `formatComposerSubmit` / `showComposer` / `s.composer*` 一套命名。`task.agent === "codex" ? "Type a Codex reply" : "Type a Claude reply"` 在 spec 和 Task 3 Step 3 一致。

**4. 顺序合理性：** Task 1（util）→ Task 2（styles）→ Task 3（行为切换）→ Task 4（手动验证）。前三任务每个都跑 build/test，任何中间步骤失败都能立刻定位。
