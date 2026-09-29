import { expect, test } from "@playwright/test";

test.describe("Pi sessions", () => {
  test("exposes seeded Pi sessions as collapsed turn trees over the API", async ({ request }) => {
    const list = await (await request.get("/api/pi/sessions")).json();
    expect(list.sessionDir).toBe(process.env.PI_CODING_AGENT_SESSION_DIR);
    // Graph-backed sessions from other tests may be listed too; find the seeded one.
    const seeded = list.sessions.find((session: { id: string }) => session.id === "e2e-pi-session-0001");
    expect(seeded).toMatchObject({
      id: "e2e-pi-session-0001",
      cwd: "/home/user/pi-graph-chat-demo",
      name: "Context compiler walkthrough",
      turnCount: 3,
      model: "claude-opus-5",
    });

    const tree = await (await request.get("/api/pi/sessions/e2e-pi-session-0001")).json();
    expect(tree.turns).toHaveLength(3);
    const [root, abandoned, active] = tree.turns;
    expect(root).toMatchObject({
      kind: "user",
      title: "Explain how the context compiler picks nodes",
      onActivePath: true,
      isLeaf: false,
    });
    expect(root.toolCalls).toEqual([
      expect.objectContaining({ name: "read", result: "export function compileContext() {}" }),
    ]);
    expect(abandoned).toMatchObject({ parentId: root.id, onActivePath: false });
    expect(active).toMatchObject({ parentId: root.id, onActivePath: true, isLeaf: true });
    expect(tree.leafTurnId).toBe(active.id);

    expect((await request.get("/api/pi/sessions/missing")).status()).toBe(404);
  });

  test("browses a Pi session tree read-only and copies the terminal command", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    const list = page.getByTestId("pi-session-list");
    await expect(list.getByText("Context compiler walkthrough")).toBeVisible();
    await page.getByTestId("pi-session-e2e-pi-session-0001").click();

    const view = page.getByTestId("pi-session-view");
    await expect(view).toBeVisible();
    await expect(view.getByRole("heading", { name: "Context compiler walkthrough" })).toBeVisible();
    await expect(page.locator('[data-testid^="pi-turn-"]')).toHaveCount(3);
    await expect(page.getByText("Abandoned branch").first()).toBeVisible();

    // The current session position is selected by default.
    const inspector = page.getByTestId("pi-inspector");
    await expect(
      inspector.getByRole("heading", { name: "Active follow-up about selected text" }),
    ).toBeVisible();
    await expect(inspector.getByText("Selected text is appended as a selection item.")).toBeVisible();

    await page
      .locator('[data-testid^="pi-turn-"]', { hasText: "Explain how the context compiler picks nodes" })
      .click();
    await expect(
      inspector.getByRole("heading", { name: "Explain how the context compiler picks nodes" }),
    ).toBeVisible();
    await expect(inspector.getByText("Tool calls · 1")).toBeVisible();
    await inspector.getByText("read", { exact: true }).click();
    await expect(inspector.getByText("export function compileContext() {}")).toBeVisible();

    await page.getByTestId("pi-open-terminal").click();
    await expect(page.getByText("Command copied to the clipboard")).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("cd '/home/user/pi-graph-chat-demo' && pi --session '");
    expect(clipboard).toContain("e2e-pi-session-0001.jsonl'");

    await page.getByRole("button", { name: "Back to knowledge graphs" }).click();
    await expect(view).toHaveCount(0);
    await expect(page.getByTestId("knowledge-tree")).toBeVisible();
  });
});
