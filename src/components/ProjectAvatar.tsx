import type React from "react";
import { useProjectAppearance } from "../hooks/useProjectAppearance";
import type { ProjectAppearanceSource } from "../projectAvatar";

/**
 * 项目头像:预设色板渐变底 + 自动缩写。颜色 / 缩写由 useProjectAppearance 统一解析
 * (同屏去重),样式见 styles/project-rail.css 的 .project-avatar;尺寸通过 --avatar-size 注入。
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
  return (
    <div
      className={className ? `project-avatar ${className}` : "project-avatar"}
      data-avatar-color={appearance.color}
      data-avatar-len={appearance.label.length}
      style={sizeVar}
    >
      {appearance.label}
    </div>
  );
}
