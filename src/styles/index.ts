import type React from "react";

import { common } from "./common";
import { dialogs } from "./dialogs";
import { font } from "./font";
import { gitDiff } from "./git-diff";
import { layout } from "./layout";
import { panels } from "./panels";
import { task } from "./task";
import { terminal } from "./terminal";

const s = {
  ...layout,
  ...panels,
  ...terminal,
  ...dialogs,
  ...task,
  ...gitDiff,
  ...common,
  ...font,
} satisfies Record<string, React.CSSProperties>;

export default s;

export { common, dialogs, font, gitDiff, layout, panels, task, terminal };
