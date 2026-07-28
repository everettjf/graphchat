const baseUrl = (
  process.env.GRAPHCHAT_BASE_URL ||
  process.argv.find((argument) => argument.startsWith("--base-url="))?.split("=")[1] ||
  "http://127.0.0.1:4317"
).replace(/\/$/, "");

const suppliedLabel =
  process.env.GRAPHCHAT_SEED_LABEL ||
  process.argv.find((argument) => argument.startsWith("--label="))?.split("=")[1];
const runLabel =
  suppliedLabel ||
  `qa-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
const numericTitleSeed = Number(
  `${Date.now()}`.slice(-9),
);

const scenarios = [
  {
    key: "distributed-transactions",
    description: "A deep learning path through distributed transactions and failure handling.",
    root:
      "Build a practical mental model of distributed transactions. Start with the core problem, then compare two-phase commit, consensus, and sagas with one concrete example.",
    branches: [
      "Go one level deeper: what exactly does atomicity mean when machines can crash independently? Use a small timeline.",
      "Now distinguish atomic commit from consensus. Which decision is each protocol trying to make, and what assumptions differ?",
      "Explain the blocking failure mode of two-phase commit step by step. Identify the precise moment progress can stop.",
      "Show how three-phase commit tries to reduce blocking, then state why real systems still rarely rely on it under partitions.",
      "Connect this to the FLP result without overclaiming. What does FLP actually rule out, and what does it leave possible?",
      "Explain how practical consensus systems make progress despite FLP. Compare timeouts, leader election, and quorum intersection.",
      "Apply the model to a payment workflow. Separate the ledger transaction from calls to inventory, email, and fraud services.",
      "Design a saga for that payment workflow. List forward actions, compensations, and one compensation that cannot truly undo reality.",
      "Add idempotency and the transactional outbox. Explain which duplicate and lost-message failures each technique prevents.",
      "Finish with an operational debugging checklist for a transaction stuck across services. Tie every check back to the failure model developed above.",
    ],
  },
  {
    key: "compiler-pipeline",
    description: "A grounded introduction to how compilers transform programs.",
    root:
      "Teach me how a modern compiler turns source code into machine code. Trace one tiny expression through parsing, typing, IR, optimization, and code generation.",
    branches: [],
  },
  {
    key: "database-indexes",
    description: "A practical guide to database indexes and query planning.",
    root:
      "Explain database indexes from first principles using one realistic query. Compare a B-tree index, a composite index, and a full table scan, including their write costs.",
    branches: [],
  },
  {
    key: "causal-inference",
    description: "A practical mental model for causal inference.",
    root:
      "Give me a practical mental model for causal inference. Use a product experiment to explain confounding, randomization, mediators, and colliders.",
    branches: [],
  },
  {
    key: "rust-ownership",
    description: "A concrete learning path through Rust ownership.",
    root:
      "Explain Rust ownership, borrowing, and lifetimes through one concrete program. Show what the compiler is protecting and why the same bug is possible in C++.",
    branches: [],
  },
];

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    signal: AbortSignal.timeout(120_000),
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed (${response.status}): ${body}`);
  }
  return body ? JSON.parse(body) : null;
}

