# Nezha — AGENTS.md

## 项目概述

Nezha 是一款面向 AI 编程智能体（Claude Code、Codex）的桌面任务管理器，提供多项目工作区、实时终端输出、会话自动发现、权限感知执行、Git 集成和用量分析等核心功能。

**技术栈：** React 19 + TypeScript + Vite（前端） · Tauri 2 + Rust（桌面壳） · xterm.js（终端） · Shiki（语法高亮）

---

## 开发命令

```bash
pnpm dev            # 启动 Vite 开发服务器（端口 1420）
pnpm build          # tsc 类型检查 + Vite 打包
pnpm lint           # 运行 ESLint
pnpm test           # 运行 Vitest
pnpm tauri dev      # 启动完整桌面应用（自动启动开发服务器）
pnpm tauri build    # 构建生产环境桌面二进制包
```

Rust 后端位于 `src-tauri/`，修改后需重启 `tauri dev`。

---

## 架构设计

### 前端（`src/`）

| 文件 | 职责 |
|------|------|
| `App.tsx` | 根组件；持有所有状态（projects、tasks、buffers）及 Tauri 事件监听器 |
| `types.ts` | TypeScript 接口的权威定义——修改数据结构时优先编辑此文件 |
| `styles/index.ts` + `styles/*` | 模块化 CSS-in-JS 样式入口；按 layout / panels / task / terminal / dialogs / common 拆分 |
| `App.css` | 仅用于暗色/亮色主题的 CSS 自定义属性 |
| `utils.ts` | UI 工具函数：头像颜色生成、路径缩短、localStorage 辅助方法 |

**组件树（简化版）：**
```
ErrorBoundary  (全局兜底)
└── App  (+ Toast 全局提示层)
    ├── WelcomePage              — 项目选择页（含 Timeline 视图入口）
    │   └── TimelineView         — 跨项目任务时间线（今天 / 昨天 / 更早，按项目二级分组）
    └── ProjectPage              (头部含 NotificationBell / UsagePopover)
        ├── ProjectRail          — 左侧导航栏（项目切换器）
        ├── TaskPanel            — 任务列表侧边栏
        │   ├── BranchBar        — Git 分支切换 / 创建
        │   ├── TaskList → TaskListItem
        │   └── SidebarFooterActions → AppSettingsDialog
        ├── NewTaskView          — 任务创建视图
        │   ├── PromptEditor
        │   ├── MentionPopover
        │   ├── ImageAttachments / TextAttachments
        │   └── AgentPermSelector
        ├── TodoTaskView         — Todo 任务编辑 / 启动视图
        ├── RunningView          — 运行中任务头部（恢复、取消、worktree 信息）
        │   └── TerminalView     — xterm.js 封装组件
        ├── SessionView          — 会话消息查看器（JSONL 回放）
        ├── ShellTerminalPanel   — 嵌入式交互 Shell 终端
        ├── SettingsDialog       — 项目级设置（config.toml 编辑器 + 智能体配置）
        ├── RightToolbar         — 右侧面板与 Shell 的开关入口
        └── 右侧面板（同时只有一个处于激活状态）：
            ├── FileExplorer → FileViewer → ImagePreviewPane
            ├── GitChanges → GitDiffViewer     — 暂存/未暂存变更、提交 UI
            └── GitHistory → GitDiffViewer     — 提交日志、提交差异查看器
```

> **复用小组件**（被多处引用）：`StatusIcon` / `IconButton` / `ProjectAvatar`。
>
> **已拆出的子目录**（`src/components/<dir>/`）：`app-settings/` · `task-panel/` · `new-task/` · `file-explorer/` · `file-viewer/` · `git-diff/` · `git-view/` · `skill-hub/` · `project-rail/`——这些目录里是已经从主组件拆出来的子部件，新增功能优先继续往这些子目录加，不要回灌到根目录大文件里。

状态从 `App.tsx` 通过 props 向下传递；异步更新通过 Tauri 通道/事件向上传递：
- **agent 任务输出** — 通过 `tauri::ipc::Channel<String>`（前端 `new Channel<string>()`）由 `run_task` / `resume_task` 的 `onOutput` 参数传入，绕过事件总线的全局广播，直投 `useTerminalManager` 的批量写入流程
- `task-status` — `{ task_id, status }` 任务生命周期状态变更
- `task-session` — `{ task_id, session_id, session_path }` 会话发现
- `shell-output` — `{ shell_id, data }` 嵌入式 Shell 的 PTY 字节流（仍走 emit 事件）

