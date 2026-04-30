import { useEffect, useRef } from "react";
import { APP_PLATFORM } from "../platform";
import {
  GLOBAL_SHORTCUTS,
  applyKeybindings,
  matchesShortcut,
  type Keybindings,
} from "../shortcuts";

export type ShortcutHandlers = Partial<Record<string, () => void>>;

export function useGlobalShortcuts(
  handlers: ShortcutHandlers,
  active = true,
  keybindings?: Keybindings,
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const keybindingsRef = useRef(keybindings);
  keybindingsRef.current = keybindings;

  useEffect(() => {
    if (!active) return;

    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable =
        tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;

      const shortcuts = keybindingsRef.current
        ? applyKeybindings(GLOBAL_SHORTCUTS, keybindingsRef.current)
        : GLOBAL_SHORTCUTS;

      for (const shortcut of shortcuts) {
        if (!matchesShortcut(e, shortcut, APP_PLATFORM)) continue;

        if (isEditable && shortcut.id === "focus-search") continue;

        const handler = handlersRef.current[shortcut.id];
        if (handler) {
          e.preventDefault();
          e.stopPropagation();
          handler();
        }
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active]);
}
