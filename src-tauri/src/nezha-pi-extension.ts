// Nezha Pi event bridge -- managed by the Nezha desktop app.
// Loaded with `pi --extension` only for Nezha-launched Pi tasks.

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const taskId = process.env.NEZHA_TASK_ID || "";
const eventDir = process.env.NEZHA_EVENT_DIR || "";
const agent = process.env.NEZHA_AGENT || "";

function enabled() {
  return !!taskId && !!eventDir && agent === "pi";
}

function writeEvent(event: string, ctx?: any, extra: Record<string, unknown> = {}) {
  if (!enabled()) return;
  try {
    const sessionManager = ctx?.sessionManager;
    const sessionId = sessionManager?.getSessionId?.() || "";
    const sessionFile = sessionManager?.getSessionFile?.() || "";
    const line =
      JSON.stringify({
        ts: Date.now(),
        task_id: taskId,
        agent: "pi",
        event,
        session_id: sessionId,
        transcript_path: sessionFile,
        cwd: ctx?.cwd || "",
        ...extra,
      }) + "\n";
    mkdirSync(eventDir, { recursive: true });
    appendFileSync(join(eventDir, "events.jsonl"), line, "utf8");
    writeMetricsSidecar(ctx);
  } catch {
    // Never let bridge failures affect Pi.
  }
}

function writeMetricsSidecar(ctx?: any) {
  const sessionManager = ctx?.sessionManager;
  const sessionFile = sessionManager?.getSessionFile?.();
  if (!sessionFile) return;

  const contextUsage = ctx?.getContextUsage?.();
  const contextWindow =
    numberOrNull(contextUsage?.contextWindow) ?? numberOrNull(ctx?.model?.contextWindow);
  const contextTokens = numberOrNull(contextUsage?.tokens);
  if (!contextWindow && !contextTokens) return;

  const sidecarPath = `${sessionFile}.nezha-metrics.json`;
  const payload = {
    schema: 1,
    agent: "pi",
    task_id: taskId,
    session_id: sessionManager?.getSessionId?.() || "",
    session_path: sessionFile,
    updated_at: Date.now(),
    model: {
      id: ctx?.model?.id || ctx?.model?.modelId || "",
      name: ctx?.model?.name || "",
      context_window: contextWindow,
      max_tokens: numberOrNull(ctx?.model?.maxTokens),
    },
    context_usage: {
      tokens: contextTokens,
      context_window: contextWindow,
      percent: numberOrNull(contextUsage?.percent),
    },
  };

  mkdirSync(dirname(sidecarPath), { recursive: true });
  writeFileSync(sidecarPath, JSON.stringify(payload) + "\n", "utf8");
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export default function (pi: any) {
  if (!enabled()) return;

  pi.on("session_start", async (event: any, ctx: any) => {
    writeEvent("SessionStart", ctx, { reason: event?.reason || "" });
  });

  pi.on("input", async (_event: any, ctx: any) => {
    writeEvent("UserPromptSubmit", ctx);
  });

  pi.on("agent_start", async (_event: any, ctx: any) => {
    writeEvent("AgentStart", ctx);
  });

  pi.on("turn_start", async (_event: any, ctx: any) => {
    writeEvent("TurnStart", ctx);
  });

  pi.on("model_select", async (_event: any, ctx: any) => {
    writeEvent("ModelSelect", ctx);
  });

  pi.on("tool_execution_end", async (event: any, ctx: any) => {
    writeEvent("PostToolUse", ctx, {
      tool_name: event?.toolName || "",
      tool_call_id: event?.toolCallId || "",
      is_error: !!event?.isError,
    });
  });

  pi.on("agent_end", async (_event: any, ctx: any) => {
    writeEvent("Stop", ctx);
  });
}
