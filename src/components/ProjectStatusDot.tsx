import type React from "react";
import s from "../styles";

export type ProjectStatusDotTone = "success" | "warning" | "error";

const toneColor: Record<ProjectStatusDotTone, string> = {
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  error: "var(--color-error)",
};

export function ProjectStatusDot({
  tone,
  borderColor,
  style,
}: {
  tone: ProjectStatusDotTone;
  borderColor: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        ...s.railStatusDot,
        background: toneColor[tone],
        borderColor,
        ...style,
      }}
    />
  );
}
