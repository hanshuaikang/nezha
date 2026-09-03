import {
  file as DEFAULT_FILE_ICON,
  fileExtensions,
  fileNames,
  folder as DEFAULT_FOLDER_ICON,
  folderExpanded as DEFAULT_FOLDER_OPEN_ICON,
  folderNames,
  light,
} from "material-icon-theme/dist/material-icons.json";

/**
 * Manifest half of the Material Icon Theme integration: file / folder → icon name.
 * Pure and cheap to import (only the JSON tables); the asset URLs and the
 * `import.meta.glob` over 1.2k SVGs live in `materialIcons.ts` so tests can
 * exercise this logic without dragging every asset through the transform pipeline.
 */
export { DEFAULT_FILE_ICON, DEFAULT_FOLDER_ICON, DEFAULT_FOLDER_OPEN_ICON };

// Widened from the literal JSON types so arbitrary user file names can index them.
const FILE_EXTENSIONS: Record<string, string> = fileExtensions;
const FILE_NAMES: Record<string, string> = fileNames;
const FOLDER_NAMES: Record<string, string> = folderNames;
const LIGHT_FILE_EXTENSIONS: Record<string, string> = light.fileExtensions;
const LIGHT_FILE_NAMES: Record<string, string> = light.fileNames;
const LIGHT_FOLDER_NAMES: Record<string, string> = light.folderNames;
const LIGHT_FOLDER_NAMES_EXPANDED: Record<string, string> = light.folderNamesExpanded;

/** Own-property lookup: a file literally named "constructor" must not hit Object.prototype. */
function lookup(table: Record<string, string>, key: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

function lookupThemed(
  lightTable: Record<string, string>,
  table: Record<string, string>,
  key: string,
  isLight: boolean,
): string | undefined {
  return (isLight ? lookup(lightTable, key) : undefined) ?? lookup(table, key);
}

/** VS Code precedence: exact file name first, then the longest dotted suffix ("d.ts" beats "ts"). */
export function fileIconName(name: string, ext: string | undefined, isLight: boolean): string {
  const n = name.toLowerCase();
  const byName = lookupThemed(LIGHT_FILE_NAMES, FILE_NAMES, n, isLight);
  if (byName) return byName;

  const parts = n.split(".");
  for (let i = 1; i < parts.length; i++) {
    const hit = lookupThemed(
      LIGHT_FILE_EXTENSIONS,
      FILE_EXTENSIONS,
      parts.slice(i).join("."),
      isLight,
    );
    if (hit) return hit;
  }
  if (ext) {
    const hit = lookupThemed(LIGHT_FILE_EXTENSIONS, FILE_EXTENSIONS, ext.toLowerCase(), isLight);
    if (hit) return hit;
  }
  return DEFAULT_FILE_ICON;
}

export function folderIconName(name: string, expanded: boolean, isLight: boolean): string {
  const n = name.toLowerCase();
  if (isLight) {
    const hit = lookup(expanded ? LIGHT_FOLDER_NAMES_EXPANDED : LIGHT_FOLDER_NAMES, n);
    if (hit) return hit;
  }
  const base = lookup(FOLDER_NAMES, n);
  if (base) return expanded ? `${base}-open` : base;
  return expanded ? DEFAULT_FOLDER_OPEN_ICON : DEFAULT_FOLDER_ICON;
}

/**
 * Pick the first icon that actually exists.
 *
 * A few manifest entries point at "clone" icons that the extension generates at
 * build time and the npm package does not ship (e.g. "svelte_ts", "angular-component",
 * "folder-development-open"). Those degrade to their stem ("svelte", "angular",
 * "folder-open") and finally to `fallback`.
 */
export function pickAvailableIcon(
  isAvailable: (iconName: string) => boolean,
  iconName: string,
  fallback: string,
): string {
  const open = iconName.endsWith("-open");
  let stem = open ? iconName.slice(0, -"-open".length) : iconName;
  for (;;) {
    const candidate = open ? `${stem}-open` : stem;
    if (isAvailable(candidate)) return candidate;
    const cut = Math.max(stem.lastIndexOf("-"), stem.lastIndexOf("_"));
    if (cut <= 0) return fallback;
    stem = stem.slice(0, cut);
  }
}
