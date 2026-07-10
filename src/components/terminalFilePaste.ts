import { invoke } from "@tauri-apps/api/core";
import { APP_PLATFORM } from "../platform";
import { TERMINAL_NEWLINE_SEQUENCE } from "../shortcuts";
import {
  APP_SETTINGS_CHANGED_EVENT,
  DEFAULT_TERMINAL_ATTACHMENT_MAX_COUNT,
  DEFAULT_TERMINAL_ATTACHMENT_MAX_SIZE_MB,
  DEFAULT_TERMINAL_ATTACHMENT_PASTE_ENABLED,
  TERMINAL_ATTACHMENT_MAX_COUNT_LIMIT,
  TERMINAL_ATTACHMENT_MAX_SIZE_MB_LIMIT,
  type AppSettings,
} from "./app-settings/types";

interface TerminalAttachment {
  dataUrl: string;
  name: string;
  mimeType: string;
  label: string;
  size: number;
}

interface SavedTerminalAttachment {
  path: string;
  label: string;
}

interface TerminalAttachmentPasteSettings {
  enabled: boolean;
  maxSizeMb: number;
  maxCount: number;
}

function normalizeAttachmentPasteSettings(
  settings: Partial<AppSettings>,
): TerminalAttachmentPasteSettings {
  return {
    enabled:
      typeof settings.terminal_attachment_paste_enabled === "boolean"
        ? settings.terminal_attachment_paste_enabled
        : DEFAULT_TERMINAL_ATTACHMENT_PASTE_ENABLED,
    maxSizeMb:
      typeof settings.terminal_attachment_max_size_mb === "number" &&
      Number.isFinite(settings.terminal_attachment_max_size_mb) &&
      settings.terminal_attachment_max_size_mb > 0
        ? Math.min(settings.terminal_attachment_max_size_mb, TERMINAL_ATTACHMENT_MAX_SIZE_MB_LIMIT)
        : DEFAULT_TERMINAL_ATTACHMENT_MAX_SIZE_MB,
    maxCount:
      typeof settings.terminal_attachment_max_count === "number" &&
      Number.isFinite(settings.terminal_attachment_max_count) &&
      settings.terminal_attachment_max_count > 0
        ? Math.min(settings.terminal_attachment_max_count, TERMINAL_ATTACHMENT_MAX_COUNT_LIMIT)
        : DEFAULT_TERMINAL_ATTACHMENT_MAX_COUNT,
  };
}

function defaultAttachmentPasteSettings(): TerminalAttachmentPasteSettings {
  return {
    enabled: DEFAULT_TERMINAL_ATTACHMENT_PASTE_ENABLED,
    maxSizeMb: DEFAULT_TERMINAL_ATTACHMENT_MAX_SIZE_MB,
    maxCount: DEFAULT_TERMINAL_ATTACHMENT_MAX_COUNT,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (dataUrl) resolve(dataUrl);
      else reject(new Error("Failed to read pasted file"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read pasted file"));
    reader.readAsDataURL(file);
  });
}

function extensionFromName(name: string): string | null {
  const match = /\.([a-z0-9]{1,12})$/i.exec(name);
  return match?.[1]?.toUpperCase() ?? null;
}

function labelFromFile(file: File): string {
  const mimeType = file.type.toLowerCase();
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("audio/")) return "Audio";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === "application/json" || mimeType.endsWith("+json")) return "JSON";
  if (mimeType.startsWith("text/")) return "Text";
  return extensionFromName(file.name) ?? "File";
}

function formatMarkdownDestination(path: string): string {
  return `<${path.replace(/\\/g, "\\\\").replace(/</g, "\\<").replace(/>/g, "\\>")}>`;
}

function formatTerminalAttachmentPaste(attachments: SavedTerminalAttachment[]): string {
  return (
    attachments
      .map(
        (attachment) =>
          `[Attachment ${attachment.label}](${formatMarkdownDestination(attachment.path)})`,
      )
      .join(TERMINAL_NEWLINE_SEQUENCE) + TERMINAL_NEWLINE_SEQUENCE
  );
}

async function fileToAttachment(file: File): Promise<TerminalAttachment> {
  return {
    dataUrl: await readFileAsDataUrl(file),
    name: file.name,
    mimeType: file.type,
    label: labelFromFile(file),
    size: file.size,
  };
}

async function filesToAttachments(files: File[]): Promise<TerminalAttachment[]> {
  const attachments: TerminalAttachment[] = [];
  for (const file of files) {
    attachments.push(await fileToAttachment(file));
  }
  return attachments;
}

interface AttachTerminalFilePasteOptions {
  container: HTMLElement;
  projectPath: string;
  taskId: string;
  onInput: (data: string) => void;
  onError?: (error: unknown) => void;
}

export function attachTerminalFilePaste({
  container,
  projectPath,
  taskId,
  onInput,
  onError,
}: AttachTerminalFilePasteOptions): () => void {
  if (APP_PLATFORM !== "macos") {
    return () => {};
  }

  let disposed = false;
  let settings: TerminalAttachmentPasteSettings = {
    enabled: false,
    maxSizeMb: DEFAULT_TERMINAL_ATTACHMENT_MAX_SIZE_MB,
    maxCount: DEFAULT_TERMINAL_ATTACHMENT_MAX_COUNT,
  };

  const loadSettings = () => {
    invoke<AppSettings>("load_app_settings")
      .then((loaded) => {
        if (!disposed) {
          settings = normalizeAttachmentPasteSettings(loaded);
        }
      })
      .catch(() => {
        settings = defaultAttachmentPasteSettings();
      });
  };

  const handlePaste = (event: ClipboardEvent) => {
    if (!settings.enabled) return;

    const items = Array.from(event.clipboardData?.items ?? []);
    const files = items
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (files.length === 0) return;

    if (files.length > settings.maxCount) {
      event.preventDefault();
      event.stopPropagation();
      onError?.(
        new Error(
          `Too many attachments: ${files.length} files exceeds the task limit of ${settings.maxCount}.`,
        ),
      );
      return;
    }

    const maxSizeBytes = settings.maxSizeMb * 1024 * 1024;
    const oversized = files.find((file) => file.size > maxSizeBytes);
    if (oversized) {
      event.preventDefault();
      event.stopPropagation();
      onError?.(
        new Error(
          `Attachment ${oversized.name} is larger than the ${settings.maxSizeMb} MB limit.`,
        ),
      );
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    filesToAttachments(files)
      .then((files) =>
        invoke<SavedTerminalAttachment[]>("save_terminal_files", {
          projectPath,
          taskId,
          files,
        }),
      )
      .then((attachments) => {
        if (disposed || attachments.length === 0) return;
        onInput(formatTerminalAttachmentPaste(attachments));
      })
      .catch((error: unknown) => {
        if (!disposed) {
          onError?.(error);
        }
      });
  };

  loadSettings();
  window.addEventListener(APP_SETTINGS_CHANGED_EVENT, loadSettings);
  container.addEventListener("paste", handlePaste, true);

  return () => {
    disposed = true;
    window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, loadSettings);
    container.removeEventListener("paste", handlePaste, true);
  };
}
