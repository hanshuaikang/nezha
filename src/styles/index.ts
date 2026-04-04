import type React from "react";

import { common } from "./common";
import { dialogs } from "./dialogs";
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
  ...common,
} satisfies Record<string, React.CSSProperties>;

export default s;

export { common, dialogs, layout, panels, task, terminal };
