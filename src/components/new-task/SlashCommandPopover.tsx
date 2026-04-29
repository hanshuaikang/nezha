import { useI18n } from "../../i18n";
import type { SlashCommand } from "./slashCommands";
import s from "../../styles";

export function SlashCommandPopover({
  commands,
  activeIndex,
  onSelect,
  onSetIndex,
}: {
  commands: SlashCommand[];
  activeIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onSetIndex: (index: number) => void;
}) {
  const { t } = useI18n();

  if (commands.length === 0) {
    return (
      <div style={s.mentionDropdown}>
        <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-hint)" }}>
          {t("slash.noResults")}
        </div>
      </div>
    );
  }

  return (
    <div style={s.mentionDropdown}>
      {commands.map((cmd, i) => {
        const Icon = cmd.icon;
        return (
          <div
            key={`${cmd.source}:${cmd.name}`}
            style={{
              ...s.mentionOption,
              background: i === activeIndex ? "var(--accent-subtle)" : "transparent",
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(cmd);
            }}
            onMouseEnter={() => onSetIndex(i)}
          >
            <span style={{ color: "var(--accent)", flexShrink: 0, display: "flex" }}>
              <Icon size={14} />
            </span>
            <span style={s.slashCommandName}>/{cmd.name}</span>
            <span style={s.slashCommandDesc}>{cmd.description}</span>
          </div>
        );
      })}
    </div>
  );
}
