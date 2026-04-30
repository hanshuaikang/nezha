import type { LucideIcon } from "lucide-react";
import {
  TestTubeDiagonal,
  Wrench,
  ScanSearch,
  RefreshCw,
  HelpCircle,
  FileText,
  Terminal,
  Sparkles,
} from "lucide-react";

export interface SlashCommand {
  name: string;
  icon: LucideIcon;
  description: string;
  template: string;
  source: "builtin" | "command" | "skill";
}

export const BUILTIN_COMMANDS: SlashCommand[] = [
  { name: "test", icon: TestTubeDiagonal, description: "Write tests for a file or function", template: "Write tests for ", source: "builtin" },
  { name: "fix", icon: Wrench, description: "Fix a bug in the code", template: "Fix the bug: ", source: "builtin" },
  { name: "review", icon: ScanSearch, description: "Review code for quality and issues", template: "Review the code in ", source: "builtin" },
  { name: "refactor", icon: RefreshCw, description: "Refactor code for clarity", template: "Refactor ", source: "builtin" },
  { name: "explain", icon: HelpCircle, description: "Explain how something works", template: "Explain how ", source: "builtin" },
  { name: "doc", icon: FileText, description: "Add documentation for code", template: "Add documentation for ", source: "builtin" },
];

export interface AgentSlashCommand {
  name: string;
  description: string;
  source: "command" | "skill";
}

export function agentCommandToSlash(cmd: AgentSlashCommand): SlashCommand {
  return {
    name: cmd.name,
    icon: cmd.source === "skill" ? Sparkles : Terminal,
    description: cmd.description,
    template: `/${cmd.name} `,
    source: cmd.source,
  };
}

export function buildSlashCommandList(agentCommands: AgentSlashCommand[]): SlashCommand[] {
  const builtinNames = new Set(BUILTIN_COMMANDS.map((c) => c.name));
  const dynamic = agentCommands
    .filter((c) => !builtinNames.has(c.name))
    .map(agentCommandToSlash);
  return [...BUILTIN_COMMANDS, ...dynamic];
}

export function filterSlashCommands(all: SlashCommand[], query: string): SlashCommand[] {
  if (!query) return all.slice(0, 20);
  const q = query.toLowerCase();
  return all.filter(
    (cmd) => cmd.name.toLowerCase().includes(q) || cmd.description.toLowerCase().includes(q),
  ).slice(0, 20);
}
