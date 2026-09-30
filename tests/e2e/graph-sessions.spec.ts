import fs from "node:fs";
import path from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, test } from "@playwright/test";

const projectDir = process.env.PI_GRAPH_CHAT_E2E_PROJECT_DIR!;

/** Open the seeded example graph, whatever graph other tests left active. */
async function openExampleGraph(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByTestId("graph-list")
    .getByRole("button", { name: /^Understanding RAG:/ })
    .last()
    .click();
  await expect(page.getByTestId("node-inspector")).toBeVisible();
}

test.describe("Codebase-rooted graphs and cross-session references", () => {
  // Leave only the example graph behind so later specs see it as the active graph.
  test.afterEach(async ({ request }) => {
    const bootstrap = await (await request.get("/api/bootstrap")).json();
    for (const graph of bootstrap.graphs as Array<{ id: string }>) {
      if (graph.id === "learning-rag") continue;
      await request.delete(`/api/graphs/${graph.id}`);
      await request.delete(`/api/archived-graphs/${graph.id}`);
    }
  });

  test("roots a graph in a project directory and rejects a missing one", async ({ page, request, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openExampleGraph(page);
    await page.getByRole("button", { name: "New graph" }).click();
    await page.getByLabel("Title").fill("Broken project");
    await page.getByLabel("Project directory (optional)").fill("/definitely/missing/project");
    await page.getByRole("button", { name: "Create graph" }).click();
    await expect(page.getByText(/Project directory does not exist/)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: "New graph" }).click();
    await page.getByLabel("Title").fill("Demo project graph");
    await page.getByLabel("Project directory (optional)").fill(projectDir);
    await page.getByRole("button", { name: "Create graph" }).click();
    await expect(page.getByRole("heading", { name: "Demo project graph" })).toBeVisible();
    await expect(page.getByTestId("graph-project-dir")).toHaveText(path.basename(projectDir));

    const input = page.getByTestId("composer-input");
    await input.click();
    await input.fill("What does this repository contain?");
    await page.getByTestId("composer-submit").click();
    await expect(page.getByText("Answer saved to the knowledge graph")).toBeVisible({ timeout: 15_000 });

    const bootstrap = await (await request.get("/api/bootstrap")).json();
    const graph = bootstrap.graphs.find((candidate: { title: string }) => candidate.title === "Demo project graph");
    expect(graph.projectDir).toBe(projectDir);
    expect(graph.piSessionPath).toContain(`--${projectDir.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`);
    // The graph's own session is reachable by id but stays out of the Pi session list.
    const backingId = `pi-graph-chat-${graph.id}`;
    const sessions = await (await request.get("/api/pi/sessions")).json();
    expect(sessions.sessions.some((session: { id: string }) => session.id === backingId)).toBe(false);
    const backing = await (await request.get(`/api/pi/sessions/${backingId}`)).json();
    expect(backing.session).toMatchObject({ cwd: projectDir, name: "Demo project graph", turnCount: 1 });
    await expect(page.getByTestId("pi-session-list")).not.toContainText("Demo project graph");

    await page.getByTestId("graph-open-terminal").click();
    await expect(page.getByText("Command copied to the clipboard")).toBeVisible();

    // Deleting the graph for good removes the session file the app created.
    expect(fs.existsSync(graph.piSessionPath)).toBe(true);
    await request.delete(`/api/graphs/${graph.id}`);
    await request.delete(`/api/archived-graphs/${graph.id}`);
    expect(fs.existsSync(graph.piSessionPath)).toBe(false);
    expect((await request.get(`/api/pi/sessions/${backingId}`)).status()).toBe(404);
  });

  test("turns continued in the terminal become graph nodes, and the Pi view links back to the graph", async ({
    page,
    request,
  }) => {
    await openExampleGraph(page);
    let graph = await (await request.get("/api/graphs/learning-rag")).json();
    if (!graph.graph.piSessionPath) {
      const input = page.getByTestId("composer-input");
      await input.click();
      await input.fill("Warm up the session.");
      await page.getByTestId("composer-submit").click();
      await expect(page.getByText("Answer saved to the knowledge graph")).toBeVisible({ timeout: 15_000 });
      graph = await (await request.get("/api/graphs/learning-rag")).json();
    }
    const sessionPath: string = graph.graph.piSessionPath;
    expect(fs.existsSync(sessionPath)).toBe(true);
    const embedding = graph.nodes.find((node: { id: string }) => node.id === "embedding");
    expect(embedding.piEntryId).toBeTruthy();

    // Continue the graph's session from the embedding answer, as `pi --session` would.
    const manager = SessionManager.open(sessionPath);
    manager.branch(embedding.piEntryId);
    manager.appendMessage({ role: "user", content: "Terminal question about embeddings", timestamp: Date.now() });
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "Answered from the terminal." }],
      api: "openai-completions",
      provider: "terminal",
      model: "terminal-model",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: Date.now(),
    });
    const bumped = new Date(Date.now() + 5_000);
    fs.utimesSync(sessionPath, bumped, bumped);

    await page.reload();
    await openExampleGraph(page);
    await expect(page.getByTestId("knowledge-tree")).toContainText("Terminal question about embeddings");
    const refreshed = await (await request.get("/api/graphs/learning-rag")).json();
    const imported = refreshed.nodes.find(
      (node: { prompt: string }) => node.prompt === "Terminal question about embeddings",
    );
    expect(imported).toMatchObject({ content: "Answered from the terminal.", tags: ["pi-terminal"], provider: "terminal" });
    expect(
      refreshed.edges.some(
        (edge: { source: string; target: string }) => edge.source === "embedding" && edge.target === imported.id,
      ),
    ).toBe(true);

    // The graph's own session is hidden from the Pi list; the /graph deep link
    // still opens it, and the view links back to the graph.
    await expect(page.getByTestId("pi-session-pi-graph-chat-learning-rag")).toHaveCount(0);
    await page.goto("/?pi=pi-graph-chat-learning-rag");
    await expect(page.getByTestId("pi-session-view")).toBeVisible();
    await page.getByTestId("pi-open-graph").click();
    await expect(page.getByTestId("pi-session-view")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /^Understanding RAG:/ })).toBeVisible();
  });

  test("carries references from another graph and from a Pi session turn into a new question", async ({
    page,
    request,
  }) => {
    await openExampleGraph(page);
    await page.getByRole("button", { name: "Graph view" }).click();
    await page.getByTestId("graph-node-vector-db").click();
    await page.getByTestId("reference-toggle").click();
    await expect(page.getByTestId("reference-toggle")).toHaveAttribute("aria-pressed", "true");

    // Pick a turn from the seeded terminal session.
    await page.getByTestId("pi-session-e2e-pi-session-0001").click();
    await expect(page.getByTestId("pi-session-view")).toBeVisible();
    await page.getByTestId("pi-use-as-reference").click();
    await expect(page.getByText("Added as a reference for the next graph question")).toBeVisible();
    await page.getByRole("button", { name: "Back to knowledge graphs" }).click();

    // A new thread carries both references along as external references.
    await page.getByRole("button", { name: "New thread" }).click();
    await expect(page.getByTestId("composer-input")).toBeVisible();
    const chips = page.getByTestId("external-reference");
    await expect(chips).toHaveCount(2);
    await expect(chips.filter({ hasText: "Understanding RAG" })).toContainText(
      "What does a vector database do?",
    );
    await expect(chips.filter({ hasText: "Context compiler walkthrough" })).toContainText(
      "Active follow-up about selected text",
    );

    const prompt = "Relate vector databases to the context compiler follow-up.";
    await page.getByTestId("composer-input").fill(prompt);
    await page.getByTestId("composer-submit").click();
    await expect(page.getByText("Answer saved to the knowledge graph")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("external-reference")).toHaveCount(0);

    const bootstrap = await (await request.get("/api/bootstrap")).json();
    const graph = bootstrap.graphs.find((candidate: { title: string }) => candidate.title.startsWith("Relate vector databases"));
    const document = await (await request.get(`/api/graphs/${graph.id}`)).json();
    const node = document.nodes.find((candidate: { prompt: string }) => candidate.prompt === prompt);
    const ids = node.contextSnapshot.items.map((item: { nodeId: string }) => item.nodeId);
    expect(ids).toContain("vector-db");
    expect(ids.some((id: string) => id.startsWith("pi:e2e-pi-session-0001/"))).toBe(true);
    const titles = node.contextSnapshot.items.map((item: { title: string }) => item.title);
    expect(titles.some((title: string) => title.startsWith("Pi · Context compiler walkthrough"))).toBe(true);
  });
});
