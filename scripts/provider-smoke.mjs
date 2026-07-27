const baseUrl = process.env.GRAPHCHAT_SMOKE_URL || "http://127.0.0.1:4318";

async function json(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (!response.ok) {
    throw new Error(`${init?.method || "GET"} ${path} failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

async function run(input) {
  const response = await fetch(`${baseUrl}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Run failed to start (${response.status}): ${await response.text()}`);
  }
  const events = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) events.push(JSON.parse(line));
    }
  }
  if (buffer.trim()) events.push(JSON.parse(buffer));
  const failed = events.find((event) => event.type === "run_failed");
  if (failed) throw new Error(failed.message || "Provider run failed");
  const finished = events.find((event) => event.type === "run_finished");
  if (!finished?.node?.content?.trim()) {
    throw new Error(`Run produced no persisted answer. Events: ${events.map((event) => event.type).join(", ")}`);
  }
  return { node: finished.node, events };
}

async function smokeProvider({ provider, model, baseUrl: providerBaseUrl }) {
  console.log(`\n[${provider}] configuring ${model}`);
  await json("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      model,
      baseUrl: providerBaseUrl,
      hasApiKey: false,
    }),
  });
  const graph = await json("/api/graphs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `Provider smoke: ${provider}`,
      description: "Disposable end-to-end provider verification.",
    }),
  });
  const common = {
    graphId: graph.graph.id,
    referenceNodeIds: [],
    selectedText: "",
    locale: "en",
  };
  const answer = await run({
    ...common,
    parentNodeId: null,
    prompt: "Explain retrieval-augmented generation in two concise paragraphs.",
    position: { x: 120, y: 120 },
    mode: "answer",
  });
  console.log(`[${provider}] answer: ${answer.node.content.length} chars`);

  const explore = await run({
    ...common,
    parentNodeId: answer.node.id,
    prompt: "Explore one important limitation and relate it to the parent answer.",
    position: { x: 480, y: 120 },
    mode: "explore",
  });
  console.log(
    `[${provider}] explore: ${explore.node.content.length} chars, events=${explore.events.map((event) => event.type).join(",")}`,
  );

  const synthesis = await run({
    ...common,
    parentNodeId: null,
    referenceNodeIds: [answer.node.id, explore.node.id],
    prompt: "Synthesize these branches into a practical evaluation checklist.",
    position: { x: 840, y: 240 },
    mode: "synthesize",
  });
  console.log(`[${provider}] synthesis: ${synthesis.node.content.length} chars`);

  const persisted = await json(`/api/graphs/${graph.graph.id}`);
  const generated = persisted.nodes.filter((node) =>
    [answer.node.id, explore.node.id, synthesis.node.id].includes(node.id),
  );
  if (
    generated.length !== 3 ||
    generated.some(
      (node) =>
        node.status !== "complete" ||
        node.provider !== provider ||
        node.model !== model,
    )
  ) {
    throw new Error(`[${provider}] persisted node verification failed`);
  }
  if (!persisted.edges.some((edge) => edge.kind === "reference")) {
    throw new Error(`[${provider}] synthesis reference edges were not persisted`);
  }
  console.log(
    `[${provider}] persisted: 3 complete nodes and reference relationships`,
  );
}

const health = await json("/health");
if (!health.ok) throw new Error("Graph Chat smoke server is unhealthy");
const auth = await json("/api/auth/openai-codex");
if (auth.state !== "authenticated") {
  throw new Error(`Codex authentication is ${auth.state}, expected authenticated`);
}
const ollama = await json("/api/providers/ollama/models");
if (!ollama.models.includes("qwen3.5:4b")) {
  throw new Error("qwen3.5:4b is not available in Ollama");
}

const selectedProvider = process.env.GRAPHCHAT_SMOKE_PROVIDER;
if (!selectedProvider || selectedProvider === "openai-codex") {
  await smokeProvider({
    provider: "openai-codex",
    model: "gpt-5.4-mini",
    baseUrl: "",
  });
}
if (!selectedProvider || selectedProvider === "ollama") {
  await smokeProvider({
    provider: "ollama",
    model: "qwen3.5:4b",
    baseUrl: "http://127.0.0.1:11434/v1",
  });
}
console.log("\nAll real-provider smoke checks passed.");
