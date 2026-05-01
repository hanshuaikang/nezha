import { describe, expect, it } from "vitest";
import {
  dispatchTerminalFileDropAtPoint,
  formatDroppedPathsForTerminal,
  isPointInsideElement,
  quoteShellArg,
  registerTerminalFileDropTarget,
} from "../components/terminalDragDrop";

describe("quoteShellArg", () => {
  it("wraps paths so spaces remain a single shell argument", () => {
    expect(quoteShellArg("/Users/me/My Project/file.txt")).toBe("'/Users/me/My Project/file.txt'");
  });

  it("escapes single quotes inside paths", () => {
    expect(quoteShellArg("/tmp/it's.txt")).toBe("'/tmp/it'\\''s.txt'");
  });
});

describe("formatDroppedPathsForTerminal", () => {
  it("joins multiple quoted paths with spaces", () => {
    expect(formatDroppedPathsForTerminal(["/tmp/a.txt", "/tmp/b b.txt"])).toBe(
      "'/tmp/a.txt' '/tmp/b b.txt'",
    );
  });
});

describe("isPointInsideElement", () => {
  it("checks drag coordinates against the element bounds", () => {
    const element = document.createElement("div");
    element.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 20,
        right: 110,
        bottom: 120,
        width: 100,
        height: 100,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }) as DOMRect;

    expect(isPointInsideElement({ clientX: 50, clientY: 50 }, element)).toBe(true);
    expect(isPointInsideElement({ clientX: 5, clientY: 50 }, element)).toBe(false);
  });
});

describe("terminal file drop target registry", () => {
  it("dispatches a path to the registered target at the pointer position", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    element.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 20,
        right: 110,
        bottom: 120,
        width: 100,
        height: 100,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }) as DOMRect;

    const received: string[][] = [];
    const unregister = registerTerminalFileDropTarget(element, (paths) => received.push(paths));

    expect(dispatchTerminalFileDropAtPoint("/tmp/a.txt", 50, 50)).toBe(true);
    expect(received).toEqual([["/tmp/a.txt"]]);

    unregister();
    document.body.removeChild(element);
  });

  it("skips disabled targets", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    element.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 20,
        right: 110,
        bottom: 120,
        width: 100,
        height: 100,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }) as DOMRect;

    const received: string[][] = [];
    const unregister = registerTerminalFileDropTarget(
      element,
      (paths) => received.push(paths),
      () => false,
    );

    expect(dispatchTerminalFileDropAtPoint("/tmp/a.txt", 50, 50)).toBe(false);
    expect(received).toEqual([]);

    unregister();
    document.body.removeChild(element);
  });

  it("falls through a disabled top target to an enabled target underneath", () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);
    const rect = {
      left: 10,
      top: 20,
      right: 110,
      bottom: 120,
      width: 100,
      height: 100,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    } as DOMRect;
    first.getBoundingClientRect = () => rect;
    second.getBoundingClientRect = () => rect;

    const received: string[][] = [];
    const unregisterFirst = registerTerminalFileDropTarget(first, (paths) => received.push(paths));
    const unregisterSecond = registerTerminalFileDropTarget(
      second,
      () => received.push(["disabled"]),
      () => false,
    );

    expect(dispatchTerminalFileDropAtPoint("/tmp/a.txt", 50, 50)).toBe(true);
    expect(received).toEqual([["/tmp/a.txt"]]);

    unregisterSecond();
    unregisterFirst();
    first.remove();
    second.remove();
  });
});
