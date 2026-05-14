import s from "../../styles";
import { FileIcon } from "./FileIcon";
import { type CreateKind } from "./types";

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
      style={{ ...s.fileTreeCreateRow, paddingLeft: 8 + depth * 14 }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <span style={s.fileTreeChevronSpacer} />
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
        style={s.fileTreeCreateInput}
      />
    </div>
  );
}
