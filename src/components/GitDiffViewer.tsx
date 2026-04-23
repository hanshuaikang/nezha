import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, FileCode } from "lucide-react";

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

function DiffLine({ line }: { line: string }) {
  let bg = "transparent";
  let color = "var(--text-secondary)";

  if (line.startsWith("+") && !line.startsWith("+++")) {
    bg = "var(--diff-add-bg)";
    color = "var(--diff-add-fg)";
  } else if (line.startsWith("-") && !line.startsWith("---")) {
    bg = "var(--diff-delete-bg)";
    color = "var(--diff-delete-fg)";
  } else if (line.startsWith("@@")) {
    bg = "var(--diff-hunk-bg)";
    color = "var(--diff-hunk-fg)";
  } else if (
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("---") ||
    line.startsWith("+++")
  ) {
    color = "var(--text-hint)";
  }

  return (
    <div
      style={{
        display: "flex",
        background: bg,
        fontFamily: "var(--font-mono, 'Menlo', monospace)",
        fontSize: 12,
        lineHeight: "18px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
      }}
    >
      <span
        style={{
          color,
          padding: "0 12px",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        {line || " "}
      </span>
    </div>
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

  useEffect(() => {
    setLoading(true);
    setError(null);

    const load = async () => {
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

    load();
  }, [projectPath, mode, commitHash, filePath, staged]);

  const lines = diff.split("\n");

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--bg-panel)",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 40,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
          borderBottom: "1px solid var(--border-dim)",
          flexShrink: 0,
          background: "var(--bg-panel)",
        }}
      >
        <FileCode size={14} color="var(--text-muted)" />
        <span
          style={{
            flex: 1,
            fontSize: 12.5,
            fontWeight: 500,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            borderRadius: 4,
            color: "var(--text-hint)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
        {loading ? (
          <div
            style={{ padding: 24, color: "var(--text-hint)", fontSize: 13, textAlign: "center" }}
          >
            Loading diff…
          </div>
        ) : error ? (
          <div style={{ padding: 24, color: "var(--danger)", fontSize: 13 }}>{error}</div>
        ) : diff.trim() === "" ? (
          <div
            style={{ padding: 24, color: "var(--text-hint)", fontSize: 13, textAlign: "center" }}
          >
            No changes
          </div>
        ) : (
          <div style={{ minWidth: "100%" }}>
            {lines.map((line, i) => (
              <DiffLine key={i} line={line} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
