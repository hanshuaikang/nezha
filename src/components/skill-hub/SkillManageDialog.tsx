import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Plus, Trash2, AlertTriangle } from "lucide-react";
import claudeLogo from "../../assets/claude.svg";
import chatgptLogo from "../../assets/chatgpt.svg";
import type { Project, Skill, SkillInstallation, AgentType } from "../../types";
import { useI18n } from "../../i18n";
import s from "../../styles";
import { SkillInstallDialog } from "./SkillInstallDialog";

type SkillAgent = Extract<AgentType, "claude" | "codex">;

interface Props {
  skill: Skill;
  allProjects: Project[];
  onClose: () => void;
  onChanged: () => void;
}

const AGENT_LABEL: Record<SkillAgent, string> = {
  claude: "Claude",
  codex: "Codex",
};

const AGENT_LOGO: Record<SkillAgent, string> = {
  claude: claudeLogo,
  codex: chatgptLogo,
};

function isSkillAgent(agent: AgentType): agent is SkillAgent {
  return agent === "claude" || agent === "codex";
}

export function SkillManageDialog({ skill, allProjects, onClose, onChanged }: Props) {
  const { t } = useI18n();
  const [installations, setInstallations] = useState<SkillInstallation[]>([]);
  const [activeAgent, setActiveAgent] = useState<SkillAgent>("claude");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    invoke<SkillInstallation[]>("list_skill_installations", { skillName: skill.name })
      .then((rows) => setInstallations(rows))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [skill.name]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleUninstall = useCallback(
    async (ins: SkillInstallation) => {
      try {
        await invoke("uninstall_skill", {
          skillName: ins.skillName,
          projectId: ins.projectId,
          agent: ins.agent,
        });
        refresh();
        onChanged();
      } catch (e) {
        setError(String(e));
      }
    },
    [refresh, onChanged],
  );

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  const agentCounts = {
    claude: installations.filter((ins) => ins.agent === "claude").length,
    codex: installations.filter((ins) => ins.agent === "codex").length,
  };
  const visibleInstallations = installations.filter(
    (ins): ins is SkillInstallation & { agent: SkillAgent } =>
      isSkillAgent(ins.agent) && ins.agent === activeAgent,
  );

  return (
    <div style={s.modalOverlay} onClick={handleOverlayClick}>
      <div style={s.skillDialogBox}>
        <div style={s.skillDialogHeader}>
          <div style={s.skillDialogHeaderMain}>
            <div style={s.skillDialogTitle}>{skill.displayName || skill.name}</div>
            {skill.displayName && skill.displayName !== skill.name ? (
              <div style={s.skillDialogSubtitle}>{skill.name}</div>
            ) : null}
            {skill.description ? (
              <div style={s.skillDialogDesc}>{skill.description}</div>
            ) : null}
          </div>
          <button type="button" style={s.modalCloseBtn} onClick={onClose}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div style={s.skillDialogToolbar}>
          <div style={s.skillDialogSectionTitle}>{t("skill.manage.installedTitle")}</div>
          <button
            type="button"
            style={s.skillDialogPrimaryBtn}
            onClick={() => setInstallDialogOpen(true)}
          >
            <Plus size={13} strokeWidth={2.2} />
            <span>{t("skill.manage.installNew")}</span>
          </button>
        </div>

        <div style={s.skillDialogTabs}>
          {(["claude", "codex"] as const).map((agentKey) => {
            const active = activeAgent === agentKey;
            return (
              <button
                key={agentKey}
                type="button"
                style={active ? s.skillDialogTabActive : s.skillDialogTab}
                onClick={() => setActiveAgent(agentKey)}
              >
                <img src={AGENT_LOGO[agentKey]} style={s.skillInstallAgentLogo} alt="" />
                <span>{AGENT_LABEL[agentKey]}</span>
                <span style={s.skillDialogTabCount}>{agentCounts[agentKey]}</span>
              </button>
            );
          })}
        </div>

        <div style={s.skillDialogList}>
          {loading ? (
            <div style={s.skillDialogEmpty}>{t("skill.manage.loading")}</div>
          ) : visibleInstallations.length === 0 ? (
            <div style={s.skillDialogEmpty}>
              {installations.length === 0
                ? t("skill.manage.empty")
                : t("skill.manage.emptyForAgent", { agent: AGENT_LABEL[activeAgent] })}
            </div>
          ) : (
            visibleInstallations.map((ins) => {
              const project = allProjects.find((p) => p.id === ins.projectId);
              const projectName = project?.name ?? ins.projectId;
              const broken = ins.health && ins.health !== "ok";
              return (
                <div key={`${ins.projectId}-${ins.agent}`} style={s.skillInstallRow}>
                  <div style={s.skillInstallRowMain}>
                    <div style={s.skillInstallRowTitle}>{projectName}</div>
                    <div style={s.skillInstallRowMeta}>
                      <img src={AGENT_LOGO[ins.agent]} style={s.skillInstallAgentLogo} alt="" />
                      <span>{AGENT_LABEL[ins.agent]}</span>
                      <span style={s.skillInstallRowSep}>·</span>
                      <span style={s.skillInstallRowPath}>{ins.linkPath}</span>
                    </div>
                    {broken ? (
                      <div style={s.skillInstallRowWarn}>
                        <AlertTriangle size={11} strokeWidth={2} />
                        <span>{t(`skill.manage.health.${ins.health}`)}</span>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    style={s.skillInstallUninstallBtn}
                    onClick={() => handleUninstall(ins)}
                    title={t("skill.manage.uninstall")}
                  >
                    <Trash2 size={13} strokeWidth={1.8} />
                    <span>{t("skill.manage.uninstall")}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {error ? <div style={s.skillHubError}>{error}</div> : null}
      </div>

      {installDialogOpen ? (
        <SkillInstallDialog
          skill={skill}
          allProjects={allProjects}
          existingInstallations={installations}
          onClose={() => setInstallDialogOpen(false)}
          onInstalled={() => {
            setInstallDialogOpen(false);
            refresh();
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}