async function runQuestion({
  graphId,
  parentNodeId,
  relationKind,
  prompt,
  depth,
}) {
  const response = await fetch(`${baseUrl}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      graphId,
      parentNodeId,
      relationKind,
      referenceNodeIds: [],
      prompt,
      selectedText: null,
      position: {
        x: 120 + depth * 120,
        y: 140 + depth * 220,
      },
      mode: "answer",
      locale: "en",
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`POST /api/runs failed (${response.status}): ${body}`);
  }

  const events = body
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
  const failed = events.find((event) => event.type === "run_failed");
  if (failed) throw new Error(failed.message);
  const finished = events.findLast((event) => event.type === "run_finished");
  if (!finished?.node || finished.node.status !== "complete") {
    throw new Error(`Run did not finish for prompt: ${prompt}`);
  }
  return finished.node;
}

function findExistingNode(document, prompt) {
  return document.nodes.find(
    (node) => node.prompt === prompt && node.status === "complete",
  );
}

function branchDepth(document, rootNodeId) {
  const children = new Map();
  for (const edge of document.edges.filter((edge) => edge.kind === "branch")) {
    const targets = children.get(edge.source) || [];
    targets.push(edge.target);
    children.set(edge.source, targets);
  }

  const visit = (nodeId, seen = new Set()) => {
    if (seen.has(nodeId)) return 0;
    const nextSeen = new Set(seen).add(nodeId);
    return Math.max(
      0,
      ...(children.get(nodeId) || []).map(
        (childId) => 1 + visit(childId, nextSeen),
      ),
    );
  };
  return visit(rootNodeId);
}

const auth = await requestJson("/api/auth/openai-codex");
const bootstrap = await requestJson("/api/bootstrap");
if (
  bootstrap.settings.provider === "openai-codex" &&
  auth.state !== "authenticated"
) {
  throw new Error("ChatGPT OAuth is not authenticated.");
}

console.log(
  `Real-data seed ${runLabel}: ${bootstrap.settings.provider} / ${bootstrap.settings.model}`,
);

const createdGraphs = [];
for (const [scenarioIndex, scenario] of scenarios.entries()) {
  const marker = `[Automated real-data QA ${runLabel}/${scenario.key}]`;
  let graph = bootstrap.graphs.find(
    (candidate) => candidate.description.includes(marker),
  );
  if (!graph) {
    const created = await requestJson("/api/graphs", {
      method: "POST",
      body: JSON.stringify({
        title: `Thread ${numericTitleSeed + scenarioIndex}`,
        description: `${scenario.description} ${marker}`,
      }),
    });
    graph = created.graph || created;
    console.log(`Created thread ${scenarioIndex + 1}/5: ${scenario.key}`);
  } else {
    console.log(`Resuming thread ${scenarioIndex + 1}/5: ${scenario.key}`);
  }

  let document = await requestJson(`/api/graphs/${graph.id}`);
  let parentNode = findExistingNode(document, scenario.root);
  if (!parentNode) {
    console.log(`  Generating root answer: ${scenario.root.slice(0, 68)}…`);
    parentNode = await runQuestion({
      graphId: graph.id,
      parentNodeId: null,
      relationKind: "continuation",
      prompt: scenario.root,
      depth: 0,
    });
  }
  const rootNode = parentNode;

  for (const [branchIndex, prompt] of scenario.branches.entries()) {
    document = await requestJson(`/api/graphs/${graph.id}`);
    const existing = findExistingNode(document, prompt);
    if (existing) {
      parentNode = existing;
      console.log(`  Reused branch depth ${branchIndex + 1}/10`);
      continue;
    }
    console.log(`  Generating branch depth ${branchIndex + 1}/10…`);
    parentNode = await runQuestion({
      graphId: graph.id,
      parentNodeId: parentNode.id,
      relationKind: "branch",
      prompt,
      depth: branchIndex + 1,
    });
  }

  document = await requestJson(`/api/graphs/${graph.id}`);
  createdGraphs.push({
    id: graph.id,
    title: document.graph.title,
    nodes: document.nodes.length,
    edges: document.edges.length,
    branchDepth: branchDepth(document, rootNode.id),
  });
}

const verification = {
  runLabel,
  provider: bootstrap.settings.provider,
  model: bootstrap.settings.model,
  threads: createdGraphs.length,
  totalNodes: createdGraphs.reduce((total, graph) => total + graph.nodes, 0),
  deepestBranch: Math.max(...createdGraphs.map((graph) => graph.branchDepth)),
  graphs: createdGraphs,
};

if (verification.threads < 5 || verification.deepestBranch < 10) {
  throw new Error(`Verification failed: ${JSON.stringify(verification)}`);
}

console.log("VERIFICATION");
console.log(JSON.stringify(verification, null, 2));
