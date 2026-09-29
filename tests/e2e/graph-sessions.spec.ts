import path from "node:path";
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

  test("roots a graph in a project directory and rejects a missing one", async ({ page, request }) => {
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
    const sessions = await (await request.get("/api/pi/sessions")).json();
    const backing = sessions.sessions.find((session: { id: string }) => session.id === `graphchat-${graph.id}`);
    expect(backing).toMatchObject({ cwd: projectDir, name: "Demo project graph", turnCount: 1 });

    await page.getByTestId("graph-open-terminal").click();
    await expect(page.getByText("Command copied to the clipboard")).toBeVisible();
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
