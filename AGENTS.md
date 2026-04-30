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
App
├── WelcomePage              — 项目选择页
└── ProjectPage
    ├── ProjectRail          — 左侧导航栏（项目切换器）
    ├── TaskPanel            — 任务列表侧边栏
    │   ├── BranchBar        — Git 分支切换 / 创建
    │   ├── TaskList → TaskListItem
    │   └── SidebarFooterActions → AppSettingsDialog
    ├── NewTaskView          — 任务创建视图
    │   ├── PromptEditor
    │   ├── MentionPopover
    │   ├── ImageAttachments
    │   └── AgentPermSelector
    ├── TodoTaskView         — Todo 任务编辑 / 启动视图
    ├── RunningView          — 运行中任务头部（恢复、取消）
    │   └── TerminalView     — xterm.js 封装组件
    ├── SessionView          — 会话消息查看器（JSONL 回放）
    ├── AnalyticsDashboard   — 每周 token / 工具调用用量图表
    ├── ShellTerminalPanel   — 嵌入式交互 Shell 终端
    ├── SettingsDialog       — 项目级设置（config.toml 编辑器 + 智能体配置）
    ├── RightToolbar         — 右侧面板与 Shell 的开关入口
    └── 右侧面板（同时只有一个处于激活状态）：
        ├── FileExplorer → FileViewer → ImagePreviewPane
        ├── GitChanges → GitDiffViewer     — 暂存/未暂存变更、提交 UI
        └── GitHistory → GitDiffViewer     — 提交日志、提交差异查看器
```

状态从 `App.tsx` 通过 props 向下传递；异步更新通过 Tauri 通道/事件向上传递：
- **agent 任务输出** — 通过 `tauri::ipc::Channel<String>`（前端 `new Channel<string>()`）由 `run_task` / `resume_task` 的 `onOutput` 参数传入，绕过事件总线的全局广播，直投 `useTerminalManager` 的批量写入流程
- `task-status` — `{ task_id, status }` 任务生命周期状态变更
- `task-session` — `{ task_id, session_id, session_path }` 会话发现
- `shell-output` — `{ shell_id, data }` 嵌入式 Shell 的 PTY 字节流（仍走 emit 事件）

### 后端（`src-tauri/src/`）

`lib.rs` 是精简的入口点，负责注册所有模块和 Tauri 命令处理列表。业务逻辑拆分到各专职模块：

| 模块 | 职责 |
|--------|---------------|
| `pty.rs` | 任务和 Shell 的 PTY 创建/读写（`run_task`、`resume_task`、`cancel_task`、`send_input`、`resize_pty`、`open_shell`、`kill_shell`） |
| `session.rs` | Claude & Codex 的会话文件监听；终端输出兜底提取；`read_session_messages` |
| `storage.rs` | 基于文件的持久化（`load_projects`、`save_projects`、`load_project_tasks`、`save_project_tasks`） |
| `fs.rs` | 文件系统命令（`read_dir_entries`、`read_file_content`、`read_image_preview`、`write_file_content`、`list_project_files`） |
| `git.rs` | 完整 Git 集成：状态、分支、日志、差异、暂存/取消暂存、提交、推送、拉取、`generate_commit_message` |
| `analytics.rs` | 解析会话 JSONL 获取 token / 工具调用指标（`read_session_metrics`、`get_weekly_analytics`） |
| `config.rs` | 项目级 `.nezha/config.toml` 管理（`init_project_config`、`read_project_config`、`write_project_config`、`read_agent_config_file`、`write_agent_config_file`） |
| `app_settings.rs` | 应用级智能体路径与版本管理（`load_app_settings`、`save_app_settings`、`detect_agent_paths`、`detect_agent_versions`） |

核心结构体：`TaskManager` 由 Tauri 托管状态持有，内部使用 `parking_lot::Mutex` 管理 PTY 主端、写入器、子进程句柄、会话映射及已认领的会话路径。

**权限模式 → CLI 标志映射：**
| 模式 | 标志 |
|------|------|
| `ask` | `--permission-mode default` |
| `auto_edit` | `--permission-mode acceptEdits` |
| `full_access` | `--dangerously-skip-permissions` |

---

## 数据模型

```typescript
// 任务状态生命周期：
// todo → pending → running ↔ input_required → done | failed | cancelled

interface Task {
  id: string;
  projectId: string;
  name?: string;
  prompt: string;
  agent: "claude" | "codex";
  permissionMode: "ask" | "auto_edit" | "full_access";
  status: TaskStatus;
  createdAt: number;
  attentionRequestedAt?: number;
  starred?: boolean;
  failureReason?: string;
  claudeSessionId?: string;
  claudeSessionPath?: string;
  codexSessionId?: string;
  codexSessionPath?: string;
}
```

**持久化存储（基于文件，非 localStorage）：**
- `~/.nezha/projects.json` — Project[]
- `~/.nezha/projects/<projectId>/tasks.json` — Task[]（每个项目独立一个文件）
- 主题及 UI 偏好存储于 localStorage

**Tauri 存储命令（`src-tauri/src/storage.rs`）：**
- `load_projects` / `save_projects`
- `load_project_tasks` / `save_project_tasks`

> 修改 Task 数据结构时，**必须同步更新 `types.ts`（TypeScript）和 `storage.rs` 中的 `Task` 结构体（Rust）**——否则新字段在序列化时会被静默丢弃。

---

## 项目配置

每个项目首次打开时会自动创建 `.nezha/config.toml`（由 `init_project_config` 触发）：

```toml
[agent]
default = "claude"        # 新任务的默认智能体
prompt_prefix = ""        # 拼接到每个任务提示词前面的文本
claude_version = ""       # 自动探测并回写的 Claude Code 版本
codex_version = ""        # 自动探测并回写的 Codex 版本

