import { CheckCircle2, XCircle, MinusCircle, Circle, Loader2, AlertCircle } from "lucide-react";
import type { TaskStatus } from "../types";

export function StatusIcon({ status }: { status: TaskStatus }) {
  switch (status) {
    case "running":
      return (
        <Loader2
          size={14}
          style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }}
        />
      );
    case "input_required":
      return <AlertCircle size={14} style={{ color: "var(--warning)" }} />;
    case "done":
      return <CheckCircle2 size={14} style={{ color: "var(--success)" }} />;
    case "failed":
      return <XCircle size={14} style={{ color: "var(--danger)" }} />;
    case "cancelled":
      return <MinusCircle size={14} style={{ color: "var(--text-hint)" }} />;
    default:
      return <Circle size={14} style={{ color: "var(--text-hint)" }} />;
  }
}
