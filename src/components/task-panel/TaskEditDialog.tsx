import { useState } from "react";
import { X } from "lucide-react";
import type { AgentType, PermissionMode } from "../../types";
import { AGENT_TYPES, agentLabel, permissionModeLabel } from "../../types";
import { useI18n } from "../../i18n";
import s from "../../styles";

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
  const { t } = useI18n();
  const [editPrompt, setEditPrompt] = useState(initialPrompt);
  const [editAgent, setEditAgent] = useState<AgentType>(initialAgent);
  const [editPermMode, setEditPermMode] = useState<PermissionMode>(initialPermMode);

  return (
    <>
      <textarea
        value={editPrompt}
        onChange={(e) => setEditPrompt(e.target.value)}
        autoFocus
        style={s.taskEditTextarea}
      />
      <div style={s.taskEditActionsRow}>
        <button
          style={s.taskEditToolbarBtn}
          onClick={() =>
            setEditAgent(AGENT_TYPES[(AGENT_TYPES.indexOf(editAgent) + 1) % AGENT_TYPES.length])
          }
        >
          {agentLabel(editAgent)}
        </button>
        <button
          style={s.taskEditToolbarBtn}
          onClick={() => {
            setEditPermMode(PERMS[(PERMS.indexOf(editPermMode) + 1) % PERMS.length]);
          }}
        >
          {permissionModeLabel(editPermMode, editAgent)}
        </button>
        <div style={s.taskEditSpacer} />
        <button style={s.taskEditCancelBtn} onClick={onCancel}>
          <X size={11} strokeWidth={2} />
          {t("common.cancel")}
        </button>
        <button
          style={editPrompt.trim() ? s.taskEditSaveBtn : s.taskEditSaveBtnDisabled}
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
          {t("common.save")}
        </button>
      </div>
    </>
  );
}