### 后端（`src-tauri/src/`）

`lib.rs` 是精简的入口点，负责注册所有模块和 Tauri 命令处理列表。业务逻辑拆分到各专职模块（下表命令仅为**代表入口**，完整清单以 `lib.rs::invoke_handler!` 为准）：

| 模块 | 职责 |
|--------|---------------|
| `pty.rs` | 任务 / Shell 的 PTY 创建/读写、生命周期（`run_task` / `resume_task` / `cancel_task` / `complete_task` / `send_input` / `resize_pty` / `open_shell` / `kill_shell` / `reset_task_process` / `get_active_task_ids`） |
| `session.rs` | Claude & Codex 的会话文件监听；终端输出兜底提取；`read_session_messages` / `export_session_markdown` |
| `storage.rs` | 基于文件的持久化（`load_projects` / `save_projects` / `load_project_tasks` / `save_project_tasks`） |
| `fs.rs` | 文件系统命令（`read_dir_entries` / `read_file_content` / `read_image_preview` / `write_file_content` / `create_file` / `create_directory` / `delete_path` / `list_project_files` / `search_project_files` / `open_in_system_file_manager`） |
| `git.rs` | 完整 Git 集成：状态 / 分支 / 日志 / 差异 / 暂存 / 提交 / 推送 / 拉取 / `generate_commit_message`，以及 worktree 系列（`create_task_worktree` / `merge_task_worktree` / `remove_task_worktree` / `worktree_diff_stats`） |
| `analytics.rs` | 解析会话 JSONL 获取 token / 工具调用指标（`read_session_metrics`，供 RunningView 轮询） |
| `config.rs` | 项目级 `.nezha/config.toml` 管理（`init_project_config` / `read_project_config` / `write_project_config` / `read_agent_config_file` / `write_agent_config_file` / `get_agent_config_file_path`） |
| `app_settings.rs` | 应用级智能体路径、版本、UI 偏好（`load_app_settings` / `save_app_settings` / `save_agent_paths` / `save_send_shortcut` / `save_shift_enter_newline` / `save_claude_force_default_tui` / `save_terminal_scrollback` / `detect_agent_paths` / `detect_agent_versions_for_settings` / `get_system_fonts`） |
| `hooks.rs` + `nezha-hook.mjs` | Claude Code / Codex 的 hook 集成（能力探测、注入、事件回传、`regenerate_claude_settings`） |
| `event_watcher.rs` | 监听 `.nezha/events/<taskId>/events.jsonl`，把 hook 事件回投到前端 |
| `notification.rs` | 系统通知发送（任务状态 / attention） |
| `agent_assist.rs` | 智能体辅助调用：headless 命令生成任务名、commit message 等 |
| `subprocess.rs` | 子进程通用封装（带超时 / kill_on_drop） |
| `usage.rs` | 用量统计（token / 调用次数聚合） |
| `skills.rs` | Skill 注册表读取（`~/.claude/skills/` 等） |
| `platform/` | 平台相关辅助（macOS 全屏退出、Windows hook 兼容等） |

核心结构体：`TaskManager` 由 Tauri 托管状态持有，内部使用 `parking_lot::Mutex` 管理 PTY 主端、写入器、子进程句柄、会话映射及已认领的会话路径。

**权限模式 → CLI 标志映射：**

| 模式 | Claude Code (`build_claude_cmd`) | Codex (`build_codex_cmd`) |
|------|----------------------------------|---------------------------|
| `ask` | `--permission-mode default` | （默认，无额外标志） |
| `auto_edit` | `--permission-mode acceptEdits` | `--sandbox workspace-write -a on-request` |
| `full_access` | `--dangerously-skip-permissions` | `--dangerously-bypass-approvals-and-sandbox` |

---

## 数据模型

