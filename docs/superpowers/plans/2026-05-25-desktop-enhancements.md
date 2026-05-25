# Desktop Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-level execution policy, built-in agent defaults, prompt templates, session search/filtering, notifications, and local metadata backups to the existing Tauri desktop app.

**Architecture:** Keep the current Tauri desktop architecture. Extend Rust config/settings modules for durable data and backend enforcement, keep React UI state local where possible, and avoid expanding `App.tsx` except for startup/status wiring. Implement each subsystem behind small helpers so later queueing, scheduling, or Web/API work can build on stable interfaces.

**Tech Stack:** React 19, TypeScript, Vite, Radix UI, lucide-react, Tauri 2, Rust 2021, serde, toml, parking_lot, Vitest, Cargo tests.

---

## Scope Reference

Design spec: `docs/superpowers/specs/2026-05-25-desktop-enhancements-design.md`

Included in this plan:

- Project permission policy.
- Claude/Codex built-in defaults.
- Project prompt templates with basic variables.
- Session replay search/filtering and clearer metrics display.
- Task status and permission risk notifications.
- Manual and startup-triggered metadata backups.

Excluded from this plan:

- Queues and scheduled tasks.
- Git workflow changes.
- Custom agents.
- Web/API conversion.
- One-click restore.

## File Structure

### Shared Frontend Types And Helpers

- Modify `src/types.ts`
  - Add `ProjectConfig`, `PermissionConfig`, `PromptTemplate`, `NotificationSettings`, `BackupSettings`, `AppSettings`, `BackupResult`, and `BackupStatus`.
  - Add permission comparison helpers shared by settings and new-task UI.
- Create `src/utils/promptTemplates.ts`
  - Resolve supported prompt template variables.
  - Keep template insertion pure and testable.
- Create `src/test/promptTemplates.test.ts`
  - Unit tests for variable replacement and unknown-variable preservation.

### Rust Configuration And Policy

- Modify `src-tauri/src/config.rs`
  - Add `PermissionConfig`, `PromptTemplate`, and `PromptTemplateConfig`.
  - Keep `agent.default_permission_mode` for backward compatibility, but introduce `[permissions]` as the new policy source.
  - Add `effective_default_permission_mode()` so old configs still work.
  - Add `validate_permission_mode(project_path, requested)`.
  - Add Rust tests for old TOML and permission comparisons.
- Modify `src-tauri/src/pty.rs`
  - Call `validate_permission_mode()` in both `run_task` and `resume_task` before opening/spawning PTYs.

### App Settings, Notifications, Backup

- Modify `src-tauri/src/app_settings.rs`
  - Add nested notification and backup settings with `serde(default)`.
  - Preserve existing `claude_path` and `codex_path` behavior.
  - Add tests for old settings JSON.
- Modify `src-tauri/src/notification.rs`
  - Add local native-notification command helpers, or if native OS notification support is not currently available through a plugin, expose no-op-safe commands that return a structured unavailable result.
- Create `src-tauri/src/backup.rs`
  - Implement manual backup, last-status reading, manifest writing, and retention cleanup.
- Modify `src-tauri/src/lib.rs`
  - Register `backup` module and new commands.

### React UI

- Modify `src/components/SettingsDialog.tsx`
  - Add project permission controls.
  - Add prompt template CRUD UI.
  - Validate default permission does not exceed max permission.
- Modify `src/components/NewTaskView.tsx`
  - Read full `ProjectConfig`.
  - Apply project defaults and prompt templates.
  - Confirm `full_access` when required.
  - Pass permission-limit metadata into the selector.
- Modify `src/components/new-task/AgentPermSelector.tsx`
  - Disable permission modes above project max.
  - Add prompt template picker entry in the toolbar.
- Modify `src/components/SessionView.tsx`
  - Add search input, role filter, tool visibility/filtering, and filtered rendering.
- Modify `src/components/RunningView.tsx`
  - Keep metrics display coordinated with session view and avoid duplicate/conflicting numbers.
- Modify `src/components/AppSettingsDialog.tsx`
  - Add notification settings and backup controls.
- Modify `src/App.tsx`
  - Load app settings early enough for startup backup and notifications.
  - Trigger automatic backup after projects load if enabled and due.
  - Trigger task-status notifications when enabled.

### Styles

- Modify existing style modules under `src/styles/`
  - Use existing `dialogs`, `task`, `terminal`, and `common` exports.
  - Do not create standalone CSS files.
  - Avoid inline styles for new repeated UI where practical; leave current inline-heavy legacy code alone unless the touched block needs extraction.

---

## Task 1: Shared Types, Prompt Template Helpers, And Rust Config Defaults

**Files:**

- Modify: `src/types.ts`
- Create: `src/utils/promptTemplates.ts`
- Create: `src/test/promptTemplates.test.ts`
- Modify: `src-tauri/src/config.rs`

- [ ] **Step 1: Add frontend types and permission helpers**

In `src/types.ts`, add these exports after `permissionModeLabel()`:

```ts
export interface PermissionConfig {
  default_mode: PermissionMode;
  max_mode: PermissionMode;
  confirm_full_access: boolean;
}

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
}

export interface PromptTemplateConfig {
  templates: PromptTemplate[];
}

export interface ProjectConfig {
  agent: {
    default: AgentType;
    default_permission_mode?: PermissionMode;
    prompt_prefix: string;
    claude_version: string;
    codex_version: string;
  };
  permissions: PermissionConfig;
  prompt_templates: PromptTemplateConfig;
  git: { commit_prompt: string };
}

const PERMISSION_RANK: Record<PermissionMode, number> = {
  ask: 0,
  auto_edit: 1,
  full_access: 2,
};

export function permissionModeRank(mode: PermissionMode): number {
  return PERMISSION_RANK[mode];
}

export function isPermissionMode(value: string): value is PermissionMode {
  return value === "ask" || value === "auto_edit" || value === "full_access";
}

export function isAgentType(value: string): value is AgentType {
  return value === "claude" || value === "codex";
}

export function isPermissionAllowed(requested: PermissionMode, maxMode: PermissionMode): boolean {
  return permissionModeRank(requested) <= permissionModeRank(maxMode);
}
```

- [ ] **Step 2: Add prompt template helper**

Create `src/utils/promptTemplates.ts`:

