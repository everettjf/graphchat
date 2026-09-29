import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  Type,
  type FauxProviderHandle,
  type Model,
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createExtensionRuntime,
  getAgentDir,
  ModelRuntime,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type ResourceLoader,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { nanoid } from "nanoid";
import path from "node:path";
import type {
  ContextSnapshot,
  ProviderSettings,
  RunRequest,
  RunStreamEvent,
} from "../shared/types.js";
import { stripTrailingMainThreadSection } from "../shared/answer-content.js";
import { compileContext, contextToPrompt } from "./context-compiler.js";
import type { GraphDatabase } from "./database.js";
import { openGraphSession } from "./graph-session.js";
import { resolvePiSessionDir } from "./pi-sessions.js";

type QueueResolver<T> = (value: IteratorResult<T>) => void;

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private values: T[] = [];
  private resolvers: QueueResolver<T>[] = [];
  private ended = false;

  push(value: T) {
    const resolver = this.resolvers.shift();
    if (resolver) resolver({ value, done: false });
    else this.values.push(value);
  }

  end() {
    this.ended = true;
    for (const resolver of this.resolvers.splice(0)) {
      resolver({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.values.shift();
        if (value !== undefined) return Promise.resolve({ value, done: false });
        if (this.ended) return Promise.resolve({ value: undefined, done: true });
        return new Promise<IteratorResult<T>>((resolve) => this.resolvers.push(resolve));
      },
    };
  }
}

const SYSTEM_PROMPTS = {
  zh: `你是 Pi Graph Chat 的学习伙伴。你的任务是帮助用户理解陌生知识，而不是炫耀术语。

规则：
1. 优先基于提供的图谱上下文回答，并指出不同分支之间的关系。
2. 当信息不足且工具可用时，先读取图谱，而不是猜测。
3. 用清晰的小标题、类比和具体例子解释；保持准确，不把类比当作严格定义。
4. 引用图中信息时使用 [节点: ID]，让用户可以追溯来源。
5. 不要在正文中添加“带回主线”或类似的总结段；界面会单独展示摘要。
6. 不要自行修改图谱，只能读取；需要新增知识卡时，用文字提出建议。`,
  en: `You are Pi Graph Chat's learning partner. Help the user understand unfamiliar ideas instead of showing off terminology.

Rules:
1. Answer from the supplied graph context first and explain relationships between branches.
2. When information is missing and tools are available, read the graph instead of guessing.
3. Use clear headings, analogies, and concrete examples. Keep analogies distinct from strict definitions.
4. Cite graph information as [Node: ID] so the user can trace it.
5. Do not add a "Back to the main thread" or similar summary section to the answer body; the interface presents the summary separately.
6. Never modify the graph yourself. Graph tools are read-only; suggest useful new cards in prose.
7. For synthesis requests, use four explicit sections: Consensus, Conflicts, Evidence by source node, and Open questions. Do not hide uncertainty or merge incompatible claims.`,
} as const;

const RESPONSE_LANGUAGES: Record<RunRequest["locale"], string> = {
  en: "English",
  zh: "Simplified Chinese",
};

