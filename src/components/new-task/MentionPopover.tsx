import { FileCode2, FileText, FolderOpen, ChevronRight } from "lucide-react";
import type { Project } from "../../types";
import { CODE_EXTS } from "../../utils";
import { useI18n } from "../../i18n";
import s from "../../styles";

export interface FileEntry {
  name: string;
  path: string;
  dir: string;
  ext: string;
}

export type CrossProjectRef = { id: string; path: string; name: string };

export type MentionItem =
  | { kind: "file"; file: FileEntry; crossProject?: CrossProjectRef }
  | { kind: "project"; project: Project };

export function MentionPopover({
  mentionSearch,
  mentionItems,
  mentionIndex,
  filesLoading,
  isCrossMode,
  isCrossLoading,
  activeCrossProject,
  onSelectFile,
  onSelectProject,
  onSetMentionIndex,
}: {
  mentionSearch: string;
  mentionItems: MentionItem[];
  mentionIndex: number;
  filesLoading: boolean;
  isCrossMode: boolean;
  isCrossLoading: boolean;
  activeCrossProject: CrossProjectRef | null;
  onSelectFile: (file: FileEntry, crossProject?: CrossProjectRef) => void;
  onSelectProject: (project: Project) => void;
  onSetMentionIndex: (index: number) => void;
}) {
  const { t } = useI18n();
  const fileItems = mentionItems.filter(
    (m): m is Extract<MentionItem, { kind: "file" }> => m.kind === "file",
  );
  const projectItems = mentionItems.filter(
    (m): m is Extract<MentionItem, { kind: "project" }> => m.kind === "project",
  );

  return (
    <div style={s.mentionDropdown}>
      {/* Cross-project header */}
      {isCrossMode && activeCrossProject && (
        <div style={s.mentionCrossHeader}>
          <FolderOpen size={12} />
          <span>{activeCrossProject.name}</span>
          <ChevronRight size={10} style={{ opacity: 0.5 }} />
          <span style={{ opacity: 0.6 }}>
            {mentionSearch.substring(mentionSearch.indexOf("/") + 1) || t("mention.allFiles")}
          </span>
        </div>
      )}

      {/* Loading */}
      {(filesLoading && !isCrossMode) || isCrossLoading ? (
        <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-hint)" }}>
          {t("mention.loadingFiles")}
        </div>
      ) : null}

      {/* File items */}
      {!isCrossLoading &&
        fileItems.map((item, i) => (
          <div
            key={(item.crossProject?.id ?? "") + item.file.path}
            style={{
              ...s.mentionOption,
              background: i === mentionIndex ? "var(--accent-subtle)" : "transparent",
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelectFile(item.file, item.crossProject);
            }}
            onMouseEnter={() => onSetMentionIndex(i)}
          >
            <span style={{ color: "var(--accent)", flexShrink: 0, display: "flex" }}>
              {CODE_EXTS.has(item.file.ext) ? <FileCode2 size={12} /> : <FileText size={12} />}
            </span>
            <span style={s.mentionOptionName}>{item.file.name}</span>
            {item.file.dir && <span style={s.mentionOptionDir}>{item.file.dir}</span>}
          </div>
        ))}

      {/* Empty state */}
      {!filesLoading &&
        !isCrossLoading &&
        fileItems.length === 0 &&
        !isCrossMode &&
        projectItems.length === 0 && (
          <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-hint)" }}>
            {mentionSearch
              ? t("mention.noResults", { query: mentionSearch })
              : t("mention.startTyping")}
          </div>
        )}
      {!isCrossLoading && isCrossMode && fileItems.length === 0 && (
        <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-hint)" }}>
          {mentionSearch.substring(mentionSearch.indexOf("/") + 1)
            ? t("mention.noFilesMatching", {
                query: mentionSearch.substring(mentionSearch.indexOf("/") + 1),
              })
            : t("mention.startTyping")}
        </div>
      )}

      {/* Other projects separator + entries */}
      {!isCrossMode && projectItems.length > 0 && (
        <>
          {fileItems.length > 0 && (
            <div style={{ height: 1, background: "var(--border-dim)", margin: "3px 6px" }} />
          )}
          <div style={s.mentionSeparator}>
            <FolderOpen size={10} />
            <span>{t("mention.otherProjects")}</span>
          </div>
          {projectItems.map((item, pi) => {
            const globalIdx = fileItems.length + pi;
            return (
              <div
                key={item.project.id}
                style={{
                  ...s.mentionProjectItem,
                  background: globalIdx === mentionIndex ? "var(--accent-subtle)" : "transparent",
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelectProject(item.project);
                }}
                onMouseEnter={() => onSetMentionIndex(globalIdx)}
              >
                <span style={{ color: "var(--text-muted)", flexShrink: 0, display: "flex" }}>
                  <FolderOpen size={12} />
                </span>
                <span style={{ ...s.mentionOptionName, color: "var(--text-primary)" }}>
                  {item.project.name}
                </span>
                <span style={s.mentionOptionDir}>{item.project.path}</span>
                <ChevronRight
                  size={11}
                  style={{ color: "var(--text-hint)", flexShrink: 0, marginLeft: "auto" }}
                />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