```ts
import type { AgentType, Project, PromptTemplate } from "../types";

export interface PromptTemplateVariables {
  project: Project;
  branch?: string;
  agent: AgentType;
  now?: Date;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolvePromptTemplate(
  template: PromptTemplate,
  variables: PromptTemplateVariables,
): string {
  const values: Record<string, string> = {
    projectName: variables.project.name,
    projectPath: variables.project.path,
    branch: variables.branch ?? "",
    date: formatDate(variables.now ?? new Date()),
    agent: variables.agent,
  };

  return template.content.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match;
  });
}
```

- [ ] **Step 3: Add prompt template tests**

Create `src/test/promptTemplates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolvePromptTemplate } from "../utils/promptTemplates";
import type { Project, PromptTemplate } from "../types";

const project: Project = {
  id: "p1",
  name: "nezha",
  path: "/Users/example/nezha",
  branch: "main",
  lastOpenedAt: 1,
};

describe("resolvePromptTemplate", () => {
  it("replaces supported variables", () => {
    const template: PromptTemplate = {
      id: "bugfix",
      name: "Bug Fix",
      content: "Fix {projectName} at {projectPath} on {branch} using {agent} on {date}.",
    };

    expect(
      resolvePromptTemplate(template, {
        project,
        branch: "feature/x",
        agent: "codex",
        now: new Date("2026-05-25T08:00:00Z"),
      }),
    ).toBe("Fix nezha at /Users/example/nezha on feature/x using codex on 2026-05-25.");
  });

  it("preserves unknown variables", () => {
    const template: PromptTemplate = {
      id: "unknown",
      name: "Unknown",
      content: "Keep {unknownValue} but replace {projectName}.",
    };

    expect(resolvePromptTemplate(template, { project, agent: "claude" })).toBe(
      "Keep {unknownValue} but replace nezha.",
    );
  });
});
```

- [ ] **Step 4: Run frontend helper tests and verify they pass**

Run:

```bash
pnpm test src/test/promptTemplates.test.ts
```

Expected: test file passes.

- [ ] **Step 5: Extend Rust project config structs**

In `src-tauri/src/config.rs`, add these types and helpers near the existing config structs:

```rust
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct PermissionConfig {
    #[serde(default = "default_permission_mode", alias = "default_permission_mode")]
    pub default_mode: String,
    #[serde(default = "default_max_permission_mode")]
    pub max_mode: String,
    #[serde(default = "default_confirm_full_access")]
    pub confirm_full_access: bool,
}

fn default_max_permission_mode() -> String {
    "auto_edit".to_string()
}

fn default_confirm_full_access() -> bool {
    true
}

impl Default for PermissionConfig {
    fn default() -> Self {
        Self {
            default_mode: default_permission_mode(),
            max_mode: default_max_permission_mode(),
            confirm_full_access: default_confirm_full_access(),
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct PromptTemplate {
    pub id: String,
    pub name: String,
    pub content: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Default)]
pub struct PromptTemplateConfig {
    #[serde(default)]
    pub templates: Vec<PromptTemplate>,
}
```

Update `ProjectConfig` to:

```rust
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct ProjectConfig {
    pub agent: AgentConfig,
    #[serde(default)]
    pub permissions: PermissionConfig,
    #[serde(default)]
    pub prompt_templates: PromptTemplateConfig,
    pub git: GitConfig,
}
```

Update `Default for ProjectConfig` to initialize `permissions: PermissionConfig::default()` and `prompt_templates: PromptTemplateConfig::default()`.

- [ ] **Step 6: Update default TOML**

In `DEFAULT_CONFIG`, keep `agent.default_permission_mode = "ask"` for backward compatibility and add:

```toml
[permissions]
# Default permission mode for new tasks: "ask", "auto_edit", or "full_access"
default_mode = "ask"
# Highest permission mode allowed for tasks in this project
max_mode = "auto_edit"
# Ask for confirmation before launching full access tasks
confirm_full_access = true

[prompt_templates]
templates = []
```

- [ ] **Step 7: Add permission validation helpers**

In `src-tauri/src/config.rs`, add:

```rust
fn permission_rank(mode: &str) -> Option<u8> {
    match mode {
        "ask" => Some(0),
        "auto_edit" => Some(1),
        "full_access" => Some(2),
        _ => None,
    }
}

pub(crate) fn effective_default_permission_mode(config: &ProjectConfig) -> String {
    if permission_rank(&config.permissions.default_mode).is_some() {
        config.permissions.default_mode.clone()
    } else if permission_rank(&config.agent.default_permission_mode).is_some() {
        config.agent.default_permission_mode.clone()
    } else {
        default_permission_mode()
    }
}

pub(crate) fn validate_permission_mode(project_path: &str, requested: &str) -> Result<(), String> {
    let requested_rank = permission_rank(requested)
        .ok_or_else(|| format!("Unknown permission mode: {}", requested))?;
    let config = read_project_config(project_path.to_string())?;
    let max_rank = permission_rank(&config.permissions.max_mode)
        .ok_or_else(|| format!("Unknown max permission mode: {}", config.permissions.max_mode))?;

    if requested_rank > max_rank {
        return Err(format!(
            "Permission mode '{}' exceeds project maximum '{}'",
            requested, config.permissions.max_mode
        ));
    }

    Ok(())
}
```

- [ ] **Step 8: Add Rust config tests**

Append to `src-tauri/src/config.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_config_without_new_sections_deserializes() {
        let raw = r#"
[agent]
default = "codex"
default_permission_mode = "ask"
prompt_prefix = ""
claude_version = ""
codex_version = ""

[git]
commit_prompt = "commit"
"#;

        let config: ProjectConfig = toml::from_str(raw).expect("old config should parse");
        assert_eq!(config.agent.default, "codex");
        assert_eq!(config.permissions.default_mode, "ask");
        assert_eq!(config.permissions.max_mode, "auto_edit");
        assert!(config.permissions.confirm_full_access);
        assert!(config.prompt_templates.templates.is_empty());
    }

    #[test]
    fn permission_rank_orders_modes() {
        assert!(permission_rank("ask") < permission_rank("auto_edit"));
        assert!(permission_rank("auto_edit") < permission_rank("full_access"));
        assert_eq!(permission_rank("bad"), None);
    }

    #[test]
    fn effective_default_permission_prefers_permissions_section() {
        let mut config = ProjectConfig::default();
        config.agent.default_permission_mode = "full_access".to_string();
        config.permissions.default_mode = "auto_edit".to_string();
        assert_eq!(effective_default_permission_mode(&config), "auto_edit");
    }
}
```

