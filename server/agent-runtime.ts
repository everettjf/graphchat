import { Agent, type AgentEvent, type AgentTool } from "@earendil-works/pi-agent-core";
import {
  createModels,
  createProvider,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  InMemoryCredentialStore,
  Type,
  type CredentialStore,
  type Model,
  type Provider,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { nanoid } from "nanoid";
import type {
  ContextSnapshot,
  ProviderSettings,
  RunRequest,
  RunStreamEvent,
} from "../shared/types.js";
import { stripTrailingMainThreadSection } from "../shared/answer-content.js";
import { compileContext, contextToPrompt } from "./context-compiler.js";
import type { GraphDatabase } from "./database.js";

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
  zh: `你是 Graph Chat 的学习伙伴。你的任务是帮助用户理解陌生知识，而不是炫耀术语。

规则：
1. 优先基于提供的图谱上下文回答，并指出不同分支之间的关系。
2. 当信息不足且工具可用时，先读取图谱，而不是猜测。
3. 用清晰的小标题、类比和具体例子解释；保持准确，不把类比当作严格定义。
4. 引用图中信息时使用 [节点: ID]，让用户可以追溯来源。
5. 不要在正文中添加“带回主线”或类似的总结段；界面会单独展示摘要。
6. 不要自行修改图谱，只能读取；需要新增知识卡时，用文字提出建议。`,
  en: `You are Graph Chat's learning partner. Help the user understand unfamiliar ideas instead of showing off terminology.

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
  es: "Spanish",
  fr: "French",
  de: "German",
  ja: "Japanese",
  ko: "Korean",
  "zh-TW": "Traditional Chinese",
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

  const traditionalChinese = request.locale === "zh-TW";
  const sourceLines =
    sources.length > 0
      ? sources
          .map(
            (item) =>
              `- **${item.title}**：${summarize(item.content).slice(0, 88)} [${traditionalChinese ? "節點" : "节点"}: ${item.nodeId}]`,
          )
          .join("\n")
      : traditionalChinese
        ? "- 這是一個新的學習起點，目前沒有引用其他節點。"
        : "- 这是一个新的学习起点，目前没有引用其他节点。";

  if (request.mode === "synthesize") {
    if (traditionalChinese) {
      return `### 把這些分支放到同一張圖裡

你正在追問：**${request.prompt}**

從已選擇的上下文中，可以先提煉出這幾條線索：

${sourceLines}

### 它們如何匯聚

這些分支並不是彼此獨立的答案：一個分支通常給出概念的表示方式，另一個分支解釋它在系統中的作用。把它們組合起來時，應該先找共同對象，再區分各自負責的步驟，最後用一條因果鏈重新表述。

一個實用的檢查方式是問自己：**輸入是什麼、經過了什麼轉換、輸出又被誰使用？** 如果能沿這三個問題講通，表示分支已經真正匯聚，而不只是被放在一起。`;
    }
    return `### 把这些分支放到同一张图里

你正在追问：**${request.prompt}**

从已选择的上下文中，可以先提炼出这几条线索：

${sourceLines}

### 它们如何汇聚

这些分支并不是彼此独立的答案：一个分支通常给出概念的表示方式，另一个分支解释它在系统中的作用。把它们组合起来时，应该先找共同对象，再区分各自负责的步骤，最后用一条因果链重新表述。

一个实用的检查方式是问自己：**输入是什么、经过了什么转换、输出又被谁使用？** 如果能沿这三个问题讲通，说明分支已经真正汇聚，而不只是被放在一起。`;
  }

  if (traditionalChinese) {
    return `### 先抓住核心

你問的是：**${request.prompt}**

可以先把它理解為：新概念不是孤立定義，而是在已有知識鏈條中承擔某個具體作用。目前圖譜給出的相關線索是：

${sourceLines}

### 用一個簡單的方法理解

先區分「它是什麼」和「它用來做什麼」。前者給出邊界，後者把概念放回流程。再找一個反例：如果拿掉它，系統的哪一步會失效？這樣得到的理解通常比背定義更牢固。

${request.selectedText ? `你選中的原文是「${request.selectedText}」。這表示本次分支應圍繞這句話解釋，不需要把整段回答重新展開。` : "如果這個概念仍然抽象，可以繼續選中其中一個詞建立更小的分支。"}`;
  }

  return `### 先抓住核心

你问的是：**${request.prompt}**

可以先把它理解为：新概念不是孤立定义，而是在已有知识链条中承担某个具体作用。当前图谱给出的相关线索是：

${sourceLines}

### 用一个简单的方法理解

先区分“它是什么”和“它用来做什么”。前者给出边界，后者把概念放回流程。再找一个反例：如果拿掉它，系统的哪一步会失效？这样得到的理解通常比背定义更牢固。

${request.selectedText ? `你选中的原文是“${request.selectedText}”。这说明本次分支应围绕这句话解释，不需要把整段回答重新展开。` : "如果这个概念仍然抽象，可以继续选中其中一个词创建更小的分支。"}`;
}

export class GraphAgentRuntime {
  private settings: ProviderSettings;
  private runtimeApiKeys = new Map<ProviderSettings["provider"], string>();

  constructor(
    settings: ProviderSettings,
    private readonly oauthCredentials: CredentialStore = new InMemoryCredentialStore(),
  ) {
    this.settings = settings;
  }

  configure(settings: ProviderSettings, apiKey?: string) {
    this.settings = settings;
    if (apiKey?.trim()) this.runtimeApiKeys.set(settings.provider, apiKey.trim());
  }

  hasApiKey(provider: ProviderSettings["provider"] = this.settings.provider) {
    if (this.runtimeApiKeys.has(provider)) return true;
    if (provider === "openai") return Boolean(process.env.OPENAI_API_KEY);
    if (provider === "openrouter") return Boolean(process.env.OPENROUTER_API_KEY);
    return false;
  }

  async *run(
    database: GraphDatabase,
    request: RunRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<RunStreamEvent> {
    const runId = nanoid();
    const startedAt = Date.now();
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
    let agent: Agent | undefined;

    const runPromise = (async () => {
      try {
        const runtime = await this.createPiRuntime(database, request, context);
        agent = runtime.agent;
        if (signal) {
          if (signal.aborted) agent.abort();
          signal.addEventListener("abort", () => agent?.abort(), { once: true });
        }
        agent.subscribe((event) => {
          this.forwardAgentEvent(
            event,
            events,
            runId,
            node.id,
            request.locale,
            (delta) => {
              fullText += delta;
            },
          );
        });

        const graphContext = contextToPrompt(context, request.locale);
        await agent.prompt(
          request.locale.startsWith("zh")
            ? `以下是由 Graph Chat 明确选择的图谱上下文：\n\n${graphContext}\n\n---\n\n用户当前问题：${request.prompt}`
            : `Here is the graph context explicitly selected by Graph Chat:\n\n${graphContext}\n\n---\n\nCurrent question: ${request.prompt}`,
        );

        if (signal?.aborted) {
          const abortError = new Error("Generation cancelled");
          abortError.name = "AbortError";
          throw abortError;
        }
        if (!fullText.trim()) {
          throw new Error(
            agent.state.errorMessage ||
              (request.locale.startsWith("zh")
                ? "模型没有返回文本。"
                : "The model returned no text."),
          );
        }
        const completedContent = stripTrailingMainThreadSection(fullText);
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
        events.push({
          type: "run_finished",
          runId,
          nodeId: node.id,
          node: completed,
        });
        database.recordEvent(request.graphId, "run-completed", {
          mode: request.mode,
          provider: this.settings.provider,
          durationMs: Date.now() - startedAt,
          contextItems: context.items.length,
          referenceNodes: request.referenceNodeIds.length,
        });
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
        if (cancelled) {
          database.recordEvent(request.graphId, "run-cancelled", {
            mode: request.mode,
            provider: this.settings.provider,
            durationMs: Date.now() - startedAt,
          });
          events.push({
            type: "run_cancelled",
            runId,
            nodeId: node.id,
            message,
            node: updated || undefined,
          });
        } else {
          database.recordEvent(request.graphId, "run-failed", {
            mode: request.mode,
            provider: this.settings.provider,
            durationMs: Date.now() - startedAt,
          });
          events.push({
            type: "run_failed",
            runId,
            nodeId: node.id,
            message,
            node: updated || undefined,
          });
        }
      } finally {
        events.end();
      }
    })();

    for await (const event of events) yield event;
    await runPromise;
  }

  private async createPiRuntime(
    database: GraphDatabase,
    request: RunRequest,
    context: ContextSnapshot,
  ): Promise<{ agent: Agent }> {
    const credentials =
      this.settings.provider === "openai-codex"
        ? this.oauthCredentials
        : new InMemoryCredentialStore();
    const models = createModels({ credentials });
    let provider: Provider;
    let model: Model<any>;

    if (this.settings.provider === "demo") {
      const faux = fauxProvider({
        provider: "graphchat-demo",
        models: [{ id: "graphchat-guide", name: "Graph Chat Guide", contextWindow: 128_000, maxTokens: 8_000 }],
        tokensPerSecond: 180,
        tokenSize: { min: 2, max: 8 },
      });
      const finalAnswer = buildDemoAnswer(request, context);
      if (request.mode === "explore") {
        faux.setResponses([
          fauxAssistantMessage(
            fauxToolCall("graph_search", { query: request.prompt }),
            { stopReason: "toolUse" },
          ),
          fauxAssistantMessage(finalAnswer),
        ]);
      } else {
        faux.setResponses([fauxAssistantMessage(finalAnswer)]);
      }
      provider = faux.provider;
      model = faux.getModel();
    } else if (this.settings.provider === "openai-codex") {
      provider = openaiCodexProvider();
      models.setProvider(provider);
      model = models.getModel("openai-codex", this.settings.model) as Model<any>;
      if (!model) {
        throw new Error(
          request.locale.startsWith("zh")
            ? `Pi 的 OpenAI Codex 模型目录中没有 ${this.settings.model}。`
            : `${this.settings.model} is not in Pi's OpenAI Codex model catalog.`,
        );
      }
      if (!(await models.checkAuth("openai-codex"))) {
        throw new Error(
          request.locale.startsWith("zh")
            ? "请先在“模型与设置”中使用 ChatGPT 登录。"
            : "Sign in with ChatGPT from Models & settings first.",
        );
      }
    } else if (this.settings.provider === "openai") {
      provider = openaiProvider();
      models.setProvider(provider);
      model = models.getModel("openai", this.settings.model) as Model<any>;
      if (!model) {
        throw new Error(
          request.locale.startsWith("zh")
            ? `Pi 的 OpenAI 模型目录中没有 ${this.settings.model}。`
            : `${this.settings.model} is not in Pi's OpenAI model catalog.`,
        );
      }
      const key = this.runtimeApiKeys.get("openai") || process.env.OPENAI_API_KEY;
      if (key) await credentials.modify("openai", async () => ({ type: "api_key", key }));
    } else if (this.settings.provider === "openrouter") {
      provider = openrouterProvider();
      models.setProvider(provider);
      model = models.getModel("openrouter", this.settings.model) as Model<any>;
      if (!model) {
        throw new Error(
          request.locale.startsWith("zh")
            ? `Pi 的 OpenRouter 模型目录中没有 ${this.settings.model}。`
            : `${this.settings.model} is not in Pi's OpenRouter model catalog.`,
        );
      }
      const key = this.runtimeApiKeys.get("openrouter") || process.env.OPENROUTER_API_KEY;
      if (key) await credentials.modify("openrouter", async () => ({ type: "api_key", key }));
    } else {
      const providerId = this.settings.provider;
      const baseUrl =
        this.settings.baseUrl ||
        (providerId === "ollama" ? "http://127.0.0.1:11434/v1" : "");
      if (!baseUrl) {
        throw new Error(
          request.locale.startsWith("zh")
            ? "自定义模型需要填写 Base URL。"
            : "A custom model requires a Base URL.",
        );
      }
      model = {
        id: this.settings.model,
        name: this.settings.model,
        api: "openai-completions",
        provider: providerId,
        baseUrl,
        reasoning: providerId === "ollama",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens:
          providerId === "ollama"
            ? request.mode === "synthesize"
              ? 512
              : 256
            : 16_000,
        thinkingLevelMap:
          providerId === "ollama"
            ? { off: "none" }
            : undefined,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: providerId === "ollama",
        },
      };
      provider = createProvider({
        id: providerId,
        name: providerId === "ollama" ? "Ollama" : "OpenAI-compatible",
        baseUrl,
        auth: {
          apiKey: {
            name: `${providerId} API key`,
            resolve: async ({ credential }) => ({
              auth: { apiKey: credential?.key || "local", baseUrl },
              source: credential?.key ? "Graph Chat session" : "Local endpoint",
            }),
          },
        },
        models: [model],
        api: openAICompletionsApi(),
      });
      const key = this.runtimeApiKeys.get(providerId) || "local";
      await credentials.modify(providerId, async () => ({ type: "api_key", key }));
    }

    models.setProvider(provider);
    const tools = this.createGraphTools(database, request.graphId, request.locale);
    const agent = new Agent({
      initialState: {
        systemPrompt: `${request.locale.startsWith("zh") ? SYSTEM_PROMPTS.zh : SYSTEM_PROMPTS.en}

Always respond in ${RESPONSE_LANGUAGES[request.locale]}.`,
        model,
        tools,
        thinkingLevel: "off",
      },
      streamFn: (activeModel, activeContext, options) =>
        models.streamSimple(activeModel, activeContext, {
          ...options,
          sessionId: `graphchat:${request.graphId}`,
        }),
      toolExecution: "parallel",
      maxRetryDelayMs: 10_000,
    });
    return { agent };
  }

  private createGraphTools(
    database: GraphDatabase,
    graphId: string,
    locale: RunRequest["locale"],
  ): AgentTool[] {
    const searchTool: AgentTool = {
      name: "graph_search",
      label: locale.startsWith("zh") ? "搜索知识图" : "Search knowledge graph",
      description:
        locale.startsWith("zh")
          ? "在当前 Graph Chat 知识图中搜索与查询相关的节点。"
          : "Search the current Graph Chat graph for nodes related to a query.",
      parameters: Type.Object({
        query: Type.String({
          description:
            locale.startsWith("zh")
              ? "要搜索的概念、术语或问题"
              : "Concept, term, or question to search for",
        }),
      }),
      execute: async (_toolCallId, params) => {
        const query = String((params as { query: string }).query);
        const results = database.searchNodes(graphId, query);
        const text =
          results.length === 0
            ? locale.startsWith("zh")
              ? "没有找到匹配的图谱节点。"
              : "No matching graph nodes were found."
            : results
                .map(
                  (node) =>
                    `[${locale.startsWith("zh") ? "节点" : "Node"}: ${node.id}] ${node.title}\n${node.summary || summarize(node.content)}`,
                )
                .join("\n\n");
        return { content: [{ type: "text", text }], details: { resultCount: results.length } };
      },
    };

    const getNodeTool: AgentTool = {
      name: "graph_get_node",
      label: locale.startsWith("zh") ? "读取图谱节点" : "Read graph node",
      description:
        locale.startsWith("zh")
          ? "按节点 ID 读取一个 Graph Chat 节点的完整内容。"
          : "Read the full content of one Graph Chat node by ID.",
      parameters: Type.Object({
        nodeId: Type.String({
          description: locale.startsWith("zh") ? "图谱节点 ID" : "Graph node ID",
        }),
      }),
      execute: async (_toolCallId, params) => {
        const node = database.getNode(String((params as { nodeId: string }).nodeId));
        if (!node || node.graphId !== graphId) {
          throw new Error(
            locale.startsWith("zh")
              ? "找不到这个图谱节点。"
              : "This graph node does not exist.",
          );
        }
        return {
          content: [
            {
              type: "text",
              text: `[${locale.startsWith("zh") ? "节点" : "Node"}: ${node.id}] ${node.title}\n\n${node.content}`,
            },
          ],
          details: { nodeId: node.id },
        };
      },
    };
    return [searchTool, getNodeTool];
  }

  private forwardAgentEvent(
    event: AgentEvent,
    queue: AsyncEventQueue<RunStreamEvent>,
    runId: string,
    nodeId: string,
    locale: RunRequest["locale"],
    onDelta: (delta: string) => void,
  ) {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
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
            ? locale.startsWith("zh")
              ? "正在搜索知识图"
              : "Searching the knowledge graph"
            : locale.startsWith("zh")
              ? "正在读取节点"
              : "Reading a graph node",
      });
    } else if (event.type === "tool_execution_end") {
      queue.push({
        type: "tool_finished",
        runId,
        nodeId,
        tool: event.toolName,
        summary: event.isError
          ? locale.startsWith("zh")
            ? "工具执行失败"
            : "Graph tool failed"
          : locale.startsWith("zh")
            ? "图谱信息已加入上下文"
            : "Graph context added",
      });
    }
  }
}