```typescript
// 任务状态（TaskStatus）：
//   todo | pending | running | input_required | detached | interrupted
//   | done | failed | cancelled
// 典型生命周期：todo → pending → running ↔ input_required → done | failed | cancelled
// 例外路径：running → detached（断开但保留 PTY） / running → interrupted（中断挂起）

interface Task {
  id: string;
  projectId: string;
  name?: string;
  prompt: string;
  agent: "claude" | "codex";
  permissionMode: "ask" | "auto_edit" | "full_access";
  status: TaskStatus;
  createdAt: number;
  updatedAt?: number;        // 状态最近变更时间戳；任务列表按此排序，缺省回落 createdAt
  attentionRequestedAt?: number;
  starred?: boolean;
  failureReason?: string;
  claudeSessionId?: string;
  claudeSessionPath?: string;
  codexSessionId?: string;
  codexSessionPath?: string;
  // Worktree 集成（一任务一分支一 worktree）
  worktreePath?: string;
  worktreeBranch?: string;
  baseBranch?: string;
  worktreeDiscarded?: boolean;
  // Diff 统计（worktree 相对 baseBranch）
  additions?: number;
  deletions?: number;
}
```

**持久化存储（基于文件，非 localStorage）：**
- `~/.nezha/projects.json` — Project[]
- `~/.nezha/projects/<projectId>/tasks.json` — Task[]（每个项目独立一个文件）
- 主题及 UI 偏好存储于 localStorage

> 修改 Task 数据结构时，**必须同步更新 `types.ts`（TypeScript）和 `storage.rs` 中的 `Task` 结构体（Rust）**——否则新字段在序列化时会被静默丢弃。

---

## 项目配置

每个项目首次打开时会自动创建 `.nezha/config.toml`（由 `init_project_config` 触发）：

```toml
[agent]
default = "claude"                 # 新任务的默认智能体
default_permission_mode = "ask"    # 新任务的默认权限模式
prompt_prefix = ""                 # 拼接到每个任务提示词前面的文本

[git]
commit_prompt = "..."              # generate_commit_message 使用的提示词
commit_message_timeout_secs = 60   # 生成 commit message 的超时秒数（headless 调用上限）
```

> 智能体版本号（Claude Code / Codex）统一由应用级 `app_settings`（`~/.nezha/settings.json` + 带缓存的全局探测）管理，**不再存于项目 config.toml**；hook 能力判断（`hooks::usable_for`）一律走全局探测。

附加到任务的图片会保存至 `.nezha/attachments/<taskId>/`，其路径会被追加到提示词末尾，以便智能体通过文件工具读取。任务完成后附件会被自动清理。

---

## 开发规范

### 样式

- 所有样式统一放在 `src/styles/` 目录下，并通过 `src/styles/index.ts` 聚合导出。新样式优先按已有模块（`layout` / `panels` / `task` / `terminal` / `dialogs` / `common` / `git-diff` / `skill-hub` / `timeline` / `font` / `rail-drag`）归档，不要创建独立的业务 `.css` 文件。
- **新增 / 修改组件时禁止使用 `style={{}}` 行内样式**。动态条件（disabled / hover / active）用 `className` + `data-*` 属性 + CSS 选择器表达，不要 fallback 成 inline。存量 inline style（如 `GitChanges.tsx`、`FileExplorer.tsx`）属于已知技术债，**修该文件时也要一并迁出**，不要复制现有 inline 风格。
- 主题变量（颜色、间距）是 `App.css` / `themes.css` 中的 CSS 自定义属性，在 `styles/*` 中通过 `var(--name)` 引用，不要 hardcode 颜色值。

### 状态管理

- 不引入外部状态库。跨项目/跨面板的核心状态主要存活在 `App.tsx` 中并通过 props 向下传递；组件内部的短生命周期 UI 状态保留在各自组件内。
- Tauri 事件（`listen()`）驱动异步状态更新——后端的状态变更通过此机制到达前端。
- 任何数据变更后，立即通过 Tauri 的 `save_projects` / `save_project_tasks` 命令持久化到磁盘。

### Rust

- Tauri 命令按模块文件组织（`pty.rs`、`git.rs` 等）。新增命令须在 `lib.rs` 的 `invoke_handler!` 列表中注册。
- `TaskManager` 由 Tauri 托管，内部主要使用 `parking_lot::Mutex`——保持锁的作用域尽可能短，避免阻塞异步运行时。
- 优先使用 `tauri::Emitter` 向前端推送事件，而非从命令中返回大体积数据。
- 所有重型/阻塞操作必须使用 `tokio::task::spawn_blocking` 或 `tokio::spawn`——绝不阻塞 Tauri 主线程。

