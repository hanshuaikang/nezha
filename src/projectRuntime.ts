import { APP_PLATFORM } from "./platform";
import type { Project, ProjectRuntime } from "./types";

export function normalizeProjectRuntime(runtime?: ProjectRuntime): ProjectRuntime {
  return runtime ?? { kind: "local" };
}

export function getLocalRuntimeLabel(): string {
  if (APP_PLATFORM === "windows") return "Windows";
  if (APP_PLATFORM === "macos") return "macOS";
  return "Linux";
}

export function getProjectRuntimeLabel(project: Project): string {
  const runtime = normalizeProjectRuntime(project.runtime);
  if (runtime.kind === "wsl") return runtime.distro;
  return getLocalRuntimeLabel();
}

export function getProjectRuntimeBadge(project: Project): string {
  const runtime = normalizeProjectRuntime(project.runtime);
  if (runtime.kind === "wsl") return `WSL: ${runtime.distro}`;
  return getLocalRuntimeLabel();
}

export function getProjectDisplayPath(project: Project): string {
  const runtime = normalizeProjectRuntime(project.runtime);
  if (runtime.kind === "wsl") return runtime.linuxPath;
  return project.path;
}

export function getProjectRuntimeTitle(project: Project): string {
  const runtime = normalizeProjectRuntime(project.runtime);
  if (runtime.kind !== "wsl") {
    return `Runtime: ${getLocalRuntimeLabel()}\nPath: ${project.path}`;
  }

  const lines = [`Runtime: WSL`, `Distro: ${runtime.distro}`, `Path: ${runtime.linuxPath}`];
  if (runtime.uncPath) lines.push(`UNC: ${runtime.uncPath}`);
  return lines.join("\n");
}
