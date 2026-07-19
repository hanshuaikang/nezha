import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Download, GitFork, MoreHorizontal, X } from "lucide-react";
import { useI18n } from "../../i18n";
import s from "../../styles";

const MAX_FORK_SOURCE_NAME_LENGTH = 70;

export function buildDefaultForkTaskName(
  taskName: string | undefined,
  prompt: string,
  fallbackName: string,
): string {
  const source = ((taskName ?? prompt).trim() || fallbackName).replace(/\s+/g, " ");
  const shortened =
    source.length > MAX_FORK_SOURCE_NAME_LENGTH
      ? `${source.slice(0, MAX_FORK_SOURCE_NAME_LENGTH)}…`
      : source;
  return `Fork-${shortened}`;
}

export function ForkTaskDialog({
  open,
  defaultName,
  onOpenChange,
  onFork,
}: {
  open: boolean;
  defaultName: string;
  onOpenChange: (open: boolean) => void;
  onFork: (name: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [defaultName, open]);

  const trimmedName = name.trim();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={s.forkDialogOverlay} />
        <Dialog.Content style={s.forkDialogBox}>
          <div style={s.forkDialogHeader}>
            <div style={s.forkDialogHeading}>
              <span style={s.forkDialogIcon}>
                <GitFork size={16} strokeWidth={2.1} />
              </span>
              <Dialog.Title style={s.forkDialogTitle}>{t("running.forkDialogTitle")}</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button type="button" style={s.modalCloseBtn} aria-label={t("common.close")}>
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description style={s.forkDialogDescription}>
            {t("running.forkDialogDescription")}
          </Dialog.Description>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!trimmedName) return;
              onFork(trimmedName);
              onOpenChange(false);
            }}
          >
            <label style={s.forkDialogLabel} htmlFor="fork-task-name">
              {t("running.forkTaskName")}
            </label>
            <input
              ref={inputRef}
              id="fork-task-name"
              style={s.forkDialogInput}
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
            <div style={s.forkDialogActions}>
              <Dialog.Close asChild>
                <button type="button" style={s.forkDialogCancelBtn}>
                  {t("common.cancel")}
                </button>
              </Dialog.Close>
              <button
                type="submit"
                style={trimmedName ? s.forkDialogPrimaryBtn : s.forkDialogPrimaryBtnDisabled}
                disabled={!trimmedName}
              >
                {t("running.forkConfirm")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SessionActionsMenu({
  defaultForkName,
  forkDisabledReason,
  canExport,
  exporting,
  onFork,
  onExport,
}: {
  defaultForkName: string;
  forkDisabledReason?: string;
  canExport: boolean;
  exporting: boolean;
  onFork: (name: string) => void;
  onExport: () => void;
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [forkDialogOpen, setForkDialogOpen] = useState(false);
  const forkDisabled = Boolean(forkDisabledReason);

  return (
    <>
      <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Popover.Trigger asChild>
          <button type="button" style={s.sessionMoreBtn} aria-label={t("running.moreActions")}>
            <MoreHorizontal size={13} strokeWidth={2.3} />
            <span>{t("running.more")}</span>
            <ChevronDown size={11} strokeWidth={2.3} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="file-viewer-tab-menu"
            style={s.sessionActionsMenu}
            sideOffset={5}
            align="end"
            role="menu"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <div title={forkDisabledReason}>
              <button
                type="button"
                className="file-viewer-tab-menu-item"
                style={s.sessionActionsMenuItem}
                disabled={forkDisabled}
                role="menuitem"
                onClick={() => {
                  if (forkDisabled) return;
                  setMenuOpen(false);
                  setForkDialogOpen(true);
                }}
              >
                <GitFork size={13} strokeWidth={2.1} />
                <span style={s.sessionActionsMenuItemBody}>
                  <span>{t("running.forkSession")}</span>
                  {forkDisabledReason && (
                    <span style={s.sessionActionsMenuItemHint}>{forkDisabledReason}</span>
                  )}
                </span>
              </button>
            </div>
            <div className="radix-select-separator" />
            <button
              type="button"
              className="file-viewer-tab-menu-item"
              style={s.sessionActionsMenuItem}
              disabled={!canExport || exporting}
              role="menuitem"
              title={!canExport ? t("running.exportUnavailable") : undefined}
              onClick={() => {
                if (!canExport || exporting) return;
                setMenuOpen(false);
                onExport();
              }}
            >
              <Download size={13} strokeWidth={2.1} />
              <span>{exporting ? t("running.exporting") : t("running.exportMarkdown")}</span>
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <ForkTaskDialog
        open={forkDialogOpen}
        defaultName={defaultForkName}
        onOpenChange={setForkDialogOpen}
        onFork={onFork}
      />
    </>
  );
}