---

## 已知技术债务与防劣化规则

> 以下规则来源于 2026-04 全项目审计中发现的已有问题，新增代码**必须遵守**，存量代码逐步修复。

### 前端性能

- **组件必须控制渲染范围**——列表行组件已经开始使用 memo 化（如 `TaskListItem`），但 `ProjectPage` 等接收大量 props 且可能不可见的组件仍应继续收敛渲染范围。
- **高频事件回调中避免 `setState`**——`useTerminalManager` 已使用 buffer/ref + RAF 批量写入降低 PTY 输出带来的重渲染；agent 输出走 `tauri::ipc::Channel`（绕开事件总线全局广播）直投 hook 内的批量管道。新增类似通路时继续沿用 Channel + RAF 批量的策略，不要在每条输出回调中直接触发全局状态更新。
- **`persistProjectTasks` 必须防抖**——当前每次状态变更都立即调用 `invoke("save_project_tasks")`，高频场景下造成冗余磁盘 I/O。应对同一 projectId 的连续写入做 300-500ms 防抖。
- **长列表必须虚拟化**——SessionView（会话消息）、GitChanges（文件列表）在数据量大时（5000+ 消息、1000+ 文件变更）会因 DOM 节点过多导致滚动卡顿。新增类似列表时必须考虑虚拟滚动。
- **`marked()` 禁止同步调用大文本**——SessionView 中 `marked(text, { async: false })` 会阻塞主线程。对单条消息超过 10KB 的文本应使用异步渲染或 memoize 结果。
- **@提及搜索必须防抖**——NewTaskView 中的文件搜索（`mentionItems` useMemo）在万级文件项目中每次按键都全量过滤，应加 200ms 防抖或使用 `startTransition`。
- **CodeMirror / Shiki 语言包应按需加载**——当前所有语言包静态导入，导致构建主包 ~2MB。新增语言支持时必须使用动态 `import()`。

### 后端性能

- **Tauri async 命令内禁止直接调用阻塞操作**——当前 `git.rs` 中所有命令（`git_status`、`git_log`、`git_push` 等）和 `fs.rs` 中的 `read_dir_entries`、`list_project_files` 虽标记为 `async fn`，但内部直接调用 `std::process::Command::output()` 等同步阻塞操作而未使用 `spawn_blocking`，会阻塞 Tokio 异步运行时。**新增 Tauri 命令凡涉及文件 I/O、进程启动、网络请求，必须包裹 `tokio::task::spawn_blocking`。**
- **持锁期间禁止执行 I/O**——`send_input`（pty.rs）在持有 `pty_writers` 锁期间执行 `write_all` + `flush`；`resize_pty` 在持有 `pty_masters` 锁期间执行 ioctl。应先 clone/取出资源再释放锁，或缩短临界区。
- **`read_session_messages` 禁止全文件一次性加载**——当前实现对整个 JSONL 文件调用 `fs::read_to_string`，长会话文件可达数百 MB。应改为流式逐行读取或支持分页。
- **`list_project_files` 应合并 git 命令**——当前执行两次 `git ls-files`（tracked + untracked），可合并为 `git ls-files -c -o --exclude-standard` 一次完成。

### 安全

- **所有接受路径参数的 Tauri 命令必须验证路径合法性**——当前 `fs.rs` 已校验目标路径必须位于项目目录内，`git.rs` 已校验 `project_path` 为合法绝对路径；新增命令继续保持同等级别的路径约束，避免目录遍历。
- **Mutex 获取禁止裸 `.unwrap()`**——`TaskManager` 主体已迁移到 `parking_lot::Mutex`，但 `pty.rs` 中子进程句柄仍使用 `std::sync::Mutex` 并存在 `lock().unwrap()`；后续应继续收敛这类中毒风险点。

### 组件规模

- **单个组件文件不应超过 400 行**——新增功能优先往已有子目录（`app-settings/` / `project-rail/` / `new-task/` / `file-explorer/` / `file-viewer/` / `git-diff/` / `git-view/`）下沉，不要继续往已经偏大的根文件里塞。

---

## 终端性能红线（最高优先级，禁止破坏）

