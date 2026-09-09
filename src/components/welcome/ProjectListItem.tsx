import { useId, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, Edit3, GitBranch, Palette, Pin, PinOff, Trash2, X } from "lucide-react";
import type { Project, ProjectAvatarStyle } from "../../types";
import { type ProjectRenameError, type ProjectRenameResult } from "../../projectName";
import { shortenPath } from "../../utils";
import { useI18n } from "../../i18n";
import { ProjectAvatar } from "../ProjectAvatar";
import { ProjectAppearanceEditor } from "../project-rail/ProjectAppearanceEditor";

function projectNameErrorMessage(error: ProjectRenameError, t: (key: string) => string): string {
  switch (error) {
    case "required":
      return t("project.nameRequired");
    case "reserved_separator":
      return t("project.nameReservedSeparator");
    case "duplicate":
      return t("project.nameDuplicate");
    case "save_failed":
      return t("project.nameSaveFailed");
  }
}

export function ProjectListItem({
  project,
  onOpen,
  onDelete,
  onToggleHidden,
  onRename,
  onUpdateAvatar,
}: {
  project: Project;
  onOpen: () => void;
  onDelete: () => void;
  onToggleHidden: () => void;
  onRename: (name: string) => ProjectRenameResult | Promise<ProjectRenameResult>;
  onUpdateAvatar: (avatar: ProjectAvatarStyle | undefined) => void;
}) {
  const { t } = useI18n();
  const errorId = useId();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(project.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  function startEditing() {
    setDraftName(project.name);
    setError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setDraftName(project.name);
    setError(null);
    setEditing(false);
  }

  async function saveName() {
    setSaving(true);
    const result = await onRename(draftName);
    setSaving(false);
    if (!result.ok) {
      setError(projectNameErrorMessage(result.error, t));
      return;
    }
    setDraftName(result.name);
    setError(null);
    setEditing(false);
  }

  const pinLabel = project.hiddenFromRail ? t("welcome.pinToRail") : t("welcome.unpinFromRail");

  return (
    <div
      className="welcome-project-item"
      data-editing={editing}
      data-appearance-open={appearanceOpen}
    >
      <button
        type="button"
        className="welcome-project-open"
        onClick={onOpen}
        disabled={editing}
        aria-label={`${project.name} — ${shortenPath(project.path)}`}
      />

      <div className="welcome-project-avatar">
        <ProjectAvatar project={project} size={34} />
      </div>

      <div className="welcome-project-content">
        {editing ? (
          <form
            className="welcome-project-rename-form"
            aria-busy={saving}
            onSubmit={(event) => {
              event.preventDefault();
              void saveName();
            }}
          >
            <div className="welcome-project-rename-row">
              <input
                autoFocus
                className="welcome-project-rename-input"
                value={draftName}
                disabled={saving}
                onChange={(event) => {
                  setDraftName(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  cancelEditing();
                }}
                aria-label={t("project.nameInput")}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
              />
              <button
                type="submit"
                className="welcome-project-icon-button"
                disabled={saving}
                aria-label={t("project.saveName")}
                title={t("project.saveName")}
              >
                <Check size={14} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                className="welcome-project-icon-button"
                onClick={cancelEditing}
                disabled={saving}
                aria-label={t("project.cancelRename")}
                title={t("project.cancelRename")}
              >
                <X size={14} strokeWidth={2.2} />
              </button>
            </div>
            {error && (
              <div id={errorId} className="welcome-project-rename-error" role="alert">
                {error}
              </div>
            )}
          </form>
        ) : (
          <div className="welcome-project-name">{project.name}</div>
        )}
        <div className="welcome-project-path">{shortenPath(project.path)}</div>
      </div>

      {project.branch ? (
        <span className="welcome-project-branch">
          <GitBranch size={10} strokeWidth={2} />
          {project.branch}
        </span>
      ) : (
        <span className="welcome-project-local">{t("welcome.local")}</span>
      )}

      <button
        type="button"
        className="welcome-project-pin-button"
        data-hidden={Boolean(project.hiddenFromRail)}
        onClick={onToggleHidden}
        disabled={editing}
        aria-label={pinLabel}
        title={pinLabel}
      >
        {project.hiddenFromRail ? (
          <PinOff size={11} strokeWidth={2} />
        ) : (
          <Pin size={11} strokeWidth={2} />
        )}
        {project.hiddenFromRail ? t("welcome.notPinnedToRail") : t("welcome.pinnedToRail")}
      </button>

      {/* 外观编辑器弹层打开期间条目保持 hover 态(data-appearance-open),否则弹层一出现
          指针离开条目,按钮就随 hover-action 一起隐藏,锚点跟着消失。 */}
      <Popover.Root open={appearanceOpen} onOpenChange={setAppearanceOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="welcome-project-icon-button welcome-project-hover-action"
            disabled={editing}
            aria-label={t("project.appearance")}
            title={t("project.appearance")}
          >
            <Palette size={14} strokeWidth={1.8} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="end"
            sideOffset={6}
            collisionPadding={8}
            className="rail-popover avatar-editor-popover"
          >
            <ProjectAppearanceEditor project={project} onChange={onUpdateAvatar} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <button
        type="button"
        className="welcome-project-icon-button welcome-project-hover-action"
        onClick={startEditing}
        disabled={editing}
        aria-label={t("project.rename")}
        title={t("project.rename")}
      >
        <Edit3 size={14} strokeWidth={1.8} />
      </button>

      <button
        type="button"
        className="welcome-project-icon-button welcome-project-hover-action welcome-project-delete"
        onClick={onDelete}
        disabled={editing}
        aria-label={t("welcome.deleteProject")}
        title={t("welcome.deleteProject")}
      >
        <Trash2 size={14} strokeWidth={1.8} />
      </button>
    </div>
  );
}
