import { useEffect, useState } from "react";
import {
  getTerminalSelectionActive,
  TERMINAL_SELECTION_ACTIVE_EVENT,
} from "../terminalSelection";

export function useTerminalSelectionActive(): boolean {
  const [active, setActive] = useState(getTerminalSelectionActive);

  useEffect(() => {
    const handleSelectionActive = (event: Event) => {
      setActive((event as CustomEvent<boolean>).detail === true);
    };

    window.addEventListener(TERMINAL_SELECTION_ACTIVE_EVENT, handleSelectionActive);
    return () => {
      window.removeEventListener(TERMINAL_SELECTION_ACTIVE_EVENT, handleSelectionActive);
    };
  }, []);

  return active;
}