> 终端选区 / 输入 / 写入卡顿是 2026-03 ~ 2026-05 间反复调研、`sample` 实证、A/B 验证后才稳定下来的。下列配置全部是**已经付出过代价**的真因防线，任何改动**必须先验证不破坏它们**，否则会复发数月调研。

### 写入链路（前端 `useTerminalManager.ts` + 后端 `pty.rs`）

- **PTY 输出必须走 `tauri::ipc::Channel<String>`**——`run_task` / `resume_task` 的 `onOutput` 通过 Channel 直投 hook 的批量管道。**绝不**回退到 `emit("agent-output", ...)` 全局事件广播（会触发所有 `listen` 监听，导致每条输出 N 次 setState 重渲染）。
- **`useTerminalManager` 内的 buffer/ref + RAF 批量写入是关键**——onOutput 回调必须只 push 进 ref buffer，不能在回调里 setState。
- **`term.write()` 单次切片上限 64KB**——历史上删除过该切片改"一次性 flush"，结果切换任务 / handleTerminalReady flush 时 `term.write(N_MB)` 触发明显卡顿（[[terminal_raf_optimization]]）。保留 chunk 循环。
- **PTY 读取缓冲区 32-64KB**——`spawn_pty_reader` 缓冲区不要再小（4KB 会让 npm install 这种产生 25000+ 次事件发送）。

### IME / 选区路径（前端 `TerminalView.tsx` + `terminalShared.ts`）

