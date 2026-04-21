import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Project } from "../types";
import s from "../styles";

interface DayStats {
  date: string;
  task_count: number;
  done_count: number;
  token_count: number;
}

interface ProjectAnalytics {
  project_id: string;
  project_name: string;
  task_count: number;
  done_count: number;
  token_count: number;
  tool_calls: number;
}

interface WeeklyAnalytics {
  daily: DayStats[];
  total_tasks: number;
  done_tasks: number;
  failed_tasks: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tool_calls: number;
  total_duration_secs: number;
  claude_tasks: number;
  codex_tasks: number;
  projects: ProjectAnalytics[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function heatmapColor(count: number): string {
  if (count === 0) return "var(--bg-card)";
  if (count === 1) return "color-mix(in srgb, var(--accent) 22%, var(--bg-card))";
  if (count <= 3) return "color-mix(in srgb, var(--accent) 44%, var(--bg-card))";
  if (count <= 6) return "color-mix(in srgb, var(--accent) 68%, var(--bg-card))";
  return "var(--accent)";
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(secs)}s`;
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return DAY_LABELS[d.getDay()];
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().slice(0, 10);
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div style={s.statCard}>
      <div style={s.statValue}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  );
}

export function AnalyticsDashboard({ projects: _projects }: { projects: Project[] }) {
  const [data, setData] = useState<WeeklyAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<WeeklyAnalytics>("get_weekly_analytics")
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ ...s.analyticsPane, alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ ...s.analyticsPane, alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{error ?? "No data"}</div>
      </div>
    );
  }

  const totalTokens = data.total_input_tokens + data.total_output_tokens;
  const successRate =
    data.total_tasks > 0 ? Math.round((data.done_tasks / data.total_tasks) * 100) : 0;
  const totalAgents = data.claude_tasks + data.codex_tasks;
  const claudePct = totalAgents > 0 ? Math.round((data.claude_tasks / totalAgents) * 100) : 0;
  const codexPct = totalAgents > 0 ? 100 - claudePct : 0;

  return (
    <div style={s.analyticsPane}>
      <div style={s.analyticsHeader}>Last 7 Days</div>
      <div style={s.analyticsSubtitle}>Vibecoding activity overview</div>

      {/* Heatmap */}
      <div style={s.heatmapRow}>
        {data.daily.map((day) => (
          <div
            key={day.date}
            style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
          >
            <div
              style={{
                ...s.heatmapCell,
                background: heatmapColor(day.task_count),
                boxShadow: isToday(day.date) ? "0 0 0 2px var(--accent)" : undefined,
                transform: day.task_count > 0 ? "scale(1.04)" : undefined,
              }}
              title={`${day.date}: ${day.task_count} tasks`}
            />
            <div
              style={{
                ...s.heatmapLabel,
                fontWeight: isToday(day.date) ? 700 : 400,
                color: isToday(day.date) ? "var(--text-secondary)" : "var(--text-hint)",
              }}
            >
              {getDayLabel(day.date)}
            </div>
            <div
              style={{
                ...s.heatmapLabel,
                color: day.task_count > 0 ? "var(--text-secondary)" : "var(--text-hint)",
                fontWeight: day.task_count > 0 ? 600 : 400,
              }}
            >
              {day.task_count > 0 ? day.task_count : "·"}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
        <span style={{ fontSize: 11, color: "var(--text-hint)" }}>Less</span>
        {[0, 1, 3, 5, 8].map((n) => (
          <div
            key={n}
            style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              background: heatmapColor(n),
              border: "1px solid var(--border-dim)",
            }}
          />
        ))}
        <span style={{ fontSize: 11, color: "var(--text-hint)" }}>More</span>
      </div>

      <div style={s.analyticsDivider} />

      {/* Stat cards */}
      <div style={s.statGrid}>
        <StatCard value={String(data.total_tasks)} label="Total Tasks" />
        <StatCard value={`${successRate}%`} label="Success Rate" />
        <StatCard value={formatTokens(totalTokens)} label="Total Tokens" />
        <StatCard value={String(data.total_tool_calls)} label="Tool Calls" />
      </div>

      {/* Agent + project row */}
      <div style={s.analyticsRow}>
        {/* Agent distribution */}
        <div style={s.analyticsCard}>
          <div style={s.analyticsCardTitle}>Agent Distribution</div>
          {totalAgents === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-hint)" }}>No data</div>
          ) : (
            <div style={s.agentBarWrap}>
              <div style={s.agentBarRow}>
                <div style={s.agentBarMeta}>
                  <span>Claude Code</span>
                  <span>
                    {data.claude_tasks} tasks ({claudePct}%)
                  </span>
                </div>
                <div style={s.agentBarTrack}>
                  <div
                    style={{
                      ...s.agentBarFill,
                      width: `${claudePct}%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>
              </div>
              <div style={s.agentBarRow}>
                <div style={s.agentBarMeta}>
                  <span>Codex</span>
                  <span>
                    {data.codex_tasks} tasks ({codexPct}%)
                  </span>
                </div>
                <div style={s.agentBarTrack}>
                  <div
                    style={{ ...s.agentBarFill, width: `${codexPct}%`, background: "var(--usage-codex)" }}
                  />
                </div>
              </div>
              {data.total_duration_secs > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
                  Total duration:{" "}
                  <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
                    {formatDuration(data.total_duration_secs)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Project ranking */}
        <div style={s.analyticsCard}>
          <div style={s.analyticsCardTitle}>Project Ranking</div>
          {data.projects.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-hint)" }}>No data</div>
          ) : (
            <div style={s.projectRankList}>
              {data.projects.slice(0, 5).map((p, i) => {
                const ratio = Math.round(
                  (p.task_count / (data.projects[0]?.task_count || 1)) * 100,
                );
                return (
                  <div
                    key={p.project_id}
                    style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "5px 8px",
                      borderRadius: 6,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${ratio}%`,
                        background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                        borderRadius: 6,
                        pointerEvents: "none",
                      }}
                    />
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-hint)",
                        width: 14,
                        flexShrink: 0,
                        fontWeight: 600,
                        zIndex: 1,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span style={{ ...s.projectRankName, zIndex: 1 }}>{p.project_name}</span>
                    <span style={{ ...s.projectRankCount, zIndex: 1 }}>{p.task_count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
