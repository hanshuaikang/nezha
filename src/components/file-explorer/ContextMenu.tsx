import s from "../../styles";
import { useI18n } from "../../i18n";
import type { ContextMenuState } from "./types";

export function FileExplorerContextMenu({
  ctxMenu,
  onClose,
  onNewFile,
  onNewFolder,
  onDelete,
  onOpenInSystem,
  onCopyPath,
}: {
  ctxMenu: ContextMenuState;
  onClose: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onDelete: () => void;
  onOpenInSystem: (e: React.MouseEvent, path: string) => void;
  onCopyPath: (e: React.MouseEvent, path: string, withAt: boolean) => void;
}) {
  const { t } = useI18n();

  const items = [
    { label: t("file.newFile"), action: "newFile" },
    { label: t("file.newFolder"), action: "newFolder" },
    { action: "separator" },
    { label: t("file.openInSystemFolder"), action: "open" },
    { label: t("file.copyFullPath"), action: "copy", withAt: false },
    { label: t("file.copyAtFullPath"), action: "copy", withAt: true },
    ...(ctxMenu.isRoot
      ? []
      : ([
          { action: "separator" },
          { label: t("file.delete"), action: "delete", destructive: true },
        ] as const)),
  ] as const;

  return (
    <>
      <div
        style={s.fileCtxBackdrop}
        onPointerDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        style={{ ...s.fileCtxMenu, left: ctxMenu.x, top: ctxMenu.y }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {items.map((item, idx) => {
          if (item.action === "separator") {
            return <div key={`sep-${idx}`} style={s.fileCtxSeparator} />;
          }
          const isDestructive = item.action === "delete";
          const baseColor = isDestructive
            ? "var(--danger-action-bg, #d23f3f)"
            : "var(--text-primary)";
          return (
            <button
              type="button"
              key={item.label}
              style={{ ...s.fileCtxMenuItem, color: baseColor }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDestructive
                  ? "var(--danger-action-bg, #d23f3f)"
                  : "var(--accent)";
                e.currentTarget.style.color = isDestructive
                  ? "var(--danger-action-fg, #ffffff)"
                  : "var(--fg-on-accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = baseColor;
              }}
              onClick={(event) => {
                if (item.action === "newFile") {
                  event.preventDefault();
                  event.stopPropagation();
                  onNewFile();
                  return;
                }
                if (item.action === "newFolder") {
                  event.preventDefault();
                  event.stopPropagation();
                  onNewFolder();
                  return;
                }
                if (item.action === "delete") {
                  event.preventDefault();
                  event.stopPropagation();
                  onDelete();
                  return;
                }
                if (item.action === "open") {
                  onOpenInSystem(event, ctxMenu.path);
                  return;
                }
                if (item.action === "copy") {
                  onCopyPath(event, ctxMenu.path, item.withAt);
                }
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
