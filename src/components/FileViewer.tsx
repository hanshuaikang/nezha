import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { X, AlertCircle, Eye, PencilLine } from "lucide-react";
import { getFileColor } from "../utils";
import ReactCodeMirror, { EditorView } from "@uiw/react-codemirror";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { go } from "@codemirror/lang-go";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { css as langCss } from "@codemirror/lang-css";
import { html as langHtml } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { kotlin } from "@codemirror/legacy-modes/mode/clike";
import { r } from "@codemirror/legacy-modes/mode/r";
import type { Extension } from "@codemirror/state";
import { ImagePreviewPane } from "./file-viewer/ImagePreviewPane";

function isMarkdownFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext === "md" || ext === "mdx" || ext === "markdown";
}

function isPreviewableImageFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "gif" || ext === "webp" || ext === "bmp" || ext === "svg";
}

function getLanguageExtension(fileName: string): Extension {
  const nameMap: Record<string, () => Extension> = {
    dockerfile: () => StreamLanguage.define(dockerFile),
    "dockerfile.dev": () => StreamLanguage.define(dockerFile),
    "dockerfile.prod": () => StreamLanguage.define(dockerFile),
    makefile: () => StreamLanguage.define(shell),
    gnumakefile: () => StreamLanguage.define(shell),
    justfile: () => StreamLanguage.define(shell),
    gemfile: () => StreamLanguage.define(ruby),
    rakefile: () => StreamLanguage.define(ruby),
    vagrantfile: () => StreamLanguage.define(ruby),
    procfile: () => StreamLanguage.define(shell),
    "cmakelists.txt": () => StreamLanguage.define(shell),
    ".gitignore": () => StreamLanguage.define(shell),
    ".dockerignore": () => StreamLanguage.define(shell),
    ".env": () => StreamLanguage.define(shell),
    ".env.local": () => StreamLanguage.define(shell),
    ".env.example": () => StreamLanguage.define(shell),
    ".npmrc": () => StreamLanguage.define(toml),
    ".yarnrc": () => yaml(),
    "changelog.md": () => markdown(),
    readme: () => markdown(),
  };

  const lower = fileName.toLowerCase();
  if (nameMap[lower]) return nameMap[lower]();

  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "js":
    case "mjs":
    case "cjs":
      return javascript();
    case "jsx":
      return javascript({ jsx: true });
    case "json":
    case "jsonc":
      return json();
    case "rs":
      return rust();
    case "html":
    case "htm":
      return langHtml();
    case "css":
    case "scss":
    case "sass":
      return langCss();
    case "md":
    case "mdx":
      return markdown();
    case "yaml":
    case "yml":
      return yaml();
    case "toml":
      return StreamLanguage.define(toml);
    case "sh":
    case "bash":
    case "zsh":
    case "fish":
      return StreamLanguage.define(shell);
    case "py":
      return python();
    case "go":
      return go();
    case "java":
      return java();
    case "c":
    case "h":
      return cpp();
    case "cpp":
    case "cc":
    case "hpp":
      return cpp();
    case "sql":
      return sql();
    case "xml":
      return xml();
    case "swift":
      return StreamLanguage.define(swift);
    case "kt":
      return StreamLanguage.define(kotlin);
    case "rb":
      return StreamLanguage.define(ruby);
    case "lua":
      return StreamLanguage.define(lua);
    case "r":
      return StreamLanguage.define(r);
    case "proto":
      return StreamLanguage.define(shell);
    default:
      return [];
  }
}

const editorBaseTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    background: "var(--bg-panel)",
    "-webkit-user-select": "text",
    "user-select": "text",
  },
  ".cm-editor": {
    background: "var(--bg-panel)",
  },
  ".cm-scroller": {
    overflow: "auto",
    lineHeight: "1.6",
    background: "var(--bg-panel)",
    "-webkit-user-select": "text",
    "user-select": "text",
  },
  ".cm-content": {
    padding: "12px 0",
    caretColor: "var(--text-primary)",
    "-webkit-user-select": "text",
    "user-select": "text",
  },
  ".cm-gutters": {
    borderRight: "1px solid var(--border-dim)",
    background: "var(--bg-panel)",
    fontSize: "12px",
    minWidth: "44px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px 0 4px",
    color: "var(--text-hint)",
  },
  ".cm-activeLineGutter": {
    background: "rgba(128,128,128,0.06)",
  },
  ".cm-focused .cm-activeLine, .cm-activeLine": {
    background: "rgba(128,128,128,0.06)",
  },
});

type SaveStatus = "idle" | "saving" | "saved" | "error";
type ImagePreviewData = {
  dataUrl: string;
  mimeType: string;
  byteLength: number;
};

