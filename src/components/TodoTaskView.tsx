import { useState, useEffect } from "react";
import type { Task, AgentType, PermissionMode } from "../types";
import { permissionModeLabel } from "../types";
import { Play, Pencil } from "lucide-react";
import { TaskEditDialog } from "./task-panel/TaskEditDialog";

export function TodoTaskView({
  task,
  onRunTodo,
  onUpdateTodo,
}: {
  task: Task;
  onRunTodo: (task: Task) => void;
  onUpdateTodo: (
    taskId: string,
    updates: { prompt: string; agent: AgentType; permissionMode: PermissionMode },
  ) => void;
}) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setEditing(false);
  }, [task.id]);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 48px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 700,
          background: "var(--bg-card)",
          border: "1px solid var(--border-dim)",
          borderRadius: 10,
          padding: "24px 24px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-hint)",
              letterSpacing: 0.7,
              textTransform: "uppercase",
            }}
          >
            Pending Task
          </div>
          {!editing && (
            <button
              title="Edit task"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 26,
                height: 26,
                padding: 0,
                background: "transparent",
                border: "none",
                borderRadius: 5,
                color: "var(--text-hint)",
                cursor: "pointer",
              }}
              onClick={() => setEditing(true)}
            >
              <Pencil size={13} strokeWidth={2} />
            </button>
          )}
        </div>

        {editing ? (
          <TaskEditDialog
            initialPrompt={task.prompt}
            initialAgent={task.agent}
            initialPermMode={task.permissionMode}
            onSave={(updates) => {
              onUpdateTodo(task.id, updates);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <div
              style={{
                fontSize: 14,
                color: "var(--text-primary)",
                lineHeight: 1.65,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 240,
                overflowY: "auto",
              }}
            >
              {task.prompt}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              <span
                style={{
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-dim)",
                  borderRadius: 4,
                  padding: "2px 7px",
                }}
              >
                {task.agent === "claude" ? "Claude Code" : "Codex"}
              </span>
              <span
                style={{
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-dim)",
                  borderRadius: 4,
                  padding: "2px 7px",
                }}
              >
                {permissionModeLabel(task.permissionMode, task.agent)}
              </span>
              <button
                style={{
                  marginLeft: "auto",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 12px",
                  background: "var(--primary-action-bg)",
                  color: "var(--primary-action-fg)",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onClick={() => onRunTodo(task)}
              >
                <Play size={11} strokeWidth={2} fill="currentColor" />
                Run Now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
