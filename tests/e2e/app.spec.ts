import { expect, test } from "@playwright/test";

async function openGraphView(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Graph view" }).click();
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
}

test.describe("Graph Chat", () => {
  test("collapses and reopens the sidebar", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar).toHaveAttribute("data-state", "open");

    await page.getByRole("button", { name: "Close sidebar" }).click();
    await expect(sidebar).toHaveAttribute("data-state", "closed");
    await expect(page.getByRole("button", { name: "Open sidebar" })).toBeVisible();

    await page.getByRole("button", { name: "Open sidebar" }).click();
    await expect(sidebar).toHaveAttribute("data-state", "open");
    await expect(page.getByRole("button", { name: "Close sidebar" })).toBeVisible();
  });

  test("opens the English-first learning graph and inspects a node", async ({
    page,
    request,
  }) => {
    expect(await (await request.get("/health")).json()).toEqual({
      ok: true,
      service: "graphchat",
      version: "0.2.2",
      databaseSchemaVersion: 4,
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByText("Graph Chat", { exact: true })).toBeVisible();
    await expect(page.getByTestId("node-inspector")).toBeVisible();
    await expect(page.getByTestId("knowledge-tree")).toBeVisible();
    const separator = page.getByRole("separator", {
      name: "Resize conversation and knowledge tree",
    });
    await expect(separator).toHaveAttribute("aria-valuenow", "50");
    await separator.press("Alt+ArrowRight");
    await expect(separator).toHaveAttribute("aria-valuenow", "55");

    await page.getByRole("button", { name: "Tree view" }).click();
    await page.getByTestId("tree-node-vector-db").click();
    await expect(
      page.getByRole("button", { name: "Content view" }),
    ).toHaveAttribute("aria-pressed", "true");
    await openGraphView(page);
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
    const backToMain = page.getByTestId("back-to-main-thread");
    await expect(backToMain).toBeVisible();
    await backToMain.click();
    await expect(
      page.getByTestId("node-inspector").getByRole("heading", {
        name: "What is RAG?",
      }),
    ).toBeVisible();
    await expect(page.getByTestId("back-to-main-thread")).toHaveCount(0);
  });

  test("merges a cross-branch reference into a streamed Pi answer and persists it", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await openGraphView(page);
    const initialCount = await page.locator('[data-testid^="graph-node-"]').count();
    await page.getByTestId("graph-node-vector-db").click();
    const referenceToggle = page.getByTestId("reference-toggle");
    await expect(referenceToggle).toHaveAttribute("aria-pressed", "false");
    await referenceToggle.click();
    await expect(referenceToggle).toHaveAttribute("aria-pressed", "true");
    await expect(referenceToggle).toHaveText("Remove reference");
    await page.getByTestId("tree-node-embedding").click();

    const input = page.getByTestId("composer-input");
    await input.fill("How do embeddings and vector databases work together?");
    await page.getByText("Synthesize branches").click();
    await page.getByTestId("composer-submit").click();

    await expect(
      page.getByText("Answer saved to the knowledge graph"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("node-inspector")).toContainText(
      "Put the branches on one map",
    );
    await page.getByTestId("content-tab-context").click();
    await expect(page.getByTestId("node-inspector")).toContainText(
      "Context actually used",
    );

    await page.reload();
    await openGraphView(page);
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
    await openGraphView(page);
    await page.getByTestId("graph-node-embedding").click();
    const input = page.getByTestId("composer-input");
    const prompt = "Explain embeddings with a fresh counterexample.";
    await input.fill(prompt);
    await page.getByTestId("composer-submit").click();
    await page.getByTestId("tree-node-vector-db").click();
    await expect(
      page.getByText("Answer saved to the knowledge graph"),
    ).toBeVisible({ timeout: 15_000 });
    // Completion may focus the newly created run node. Re-select the node that
    // was active while streaming before checking that no deltas leaked into it.
    await page.getByTestId("tree-node-vector-db").click();
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
    await openGraphView(page);
    await page.getByTestId("graph-node-root-rag").click();
    const input = page.getByTestId("composer-input");
    const prompt = "Cancel this long learning answer.";
    await input.fill(prompt);
    await page.getByTestId("composer-submit").click();
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
    await openGraphView(page);
    await expect(page.getByText("Cancelled", { exact: true }).last()).toBeVisible();
  });

  test("switches and persists supported interface languages", async ({ page }) => {
    await page.goto("/?lang=zh-TW");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
    const language = page.getByRole("combobox", { name: "語言" });
    await expect(language).toHaveValue("zh-TW");
    await expect(language.locator('option[value="hi"]')).toHaveCount(0);

    await language.selectOption("de");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page).toHaveURL(/\?lang=de$/);
    expect(
      await page.evaluate(() => window.localStorage.getItem("graphchat-language")),
    ).toBe("de");

    await page.reload();
    await expect(page.getByRole("combobox", { name: "Sprache" })).toHaveValue("de");
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
    const authResponse = await request.get("/api/auth/openai-codex");
    expect(authResponse.ok()).toBeTruthy();
    const authStatus = await authResponse.json();
    if (authStatus.state === "authenticated") {
      await expect(page.getByText(/Connected ·/)).toBeVisible();
    } else {
      await expect(
        page.getByRole("button", { name: "Sign in with ChatGPT" }),
      ).toBeVisible();
    }
    await expect(page.getByLabel("Model ID")).toHaveValue("gpt-5.4-mini");
    await page.getByRole("button", { name: "Cancel" }).click();

    expect(["authenticated", "signed_out"]).toContain(authStatus.state);

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
    await page.getByRole("button", { name: "Tools" }).click();
    await expect(page.getByRole("heading", { name: "Tools" })).toBeVisible();
    await expect(page.getByText("Local graph metrics")).toBeVisible();
    await expect(page.getByText("Product validation")).toBeVisible();

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
      .fill(
        "# Consistency\n\nReads see the latest write.\n\n```mermaid\ngraph LR\n  Write --> Read\n```\n\n# Availability\n\nRequests receive a response.",
      );
    await page.getByRole("button", { name: "Import into graph" }).click();
    await expect(page.getByText("Explain: Consistency")).toBeVisible();

    const metrics = await (await request.get("/api/graphs/learning-rag/metrics")).json();
    expect(metrics.nodes).toBeGreaterThanOrEqual(8);

    const validation = await (
      await request.get("/api/validation/export.json")
    ).json();
    expect(validation).toMatchObject({
      schemaVersion: 1,
      appVersion: "0.2.2",
      summary: { eligibleGraphs: 1 },
    });
    expect(JSON.stringify(validation)).not.toContain("Reads see the latest write");

    const markdown = await request.get("/api/graphs/learning-rag/export.md");
    expect(markdown.ok()).toBeTruthy();
    expect(await markdown.text()).toContain("Source: https://example.com/cap");

    await page.getByText("Close", { exact: true }).click();
    await page.getByTestId("knowledge-tree").getByText("Consistency", { exact: true }).click();
    await expect(page.locator(".mermaid-diagram svg")).toBeVisible();
    await page.getByTestId("content-tab-details").click();
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
    await page.getByRole("menuitem", { name: "Rename & edit" }).click();
    await page.getByLabel("Title").fill("Reliable distributed systems");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(
      page.getByRole("heading", { name: "Reliable distributed systems" }),
    ).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Edit graph: Reliable distributed systems" })
      .click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Understanding RAG: from new concepts to a complete picture",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Archived threads/ }).click();
    await expect(
      page.getByRole("heading", { name: "Archived threads" }),
    ).toBeVisible();
    await expect(page.getByText(/Showing \d+ of \d+/)).toBeVisible();
    await page
      .getByRole("textbox", { name: "Search archived threads" })
      .fill("Reliable distributed");
    await expect(
      page.getByRole("button", {
        name: "Restore Reliable distributed systems",
      }),
    ).toBeVisible();

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

  test("permanently deletes archived threads only after confirmation", async ({
    page,
    request,
  }) => {
    const createArchivedGraph = async (title: string) => {
      const createdResponse = await request.post("/api/graphs", {
        data: { title, description: "Delete confirmation test" },
      });
      expect(createdResponse.status()).toBe(201);
      const created = await createdResponse.json();
      const archiveResponse = await request.delete(
        `/api/graphs/${created.graph.id}`,
      );
      expect(archiveResponse.ok()).toBeTruthy();
      return created.graph.id as string;
    };

    const firstId = await createArchivedGraph("Archived deletion one");
    await createArchivedGraph("Archived deletion two");
    expect(
      (await request.delete("/api/archived-graphs/learning-rag")).status(),
    ).toBe(404);

    await page.goto("/");
    await page.getByRole("button", { name: /Archived threads/ }).click();

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("This cannot be undone");
      await dialog.dismiss();
    });
    await page
      .getByRole("button", {
        name: "Delete archived thread Archived deletion one",
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Delete archived thread Archived deletion one",
      }),
    ).toBeVisible();

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("Archived deletion one");
      await dialog.accept();
    });
    await page
      .getByRole("button", {
        name: "Delete archived thread Archived deletion one",
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Delete archived thread Archived deletion one",
      }),
    ).toHaveCount(0);
    const afterSingleDelete = await (await request.get("/api/bootstrap")).json();
    expect(
      afterSingleDelete.archivedGraphs.some(
        (graph: { id: string }) => graph.id === firstId,
      ),
    ).toBe(false);

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("all 1 archived threads");
      await dialog.dismiss();
    });
    await page.getByRole("button", { name: "Delete all" }).click();
    await expect(
      page.getByRole("button", {
        name: "Delete archived thread Archived deletion two",
      }),
    ).toBeVisible();

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("all 1 archived threads");
      await dialog.accept();
    });
    await page.getByRole("button", { name: "Delete all" }).click();
    await expect(
      page.getByRole("heading", { name: "Archived threads" }),
    ).toHaveCount(0);
    const afterDeleteAll = await (await request.get("/api/bootstrap")).json();
    expect(afterDeleteAll.archivedGraphs).toEqual([]);
    expect(afterDeleteAll.graphs.length).toBeGreaterThan(0);
  });

  test("turns selected answer text into a branch-ready composer context", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", {
      name: "Understanding RAG: from new concepts to a complete picture An example graph showing branches, follow-ups, and synthesis",
      exact: true,
    }).click();
    const content = page.getByTestId("conversation-content");
    await content.selectText();
    await content.dispatchEvent("mouseup");
    await expect(page.getByTestId("composer-input")).toBeVisible();
    await expect(page.getByTestId("selection-context")).toBeVisible();
  });

  test("starts a new learning thread on a blank content workspace", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: /^Understanding RAG:/ })
      .last()
      .click();
    await expect(page.getByTestId("conversation-content")).toBeVisible();
    const before = await (await request.get("/api/bootstrap")).json();
    const newThread = page.getByRole("button", { name: "New thread" });
    await newThread.click();

    await expect(page.getByTestId("empty-content")).toBeVisible();
    await expect(page.getByTestId("composer-input")).toBeVisible();
    await expect(page.getByTestId("knowledge-tree")).toContainText("0 content nodes");
    await expect(
      page.getByRole("heading", { name: /Thread \d+/ }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const after = await (await request.get("/api/bootstrap")).json();
        return after.graphs.length;
      })
      .toBe(before.graphs.length + 1);

    await newThread.click();
    await expect
      .poll(async () => {
        const afterSecondClick = await (await request.get("/api/bootstrap")).json();
        return afterSecondClick.graphs.length;
      })
      .toBe(before.graphs.length + 1);
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
