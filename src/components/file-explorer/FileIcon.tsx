import { useIsLightTheme } from "../../hooks/useIsLightTheme";
import { getFileIconUrl, getFolderIconUrl } from "./materialIcons";

/**
 * File / folder icon for explorer rows, search results, drag previews and the
 * create-input row. Renders a Material Icon Theme SVG as a plain <img>;
 * gitignored entries are greyed out purely in CSS (`data-ignored`).
 */
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
  const isLight = useIsLightTheme();
  const src = isDir
    ? getFolderIconUrl(name, Boolean(expanded), isLight)
    : getFileIconUrl(name, ext, isLight);
  return (
    <img
      className="file-icon"
      src={src}
      alt=""
      draggable={false}
      data-ignored={isGitignored || undefined}
      aria-hidden="true"
    />
  );
}
