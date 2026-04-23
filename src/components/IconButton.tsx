import { useState } from "react";
import type { ReactNode } from "react";

export function IconButton({
  icon,
  title,
  active = false,
  disabled = false,
  onClick,
  size = 32,
}: {
  icon: ReactNode;
  title?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const showHover = hovered && !disabled && !active;

  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? "var(--control-active-bg)" : showHover ? "var(--bg-hover)" : "none",
        border: "none",
        borderRadius: 6,
        cursor: disabled ? "not-allowed" : "pointer",
        color: active ? "var(--control-active-fg)" : showHover ? "var(--text-muted)" : "var(--text-hint)",
        opacity: disabled ? 0.4 : 1,
        transition: "background 0.12s, color 0.12s",
        flexShrink: 0,
      }}
    >
      {icon}
    </button>
  );
}
