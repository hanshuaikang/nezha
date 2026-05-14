import { FileIcon } from "./FileIcon";
import { ROW_HEIGHT, type CreateKind } from "./types";

export function CreateInputRow({
  depth,
  kind,
  value,
  onChange,
  onCommit,
  onCancel,
  inputRef,
}: {
  depth: number;
  kind: CreateKind;
  value: string;
  onChange: (next: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        height: ROW_HEIGHT,
        paddingLeft: 8 + depth * 14,
        paddingRight: 8,
        margin: "0 4px",
        boxSizing: "border-box",
        background: "var(--bg-selected)",
        borderRadius: 4,
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <span style={{ width: 12, flexShrink: 0 }} />
      <FileIcon
        name={kind === "file" ? value || "untitled" : ""}
        ext={undefined}
        isDir={kind === "folder"}
        expanded={false}
      />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          // Commit is intentionally only triggered by Enter; blurring discards the input
          // to prevent racing the keyboard handler (which used to double-fire commit).
          onCancel();
        }}
        spellCheck={false}
        autoComplete="off"
        style={{
          flex: 1,
          minWidth: 0,
          height: 18,
          padding: "0 4px",
          fontSize: 12.5,
          fontFamily: "var(--font-ui)",
          color: "var(--text-primary)",
          background: "var(--bg-input, var(--bg-sidebar))",
          border: "1px solid var(--accent)",
          borderRadius: 3,
          outline: "none",
        }}
      />
    </div>
  );
}
