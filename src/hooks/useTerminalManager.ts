import { useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// ── Buffer constants ─────────────────────────────────────────────────────────

const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB per task (in-memory limit)
const MAX_BUFFER_CHUNKS = 256; // compact when chunks array exceeds this
const DRAIN_FRAME_BUDGET = 128 * 1024; // 每帧最多处理 128KB，避免单帧写入时间过长

// ── Buffer types & helpers ───────────────────────────────────────────────────

interface TaskBuffer {
  chunks: string[];
  totalLen: number;
  droppedLen: number;
}

export type TerminalWriteFn = (data: string, callback?: () => void) => void;

interface TerminalWriteState {
  pending: string[];
  ready: boolean;
  generation: number;
}

function createTaskBuffer(): TaskBuffer {
  return { chunks: [], totalLen: 0, droppedLen: 0 };
}

function createTerminalWriteState(generation = 0): TerminalWriteState {
  return { pending: [], ready: false, generation };
}

function pushToBuffer(buf: TaskBuffer, data: string): void {
  buf.chunks.push(data);
  buf.totalLen += data.length;
  while (buf.totalLen > MAX_BUFFER_SIZE && buf.chunks.length > 0) {
    const dropped = buf.chunks.shift()!;
    buf.totalLen -= dropped.length;
    buf.droppedLen += dropped.length;
  }
  if (buf.chunks.length > MAX_BUFFER_CHUNKS) {
    const merged = buf.chunks.join("");
    buf.chunks.length = 0;
    buf.chunks.push(merged);
  }
}

function getBufferAbsLen(buf: TaskBuffer): number {
  return buf.totalLen + buf.droppedLen;
}

function joinBufferFrom(buf: TaskBuffer, absOffset: number): string {
  const relOffset = absOffset - buf.droppedLen;
  if (relOffset <= 0) return buf.chunks.join("");
  let cum = 0;
  for (let i = 0; i < buf.chunks.length; i++) {
    const len = buf.chunks[i].length;
    if (cum + len > relOffset) {
      const parts = buf.chunks.slice(i);
      parts[0] = parts[0].slice(relOffset - cum);
      return parts.join("");
    }
    cum += len;
  }
  return "";
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTerminalManager() {
  const taskBufferRef = useRef<Record<string, TaskBuffer>>({});
  const terminalSnapshotRef = useRef<Record<string, { snapshot: string; bufferLength: number }>>(
    {},
  );
  const terminalWriteRefs = useRef<Record<string, TerminalWriteFn>>({});
  const terminalWriteStateRef = useRef<Record<string, TerminalWriteState>>({});
  const terminalSizeRef = useRef<{ cols: number; rows: number }>({ cols: 220, rows: 50 });

  // ── Write state management ───────────────────────────────────────────────

  const resetTerminalWriteState = useCallback((taskId: string) => {
    const prev = terminalWriteStateRef.current[taskId];
    const next = createTerminalWriteState((prev?.generation ?? 0) + 1);
    terminalWriteStateRef.current[taskId] = next;
    return next;
  }, []);

  const enqueueTerminalWrite = useCallback(
    (taskId: string, data: string) => {
      const state = terminalWriteStateRef.current[taskId] ?? resetTerminalWriteState(taskId);
      if (!state.ready) {
        state.pending.push(data);
        return;
      }
      const writeFn = terminalWriteRefs.current[taskId];
      if (writeFn) {
        writeFn(data);
      }
    },
    [resetTerminalWriteState],
  );

  // ── agent-output event listener ──────────────────────────────────────────

  useEffect(() => {
    const pendingOutputs = new Map<string, string[]>();
    let rafId = 0;

    function drainPendingOutputs() {
      rafId = 0;
      if (
        (
          navigator as unknown as {
            scheduling?: { isInputPending?: () => boolean };
          }
        ).scheduling?.isInputPending?.()
      ) {
        rafId = requestAnimationFrame(drainPendingOutputs);
        return;
      }
      let bytesThisFrame = 0;
      for (const [taskId, chunks] of pendingOutputs) {
        const joined = chunks.length === 1 ? chunks[0] : chunks.join("");

        if (terminalWriteRefs.current[taskId]) {
          enqueueTerminalWrite(taskId, joined);
        }
        if (taskId in taskBufferRef.current) {
          pushToBuffer(taskBufferRef.current[taskId], joined);
        }

        pendingOutputs.delete(taskId);
        bytesThisFrame += joined.length;
        if (bytesThisFrame >= DRAIN_FRAME_BUDGET) {
          break;
        }
      }
      if (pendingOutputs.size > 0 && !rafId) {
        rafId = requestAnimationFrame(drainPendingOutputs);
      }
    }

    const unlisten = listen<{ task_id: string; data: string }>("agent-output", (e) => {
      const { task_id, data } = e.payload;
      let arr = pendingOutputs.get(task_id);
      if (!arr) {
        arr = [];
        pendingOutputs.set(task_id, arr);
      }
      arr.push(data);
      if (!rafId) {
        rafId = requestAnimationFrame(drainPendingOutputs);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [enqueueTerminalWrite]);

  // ── Public API ───────────────────────────────────────────────────────────

  const resetTaskTerminal = useCallback((taskId: string) => {
    taskBufferRef.current[taskId] = createTaskBuffer();
    delete terminalSnapshotRef.current[taskId];
  }, []);

  const removeTaskBuffers = useCallback((taskIds: string[]) => {
    for (const taskId of taskIds) {
      delete taskBufferRef.current[taskId];
      delete terminalSnapshotRef.current[taskId];
      delete terminalWriteRefs.current[taskId];
      delete terminalWriteStateRef.current[taskId];
    }
  }, []);

  const writeErrorToTerminal = useCallback((taskId: string, errMsg: string) => {
    const writeFn = terminalWriteRefs.current[taskId];
    if (writeFn) {
      writeFn(errMsg);
    }
    const buf = taskBufferRef.current[taskId] ?? createTaskBuffer();
    pushToBuffer(buf, errMsg);
    taskBufferRef.current[taskId] = buf;
  }, []);

  const handleInput = useCallback((taskId: string, data: string) => {
    invoke("send_input", { taskId, data }).catch(console.error);
  }, []);

  const handleResize = useCallback((taskId: string, cols: number, rows: number) => {
    terminalSizeRef.current = { cols, rows };
    invoke("resize_pty", { taskId, cols, rows }).catch(console.error);
  }, []);

  const handleRegisterTerminal = useCallback(
    (taskId: string, fn: TerminalWriteFn | null): number => {
      const state = resetTerminalWriteState(taskId);
      if (fn) {
        terminalWriteRefs.current[taskId] = fn;
      } else {
        delete terminalWriteRefs.current[taskId];
      }
      return state.generation;
    },
    [resetTerminalWriteState],
  );

  const handleTerminalReady = useCallback((taskId: string, generation: number) => {
    const state = terminalWriteStateRef.current[taskId];
    if (!state || state.generation !== generation) return;
    state.ready = true;
    if (state.pending.length > 0) {
      const writeFn = terminalWriteRefs.current[taskId];
      if (writeFn) {
        const data = state.pending.length === 1 ? state.pending[0] : state.pending.join("");
        writeFn(data);
      }
      state.pending = [];
    }
  }, []);

  const handleSnapshot = useCallback((taskId: string, snapshot: string) => {
    const buf = taskBufferRef.current[taskId];
    const state = terminalWriteStateRef.current[taskId];
    const pendingLen = state?.pending.reduce((s, c) => s + c.length, 0) ?? 0;
    terminalSnapshotRef.current[taskId] = {
      snapshot,
      bufferLength: buf ? Math.max(0, getBufferAbsLen(buf) - pendingLen) : 0,
    };
  }, []);

  const getTaskRestoreState = useCallback((taskId: string) => {
    const buf = taskBufferRef.current[taskId];
    const snapshotState = terminalSnapshotRef.current[taskId];

    if (!buf) return { initialData: "" };

    if (!snapshotState?.snapshot) {
      return { initialData: buf.chunks.join("") };
    }

    const absLen = getBufferAbsLen(buf);
    if (snapshotState.bufferLength < 0 || snapshotState.bufferLength > absLen) {
      return { initialData: buf.chunks.join("") };
    }

    return {
      initialSnapshot: snapshotState.snapshot,
      initialData: joinBufferFrom(buf, snapshotState.bufferLength),
    };
  }, []);

  const hasTaskBuffer = useCallback((taskId: string) => {
    const buf = taskBufferRef.current[taskId];
    return !!buf && buf.totalLen > 0;
  }, []);

  return {
    terminalSizeRef,
    hasTaskBuffer,
    resetTaskTerminal,
    removeTaskBuffers,
    writeErrorToTerminal,
    handleInput,
    handleResize,
    handleRegisterTerminal,
    handleTerminalReady,
    handleSnapshot,
    getTaskRestoreState,
  };
}
