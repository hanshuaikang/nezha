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

const MINUTES_PER_DAY = 24 * 60;

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

function formatWindowLabel(minutes: number, t: TranslateFn): string {
  if (minutes >= MINUTES_PER_DAY && minutes % MINUTES_PER_DAY === 0) {
    return t("usage.windowDays", { days: minutes / MINUTES_PER_DAY });
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    return t("usage.windowHours", { hours: minutes / 60 });
  }
  return t("usage.windowMinutes", { minutes });
}

interface UsageMetric {
  fallbackLabel: string;
  window?: UsageWindow | null;
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
  metrics: UsageMetric[];
}) {
  const { t } = useI18n();
  const metricLabel = (metric: UsageMetric) =>
    metric.window?.windowMinutes != null
      ? formatWindowLabel(metric.window.windowMinutes, t)
      : metric.fallbackLabel;
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
                <UsageMetricRow
                  key={metric.fallbackLabel}
                  label={metricLabel(metric)}
                  window={metric.window}
                />
              ) : (
                <div key={metric.fallbackLabel} style={s.usageMetricRow}>
                  <span style={s.usageMetricLabel}>{metric.fallbackLabel}</span>
                  <span style={s.usageMetricMeta}>{t("usage.windowInactive")}</span>
                </div>
              ),
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

  const claudeMetrics = useMemo<UsageMetric[]>(() => {
    const data = snapshot?.claude.status === "available" ? snapshot.claude.data : null;
    return [
      { fallbackLabel: t("usage.fiveHour"), window: data?.fiveHour ?? null },
      { fallbackLabel: t("usage.sevenDay"), window: data?.sevenDay ?? null },
    ];
  }, [snapshot, t]);

  const codexMetrics = useMemo<UsageMetric[]>(() => {
    const data = snapshot?.codex.status === "available" ? snapshot.codex.data : null;
    return [
      { fallbackLabel: t("usage.fiveHour"), window: data?.primary ?? null },
      { fallbackLabel: t("usage.sevenDay"), window: data?.secondary ?? null },
    ];
  }, [snapshot, t]);

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
