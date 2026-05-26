# Claude 任务输入框（multiline composer）

**日期：** 2026-05-26
**作者：** Pyer + Claude
**分支：** `desktop-enhancements`

## 背景

`RunningView` 当前为 Codex 任务在 xterm 终端底下挂了一个多行输入框（composer），把整段文本通过 bracketed-paste 转义序列（`\x1b[200~ … \x1b[201~\r`）作为一次「粘贴」事件投递到 PTY。Codex CLI 在 PTY 里把每个 `\n` 当作独立 Enter 提交，所以这层粘贴包装是 Codex 多行输入的必要条件。

Claude 任务目前没有这个输入框——多行输入必须依赖 Claude TUI 自带的 Shift+Enter 续行能力，在 xterm 终端里逐字符输入。但用户希望在 Claude 任务下也有一个独立的、靠近 xterm 的多行输入框，便于：

- 编辑长 prompt（Claude TUI 内的输入框尺寸有限）
- 用普通编辑器的回车换行习惯打多行，而不是 Shift+Enter
- 提供统一的视觉提交按钮

要求：**为 Claude 加上同款 composer，且 Codex 现有行为字节级不变。**

## 设计决策

### 提交格式

Claude 和 Codex 共用同一套 bracketed-paste 包装：

```ts
`${BRACKETED_PASTE_START}${normalized}${BRACKETED_PASTE_END}\r`
// 即 "\x1b[200~" + text(LF normalized) + "\x1b[201~\r"
```

理由：

- Claude Code TUI 走 Ink + 标准 stdin，对终端的 bracketed-paste 转义序列识别为单次粘贴，整段文本（含 `\n`）会被注入到 Claude 的提示框，再由末尾的 `\r` 触发提交。这与 Codex 路径完全一致。
- 同格式 → 同一份 util、同一份测试、同一份样式定义，YAGNI。

**已识别风险：** Claude TUI 的 bracketed-paste 行为**未实测**。若 Ink 在某些场景下未启用 paste mode（如全屏 raw-mode），多行内容里的 `\n` 可能被当作提前提交。验证步骤放在实现计划阶段：`pnpm tauri dev` 启动桌面应用，对 Claude 任务投递三行测试文本，确认是单次提交且换行保留。若失败，回退方案是为 Claude 单独写一份格式（如把 `\n` 替换成 Claude Shift+Enter 等价转义），但当前阶段不预写。

### 代码组织

把 Codex 专有命名升级为 agent 无关：

| 现有 | 新 |
|---|---|
| `src/utils/codexComposer.ts` | `src/utils/composer.ts` |
| `formatCodexComposerSubmit` | `formatComposerSubmit` |
| `src/test/codexComposer.test.ts` | `src/test/composer.test.ts` |
| `styles/terminal.ts` 中 `codexComposerWrap / codexComposerBox / codexComposerInput / codexComposerSend / codexComposerSendDisabled` | 去掉 `codex` 前缀 |
| `RunningView.tsx` 中 `showCodexComposer` | `showComposer` |

字节级输出**完全不变**——`formatComposerSubmit` 函数体与原 `formatCodexComposerSubmit` 一字一节相同，测试断言（`"\x1b[200~line one\nline two\x1b[201~\r"`）原样保留。这就是「不影响 Codex」的回归保护。

### 展示规则

```ts
// 现状
const showCodexComposer = isActive && task.agent === "codex";
// 新
const showComposer = isActive;
```

`isActive` 已经覆盖 `pending | running | input_required`，三种状态都允许投递输入（与 Codex 当前行为一致）。`done | failed | cancelled` 时 RunningView 进入 SessionView 分支，composer 自然不显示。

### Placeholder 文案

按 agent 切换：

```ts
placeholder={task.agent === "codex" ? "Type a Codex reply" : "Type a Claude reply"}
```

其余 UI（textarea 尺寸、Send 按钮、Cmd/Ctrl+Enter 提交、disabled-when-empty）完全不变。

## 改动范围

- `src/utils/composer.ts`（rename）
- `src/test/composer.test.ts`（rename + import 同步）
- `src/styles/terminal.ts`（5 个样式键去前缀）
- `src/components/RunningView.tsx`（变量名、import、show 条件、placeholder）

**零改动：** Rust 后端、PTY 命令、数据 schema、`~/.nezha/` 持久化、Codex 的字节级输出。

## 测试计划

1. 现有 `formatComposerSubmit` 单元测试通过（包含 CRLF 归一化），保证字节序列与 Codex 现状逐字节相同。
2. 手动验收（`pnpm tauri dev`）：
   - Codex 任务：composer 仍显示、三行文本提交后 Codex 视为一次粘贴 + 提交。
   - Claude 任务：composer 显示、三行文本提交后 Claude 视为一次粘贴 + 提交，换行在 Claude 提示框内保留。
   - 任务完成（status=done）后 composer 自动消失（走 SessionView 分支）。

## YAGNI 约束

不包含：
- 历史输入记录 / 上下翻箭头召回
- @提及 / 图片附件（NewTaskView 已有，运行中场景暂不需要）
- 自适应高度算法之外的尺寸控制
- agent 专用快捷键差异
- composer 折叠按钮 / 显示开关
- slash 命令识别（`/clear`、`/help` 等仍走 xterm 直接输入；composer 会原样粘贴）

## 已知遗留

- bracketed-paste 在 Claude TUI 下的实测验证。计划阶段 `pnpm tauri dev` 跑一次确认；如失败再单独立项。
