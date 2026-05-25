# Desktop Enhancements Design

## Goal

Improve Nezha's desktop experience without changing the core Tauri architecture. The first release focuses on safer agent execution, better per-project defaults, prompt templates, lighter session analysis, notifications, and local metadata backups.

This design explicitly does not include queueing, scheduled tasks, Git workflow expansion, custom agents, or Web/API conversion.

## Scope

Included:

- Project-level permission policy for Claude and Codex tasks.
- Built-in Claude/Codex configuration enhancements.
- Project-level prompt template library with basic variables.
- Session replay search, role/tool filtering, and clearer local usage metrics.
- Native notifications for task status and permission risk events.
- Manual and lightweight automatic backups for Nezha, Codex, and Claude metadata.

Excluded:

- Task queues and scheduled tasks.
- Git workflow improvements beyond the current feature set.
- Custom command-line agents.
- CSV/JSON analytics export, ranking reports, or advanced dashboards.
- One-click restore from backup.
- Web UI, HTTP API, remote runner, or Docker-first deployment.

## Architecture

Nezha remains a Tauri desktop application. The frontend continues to use React, TypeScript, Vite, and Tauri `invoke` calls. The Rust backend continues to own privileged local operations: PTY management, agent process launch, filesystem access, Git commands, session file discovery, analytics parsing, notifications, and backups.

New functionality is split into focused modules instead of adding more logic to `App.tsx`.

Frontend responsibilities:

- Render project and application settings.
- Disable invalid permission choices before launch.
- Render prompt template selection and variable insertion.
- Confirm high-risk launches when project policy requires it.
- Search and filter already loaded session messages.
- Display backup status and notification settings.

Rust responsibilities:

- Persist and default new configuration fields.
- Enforce project permission policy in `run_task` and `resume_task`.
- Launch Claude/Codex only after policy validation.
- Send task-status and session events as today.
- Trigger or expose native notifications.
- Copy metadata into timestamped backup directories and write backup manifests.

## Project Configuration

Project configuration remains stored at:

```text
<project>/.nezha/config.toml
```

The existing `[agent]` and `[git]` sections remain compatible. New sections are added with defaults through `serde(default)` so old project files continue to load.

Example:

```toml
[agent]
default = "claude"
prompt_prefix = ""
claude_version = ""
codex_version = ""

[permissions]
default_mode = "ask"
max_mode = "auto_edit"
confirm_full_access = true

[git]
commit_prompt = "..."

[[prompt_templates.templates]]
id = "bugfix"
name = "Bug Fix"
content = "Fix the bug in {projectName} on branch {branch}."

[[prompt_templates.templates]]
id = "review"
name = "Code Review"
content = "Review the recent changes and list risks."
```

Permission strength order:

```text
ask < auto_edit < full_access
```

If a requested task permission exceeds `permissions.max_mode`, Nezha refuses to start or resume the task and shows a clear error. It does not silently downgrade permissions.

Default project values:

```text
permissions.default_mode = "ask"
permissions.max_mode = "auto_edit"
permissions.confirm_full_access = true
prompt_templates.templates = []
```

## Application Settings

Application settings remain stored at:

```text
~/.nezha/settings.json
```

The existing `claude_path` and `codex_path` fields remain compatible. New fields are optional and defaulted when absent.

Example:

```json
{
  "claude_path": "/path/to/claude",
  "codex_path": "/path/to/codex",
  "notifications": {
    "task_status": true,
    "permission_risk": true
  },
  "backup": {
    "enabled": false,
    "destination": "~/.nezha/backups",
    "retain": 10
  }
}
```

Default application values:

```text
notifications.task_status = true
notifications.permission_risk = true
backup.enabled = false
backup.destination = "~/.nezha/backups"
backup.retain = 10
```

Automatic backup is disabled by default because `~/.codex` and `~/.claude` may be large or sensitive.

## Permission Policy

Permission policy is enforced in two places.

Frontend validation:

- `NewTaskView` reads the project config.
- Permission options above `max_mode` are disabled.
- If `full_access` is selected and `confirm_full_access` is true, a confirmation dialog appears before launch.
- The selected mode must pass validation before invoking `run_task`.

Backend validation:

- `run_task` reads the project config and validates the requested permission.
- `resume_task` performs the same validation because resumed sessions can receive a permission mode.
- Validation failures return an error and do not launch the agent process.

This prevents bypassing policy through stale UI state or direct command invocation.

## Prompt Templates

Prompt templates are project-scoped. They are managed in the project settings dialog and inserted from the new-task view.

Template fields:

- `id`: stable generated identifier.
- `name`: user-visible template name.
- `content`: template body.

Supported variables:

- `{projectName}`
- `{projectPath}`
- `{branch}`
- `{date}`
- `{agent}`

Insertion behavior:

- If the prompt editor is empty, choosing a template replaces the prompt.
- If the prompt editor has content, choosing a template inserts at the current cursor location when available, otherwise appends.
- Unknown variables are left unchanged.

The first release does not include conditionals, script execution, template categories, search, or a shared template marketplace.

## Session Replay And Metrics

`SessionView` gains local search and filtering over loaded messages.

Features:

- Text search across user, assistant, and tool content.
- Role filter: all, user, assistant, tool.
- Tool-call highlighting or compact display.
- A clearer metrics strip showing input tokens, output tokens, tool calls, and duration.

Existing commands remain:

- `read_session_messages(session_path)`
- `read_session_metrics(session_path)`

