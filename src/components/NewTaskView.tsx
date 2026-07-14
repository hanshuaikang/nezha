import { useState, useRef, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TriangleAlert, Sparkles } from "lucide-react";
import type { Project, AgentType, PermissionMode, GitRoot } from "../types";
import type { HookAgentReadiness } from "./app-settings/types";
import { useToast } from "./Toast";
import {
  MentionPopover,
  type FileEntry,
  type CrossProjectRef,
  type MentionItem,
} from "./new-task/MentionPopover";
import { PromptEditor, usePromptEditor, type PromptEditorContent } from "./new-task/PromptEditor";
import { ImageAttachments } from "./new-task/ImageAttachments";
import { TextAttachments, type PastedText } from "./new-task/TextAttachments";
import { AgentPermSelector } from "./new-task/AgentPermSelector";
import { LaunchModeSelector, type LaunchMode } from "./new-task/LaunchModeSelector";
import { useI18n } from "../i18n";
import { APP_PLATFORM } from "../platform";
import {
  DEFAULT_SEND_SHORTCUT,
  getSendShortcutKeys,
  normalizeSendShortcut,
  type SendShortcut,
} from "../shortcuts";
import claudeGif from "../assets/gif/claude.gif";
import codexGif from "../assets/gif/codex.gif";
import s from "../styles";

interface PastedImage {
  id: string;
  dataUrl: string;
}

