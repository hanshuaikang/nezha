import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, AlertCircle, XCircle, RefreshCw } from "lucide-react";

import { useI18n } from "../../i18n";
import s from "../../styles";
import type { HookAgentReadiness, HookInstallStatus } from "./types";

type ActionState = "idle" | "installing" | "uninstalling";

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: 5,
  display: "block",
};

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-hint)",
  marginTop: 3,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  padding: "6px 0",
  fontSize: 12,
  color: "var(--text-primary)",
  lineHeight: 1.5,
};

const btnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid var(--border-default)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  cursor: "pointer",
};

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

  // 已安装 + 有 node 后,额外展示版本是否达到 hook 门槛(生效 / 已回退轮询)。
  const renderVersionLine = (agentKey: "claude" | "codex", installed: boolean) => {
    const r = readiness.find((x) => x.agent === agentKey);
    if (!r || !installed || r.reason === "no_node" || r.reason === "not_installed") {
      return null;
    }
    const agentName = agentKey === "claude" ? "Claude Code" : "Codex";
    const ok = r.usable;
    return (
      <div style={{ ...rowStyle, paddingTop: 0, color: "var(--text-secondary)" }}>
        <span style={{ width: 14, display: "inline-block" }} />
        <span style={{ color: ok ? undefined : "var(--warning)" }}>
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
    <div
      style={{
        ...s.settingsBody,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "20px",
      }}
    >
      <div>
        <label style={labelStyle}>{t("appSettings.hooks")}</label>
        <p style={hintStyle}>{t("appSettings.hooks.description")}</p>
      </div>

      <div
        style={{
          border: "1px solid var(--border-default)",
          borderRadius: 8,
          padding: "10px 14px",
          background: "var(--bg-elevated)",
        }}
      >
        <div style={rowStyle}>
          <StatusIcon ok={nodeOk} />
          <span>
            {nodeOk
              ? t("appSettings.hooks.nodeFound", { path: status!.node_path })
              : t("appSettings.hooks.nodeMissing")}
          </span>
        </div>
        {status?.script_path ? (
          <div style={{ ...rowStyle, color: "var(--text-secondary)" }}>
            <span style={{ width: 14, display: "inline-block" }} />
            <span>{t("appSettings.hooks.scriptPath", { path: status.script_path })}</span>
          </div>
        ) : null}
        <div style={rowStyle}>
          <StatusIcon ok={!!status?.claude_installed} />
          <span>
            {status?.claude_installed
              ? t("appSettings.hooks.claudeInstalled")
              : t("appSettings.hooks.claudeMissing")}
          </span>
        </div>
        {renderVersionLine("claude", !!status?.claude_installed)}
        <div style={rowStyle}>
          <StatusIcon ok={!!status?.codex_installed} />
          <span>
            {status?.codex_installed
              ? t("appSettings.hooks.codexInstalled")
              : t("appSettings.hooks.codexMissing")}
          </span>
        </div>
        {renderVersionLine("codex", !!status?.codex_installed)}
        {status?.error ? (
          <div style={{ ...rowStyle, color: "var(--accent-danger, #d1242f)" }}>
            <AlertCircle size={14} />
            <span>{t("appSettings.hooks.error", { message: status.error })}</span>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={btnStyle} disabled={busy} onClick={reinstall}>
          <RefreshCw size={12} />
          {action === "installing"
            ? t("appSettings.hooks.installing")
            : t("appSettings.hooks.reinstall")}
        </button>
        <button
          style={btnStyle}
          disabled={busy || (!status?.claude_installed && !status?.codex_installed)}
          onClick={uninstall}
        >
          {action === "uninstalling"
            ? t("appSettings.hooks.uninstalling")
            : t("appSettings.hooks.uninstall")}
        </button>
        <button style={btnStyle} disabled={busy} onClick={refresh}>
          {t("appSettings.hooks.refresh")}
        </button>
      </div>
    </div>
  );
}
