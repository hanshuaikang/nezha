import s from "../../styles";
import { getFileColor } from "../../utils";
import { GITIGNORED_COLOR } from "./types";

export function FileIcon({
  name,
  ext,
  isDir,
  expanded,
  isGitignored,
}: {
  name: string;
  ext?: string;
  isDir: boolean;
  expanded?: boolean;
  isGitignored?: boolean;
}) {
  if (isDir) {
    const folderColor = isGitignored
      ? GITIGNORED_COLOR
      : expanded
        ? "var(--icon-folder-open)"
        : "var(--icon-folder)";
    return (
      <span style={{ ...s.fileIconFolder, color: folderColor }}>
        {expanded ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 3.5A1.5 1.5 0 012.5 2h3.764c.58 0 1.12.34 1.342.87l.496 1.13H13.5A1.5 1.5 0 0115 5.5v7A1.5 1.5 0 0113.5 14h-11A1.5 1.5 0 011 12.5v-9z" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 3.5A1.5 1.5 0 012.5 2h3.764c.58 0 1.12.34 1.342.87l.496 1.13H13.5A1.5 1.5 0 0115 5.5v7A1.5 1.5 0 0113.5 14h-11A1.5 1.5 0 011 12.5v-9zM2.5 3a.5.5 0 00-.5.5v9a.5.5 0 00.5.5h11a.5.5 0 00.5-.5v-7a.5.5 0 00-.5-.5H8l-.724-1.647A.5.5 0 007.264 3H2.5z" />
          </svg>
        )}
      </span>
    );
  }
  const color = isGitignored ? GITIGNORED_COLOR : getFileColor(name, ext);
  return <span style={{ ...s.fileIconFile, background: color }} />;
}
