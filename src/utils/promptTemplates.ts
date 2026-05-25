import type { AgentType, Project, PromptTemplate } from "../types";

export interface PromptTemplateVariables {
  project: Project;
  branch?: string;
  agent: AgentType;
  now?: Date;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolvePromptTemplate(
  template: PromptTemplate,
  variables: PromptTemplateVariables,
): string {
  const values: Record<string, string> = {
    projectName: variables.project.name,
    projectPath: variables.project.path,
    branch: variables.branch ?? "",
    date: formatDate(variables.now ?? new Date()),
    agent: variables.agent,
  };

  return template.content.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match;
  });
}
