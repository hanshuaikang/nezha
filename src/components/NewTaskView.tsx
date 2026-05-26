import { useState, useRef, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { TriangleAlert } from "lucide-react";
import type {
  Project,
  AgentType,
  PermissionMode,
  ProjectConfig,
  PromptTemplate,
  AppSettings,
} from "../types";
import { isAgentType, isPermissionAllowed, isPermissionMode } from "../types";
import { useToast } from "./Toast";
import {
  MentionPopover,
  type FileEntry,
  type CrossProjectRef,
  type MentionItem,
} from "./new-task/MentionPopover";
import { PromptEditor, usePromptEditor } from "./new-task/PromptEditor";
import { ImageAttachments } from "./new-task/ImageAttachments";
import { AgentPermSelector } from "./new-task/AgentPermSelector";
import { resolvePromptTemplate } from "../utils/promptTemplates";
import claudeGif from "../assets/gif/claude.gif";
import codexGif from "../assets/gif/codex.gif";
import s from "../styles";

interface PastedImage {
  id: string;
  dataUrl: string;
}

type CrossProjectFileMap = Map<string, FileEntry[]>;

function parseFileEntry(f: string): FileEntry {
  const parts = f.split("/");
  const name = parts[parts.length - 1];
  const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return { name, path: f, dir, ext };
}

function parseCrossProject(search: string, projects: Project[]): CrossProjectRef | null {
  const slashIdx = search.indexOf("/");
  if (slashIdx < 0) return null;
  const prefix = search.substring(0, slashIdx);
  const match = projects.find((p) => p.name.toLowerCase() === prefix.toLowerCase());
  return match ? { id: match.id, path: match.path, name: match.name } : null;
}

export function NewTaskView({
  project,
  otherProjects = [],
  onSubmit,
}: {
  project: Project;
  otherProjects?: Project[];
  onSubmit: (t: {
    prompt: string;
    agent: AgentType;
    permissionMode: PermissionMode;
    images: string[];
    immediate: boolean;
  }) => void;
}) {
  const { showToast } = useToast();
  const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);
  const [agent, setAgent] = useState<AgentType>("claude");
  const [permMode, setPermMode] = useState<PermissionMode>("ask");
  const [maxPermissionMode, setMaxPermissionMode] = useState<PermissionMode>("auto_edit");
  const [confirmFullAccess, setConfirmFullAccess] = useState(true);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [planMode, setPlanMode] = useState(false);

  const [allFiles, setAllFiles] = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [crossProjectFiles, setCrossProjectFiles] = useState<CrossProjectFileMap>(new Map());
  const loadedProjectIds = useRef<Set<string>>(new Set());

  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [isEmpty, setIsEmpty] = useState(true);
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([]);

  const { editorRef, isComposingRef, handle: editorHandle } = usePromptEditor();

  // Load project defaults, permission limits, and prompt templates when project changes.
  useEffect(() => {
    invoke<ProjectConfig>("read_project_config", { projectPath: project.path })
      .then((cfg) => {
        setProjectConfig(cfg);

        const defaultAgent = cfg.agent?.default;
        const nextAgent =
          typeof defaultAgent === "string" && isAgentType(defaultAgent) ? defaultAgent : "claude";
        setAgent(nextAgent);

        const configuredMax = cfg.permissions?.max_mode;
        const nextMaxPermissionMode =
          typeof configuredMax === "string" && isPermissionMode(configuredMax)
          ? configuredMax
          : "auto_edit";
        setMaxPermissionMode(nextMaxPermissionMode);
        setConfirmFullAccess(cfg.permissions?.confirm_full_access ?? true);
        setPromptTemplates(cfg.prompt_templates?.templates ?? []);

        const permissionsDefault = cfg.permissions?.default_mode;
        const agentDefault = cfg.agent?.default_permission_mode;
        const requestedDefault =
          typeof permissionsDefault === "string" && isPermissionMode(permissionsDefault)
          ? permissionsDefault
          : typeof agentDefault === "string" && isPermissionMode(agentDefault)
            ? agentDefault
            : "ask";
        setPermMode(
          isPermissionAllowed(requestedDefault, nextMaxPermissionMode)
            ? requestedDefault
            : nextMaxPermissionMode,
        );
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    if (projectConfig && !isPermissionAllowed(permMode, maxPermissionMode)) {
      setPermMode(maxPermissionMode);
    }
  }, [projectConfig, permMode, maxPermissionMode]);

  const [hasMdFile, setHasMdFile] = useState<boolean | null>(null);

  useEffect(() => {
    setHasMdFile(null);
    const filename = agent === "claude" ? "CLAUDE.md" : "AGENTS.md";
    invoke<string>("read_file_content", {
      path: `${project.path}/${filename}`,
      projectPath: project.path,
    })
      .then(() => setHasMdFile(true))
      .catch(() => setHasMdFile(false));
  }, [project.path, agent]);

  // Reset editor when project changes
  useEffect(() => {
    editorHandle.clear();
    setIsEmpty(true);
    setMentionSearch(null);
    setPastedImages([]);
    setCrossProjectFiles(new Map());
    loadedProjectIds.current.clear();
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load current project file list
  useEffect(() => {
    if (!project.path) return;
    setAllFiles([]);
    setFilesLoading(true);
    invoke<string[]>("list_project_files", { projectPath: project.path })
      .then((files) => {
        setAllFiles(files.map(parseFileEntry));
      })
      .catch((e: unknown) => {
        showToast(
          `Failed to load project file list, @ references unavailable: ${String(e)}`,
          "warning",
        );
      })
      .finally(() => setFilesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  // Lazily load cross-project files when user enters cross-project mode
  useEffect(() => {
    if (mentionSearch === null || otherProjects.length === 0) return;
    const cp = parseCrossProject(mentionSearch, otherProjects);
    if (!cp || loadedProjectIds.current.has(cp.id)) return;
    loadedProjectIds.current.add(cp.id);
    invoke<string[]>("list_project_files", { projectPath: cp.path })
      .then((files) => {
        setCrossProjectFiles((prev) => new Map(prev).set(cp.id, files.map(parseFileEntry)));
      })
      .catch(() => {
        loadedProjectIds.current.delete(cp.id);
      });
  }, [mentionSearch, otherProjects]);

  // Compute the dropdown items based on current mentionSearch
  const mentionItems = useMemo((): MentionItem[] => {
    if (mentionSearch === null) return [];

    const cp = parseCrossProject(mentionSearch, otherProjects);
    if (cp) {
      const files = crossProjectFiles.get(cp.id) ?? [];
      const search = mentionSearch.substring(mentionSearch.indexOf("/") + 1);
      return files
        .filter(
          (f) =>
            !search ||
            f.name.toLowerCase().includes(search.toLowerCase()) ||
            f.path.toLowerCase().includes(search.toLowerCase()),
        )
        .slice(0, 12)
        .map((f) => ({ kind: "file", file: f, crossProject: cp }));
    }

    const search = mentionSearch;
    const currentFiles: MentionItem[] = allFiles
      .filter(
        (f) =>
          !search ||
          f.name.toLowerCase().includes(search.toLowerCase()) ||
          f.path.toLowerCase().includes(search.toLowerCase()),
      )
      .slice(0, 8)
      .map((f) => ({ kind: "file", file: f }));

    const matchingProjects: MentionItem[] = otherProjects
      .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
      .slice(0, 5)
      .map((p) => ({ kind: "project", project: p }));

    return [...currentFiles, ...matchingProjects];
  }, [mentionSearch, allFiles, otherProjects, crossProjectFiles]);

  const activeCrossProject =
    mentionSearch !== null ? parseCrossProject(mentionSearch, otherProjects) : null;
  const isCrossMode = activeCrossProject !== null;
  const isCrossLoading = isCrossMode && !crossProjectFiles.has(activeCrossProject!.id);

  function updateMentionState() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      setMentionSearch(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!range.collapsed || range.startContainer.nodeType !== Node.TEXT_NODE) {
      setMentionSearch(null);
      return;
    }
    const textNode = range.startContainer as Text;
    const textBefore = textNode.textContent!.substring(0, range.startOffset);
    const atIdx = textBefore.lastIndexOf("@");
    if (atIdx === -1) {
      setMentionSearch(null);
      return;
    }
    const query = textBefore.substring(atIdx + 1);
    if (query.includes(" ") || query.includes("\n")) {
      setMentionSearch(null);
      return;
    }
    setMentionSearch(query);
    setMentionIndex(0);
  }

  function handleSelectTemplate(template: PromptTemplate) {
    const text = resolvePromptTemplate(template, {
      project,
      branch: project.branch,
      agent,
    });
    editorHandle.insertText(text);
    setIsEmpty(false);
    setMentionSearch(null);
  }

  async function handleSubmit(immediate: boolean) {
    const text = editorHandle.serialize();
    if (!text && pastedImages.length === 0) return;
    if (!isPermissionAllowed(permMode, maxPermissionMode)) {
      showToast("This permission mode exceeds the project limit.", "warning");
      return;
    }
    if (immediate && permMode === "full_access" && confirmFullAccess) {
      invoke<AppSettings>("load_app_settings")
        .then((settings) => {
          if (!settings.notifications.permission_risk) return undefined;
          return invoke("notify_permission_risk", {
            title: "Full Access task",
            body: `${agent} is about to start with Full Access in ${project.name}.`,
          });
        })
        .catch(() => {});

      const confirmed = await confirm(
        "Full Access allows the agent to run without normal approval prompts. Continue?",
        {
          title: "Confirm Full Access",
          kind: "warning",
        },
      );
      if (!confirmed) return;
    }
    const finalPrompt = planMode && text ? `${text}\n\nPlease use plan mode.` : text;
    onSubmit({
      prompt: finalPrompt,
      agent,
      permissionMode: permMode,
      images: pastedImages.map((img) => img.dataUrl),
      immediate,
    });
    editorHandle.clear();
    setIsEmpty(true);
    setMentionSearch(null);
    setPastedImages([]);
  }

  function addImageFiles(files: FileList | File[]) {
    const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
    for (const file of images) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        if (!dataUrl) return;
        setPastedImages((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, dataUrl }]);
        setIsEmpty(false);
      };
      reader.readAsDataURL(file);
    }
  }

  // Handle image paste at this level (PromptEditor delegates image items up)
  function handleEditorPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length > 0) {
      e.preventDefault();
      addImageFiles(
        imageItems.flatMap((item) => {
          const file = item.getAsFile();
          return file ? [file] : [];
        }),
      );
    }
  }

  return (
    <div style={s.newTaskOuter}>
      {/* Header */}
      <div style={s.newTaskHeader}>
        <img
          src={agent === "claude" ? claudeGif : codexGif}
          alt=""
          style={s.newTaskClaudeGif}
        />
        <span style={s.newTaskTitle}>What do you want to build today?</span>
      </div>

      {/* Missing context file warning */}
      {hasMdFile === false && (
        <div style={s.agentMissingMdBanner}>
          <TriangleAlert size={15} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)" }}>
            <span style={{ fontWeight: 650, color: "var(--text-primary)" }}>
              No{" "}
              <code
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  background: "var(--warning-code-bg)",
                  padding: "0 4px",
                  borderRadius: 3,
                }}
              >
                {agent === "claude" ? "CLAUDE.md" : "AGENTS.md"}
              </code>{" "}
              found in this project.
            </span>{" "}
            {agent === "claude"
              ? "Add a CLAUDE.md to the project root to give Claude Code context about your codebase, conventions, and preferences — it will follow them on every task."
              : "Add an AGENTS.md to the project root to give Codex context about your codebase, conventions, and preferences — it will follow them on every task."}
          </div>
        </div>
      )}

      {/* Compose card */}
      <div style={{ ...s.composeCard, position: "relative" }} onPaste={handleEditorPaste}>
        {/* Mention dropdown */}
        {mentionSearch !== null && (
          <MentionPopover
            mentionSearch={mentionSearch}
            mentionItems={mentionItems}
            mentionIndex={mentionIndex}
            filesLoading={filesLoading}
            isCrossMode={isCrossMode}
            isCrossLoading={isCrossLoading}
            activeCrossProject={activeCrossProject}
            onSelectFile={() => setMentionSearch(null)}
            onSelectProject={(proj) => {
              setMentionSearch(`${proj.name}/`);
              setMentionIndex(0);
            }}
            onSetMentionIndex={setMentionIndex}
          />
        )}

        {/* Inline editor */}
        <PromptEditor
          editorRef={editorRef}
          isComposingRef={isComposingRef}
          isEmpty={isEmpty}
          mentionItems={mentionSearch !== null ? mentionItems : []}
          mentionIndex={mentionIndex}
          onSetIsEmpty={setIsEmpty}
          onUpdateMention={updateMentionState}
          onSelectFile={() => setMentionSearch(null)}
          onSelectProject={(proj) => {
            setMentionSearch(`${proj.name}/`);
            setMentionIndex(0);
          }}
          onSetMentionIndex={setMentionIndex}
          onSubmit={handleSubmit}
          onAddImages={addImageFiles}
        />

        {/* Image previews */}
        <ImageAttachments
          images={pastedImages}
          onRemove={(id) => setPastedImages((prev) => prev.filter((i) => i.id !== id))}
        />

        {/* Toolbar */}
        <AgentPermSelector
          agent={agent}
          permMode={permMode}
          planMode={planMode}
          maxPermissionMode={maxPermissionMode}
          promptTemplates={promptTemplates}
          isEmpty={isEmpty}
          hasImages={pastedImages.length > 0}
          onSetAgent={setAgent}
          onSetPermMode={setPermMode}
          onTogglePlanMode={() => setPlanMode((v) => !v)}
          onSelectTemplate={handleSelectTemplate}
          onAddImages={(dataUrls) => {
            setPastedImages((prev) => [
              ...prev,
              ...dataUrls.map((dataUrl) => ({
                id: `${Date.now()}-${Math.random()}`,
                dataUrl,
              })),
            ]);
            setIsEmpty(false);
          }}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
