import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, AlertCircle, XCircle, RefreshCw } from "lucide-react";

import { useI18n } from "../../i18n";
import s from "../../styles";
import type { HookAgentReadiness, HookInstallStatus } from "./types";

type ActionState = "idle" | "installing" | "uninstalling";

function StatusIcon({ ok, color }: { ok: boolean; color?: string }) {
  if (ok) {
    return <CheckCircle2 size={14} color={color ?? "var(--accent-success, #2ea043)"} />;
  }
  return <XCircle size={14} color={color ?? "var(--text-hint)"} />;
}

export function HooksPanel() {
  const { t } = useI18n();
  const [status, setStatus] = useState<HookInstallStatus | null>(null);
  const [readiness, setReadiness] = useState<HookAgentReadiness[]>([]);
  const [action, setAction] = useState<ActionState>("idle");

  const refresh = useCallback(async () => {
    invoke<HookAgentReadiness[]>("get_hook_readiness")
      .then(setReadiness)
      .catch(() => setReadiness([]));
    try {
      const next = await invoke<HookInstallStatus>("get_hook_status");
      setStatus(next);
    } catch (err) {
      setStatus({
        node_path: "",
        script_path: "",
        claude_installed: false,
        codex_installed: false,
        error: String(err),
      });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const reinstall = useCallback(async () => {
    setAction("installing");
    try {
      const next = await invoke<HookInstallStatus>("install_hooks");
      setStatus(next);
      invoke<HookAgentReadiness[]>("get_hook_readiness")
        .then(setReadiness)
        .catch(() => setReadiness([]));
    } catch (err) {
      setStatus((prev) => ({
        node_path: prev?.node_path ?? "",
        script_path: prev?.script_path ?? "",
        claude_installed: false,
        codex_installed: false,
        error: String(err),
      }));
    } finally {
      setAction("idle");
    }
  }, []);

  const uninstall = useCallback(async () => {
    setAction("uninstalling");
    try {
      await invoke("uninstall_hooks");
      await refresh();
    } finally {
      setAction("idle");
    }
  }, [refresh]);

  const nodeOk = !!status?.node_path;
  const busy = action !== "idle";
  const uninstallDisabled = busy || (!status?.claude_installed && !status?.codex_installed);

  // 已安装 + 有 node 后,额外展示版本是否达到 hook 门槛(生效 / 已回退轮询)。
  const renderVersionLine = (agentKey: "claude" | "codex", installed: boolean) => {
    const r = readiness.find((x) => x.agent === agentKey);
    if (!r || !installed || r.reason === "no_node" || r.reason === "not_installed") {
      return null;
    }
    const agentName = agentKey === "claude" ? "Claude Code" : "Codex";
    const ok = r.usable;
    return (
      <div style={s.hooksPanelSubRow}>
        <span style={s.hooksPanelRowSpacer} />
        <span style={ok ? undefined : s.hooksPanelVersionLow}>
          {ok
            ? t("appSettings.hooks.effective", {
                agent: agentName,
                detected: r.detectedVersion,
                min: r.minVersion,
              })
            : t("appSettings.hooks.versionLow", {
                agent: agentName,
                detected: r.detectedVersion || "—",
                min: r.minVersion,
              })}
        </span>
      </div>
    );
  };

  return (
    <div style={s.hooksPanelBody}>
      <div>
        <label style={s.hooksPanelLabel}>{t("appSettings.hooks")}</label>
        <p style={s.hooksPanelHint}>{t("appSettings.hooks.description")}</p>
      </div>

      <div style={s.hooksPanelCard}>
        <div style={s.hooksPanelRow}>
          <StatusIcon ok={nodeOk} />
          <span>
            {nodeOk
              ? t("appSettings.hooks.nodeFound", { path: status!.node_path })
              : t("appSettings.hooks.nodeMissing")}
          </span>
        </div>
        {status?.script_path ? (
          <div style={s.hooksPanelSubRow}>
            <span style={s.hooksPanelRowSpacer} />
            <span>{t("appSettings.hooks.scriptPath", { path: status.script_path })}</span>
          </div>
        ) : null}
        <div style={s.hooksPanelRow}>
          <StatusIcon ok={!!status?.claude_installed} />
          <span>
            {status?.claude_installed
              ? t("appSettings.hooks.claudeInstalled")
              : t("appSettings.hooks.claudeMissing")}
          </span>
        </div>
        {renderVersionLine("claude", !!status?.claude_installed)}
        <div style={s.hooksPanelRow}>
          <StatusIcon ok={!!status?.codex_installed} />
          <span>
            {status?.codex_installed
              ? t("appSettings.hooks.codexInstalled")
              : t("appSettings.hooks.codexMissing")}
          </span>
        </div>
        {renderVersionLine("codex", !!status?.codex_installed)}
        {status?.error ? (
          <div style={s.hooksPanelErrorRow}>
            <AlertCircle size={14} />
            <span>{t("appSettings.hooks.error", { message: status.error })}</span>
          </div>
        ) : null}
      </div>

      <div style={s.hooksPanelActions}>
        <button
          style={busy ? { ...s.hooksPanelPrimaryBtn, ...s.hooksPanelBtnDisabled } : s.hooksPanelPrimaryBtn}
          disabled={busy}
          onClick={reinstall}
        >
          <RefreshCw size={12} />
          {action === "installing"
            ? t("appSettings.hooks.installing")
            : t("appSettings.hooks.reinstall")}
        </button>
        <button
          style={
            uninstallDisabled ? { ...s.hooksPanelDangerBtn, ...s.hooksPanelBtnDisabled } : s.hooksPanelDangerBtn
          }
          disabled={uninstallDisabled}
          onClick={uninstall}
        >
          {action === "uninstalling"
            ? t("appSettings.hooks.uninstalling")
            : t("appSettings.hooks.uninstall")}
        </button>
        <button
          style={busy ? { ...s.hooksPanelSecondaryBtn, ...s.hooksPanelBtnDisabled } : s.hooksPanelSecondaryBtn}
          disabled={busy}
          onClick={refresh}
        >
          {t("appSettings.hooks.refresh")}
        </button>
      </div>
    </div>
  );
}
