export const TERMINAL_SELECTION_ACTIVE_EVENT = "nezha-terminal-selection-active";

declare global {
  interface Window {
    __nezhaTerminalSelectionActive?: boolean;
  }
}

export function getTerminalSelectionActive(): boolean {
  return typeof window !== "undefined" && window.__nezhaTerminalSelectionActive === true;
}

export function publishTerminalSelectionActive(active: boolean): void {
  if (typeof window === "undefined") return;
  window.__nezhaTerminalSelectionActive = active;
  window.dispatchEvent(
    new CustomEvent<boolean>(TERMINAL_SELECTION_ACTIVE_EVENT, { detail: active }),
  );
}
