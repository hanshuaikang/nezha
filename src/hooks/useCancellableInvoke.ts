import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef } from "react";

/**
 * Wraps Tauri invoke calls to automatically ignore results after component unmounts.
 * Not a true cancellation (Tauri doesn't support that), but prevents setState on unmounted components.
 */
export function useCancellableInvoke() {
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const safeInvoke = useCallback(
    async <T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> => {
      const result = await invoke<T>(cmd, args);
      if (cancelledRef.current) return null;
      return result;
    },
    [],
  );

  const isCancelled = useCallback(() => cancelledRef.current, []);

  return { safeInvoke, isCancelled };
}
