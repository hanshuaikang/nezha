import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertCircle, Blocks, RotateCcw, Search, Settings as SettingsIcon, X } from "lucide-react";
import type {
  AgentType,
  Skill,
  SkillConflictInfo,
  SkillHubConfig,
  SkillInstallation,
  SkillInstallResult,
  SkillInstallStrategy,
} from "../../types";
import { useI18n } from "../../i18n";
import { useToast } from "../Toast";
import { useCancellableInvoke } from "../../hooks/useCancellableInvoke";
import { SKILL_HUB_CHANGED_EVENT } from "../app-settings/types";
import { skillStoreRootStyle } from "../../styles/skill-hub";
import { SkillConflictDialog } from "./SkillConflictDialog";
import { SkillStoreRow } from "./SkillStoreRow";
import { SKILL_STORE_AGENT_LABEL, skillInstallKey } from "./skillStoreShared";

interface Props {
  projectId: string;
  /** 面板所属 ProjectPage 是否可见；从不可见切回可见时重新拉一次数据 */
  active: boolean;
  width: number;
  /** 未配置技能库时的「打开设置」入口；由 ProjectPage 负责确保设置对话框的宿主已挂载 */
  onOpenAppSettings: () => void;
}

interface PendingConflict {
  skill: Skill;
  agent: AgentType;
  info: SkillConflictInfo;
}

/**
 * 右侧面板版的技能商店：列出技能库里的全部 skill，并针对**当前项目**
 * 一键把 skill 安装（symlink）到 Claude / Codex 的 skills 目录或从中卸载。
 * 数据与后端 `list_skills` / `list_skill_installations` 保持一致，安装 / 卸载
 * 完成后通过 SKILL_HUB_CHANGED_EVENT 通知欢迎页技能库视图刷新计数。
 */
