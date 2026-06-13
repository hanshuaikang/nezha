import type React from "react";

import { common } from "./common";
import { dialogs } from "./dialogs";
import { font } from "./font";
import { gitDiff } from "./git-diff";
import { kanban } from "./kanban";
import { layout } from "./layout";
import { panels } from "./panels";
import { skillHub } from "./skill-hub";
import { task } from "./task";
import { terminal } from "./terminal";
import { timeline } from "./timeline";

const s = {
  ...layout,
  ...panels,
  ...terminal,
  ...dialogs,
  ...task,
  ...gitDiff,
  ...common,
  ...font,
  ...timeline,
  ...kanban,
  ...skillHub,
} satisfies Record<string, React.CSSProperties>;

export default s;

export {
  common,
  dialogs,
  font,
  gitDiff,
  kanban,
  layout,
  panels,
  skillHub,
  task,
  terminal,
  timeline,
};