- [ ] **Step 9: Run Rust config tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml config::tests
```

Expected: config tests pass.

- [ ] **Step 10: Commit Task 1**

Run:

```bash
git add src/types.ts src/utils/promptTemplates.ts src/test/promptTemplates.test.ts src-tauri/src/config.rs
git commit -m "feat: add project policy and prompt template models"
```

---

## Task 2: Backend Permission Enforcement

**Files:**

- Modify: `src-tauri/src/pty.rs`
- Modify: `src-tauri/src/config.rs`

- [ ] **Step 1: Add a unit-testable validation entry point**

In `src-tauri/src/config.rs`, add this helper near `validate_permission_mode`:

```rust
pub(crate) fn validate_permission_against_max(
    requested: &str,
    max_mode: &str,
) -> Result<(), String> {
    let requested_rank = permission_rank(requested)
        .ok_or_else(|| format!("Unknown permission mode: {}", requested))?;
    let max_rank = permission_rank(max_mode)
        .ok_or_else(|| format!("Unknown max permission mode: {}", max_mode))?;

    if requested_rank > max_rank {
        return Err(format!(
            "Permission mode '{}' exceeds project maximum '{}'",
            requested, max_mode
        ));
    }

    Ok(())
}
```

Change `validate_permission_mode()` to call it:

```rust
pub(crate) fn validate_permission_mode(project_path: &str, requested: &str) -> Result<(), String> {
    let config = read_project_config(project_path.to_string())?;
    validate_permission_against_max(requested, &config.permissions.max_mode)
}
```

- [ ] **Step 2: Add validation tests**

Add these tests inside `config::tests`:

```rust
#[test]
fn validate_permission_against_max_allows_equal_or_lower() {
    assert!(validate_permission_against_max("ask", "auto_edit").is_ok());
    assert!(validate_permission_against_max("auto_edit", "auto_edit").is_ok());
}

#[test]
fn validate_permission_against_max_rejects_higher() {
    let err = validate_permission_against_max("full_access", "auto_edit").unwrap_err();
    assert!(err.contains("exceeds project maximum"));
}
```

- [ ] **Step 3: Run the failing/passing validation tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml config::tests::validate_permission_against_max
```

Expected: the two new validation tests pass.

- [ ] **Step 4: Enforce policy in `run_task`**

In `src-tauri/src/pty.rs`, at the start of `run_task()` after PTY size arguments are available but before `native_pty_system().openpty(...)`, add:

```rust
crate::config::validate_permission_mode(&project_path, &permission_mode)?;
```

The first lines of `run_task()` should validate before any PTY or child process is created.

- [ ] **Step 5: Enforce policy in `resume_task`**

In `src-tauri/src/pty.rs`, at the start of `resume_task()` before `native_pty_system().openpty(...)`, add:

```rust
crate::config::validate_permission_mode(&project_path, &permission_mode)?;
```

- [ ] **Step 6: Run Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml config::tests
```

Expected: all config tests pass.

- [ ] **Step 7: Build-check Rust backend**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: cargo check passes.

- [ ] **Step 8: Commit Task 2**

Run:

```bash
git add src-tauri/src/config.rs src-tauri/src/pty.rs
git commit -m "feat: enforce project permission policy"
```

---

## Task 3: Project Settings UI For Permissions And Prompt Templates

**Files:**

- Modify: `src/components/SettingsDialog.tsx`
- Modify: `src/styles/dialogs.ts` if repeated styles are extracted

- [ ] **Step 1: Import shared types and helpers**

In `src/components/SettingsDialog.tsx`, remove the local `ProjectConfig` interface and import:

```ts
import {
  isPermissionAllowed,
  permissionModeLabel,
  type AgentType,
  type PermissionMode,
  type ProjectConfig,
  type PromptTemplate,
} from "../types";
```

- [ ] **Step 2: Add local state for permissions and templates**

Inside `ProjectSettings`, add:

```ts
const [maxPermissionMode, setMaxPermissionMode] = useState<PermissionMode>("auto_edit");
const [confirmFullAccess, setConfirmFullAccess] = useState(true);
const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
const [templateName, setTemplateName] = useState("");
const [templateContent, setTemplateContent] = useState("");
```

When `read_project_config` resolves, also set:

```ts
setMaxPermissionMode(c.permissions?.max_mode ?? "auto_edit");
setConfirmFullAccess(c.permissions?.confirm_full_access ?? true);
setPromptTemplates(c.prompt_templates?.templates ?? []);
```

- [ ] **Step 3: Add template editing helpers**

Inside `ProjectSettings`, add:

```ts
function resetTemplateEditor() {
  setEditingTemplateId(null);
  setTemplateName("");
  setTemplateContent("");
}

function startEditTemplate(template: PromptTemplate) {
  setEditingTemplateId(template.id);
  setTemplateName(template.name);
  setTemplateContent(template.content);
}