> 锚点 commit：**`66f2bd0` (#195 "clean up terminal selection code")** —— 该 PR 已经做了 449 删 / 237 增（净删 212 行）的死代码清理，**整段 `attachMacWebKitTerminalGuard` 的当前形态不允许回退**。代码注释里已写完整演进史（inert → blur → disabled 的删改原因），改动前先读。

- **textarea 必须保留全套抑制属性**：`spellcheck=off / autocomplete=off / autocorrect=off / autocapitalize=off / inputmode="none"`。这套组合是 2026-05 sample 实证把 IME 主线程占用从 99.7% 压到 <5% 的**真因**（[[lag_investigation_2026_05_root_cause]]、[[lag_ime_2026_05_28_acceptable_baseline]]）。`inputmode="none"` 不可省——它截的是 `EditorState::stringForCandidateRequest` → `wordRangeFromPosition` → ICU 簇分析路径，是 spellcheck 三件套覆盖不到的独立入口。
- **拖选期 `textarea.disabled = true` 必须保留**，且**只在 `pointerSelecting=true` 期间**激活——扩大到 hover / 选区残留会破坏 IME 第一字符 / focus race。
- **禁止把 `disabled` 回退成 `textarea.blur()`**——blur 后 textarea 仍 focusable，RAF / xterm 内部回调会把焦点夺回，IME 又能查；`disabled` 才是硬性禁用。社区先例：xterm.js Discussion #5227。
- **WebGL renderer 加载必须保留 dev console log**——`loadAddon(webglAddon)` silent catch 曾把"WebGL 是否启用"变成黑箱，导致 V1/V2 IME 修复整段成为死代码。任何关键依赖的 silent catch 都必须配 dev-only log。
- **document 级 pointer/key handler 调用 `term.textarea.focus()` 前必须有 `pointerSelecting` / `terminalHasSelection` 守卫**（[[feedback_terminal_refocus_must_guard]]）——否则会从分支栏 popover、新任务输入框抢走焦点。

### 容器尺寸防御（前端 `terminalShared.ts::safeFit` + 后端 `pty.rs::resize_pty`）

- **`safeFit(fitAddon, term, container)` 的三道防御不可省**：
  1. `container.getBoundingClientRect()` 宽高任一为 0 → 跳过（容器在 `display:none` 子树里，多项目挂载日常状态）
  2. `fitAddon.proposeDimensions()` 返回非有限值 → 跳过
  3. `cols < 2 || rows < 2` → 跳过
- **Why**：`FitAddon` 在 0 尺寸容器上**不返回 NaN**，而是退化到 `Math.max(MINIMUM_COLS=2, Math.floor(0/cell)) = 2`。放过 → `resize_pty` → `SIGWINCH` → Claude Code / Codex 等全屏 TUI 按 `cols=2` 重排，buffer **永久打散成一字一行不可恢复**。
- **后端 `resize_pty` 必须保留畸形尺寸兜底**——前端三层防御漏掉的话也得在这里挡住，防御纵深不允许只剩前端一层。

### 禁止方向 / 禁止复活的死代码

- **不要 native swizzle** WKWebView 的 `NSTextInputClient` 协议方法（`characterIndexForPoint:` / `firstRectForCharacterRange:` 等）——用户已实测过、明确拒绝（[[feedback_no_native_ime_swizzle]]）。
- **不要 reintroduce 以下已在 `66f2bd0` 删除的死防线**（sample 实证全部无效）：
  - `inert` 终端外 sibling 子树（`macWebKitInertCounts` / `acquireInert` / `inertTerminalBranchSiblings`）——inert 只改交互语义，不改 RenderText 在 layout tree 的存在，hit-test 照样遍历
  - `.xterm-macos-ime-guard` class + `.xterm-rows { pointer-events: none }` CSS——WebGL 模式下 `.xterm-rows` 根本不存在
  - `MutationObserver` 拦截 `.xterm-rows` 子树
  - `TERMINAL_SELECTION_ACTIVE_EVENT` 广播 + `useTerminalSelectionActive` hook + `terminalSelection.ts`——`disabled` 升级后旁支防御不再需要，删了别加回
  - `user-select: none` 抑制 + `window.getSelection().removeAllRanges()` 联动
- **不要因"对症洁癖"剥离用户已实测有效的 mitigation**（[[feedback_respect_user_tested_mitigations]]）——CSS hint / HTML attribute / DOM flag 等 cheap defense-in-depth 即便理论上不命中当前瓶颈，已有实证就保留。

### 终端相关改动的验证流程（必须遵守顺序）

1. **30 秒 A/B 砍假设空间**：能否让用户切输入法 / 切显示器 / 切某个 toggle 来二分锁定路径？能做就先做。
2. **`sample <WebContent-pid> 8 -file /tmp/x.sample` 抓现场栈**——卡顿时现场抓，不要事后追忆。
3. **才轮到读源码推理 / 写理论调用链**。
4. 任何"理论上拦截了 X 路径"的修复，**必须有修复前后的 sample 数据对照**才算证实；只看"体感好了"会被同 commit 里别的真生效改动抢功。

> 跳过前两步直接进第三步，历史上已经导致 2 个月跑偏（[[feedback_diagnose_lag_priority]]）。

---

## 提交与 PR 规范

### 提交前流程（issue-first，硬性要求）

**在动手写代码 / 开 PR 之前，先在 GitHub 开 issue 作为提案，等 maintainer 明确批复（label `accepted` 或评论确认）后再开 PR。** 这是 nezha 的硬性流程，不是建议——绕过流程直接开 PR 的会被关掉，无论代码质量如何。

提案 issue 必须写清楚（请用 issue 模板）：

- **What — 你的想法**：要改成什么样。涉及 UI / 交互的，附草图、低保真 mockup、或对当前界面的标注截图。
- **Why — 动机和原因**：为什么要这样改、痛点是什么、触发场景。**涉及前端 / 产品交互的改动这一条尤其严格**——不能只写"我觉得 X 更好看 / 更好用"，要写清「当前体验在哪个场景下有什么问题」「期望的行为是怎样」「为什么这个改法优于其他备选」。
- **Scope — 影响面**：会动到哪些模块 / 文件，会不会破坏现有功能，是否触及[终端性能红线](#终端性能红线最高优先级禁止破坏)。

> 提案目的是让 maintainer 在你写代码前确认「这事值得做 + 这个改法是对的」，避免 PR 写完才发现方向不对、被整段推翻。也防止多人撞车做同一件事。

**可跳过 issue 直接 PR 的例外**（仅限以下）：
- typo / 文档错别字 / 注释纠正
- 1–2 行的明显小 bug 修复（PR 描述里说明清楚为什么不需要 issue）
- maintainer 本人的 PR

### PR 截图 / 录屏要求（前端 / 产品改动必须）

任何涉及 UI、视觉、交互变化的 PR，**正文必须附前端截图**，缺图的 PR 不予 review。要求：

- **改前 vs 改后对照**：上下或并排放置，标注差异。
- **多状态覆盖**：默认 / hover / focus / 选中 / 禁用 / 加载中 / 空态 / 错误态——凡是改动会影响到的状态都要给一张。
- **暗色 + 亮色主题各一张**（nezha 支持 `dark` / `midnight` / `light` / `eyecare` 四种主题，至少覆盖暗色和亮色各一）。
- **动效 / 交互**：用 GIF 或短屏幕录制（≤10s），静态截图无法表达过渡 / hover / 拖拽行为。
- **响应式**：如果改动涉及面板可缩放区域，附窄 / 宽两种尺寸的截图。
- **截图里如出现私有项目名、token、邮箱等敏感信息，请打码再贴**。

纯后端 / 纯重构 / 纯测试 / 纯文档改动可跳过截图，但 PR 描述里说明「无 UI 改动」一句话。

### 提交信息

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：`<type>(<scope>): <subject>`

- 常用 type：`feat` / `fix` / `chore` / `style` / `refactor` / `docs` / `perf`
- 常用 scope（参考历史 commit）：`agent` / `git` / `terminal` / `settings` / `notification` / `codex` / `rail` / `hooks` / `window` / `theme` / `shortcuts` / `markdown` / `project`
- subject 用祈使句、小写开头、不加句号

示例（来自历史）：`fix(git): unstage before first commit and auto-collapse dirs once`、`feat(notification): poll for new notifications every 6h`、`fix(terminal): allow native selection while agent runs`。

### 一个 PR 只解决一件事（单一职责）

- **不要在一个 PR 里同时混杂**：bug 修复 + 新功能 + 重构 + 样式调整。各自开 PR。
- 顺手发现的小问题**开新 PR**，不要塞进当前分支——除非该修复是当前 PR 的必要前置，且需在描述里说明。
- 改动跨子系统（前端 + 后端 + hook）时，看一下能否按"feature vertical slice"拆分：能拆就拆。
- 例外：纯机械的命名 / 移动 / 类型整理可以合并进相关功能 PR，但要在 body 里指出。

### PR 标题与正文

- 标题与 commit message 同风格（一行 Conventional Commits，<70 字符）。
- 正文写**为什么**（动机 / 取舍 / 上下文），不写**做了什么**——diff 已经说明。
- 涉及终端 / IME / 选区 / 性能时，正文必须给出验证证据（A/B 结果、sample 截取、profiler 数据），不能只写"测试通过"。

---

## 开发流程 Checklist（写代码前过一遍）

**写前端组件前：**
- [ ] 不写 `style={{}}`，样式进 `src/styles/` 模块
- [ ] UI 原语用 Radix / `lucide-react`，不用原生 `<select>` / `<dialog>` / 自实现
- [ ] 高频回调（PTY 输出、滚动）不直接 setState，用 ref + RAF 批量
- [ ] 长列表（>1000 条）考虑虚拟滚动
- [ ] 改动涉及 `TerminalView.tsx` / `terminalShared.ts` / `useTerminalManager.ts` → **先过终端性能红线章节**

**写 Tauri 命令前：**
- [ ] 路径参数 → canonicalize + starts_with 校验
- [ ] 文件 I/O / 进程 / 网络 → `tokio::task::spawn_blocking` + `kill_on_drop(true)` + `timeout`
- [ ] 读大文件 → 流式，禁止 `fs::read_to_string` 全量加载；`read_file_content` 硬限 2 MB
- [ ] 持锁期间不做 I/O，先 clone / drop guard
- [ ] Mutex 用 `parking_lot::Mutex`，不裸 `.unwrap()`
- [ ] 新命令在 `lib.rs::invoke_handler!` 注册；用 `invoke<ReturnType>()` 类型化

**改数据 schema 前：**
- [ ] `types.ts` 和 `storage.rs` Task 结构体同步更新，否则新字段静默丢失
- [ ] 字段重命名写迁移——`~/.nezha/` 是用户数据，不能静默损坏

---

## 会话自动发现

后端监听智能体创建的新会话文件：
- **Claude Code**：`~/.claude/projects/<encoded-path>/*.jsonl`
- **Codex**：`<project-path>/.codex/sessions/*.jsonl`

会话通过项目路径、提示词文本和创建时间戳与任务进行匹配。兜底方案是从智能体退出时打印的终端输出中提取会话 ID。这是 UI 在无需直接 API 集成的情况下，将已启动进程与其会话日志关联起来的实现方式。
