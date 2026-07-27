// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RunStreamEvent } from "../shared/types.js";
import { GraphAgentRuntime } from "./agent-runtime.js";
import { GraphDatabase } from "./database.js";

const directories: string[] = [];

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "graphchat-runtime-"));
  directories.push(directory);
  const database = new GraphDatabase(directory);
  const runtime = new GraphAgentRuntime({
    provider: "demo",
    model: "graphchat-guide",
    baseUrl: "",
    hasApiKey: false,
  });
  return { database, runtime };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("GraphAgentRuntime", () => {
  it("keeps API keys in memory and scopes them to their provider", () => {
    const { database, runtime } = setup();
    runtime.configure(
      {
        provider: "custom",
        model: "private-model",
        baseUrl: "http://127.0.0.1:8080/v1",
        hasApiKey: true,
      },
      "session-only-secret",
    );
    expect(runtime.hasApiKey("custom")).toBe(true);
    expect(runtime.hasApiKey("demo")).toBe(false);
    expect(database.getSettings().hasApiKey).toBe(false);
    database.close();
  });

  it("streams a Pi-backed demo answer and persists the final node", async () => {
    const { database, runtime } = setup();
    const events: RunStreamEvent[] = [];
    for await (const event of runtime.run(database, {
      graphId: "learning-rag",
      parentNodeId: "embedding",
      referenceNodeIds: ["vector-db"],
      prompt: "这两个概念如何配合？",
      selectedText: null,
      position: { x: 1200, y: 200 },
      mode: "synthesize",
      locale: "zh",
    })) {
      events.push(event);
    }
    const started = events.find((event) => event.type === "run_started");
    const finished = events.find((event) => event.type === "run_finished");
    expect(started?.type).toBe("run_started");
    expect(events.filter((event) => event.type === "text_delta").length).toBeGreaterThan(2);
    expect(finished?.type).toBe("run_finished");
    if (started?.type === "run_started" && finished?.type === "run_finished") {
      expect(finished.runId).toBe(started.runId);
      expect(finished.nodeId).toBe(started.nodeId);
      expect(
        events
          .filter((event) => event.type === "text_delta")
          .every(
            (event) =>
              event.runId === started.runId && event.nodeId === started.nodeId,
          ),
      ).toBe(true);
      const persisted = database.getNode(finished.node.id);
      expect(persisted?.content).toContain("把这些分支");
      expect(persisted?.contextSnapshot).toMatchObject({
        estimatedTokens: expect.any(Number),
        items: expect.arrayContaining([
          expect.objectContaining({ nodeId: "embedding" }),
          expect.objectContaining({ nodeId: "vector-db", reason: "reference" }),
        ]),
      });
    }
    database.close();
  });

  it("executes a graph tool in explore mode before answering", async () => {
    const { database, runtime } = setup();
    const eventTypes: string[] = [];
    for await (const event of runtime.run(database, {
      graphId: "learning-rag",
      parentNodeId: "root-rag",
      referenceNodeIds: [],
      prompt: "向量数据库",
      selectedText: null,
      position: { x: 500, y: 500 },
      mode: "explore",
      locale: "zh",
    })) {
      eventTypes.push(event.type);
    }
    expect(eventTypes).toContain("tool_started");
    expect(eventTypes).toContain("tool_finished");
    expect(eventTypes.at(-1)).toBe("run_finished");
    database.close();
  });

  it("answers in English when the application locale is English", async () => {
    const { database, runtime } = setup();
    let finished: Extract<RunStreamEvent, { type: "run_finished" }> | undefined;
    for await (const event of runtime.run(database, {
      graphId: "learning-rag",
      parentNodeId: "embedding",
      referenceNodeIds: ["vector-db"],
      prompt: "How do these concepts work together?",
      selectedText: null,
      position: { x: 1200, y: 200 },
      mode: "synthesize",
      locale: "en",
    })) {
      if (event.type === "run_finished") finished = event;
    }
    expect(finished?.node.content).toContain("Put the branches on one map");
    expect(finished?.node.content).toContain("Back to the main thread");
    database.close();
  });

  it("requires ChatGPT login before running an OpenAI Codex model", async () => {
    const { database, runtime } = setup();
    runtime.configure({
      provider: "openai-codex",
      model: "gpt-5.4-mini",
      baseUrl: "",
      hasApiKey: false,
    });
    const events: RunStreamEvent[] = [];
    for await (const event of runtime.run(database, {
      graphId: "learning-rag",
      parentNodeId: "root-rag",
      referenceNodeIds: [],
      prompt: "解释这段知识",
      selectedText: null,
      position: { x: 900, y: 400 },
      mode: "answer",
      locale: "zh",
    })) {
      events.push(event);
    }
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        type: "run_failed",
        message: "请先在“模型与设置”中使用 ChatGPT 登录。",
        runId: expect.any(String),
        nodeId: expect.any(String),
        node: expect.objectContaining({ status: "error" }),
      }),
    );
    database.close();
  });

  it("marks an aborted run as cancelled and keeps its run identity", async () => {
    const { database, runtime } = setup();
    const controller = new AbortController();
    const events: RunStreamEvent[] = [];
    for await (const event of runtime.run(
      database,
      {
        graphId: "learning-rag",
        parentNodeId: "root-rag",
        referenceNodeIds: [],
        prompt: "取消这次生成",
        selectedText: null,
        position: { x: 900, y: 400 },
        mode: "answer",
        locale: "zh",
      },
      controller.signal,
    )) {
      events.push(event);
      if (event.type === "run_started") controller.abort();
    }

    const started = events.find((event) => event.type === "run_started");
    const cancelled = events.find((event) => event.type === "run_cancelled");
    expect(started?.type).toBe("run_started");
    expect(cancelled?.type).toBe("run_cancelled");
    if (started?.type === "run_started" && cancelled?.type === "run_cancelled") {
      expect(cancelled.runId).toBe(started.runId);
      expect(cancelled.nodeId).toBe(started.nodeId);
      expect(database.getNode(cancelled.nodeId)?.status).toBe("cancelled");
    }
    database.close();
  });
});
