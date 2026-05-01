const terminalDropTargets: Array<{
  element: HTMLElement;
  onDropPaths: (paths: string[]) => void;
  isEnabled?: () => boolean;
}> = [];

export function isPointInsideElement(
  event: { clientX: number; clientY: number },
  element: Element,
): boolean {
  const rect = element.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

export function registerTerminalFileDropTarget(
  element: HTMLElement,
  onDropPaths: (paths: string[]) => void,
  isEnabled?: () => boolean,
): () => void {
  const target = { element, onDropPaths, isEnabled };
  terminalDropTargets.push(target);
  return () => {
    const index = terminalDropTargets.indexOf(target);
    if (index !== -1) terminalDropTargets.splice(index, 1);
  };
}

export function dispatchTerminalFileDropAtPoint(path: string, clientX: number, clientY: number): boolean {
  for (let i = terminalDropTargets.length - 1; i >= 0; i--) {
    const target = terminalDropTargets[i];
    if (target.isEnabled && !target.isEnabled()) continue;
    if (!document.contains(target.element)) continue;
    if (!isPointInsideElement({ clientX, clientY }, target.element)) continue;
    target.onDropPaths([path]);
    return true;
  }
  return false;
}

export function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function formatDroppedPathsForTerminal(paths: string[]): string {
  return paths.map(quoteShellArg).join(" ");
}
