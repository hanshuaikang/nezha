import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { ENABLE_USAGE_INSIGHTS } from "../platform";
import type { UsageSnapshot } from "../types";
import {
  TERMINAL_SELECTION_ACTIVE_EVENT,
  getTerminalSelectionActive,
} from "../terminalSelection";

// Module-level cache — shared across all hook instances in the same process
let cachedSnapshot: UsageSnapshot | null = null;
let cacheUpdatedAt = 0;
let inflightPromise: Promise<void> | null = null;

async function fetchSnapshot(): Promise<void> {
  if (inflightPromise) return inflightPromise;
  inflightPromise = invoke<UsageSnapshot>("read_usage_snapshot")
    .then((snapshot) => {
      cachedSnapshot = snapshot;
      cacheUpdatedAt = Date.now();
    })
    .finally(() => {
      inflightPromise = null;
    });
  return inflightPromise;
}

/**
 * Returns the shared global usage snapshot.
 * When `active` is true, immediately loads from cache or fetches if stale,
 * then re-fetches every 60 seconds. When `active` is false, polling stops.
 */
export function useUsageSnapshot(active: boolean) {
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(cachedSnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!active || !ENABLE_USAGE_INSIGHTS) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      const now = Date.now();
      if (cachedSnapshot && now - cacheUpdatedAt < 60_000) {
        setSnapshot(cachedSnapshot);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        await fetchSnapshot();
        if (mountedRef.current) {
          setSnapshot(cachedSnapshot);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    // 终端选区期间暂停 usage 轮询；订阅 window 事件而非 React state，
    // 让 selection-active 翻转不触发本 hook 的消费者重渲染。
    const start = () => {
      load();
      if (interval === null) interval = setInterval(load, 60_000);
    };
    const stop = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };

    if (!getTerminalSelectionActive()) start();

    const onSelectionChange = (event: Event) => {
      const isActive = (event as CustomEvent<boolean>).detail === true;
      if (isActive) stop();
      else start();
    };
    window.addEventListener(TERMINAL_SELECTION_ACTIVE_EVENT, onSelectionChange);

    return () => {
      stop();
      window.removeEventListener(TERMINAL_SELECTION_ACTIVE_EVENT, onSelectionChange);
    };
  }, [active]);

  return { snapshot, loading, error };
}