function saveTemplateDraft() {
  const name = templateName.trim();
  const content = templateContent.trim();
  if (!name || !content) {
    setError("Template name and content are required.");
    return;
  }

  setPromptTemplates((prev) => {
    if (editingTemplateId) {
      return prev.map((template) =>
        template.id === editingTemplateId ? { ...template, name, content } : template,
      );
    }
    return [
      ...prev,
      {
        id: `tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        content,
      },
    ];
  });
  resetTemplateEditor();
}

function deleteTemplate(id: string) {
  setPromptTemplates((prev) => prev.filter((template) => template.id !== id));
  if (editingTemplateId === id) resetTemplateEditor();
}
```

- [ ] **Step 4: Validate permission settings on save**

At the start of `handleSave()` after `setError(null)`, add:

```ts
if (!isPermissionAllowed(defaultPermissionMode, maxPermissionMode)) {
  setSaving(false);
  setError("Default permission cannot exceed the project maximum permission.");
  return;
}
```

Update the saved config object to include:

```ts
permissions: {
  default_mode: defaultPermissionMode,
  max_mode: maxPermissionMode,
  confirm_full_access: confirmFullAccess,
},
prompt_templates: {
  templates: promptTemplates,
},
```

Keep `agent.default_permission_mode` set to `defaultPermissionMode` for backward compatibility.

- [ ] **Step 5: Add permissions UI**

In the Agent section after "Default Permission Mode", add:

```tsx
<div style={s.modalField}>
  <label style={s.modalLabel}>
    Maximum Permission Mode
    <span style={s.modalLabelHint}>Tasks cannot start above this mode in this project</span>
  </label>
  <Select
    value={maxPermissionMode}
    onChange={(v) => setMaxPermissionMode(v as PermissionMode)}
    options={PERMISSION_MODES.map((mode) => ({
      value: mode,
      label: permissionModeLabel(mode, agentDefault as AgentType),
    }))}
  />
</div>
<label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
  <input
    type="checkbox"
    checked={confirmFullAccess}
    onChange={(e) => setConfirmFullAccess(e.currentTarget.checked)}
  />
  Confirm before launching Full Access tasks
</label>
```

- [ ] **Step 6: Add prompt templates UI**

Before the Git section, add a `Prompt Templates` section with list, edit fields, and variable hints:

```tsx
<div style={s.modalSection}>
  <div style={s.modalSectionTitle}>Prompt Templates</div>
  {promptTemplates.length === 0 && (
    <div style={{ color: "var(--text-hint)", fontSize: 12.5 }}>No templates yet.</div>
  )}
  {promptTemplates.map((template) => (
    <div key={template.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 650 }}>{template.name}</div>
        <div style={{ fontSize: 12, color: "var(--text-hint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {template.content}
        </div>
      </div>
      <button style={s.modalCancelBtn} onClick={() => startEditTemplate(template)}>Edit</button>
      <button style={s.modalCancelBtn} onClick={() => deleteTemplate(template.id)}>Delete</button>
    </div>
  ))}
  <div style={s.modalField}>
    <label style={s.modalLabel}>{editingTemplateId ? "Edit Template" : "New Template"}</label>
    <input
      style={s.modalInput}
      value={templateName}
      onChange={(e) => setTemplateName(e.target.value)}
      placeholder="Template name"
    />
  </div>
  <div style={s.modalField}>
    <textarea
      style={s.modalTextarea}
      value={templateContent}
      onChange={(e) => setTemplateContent(e.target.value)}
      rows={5}
      spellCheck={false}
      placeholder="Template content"
    />
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
      {["{projectName}", "{projectPath}", "{branch}", "{date}", "{agent}"].map((variable) => (
        <button
          key={variable}
          style={s.modalCancelBtn}
          onClick={() => setTemplateContent((prev) => `${prev}${variable}`)}
        >
          {variable}
        </button>
      ))}
    </div>
  </div>
  <div style={{ display: "flex", gap: 8 }}>
    <button style={s.modalSaveBtn} onClick={saveTemplateDraft}>
      {editingTemplateId ? "Update Template" : "Add Template"}
    </button>
    {editingTemplateId && (
      <button style={s.modalCancelBtn} onClick={resetTemplateEditor}>Cancel Edit</button>
    )}
  </div>
</div>
```

- [ ] **Step 7: Run frontend checks**

Run:

```bash
pnpm lint
pnpm test src/test/promptTemplates.test.ts
```

Expected: lint passes; prompt template tests pass.

- [ ] **Step 8: Manual check project settings**

Run:

```bash
pnpm tauri dev
```

Expected: the desktop app opens. Open project settings and verify:

- Default permission cannot exceed max permission.
- Templates can be added, edited, deleted, and saved.
- Old Git commit prompt remains visible.

- [ ] **Step 9: Commit Task 3**

Run:

```bash
git add src/components/SettingsDialog.tsx src/styles/dialogs.ts
git commit -m "feat: add project execution settings"
```

If `src/styles/dialogs.ts` was not changed, omit it from `git add`.

---

## Task 4: New Task Defaults, Permission Limits, And Template Insertion

**Files:**

- Modify: `src/components/NewTaskView.tsx`
- Modify: `src/components/new-task/AgentPermSelector.tsx`
- Modify: `src/components/new-task/PromptEditor.tsx` only if insertion API is needed
- Modify: `src/types.ts` only if UI needs extra helper exports

- [ ] **Step 1: Add selector props for permission limits and templates**

In `src/components/new-task/AgentPermSelector.tsx`, import `PromptTemplate` and `isPermissionAllowed`:

```ts
import type { AgentType, PermissionMode, PromptTemplate } from "../../types";
import { isPermissionAllowed, permissionModeLabel } from "../../types";
```

Extend props:

```ts
maxPermissionMode: PermissionMode;
promptTemplates: PromptTemplate[];
onSelectTemplate: (template: PromptTemplate) => void;
```

- [ ] **Step 2: Disable permission items above max**

In the permission `Select.Item` map, compute:

```ts
const disabled = !isPermissionAllowed(perm, maxPermissionMode);
```

Set:

```tsx
disabled={disabled}
style={{
  ...s.toolbarMenuItem,
  opacity: disabled ? 0.4 : 1,
  cursor: disabled ? "not-allowed" : "pointer",
}}
```

Keep the existing hover handlers, but only apply hover when not disabled.

- [ ] **Step 3: Add template menu entry**

In the toolbar popover content, after Plan mode, add a separator and render templates:

```tsx
{promptTemplates.length > 0 && (
  <>
    <div style={s.toolbarMenuSeparator} />
    {promptTemplates.map((template) => (
      <Popover.Close asChild key={template.id}>
        <button
          style={{ ...s.toolbarMenuItem, width: "100%", border: "none", background: "none" }}
          onClick={() => onSelectTemplate(template)}
        >
          <BookmarkPlus size={15} strokeWidth={2} color="var(--text-muted)" />
          {template.name}
        </button>
      </Popover.Close>
    ))}
  </>
)}
```

- [ ] **Step 4: Load full project config in NewTaskView**

In `src/components/NewTaskView.tsx`, import:

```ts
import { confirm } from "@tauri-apps/plugin-dialog";
import type { Project, AgentType, PermissionMode, ProjectConfig, PromptTemplate } from "../types";
import { isAgentType, isPermissionAllowed, isPermissionMode } from "../types";
import { resolvePromptTemplate } from "../utils/promptTemplates";
```

Add state:

```ts
const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);
const [maxPermissionMode, setMaxPermissionMode] = useState<PermissionMode>("auto_edit");
const [confirmFullAccess, setConfirmFullAccess] = useState(true);
const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
```

Replace the current config loading effect with one that reads `ProjectConfig`, sets default agent, default permission from `permissions.default_mode` first and `agent.default_permission_mode` as fallback, max permission, confirm flag, and templates.

- [ ] **Step 5: Add template insertion helper**

If `usePromptEditor()` already exposes a text insertion method, use it. If it does not, add a minimal method in `PromptEditor.tsx`:

```ts
insertText(text: string): void;
```

The implementation should insert into the contenteditable selection when focus is inside the editor; otherwise append text to the editor root. After insertion, call the existing empty-state/update path so `isEmpty` becomes false.

In `NewTaskView`, add:

```ts
function handleSelectTemplate(template: PromptTemplate) {
  const resolved = resolvePromptTemplate(template, {
    project,
    branch: project.branch,
    agent,
  });
  editorHandle.insertText(resolved);
  setIsEmpty(false);
}
```

- [ ] **Step 6: Guard submit with policy and full access confirmation**

Change `handleSubmit` to `async function handleSubmit(immediate: boolean)` and before `onSubmit`:

```ts
if (!isPermissionAllowed(permMode, maxPermissionMode)) {
  showToast("Permission mode exceeds the project maximum.", "warning");
  return;
}

if (immediate && permMode === "full_access" && confirmFullAccess) {
  const ok = await confirm(
    "Full Access allows the agent to run without normal approval prompts. Continue?",
    { title: "Confirm Full Access", kind: "warning" },
  );
  if (!ok) return;
}
```

- [ ] **Step 7: Pass new props to AgentPermSelector**

Update the JSX:

```tsx
<AgentPermSelector
  ...
  maxPermissionMode={maxPermissionMode}
  promptTemplates={promptTemplates}
  onSelectTemplate={handleSelectTemplate}
/>
```

- [ ] **Step 8: Run checks**

Run:

```bash
pnpm lint
pnpm test src/test/promptTemplates.test.ts
```

Expected: lint and tests pass.

- [ ] **Step 9: Manual check new task flow**

Run:

```bash
pnpm dev
```

Expected:

- New task defaults to project config agent and permission.
- Permission choices above max are disabled.
- Template insertion works.
- Full Access confirmation appears when enabled.

- [ ] **Step 10: Commit Task 4**

Run:

```bash
git add src/components/NewTaskView.tsx src/components/new-task/AgentPermSelector.tsx src/components/new-task/PromptEditor.tsx src/types.ts
git commit -m "feat: apply project policy in new task flow"
```

Omit files that were not changed.

---

## Task 5: Session Replay Search, Role Filter, And Metrics Presentation

**Files:**

- Modify: `src/components/SessionView.tsx`
- Modify: `src/components/RunningView.tsx` if metrics layout needs coordination
- Modify: `src/styles/terminal.ts` or `src/styles/common.ts` if repeated controls are extracted

- [ ] **Step 1: Add role filter types and message text helpers**

In `src/components/SessionView.tsx`, add:

```ts
type SessionRoleFilter = "all" | "user" | "assistant" | "tool";

function contentText(content: SessionContent): string {
  return [content.text, content.name, content.input, content.thinking].filter(Boolean).join("\n");
}

function messageMatchesSearch(message: SessionMessage, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return message.content.some((part) => contentText(part).toLowerCase().includes(needle));
}

function messageMatchesRole(message: SessionMessage, filter: SessionRoleFilter): boolean {
  if (filter === "all") return true;
  if (filter === "tool") return message.content.some((part) => part.type === "tool_use");
  return message.role === filter;
}
```

- [ ] **Step 2: Add search and filter state**

Inside `SessionView`, add:

```ts
const [search, setSearch] = useState("");
const [roleFilter, setRoleFilter] = useState<SessionRoleFilter>("all");
```

Compute:

```ts
const filteredMessages = messages.filter(
  (message) => messageMatchesRole(message, roleFilter) && messageMatchesSearch(message, search),
);
const toolCallCount = messages.reduce(
  (sum, message) => sum + message.content.filter((part) => part.type === "tool_use").length,
  0,
);
```

- [ ] **Step 3: Render controls above messages**

At the top of the scroll container, before loading/error content, render:

```tsx
<div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
  <input
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    placeholder="Search session"
    style={{
      flex: 1,
      minWidth: 0,
      height: 30,
      padding: "0 10px",
      borderRadius: 6,
      border: "1px solid var(--border-medium)",
      background: "var(--bg-input)",
      color: "var(--text-primary)",
      fontSize: 12.5,
    }}
  />
  {(["all", "user", "assistant", "tool"] as SessionRoleFilter[]).map((filter) => (
    <button
      key={filter}
      onClick={() => setRoleFilter(filter)}
      style={{
        padding: "6px 9px",
        borderRadius: 6,
        border: "1px solid var(--border-medium)",
        background: roleFilter === filter ? "var(--accent-subtle)" : "var(--bg-input)",
        color: "var(--text-secondary)",
        fontSize: 12,
      }}
    >
      {filter}
    </button>
  ))}
</div>
<div style={{ color: "var(--text-hint)", fontSize: 12, marginBottom: 16 }}>
  {messages.length} messages · {toolCallCount} tool calls
</div>
```

- [ ] **Step 4: Render filtered messages**

Change:

```tsx
{messages.map((msg, i) => (
  <MessageBlock key={i} message={msg} />
))}
```

to:

```tsx
{filteredMessages.map((msg, i) => (
  <MessageBlock key={i} message={msg} />
))}
{!loading && !error && messages.length > 0 && filteredMessages.length === 0 && (
  <div style={{ color: "var(--text-hint)", fontSize: 13, padding: "12px 0" }}>
    No messages match the current filters.
  </div>
)}
```

- [ ] **Step 5: Run checks**

Run:

```bash
pnpm lint
pnpm test
```

Expected: lint and tests pass.

- [ ] **Step 6: Manual check session view**

Run:

```bash
pnpm dev
```

Expected:

- Search filters text and tool input.
- Role filter works.
- Empty-filter state appears.
- Existing session rendering still works.

- [ ] **Step 7: Commit Task 5**

Run:

```bash
git add src/components/SessionView.tsx src/components/RunningView.tsx src/styles/terminal.ts src/styles/common.ts
git commit -m "feat: add session replay filters"
```

Omit files that were not changed.

---

## Task 6: Application Settings For Notifications And Backup

**Files:**

- Modify: `src-tauri/src/app_settings.rs`
- Modify: `src/types.ts`
- Modify: `src/components/AppSettingsDialog.tsx`

- [ ] **Step 1: Add frontend app settings types**

In `src/types.ts`, add:

```ts
export interface NotificationSettings {
  task_status: boolean;
  permission_risk: boolean;
}

export interface BackupSettings {
  enabled: boolean;
  destination: string;
  retain: number;
}

export interface AppSettings {
  claude_path: string;
  codex_path: string;
  notifications: NotificationSettings;
  backup: BackupSettings;
}
```

- [ ] **Step 2: Add Rust app settings structs**

In `src-tauri/src/app_settings.rs`, add:

```rust
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct NotificationSettings {
    #[serde(default = "default_true")]
    pub task_status: bool,
    #[serde(default = "default_true")]
    pub permission_risk: bool,
}

fn default_true() -> bool {
    true
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            task_status: true,
            permission_risk: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct BackupSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_backup_destination")]
    pub destination: String,
    #[serde(default = "default_backup_retain")]
    pub retain: usize,
}

fn default_backup_destination() -> String {
    "~/.nezha/backups".to_string()
}

fn default_backup_retain() -> usize {
    10
}

impl Default for BackupSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            destination: default_backup_destination(),
            retain: default_backup_retain(),
        }
    }
}
```

Update `AppSettings`:

```rust
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct AppSettings {
    #[serde(default)]
    pub claude_path: String,
    #[serde(default)]
    pub codex_path: String,
    #[serde(default)]
    pub notifications: NotificationSettings,
    #[serde(default)]
    pub backup: BackupSettings,
}
```

- [ ] **Step 3: Preserve new settings in normalization**

Update `normalize_settings()`:

```rust
fn normalize_settings(settings: AppSettings) -> AppSettings {
    AppSettings {
        claude_path: resolve_agent_launch_spec_from_path("claude", &settings.claude_path).program,
        codex_path: resolve_agent_launch_spec_from_path("codex", &settings.codex_path).program,
        notifications: settings.notifications,
        backup: settings.backup,
    }
}
```

Update default creation in `load_settings_internal()` to include `..AppSettings::default()`:

```rust
let settings = normalize_settings(AppSettings {
    claude_path: detect_path("claude"),
    codex_path: detect_path("codex"),
    ..AppSettings::default()
});
```

- [ ] **Step 4: Add Rust settings test**

Append to `src-tauri/src/app_settings.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_settings_without_new_sections_deserializes() {
        let raw = r#"{
          "claude_path": "/usr/local/bin/claude",
          "codex_path": "/usr/local/bin/codex"
        }"#;

        let settings: AppSettings = serde_json::from_str(raw).expect("old settings should parse");
        assert_eq!(settings.claude_path, "/usr/local/bin/claude");
        assert_eq!(settings.codex_path, "/usr/local/bin/codex");
        assert!(settings.notifications.task_status);
        assert!(settings.notifications.permission_risk);
        assert!(!settings.backup.enabled);
        assert_eq!(settings.backup.destination, "~/.nezha/backups");
        assert_eq!(settings.backup.retain, 10);
    }
}
```

- [ ] **Step 5: Update AppSettingsDialog UI**

In `src/components/AppSettingsDialog.tsx`, import `AppSettings` from `../types` and update local settings shape to use it. Add controls:

```tsx
<div style={s.modalSection}>
  <div style={s.modalSectionTitle}>Notifications</div>
  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
    <input
      type="checkbox"
      checked={settings.notifications.task_status}
      onChange={(e) =>
        setSettings((prev) => ({
          ...prev,
          notifications: { ...prev.notifications, task_status: e.currentTarget.checked },
        }))
      }
    />
    Task status notifications
  </label>
  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
    <input
      type="checkbox"
      checked={settings.notifications.permission_risk}
      onChange={(e) =>
        setSettings((prev) => ({
          ...prev,
          notifications: { ...prev.notifications, permission_risk: e.currentTarget.checked },
        }))
      }
    />
    Permission risk notifications
  </label>
</div>

<div style={s.modalSection}>
  <div style={s.modalSectionTitle}>Backups</div>
  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
    <input
      type="checkbox"
      checked={settings.backup.enabled}
      onChange={(e) =>
        setSettings((prev) => ({
          ...prev,
          backup: { ...prev.backup, enabled: e.currentTarget.checked },
        }))
      }
    />
    Automatic metadata backup
  </label>
  <input
    style={s.modalInput}
    value={settings.backup.destination}
    onChange={(e) =>
      setSettings((prev) => ({
        ...prev,
        backup: { ...prev.backup, destination: e.target.value },
      }))
    }
  />
  <input
    style={s.modalInput}
    type="number"
    min={1}
    max={100}
    value={settings.backup.retain}
    onChange={(e) =>
      setSettings((prev) => ({
        ...prev,
        backup: { ...prev.backup, retain: Number(e.target.value) || 1 },
      }))
    }
  />
</div>
```

Adapt this JSX to the existing dialog structure rather than duplicating sections if similar sections already exist.

- [ ] **Step 6: Run checks**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml app_settings::tests
pnpm lint
```

Expected: Rust settings test and lint pass.

- [ ] **Step 7: Commit Task 6**

Run:

```bash
git add src-tauri/src/app_settings.rs src/types.ts src/components/AppSettingsDialog.tsx
git commit -m "feat: add notification and backup settings"
```

---

## Task 7: Backup Backend And Settings Action

**Files:**

- Create: `src-tauri/src/backup.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/components/AppSettingsDialog.tsx`
- Modify: `src/types.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add backup result types to frontend**

In `src/types.ts`, add:

```ts
export interface BackupWarning {
  source: string;
  message: string;
}

export interface BackupResult {
  status: "success" | "partial" | "failed";
  destination: string;
  manifestPath: string;
  warnings: BackupWarning[];
  copiedCount: number;
  createdAt: string;
}

export interface BackupStatus {
  lastResult?: BackupResult | null;
}
```

- [ ] **Step 2: Create Rust backup module skeleton**

Create `src-tauri/src/backup.rs`:

```rust
use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::app_settings::load_settings_internal;
use crate::storage::Project;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupWarning {
    pub source: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupResult {
    pub status: String,
    pub destination: String,
    #[serde(rename = "manifestPath")]
    pub manifest_path: String,
    pub warnings: Vec<BackupWarning>,
    #[serde(rename = "copiedCount")]
    pub copied_count: usize,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BackupStatus {
    #[serde(rename = "lastResult")]
    pub last_result: Option<BackupResult>,
}

fn home_dir() -> Result<PathBuf, String> {
    crate::platform::home_dir().ok_or_else(|| "Cannot find home directory".to_string())
}

fn expand_home(path: &str) -> Result<PathBuf, String> {
    if path == "~" {
        return home_dir();
    }
    if let Some(rest) = path.strip_prefix("~/") {
        return Ok(home_dir()?.join(rest));
    }
    Ok(PathBuf::from(path))
}

fn status_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".nezha").join("backup-status.json"))
}

fn copy_dir_recursive(source: &Path, destination: &Path) -> Result<usize, String> {
    if !source.exists() {
        return Err("source does not exist".to_string());
    }
    fs::create_dir_all(destination).map_err(|e| e.to_string())?;
    let mut copied = 0usize;
    for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if source_path.is_dir() {
            copied += copy_dir_recursive(&source_path, &destination_path)?;
        } else if source_path.is_file() {
            if let Some(parent) = destination_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(&source_path, &destination_path).map_err(|e| e.to_string())?;
            copied += 1;
        }
    }
    Ok(copied)
}

fn record_source(
    source: PathBuf,
    destination: PathBuf,
    warnings: &mut Vec<BackupWarning>,
) -> usize {
    match copy_dir_recursive(&source, &destination) {
        Ok(count) => count,
        Err(message) => {
            warnings.push(BackupWarning {
                source: source.to_string_lossy().into_owned(),
                message,
            });
            0
        }
    }
}

fn write_status(result: &BackupResult) -> Result<(), String> {
    let path = status_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(&BackupStatus {
        last_result: Some(result.clone()),
    })
    .map_err(|e| e.to_string())?;
    crate::storage::atomic_write(&path, &raw)
}

fn cleanup_retention(root: &Path, retain: usize) -> Result<(), String> {
    if retain == 0 || !root.exists() {
        return Ok(());
    }
    let mut dirs = fs::read_dir(root)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| path.is_dir())
        .collect::<Vec<_>>();
    dirs.sort();
    let remove_count = dirs.len().saturating_sub(retain);
    for dir in dirs.into_iter().take(remove_count) {
        let _ = fs::remove_dir_all(dir);
    }
    Ok(())
}

fn run_backup_sync(projects: Vec<Project>) -> Result<BackupResult, String> {
    let settings = load_settings_internal();
    let root = expand_home(&settings.backup.destination)?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;

    let created_at = Utc::now().to_rfc3339();
    let stamp = created_at.replace(':', "-");
    let destination = root.join(stamp);
    fs::create_dir_all(&destination).map_err(|e| e.to_string())?;

    let home = home_dir()?;
    let mut warnings = Vec::new();
    let mut copied_count = 0usize;

    copied_count += record_source(home.join(".nezha"), destination.join("home/.nezha"), &mut warnings);
    copied_count += record_source(home.join(".codex"), destination.join("home/.codex"), &mut warnings);
    copied_count += record_source(home.join(".claude"), destination.join("home/.claude"), &mut warnings);

    for project in &projects {
        let project_path = PathBuf::from(&project.path);
        copied_count += record_source(
            project_path.join(".nezha"),
            destination.join("projects").join(&project.id).join(".nezha"),
            &mut warnings,
        );
        copied_count += record_source(
            project_path.join(".codex").join("sessions"),
            destination.join("projects").join(&project.id).join(".codex/sessions"),
            &mut warnings,
        );
    }

    let manifest_path = destination.join("manifest.json");
    let status = if copied_count == 0 {
        "failed"
    } else if warnings.is_empty() {
        "success"
    } else {
        "partial"
    };
    let result = BackupResult {
        status: status.to_string(),
        destination: destination.to_string_lossy().into_owned(),
        manifest_path: manifest_path.to_string_lossy().into_owned(),
        warnings,
        copied_count,
        created_at,
    };
    let manifest = serde_json::to_string_pretty(&serde_json::json!({
        "result": result,
        "projects": projects,
    }))
    .map_err(|e| e.to_string())?;
    crate::storage::atomic_write(&manifest_path, &manifest)?;
    write_status(&result)?;
    cleanup_retention(&root, settings.backup.retain)?;
    Ok(result)
}

#[tauri::command]
pub async fn run_backup_now(projects: Vec<Project>) -> Result<BackupResult, String> {
    tokio::task::spawn_blocking(move || run_backup_sync(projects))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_backup_status() -> Result<BackupStatus, String> {
    let path = status_path()?;
    if !path.exists() {
        return Ok(BackupStatus::default());
    }
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}
```

- [ ] **Step 3: Register backup module and commands**

In `src-tauri/src/lib.rs`, add:

```rust
mod backup;
```

Register:

```rust
backup::run_backup_now,
backup::get_backup_status,
```

- [ ] **Step 4: Add backup controls to AppSettingsDialog**

In `src/components/AppSettingsDialog.tsx`, import:

```ts
import type { BackupResult, BackupStatus, Project } from "../types";
```

If the dialog does not receive `projects`, add a prop:

```ts
projects: Project[];
```

Add state:

```ts
const [backupStatus, setBackupStatus] = useState<BackupStatus>({});
const [backupRunning, setBackupRunning] = useState(false);
```

Load status:

```ts
useEffect(() => {
  invoke<BackupStatus>("get_backup_status")
    .then(setBackupStatus)
    .catch(() => {});
}, []);
```

Add handler:

```ts
async function handleRunBackupNow() {
  setBackupRunning(true);
  try {
    const result = await invoke<BackupResult>("run_backup_now", { projects });
    setBackupStatus({ lastResult: result });
  } finally {
    setBackupRunning(false);
  }
}
```

Render a button and latest status in the backup section:

```tsx
<button style={s.modalSaveBtn} onClick={handleRunBackupNow} disabled={backupRunning}>
  {backupRunning ? "Backing up..." : "Back Up Now"}
</button>
{backupStatus.lastResult && (
  <div style={{ marginTop: 8, color: "var(--text-hint)", fontSize: 12 }}>
    Last backup: {backupStatus.lastResult.status} · {backupStatus.lastResult.manifestPath}
  </div>
)}
```

- [ ] **Step 5: Pass projects into AppSettingsDialog**

Thread `projects` through the existing footer settings path:

1. In `src/components/SidebarFooterActions.tsx`, import `Project` and add `projects: Project[]` to props.
2. Pass `projects={projects}` into `<AppSettingsDialog />`.
3. In `src/components/TaskPanel.tsx`, add `projects: Project[]` to props and pass it into `<SidebarFooterActions />`.
4. In `src/components/ProjectPage.tsx`, pass `allProjects` into `<TaskPanel projects={allProjects} />`.
5. In `src/components/WelcomePage.tsx`, pass its existing `projects` prop into `<SidebarFooterActions projects={projects} />`.

Use the existing `allProjects` value already supplied by `App.tsx`; do not introduce a new global project store.

- [ ] **Step 6: Add startup backup trigger**

In `src/App.tsx`, after projects load and app settings are available, add a guarded effect:

```ts
useEffect(() => {
  if (projects.length === 0) return;
  invoke<AppSettings>("load_app_settings")
    .then((settings) => {
      if (!settings.backup.enabled) return;
      return invoke<BackupStatus>("get_backup_status").then((status) => {
        const last = status.lastResult?.createdAt ? Date.parse(status.lastResult.createdAt) : 0;
        const due = !last || Date.now() - last > 24 * 60 * 60 * 1000;
        if (due) {
          return invoke("run_backup_now", { projects });
        }
      });
    })
    .catch(console.error);
}, [projects]);
```

Make sure this effect does not loop due to task state changes.

- [ ] **Step 7: Run checks**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
pnpm lint
```

Expected: cargo check and lint pass.

- [ ] **Step 8: Manual backup check**

Run the app and click "Back Up Now".

Expected:

- A timestamped backup directory appears under the configured destination.
- `manifest.json` exists.
- Missing `~/.claude` or project `.codex/sessions` records a warning instead of failing everything.

- [ ] **Step 9: Commit Task 7**

Run:

```bash
git add src-tauri/src/backup.rs src-tauri/src/lib.rs src/components/AppSettingsDialog.tsx src/App.tsx src/types.ts
git commit -m "feat: add local metadata backups"
```

---

## Task 8: Task Status And Permission Risk Notifications

**Files:**

- Modify: `src-tauri/src/notification.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/App.tsx`
- Modify: `src/components/NewTaskView.tsx`

- [ ] **Step 1: Decide native notification mechanism from available dependencies**

Check whether Tauri notification plugin is installed. Run:

```bash
rg -n "notification|tauri-plugin-notification" package.json src-tauri/Cargo.toml src-tauri/capabilities
```

Expected now: remote in-app notification code exists, native OS notification plugin may not be installed.

If no native plugin is installed, implement a safe command that returns an unavailable result instead of adding a dependency in this task. This keeps task execution unblocked and leaves adding `tauri-plugin-notification` as a separate dependency decision.

- [ ] **Step 2: Add notification command types**

In `src-tauri/src/notification.rs`, add:

```rust
#[derive(Debug, Clone, Serialize)]
pub struct LocalNotificationResult {
    pub delivered: bool,
    pub reason: Option<String>,
}

#[tauri::command]
pub fn notify_task_status(title: String, body: String) -> Result<LocalNotificationResult, String> {
    let _ = (title, body);
    Ok(LocalNotificationResult {
        delivered: false,
        reason: Some("Native notifications are not configured in this build".to_string()),
    })
}

#[tauri::command]
pub fn notify_permission_risk(title: String, body: String) -> Result<LocalNotificationResult, String> {
    let _ = (title, body);
    Ok(LocalNotificationResult {
        delivered: false,
        reason: Some("Native notifications are not configured in this build".to_string()),
    })
}
```

If `tauri-plugin-notification` is already present, replace the no-op body with actual notification sending through the plugin API and keep the same return type.

- [ ] **Step 3: Register notification commands**

In `src-tauri/src/lib.rs`, register:

```rust
notification::notify_task_status,
notification::notify_permission_risk,
```

- [ ] **Step 4: Trigger task status notifications from App**

In `src/App.tsx`, keep a ref for settings:

```ts
const appSettingsRef = useRef<AppSettings | null>(null);
```

Load it during init or a separate effect:

```ts
useEffect(() => {
  invoke<AppSettings>("load_app_settings")
    .then((settings) => {
      appSettingsRef.current = settings;
    })
    .catch(console.error);
}, []);
```

In the `task-status` listener, after `updateTaskStatus`, add:

```ts
const settings = appSettingsRef.current;
if (settings?.notifications.task_status && ["done", "failed", "cancelled", "input_required"].includes(status)) {
  const task = tasks.find((item) => item.id === task_id);
  const title = task?.name || "Nezha Task";
  invoke("notify_task_status", {
    title,
    body: `Task status: ${status}`,
  }).catch(() => {});
}
```

Because the event listener currently captures initial `tasks`, use a `tasksRef` updated in an effect rather than reading stale `tasks` directly:

```ts
const tasksRef = useRef<Task[]>([]);
useEffect(() => {
  tasksRef.current = tasks;
}, [tasks]);
```

Then use `tasksRef.current.find(...)`.

- [ ] **Step 5: Trigger permission risk notification before full access confirmation**

In `src/components/NewTaskView.tsx`, when `permMode === "full_access"` and before `confirm()`, load app settings or accept notification settings via prop. Prefer loading settings locally only when needed:

```ts
invoke<AppSettings>("load_app_settings")
  .then((settings) => {
    if (!settings.notifications.permission_risk) return;
    return invoke("notify_permission_risk", {
      title: "Full Access task",
      body: `${agent} is about to start with Full Access in ${project.name}.`,
    });
  })
  .catch(() => {});
```

Do not block the confirmation dialog on notification delivery.

- [ ] **Step 6: Run checks**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
pnpm lint
```

Expected: cargo check and lint pass.

- [ ] **Step 7: Manual notification check**

Run app and verify:

- Task status path calls notification command without breaking task updates.
- Full Access confirmation still appears.
- If native notifications are unavailable, no user-facing task failure occurs.

- [ ] **Step 8: Commit Task 8**

Run:

```bash
git add src-tauri/src/notification.rs src-tauri/src/lib.rs src/App.tsx src/components/NewTaskView.tsx
git commit -m "feat: add task and permission notifications"
```

---

## Final Verification

- [ ] **Step 1: Run full frontend checks**

Run:

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: all pass.

- [ ] **Step 2: Run Rust checks**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: all pass.

- [ ] **Step 3: Manual regression pass**

Run:

```bash
pnpm tauri dev
```

Verify:

- Old project opens and defaults load.
- Project settings save permissions and templates.
- New task uses configured default agent and permission.
- Permission above max cannot launch from UI.
- Backend rejects above-max launch if invoked.
- `full_access` shows confirmation when enabled.
- Prompt template variables resolve.
- Session search and role filtering work.
- App settings save notification and backup settings.
- Manual backup creates manifest.
- Automatic backup does not run when disabled.
- Existing Git, file explorer, shell terminal, and task resume flows still open.

- [ ] **Step 4: Review changed files**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intended files changed.

- [ ] **Step 5: Final commit or cleanup**

If final verification required small fixes, commit them:

```bash
git add <changed-files>
git commit -m "fix: stabilize desktop enhancements"
```

If no fixes were needed, do not create an empty commit.
