import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  resolveProjectAppearances,
  resolveSingleProjectAppearance,
  type ProjectAppearanceSource,
  type ResolvedProjectAppearance,
} from "../projectAvatar";

const ProjectAppearanceContext = createContext<Map<string, ResolvedProjectAppearance> | null>(null);

/**
 * 在 App 根部用全量 projects 解析一次头像外观(同屏缩写 / 颜色去重),
 * 各处 ProjectAvatar 通过 useProjectAppearance 读取,保证同一项目在 rail、抽屉、
 * 首页、头部显示一致。projects 列表变化(增删改名)才重算。
 */
export function ProjectAppearanceProvider({
  projects,
  children,
}: {
  projects: readonly ProjectAppearanceSource[];
  children: ReactNode;
}) {
  const value = useMemo(() => resolveProjectAppearances(projects), [projects]);
  return (
    <ProjectAppearanceContext.Provider value={value}>{children}</ProjectAppearanceContext.Provider>
  );
}

/** 读取单个项目的解析结果;不在 Provider 内(测试 / 孤立渲染)时退回单项目解析。 */
export function useProjectAppearance(project: ProjectAppearanceSource): ResolvedProjectAppearance {
  const byId = useContext(ProjectAppearanceContext);
  const fromProvider = byId?.get(project.id);
  return useMemo(
    () => fromProvider ?? resolveSingleProjectAppearance(project),
    [fromProvider, project],
  );
}
