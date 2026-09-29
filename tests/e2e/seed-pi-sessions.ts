import fs from "node:fs";
import path from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";

const usage = {
  input: 12,
  output: 6,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 18,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistantText(text: string, model = "claude-sonnet-5") {
  return {
    role: "assistant" as const,
    content: [{ type: "text" as const, text }],
    api: "anthropic-messages" as const,
    provider: "anthropic",
    model,
    usage,
    stopReason: "stop" as const,
    timestamp: Date.now(),
  };
}

/**
 * Seed a deterministic Pi session tree for the end-to-end suite:
 * one root prompt with a tool call, an abandoned follow-up branch, and the
 * active follow-up branch that holds the session leaf.
 */
export function seedPiSessions(sessionDir: string) {
  fs.rmSync(sessionDir, { recursive: true, force: true });
  const projectDir = path.join(sessionDir, "--home-user-graphchat-demo--");
  fs.mkdirSync(projectDir, { recursive: true });
  const manager = SessionManager.create("/home/user/graphchat-demo", projectDir, {
    id: "e2e-pi-session-0001",
  });
  manager.appendModelChange("anthropic", "claude-sonnet-5");
  manager.appendMessage({
    role: "user",
    content: "Explain how the context compiler picks nodes",
    timestamp: Date.now(),
  });
  manager.appendMessage({
    role: "assistant",
    content: [
      { type: "toolCall", id: "call-read-1", name: "read", arguments: { path: "server/context-compiler.ts" } },
    ],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-sonnet-5",
    usage,
    stopReason: "toolUse",
    timestamp: Date.now(),
  });
  manager.appendMessage({
    role: "toolResult",
    toolCallId: "call-read-1",
    toolName: "read",
    content: [{ type: "text", text: "export function compileContext() {}" }],
    isError: false,
    timestamp: Date.now(),
  });
  const rootAnswer = manager.appendMessage(
    assistantText("It walks the parent path first, then adds referenced nodes within a token budget."),
  );
  manager.appendMessage({
    role: "user",
    content: "Abandoned follow-up about token budgets",
    timestamp: Date.now(),
  });
  manager.appendMessage(assistantText("The budget defaults to 8000 estimated tokens."));
  manager.branch(rootAnswer);
  manager.appendMessage({
    role: "user",
    content: "Active follow-up about selected text",
    timestamp: Date.now(),
  });
  manager.appendMessage(
    assistantText("Selected text is appended as a selection item.", "claude-opus-5"),
  );
  manager.appendSessionInfo("Context compiler walkthrough");
  return manager.getSessionFile()!;
}

export default function globalSetup() {
  const sessionDir = process.env.PI_CODING_AGENT_SESSION_DIR;
  if (!sessionDir) throw new Error("PI_CODING_AGENT_SESSION_DIR is not set for the e2e run.");
  seedPiSessions(sessionDir);
}
