import { useState } from "react";
import { X } from "lucide-react";
import type { AgentType, PermissionMode } from "../../types";
import { permissionModeLabel } from "../../types";
import s from "../../styles";

const AGENTS: AgentType[] = ["claude", "codex"];
const PERMS: PermissionMode[] = ["ask", "auto_edit", "full_access"];

export function TaskEditDialog({
  initialPrompt,
  initialAgent,
  initialPermMode,
  onSave,
  onCancel,
}: {
  initialPrompt: string;
  initialAgent: AgentType;
  initialPermMode: PermissionMode;
  onSave: (updates: { prompt: string; agent: AgentType; permissionMode: PermissionMode }) => void;
  onCancel: () => void;
}) {
  const [editPrompt, setEditPrompt] = useState(initialPrompt);
  const [editAgent, setEditAgent] = useState<AgentType>(initialAgent);
  const [editPermMode, setEditPermMode] = useState<PermissionMode>(initialPermMode);

  return (
    <>
      <textarea
        value={editPrompt}
        onChange={(e) => setEditPrompt(e.target.value)}
        autoFocus
        style={{
          width: "100%",
          boxSizing: "border-box",
          minHeight: 120,
          maxHeight: 320,
          padding: "10px 12px",
          border: "1px solid var(--border-medium)",
          borderRadius: 6,
          background: "var(--bg-hover)",
          color: "var(--text-primary)",
          fontSize: 14,
          lineHeight: 1.65,
          fontFamily: "var(--font-ui)",
          resize: "vertical",
          outline: "none",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          style={{ ...s.toolbarBtn, fontSize: 12 }}
          onClick={() => setEditAgent(AGENTS[(AGENTS.indexOf(editAgent) + 1) % AGENTS.length])}
        >
          {editAgent === "claude" ? "Claude Code" : "Codex"}
        </button>
        <button
          style={{ ...s.toolbarBtn, fontSize: 12 }}
          onClick={() => {
            setEditPermMode(PERMS[(PERMS.indexOf(editPermMode) + 1) % PERMS.length]);
          }}
        >
          {permissionModeLabel(editPermMode, editAgent)}
        </button>
        <div style={{ flex: 1 }} />
        <button
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "5px 12px",
            background: "transparent",
            color: "var(--text-muted)",
            border: "1px solid var(--border-dim)",
            borderRadius: 6,
            fontSize: 12,
            cursor: "pointer",
          }}
          onClick={onCancel}
        >
          <X size={11} strokeWidth={2} />
          Cancel
        </button>
        <button
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            background: editPrompt.trim() ? "var(--primary-action-bg)" : "var(--bg-hover)",
            color: editPrompt.trim() ? "var(--primary-action-fg)" : "var(--text-hint)",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: editPrompt.trim() ? "pointer" : "not-allowed",
          }}
          disabled={!editPrompt.trim()}
          onClick={() => {
            if (!editPrompt.trim()) return;
            onSave({
              prompt: editPrompt.trim(),
              agent: editAgent,
              permissionMode: editPermMode,
            });
          }}
        >
          Save
        </button>
      </div>
    </>
  );
}
