import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, FolderOpen, ChevronDown, Check, RefreshCw } from "lucide-react";
import {
  isAgentType,
  isPermissionAllowed,
  isPermissionMode,
  permissionModeLabel,
  type AgentType,
  type PermissionMode,
  type ProjectConfig,
  type PromptTemplate,
} from "../types";
import s from "../styles";

const PERMISSION_MODES: PermissionMode[] = ["ask", "auto_edit", "full_access"];
const TEMPLATE_VARIABLES = ["{projectName}", "{projectPath}", "{branch}", "{date}", "{agent}"];

interface AgentVersions {
  claude_version: string;
  codex_version: string;
}

type NavKey = "project";

const NAV_ITEMS: Array<{ key: NavKey; label: string }> = [
  { key: "project", label: "Project Settings" },
];

// Custom select dropdown component
function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", width: "100%" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 10px",
          background: "var(--bg-input)",
          border: "1px solid var(--border-medium)",
          borderRadius: 8,
          color: "var(--text-primary)",
          fontSize: 13,
          fontFamily: "var(--font-ui)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span>{current?.label ?? value}</span>
        <ChevronDown
          size={13}
          style={{
            flexShrink: 0,
            color: "var(--text-hint)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        />
      </button>
      {open && (
        <div
          style={{ ...s.dropdownPanel, top: "calc(100% + 4px)", minWidth: "100%", zIndex: 2000 }}
        >
          {options.map((opt) => (
            <div
              key={opt.value}
              style={{
                ...s.dropdownOption,
                background: opt.value === value ? "var(--accent-subtle)" : "transparent",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <span style={{ flex: 1 }}>{opt.label}</span>
              {opt.value === value && (
                <Check size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectSettings({ projectPath, onClose }: { projectPath: string; onClose: () => void }) {
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [agentDefault, setAgentDefault] = useState<AgentType>("claude");
  const [defaultPermissionMode, setDefaultPermissionMode] = useState<PermissionMode>("ask");
  const [maxPermissionMode, setMaxPermissionMode] = useState<PermissionMode>("auto_edit");
  const [confirmFullAccess, setConfirmFullAccess] = useState(true);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateContent, setTemplateContent] = useState("");
  const [promptPrefix, setPromptPrefix] = useState("");
  const [commitPrompt, setCommitPrompt] = useState("");
  const [claudeVersion, setClaudeVersion] = useState("");
  const [codexVersion, setCodexVersion] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<ProjectConfig>("read_project_config", { projectPath })
      .then((c) => {
        setConfig(c);
        setAgentDefault(isAgentType(c.agent.default) ? c.agent.default : "claude");

        const configuredDefaultMode = c.permissions?.default_mode ?? c.agent.default_permission_mode;
        setDefaultPermissionMode(
          configuredDefaultMode && isPermissionMode(configuredDefaultMode)
            ? configuredDefaultMode
            : "ask",
        );

        const configuredMaxMode = c.permissions?.max_mode;
        setMaxPermissionMode(
          configuredMaxMode && isPermissionMode(configuredMaxMode) ? configuredMaxMode : "auto_edit",
        );

        setConfirmFullAccess(c.permissions?.confirm_full_access ?? true);
        setPromptTemplates(c.prompt_templates?.templates ?? []);
        setPromptPrefix(c.agent.prompt_prefix ?? "");
        setCommitPrompt(c.git.commit_prompt);
        setClaudeVersion(c.agent.claude_version ?? "");
        setCodexVersion(c.agent.codex_version ?? "");

        // 若版本为空，自动检测一次
        if (!c.agent.claude_version && !c.agent.codex_version) {
          autoDetectVersions();
        }
      })
      .catch((e) => setError(String(e)));
  }, [projectPath]);

  async function autoDetectVersions() {
    setDetecting(true);
    try {
      const v = await invoke<AgentVersions>("detect_agent_versions");
      if (v.claude_version) setClaudeVersion(v.claude_version);
      if (v.codex_version) setCodexVersion(v.codex_version);
    } catch {
      // 检测失败不阻塞，版本字段保持空
    } finally {
      setDetecting(false);
    }
  }

  function resetTemplateEditor() {
    setEditingTemplateId(null);
    setTemplateName("");
    setTemplateContent("");
  }

  function startEditTemplate(template: PromptTemplate) {
    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateContent(template.content);
    setError(null);
  }

  function saveTemplateDraft() {
    const name = templateName.trim();
    const content = templateContent.trim();
    if (!name || !content) {
      setError("Template name and content are required.");
      return;
    }

    if (editingTemplateId) {
      setPromptTemplates((templates) =>
        templates.map((template) =>
          template.id === editingTemplateId ? { ...template, name, content } : template,
        ),
      );
    } else {
      setPromptTemplates((templates) => [
        ...templates,
        {
          id: `tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          content,
        },
      ]);
    }
    setError(null);
    resetTemplateEditor();
  }

  function deleteTemplate(id: string) {
    setPromptTemplates((templates) => templates.filter((template) => template.id !== id));
    if (editingTemplateId === id) {
      resetTemplateEditor();
    }
  }

  function insertTemplateVariable(variable: string) {
    setTemplateContent((content) => `${content}${variable}`);
  }

  function hasTemplateDraft() {
    return editingTemplateId !== null || templateName.trim() !== "" || templateContent.trim() !== "";
  }

  function promptTemplatesWithDraft(): PromptTemplate[] | null {
    if (!hasTemplateDraft()) {
      return promptTemplates;
    }

    const name = templateName.trim();
    const content = templateContent.trim();
    if (!name || !content) {
      setError("Complete or cancel the prompt template draft before saving project settings.");
      return null;
    }

    if (editingTemplateId) {
      return promptTemplates.map((template) =>
        template.id === editingTemplateId ? { ...template, name, content } : template,
      );
    }

    return [
      ...promptTemplates,
      {
        id: `tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        content,
      },
    ];
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    if (!isPermissionAllowed(defaultPermissionMode, maxPermissionMode)) {
      setSaving(false);
      setError("Default permission cannot exceed the project maximum permission.");
      return;
    }
    const templatesToSave = promptTemplatesWithDraft();
    if (!templatesToSave) {
      setSaving(false);
      return;
    }
    try {
      await invoke("write_project_config", {
        projectPath,
        config: {
          agent: {
            default: agentDefault,
            default_permission_mode: defaultPermissionMode,
            prompt_prefix: promptPrefix,
            claude_version: claudeVersion,
            codex_version: codexVersion,
          },
          permissions: {
            default_mode: defaultPermissionMode,
            max_mode: maxPermissionMode,
            confirm_full_access: confirmFullAccess,
          },
          prompt_templates: { templates: templatesToSave },
          git: { commit_prompt: commitPrompt },
        },
      });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div style={s.settingsBody}>
        {!config && !error && (
          <div style={{ color: "var(--text-hint)", fontSize: 13 }}>Loading...</div>
        )}
        {error && (
          <div style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 12 }}>{error}</div>
        )}
        {config && (
          <>
            <div style={s.modalSection}>
              <div style={s.modalSectionTitle}>Agent</div>
              <div style={s.modalField}>
                <label style={s.modalLabel}>
                  Default Agent
                  <span style={s.modalLabelHint}>Default agent used when creating new tasks</span>
                </label>
                <Select
                  value={agentDefault}
                  onChange={(v) => setAgentDefault(v as AgentType)}
                  options={[
                    { value: "claude", label: "Claude Code" },
                    { value: "codex", label: "Codex" },
                  ]}
                />
              </div>
              <div style={s.modalField}>
                <label style={s.modalLabel}>
                  Default Permission Mode
                  <span style={s.modalLabelHint}>
                    Default permission mode used when creating new tasks
                  </span>
                </label>
                <Select
                  value={defaultPermissionMode}
                  onChange={(v) => setDefaultPermissionMode(v as PermissionMode)}
                  options={PERMISSION_MODES.map((mode) => ({
                    value: mode,
                    label: permissionModeLabel(mode, agentDefault),
                  }))}
                />
              </div>
              <div style={s.modalField}>
                <label style={s.modalLabel}>
                  Maximum Permission Mode
                  <span style={s.modalLabelHint}>
                    Highest permission mode tasks may use in this project
                  </span>
                </label>
                <Select
                  value={maxPermissionMode}
                  onChange={(v) => setMaxPermissionMode(v as PermissionMode)}
                  options={PERMISSION_MODES.map((mode) => ({
                    value: mode,
                    label: permissionModeLabel(mode, agentDefault),
                  }))}
                />
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--text-secondary)",
                  fontSize: 12.5,
                  marginBottom: 14,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={confirmFullAccess}
                  onChange={(e) => setConfirmFullAccess(e.target.checked)}
                />
                Confirm before launching Full Access tasks
              </label>
              <div style={s.modalField}>
                <label style={s.modalLabel}>
                  Prompt Prefix
                  <span style={s.modalLabelHint}>Automatically prepended to every task prompt</span>
                </label>
                <textarea
                  style={s.modalTextarea}
                  value={promptPrefix}
                  onChange={(e) => setPromptPrefix(e.target.value)}
                  rows={3}
                  spellCheck={false}
                  placeholder="e.g. Reply in Chinese."
                />
              </div>
              <div style={s.modalField}>
                <label style={s.modalLabel}>
                  Agent Versions
                  <span style={s.modalLabelHint}>
                    Auto-detected tool versions (used for feature detection)
                  </span>
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "var(--text-hint)", marginBottom: 4 }}>
                      Claude Code
                    </div>
                    <input
                      style={s.modalInput}
                      value={claudeVersion}
                      onChange={(e) => setClaudeVersion(e.target.value)}
                      placeholder="Not detected"
                      spellCheck={false}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "var(--text-hint)", marginBottom: 4 }}>
                      Codex
                    </div>
                    <input
                      style={s.modalInput}
                      value={codexVersion}
                      onChange={(e) => setCodexVersion(e.target.value)}
                      placeholder="Not detected"
                      spellCheck={false}
                    />
                  </div>
                  <button
                    style={{
                      ...s.modalCancelBtn,
                      padding: "6px 10px",
                      marginTop: 16,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      opacity: detecting ? 0.6 : 1,
                    }}
                    onClick={autoDetectVersions}
                    disabled={detecting}
                    title="Re-detect agent versions"
                  >
                    <RefreshCw size={13} style={detecting ? { animation: "spin 1s linear infinite" } : undefined} />
                    {detecting ? "Detecting..." : "Detect"}
                  </button>
                </div>
              </div>
            </div>

            <div style={s.modalSection}>
              <div style={s.modalSectionTitle}>Prompt Templates</div>
              {promptTemplates.length === 0 ? (
                <div style={{ color: "var(--text-hint)", fontSize: 12.5, marginBottom: 12 }}>
                  No templates yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  {promptTemplates.map((template) => (
                    <div
                      key={template.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "9px 10px",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: 8,
                        background: "var(--bg-secondary)",
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            color: "var(--text-primary)",
                            fontSize: 13,
                            fontWeight: 600,
                            marginBottom: 3,
                          }}
                        >
                          {template.name}
                        </div>
                        <div
                          style={{
                            color: "var(--text-hint)",
                            fontSize: 12,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={template.content}
                        >
                          {template.content}
                        </div>
                      </div>
                      <button
                        style={{ ...s.modalCancelBtn, padding: "5px 9px" }}
                        onClick={() => startEditTemplate(template)}
                      >
                        Edit
                      </button>
                      <button
                        style={{ ...s.modalCancelBtn, padding: "5px 9px", color: "var(--danger)" }}
                        onClick={() => deleteTemplate(template.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={s.modalField}>
                <label style={s.modalLabel}>Template Name</label>
                <input
                  style={s.modalInput}
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Bug fix"
                  spellCheck={false}
                />
              </div>
              <div style={s.modalField}>
                <label style={s.modalLabel}>Template Content</label>
                <textarea
                  style={s.modalTextarea}
                  value={templateContent}
                  onChange={(e) => setTemplateContent(e.target.value)}
                  rows={5}
                  spellCheck={false}
                  placeholder="Describe the task..."
                />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {TEMPLATE_VARIABLES.map((variable) => (
                  <button
                    key={variable}
                    style={{ ...s.modalCancelBtn, padding: "4px 8px", fontFamily: "var(--font-mono)" }}
                    onClick={() => insertTemplateVariable(variable)}
                  >
                    {variable}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={s.modalSaveBtn} onClick={saveTemplateDraft}>
                  {editingTemplateId ? "Update Template" : "Add Template"}
                </button>
                {editingTemplateId && (
                  <button style={s.modalCancelBtn} onClick={resetTemplateEditor}>
                    Cancel Edit
                  </button>
                )}
              </div>
            </div>

            <div style={s.modalSection}>
              <div style={s.modalSectionTitle}>Git</div>
              <div style={s.modalField}>
                <label style={s.modalLabel}>
                  Commit Prompt
                  <span style={s.modalLabelHint}>
                    System prompt used when AI generates commit messages
                  </span>
                </label>
                <textarea
                  style={s.modalTextarea}
                  value={commitPrompt}
                  onChange={(e) => setCommitPrompt(e.target.value)}
                  rows={8}
                  spellCheck={false}
                />
              </div>
            </div>
          </>
        )}
      </div>
      <div style={s.settingsFooter}>
        <button style={s.modalCancelBtn} onClick={onClose}>
          Cancel
        </button>
        <button
          style={{ ...s.modalSaveBtn, opacity: saving ? 0.6 : 1 }}
          onClick={handleSave}
          disabled={saving || !config}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </>
  );
}

export function SettingsDialog({
  projectPath,
  onClose,
}: {
  projectPath: string;
  onClose: () => void;
}) {
  const [activeNav, setActiveNav] = useState<NavKey>("project");

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  const activeLabel = NAV_ITEMS.find((n) => n.key === activeNav)?.label ?? "";

  return (
    <div style={s.modalOverlay} onClick={handleOverlayClick}>
      <div style={s.modalBox}>
        {/* Left nav */}
        <div style={s.settingsNav}>
          <div style={s.settingsNavTitle}>Settings</div>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              style={{
                ...s.settingsNavItem,
                background: activeNav === item.key ? "var(--bg-hover)" : "none",
                color: activeNav === item.key ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: activeNav === item.key ? 600 : 500,
              }}
              onClick={() => setActiveNav(item.key)}
            >
              <FolderOpen size={14} />
              {item.label}
            </button>
          ))}
        </div>

        {/* Right content */}
        <div style={s.settingsContent}>
          <div style={s.settingsContentHeader}>
            <span style={s.settingsContentTitle}>{activeLabel}</span>
            <button style={s.modalCloseBtn} onClick={onClose} title="Close">
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          {activeNav === "project" && (
            <ProjectSettings projectPath={projectPath} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}