[git]
commit_prompt = "..."     # generate_commit_message 使用的提示词
```

附加到任务的图片会保存至 `.nezha/attachments/<taskId>/`，其路径会被追加到提示词末尾，以便智能体通过文件工具读取。任务完成后附件会被自动清理。

---

## 开发规范

### 样式

- 所有样式统一放在 `src/styles/` 目录下，并通过 `src/styles/index.ts` 聚合导出。新样式优先按已有模块（`layout`、`panels`、`task`、`terminal`、`dialogs`、`common`）归档，不要创建独立的业务 `.css` 文件，也不要使用行内 `style={{}}` 属性（真正一次性的除外）。
- 主题变量（颜色、间距）是 `App.css` 中的 CSS 自定义属性，在 `styles/*` 中通过 `var(--name)` 引用。

### 状态管理

- 不引入外部状态库。跨项目/跨面板的核心状态主要存活在 `App.tsx` 中并通过 props 向下传递；组件内部的短生命周期 UI 状态保留在各自组件内。
- Tauri 事件（`listen()`）驱动异步状态更新——后端的状态变更通过此机制到达前端。
- 任何数据变更后，立即通过 Tauri 的 `save_projects` / `save_project_tasks` 命令持久化到磁盘。

### TypeScript

- 已开启严格模式（`tsconfig.json`）。避免使用 `any`，应扩展 `types.ts` 代替。
- Tauri 命令使用 `invoke<ReturnType>()` 类型化——添加新命令时记得加泛型参数。

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
- **PTY 读取缓冲区不宜过小**——当前 `pty.rs` 中 `spawn_pty_reader` 使用 4096 字节缓冲区，大量输出（如 npm install）会产生 25000+ 次事件发送。新增类似读取循环时缓冲区应至少 32KB-64KB。
- **持锁期间禁止执行 I/O**——`send_input`（pty.rs）在持有 `pty_writers` 锁期间执行 `write_all` + `flush`；`resize_pty` 在持有 `pty_masters` 锁期间执行 ioctl。应先 clone/取出资源再释放锁，或缩短临界区。
- **`read_session_messages` 禁止全文件一次性加载**——当前实现对整个 JSONL 文件调用 `fs::read_to_string`，长会话文件可达数百 MB。应改为流式逐行读取或支持分页。
- **`list_project_files` 应合并 git 命令**——当前执行两次 `git ls-files`（tracked + untracked），可合并为 `git ls-files -c -o --exclude-standard` 一次完成。

### 安全

- **所有接受路径参数的 Tauri 命令必须验证路径合法性**——当前 `fs.rs` 已校验目标路径必须位于项目目录内，`git.rs` 已校验 `project_path` 为合法绝对路径；新增命令继续保持同等级别的路径约束，避免目录遍历。
- **Mutex 获取禁止裸 `.unwrap()`**——`TaskManager` 主体已迁移到 `parking_lot::Mutex`，但 `pty.rs` 中子进程句柄仍使用 `std::sync::Mutex` 并存在 `lock().unwrap()`；后续应继续收敛这类中毒风险点。

### 组件规模

- **单个组件文件不应超过 400 行**——`NewTaskView`、`TaskPanel`、`ProjectPage` 已基本完成拆分，但 `App.tsx`（835 行）、`AppSettingsDialog`（621 行）、`task-panel/BranchBar.tsx`（531 行）仍超标。新增功能若落在这些文件，优先继续拆分再扩展。

---

## 禁止事项

- **不要引入 CSS 框架**（Tailwind 等）——现有的 `src/styles/` 模块化 CSS-in-JS 模式是有意为之的设计决策。
- **不要在未经讨论的情况下引入状态管理库**（Redux、Zustand）——当前的 props 透传方式是刻意保持简单的。
- **交互式 UI 原语优先使用组件库而非原生 HTML 元素**——下拉菜单、对话框、提示框等使用已安装的 Radix UI（`@radix-ui/react-select`），而非 `<select>`、`<dialog>` 或自行实现。按需添加其他 Radix headless 包。图标使用已安装的 `lucide-react`。
- **`read_file_content` 中不要读取超过 2 MB 的文件**——此限制在 Rust 侧强制执行，属于有意为之的设计。
- **不要在未考虑迁移方案的情况下修改文件存储 schema**（`~/.nezha/`）——字段名变更会导致现有用户数据静默损坏。
- **不要阻塞 Tauri 主线程**——所有重型操作必须通过 `tokio::task::spawn_blocking` 处理。

---

## 会话自动发现

后端监听智能体创建的新会话文件：
- **Claude Code**：`~/.claude/projects/<encoded-path>/*.jsonl`
- **Codex**：`<project-path>/.codex/sessions/*.jsonl`

会话通过项目路径、提示词文本和创建时间戳与任务进行匹配。兜底方案是从智能体退出时打印的终端输出中提取会话 ID。这是 UI 在无需直接 API 集成的情况下，将已启动进程与其会话日志关联起来的实现方式。
