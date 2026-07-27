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
import type {
  ContextSnapshot,
  ProviderSettings,
  RunRequest,
  RunStreamEvent,
} from "../shared/types.js";
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

const SYSTEM_PROMPT = `你是 Graph Chat 的学习伙伴。你的任务是帮助用户理解陌生知识，而不是炫耀术语。

规则：
1. 优先基于提供的图谱上下文回答，并指出不同分支之间的关系。
2. 当信息不足且工具可用时，先读取图谱，而不是猜测。
3. 用清晰的小标题、类比和具体例子解释；保持准确，不把类比当作严格定义。
4. 引用图中信息时使用 [节点: ID]，让用户可以追溯来源。
5. 回答结尾给出一句“带回主线”的总结，说明这次理解如何帮助原问题。
6. 不要自行修改图谱，只能读取；需要新增知识卡时，用文字提出建议。`;

function summarize(content: string): string {
  const plain = content
    .replace(/[#*_`>\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 150 ? `${plain.slice(0, 147)}…` : plain;
}

function buildDemoAnswer(request: RunRequest, context: ContextSnapshot): string {
  const sources = context.items.slice(-3);
  const sourceLines =
    sources.length > 0
      ? sources
          .map((item) => `- **${item.title}**：${summarize(item.content).slice(0, 88)} [节点: ${item.nodeId}]`)
          .join("\n")
      : "- 这是一个新的学习起点，目前没有引用其他节点。";

  if (request.mode === "synthesize") {
    return `### 把这些分支放到同一张图里

你正在追问：**${request.prompt}**

从已选择的上下文中，可以先提炼出这几条线索：

${sourceLines}

### 它们如何汇聚

这些分支并不是彼此独立的答案：一个分支通常给出概念的表示方式，另一个分支解释它在系统中的作用。把它们组合起来时，应该先找共同对象，再区分各自负责的步骤，最后用一条因果链重新表述。

一个实用的检查方式是问自己：**输入是什么、经过了什么转换、输出又被谁使用？** 如果能沿这三个问题讲通，说明分支已经真正汇聚，而不只是被放在一起。

> **带回主线：** 你现在可以把多个局部解释压缩成一条完整机制，再回到最初问题检验它是否解释了整体。`;
  }

  return `### 先抓住核心

你问的是：**${request.prompt}**

可以先把它理解为：新概念不是孤立定义，而是在已有知识链条中承担某个具体作用。当前图谱给出的相关线索是：

${sourceLines}

### 用一个简单的方法理解

先区分“它是什么”和“它用来做什么”。前者给出边界，后者把概念放回流程。再找一个反例：如果拿掉它，系统的哪一步会失效？这样得到的理解通常比背定义更牢固。

${request.selectedText ? `你选中的原文是“${request.selectedText}”。这说明本次分支应围绕这句话解释，不需要把整段回答重新展开。` : "如果这个概念仍然抽象，可以继续选中其中一个词创建更小的分支。"}

> **带回主线：** 把这次解释压缩成一句自己的话，然后返回父节点，看原回答是否已经能够顺畅读下去。`;
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
    const graph = database.getGraph(request.graphId);
    if (!graph) {
      yield { type: "run_failed", message: "找不到这张知识图。" };
      return;
    }

    const context = compileContext({
      graph,
      parentNodeId: request.parentNodeId,
      referenceNodeIds: request.referenceNodeIds,
      selectedText: request.selectedText,
    });

    const node = database.createNode(
      {
        graphId: request.graphId,
        parentNodeId: request.parentNodeId,
        referenceNodeIds: request.referenceNodeIds,
        kind: request.mode === "synthesize" ? "summary" : "answer",
        title: request.prompt.length > 42 ? `${request.prompt.slice(0, 39)}…` : request.prompt,
        prompt: request.prompt,
        content: "",
        summary: "",
        selectedText: request.selectedText,
        x: request.position.x,
        y: request.position.y,
      },
      this.settings.provider,
      this.settings.model,
    );
    database.updateNode(node.id, { status: "streaming" });
    yield { type: "run_started", node: { ...node, status: "streaming" }, context };

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
          this.forwardAgentEvent(event, events, (delta) => {
            fullText += delta;
          });
        });

        const graphContext = contextToPrompt(context);
        await agent.prompt(
          `以下是由 Graph Chat 明确选择的图谱上下文：\n\n${graphContext}\n\n---\n\n用户当前问题：${request.prompt}`,
        );

        if (!fullText.trim()) {
          throw new Error(agent.state.errorMessage || "模型没有返回文本。");
        }
        const completed = database.updateNode(node.id, {
          content: fullText,
          summary: summarize(fullText),
          status: "complete",
          provider: this.settings.provider,
          model: this.settings.model,
        });
        if (!completed) throw new Error("无法保存生成结果。");
        events.push({ type: "run_finished", node: completed });
      } catch (error) {
        const message = error instanceof Error ? error.message : "生成失败，请检查模型设置。";
        database.updateNode(node.id, {
          status: "error",
          content: fullText || `生成失败：${message}`,
        });
        events.push({ type: "run_failed", message });
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
        tokensPerSecond: 90,
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
        throw new Error(`Pi 的 OpenAI Codex 模型目录中没有 ${this.settings.model}。`);
      }
      if (!(await models.checkAuth("openai-codex"))) {
        throw new Error("请先在“模型与设置”中使用 ChatGPT 登录。");
      }
    } else if (this.settings.provider === "openai") {
      provider = openaiProvider();
      models.setProvider(provider);
      model = models.getModel("openai", this.settings.model) as Model<any>;
      if (!model) throw new Error(`Pi 的 OpenAI 模型目录中没有 ${this.settings.model}。`);
      const key = this.runtimeApiKeys.get("openai") || process.env.OPENAI_API_KEY;
      if (key) await credentials.modify("openai", async () => ({ type: "api_key", key }));
    } else if (this.settings.provider === "openrouter") {
      provider = openrouterProvider();
      models.setProvider(provider);
      model = models.getModel("openrouter", this.settings.model) as Model<any>;
      if (!model) throw new Error(`Pi 的 OpenRouter 模型目录中没有 ${this.settings.model}。`);
      const key = this.runtimeApiKeys.get("openrouter") || process.env.OPENROUTER_API_KEY;
      if (key) await credentials.modify("openrouter", async () => ({ type: "api_key", key }));
    } else {
      const providerId = this.settings.provider;
      const baseUrl =
        this.settings.baseUrl ||
        (providerId === "ollama" ? "http://127.0.0.1:11434/v1" : "");
      if (!baseUrl) throw new Error("自定义模型需要填写 Base URL。");
      model = {
        id: this.settings.model,
        name: this.settings.model,
        api: "openai-completions",
        provider: providerId,
        baseUrl,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 16_000,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
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
    const tools = this.createGraphTools(database, request.graphId);
    const agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
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

  private createGraphTools(database: GraphDatabase, graphId: string): AgentTool[] {
    const searchTool: AgentTool = {
      name: "graph_search",
      label: "搜索知识图",
      description: "在当前 Graph Chat 知识图中搜索与查询相关的节点。",
      parameters: Type.Object({
        query: Type.String({ description: "要搜索的概念、术语或问题" }),
      }),
      execute: async (_toolCallId, params) => {
        const query = String((params as { query: string }).query);
        const results = database.searchNodes(graphId, query);
        const text =
          results.length === 0
            ? "没有找到匹配的图谱节点。"
            : results
                .map((node) => `[节点: ${node.id}] ${node.title}\n${node.summary || summarize(node.content)}`)
                .join("\n\n");
        return { content: [{ type: "text", text }], details: { resultCount: results.length } };
      },
    };

    const getNodeTool: AgentTool = {
      name: "graph_get_node",
      label: "读取图谱节点",
      description: "按节点 ID 读取一个 Graph Chat 节点的完整内容。",
      parameters: Type.Object({
        nodeId: Type.String({ description: "图谱节点 ID" }),
      }),
      execute: async (_toolCallId, params) => {
        const node = database.getNode(String((params as { nodeId: string }).nodeId));
        if (!node || node.graphId !== graphId) throw new Error("找不到这个图谱节点。");
        return {
          content: [{ type: "text", text: `[节点: ${node.id}] ${node.title}\n\n${node.content}` }],
          details: { nodeId: node.id },
        };
      },
    };
    return [searchTool, getNodeTool];
  }

  private forwardAgentEvent(
    event: AgentEvent,
    queue: AsyncEventQueue<RunStreamEvent>,
    onDelta: (delta: string) => void,
  ) {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      const delta = event.assistantMessageEvent.delta;
      onDelta(delta);
      queue.push({ type: "text_delta", delta });
    } else if (event.type === "tool_execution_start") {
      queue.push({
        type: "tool_started",
        tool: event.toolName,
        label: event.toolName === "graph_search" ? "正在搜索知识图" : "正在读取节点",
      });
    } else if (event.type === "tool_execution_end") {
      queue.push({
        type: "tool_finished",
        tool: event.toolName,
        summary: event.isError ? "工具执行失败" : "图谱信息已加入上下文",
      });
    }
  }
}
