import { useSyncExternalStore } from "react";

/**
 * True while a light-family theme (light / eyecare) is active.
 *
 * App.tsx toggles the `dark` class on <html> for dark + midnight, so that class
 * is the single source of truth. One shared MutationObserver fans changes out to
 * every subscriber instead of each icon observing the document on its own.
 */
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!observer) {
    observer = new MutationObserver(() => listeners.forEach((notify) => notify()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      observer?.disconnect();
      observer = null;
    }
  };
}

const getSnapshot = () => !document.documentElement.classList.contains("dark");

export function useIsLightTheme(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
