#!/usr/bin/env node
// Nezha hook bridge — managed by the Nezha desktop app.
// 仅在 NEZHA_TASK_ID + NEZHA_EVENT_DIR 同时存在时收集事件,
// 其它场景(用户手动启动 claude/codex)直接退出,零副作用。

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const taskId = process.env.NEZHA_TASK_ID;
const eventDir = process.env.NEZHA_EVENT_DIR;
if (!taskId || !eventDir) {
  process.exit(0);
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const payload = raw ? JSON.parse(raw) : {};
    const line =
      JSON.stringify({
        ts: Date.now(),
        task_id: taskId,
        agent: process.env.NEZHA_AGENT || "",
        event: payload.hook_event_name || "",
        session_id: payload.session_id || "",
        transcript_path: payload.transcript_path || "",
        cwd: payload.cwd || "",
        tool_name: payload.tool_name || "",
        permission_mode: payload.permission_mode || "",
      }) + "\n";
    mkdirSync(eventDir, { recursive: true });
    appendFileSync(join(eventDir, "events.jsonl"), line);
  } catch {
    // 永远不要让 hook 失败导致 agent 阻塞
  }
  process.exit(0);
});
