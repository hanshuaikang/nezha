import { useCallback, useLayoutEffect, useRef, useState } from "react";
import s from "../../styles";
import { useI18n } from "../../i18n";
import type { ContextMenuState } from "./types";

const VIEWPORT_MARGIN = 8;

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
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: ctxMenu.x, y: ctxMenu.y });

  const updatePosition = useCallback(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const rect = menu.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const maxX = Math.max(VIEWPORT_MARGIN, viewportWidth - rect.width - VIEWPORT_MARGIN);
    const maxY = Math.max(VIEWPORT_MARGIN, viewportHeight - rect.height - VIEWPORT_MARGIN);

    setPosition({
      x: Math.min(Math.max(ctxMenu.x, VIEWPORT_MARGIN), maxX),
      y: Math.min(Math.max(ctxMenu.y, VIEWPORT_MARGIN), maxY),
    });
  }, [ctxMenu.x, ctxMenu.y]);

  useLayoutEffect(() => {
    setPosition({ x: ctxMenu.x, y: ctxMenu.y });
    updatePosition();
  }, [ctxMenu.x, ctxMenu.y, updatePosition]);

  useLayoutEffect(() => {
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [updatePosition]);

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
        ref={menuRef}
        style={{ ...s.fileCtxMenu, left: position.x, top: position.y }}
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
