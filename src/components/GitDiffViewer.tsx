import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Columns2, FileCode, Rows3, X } from "lucide-react";
import { DiffFileBlock } from "./git-diff/DiffFileBlock";
import { parseDiff, plural } from "./git-diff/parse";
import type { DiffViewMode } from "./git-diff/types";
import { load, save } from "../utils";
import s from "../styles";

const VIEW_MODE_KEY = "nezha.diffViewMode";

interface Props {
  projectPath: string;
  // "commit" = full commit diff, "file" = working-tree file diff, "commit-file" = single file in a commit
  mode: "commit" | "file" | "commit-file";
  commitHash?: string;
  filePath?: string;
  staged?: boolean;
  title: string;
  onClose: () => void;
}

function ViewToggleButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      style={{
        ...s.diffToggleBtn,
        background: active ? "var(--control-active-bg)" : "transparent",
        color: active ? "var(--control-active-fg)" : "var(--text-hint)",
      }}
    >
      {children}
    </button>
  );
}

export function GitDiffViewer({
  projectPath,
  mode,
  commitHash,
  filePath,
  staged,
  title,
  onClose,
}: Props) {
  const [diff, setDiff] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<DiffViewMode>(() =>
    load<DiffViewMode>(VIEW_MODE_KEY, "unified"),
  );

  useEffect(() => {
    save(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const loadDiff = async () => {
      try {
        let result: string;
        if (mode === "commit" && commitHash) {
          result = await invoke<string>("git_show_diff", { projectPath, commitHash });
        } else if (mode === "commit-file" && commitHash && filePath !== undefined) {
          result = await invoke<string>("git_show_file_diff", {
            projectPath,
            commitHash,
            filePath,
          });
        } else if (mode === "file" && filePath !== undefined) {
          result = await invoke<string>("git_file_diff", {
            projectPath,
            filePath,
            staged: staged ?? false,
          });
        } else {
          result = "";
        }
        setDiff(result);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };

    loadDiff();
  }, [projectPath, mode, commitHash, filePath, staged]);

  const { parsedFiles, totalAdditions, totalDeletions } = useMemo(() => {
    const files = parseDiff(diff, projectPath);
    let add = 0;
    let del = 0;
    for (const f of files) {
      add += f.additions;
      del += f.deletions;
    }
    return { parsedFiles: files, totalAdditions: add, totalDeletions: del };
  }, [diff, projectPath]);

  return (
    <div style={s.diffViewer}>
      <div style={s.diffHeader}>
        <FileCode size={15} color="var(--text-muted)" />
        <div style={s.diffHeaderTitleWrap}>
          <div style={s.diffHeaderTitle}>{title}</div>
          <div style={s.diffHeaderMeta}>
            <span>{plural(parsedFiles.length, "changed file")}</span>
            <span style={s.diffAddCount}>+{totalAdditions}</span>
            <span style={s.diffDeleteCount}>-{totalDeletions}</span>
          </div>
        </div>

        <div style={s.diffViewToggle} role="group" aria-label="Diff view mode">
          <ViewToggleButton
            active={viewMode === "unified"}
            title="Single column diff"
            onClick={() => setViewMode("unified")}
          >
            <Rows3 size={15} />
          </ViewToggleButton>
          <ViewToggleButton
            active={viewMode === "split"}
            title="Two column diff"
            onClick={() => setViewMode("split")}
          >
            <Columns2 size={15} />
          </ViewToggleButton>
        </div>

        <button
          type="button"
          onClick={onClose}
          title="Close diff"
          aria-label="Close diff"
          style={s.diffCloseBtn}
        >
          <X size={15} />
        </button>
      </div>

      <div style={s.diffContent}>
        {loading ? (
          <div style={s.diffStateMessage}>Loading diff…</div>
        ) : error ? (
          <div style={s.diffStateError}>{error}</div>
        ) : diff.trim() === "" ? (
          <div style={s.diffStateMessage}>No changes</div>
        ) : (
          <div style={s.diffFileList}>
            {parsedFiles.map((file, index) => (
              <DiffFileBlock
                key={`${file.displayPath}-${index}`}
                file={file}
                viewMode={viewMode}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
