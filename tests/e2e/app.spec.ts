import { expect, test } from "@playwright/test";

test.describe("Graph Chat", () => {
  test("opens the English-first learning graph and inspects a node", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByText("Graph Chat", { exact: true })).toBeVisible();
    await expect(page.getByTestId("graph-canvas")).toBeVisible();
    await expect(page.locator('[data-testid^="graph-node-"]')).toHaveCount(6);

    await page.getByTestId("graph-node-embedding").click();
    await expect(page.getByTestId("node-inspector")).toBeVisible();
    await expect(
      page.getByTestId("node-inspector").getByRole("heading", {
        name: "What exactly is an embedding?",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("semantic coordinates", { exact: false }).first(),
    ).toBeVisible();

    await page.keyboard.press("n");
    await expect(page.getByTestId("composer-input")).toBeVisible();
  });

  test("merges a cross-branch reference into a streamed Pi answer and persists it", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await page.getByTestId("graph-node-vector-db").click();
    await page.getByRole("button", { name: "Add to synthesis" }).click();
    await page.getByTestId("graph-node-embedding").click();
    const initialCount = await page.locator('[data-testid^="graph-node-"]').count();

    const input = page.getByTestId("composer-input");
    await input.fill("How do embeddings and vector databases work together?");
    await page.getByText("Synthesize branches").click();
    await page.getByTestId("composer-submit").click();

    await expect(page.locator('[data-testid^="graph-node-"]')).toHaveCount(
      initialCount + 1,
    );
    await expect(
      page.getByText("Answer saved to the knowledge graph"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("node-inspector")).toContainText(
      "Put the branches on one map",
    );

    await page.reload();
    await expect(page.locator('[data-testid^="graph-node-"]')).toHaveCount(
      initialCount + 1,
    );

    const exported = await (await request.get("/api/export")).json();
    const createdNode = exported.graphs[0].nodes.find(
      (node: { prompt: string }) =>
        node.prompt ===
        "How do embeddings and vector databases work together?",
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

  test("keeps streaming deltas attached to their run node when selection changes", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await page.getByTestId("graph-node-embedding").click();
    const input = page.getByTestId("composer-input");
    const prompt = "Explain embeddings with a fresh counterexample.";
    await input.fill(prompt);
    const initialCount = await page.locator('[data-testid^="graph-node-"]').count();
    await page.getByTestId("composer-submit").click();
    await expect(page.locator('[data-testid^="graph-node-"]')).toHaveCount(
      initialCount + 1,
    );

    await page.getByTestId("graph-node-vector-db").click();
    await expect(
      page.getByText("Answer saved to the knowledge graph"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("node-inspector")).toContainText(
      "Regular databases excel at exact matches",
    );
    await expect(page.getByTestId("node-inspector")).not.toContainText(
      "Start with the core",
    );

    const exported = await (await request.get("/api/export")).json();
    const graph = exported.graphs.find(
      (item: { graph: { id: string } }) => item.graph.id === "learning-rag",
    );
    expect(
      graph.nodes.find(
        (node: { prompt: string }) => node.prompt === prompt,
      ),
    ).toMatchObject({ status: "complete" });
  });

  test("persists a cancelled run as cancelled", async ({ page, request }) => {
    await page.goto("/");
    await page.getByTestId("graph-node-root-rag").click();
    const input = page.getByTestId("composer-input");
    const prompt = "Cancel this long learning answer.";
    await input.fill(prompt);
    const initialCount = await page.locator('[data-testid^="graph-node-"]').count();
    await page.getByTestId("composer-submit").click();
    await expect(page.locator('[data-testid^="graph-node-"]')).toHaveCount(
      initialCount + 1,
    );
    await page.getByRole("button", { name: "Stop generation" }).click();
    await expect(page.getByText("Generation cancelled.")).toBeVisible();

    await expect
      .poll(
        async () => {
          const exported = await (await request.get("/api/export")).json();
          const graph = exported.graphs.find(
            (item: { graph: { id: string } }) =>
              item.graph.id === "learning-rag",
          );
          return graph.nodes.find(
            (node: { prompt: string }) => node.prompt === prompt,
          )?.status;
        },
        { timeout: 10_000 },
      )
      .toBe("cancelled");

    await page.reload();
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  });

  test("switches the complete application between English and Chinese", async ({
    page,
  }) => {
    await page.goto("/");
    const chinese = page.getByRole("button", { name: "中文", exact: true });
    await chinese.click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page).toHaveURL(/lang=zh/);
    await expect(page.getByText("新建学习起点")).toBeVisible();
    await expect(page.getByRole("button", { name: "模型与设置" })).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByText("知识图", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).not.toHaveURL(/lang=zh/);
    await expect(page.getByText("New learning thread")).toBeVisible();
  });

  test("changes provider settings and exposes a credential-free data export", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Models & settings" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Models & runtime")).toBeVisible();
    await expect(page.getByText("Local-first boundary")).toBeVisible();
    await page.getByRole("button", { name: "ChatGPT" }).click();
    await expect(
      page.getByText("Use your ChatGPT subscription", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in with ChatGPT" }),
    ).toBeVisible();
    await expect(page.getByLabel("Model ID")).toHaveValue("gpt-5.4-mini");
    await page.getByRole("button", { name: "Cancel" }).click();

    const authResponse = await request.get("/api/auth/openai-codex");
    expect(authResponse.ok()).toBeTruthy();
    expect(await authResponse.json()).toEqual({ state: "signed_out" });

    const response = await request.get("/api/export");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.version).toBe(2);
    expect(body.graphs[0].nodes.length).toBeGreaterThanOrEqual(6);
  });

  test("imports source notes, compares knowledge assets, studies them, and exports markdown", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Learning workspace" }).click();
    await expect(page.getByRole("heading", { name: "Learning workspace" })).toBeVisible();
    await expect(page.getByText("Local graph metrics")).toBeVisible();

    await page.getByLabel("Choose source file").setInputFiles({
      name: "sample.pdf",
      mimeType: "application/pdf",
      buffer: createTextPdf("Hello PDF import"),
    });
    await expect(page.getByRole("textbox", { name: "Content", exact: true }))
      .toHaveValue(/Hello PDF import/);

    await page.getByLabel("Source title").fill("CAP theorem");
    await page.getByLabel("Source URL (optional)").fill("https://example.com/cap");
    await page
      .getByRole("textbox", { name: "Content", exact: true })
      .fill("# Consistency\n\nReads see the latest write.\n\n# Availability\n\nRequests receive a response.");
    await page.getByRole("button", { name: "Import into graph" }).click();
    await expect(page.getByText("Explain: Consistency")).toBeVisible();

    const metrics = await (await request.get("/api/graphs/learning-rag/metrics")).json();
    expect(metrics.nodes).toBeGreaterThanOrEqual(8);

    const markdown = await request.get("/api/graphs/learning-rag/export.md");
    expect(markdown.ok()).toBeTruthy();
    expect(await markdown.text()).toContain("Source: https://example.com/cap");

    await page.getByText("Close", { exact: true }).click();
    await page.getByRole("heading", { name: "Consistency", exact: true }).click();
    await page.getByLabel("Knowledge status").selectOption("verified");
    await page.getByLabel("Mastery").selectOption("learning");
    await page.getByRole("button", { name: "Helpful", exact: true }).click();

    await expect
      .poll(async () => {
        const exported = await (await request.get("/api/export")).json();
        return exported.graphs[0].nodes.find(
          (node: { title: string }) => node.title === "Consistency",
        );
      })
      .toMatchObject({
        knowledgeStatus: "verified",
        mastery: "learning",
        rating: 1,
      });

    await page.getByRole("button", { name: "Suggest tags and summary" }).click();
    await expect
      .poll(async () => {
        const exported = await (await request.get("/api/export")).json();
        return exported.graphs[0].nodes.find(
          (node: { title: string }) => node.title === "Consistency",
        )?.tags.length;
      })
      .toBeGreaterThan(1);

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByText("Last graph change undone")).toBeVisible();

    const backup = await (await request.get("/api/export")).json();
    const restoredResponse = await request.post("/api/restore", { data: backup });
    expect(restoredResponse.status()).toBe(201);
    const restored = await restoredResponse.json();
    expect(restored.graphs[0].graph.title).toContain("(restored)");
  });

  test("creates, switches, renames, archives, and restores knowledge graphs", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New graph" }).click();
    await expect(
      page.getByRole("heading", { name: "Create a knowledge graph" }),
    ).toBeVisible();
    await page.getByLabel("Title").fill("Distributed systems");
    await page
      .getByLabel("Description")
      .fill("Reasoning about reliable services");
    await page.getByRole("button", { name: "Create graph" }).click();
    await expect(
      page.getByRole("heading", { name: "Distributed systems" }),
    ).toBeVisible();
    await expect(page.locator('[data-testid^="graph-node-"]')).toHaveCount(0);

    await page
      .getByRole("button", { name: "Edit graph: Distributed systems" })
      .click();
    await page.getByLabel("Title").fill("Reliable distributed systems");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(
      page.getByRole("heading", { name: "Reliable distributed systems" }),
    ).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Edit graph: Reliable distributed systems" })
      .click();
    await page.getByRole("button", { name: "Archive graph" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Understanding RAG: from new concepts to a complete picture",
      }),
    ).toBeVisible();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();

    await page
      .getByRole("button", {
        name: "Restore Reliable distributed systems",
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Edit graph: Reliable distributed systems",
      }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Reliable distributed systems", exact: false })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Reliable distributed systems" }),
    ).toBeVisible();
  });
});

function createTextPdf(text: string): Buffer {
  const stream = `BT\n/F1 18 Tf\n72 720 Td\n(${text.replace(/[()\\]/g, "\\$&")}) Tj\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}