The first release performs search/filtering in the React component after loading messages. It does not introduce a paginated session API. For very large sessions, the UI may show a warning that search can be slow. A later performance pass can replace this with streaming or pagination.

## Notifications

Notifications cover two categories:

- Task status: done, failed, cancelled, and input required.
- Permission risk: high-risk `full_access` launches or policy-related warnings.

Settings:

- `notifications.task_status`
- `notifications.permission_risk`

Task status notifications should be triggered near the backend status source where possible. Permission-risk confirmation remains a frontend interaction because the user must approve before launch. Notification errors must not block task execution.

If native notification permission is unavailable, Nezha should fail quietly for task execution and surface the notification issue in settings when practical.

## Backups

Backups copy metadata needed to preserve Nezha task history and agent context. They do not copy the full project repositories.

Sources:

- `~/.nezha`
- `~/.codex`
- `~/.claude`
- `<project>/.nezha`
- `<project>/.codex/sessions`

Destination layout:

```text
~/.nezha/backups/2026-05-25T12-30-00/
  manifest.json
  home/.nezha/
  home/.codex/
  home/.claude/
  projects/<projectId>/.nezha/
  projects/<projectId>/.codex/sessions/
```

`manifest.json` records:

- Backup timestamp.
- Nezha version when available.
- Application settings relevant to backup.
- Project IDs, names, and original paths.
- Copied source and destination entries.
- Warnings for missing or unreadable paths.
- Whether tasks were running when the backup started.

Commands:

- `run_backup_now(projects: Vec<Project>) -> BackupResult`
- `get_backup_status() -> BackupStatus`

Automatic backup behavior:

- If enabled, Nezha checks on app startup.
- If no successful backup exists in the last 24 hours, it starts one in the background.
- Retention deletes oldest timestamped backup directories beyond `backup.retain`.

Manual backup behavior:

- App settings includes a "Back Up Now" action.
- The result shows success, partial success, or failure.
- The manifest path is displayed for inspection.

One-click restore is out of scope for the first release.

## UI Changes

Project settings dialog:

- Add "Agent Defaults" with default agent, default permission, maximum permission, and full-access confirmation.
- Keep prompt prefix editing.
- Add "Prompt Templates" with list, create, edit, and delete actions.
- Template editor includes variable insert buttons.

New task view:

- Use project default agent and permission.
- Disable permission options that exceed project max permission.
- Add a prompt template picker near the prompt editor.
- Confirm high-risk full-access launches before invoking `run_task`.

Session view:

- Add search input.
- Add role filter.
- Add clearer metrics strip.
- Highlight or compact tool calls.

Application settings dialog:

- Add notification toggles.
- Add backup controls: enabled, destination, retention, run now, and latest result.

The first release avoids new top-level navigation and avoids nesting cards inside cards.

## Backend Modules

Existing modules to extend:

- `config.rs`: project config structs, defaults, prompt templates, permission config.
- `app_settings.rs`: notification and backup settings.
- `pty.rs`: backend permission validation in `run_task` and `resume_task`.
- `notification.rs`: task status and permission-risk helpers.
- `lib.rs`: command registration for new backup commands.

New module:

- `backup.rs`: metadata copy, manifest generation, status tracking, retention cleanup.

All filesystem-heavy backup operations must run in `tokio::task::spawn_blocking` or equivalent blocking-safe code. Path handling must avoid escaping the intended source and destination roots.

## Migration

No destructive migration is required.

Rules:

- Old `config.toml` files load with default `permissions` and empty prompt templates.
- Old `settings.json` files load with default notification and backup settings.
- Existing task records are not rewritten for this release.
- New fields are written only when users save the relevant settings.
- Existing session paths and task history remain valid.

## Testing

Frontend tests:

- Permission options are disabled according to `max_mode`.
- New tasks use project default agent and permission.
- Template variables resolve correctly.
- Template insertion replaces empty prompts and inserts into non-empty prompts.
- Full-access launch confirmation appears when configured.
- Session search and role filtering work.
- Settings dialogs read and write new notification and backup settings.

Rust tests:

- Old TOML without new sections deserializes successfully.
- Old settings JSON without new fields deserializes successfully.
- Permission comparison rejects requests above `max_mode`.
- `run_task` and `resume_task` call permission validation.
- Backup records missing source directories as warnings.
- Backup writes a valid manifest.
- Retention cleanup removes oldest backups beyond the configured limit.

Manual verification:

1. Open an old project and verify new settings show defaults.
2. Start a Codex task with `auto_edit`.
3. Attempt Codex `full_access` when `max_mode = "auto_edit"` and confirm launch is blocked.
4. Allow `full_access`, confirm the dialog appears, and verify launch proceeds after approval.
5. Start a Claude task and verify Codex-specific behavior does not break it.
6. Insert a prompt template and verify variables resolve.
7. Complete, fail, cancel, and input-required task paths trigger notifications when enabled.
8. Run a manual backup and inspect `manifest.json`.
9. Verify automatic backup does not run when disabled.
10. Search and filter an existing session without changing stored task data.

## Implementation Order

1. Extend data models and defaults.
2. Add permission comparison and backend validation.
3. Update project settings UI.
4. Connect new-task defaults, permission policy, and prompt templates.
5. Enhance session replay search, filtering, and metrics display.
6. Add notification settings and status notifications.
7. Add backup settings and manual backup.
8. Add startup-triggered automatic backup.
9. Run frontend, Rust, and manual regression checks.

## Open Decisions

None for the first release. Queueing, scheduled tasks, Git workflow expansion, custom agents, advanced analytics, and Web conversion are intentionally deferred.
