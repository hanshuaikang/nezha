import { Send, BookmarkPlus, ChevronDown, Map as MapIcon } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import * as Select from "@radix-ui/react-select";
import type { AgentType, PermissionMode } from "../../types";
import { permissionModeLabel } from "../../types";
import s from "../../styles";
import claudeLogo from "../../assets/claude.svg";
import chatgptLogo from "../../assets/chatgpt.svg";

const AGENTS: AgentType[] = ["claude", "codex"];
const PERMS: PermissionMode[] = ["ask", "auto_edit", "full_access"];

export function AgentPermSelector({
  agent,
  permMode,
  planMode,
  isEmpty,
  hasImages,
  onSetAgent,
  onSetPermMode,
  onTogglePlanMode,
  onSubmit,
}: {
  agent: AgentType;
  permMode: PermissionMode;
  planMode: boolean;
  isEmpty: boolean;
  hasImages: boolean;
  onSetAgent: (agent: AgentType) => void;
  onSetPermMode: (mode: PermissionMode) => void;
  onTogglePlanMode: () => void;
  onSubmit: (immediate: boolean) => void;
}) {
  const canSend = !isEmpty || hasImages;

  return (
    <div style={s.toolbar}>
      <button
        style={s.toolbarBtn}
        onClick={() => onSetAgent(AGENTS[(AGENTS.indexOf(agent) + 1) % AGENTS.length])}
      >
        <img
          src={agent === "claude" ? claudeLogo : chatgptLogo}
          style={{ width: 14, height: 14, opacity: agent === "claude" ? 1 : 0.7 }}
        />
        <span style={{ fontSize: 13 }}>{agent === "claude" ? "Claude Code" : "Codex"}</span>
      </button>

      <Select.Root
        value={permMode}
        onValueChange={(v) => onSetPermMode(v as PermissionMode)}
      >
        <Select.Trigger style={s.toolbarBtn}>
          <Select.Value />
          <Select.Icon>
            <ChevronDown size={11} strokeWidth={2.5} style={{ opacity: 0.6 }} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={6}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-medium)",
              borderRadius: 8,
              boxShadow: "var(--shadow-md)",
              padding: 4,
              minWidth: 160,
              zIndex: 9999,
            }}
          >
            <Select.Viewport>
              {PERMS.map((perm) => (
                <Select.Item
                  key={perm}
                  value={perm}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "7px 10px",
                    borderRadius: 5,
                    fontSize: 13,
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    outline: "none",
                    userSelect: "none",
                  }}
                  onFocus={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--accent-subtle)";
                  }}
                  onBlur={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--accent-subtle)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <Select.ItemText>{permissionModeLabel(perm, agent)}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      <button
        style={{
          ...s.toolbarBtn,
          ...(planMode
            ? {
                background: "var(--accent-subtle)",
                border: "1px solid var(--accent)",
                color: "var(--accent)",
              }
            : {}),
        }}
        onClick={onTogglePlanMode}
        title="Append 'Please use plan mode' to your prompt"
      >
        <MapIcon size={13} />
        <span style={{ fontSize: 13 }}>Plan Mode</span>
      </button>

      <div style={{ flex: 1 }} />

      {/* Split send button */}
      <div style={{ display: "inline-flex" }}>
        {/* Primary send button */}
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
          <Send size={13} strokeWidth={2} />
          <span>Send</span>
          <kbd style={s.kbd}>⌘↵</kbd>
        </button>
        {/* Dropdown toggle via Radix Popover (Portal avoids overflow clipping) */}
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              style={{
                ...s.sendBtn,
                borderRadius: "0 6px 6px 0",
                padding: "6px 7px",
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
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-medium)",
                borderRadius: 8,
                boxShadow: "var(--shadow-md)",
                padding: 4,
                minWidth: 160,
                zIndex: 9999,
              }}
            >
              <Popover.Close asChild>
                <button
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "7px 10px",
                    border: "none",
                    borderRadius: 5,
                    background: "transparent",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    cursor: hasImages ? "not-allowed" : "pointer",
                    opacity: hasImages ? 0.4 : 1,
                  }}
                  title={hasImages ? "含图片的任务须立即发送" : undefined}
                  onClick={() => {
                    if (hasImages) return;
                    if (!isEmpty) onSubmit(false);
                  }}
                >
                  <BookmarkPlus size={13} strokeWidth={2} color="var(--text-muted)" />
                  Save as Todo
                </button>
              </Popover.Close>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  );
}
