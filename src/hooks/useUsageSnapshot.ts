import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { ENABLE_USAGE_INSIGHTS } from "../platform";
import type { UsageSnapshot } from "../types";
import { useTerminalSelectionActive } from "./useTerminalSelectionActive";

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
  const terminalSelectionActive = useTerminalSelectionActive();
  const effectiveActive = active && !terminalSelectionActive;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!effectiveActive || !ENABLE_USAGE_INSIGHTS) return;

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

    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [effectiveActive]);

  return { snapshot, loading, error };
}
