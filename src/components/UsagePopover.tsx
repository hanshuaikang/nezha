import { useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Activity } from "lucide-react";
import type { ClaudeUsageData, CodexUsageData, UsageSource, UsageWindow } from "../types";
import { useUsageSnapshot } from "../hooks/useUsageSnapshot";
import { getUsageColor } from "../utils";
import { useI18n } from "../i18n";
import s from "../styles";

function formatResetTime(resetAt?: number | null): string | null {
  if (!resetAt) return null;
  const date = new Date(resetAt * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function UsageMetricRow({ label, window }: { label: string; window: UsageWindow }) {
  const { t } = useI18n();
  const color = getUsageColor(window.remainingPercent);
  const resetLabel = formatResetTime(window.resetAt);

  return (
    <div style={s.usageMetricRow}>
      <span style={s.usageMetricLabel}>{label}</span>
      <span style={{ ...s.usageMetricValue, color }}>
        {window.remainingPercent}{t("usage.left")}
      </span>
      {resetLabel && <span style={s.usageMetricMeta}>{resetLabel}</span>}
    </div>
  );
}

function SourceCard<T>({
  title,
  subtitle,
  source,
  metrics,
}: {
  title: string;
  subtitle?: string | null;
  source: UsageSource<T>;
  metrics: Array<{ label: string; window?: UsageWindow | null }>;
}) {
  const { t } = useI18n();
  return (
    <section style={s.usageSourceSection}>
      <div style={s.usageSourceHead}>
        <div style={s.usageSourceTitle}>{title}</div>
        {subtitle ? <div style={s.usageSourceSubtitle}>{subtitle}</div> : null}
      </div>

      {source.status === "unavailable" ? (
        <div style={s.usageUnavailableText}>{source.reason}</div>
      ) : (
        <div style={s.usageMetricList}>
          {metrics.some((metric) => metric.window) ? (
            metrics.map((metric) =>
              metric.window ? (
                <UsageMetricRow key={metric.label} label={metric.label} window={metric.window} />
              ) : null,
            )
          ) : (
            <div style={s.usageUnavailableText}>{t("usage.noWindows")}</div>
          )}
        </div>
      )}
    </section>
  );
}

function codexSubtitle(source: UsageSource<CodexUsageData>): string | null {
  if (source.status !== "available") return null;
  const parts = [source.data.planType, source.data.email].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function UsagePopover() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { snapshot, loading, error } = useUsageSnapshot(open);

  const claudeMetrics = useMemo(
    () => [
      {
        label: t("usage.fiveHour"),
        window: snapshot?.claude.status === "available" ? snapshot.claude.data.fiveHour : null,
      },
      {
        label: t("usage.sevenDay"),
        window: snapshot?.claude.status === "available" ? snapshot.claude.data.sevenDay : null,
      },
    ],
    [snapshot, t],
  );

  const codexMetrics = useMemo(
    () => [
      {
        label: t("usage.fiveHour"),
        window: snapshot?.codex.status === "available" ? snapshot.codex.data.primary : null,
      },
      {
        label: t("usage.sevenDay"),
        window: snapshot?.codex.status === "available" ? snapshot.codex.data.secondary : null,
      },
    ],
    [snapshot, t],
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button style={s.sidebarIconBtn} title={t("usage.title")}>
          <Activity size={14} strokeWidth={1.8} color="var(--text-hint)" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="start" sideOffset={8} style={s.usagePopoverContent}>
          <div style={s.usagePopoverHeader}>
            <div style={s.usagePopoverTitle}>{t("usage.title")}</div>
          </div>

          {loading ? (
            <div style={s.usageStatusText}>{t("usage.loading")}</div>
          ) : error ? (
            <div style={s.usageStatusText}>{t("usage.failed", { error })}</div>
          ) : snapshot ? (
            <div style={s.usageSourceList}>
              <SourceCard<ClaudeUsageData>
                title="Claude Code"
                source={snapshot.claude}
                metrics={claudeMetrics}
              />
              <SourceCard<CodexUsageData>
                title="Codex"
                subtitle={codexSubtitle(snapshot.codex)}
                source={snapshot.codex}
                metrics={codexMetrics}
              />
            </div>
          ) : (
            <div style={s.usageStatusText}>{t("usage.noDataYet")}</div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
