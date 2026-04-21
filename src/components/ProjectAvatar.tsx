import type React from "react";
import { getAvatarGradient } from "../utils";

export function ProjectAvatar({
  name,
  size = 28,
  style: extraStyle,
}: {
  name: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  const [from, to] = getAvatarGradient(name);
  const initials =
    name.length >= 2
      ? (name[0] + (name.match(/[-_\s]([a-zA-Z])/)?.[1] ?? name[1])).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        flexShrink: 0,
        background: `linear-gradient(135deg, ${from}, ${to})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.38,
        fontWeight: 700,
        color: "var(--fg-on-accent)",
        letterSpacing: 0.3,
        boxShadow: `0 2px 5px ${from}55`,
        ...extraStyle,
      }}
    >
      {initials}
    </div>
  );
}
