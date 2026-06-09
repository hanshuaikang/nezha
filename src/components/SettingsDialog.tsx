import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as RadixSelect from "@radix-ui/react-select";
import { X, FolderOpen, ChevronDown, Check } from "lucide-react";
import { permissionModeLabel, type PermissionMode, type AgentType } from "../types";
import { useI18n } from "../i18n";
import s from "../styles";

interface ProjectConfig {
  agent: {
    default: string;
    default_permission_mode: string;
    prompt_prefix: string;
  };
  git: {
    commit_prompt: string;
    commit_message_timeout_secs?: number;
  };
}

const PERMISSION_MODES: PermissionMode[] = ["ask", "auto_edit", "full_access"];
const MIN_COMMIT_MESSAGE_TIMEOUT_SECS = 1;
const MAX_COMMIT_MESSAGE_TIMEOUT_SECS = 120;
const DEFAULT_COMMIT_MESSAGE_TIMEOUT_SECS = 15;

type NavKey = "project";

const NAV_ITEMS: Array<{ key: NavKey; label: string }> = [
  { key: "project", label: "settings.projectSettings" },
];

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
  const current = options.find((o) => o.value === value);

  return (
    <RadixSelect.Root value={value} onValueChange={onChange} open={open} onOpenChange={setOpen}>
      <RadixSelect.Trigger aria-label={current?.label ?? value} style={s.settingsSelectTrigger}>
        <RadixSelect.Value>{current?.label ?? value}</RadixSelect.Value>
        <RadixSelect.Icon asChild>
          <ChevronDown size={13} style={open ? s.settingsSelectIconOpen : s.settingsSelectIcon} />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content position="popper" sideOffset={4} style={s.settingsSelectContent}>
          <RadixSelect.Viewport style={s.settingsSelectViewport}>
            {options.map((opt) => {
              const selected = opt.value === value;

              return (
                <RadixSelect.Item
                  key={opt.value}
                  value={opt.value}
                  className="radix-select-item"
                  style={selected ? s.settingsSelectOptionSelected : s.settingsSelectOption}
                >
                  <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator style={s.settingsSelectIndicator}>
                    <Check size={13} style={s.settingsSelectCheck} />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              );
            })}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

function ProjectSettings({ projectPath, onClose }: { projectPath: string; onClose: () => void }) {
  const { t } = useI18n();
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [agentDefault, setAgentDefault] = useState("claude");
  const [defaultPermissionMode, setDefaultPermissionMode] = useState<PermissionMode>("ask");
  const [promptPrefix, setPromptPrefix] = useState("");
  const [commitPrompt, setCommitPrompt] = useState("");
  const [commitMessageTimeoutSecs, setCommitMessageTimeoutSecs] = useState(
    String(DEFAULT_COMMIT_MESSAGE_TIMEOUT_SECS),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<ProjectConfig>("read_project_config", { projectPath })
      .then((c) => {
        setConfig(c);
        setAgentDefault(c.agent.default);
        const mode = c.agent.default_permission_mode;
        if (mode === "ask" || mode === "auto_edit" || mode === "full_access") {
          setDefaultPermissionMode(mode);
        }
        setPromptPrefix(c.agent.prompt_prefix ?? "");
        setCommitPrompt(c.git.commit_prompt);
        const timeoutSecs = c.git.commit_message_timeout_secs ?? DEFAULT_COMMIT_MESSAGE_TIMEOUT_SECS;
        setCommitMessageTimeoutSecs(
          String(
            Math.min(
              Math.max(timeoutSecs, MIN_COMMIT_MESSAGE_TIMEOUT_SECS),
              MAX_COMMIT_MESSAGE_TIMEOUT_SECS,
            ),
          ),
        );
      })
      .catch((e) => setError(String(e)));
  }, [projectPath]);

  function handleCommitMessageTimeoutChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextValue = e.target.value.trim();
    if (!nextValue) {
      setCommitMessageTimeoutSecs("");
      return;
    }
    if (!/^\d+$/.test(nextValue)) return;

    const timeoutSecs = Number(nextValue);
    if (!Number.isSafeInteger(timeoutSecs)) return;

    setCommitMessageTimeoutSecs(
      String(
        Math.min(
          Math.max(timeoutSecs, MIN_COMMIT_MESSAGE_TIMEOUT_SECS),
          MAX_COMMIT_MESSAGE_TIMEOUT_SECS,
        ),
      ),
    );
  }

  function handleCommitMessageTimeoutBlur() {
    if (!commitMessageTimeoutSecs) {
      setCommitMessageTimeoutSecs(String(MIN_COMMIT_MESSAGE_TIMEOUT_SECS));
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const timeoutSecs = Number(commitMessageTimeoutSecs);
      if (
        !Number.isInteger(timeoutSecs) ||
        timeoutSecs < MIN_COMMIT_MESSAGE_TIMEOUT_SECS ||
        timeoutSecs > MAX_COMMIT_MESSAGE_TIMEOUT_SECS
      ) {
        setError(t("settings.commitMessageTimeoutInvalid"));
        return;
      }

      await invoke("write_project_config", {
        projectPath,
        config: {
          agent: {
            default: agentDefault,
            default_permission_mode: defaultPermissionMode,
            prompt_prefix: promptPrefix,
          },
          git: {
            commit_prompt: commitPrompt,
            commit_message_timeout_secs: timeoutSecs,
          },
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
          <div style={{ color: "var(--text-hint)", fontSize: 13 }}>{t("common.loading")}</div>
        )}
        {error && (
          <div style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 12 }}>{error}</div>
        )}
        {config && (
          <>
            <div style={s.modalSection}>
              <div style={s.modalSectionTitle}>{t("settings.agent")}</div>
              <div style={s.modalField}>
                <label style={s.modalLabel}>
                  {t("settings.defaultAgent")}
                  <span style={s.modalLabelHint}>{t("settings.defaultAgentHint")}</span>
                </label>
                <Select
                  value={agentDefault}
                  onChange={setAgentDefault}
                  options={[
                    { value: "claude", label: "Claude Code" },
                    { value: "codex", label: "Codex" },
                  ]}
                />
              </div>
              <div style={s.modalField}>
                <label style={s.modalLabel}>
                  {t("settings.defaultPermissionMode")}
                  <span style={s.modalLabelHint}>
                    {t("settings.defaultPermissionModeHint")}
                  </span>
                </label>
                <Select
                  value={defaultPermissionMode}
                  onChange={(v) => setDefaultPermissionMode(v as PermissionMode)}
                  options={PERMISSION_MODES.map((mode) => ({
                    value: mode,
                    label: permissionModeLabel(mode, agentDefault as AgentType),
                  }))}
                />
              </div>
              <div style={s.modalField}>
                <label style={s.modalLabel}>
                  {t("settings.promptPrefix")}
                  <span style={s.modalLabelHint}>{t("settings.promptPrefixHint")}</span>
                </label>
                <textarea
                  style={s.modalTextarea}
                  value={promptPrefix}
                  onChange={(e) => setPromptPrefix(e.target.value)}
                  rows={3}
                  spellCheck={false}
                  placeholder={t("settings.promptPrefixPlaceholder")}
                />
              </div>
            </div>

            <div style={s.modalSection}>
              <div style={s.modalSectionTitle}>{t("settings.git")}</div>
              <div style={s.modalField}>
                <label style={s.modalLabel}>
                  {t("settings.commitMessageTimeout")}
                  <span style={s.modalLabelHint}>
                    {t("settings.commitMessageTimeoutHint")}
                  </span>
                </label>
                <div style={s.settingsFlexRow}>
                  <input
                    style={{ ...s.modalInput, ...s.settingsInputWithFlex }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={commitMessageTimeoutSecs}
                    onChange={handleCommitMessageTimeoutChange}
                    onBlur={handleCommitMessageTimeoutBlur}
                  />
                  <span style={s.settingsUnitText}>{t("settings.secondsUnit")}</span>
                </div>
              </div>
              <div style={s.modalField}>
                <label style={s.modalLabel}>
                  {t("settings.commitPrompt")}
                  <span style={s.modalLabelHint}>
                    {t("settings.commitPromptHint")}
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
          {t("common.cancel")}
        </button>
        <button
          style={{ ...s.modalSaveBtn, opacity: saving ? 0.6 : 1 }}
          onClick={handleSave}
          disabled={saving || !config}
        >
          {saving ? t("common.saving") : t("common.save")}
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
  const { t } = useI18n();
  const [activeNav, setActiveNav] = useState<NavKey>("project");

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  const activeLabel = t(NAV_ITEMS.find((n) => n.key === activeNav)?.label ?? "");

  return (
    <div style={s.modalOverlay} onClick={handleOverlayClick}>
      <div style={s.modalBox}>
        {/* Left nav */}
        <div style={s.settingsNav}>
          <div style={s.settingsNavTitle}>{t("settings.title")}</div>
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
              {t(item.label)}
            </button>
          ))}
        </div>

        {/* Right content */}
        <div style={s.settingsContent}>
          <div style={s.settingsContentHeader}>
            <span style={s.settingsContentTitle}>{activeLabel}</span>
            <button style={s.modalCloseBtn} onClick={onClose} title={t("common.close")}>
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
