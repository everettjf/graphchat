import { expect, test } from "@playwright/test";

test.describe("Graph Chat", () => {
  test("opens the seeded learning graph and inspects a node", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Graph Chat", { exact: true })).toBeVisible();
    await expect(page.getByTestId("graph-canvas")).toBeVisible();
    await expect(page.locator('[data-testid^="graph-node-"]')).toHaveCount(6);

    await page.getByTestId("graph-node-embedding").click();
    await expect(page.getByTestId("node-inspector")).toBeVisible();
    await expect(
      page.getByTestId("node-inspector").getByRole("heading", {
        name: "Embedding 到底是什么？",
      }),
    ).toBeVisible();
    await expect(page.getByText("语义坐标", { exact: false }).first()).toBeVisible();

    await page.keyboard.press("n");
    await expect(page.getByTestId("composer-input")).toBeVisible();
  });

  test("merges a cross-branch reference into a streamed Pi answer and persists it", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await page.getByTestId("graph-node-vector-db").click();
    await page.getByRole("button", { name: "加入联合提问" }).click();
    await page.getByTestId("graph-node-embedding").click();
    const initialCount = await page.locator('[data-testid^="graph-node-"]').count();

    const input = page.getByTestId("composer-input");
    await input.fill("Embedding 和向量数据库是怎么配合的？");
    await page.getByText("汇聚分支").click();
    await page.getByTestId("composer-submit").click();

    await expect(page.locator('[data-testid^="graph-node-"]')).toHaveCount(initialCount + 1);
    await expect(page.getByText("回答已保存到知识图")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("node-inspector")).toContainText("把这些分支放到同一张图里");

    await page.reload();
    await expect(page.locator('[data-testid^="graph-node-"]')).toHaveCount(initialCount + 1);
    await expect(page.getByText("Embedding 和向量数据库是怎么配合的？", { exact: false }).first()).toBeVisible();

    const exported = await (await request.get("/api/export")).json();
    const createdNode = exported.graphs[0].nodes.find(
      (node: { prompt: string }) => node.prompt === "Embedding 和向量数据库是怎么配合的？",
    );
    expect(
      exported.graphs[0].edges.some(
        (edge: { kind: string; source: string; target: string }) =>
          edge.kind === "reference" &&
          edge.source === "vector-db" &&
          edge.target === createdNode.id,
      ),
    ).toBeTruthy();
  });

  test("changes provider settings and exposes a data export", async ({ page, request }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "模型与设置" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("模型与运行方式")).toBeVisible();
    await expect(page.getByText("本地优先说明")).toBeVisible();
    await page.getByRole("button", { name: "ChatGPT" }).click();
    await expect(page.getByText("使用 ChatGPT 订阅", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "使用 ChatGPT 登录" })).toBeVisible();
    await expect(page.getByLabel("模型 ID")).toHaveValue("gpt-5.4-mini");
    await page.getByRole("button", { name: "取消" }).click();

    const authResponse = await request.get("/api/auth/openai-codex");
    expect(authResponse.ok()).toBeTruthy();
    expect(await authResponse.json()).toEqual({ state: "signed_out" });

    const response = await request.get("/api/export");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.version).toBe(1);
    expect(body.graphs[0].nodes.length).toBeGreaterThanOrEqual(6);
  });
});