export function SkillStorePanel({ projectId, active, width, onOpenAppSettings }: Props) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { safeInvoke, isCancelled } = useCancellableInvoke();
  const loadSeqRef = useRef(0);

  const [config, setConfig] = useState<SkillHubConfig | null | undefined>(undefined);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [installations, setInstallations] = useState<SkillInstallation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [conflict, setConflict] = useState<PendingConflict | null>(null);

  const load = useCallback(async () => {
    // 首次加载、SKILL_HUB_CHANGED_EVENT、手动刷新可能重叠：只让最后发起的一次落地，
    // 过期请求的结果与 loading 收尾一律丢弃，避免旧数据覆盖新数据或提前清掉 loading。
    const seq = ++loadSeqRef.current;
    const isStale = () => seq !== loadSeqRef.current || isCancelled();
    setLoading(true);
    setError(null);
    try {
      const cfg = await safeInvoke<SkillHubConfig>("get_skill_hub_config");
      if (isStale() || cfg === null) return;
      setConfig(cfg);
      if (!cfg.hubPath) {
        setSkills([]);
        setInstallations([]);
        return;
      }
      const [rows, installs] = await Promise.all([
        safeInvoke<Skill[]>("list_skills"),
        safeInvoke<SkillInstallation[]>("list_skill_installations", { skillName: null }),
      ]);
      if (isStale() || rows === null || installs === null) return;
      setSkills(rows);
      setInstallations(installs.filter((ins) => ins.projectId === projectId));
    } catch (e) {
      if (!isStale()) setError(String(e));
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [projectId, safeInvoke, isCancelled]);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener(SKILL_HUB_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(SKILL_HUB_CHANGED_EVENT, refresh);
  }, [load]);

  const installedMap = useMemo(() => {
    const map = new Map<string, SkillInstallation>();
    installations.forEach((ins) => map.set(skillInstallKey(ins.skillName, ins.agent), ins));
    return map;
  }, [installations]);

  const installedSkillCount = useMemo(() => {
    const names = new Set(installations.map((ins) => ins.skillName));
    return skills.filter((skill) => names.has(skill.name)).length;
  }, [installations, skills]);

  // 输入框保持即时响应，过滤结果用 deferred 值计算，连续敲键时不阻塞输入
  const deferredQuery = useDeferredValue(query);
  const visibleSkills = useMemo(() => {
    const q = deferredQuery.trim().toLocaleLowerCase();
    if (!q) return skills;
    return skills.filter((skill) =>
      [skill.name, skill.displayName, skill.description].some(
        (value) => value?.toLocaleLowerCase().includes(q) ?? false,
      ),
    );
  }, [skills, deferredQuery]);

  // 安装 / 卸载成功后只广播事件：本面板与欢迎页技能库视图都监听它并各自重新拉取，
  // 避免这里再手动 load() 造成两次并发刷新。
  const notifyChanged = useCallback(() => {
    window.dispatchEvent(new CustomEvent(SKILL_HUB_CHANGED_EVENT));
  }, []);

  const runInstall = useCallback(
    async (skill: Skill, agent: AgentType, strategy: SkillInstallStrategy) => {
      const key = skillInstallKey(skill.name, agent);
      const name = skill.displayName || skill.name;
      const agentLabel = SKILL_STORE_AGENT_LABEL[agent];
      setBusyKey(key);
      try {
        const result = await invoke<SkillInstallResult>("install_skill", {
          skillName: skill.name,
          skillPath: skill.path,
          projectId,
          agent,
          strategy,
        });
        if (isCancelled()) return;
        if (result.conflict) {
          setConflict({ skill, agent, info: result.conflict });
          return;
        }
        if (result.cancelled) return;
        if (result.skipped) {
          showToast(t("skillStore.toast.skipped", { name }), "warning");
          return;
        }
        showToast(
          t(
            result.alreadyInstalled
              ? "skillStore.toast.alreadyInstalled"
              : "skillStore.toast.installed",
            { name, agent: agentLabel },
          ),
          "success",
        );
        notifyChanged();
      } catch (e) {
        showToast(String(e), "error");
      } finally {
        if (!isCancelled()) setBusyKey(null);
      }
    },
    [projectId, showToast, t, notifyChanged, isCancelled],
  );

  const runUninstall = useCallback(
    async (skill: Skill, agent: AgentType) => {
      const key = skillInstallKey(skill.name, agent);
      setBusyKey(key);
      try {
        await invoke("uninstall_skill", { skillName: skill.name, projectId, agent });
        showToast(
          t("skillStore.toast.uninstalled", {
            name: skill.displayName || skill.name,
            agent: SKILL_STORE_AGENT_LABEL[agent],
          }),
          "success",
        );
        notifyChanged();
      } catch (e) {
        showToast(String(e), "error");
      } finally {
        if (!isCancelled()) setBusyKey(null);
      }
    },
    [projectId, showToast, t, notifyChanged, isCancelled],
  );

  const handleToggle = useCallback(
    (skill: Skill, agent: AgentType) => {
      if (installedMap.has(skillInstallKey(skill.name, agent))) {
        void runUninstall(skill, agent);
      } else {
        void runInstall(skill, agent, "detect");
      }
    },
    [installedMap, runInstall, runUninstall],
  );

  const handleConflictChoice = useCallback(
    (choice: SkillInstallStrategy) => {
      const pending = conflict;
      setConflict(null);
      if (!pending || choice === "cancel") return;
      void runInstall(pending.skill, pending.agent, choice);
    },
    [conflict, runInstall],
  );

  const hubConfigured = Boolean(config?.hubPath);

  return (
    <div className="skill-store-root" style={skillStoreRootStyle(width)}>
      <div className="skill-store-header">
        <span className="skill-store-title">{t("skillStore.title")}</span>
        <button
          type="button"
          className="skill-store-icon-btn"
          onClick={() => void load()}
          disabled={loading}
          title={t("common.refresh")}
          aria-label={t("common.refresh")}
        >
          <RotateCcw size={13} className={loading ? "spin" : undefined} />
        </button>
      </div>

      {config === undefined ? (
        // 首次加载尚未拿到 hub 配置：区分「加载中」与「加载失败」，避免误显示未配置空态
        error ? (
          <div className="skill-store-error">
            <AlertCircle size={13} strokeWidth={2} />
            <span>{error}</span>
          </div>
        ) : (
          <div className="skill-store-hint">{t("common.loading")}</div>
        )
      ) : !hubConfigured ? (
        <div className="skill-store-empty">
          <Blocks size={30} strokeWidth={1.2} color="var(--text-hint)" />
          <div className="skill-store-empty-title">{t("skill.empty.title")}</div>
          <div className="skill-store-empty-hint">{t("skill.empty.hint")}</div>
          <button type="button" className="skill-store-empty-btn" onClick={onOpenAppSettings}>
            <SettingsIcon size={13} strokeWidth={2} />
            {t("skill.empty.openSettings")}
          </button>
        </div>
      ) : (
        <>
          <div className="skill-store-search">
            <Search size={13} strokeWidth={2} />
            <input
              className="skill-store-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("skillStore.searchPlaceholder")}
              spellCheck={false}
            />
            {query ? (
              <button
                type="button"
                className="skill-store-search-clear"
                onClick={() => setQuery("")}
                title={t("skillStore.clearSearch")}
                aria-label={t("skillStore.clearSearch")}
              >
                <X size={11} />
              </button>
            ) : null}
          </div>

          <div className="skill-store-summary">
            {loading && skills.length === 0
              ? t("skill.list.loading")
              : t("skillStore.summary", { installed: installedSkillCount, total: skills.length })}
          </div>

          {error ? (
            <div className="skill-store-error">
              <AlertCircle size={13} strokeWidth={2} />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="skill-store-list">
            {skills.length === 0 && !loading ? (
              <div className="skill-store-hint">{t("skill.list.empty")}</div>
            ) : visibleSkills.length === 0 && !loading ? (
              <div className="skill-store-hint">
                {t("skillStore.noMatch", { query: deferredQuery.trim() })}
              </div>
            ) : (
              visibleSkills.map((skill) => (
                <SkillStoreRow
                  key={skill.path}
                  skill={skill}
                  installedMap={installedMap}
                  busyKey={busyKey}
                  onToggle={handleToggle}
                />
              ))
            )}
          </div>
        </>
      )}

      {conflict ? (
        <SkillConflictDialog
          conflict={conflict.info}
          onChoose={handleConflictChoice}
          onClose={() => handleConflictChoice("cancel")}
        />
      ) : null}
    </div>
  );
}