export interface NewTaskDraft {
  promptHtml: string;
  agent: AgentType;
  permMode: PermissionMode;
  planMode: boolean;
  pastedImages: PastedImage[];
  pastedTexts?: PastedText[];
  launchMode?: LaunchMode;
  baseBranch?: string;
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
  repoPath,
  roots,
  onSetRepoPath,
  otherProjects = [],
  onSubmit,
  initialDraft,
  onCacheDraft,
}: {
  project: Project;
  /** 当前活动 git 根的绝对路径（单仓库 = project.path，多仓库 = 选中的 sub-repo） */
  repoPath: string;
  /** 项目下所有 git 根，用于 worktree 模式下的 sub-repo picker 与校验 */
  roots: GitRoot[];
  /** 切换 sub-repo —— 直接代理到全局 useGitRoots.setSelectedRoot，让 BranchBar / Git 面板跟着切 */
  onSetRepoPath: (path: string) => void;
  otherProjects?: Project[];
  onSubmit: (t: {
    prompt: string;
    agent: AgentType;
    permissionMode: PermissionMode;
    images: string[];
    texts: string[];
    immediate: boolean;
    launchMode: LaunchMode;
    baseBranch: string;
  }) => void;
  initialDraft?: NewTaskDraft | null;
  onCacheDraft?: (draft: NewTaskDraft | null) => void;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [agent, setAgent] = useState<AgentType>(initialDraft?.agent ?? "claude");
  const [permMode, setPermMode] = useState<PermissionMode>(initialDraft?.permMode ?? "ask");
  const [planMode, setPlanMode] = useState(initialDraft?.planMode ?? false);
  const [launchMode, setLaunchMode] = useState<LaunchMode>(initialDraft?.launchMode ?? "local");
  const [baseBranch, setBaseBranch] = useState<string>(initialDraft?.baseBranch ?? "");

  const [allFiles, setAllFiles] = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [crossProjectFiles, setCrossProjectFiles] = useState<CrossProjectFileMap>(new Map());
  const loadedProjectIds = useRef<Set<string>>(new Set());

  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [pastedImages, setPastedImages] = useState<PastedImage[]>(initialDraft?.pastedImages ?? []);
  const [initButtonHovered, setInitButtonHovered] = useState(false);
  const [pastedTexts, setPastedTexts] = useState<PastedText[]>(initialDraft?.pastedTexts ?? []);
  const [isEmpty, setIsEmpty] = useState(
    () =>
      !(initialDraft?.promptHtml ?? "").replace(/<[^>]+>/g, "").trim() &&
      (initialDraft?.pastedImages.length ?? 0) === 0 &&
      (initialDraft?.pastedTexts?.length ?? 0) === 0,
  );
  const [sendShortcut, setSendShortcut] = useState<SendShortcut>(DEFAULT_SEND_SHORTCUT);

  const { editorRef, isComposingRef, handle: editorHandle } = usePromptEditor();
  const editorContentRef = useRef<PromptEditorContent>({
    html: initialDraft?.promptHtml ?? "",
    text: (initialDraft?.promptHtml ?? "").replace(/<[^>]+>/g, ""),
    hasChips: !!initialDraft?.promptHtml?.includes("data-file-path"),
  });

  // Restore prompt HTML from draft on mount (DOM-level state outside React).
  useEffect(() => {
    if (initialDraft?.promptHtml && editorRef.current) {
      editorRef.current.innerHTML = initialDraft.promptHtml;
      editorContentRef.current = {
        html: editorRef.current.innerHTML,
        text: editorRef.current.textContent || "",
        hasChips: !!editorRef.current.querySelector("[data-file-path]"),
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cache draft on unmount so reopening the new-task view restores work in progress.
  // Cleared after submit to avoid re-restoring the just-sent prompt.
  const submittedRef = useRef(false);
  const draftDataRef = useRef({
    agent,
    permMode,
    planMode,
    pastedImages,
    pastedTexts,
    launchMode,
    baseBranch,
  });
  useEffect(() => {
    draftDataRef.current = {
      agent,
      permMode,
      planMode,
      pastedImages,
      pastedTexts,
      launchMode,
      baseBranch,
    };
  }, [agent, permMode, planMode, pastedImages, pastedTexts, launchMode, baseBranch]);
  useEffect(() => {
    return () => {
      if (!onCacheDraft) return;
      if (submittedRef.current) {
        onCacheDraft(null);
        return;
      }
      const data = draftDataRef.current;
      const editorContent = editorContentRef.current;
      if (
        !editorContent.text.trim() &&
        !editorContent.hasChips &&
        data.pastedImages.length === 0 &&
        data.pastedTexts.length === 0
      ) {
        onCacheDraft(null);
        return;
      }
      onCacheDraft({
        promptHtml: editorContent.html,
        agent: data.agent,
        permMode: data.permMode,
        planMode: data.planMode,
        pastedImages: data.pastedImages,
        pastedTexts: data.pastedTexts,
        launchMode: data.launchMode,
        baseBranch: data.baseBranch,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function loadSendShortcut() {
      invoke<{ send_shortcut?: string }>("load_app_settings")
        .then((settings) => setSendShortcut(normalizeSendShortcut(settings.send_shortcut)))
        .catch(() => setSendShortcut(DEFAULT_SEND_SHORTCUT));
    }

    loadSendShortcut();
    window.addEventListener("nezha:app-settings-changed", loadSendShortcut);
    return () => window.removeEventListener("nezha:app-settings-changed", loadSendShortcut);
  }, []);

  // Load default agent and permission mode from project config when project changes
  useEffect(() => {
    if (initialDraft) return;
    invoke<{ agent: { default: string; default_permission_mode?: string } }>(
      "read_project_config",
      { projectPath: project.path },
    )
      .then((cfg) => {
        const defaultAgent = cfg.agent.default;
        if (defaultAgent === "claude" || defaultAgent === "codex") {
          setAgent(defaultAgent);
        }
        const defaultPerm = cfg.agent.default_permission_mode;
        if (defaultPerm === "ask" || defaultPerm === "auto_edit" || defaultPerm === "full_access") {
          setPermMode(defaultPerm);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

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

  // Hook 就绪状态：版本过低 / 无 node 时软提示用户(任务仍可启动,已回退轮询)。
  const [hookReadiness, setHookReadiness] = useState<HookAgentReadiness[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<HookAgentReadiness[]>("get_hook_readiness")
      .then((r) => {
        if (!cancelled) setHookReadiness(r);
      })
      .catch(() => {
        if (!cancelled) setHookReadiness([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const agentReadiness = hookReadiness?.find((r) => r.agent === agent) ?? null;
  const hookBanner = (() => {
    if (!agentReadiness || agentReadiness.usable) return null;
    const agentName = agent === "claude" ? "Claude Code" : "Codex";
    if (agentReadiness.reason === "version_too_low") {
      return t("newTask.hookVersionLow", {
        agent: agentName,
        detected: agentReadiness.detectedVersion,
        min: agentReadiness.minVersion,
      });
    }
    if (agentReadiness.reason === "no_node") {
      return t("newTask.hookNoNode");
    }
    if (agentReadiness.reason === "not_installed") {
      return t("newTask.hookNotInstalled", { agent: agentName });
    }
    return null;
  })();

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
        showToast(t("toast.loadProjectFilesFailed", { error: String(e) }), "warning");
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

  function handleInitializeMd() {
    const filename = agent === "claude" ? "CLAUDE.md" : "AGENTS.md";
    const prompt = t("newTask.initializePrompt", { file: filename });
    // 初始化 md 文件不涉及代码改动，强制走本地，避免无谓的 worktree 开销
    onSubmit({
      prompt,
      agent,
      permissionMode: permMode,
      images: [],
      texts: [],
      immediate: true,
      launchMode: "local",
      baseBranch: "",
    });
  }

  function handleSubmit(immediate: boolean) {
    const text = editorHandle.serialize();
    if (!text && pastedImages.length === 0 && pastedTexts.length === 0 && !immediate) return;
    if (!immediate && launchMode === "worktree") {
      showToast(t("newTask.worktreeMustSend"), "warning");
      return;
    }
    if (launchMode === "worktree") {
      // sub-repo 必须落在 roots 中：项目无 git 根（roots = []）或选错路径都拒绝启动。
      // 单仓库（roots.length === 1）路径自然等于 project.path / 唯一 root，校验通过。
      const hasValidRepo = roots.length > 0 && roots.some((r) => r.path === repoPath);
      if (!hasValidRepo) {
        showToast(
          roots.length === 0 ? t("newTask.noGitRepoForWorktree") : t("newTask.subRepoRequired"),
          "warning",
        );
        return;
      }
    }
    submittedRef.current = true;
    const finalPrompt = planMode && text ? `${text}\n\nPlease use plan mode.` : text;
    onSubmit({
      prompt: finalPrompt,
      agent,
      permissionMode: permMode,
      images: pastedImages.map((img) => img.dataUrl),
      texts: pastedTexts.map((t) => t.text),
      immediate,
      launchMode,
      baseBranch,
    });
    editorHandle.clear();
    setIsEmpty(true);
    setMentionSearch(null);
    setPastedImages([]);
    setPastedTexts([]);
  }

  // Handle image paste at this level (PromptEditor delegates image items up)
  function handleEditorPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length > 0) {
      e.preventDefault();
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (!file) continue;
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
  }

  return (
    <div style={s.newTaskOuter}>
      {/* Header */}
      <div style={s.newTaskHeader}>
        <img src={agent === "claude" ? claudeGif : codexGif} alt="" style={s.newTaskClaudeGif} />
        <span style={s.newTaskTitle}>{t("newTask.title")}</span>
      </div>

      {/* Missing context file warning */}
      {hasMdFile === false && (
        <div style={s.agentMissingMdBanner}>
          <TriangleAlert size={15} style={s.agentMissingMdIcon} />
          <div style={s.agentMissingMdBody}>
            <div style={s.agentMissingMdText}>
              <span style={s.agentMissingMdTitle}>
                {
                  t("newTask.instructionsMissing", {
                    file: agent === "claude" ? "CLAUDE.md" : "AGENTS.md",
                  }).split(agent === "claude" ? "CLAUDE.md" : "AGENTS.md")[0]
                }
                <code style={s.agentMissingMdCode}>
                  {agent === "claude" ? "CLAUDE.md" : "AGENTS.md"}
                </code>{" "}
                {
                  t("newTask.instructionsMissing", {
                    file: agent === "claude" ? "CLAUDE.md" : "AGENTS.md",
                  }).split(agent === "claude" ? "CLAUDE.md" : "AGENTS.md")[1]
                }
              </span>{" "}
              {t("newTask.addInstructions", {
                file: agent === "claude" ? "CLAUDE.md" : "AGENTS.md",
                agent: agent === "claude" ? "Claude Code" : "Codex",
              })}
            </div>
            <button
              type="button"
              style={initButtonHovered ? s.agentMissingMdInitBtnHovered : s.agentMissingMdInitBtn}
              onClick={handleInitializeMd}
              onMouseEnter={() => setInitButtonHovered(true)}
              onMouseLeave={() => setInitButtonHovered(false)}
            >
              <Sparkles size={13} strokeWidth={2} />
              {t("newTask.initializeButton")}
            </button>
          </div>
        </div>
      )}

      {/* Hook fallback / upgrade hint (soft — does not block task start) */}
      {hookBanner && (
        <div style={s.agentMissingMdBanner}>
          <TriangleAlert size={15} style={s.hookFallbackIcon} />
          <div style={s.hookFallbackText}>{hookBanner}</div>
        </div>
      )}

      {/* Compose card */}
      <div style={s.composeCardRelative} onPaste={handleEditorPaste}>
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
          sendShortcut={sendShortcut}
          onSubmit={handleSubmit}
          onContentChange={(content) => {
            editorContentRef.current = content;
          }}
          onPasteLargeText={(text) => {
            setPastedTexts((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, text }]);
            setIsEmpty(false);
          }}
        />

        {/* Attachment previews (images + pasted text on a single row) */}
        {(pastedImages.length > 0 || pastedTexts.length > 0) && (
          <div style={s.attachmentsRow}>
            <ImageAttachments
              images={pastedImages}
              onRemove={(id) => {
                setPastedImages((prev) => {
                  const next = prev.filter((i) => i.id !== id);
                  if (next.length === 0 && pastedTexts.length === 0) {
                    const text = editorContentRef.current.text;
                    const hasChips = editorContentRef.current.hasChips;
                    setIsEmpty(!text.trim() && !hasChips);
                  }
                  return next;
                });
              }}
            />
            <TextAttachments
              texts={pastedTexts}
              onRemove={(id) => {
                setPastedTexts((prev) => {
                  const next = prev.filter((t) => t.id !== id);
                  if (next.length === 0 && pastedImages.length === 0) {
                    const text = editorContentRef.current.text;
                    const hasChips = editorContentRef.current.hasChips;
                    setIsEmpty(!text.trim() && !hasChips);
                  }
                  return next;
                });
              }}
            />
          </div>
        )}

        {/* Toolbar */}
        <AgentPermSelector
          agent={agent}
          permMode={permMode}
          planMode={planMode}
          isEmpty={isEmpty}
          hasImages={pastedImages.length > 0 || pastedTexts.length > 0}
          saveAsTodoDisabledReason={
            launchMode === "worktree" ? t("newTask.worktreeMustSend") : undefined
          }
          sendShortcutKeys={getSendShortcutKeys(sendShortcut, APP_PLATFORM)}
          onSetAgent={setAgent}
          onSetPermMode={setPermMode}
          onTogglePlanMode={() => setPlanMode((v) => !v)}
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

      {/* Launch mode + base branch (compose card 外、独立一栏) */}
      <div style={s.launchModeBar}>
        <LaunchModeSelector
          projectRoot={project.path}
          repoPath={repoPath}
          roots={roots}
          launchMode={launchMode}
          baseBranch={baseBranch}
          onSetLaunchMode={setLaunchMode}
          onSetBaseBranch={setBaseBranch}
          onSetRepoPath={onSetRepoPath}
        />
      </div>
    </div>
  );
}
