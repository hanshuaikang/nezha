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

// 不同 agent 的 payload 字段名不一致:Claude 用 hook_event_name / session_id,
// Codex 用 event_name / conversation_id;再退到 agent 自带的环境变量。
const pick = (payload, ...keys) => {
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === "string" && v) return v;
  }
  return "";
};

let raw = "";
let done = false;

// 用已收集到的 stdin 内容落盘并退出。幂等:end / error / uncaughtException
// 任一触发都只执行一次,且永远 exit 0——绝不让 hook 失败影响 agent。
function finish() {
  if (done) return;
  done = true;
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
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", finish);
// Windows 关键修复:agent 写完 payload 关闭 stdin 管道后,Node 读取
// 管道 stdin 到 EOF 时会抛出 `EOF: end of file, read` 的 'error' 事件(Unix 下
// 则干净触发 'end')。流上的 'error' 无监听器会变成未捕获异常,令进程以 exit 1
// 退出,agent 即报 "hook exited with code 1"。此时 'data' 已收齐 payload,按
// 正常流程落盘即可。
process.stdin.on("error", finish);
// 兜底:任何未预期的同步/异步异常都不得令 hook 以非 0 退出。
process.on("uncaughtException", finish);