export function FileViewer({
  filePath,
  fileName,
  projectPath,
  onClose,
  isDark,
  onRunMakeTarget: _onRunMakeTarget,
}: {
  filePath: string;
  fileName: string;
  projectPath: string;
  onClose: () => void;
  isDark: boolean;
  onRunMakeTarget?: (target: string) => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<ImagePreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [previewMode, setPreviewMode] = useState(false);
  const isMarkdown = isMarkdownFile(fileName);
  const isPreviewableImage = isPreviewableImageFile(fileName);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setContent(null);
    setImagePreview(null);
    setError(null);
    setSaveStatus("idle");
    setPreviewMode(false);

    const loadFile = isPreviewableImage
      ? invoke<ImagePreviewData>("read_image_preview", { path: filePath, projectPath }).then((preview) => {
          if (cancelled) return;
          setImagePreview(preview);
          setLoading(false);
        })
      : invoke<string>("read_file_content", { path: filePath, projectPath }).then((nextContent) => {
          if (cancelled) return;
          setContent(nextContent);
          setLoading(false);
        });

    loadFile
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, projectPath, isPreviewableImage]);

  const handleChange = (value: string) => {
    setContent(value);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (savedResetRef.current) clearTimeout(savedResetRef.current);

    setSaveStatus("saving");
    saveTimerRef.current = setTimeout(async () => {
      try {
        await invoke("write_file_content", { path: filePath, content: value, projectPath });
        setSaveStatus("saved");
        savedResetRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("error");
      }
    }, 1500);
  };

  const extensions = useMemo(() => [getLanguageExtension(fileName), editorBaseTheme], [fileName]);

  const fileColor = getFileColor(fileName);

  const saveLabel =
    saveStatus === "saving"
      ? "Saving..."
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "error"
          ? "Save failed"
          : null;
  const statusLabel = isPreviewableImage
    ? imagePreview
      ? `${imagePreview.mimeType} · Read-only`
      : "Image preview"
    : saveLabel;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minWidth: 0,
        minHeight: 0,
        background: "var(--bg-panel)",
      }}
    >
      {/* Tab/header bar */}
      <div
        style={{
          height: 40,
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid var(--border-dim)",
          flexShrink: 0,
          background: "var(--bg-sidebar)",
          paddingLeft: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            height: "100%",
            padding: "0 10px 0 12px",
            borderRight: "1px solid var(--border-dim)",
            background: "var(--bg-panel)",
            borderTop: "2px solid var(--accent)",
            fontSize: 12.5,
            fontWeight: 500,
            color: "var(--text-primary)",
          }}
        >
          <span
            style={{
              width: 5,
              height: 14,
              borderRadius: 2,
              background: fileColor,
              flexShrink: 0,
              display: "inline-block",
            }}
          />
          {fileName}
          <button
            onClick={onClose}
            title="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px",
              borderRadius: 3,
              display: "flex",
              alignItems: "center",
              color: "var(--text-hint)",
              marginLeft: 4,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <X size={12} />
          </button>
        </div>
        {isMarkdown && (
          <button
            onClick={() => setPreviewMode((p) => !p)}
            title={previewMode ? "Edit" : "Preview"}
            style={{
              marginLeft: "auto",
              marginRight: 8,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "3px 8px",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              gap: 4,
              color: previewMode ? "var(--accent)" : "var(--text-hint)",
              fontSize: 11.5,
              fontFamily: "var(--font-ui)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            {previewMode ? <PencilLine size={13} /> : <Eye size={13} />}
            {previewMode ? "Edit" : "Preview"}
          </button>
        )}
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          position: "relative",
          userSelect: "text",
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-hint)",
              fontSize: 12,
            }}
          >
            Loading...
          </div>
        )}
        {error && !loading && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 10,
              color: "var(--text-muted)",
            }}
          >
            <AlertCircle size={24} strokeWidth={1.5} />
            <span style={{ fontSize: 12.5 }}>{error}</span>
          </div>
        )}
        {!loading &&
          !error &&
          (isPreviewableImage && imagePreview ? (
            <ImagePreviewPane
              src={imagePreview.dataUrl}
              fileName={fileName}
              mimeType={imagePreview.mimeType}
              byteLength={imagePreview.byteLength}
            />
          ) : content !== null ? (
            isMarkdown && previewMode ? (
              <div
                style={{
                  height: "100%",
                  overflow: "auto",
                  padding: "24px 32px",
                  background: "var(--bg-panel)",
                  minWidth: 0,
                  minHeight: 0,
                }}
              >
                <div
                  className="md-preview"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(marked(content, { async: false }) as string),
                  }}
                />
              </div>
            ) : (
              <ReactCodeMirror
                value={content}
                onChange={handleChange}
                theme={isDark ? githubDark : githubLight}
                extensions={extensions}
                height="100%"
                style={{ height: "100%" }}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                  highlightSelectionMatches: true,
                  autocompletion: false,
                  searchKeymap: true,
                }}
              />
            )
          ) : null)}
      </div>

      {/* Status bar */}
      <div
        style={{
          height: 22,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          borderTop: "1px solid var(--border-dim)",
          background: "var(--accent)",
          flexShrink: 0,
          gap: 8,
        }}
      >
        <span
          style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", fontFamily: "var(--font-mono)" }}
        >
          {filePath}
        </span>
        {statusLabel && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: saveStatus === "error" ? "#fca5a5" : "rgba(255,255,255,0.85)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {statusLabel}
          </span>
        )}
      </div>
    </div>
  );
}
