import { useMemo } from "react";
import { Clock } from "lucide-react";
import type { Project, Task } from "../types";
import { ProjectAvatar } from "./ProjectAvatar";
import { StatusIcon } from "./StatusIcon";
import { useI18n, pluralKey } from "../i18n";
import s from "../styles";

type Bucket = "today" | "yesterday" | "earlier";

interface ProjectGroup {
  projectId: string;
  tasks: Task[];
  latestAt: number;
}

interface TimelineGroup {
  bucket: Bucket;
  projects: ProjectGroup[];
  totalCount: number;
}

function startOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function bucketFor(createdAt: number, now: Date): Bucket {
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  if (createdAt >= todayStart) return "today";
  if (createdAt >= yesterdayStart) return "yesterday";
  return "earlier";
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function taskTitle(task: Task): string {
  if (task.name && task.name.trim()) return task.name;
  const prompt = task.prompt.trim();
  return prompt.length > 0 ? prompt.split("\n")[0] : "(untitled)";
}

function TimelineRow({ task, onClick }: { task: Task; onClick: () => void }) {
  const additions = task.additions ?? 0;
  const deletions = task.deletions ?? 0;
  const hasDiff = additions > 0 || deletions > 0;

  return (
    <button type="button" style={s.timelineRow} onClick={onClick}>
      <span style={s.timelineRowTime}>{formatTime(task.createdAt)}</span>
      <span style={s.timelineRowStatus}>
        <StatusIcon status={task.status} />
      </span>
      <div style={s.timelineRowMain}>
        <div style={s.timelineRowTitle}>{taskTitle(task)}</div>
        <div style={s.timelineRowMeta}>
          <span>{task.agent}</span>
          {hasDiff ? (
            <>
              <span style={s.timelineRowMetaSep}>·</span>
              <span style={s.timelineRowDiff}>
                <span style={s.timelineRowDiffAdd}>+{additions}</span>{" "}
                <span style={s.timelineRowDiffDel}>-{deletions}</span>
              </span>
            </>
          ) : null}
        </div>
      </div>
    </button>
  );
}

export function TimelineView({
  projects,
  tasks,
  onTaskClick,
}: {
  projects: Project[];
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}) {
  const { t } = useI18n();

  const projectById = useMemo(() => {
    const map = new Map<string, Project>();
    projects.forEach((p) => map.set(p.id, p));
    return map;
  }, [projects]);

  const groups = useMemo<TimelineGroup[]>(() => {
    const now = new Date();
    const cutoff = startOfDay(now) - 6 * 24 * 60 * 60 * 1000;
    const byBucket: Record<Bucket, Map<string, Task[]>> = {
      today: new Map(),
      yesterday: new Map(),
      earlier: new Map(),
    };
    const sorted = [...tasks]
      .filter((task) => task.createdAt >= cutoff)
      .sort((a, b) => b.createdAt - a.createdAt);
    for (const task of sorted) {
      const bucket = bucketFor(task.createdAt, now);
      const map = byBucket[bucket];
      const list = map.get(task.projectId);
      if (list) list.push(task);
      else map.set(task.projectId, [task]);
    }
    const buildGroup = (bucket: Bucket): TimelineGroup | null => {
      const map = byBucket[bucket];
      if (map.size === 0) return null;
      const projects: ProjectGroup[] = [];
      let total = 0;
      map.forEach((projectTasks, projectId) => {
        total += projectTasks.length;
        projects.push({
          projectId,
          tasks: projectTasks,
          latestAt: projectTasks[0]?.createdAt ?? 0,
        });
      });
      projects.sort((a, b) => b.latestAt - a.latestAt);
      return { bucket, projects, totalCount: total };
    };
    return [buildGroup("today"), buildGroup("yesterday"), buildGroup("earlier")].filter(
      (g): g is TimelineGroup => g !== null,
    );
  }, [tasks]);

  const titleFor = (bucket: Bucket): string =>
    bucket === "today"
      ? t("timeline.today")
      : bucket === "yesterday"
        ? t("timeline.yesterday")
        : t("timeline.earlier");

  return (
    <div style={s.timelinePane}>
      <div style={s.timelineHeader}>{t("timeline.title")}</div>
      <div style={s.timelineSubtitle}>{t("timeline.subtitle")}</div>
      {groups.length === 0 ? (
        <div style={s.timelineEmpty}>
          <Clock size={28} strokeWidth={1.2} color="var(--text-hint)" />
          <div>{t("timeline.empty")}</div>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.bucket} style={s.timelineGroup}>
            <header style={s.timelineGroupHeader}>
              <span style={s.timelineGroupTitle}>{titleFor(group.bucket)}</span>
              <span style={s.timelineGroupCount}>
                {t(
                  pluralKey(
                    "timeline.taskCount",
                    "timeline.taskCountPlural",
                    group.totalCount,
                  ),
                  { count: group.totalCount },
                )}
              </span>
            </header>
            {group.projects.map((projectGroup) => {
              const project = projectById.get(projectGroup.projectId);
              return (
                <div key={projectGroup.projectId} style={s.timelineProjectBlock}>
                  <div style={s.timelineProjectHeader}>
                    {project ? <ProjectAvatar name={project.name} size={18} /> : null}
                    <span style={s.timelineProjectName}>
                      {project?.name ?? projectGroup.projectId}
                    </span>
                    <span style={s.timelineProjectCount}>
                      {t(
                        pluralKey(
                          "timeline.taskCount",
                          "timeline.taskCountPlural",
                          projectGroup.tasks.length,
                        ),
                        { count: projectGroup.tasks.length },
                      )}
                    </span>
                  </div>
                  <div style={s.timelineList}>
                    {projectGroup.tasks.map((task) => (
                      <TimelineRow
                        key={task.id}
                        task={task}
                        onClick={() => onTaskClick(task)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}
