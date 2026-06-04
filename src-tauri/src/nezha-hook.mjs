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
// 不同 agent 的 payload 字段名不一致:Claude 用 hook_event_name / session_id,
// Codex 用 event_name / conversation_id;再退到 agent 自带的环境变量。
const pick = (payload, ...keys) => {
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === "string" && v) return v;
  }
  return "";
};

process.stdin.on("end", () => {
  try {
    const payload = raw ? JSON.parse(raw) : {};
    const line =
      JSON.stringify({
        ts: Date.now(),
        task_id: taskId,
        agent: process.env.NEZHA_AGENT || "",
        event: pick(payload, "hook_event_name", "event_name", "hookEventName", "event"),
        session_id:
          pick(payload, "session_id", "conversation_id", "sessionId", "conversationId") ||
          process.env.CODEX_SESSION_ID ||
          process.env.CLAUDE_CODE_SESSION_ID ||
          "",
        transcript_path: pick(payload, "transcript_path", "transcriptPath", "rollout_path"),
        cwd: pick(payload, "cwd"),
        tool_name: pick(payload, "tool_name", "toolName"),
        permission_mode: pick(payload, "permission_mode", "permissionMode"),
      }) + "\n";
    mkdirSync(eventDir, { recursive: true });
    appendFileSync(join(eventDir, "events.jsonl"), line);
  } catch {
    // 永远不要让 hook 失败导致 agent 阻塞
  }
  process.exit(0);
});