function summarize(content: string): string {
  const plain = content
    .replace(/[#*_`>\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 150 ? `${plain.slice(0, 147)}…` : plain;
}

function buildDemoAnswer(request: RunRequest, context: ContextSnapshot): string {
  const sources = context.items.slice(-3);
  if (!request.locale.startsWith("zh")) {
    const sourceLines =
      sources.length > 0
        ? sources
            .map(
              (item) =>
                `- **${item.title}**: ${summarize(item.content).slice(0, 88)} [Node: ${item.nodeId}]`,
            )
            .join("\n")
        : "- This is a new learning thread without referenced nodes yet.";

    if (request.mode === "synthesize") {
      return `### Put the branches on one map

You are asking: **${request.prompt}**

The selected context gives us these clues:

${sourceLines}

### Consensus

These branches are not isolated answers. One often describes how something is represented, while another explains the role it plays in a system. To combine them, identify the shared object, separate each step's responsibility, and then restate the result as one causal chain.

### Conflicts

Treat differences in definitions, scope, or assumptions as unresolved until the cited nodes support a reconciliation. Absence of a conflict in the selected context is not proof that none exists.

### Evidence by source node

${sourceLines}

### Open questions

- Which claim still depends on an unstated assumption?
- What observation or counterexample would distinguish the branches?

A useful check is: **What is the input, what transformation happens, and who uses the output?** If you can explain all three, the branches have genuinely converged instead of merely sitting next to each other.`;
    }

    return `### Start with the core

You are asking: **${request.prompt}**

Treat the new concept not as an isolated definition, but as something with a specific role in an existing chain of ideas. The current graph offers these clues:

${sourceLines}

### A practical way to understand it

Separate “what it is” from “what it does.” The first sets its boundaries; the second puts it back into the process. Then look for a counterexample: if you removed it, which step would stop working? This usually creates a stronger understanding than memorizing a definition.

${request.selectedText ? `You selected “${request.selectedText}”. This branch should explain that exact phrase without reopening the whole answer.` : "If the idea still feels abstract, select one phrase and create a smaller branch."}`;
  }

  const sourceLines =
    sources.length > 0
      ? sources
          .map(
            (item) =>
              `- **${item.title}**：${summarize(item.content).slice(0, 88)} [节点: ${item.nodeId}]`,
          )
          .join("\n")
      : "- 这是一个新的学习起点，目前没有引用其他节点。";

  if (request.mode === "synthesize") {
    return `### 把这些分支放到同一张图里

你正在追问：**${request.prompt}**

从已选择的上下文中，可以先提炼出这几条线索：

${sourceLines}

### 它们如何汇聚

这些分支并不是彼此独立的答案：一个分支通常给出概念的表示方式，另一个分支解释它在系统中的作用。把它们组合起来时，应该先找共同对象，再区分各自负责的步骤，最后用一条因果链重新表述。

一个实用的检查方式是问自己：**输入是什么、经过了什么转换、输出又被谁使用？** 如果能沿这三个问题讲通，说明分支已经真正汇聚，而不只是被放在一起。`;
  }

  return `### 先抓住核心

你问的是：**${request.prompt}**

可以先把它理解为：新概念不是孤立定义，而是在已有知识链条中承担某个具体作用。当前图谱给出的相关线索是：

${sourceLines}

### 用一个简单的方法理解

先区分“它是什么”和“它用来做什么”。前者给出边界，后者把概念放回流程。再找一个反例：如果拿掉它，系统的哪一步会失效？这样得到的理解通常比背定义更牢固。

${request.selectedText ? `你选中的原文是“${request.selectedText}”。这说明本次分支应围绕这句话解释，不需要把整段回答重新展开。` : "如果这个概念仍然抽象，可以继续选中其中一个词创建更小的分支。"}`;
}

/** Pi providers with a static model catalog and API-key auth. */
const CATALOG_PROVIDERS = {
  openai: { envKey: "OPENAI_API_KEY", label: "OpenAI" },
  openrouter: { envKey: "OPENROUTER_API_KEY", label: "OpenRouter" },
  anthropic: { envKey: "ANTHROPIC_API_KEY", label: "Anthropic" },
  google: { envKey: "GEMINI_API_KEY", label: "Google Gemini" },
} as const;
type CatalogProviderId = keyof typeof CATALOG_PROVIDERS;

const DEMO_PROVIDER_ID = "graphchat-demo";
const DEMO_MODEL_ID = "graphchat-guide";
const CODEX_PROVIDER_ID = "openai-codex";

export type GraphAgentRuntimeOptions = {
  /** Directory that holds the graph database. Doubles as the Pi session cwd. */
  dataDirectory: string;
  /** Pi agent directory (auth.json, models.json). Defaults to Pi's own. */
  agentDir?: string;
  /** Root of Pi's session tree. Defaults to Pi's own session directory. */
  sessionRoot?: string;
};

function learningResourceLoader(systemPrompt: string): ResourceLoader {
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}

/**
 * Runs graph answers through Pi's coding-agent session runtime.
 *
 * Every graph is backed by a Pi session file. A new answer branches the
 * session at the parent node's entry, so the graph's structure and the
 * session tree stay identical and the same session opens in the terminal.
 */
export class GraphAgentRuntime {
  private settings: ProviderSettings;
  private readonly runtimeApiKeys = new Map<ProviderSettings["provider"], string>();
  private readonly graphLocks = new Map<string, Promise<void>>();
  private faux: FauxProviderHandle | null = null;
  readonly dataDirectory: string;
  readonly sessionRoot: string;

  private constructor(
    settings: ProviderSettings,
    readonly modelRuntime: ModelRuntime,
    options: GraphAgentRuntimeOptions,
  ) {
    this.settings = settings;
    this.dataDirectory = path.resolve(options.dataDirectory);
    this.sessionRoot = options.sessionRoot ?? resolvePiSessionDir();
  }

  static async create(
    settings: ProviderSettings,
    options: GraphAgentRuntimeOptions,
  ): Promise<GraphAgentRuntime> {
    const agentDir = options.agentDir ?? getAgentDir();
    const modelRuntime = await ModelRuntime.create({
      authPath: path.join(agentDir, "auth.json"),
      modelsPath: path.join(agentDir, "models.json"),
      refreshOnCreate: false,
    });
    return new GraphAgentRuntime(settings, modelRuntime, options);
  }

  async configure(settings: ProviderSettings, apiKey?: string) {
    this.settings = settings;
    const key = apiKey?.trim();
    if (!key) return;
    this.runtimeApiKeys.set(settings.provider, key);
    if (settings.provider in CATALOG_PROVIDERS) {
      await this.modelRuntime.setRuntimeApiKey(settings.provider, key);
    }
  }

  hasApiKey(provider: ProviderSettings["provider"] = this.settings.provider) {
    if (this.runtimeApiKeys.has(provider)) return true;
    if (provider in CATALOG_PROVIDERS) return this.modelRuntime.hasConfiguredAuth(provider);
    return false;
  }

  /** Command that resumes a graph's Pi session in the terminal. */
  sessionCwd() {
    return this.dataDirectory;
  }

  async *run(
    database: GraphDatabase,
    request: RunRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<RunStreamEvent> {
    const runId = nanoid();
    const graph = database.getGraph(request.graphId);
    if (!graph) {
      yield {
        type: "run_failed",
        runId,
        nodeId: null,
        message:
          request.locale.startsWith("zh")
            ? "找不到这张知识图。"
            : "This knowledge graph does not exist.",
      };
      return;
    }

    const context = compileContext({
      graph,
      parentNodeId: request.parentNodeId,
      referenceNodeIds: request.referenceNodeIds,
      selectedText: request.selectedText,
      locale: request.locale,
    });

    const node = database.createNode(
      {
        graphId: request.graphId,
        parentNodeId: request.parentNodeId,
        parentEdgeKind: request.relationKind,
        referenceNodeIds: request.referenceNodeIds,
        kind: request.mode === "synthesize" ? "summary" : "answer",
        title: request.prompt.length > 42 ? `${request.prompt.slice(0, 39)}…` : request.prompt,
        prompt: request.prompt,
        content: "",
        summary: "",
        contextSnapshot: context,
        selectedText: request.selectedText,
        x: request.position.x,
        y: request.position.y,
      },
      this.settings.provider,
      this.settings.model,
    );
    if (
      graph.nodes.length === 0 &&
      /^(?:Learning thread|Thread)\s+\d+$/i.test(graph.graph.title)
    ) {
      const title = request.prompt.replace(/\s+/g, " ").trim();
      database.updateGraph(request.graphId, {
        title: title.length > 56 ? `${title.slice(0, 53)}…` : title,
      });
    }
    database.updateNode(node.id, { status: "streaming" });
    yield {
      type: "run_started",
      runId,
      nodeId: node.id,
      node: { ...node, status: "streaming" },
      context,
      relationKind: request.relationKind,
    };

    const events = new AsyncEventQueue<RunStreamEvent>();
    let fullText = "";
    let session: AgentSession | undefined;

    const runPromise = this.withGraphLock(request.graphId, async () => {
      try {
        const model = await this.resolveModel(request, context);
        // Re-read inside the lock: a queued run must see entries the previous
        // run just assigned, or it would replay those nodes a second time.
        const current = database.getGraph(request.graphId) ?? graph;
        const { manager } = openGraphSession(database, current, {
          cwd: this.dataDirectory,
          sessionRoot: this.sessionRoot,
        });

        // Branch the Pi session at the parent's answer so the new prompt becomes
        // its child; a root question starts a new root in the session tree.
        const parent = request.parentNodeId ? database.getNode(request.parentNodeId) : null;
        if (parent?.piEntryId && manager.getEntry(parent.piEntryId)) manager.branch(parent.piEntryId);
        else manager.resetLeaf();

        // The parent path is already the session's active branch. Only references
        // and selected text need to be injected, as a context-bearing entry.
        const extras = context.items.filter((item) => item.reason !== "main-path");
        if (extras.length > 0) {
          manager.appendCustomMessageEntry(
            "graphchat.references",
            contextToPrompt({ ...context, items: extras }, request.locale),
            true,
            { nodeIds: extras.map((item) => item.nodeId), targetNodeId: node.id },
          );
        }

        const systemPrompt = `${request.locale.startsWith("zh") ? SYSTEM_PROMPTS.zh : SYSTEM_PROMPTS.en}

Always respond in ${RESPONSE_LANGUAGES[request.locale]}.`;
        const created = await createAgentSession({
          cwd: this.dataDirectory,
          model,
          thinkingLevel: "off",
          modelRuntime: this.modelRuntime,
          sessionManager: manager,
          resourceLoader: learningResourceLoader(systemPrompt),
          tools: [],
          customTools: this.createGraphTools(database, request.graphId, request.locale),
          settingsManager: SettingsManager.inMemory({
            compaction: { enabled: true },
            retry: { enabled: true, maxRetries: 2 },
          }),
        });
        session = created.session;
        const activeSession = session;
        if (signal) {
          if (signal.aborted) void activeSession.abort();
          signal.addEventListener("abort", () => void activeSession.abort(), { once: true });
        }
        activeSession.subscribe((event) => {
          this.forwardSessionEvent(event, events, runId, node.id, request.locale, (delta) => {
            fullText += delta;
          });
        });

        await activeSession.prompt(request.prompt, { expandPromptTemplates: false });

        if (signal?.aborted) {
          const abortError = new Error("Generation cancelled");
          abortError.name = "AbortError";
          throw abortError;
        }
        const answerText = fullText.trim() ? fullText : activeSession.getLastAssistantText() ?? "";
        if (!answerText.trim()) {
          throw new Error(
            activeSession.agent.state.errorMessage ||
              (request.locale.startsWith("zh")
                ? "模型没有返回文本。"
                : "The model returned no text."),
          );
        }
        const completedContent = stripTrailingMainThreadSection(answerText);
        database.setNodePiEntry(node.id, manager.getLeafId());
        const completed = database.updateNode(node.id, {
          content: completedContent,
          summary: summarize(completedContent),
          status: "complete",
          provider: this.settings.provider,
          model: this.settings.model,
        });
        if (!completed) {
          throw new Error(
            request.locale.startsWith("zh")
              ? "无法保存生成结果。"
              : "Unable to save the generated answer.",
          );
        }
        events.push({ type: "run_finished", runId, nodeId: node.id, node: completed });
      } catch (error) {
        const cancelled =
          Boolean(signal?.aborted) ||
          (error instanceof Error && error.name === "AbortError");
        const message = cancelled
          ? request.locale.startsWith("zh")
            ? "生成已取消。"
            : "Generation cancelled."
          : error instanceof Error
            ? error.message
            : request.locale.startsWith("zh")
              ? "生成失败，请检查模型设置。"
              : "Generation failed. Check the model settings.";
        const updated = database.updateNode(node.id, {
          status: cancelled ? "cancelled" : "error",
          content:
            fullText ||
            (cancelled
              ? ""
              : request.locale.startsWith("zh")
                ? `生成失败：${message}`
                : `Generation failed: ${message}`),
        });
        events.push(
          cancelled
            ? { type: "run_cancelled", runId, nodeId: node.id, message, node: updated || undefined }
            : { type: "run_failed", runId, nodeId: node.id, message, node: updated || undefined },
        );
      } finally {
        session?.dispose();
        events.end();
      }
    });

    for await (const event of events) yield event;
    await runPromise;
  }

  /** Session files are single-writer: serialize runs that touch the same graph. */
  private withGraphLock<T>(graphId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.graphLocks.get(graphId) ?? Promise.resolve();
    const next = previous.then(task, task);
    const settled = next.then(
      () => undefined,
      () => undefined,
    );
    this.graphLocks.set(graphId, settled);
    void settled.then(() => {
      if (this.graphLocks.get(graphId) === settled) this.graphLocks.delete(graphId);
    });
    return next;
  }

  private async resolveModel(request: RunRequest, context: ContextSnapshot): Promise<Model<any>> {
    const zh = request.locale.startsWith("zh");
    const providerId = this.settings.provider;

    if (providerId === "demo") {
      if (!this.faux) {
        this.faux = fauxProvider({
          provider: DEMO_PROVIDER_ID,
          models: [{ id: DEMO_MODEL_ID, name: "Pi Graph Chat Guide", contextWindow: 128_000, maxTokens: 8_000 }],
          tokensPerSecond: 180,
          tokenSize: { min: 2, max: 8 },
        });
        this.modelRuntime.registerNativeProvider(this.faux.provider);
      }
      const finalAnswer = buildDemoAnswer(request, context);
      this.faux.setResponses(
        request.mode === "explore"
          ? [
              fauxAssistantMessage(fauxToolCall("graph_search", { query: request.prompt }), {
                stopReason: "toolUse",
              }),
              fauxAssistantMessage(finalAnswer),
            ]
          : [fauxAssistantMessage(finalAnswer)],
      );
      const model = this.modelRuntime.getModel(DEMO_PROVIDER_ID, DEMO_MODEL_ID);
      if (!model) throw new Error("The demo model is unavailable.");
      return model;
    }

    if (providerId === CODEX_PROVIDER_ID) {
      const model = this.modelRuntime.getModel(CODEX_PROVIDER_ID, this.settings.model);
      if (!model) {
        throw new Error(
          zh
            ? `Pi 的 OpenAI Codex 模型目录中没有 ${this.settings.model}。`
            : `${this.settings.model} is not in Pi's OpenAI Codex model catalog.`,
        );
      }
      if ((await this.modelRuntime.checkAuth(CODEX_PROVIDER_ID))?.type !== "oauth") {
        throw new Error(
          zh
            ? "请先在“模型与设置”中使用 ChatGPT 登录。"
            : "Sign in with ChatGPT from Models & settings first.",
        );
      }
      return model;
    }

    if (providerId in CATALOG_PROVIDERS) {
      const catalog = CATALOG_PROVIDERS[providerId as CatalogProviderId];
      const model = this.modelRuntime.getModel(providerId, this.settings.model);
      if (!model) {
        throw new Error(
          zh
            ? `Pi 的 ${catalog.label} 模型目录中没有 ${this.settings.model}。`
            : `${this.settings.model} is not in Pi's ${catalog.label} model catalog.`,
        );
      }
      if (!this.modelRuntime.hasConfiguredAuth(providerId)) {
        throw new Error(
          zh
            ? `请先为 ${catalog.label} 提供 API Key（${catalog.envKey} 或在设置中输入）。`
            : `Provide an API key for ${catalog.label} first (${catalog.envKey} or in settings).`,
        );
      }
      return model;
    }

    // Ollama and OpenAI-compatible endpoints are registered as a Pi provider.
    const baseUrl =
      this.settings.baseUrl || (providerId === "ollama" ? "http://127.0.0.1:11434/v1" : "");
    if (!baseUrl) {
      throw new Error(zh ? "自定义模型需要填写 Base URL。" : "A custom model requires a Base URL.");
    }
    this.modelRuntime.registerProvider(providerId, {
      name: providerId === "ollama" ? "Ollama" : "OpenAI-compatible",
      baseUrl,
      apiKey: this.runtimeApiKeys.get(providerId) || "local",
      api: "openai-completions",
      models: [
        {
          id: this.settings.model,
          name: this.settings.model,
          reasoning: providerId === "ollama",
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128_000,
          maxTokens:
            providerId === "ollama" ? (request.mode === "synthesize" ? 512 : 256) : 16_000,
          thinkingLevelMap: providerId === "ollama" ? { off: "none" } : undefined,
          compat: {
            supportsDeveloperRole: false,
            supportsReasoningEffort: providerId === "ollama",
          },
        },
      ],
    });
    const model = this.modelRuntime.getModel(providerId, this.settings.model);
    if (!model) throw new Error(zh ? "无法注册自定义模型。" : "Unable to register the custom model.");
    return model;
  }

  private createGraphTools(
    database: GraphDatabase,
    graphId: string,
    locale: RunRequest["locale"],
  ): ToolDefinition[] {
    const zh = locale.startsWith("zh");
    const searchTool: ToolDefinition = {
      name: "graph_search",
      label: zh ? "搜索知识图" : "Search knowledge graph",
      description: zh
        ? "在当前 Pi Graph Chat 知识图中搜索与查询相关的节点。"
        : "Search the current Pi Graph Chat graph for nodes related to a query.",
      promptSnippet: zh ? "搜索当前知识图的节点" : "Search the current knowledge graph",
      parameters: Type.Object({
        query: Type.String({
          description: zh ? "要搜索的概念、术语或问题" : "Concept, term, or question to search for",
        }),
      }),
      execute: async (_toolCallId, params) => {
        const query = String((params as { query: string }).query);
        const results = database.searchNodes(graphId, query);
        const text =
          results.length === 0
            ? zh
              ? "没有找到匹配的图谱节点。"
              : "No matching graph nodes were found."
            : results
                .map(
                  (node) =>
                    `[${zh ? "节点" : "Node"}: ${node.id}] ${node.title}\n${node.summary || summarize(node.content)}`,
                )
                .join("\n\n");
        return { content: [{ type: "text", text }], details: { resultCount: results.length } };
      },
    };

    const getNodeTool: ToolDefinition = {
      name: "graph_get_node",
      label: zh ? "读取图谱节点" : "Read graph node",
      description: zh
        ? "按节点 ID 读取一个 Pi Graph Chat 节点的完整内容。"
        : "Read the full content of one Pi Graph Chat node by ID.",
      promptSnippet: zh ? "按 ID 读取一个图谱节点" : "Read one graph node by id",
      parameters: Type.Object({
        nodeId: Type.String({ description: zh ? "图谱节点 ID" : "Graph node ID" }),
      }),
      execute: async (_toolCallId, params) => {
        const node = database.getNode(String((params as { nodeId: string }).nodeId));
        if (!node || node.graphId !== graphId) {
          throw new Error(zh ? "找不到这个图谱节点。" : "This graph node does not exist.");
        }
        return {
          content: [
            {
              type: "text",
              text: `[${zh ? "节点" : "Node"}: ${node.id}] ${node.title}\n\n${node.content}`,
            },
          ],
          details: { nodeId: node.id },
        };
      },
    };
    return [searchTool, getNodeTool];
  }

  private forwardSessionEvent(
    event: AgentSessionEvent,
    queue: AsyncEventQueue<RunStreamEvent>,
    runId: string,
    nodeId: string,
    locale: RunRequest["locale"],
    onDelta: (delta: string) => void,
  ) {
    const zh = locale.startsWith("zh");
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      const delta = event.assistantMessageEvent.delta;
      onDelta(delta);
      queue.push({ type: "text_delta", runId, nodeId, delta });
    } else if (event.type === "tool_execution_start") {
      queue.push({
        type: "tool_started",
        runId,
        nodeId,
        tool: event.toolName,
        label:
          event.toolName === "graph_search"
            ? zh
              ? "正在搜索知识图"
              : "Searching the knowledge graph"
            : event.toolName === "graph_get_node"
              ? zh
                ? "正在读取节点"
                : "Reading a graph node"
              : zh
                ? `正在运行 ${event.toolName}`
                : `Running ${event.toolName}`,
      });
    } else if (event.type === "tool_execution_end") {
      queue.push({
        type: "tool_finished",
        runId,
        nodeId,
        tool: event.toolName,
        summary: event.isError
          ? zh
            ? "工具执行失败"
            : "Tool failed"
          : zh
            ? "工具结果已加入上下文"
            : "Tool result added to context",
      });
    }
  }
}
