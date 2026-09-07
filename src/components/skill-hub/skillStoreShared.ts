import claudeLogo from "../../assets/claude.svg";
import chatgptLogo from "../../assets/chatgpt.svg";
import type { AgentType } from "../../types";

/** 技能商店支持一键安装的智能体（与后端 install_skill 的白名单一致） */
export const SKILL_STORE_AGENTS: readonly AgentType[] = ["claude", "codex"];

export const SKILL_STORE_AGENT_LABEL: Record<AgentType, string> = {
  claude: "Claude",
  codex: "Codex",
};

export const SKILL_STORE_AGENT_LOGO: Record<AgentType, string> = {
  claude: claudeLogo,
  codex: chatgptLogo,
};

/** 安装记录的唯一键：同一 skill 在同一项目下按 agent 各占一条 */
export function skillInstallKey(skillName: string, agent: AgentType): string {
  return `${skillName}::${agent}`;
}
