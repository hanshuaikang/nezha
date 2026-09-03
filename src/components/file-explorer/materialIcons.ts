import {
  DEFAULT_FILE_ICON,
  DEFAULT_FOLDER_ICON,
  DEFAULT_FOLDER_OPEN_ICON,
  fileIconName,
  folderIconName,
  pickAvailableIcon,
} from "./materialIconNames";

/**
 * File / folder icons from the Material Icon Theme
 * (https://github.com/material-extensions/vscode-material-icon-theme, MIT).
 *
 * Every SVG in the package becomes a hashed static asset via `import.meta.glob`;
 * the manifest lookup lives in `materialIconNames.ts`. Nothing from the package's
 * JS runtime is executed or bundled. Cost: ~340 KB in the main bundle (mapping
 * tables + 1.2k asset URLs) and ~1 MB of SVG files shipped alongside.
 */

/** icon name → asset URL, e.g. "react_ts" → "/assets/react_ts-abc123.svg". */
const ICON_URLS: Record<string, string> = {};
for (const [path, url] of Object.entries(
  import.meta.glob<string>("/node_modules/material-icon-theme/icons/*.svg", {
    eager: true,
    query: "?no-inline",
    import: "default",
  }),
)) {
  ICON_URLS[path.slice(path.lastIndexOf("/") + 1, -".svg".length)] = url;
}

const hasIcon = (iconName: string) => Object.prototype.hasOwnProperty.call(ICON_URLS, iconName);

export function getFileIconUrl(name: string, ext: string | undefined, isLight: boolean): string {
  return ICON_URLS[pickAvailableIcon(hasIcon, fileIconName(name, ext, isLight), DEFAULT_FILE_ICON)];
}

export function getFolderIconUrl(name: string, expanded: boolean, isLight: boolean): string {
  const fallback = expanded ? DEFAULT_FOLDER_OPEN_ICON : DEFAULT_FOLDER_ICON;
  return ICON_URLS[pickAvailableIcon(hasIcon, folderIconName(name, expanded, isLight), fallback)];
}
