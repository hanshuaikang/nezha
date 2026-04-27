import { useRef } from "react";
import {
  ArrowUp,
  BookmarkPlus,
  ChevronDown,
  Hand,
  Image as ImageIcon,
  Map as MapIcon,
  Plus,
} from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import * as Select from "@radix-ui/react-select";
import type { AgentType, PermissionMode } from "../../types";
import { permissionModeLabel } from "../../types";
import { useI18n } from "../../i18n";
import s from "../../styles";
import claudeLogo from "../../assets/claude.svg";
import chatgptLogo from "../../assets/chatgpt.svg";

const AGENTS: AgentType[] = ["claude", "codex"];
const PERMS: PermissionMode[] = ["ask", "auto_edit", "full_access"];

function agentLabel(agent: AgentType): string {
  return agent === "claude" ? "Claude Code" : "Codex";
}

function agentIcon(agent: AgentType): string {
  return agent === "claude" ? claudeLogo : chatgptLogo;
}

function setMenuItemHover(el: HTMLElement, hover: boolean) {
  el.style.background = hover ? "var(--accent-subtle)" : "transparent";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result;
      if (typeof dataUrl === "string") {
        resolve(dataUrl);
      } else {
        reject(new Error("Image file did not produce a data URL."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

export function AgentPermSelector({
  agent,
  permMode,
  planMode,
  isEmpty,
  hasImages,
  sendShortcutLabel,
  onSetAgent,
  onSetPermMode,
  onTogglePlanMode,
  onAddImages,
  onSubmit,
}: {
  agent: AgentType;
  permMode: PermissionMode;
  planMode: boolean;
  isEmpty: boolean;
  hasImages: boolean;
  sendShortcutLabel: string;
  onSetAgent: (agent: AgentType) => void;
  onSetPermMode: (mode: PermissionMode) => void;
  onTogglePlanMode: () => void;
  onAddImages: (dataUrls: string[]) => void;
  onSubmit: (immediate: boolean) => void;
}) {
  const { t } = useI18n();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const canSend = !isEmpty || hasImages;

  async function handleImageFiles(files: FileList | null) {
    const images = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;

    const results = await Promise.allSettled(images.map(fileToDataUrl));
    const dataUrls = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    if (dataUrls.length > 0) {
      onAddImages(dataUrls);
    }
  }

  return (
    <div style={s.toolbar}>
      <div style={s.toolbarLeft}>
        <Popover.Root>
          <Popover.Trigger asChild>
            <button style={s.toolbarPlusBtn} aria-label={t("newTask.moreComposeActions")}>
              <Plus size={16} strokeWidth={1.9} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="top"
              align="start"
              sideOffset={8}
              style={s.toolbarActionMenuContent}
            >
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => {
                  void handleImageFiles(e.currentTarget.files);
                  e.currentTarget.value = "";
                }}
              />
              <button
                style={{ ...s.toolbarMenuItem, width: "100%", border: "none", background: "none" }}
                onClick={() => imageInputRef.current?.click()}
                onMouseEnter={(e) => setMenuItemHover(e.currentTarget, true)}
                onMouseLeave={(e) => setMenuItemHover(e.currentTarget, false)}
                onFocus={(e) => setMenuItemHover(e.currentTarget, true)}
                onBlur={(e) => setMenuItemHover(e.currentTarget, false)}
              >
                <ImageIcon size={15} strokeWidth={2} color="var(--text-muted)" />
                {t("newTask.images")}
              </button>

              <div style={s.toolbarMenuSeparator} />

              <button
                role="switch"
                aria-checked={planMode}
                style={{
                  ...s.toolbarMenuItem,
                  width: "100%",
                  border: "none",
                  background: "none",
                  justifyContent: "space-between",
                }}
                onClick={onTogglePlanMode}
                onMouseEnter={(e) => setMenuItemHover(e.currentTarget, true)}
                onMouseLeave={(e) => setMenuItemHover(e.currentTarget, false)}
                onFocus={(e) => setMenuItemHover(e.currentTarget, true)}
                onBlur={(e) => setMenuItemHover(e.currentTarget, false)}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <MapIcon size={15} strokeWidth={2} color="var(--text-muted)" />
                  {t("newTask.planMode")}
                </span>
                <span
                  style={{
                    ...s.toolbarSwitchTrack,
                    background: planMode ? "var(--primary-action-bg)" : "var(--border-medium)",
                  }}
                >
                  <span
                    style={{
                      ...s.toolbarSwitchThumb,
                      transform: planMode ? "translateX(16px)" : "translateX(0)",
                    }}
                  />
                </span>
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <Select.Root value={agent} onValueChange={(v) => onSetAgent(v as AgentType)}>
          <Select.Trigger style={s.toolbarBtn} aria-label={t("settings.agent")}>
            <img
              src={agentIcon(agent)}
              style={{
                ...s.toolbarMenuItemIcon,
                opacity: agent === "claude" ? 1 : 0.72,
              }}
            />
            <span>{agentLabel(agent)}</span>
            <Select.Icon>
              <ChevronDown size={12} strokeWidth={2.5} style={{ opacity: 0.58 }} />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content position="popper" sideOffset={6} style={s.toolbarMenuContent}>
              <Select.Viewport>
                {AGENTS.map((item) => (
                  <Select.Item
                    key={item}
                    value={item}
                    style={s.toolbarMenuItem}
                    onFocus={(e) => setMenuItemHover(e.currentTarget, true)}
                    onBlur={(e) => setMenuItemHover(e.currentTarget, false)}
                    onMouseEnter={(e) => setMenuItemHover(e.currentTarget, true)}
                    onMouseLeave={(e) => setMenuItemHover(e.currentTarget, false)}
                  >
                    <img
                      src={agentIcon(item)}
                      style={{
                        ...s.toolbarMenuItemIcon,
                        opacity: item === "claude" ? 1 : 0.72,
                      }}
                    />
                    <Select.ItemText>{agentLabel(item)}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <Select.Root value={permMode} onValueChange={(v) => onSetPermMode(v as PermissionMode)}>
          <Select.Trigger style={s.toolbarBtn} aria-label={t("settings.defaultPermissionMode")}>
            <Hand size={14} strokeWidth={2} color="var(--text-muted)" />
            <Select.Value />
            <Select.Icon>
              <ChevronDown size={12} strokeWidth={2.5} style={{ opacity: 0.58 }} />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content position="popper" sideOffset={6} style={s.toolbarMenuContent}>
              <Select.Viewport>
                {PERMS.map((perm) => (
                  <Select.Item
                    key={perm}
                    value={perm}
                    style={s.toolbarMenuItem}
                    onFocus={(e) => setMenuItemHover(e.currentTarget, true)}
                    onBlur={(e) => setMenuItemHover(e.currentTarget, false)}
                    onMouseEnter={(e) => setMenuItemHover(e.currentTarget, true)}
                    onMouseLeave={(e) => setMenuItemHover(e.currentTarget, false)}
                  >
                    <Select.ItemText>
                      {permissionModeLabel(perm, agent)}
                    </Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

      </div>

      <div style={s.toolbarSpacer} />

      <div style={s.sendSplit}>
        <button
          style={{
            ...s.sendBtn,
            borderRadius: "6px 0 0 6px",
            borderRight: "1px solid rgba(255,255,255,0.18)",
            opacity: canSend ? 1 : 0.4,
            cursor: canSend ? "pointer" : "not-allowed",
          }}
          onClick={() => {
            if (canSend) onSubmit(true);
          }}
        >
          <ArrowUp size={13} strokeWidth={2.1} />
          <span>{t("newTask.send")}</span>
          <kbd style={s.kbd}>{sendShortcutLabel}</kbd>
        </button>
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              style={{
                ...s.sendBtn,
                minWidth: 22,
                minHeight: 32,
                padding: "6px 5px",
                borderRadius: "0 6px 6px 0",
                borderLeft: "none",
                opacity: canSend ? 1 : 0.4,
                cursor: canSend ? "pointer" : "not-allowed",
              }}
              disabled={!canSend}
            >
              <ChevronDown size={12} strokeWidth={2.5} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="bottom"
              align="end"
              sideOffset={6}
              style={s.toolbarMenuContent}
            >
              <Popover.Close asChild>
                <button
                  style={{
                    ...s.toolbarMenuItem,
                    gap: 8,
                    width: "100%",
                    border: "none",
                    background: "transparent",
                    cursor: hasImages ? "not-allowed" : "pointer",
                    opacity: hasImages ? 0.4 : 1,
                  }}
                  title={hasImages ? t("newTask.imagesMustSend") : undefined}
                  onClick={() => {
                    if (hasImages) return;
                    if (!isEmpty) onSubmit(false);
                  }}
                >
                  <BookmarkPlus size={13} strokeWidth={2} color="var(--text-muted)" />
                  {t("newTask.saveAsTodo")}
                </button>
              </Popover.Close>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  );
}
