import { useRef, useState } from "react";
import {
  BookmarkPlus,
  ChevronDown,
  Command,
  CornerDownLeft,
  Hand,
  Image as ImageIcon,
  Map as MapIcon,
  Plus,
} from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import * as Select from "@radix-ui/react-select";
import type { AgentType, PermissionMode } from "../../types";
import { AGENT_TYPES, agentLabel, permissionModeLabel } from "../../types";
import { useI18n } from "../../i18n";
import s from "../../styles";
import claudeLogo from "../../assets/claude.svg";
import chatgptLogo from "../../assets/chatgpt.svg";

const PERMS: PermissionMode[] = ["ask", "auto_edit", "full_access"];

function AgentIcon({ agent }: { agent: AgentType }) {
  if (agent === "pi") {
    return <span style={s.toolbarMenuItemPiIcon}>π</span>;
  }
  return (
    <img
      src={agent === "claude" ? claudeLogo : chatgptLogo}
      style={agent === "codex" ? s.toolbarMenuItemCodexIcon : s.toolbarMenuItemIcon}
    />
  );
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

function SendShortcutIcon({ keys }: { keys: string[] }) {
  const modifierKey = keys.length > 1 ? keys[0] : null;

  return (
    <span style={s.sendShortcutIcon} aria-hidden="true">
      {modifierKey ? (
        modifierKey === "⌘" ? (
          <Command size={12} strokeWidth={2.2} />
        ) : (
          <span style={s.sendShortcutTextKey}>{modifierKey}</span>
        )
      ) : null}
      <CornerDownLeft size={13} strokeWidth={2.3} />
    </span>
  );
}

export function AgentPermSelector({
  agent,
  permMode,
  planMode,
  isEmpty,
  hasImages,
  saveAsTodoDisabledReason,
  sendShortcutKeys,
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
  saveAsTodoDisabledReason?: string;
  sendShortcutKeys: string[];
  onSetAgent: (agent: AgentType) => void;
  onSetPermMode: (mode: PermissionMode) => void;
  onTogglePlanMode: () => void;
  onAddImages: (dataUrls: string[]) => void;
  onSubmit: (immediate: boolean) => void;
}) {
  const { t } = useI18n();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const sendShortcutLabel = sendShortcutKeys.join("");
  const sendLabel = isEmpty && !hasImages ? t("newTask.startTerminal") : t("newTask.send");
  const saveAsTodoDisabled = hasImages || !!saveAsTodoDisabledReason;
  const saveAsTodoTitle = hasImages
    ? t("newTask.imagesMustSend")
    : saveAsTodoDisabledReason;

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
                style={s.toolbarHiddenFileInput}
                onChange={(e) => {
                  void handleImageFiles(e.currentTarget.files);
                  e.currentTarget.value = "";
                }}
              />
              <button
                style={
                  hoveredItem === "images" ? s.toolbarMenuButtonHover : s.toolbarMenuButton
                }
                onClick={() => imageInputRef.current?.click()}
                onMouseEnter={() => setHoveredItem("images")}
                onMouseLeave={() => setHoveredItem(null)}
                onFocus={() => setHoveredItem("images")}
                onBlur={() => setHoveredItem(null)}
              >
                <ImageIcon size={15} strokeWidth={2} color="var(--text-muted)" />
                {t("newTask.images")}
              </button>

              <div style={s.toolbarMenuSeparator} />

              <button
                role="switch"
                aria-checked={planMode}
                style={
                  hoveredItem === "planMode"
                    ? s.toolbarMenuSwitchButtonHover
                    : s.toolbarMenuSwitchButton
                }
                onClick={onTogglePlanMode}
                onMouseEnter={() => setHoveredItem("planMode")}
                onMouseLeave={() => setHoveredItem(null)}
                onFocus={() => setHoveredItem("planMode")}
                onBlur={() => setHoveredItem(null)}
              >
                <span style={s.toolbarMenuInlineLabel}>
                  <MapIcon size={15} strokeWidth={2} color="var(--text-muted)" />
                  {t("newTask.planMode")}
                </span>
                <span style={planMode ? s.toolbarSwitchTrackOn : s.toolbarSwitchTrack}>
                  <span style={planMode ? s.toolbarSwitchThumbOn : s.toolbarSwitchThumb} />
                </span>
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <Select.Root value={agent} onValueChange={(v) => onSetAgent(v as AgentType)}>
          <Select.Trigger style={s.toolbarBtn} aria-label={t("settings.agent")}>
            <AgentIcon agent={agent} />
            <span>{agentLabel(agent)}</span>
            <Select.Icon>
              <ChevronDown size={12} strokeWidth={2.5} style={s.toolbarChevronIcon} />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content position="popper" sideOffset={6} style={s.toolbarMenuContent}>
              <Select.Viewport>
                {AGENT_TYPES.map((item) => (
                  <Select.Item
                    key={item}
                    value={item}
                    style={
                      hoveredItem === `agent:${item}`
                        ? s.toolbarMenuItemHover
                        : s.toolbarMenuItem
                    }
                    onFocus={() => setHoveredItem(`agent:${item}`)}
                    onBlur={() => setHoveredItem(null)}
                    onMouseEnter={() => setHoveredItem(`agent:${item}`)}
                    onMouseLeave={() => setHoveredItem(null)}
                  >
                    <AgentIcon agent={item} />
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
              <ChevronDown size={12} strokeWidth={2.5} style={s.toolbarChevronIcon} />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content position="popper" sideOffset={6} style={s.toolbarMenuContent}>
              <Select.Viewport>
                {PERMS.map((perm) => (
                  <Select.Item
                    key={perm}
                    value={perm}
                    style={
                      hoveredItem === `perm:${perm}` ? s.toolbarMenuItemHover : s.toolbarMenuItem
                    }
                    onFocus={() => setHoveredItem(`perm:${perm}`)}
                    onBlur={() => setHoveredItem(null)}
                    onMouseEnter={() => setHoveredItem(`perm:${perm}`)}
                    onMouseLeave={() => setHoveredItem(null)}
                  >
                    <Select.ItemText>{permissionModeLabel(perm, agent)}</Select.ItemText>
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
          style={s.sendBtnPrimarySegment}
          onClick={() => {
            onSubmit(true);
          }}
          aria-label={`${sendLabel} (${sendShortcutLabel})`}
          title={sendShortcutLabel}
        >
          <span>{sendLabel}</span>
          <SendShortcutIcon keys={sendShortcutKeys} />
        </button>
        <Popover.Root>
          <Popover.Trigger asChild>
            <button style={s.sendBtnMenuSegment}>
              <ChevronDown size={12} strokeWidth={2.5} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content side="bottom" align="end" sideOffset={6} style={s.toolbarMenuContent}>
              <Popover.Close asChild>
                <button
                  style={
                    saveAsTodoDisabled ? s.saveTodoMenuItemDisabled : s.saveTodoMenuItem
                  }
                  disabled={saveAsTodoDisabled}
                  title={saveAsTodoTitle}
                  onClick={() => {
                    if (saveAsTodoDisabled) return;
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
