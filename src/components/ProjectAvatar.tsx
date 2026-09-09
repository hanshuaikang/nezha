import type React from "react";
import { useProjectAppearance } from "../hooks/useProjectAppearance";
import type { ProjectAppearanceSource } from "../projectAvatar";

/**
 * 项目头像:预设色板渐变底 + 缩写(或用户自定义的 emoji)。颜色 / 缩写由
 * useProjectAppearance 统一解析(同屏去重、自定义优先),样式见 styles/project-rail.css
 * 的 .project-avatar;尺寸通过 --avatar-size 注入。
 */
export function ProjectAvatar({
  project,
  size = 28,
  className,
}: {
  project: ProjectAppearanceSource;
  size?: number;
  className?: string;
}) {
  const appearance = useProjectAppearance(project);
  const sizeVar = { "--avatar-size": `${size}px` } as React.CSSProperties;
  const showEmoji = Boolean(appearance.emoji);
  return (
    <div
      className={className ? `project-avatar ${className}` : "project-avatar"}
      data-avatar-color={appearance.color}
      data-avatar-kind={showEmoji ? "emoji" : "label"}
      data-avatar-len={showEmoji ? undefined : appearance.label.length}
      style={sizeVar}
    >
      {showEmoji ? appearance.emoji : appearance.label}
    </div>
  );
}
