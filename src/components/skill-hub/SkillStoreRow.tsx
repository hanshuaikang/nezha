import { AlertCircle, AlertTriangle, Check, Loader2, Plus, X } from "lucide-react";
import type { AgentType, Skill, SkillInstallation } from "../../types";
import { useI18n } from "../../i18n";
import {
  SKILL_STORE_AGENTS,
  SKILL_STORE_AGENT_LABEL,
  SKILL_STORE_AGENT_LOGO,
  skillInstallKey,
} from "./skillStoreShared";

interface Props {
  skill: Skill;
  /** 当前项目下的安装记录，key 见 skillInstallKey */
  installedMap: Map<string, SkillInstallation>;
  /** 正在安装 / 卸载的 chip key；非空时其余 chip 一并禁用，避免并发改 symlink */
  busyKey: string | null;
  onToggle: (skill: Skill, agent: AgentType) => void;
}

export function SkillStoreRow({ skill, installedMap, busyKey, onToggle }: Props) {
  const { t } = useI18n();
  const title = skill.displayName || skill.name;
  const showDirName = Boolean(skill.displayName && skill.displayName !== skill.name);
  const installedAnywhere = SKILL_STORE_AGENTS.some((agent) =>
    installedMap.has(skillInstallKey(skill.name, agent)),
  );
  const unavailable = Boolean(skill.hasError);

  return (
    <div className="skill-store-row" data-installed={installedAnywhere ? "true" : undefined}>
      <div className="skill-store-row-title">
        <span className="skill-store-row-name" title={title}>
          {title}
        </span>
        {showDirName ? (
          <span className="skill-store-row-dir" title={skill.name}>
            {skill.name}
          </span>
        ) : null}
      </div>

      {skill.description ? (
        <div className="skill-store-row-desc" title={skill.description}>
          {skill.description}
        </div>
      ) : (
        <div className="skill-store-row-desc" data-empty="true">
          {t("skill.row.noDescription")}
        </div>
      )}

      {skill.hasError ? (
        <div className="skill-store-row-error">
          <AlertCircle size={11} strokeWidth={2} />
          <span>{skill.hasError}</span>
        </div>
      ) : null}

      <div className="skill-store-row-actions">
        {SKILL_STORE_AGENTS.map((agent) => {
          const key = skillInstallKey(skill.name, agent);
          const installation = installedMap.get(key);
          const installed = Boolean(installation);
          const health =
            installation?.health && installation.health !== "ok" ? installation.health : undefined;
          const busy = busyKey === key;
          const agentLabel = SKILL_STORE_AGENT_LABEL[agent];
          // SKILL.md 解析失败只阻止新安装；已装上的仍要允许卸载，否则坏掉的 symlink 无法清理
          const blocked = unavailable && !installed;
          const tooltip = blocked
            ? t("skillStore.unavailable")
            : health
              ? `${t(`skill.manage.health.${health}`)} · ${t("skillStore.uninstall", { agent: agentLabel })}`
              : installed
                ? t("skillStore.uninstall", { agent: agentLabel })
                : t("skillStore.install", { agent: agentLabel });

          return (
            <button
              key={agent}
              type="button"
              className="skill-store-agent-chip"
              data-installed={installed ? "true" : undefined}
              data-health={health}
              data-busy={busy ? "true" : undefined}
              disabled={blocked || busyKey !== null}
              aria-pressed={installed}
              title={tooltip}
              onClick={() => onToggle(skill, agent)}
            >
              <img src={SKILL_STORE_AGENT_LOGO[agent]} alt="" className="skill-store-agent-logo" />
              <span>{agentLabel}</span>
              {busy ? (
                <span className="skill-store-agent-state">
                  <Loader2 size={10} strokeWidth={2.2} className="spin" />
                </span>
              ) : installed ? (
                <>
                  <span className="skill-store-agent-state skill-store-agent-state--idle">
                    {health ? (
                      <AlertTriangle size={10} strokeWidth={2.2} />
                    ) : (
                      <Check size={10} strokeWidth={2.4} />
                    )}
                  </span>
                  <span className="skill-store-agent-state skill-store-agent-state--hover">
                    <X size={10} strokeWidth={2.4} />
                  </span>
                </>
              ) : (
                <span className="skill-store-agent-state">
                  <Plus size={10} strokeWidth={2.4} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
