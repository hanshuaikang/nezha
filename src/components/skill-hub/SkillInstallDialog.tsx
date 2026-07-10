import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Check, ChevronDown, Search } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import claudeLogo from "../../assets/claude.svg";
import chatgptLogo from "../../assets/chatgpt.svg";
import type {
  Project,
  Skill,
  SkillInstallation,
  AgentType,
  SkillInstallResult,
  SkillInstallStrategy,
} from "../../types";
import { useI18n } from "../../i18n";
import s from "../../styles";
import { SkillConflictDialog } from "./SkillConflictDialog";

type SkillAgent = Extract<AgentType, "claude" | "codex">;

interface Props {
  skill: Skill;
  allProjects: Project[];
  existingInstallations: SkillInstallation[];
  onClose: () => void;
  onInstalled: () => void;
}

const AGENT_LOGO: Record<SkillAgent, string> = {
  claude: claudeLogo,
  codex: chatgptLogo,
};

const DEFAULT_PROJECT_OPTION_LIMIT = 8;

export function SkillInstallDialog({
  skill,
  allProjects,
  existingInstallations,
  onClose,
  onInstalled,
}: Props) {
  const { t } = useI18n();
  const [projectId, setProjectId] = useState<string | null>(allProjects[0]?.id ?? null);
  const [agent, setAgent] = useState<SkillAgent>("claude");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<SkillInstallResult["conflict"] | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");

  const existingKey = useMemo(
    () => new Set(existingInstallations.map((ins) => `${ins.projectId}::${ins.agent}`)),
    [existingInstallations],
  );

  const alreadyInstalled = projectId
    ? existingKey.has(`${projectId}::${agent}`)
    : false;

  const filteredProjects = useMemo(() => {
    const q = projectQuery.trim().toLocaleLowerCase();
    if (!q) return allProjects.slice(0, DEFAULT_PROJECT_OPTION_LIMIT);
    return allProjects.filter((p) => {
      return [p.name, p.path].some((value) => value.toLocaleLowerCase().includes(q));
    });
  }, [allProjects, projectQuery]);
  const hasHiddenProjects = !projectQuery.trim() && allProjects.length > filteredProjects.length;

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  async function runInstall(strategy: SkillInstallStrategy) {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await invoke<SkillInstallResult>("install_skill", {
        skillName: skill.name,
        skillPath: skill.path,
        projectId,
        agent,
        strategy,
      });
      if (result.conflict) {
        setConflict(result.conflict);
        return;
      }
      if (result.cancelled) {
        return;
      }
      onInstalled();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const selectedProject = projectId ? allProjects.find((p) => p.id === projectId) : null;

  return (
    <>
      <div style={s.skillInstallOverlay} onClick={handleOverlayClick}>
        <div style={s.skillInstallDialogBox}>
          <div style={s.skillInstallDialogHeader}>
            <div style={s.skillInstallDialogTitle}>
              {t("skill.install.title", { name: skill.displayName || skill.name })}
            </div>
            <button type="button" style={s.modalCloseBtn} onClick={onClose}>
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          <div style={s.skillInstallDialogBody}>
            <div style={s.skillInstallField}>
              <label style={s.skillInstallLabel}>{t("skill.install.project")}</label>
              <Popover.Root
                open={projectOpen}
                onOpenChange={(open) => {
                  setProjectOpen(open);
                  if (open) setProjectQuery("");
                }}
              >
                <Popover.Trigger asChild>
                  <button type="button" style={s.skillInstallSelectTrigger}>
                    {selectedProject?.name ?? t("skill.install.chooseProject")}
                    <ChevronDown size={13} strokeWidth={2.2} color="var(--text-hint)" />
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    align="start"
                    sideOffset={4}
                    style={s.skillInstallProjectPopoverContent}
                  >
                    <div style={s.skillInstallProjectSearch}>
                      <Search
                        size={13}
                        strokeWidth={2}
                        color="var(--text-muted)"
                        style={s.skillInstallProjectSearchIcon}
                      />
                      <input
                        style={s.skillInstallProjectSearchInput}
                        value={projectQuery}
                        onChange={(e) => setProjectQuery(e.target.value)}
                        placeholder={t("skill.install.searchProject")}
                        autoFocus
                      />
                      {projectQuery ? (
                        <button
                          type="button"
                          style={s.skillInstallProjectSearchClear}
                          onClick={() => setProjectQuery("")}
                        >
                          <X size={11} />
                        </button>
                      ) : null}
                    </div>
                    <div style={s.skillInstallProjectList}>
                      {allProjects.length === 0 ? (
                        <div style={s.skillInstallEmptyOption}>
                          {t("skill.install.noProjects")}
                        </div>
                      ) : filteredProjects.length === 0 ? (
                        <div style={s.skillInstallEmptyOption}>
                          {t("skill.install.noMatchingProjects")}
                        </div>
                      ) : (
                        filteredProjects.map((p) => {
                          const selected = p.id === projectId;
                          return (
                            <button
                              type="button"
                              key={p.id}
                              style={
                                selected
                                  ? s.skillInstallProjectOptionSelected
                                  : s.skillInstallProjectOption
                              }
                              onClick={() => {
                                setProjectId(p.id);
                                setProjectOpen(false);
                              }}
                            >
                              <span style={s.skillInstallProjectOptionText}>{p.name}</span>
                              {selected ? (
                                <Check size={13} style={s.skillInstallSelectCheck} />
                              ) : null}
                            </button>
                          );
                        })
                      )}
                      {hasHiddenProjects ? (
                        <div style={s.skillInstallProjectLimitHint}>
                          {t("skill.install.projectLimitHint", {
                            shown: filteredProjects.length,
                            total: allProjects.length,
                          })}
                        </div>
                      ) : null}
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>

            <div style={s.skillInstallField}>
              <label style={s.skillInstallLabel}>{t("skill.install.agent")}</label>
              <div style={s.skillInstallAgentRow}>
                {(["claude", "codex"] as const).map((a) => {
                  const active = agent === a;
                  return (
                    <button
                      key={a}
                      type="button"
                      style={active ? s.skillAgentBtnActive : s.skillAgentBtn}
                      onClick={() => setAgent(a)}
                    >
                      <img src={AGENT_LOGO[a]} style={s.skillInstallAgentLogo} alt="" />
                      <span>{a === "claude" ? "Claude" : "Codex"}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {alreadyInstalled ? (
              <div style={s.skillInstallNotice}>{t("skill.install.alreadyInstalled")}</div>
            ) : null}
            {error ? <div style={s.skillHubError}>{error}</div> : null}
          </div>

          <div style={s.skillInstallDialogFooter}>
            <button
              type="button"
              style={s.modalCancelBtn}
              onClick={onClose}
              disabled={busy}
            >
              {t("skill.install.cancel")}
            </button>
            <button
              type="button"
              style={s.modalSaveBtn}
              onClick={() => runInstall("detect")}
              disabled={busy || !projectId || alreadyInstalled}
            >
              {t("skill.install.confirm")}
            </button>
          </div>
        </div>
      </div>

      {conflict ? (
        <SkillConflictDialog
          conflict={conflict}
          onChoose={(choice) => {
            setConflict(null);
            if (choice === "cancel") {
              setBusy(false);
              return;
            }
            runInstall(choice);
          }}
          onClose={() => setConflict(null)}
        />
      ) : null}
    </>
  );
}
