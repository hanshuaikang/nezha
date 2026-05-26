import { describe, expect, it } from "vitest";
import {
  countToolCalls,
  messageMatchesRole,
  messageMatchesSearch,
  type SessionMessage,
} from "../components/SessionView";

const messages: SessionMessage[] = [
  {
    role: "user",
    content: [{ type: "text", text: "Please inspect the terminal panel" }],
  },
  {
    role: "assistant",
    content: [
      { type: "thinking", thinking: "Need to find the layout code" },
      { type: "text", text: "I will check the component." },
      { type: "tool_use", name: "Read", input: "src/components/TerminalView.tsx" },
    ],
  },
];

describe("SessionView filters", () => {
  it("matches search text across visible and tool content fields", () => {
    expect(messages.map((message) => messageMatchesSearch(message, "terminal"))).toEqual([
      true,
      true,
    ]);
    expect(messageMatchesSearch(messages[1], "layout code")).toBe(true);
    expect(messageMatchesSearch(messages[1], "missing")).toBe(false);
    expect(messageMatchesSearch(messages[0], "   ")).toBe(true);
  });

  it("matches role filters including tool-use messages", () => {
    expect(messageMatchesRole(messages[0], "all")).toBe(true);
    expect(messageMatchesRole(messages[0], "user")).toBe(true);
    expect(messageMatchesRole(messages[0], "assistant")).toBe(false);
    expect(messageMatchesRole(messages[1], "tool")).toBe(true);
    expect(messageMatchesRole(messages[0], "tool")).toBe(false);
  });

  it("counts tool calls across filtered messages", () => {
    expect(countToolCalls(messages)).toBe(1);
    expect(countToolCalls(messages.filter((message) => messageMatchesRole(message, "user")))).toBe(
      0,
    );
  });
});
