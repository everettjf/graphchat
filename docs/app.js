const chinese = {
  metaDescription: "Graph Chat 是一个本地优先、图谱原生的 AI 学习工作区。分叉追问，跨分支引用，再把理解带回主线。",
  ogDescription: "把 AI 对话变成可以分叉、引用、汇聚和继续生长的知识图。",
  skipLink: "跳到主要内容",
  brandHome: "Graph Chat 首页",
  brandSubtitle: "学习工作区",
  primaryNavigation: "主要导航",
  navWorkflow: "工作方式",
  navFeatures: "能力",
  navArchitecture: "架构",
  language: "语言",
  heroTitleOne: "在分支中学习。",
  heroTitleTwo: "在图谱中记忆。",
  heroLead: "不再把所有追问塞进一条聊天记录。从任意概念创建分支，在自己的上下文中深入，再引用多个理解汇聚成更好的问题。",
  heroPrimary: "本地开始使用",
  heroPrimaryHref: "https://github.com/everettjf/graphchat/blob/main/README.zh-CN.md#快速开始",
  heroSecondary: "看看它如何工作",
  projectHighlights: "项目特点",
  trustOpenSource: "MIT 开源",
  trustSqlite: "本地 SQLite",
  trustChatgpt: "ChatGPT 订阅",
  trustCloud: "无需云服务",
  productPreview: "Graph Chat 产品界面示意",
  mockWindowTitle: "理解 RAG：从陌生概念到完整图景",
  mockGraph: "图谱",
  mockNew: "＋ 新建学习起点",
  mockSearch: "⌕  搜索节点…",
  mockKnowledgeGraph: "⌘  知识图",
  mockCards: "▣  理解卡",
  mockRecent: "最近浏览",
  mockEmbeddingQuestion: "Embedding 到底是什么？",
  mockVectorQuestion: "向量数据库做了什么？",
  mockNow: "刚刚",
  mockMinutes: "3 分钟前",
  nodeAnswer: "回答",
  nodeConcept: "概念",
  nodeSynthesis: "汇聚",
  mockRagQuestion: "RAG 是什么？",
  mockRagAnswer: "回答前先检索资料，再基于这些内容生成答案。",
  mockLocalDemo: "↳ 本地演示",
  mockEmbeddingAnswer: "把文本映射成语义坐标。",
  mockVectorAnswer: "快速找到语义相近的内容。",
  mockSynthesisQuestion: "两者如何配合？",
  mockSynthesisAnswer: "把分支重新组合成完整机制。",
  edgeFollowUp: "继续追问",
  edgeReference: "跨分支引用",
  mockComposer: "从当前节点继续追问，或引用另一个分支…",
  corePrinciples: "核心原则",
  principleBranch: "分叉",
  principleBranchDetail: "不打断原来的学习主线",
  principleExplore: "深入",
  principleExploreDetail: "把一个陌生概念问清楚",
  principleReference: "引用",
  principleReferenceDetail: "连接不同分支里的理解",
  principleSynthesize: "汇聚",
  principleSynthesizeDetail: "形成新的完整知识结构",
  workflowTitleOne: "聊天会结束，",
  workflowTitleTwo: "理解应该继续生长。",
  workflowLead: "Graph Chat 保存的不只是消息，而是问题之间真正有用的关系。",
  workflowBranchTitle: "从任意位置分叉",
  workflowBranchBody: "选中一句话，或从当前节点继续提问。新的探索拥有自己的上下文，不会把主线冲散。",
  workflowReferenceTitle: "引用另一个分支",
  workflowReferenceBody: "把两个或更多节点加入联合提问。虚线边精确记录这次综合使用了哪些理解。",
  workflowMergeTitle: "把答案带回主线",
  workflowMergeBody: "Pi agent 根据显式上下文运行模型与图谱工具，让新的理解可追溯、可继续、可复用。",
  featuresTitle: "一张图，承载整个理解过程。",
  featuresLead: "从第一次“不懂”到能够综合多个概念，所有路径都留在你自己的电脑上。",
  graphFeatureTitleOne: "关系不是装饰，",
  graphFeatureTitleTwo: "而是模型上下文。",
  graphFeatureBody: "主线、跨分支引用和选中文字被分别编译，模型只接收本次问题真正需要的部分。",
  contextMain: "主线",
  contextFull: "完整",
  contextReference: "引用",
  contextVectorDb: "向量数据库",
  contextSummary: "摘要",
  contextSelection: "选中文字",
  contextCoordinates: "“语义坐标”",
  contextExact: "精确",
  piFeatureTitle: "不是一次 API 调用。",
  piFeatureBody: "流式回答、图谱搜索、节点读取、工具循环、重试和取消，都由 Pi agent harness 管理。",
  terminalSearch: 'graph_search("向量")',
  terminalNodes: "已加入 2 个节点",
  authFeatureTitle: "用 ChatGPT 账户登录。",
  authFeatureBody: "Pi 内置 OpenAI Codex 设备码 OAuth。无需复制 API Key，token 自动刷新。",
  privacyFeatureTitle: "你的知识图，属于你。",
  privacyFeatureBody: "SQLite 数据库与 OAuth 凭据均保存在本机。无遥测、无账号系统、无必需云服务。",
  privacyListen: "默认只监听 127.0.0.1",
  privacyKeys: "API Key 不写入磁盘",
  privacyExport: "JSON 导出不包含凭据",
  architectureTitleOne: "本地应用的简单，",
  architectureTitleTwo: "Agent 系统的能力。",
  architectureLead: "没有微服务拼图。一个 Bun 或 Node 进程服务前端、图谱 API、SQLite 与 Pi runtime。",
  modelsChoice: "自由选择",
  ctaTitleOne: "下一次遇到“不懂”，",
  ctaTitleTwo: "让它长成一个新分支。",
  ctaLead: "克隆仓库，运行两条命令。无需账户，无需外部数据库，无需 API Key。",
  copy: "复制",
  copied: "已复制",
  copyClone: "复制克隆命令",
  copyRun: "复制运行命令",
  viewSource: "在 GitHub 查看源码",
  footerText: "为好奇心而构建。基于 MIT License 开源。",
};

const spanish = {
  language: "Idioma",
  skipLink: "Saltar al contenido principal",
  brandSubtitle: "ESPACIO DE APRENDIZAJE",
  navWorkflow: "Cómo funciona",
  navFeatures: "Funciones",
  navArchitecture: "Arquitectura",
  heroTitleOne: "Aprende en ramas.",
  heroTitleTwo: "Recuerda en gráficos.",
  heroLead: "Convierte conversaciones de IA en un gráfico de conocimiento que puede ramificarse, conectarse y seguir creciendo.",
  heroPrimary: "Empezar en local",
  heroSecondary: "Ver cómo funciona",
  featuresTitle: "Un gráfico para todo el camino hacia la comprensión.",
  modelsChoice: "Tu elección",
  viewSource: "Ver código en GitHub",
};

const french = {
  language: "Langue",
  skipLink: "Aller au contenu principal",
  brandSubtitle: "ESPACE D’APPRENTISSAGE",
  navWorkflow: "Fonctionnement",
  navFeatures: "Fonctionnalités",
  navArchitecture: "Architecture",
  heroTitleOne: "Apprenez par branches.",
  heroTitleTwo: "Retenez par graphes.",
  heroLead: "Transformez les conversations IA en un graphe de connaissances qui se ramifie, relie les idées et continue de grandir.",
  heroPrimary: "Démarrer en local",
  heroSecondary: "Voir le fonctionnement",
  featuresTitle: "Un seul graphe pour tout le chemin vers la compréhension.",
  modelsChoice: "Votre choix",
  viewSource: "Voir le code sur GitHub",
};

const german = {
  language: "Sprache",
  skipLink: "Zum Hauptinhalt springen",
  brandSubtitle: "LERNARBEITSBEREICH",
  navWorkflow: "So funktioniert es",
  navFeatures: "Funktionen",
  navArchitecture: "Architektur",
  heroTitleOne: "In Zweigen lernen.",
  heroTitleTwo: "In Graphen erinnern.",
  heroLead: "Verwandle KI-Gespräche in einen Wissensgraphen, der sich verzweigt, Ideen verbindet und weiter wächst.",
  heroPrimary: "Lokal starten",
  heroSecondary: "Funktionsweise ansehen",
  featuresTitle: "Ein Graph für den gesamten Weg zum Verständnis.",
  modelsChoice: "Deine Wahl",
  viewSource: "Quellcode auf GitHub",
};

const japanese = {
  language: "言語",
  skipLink: "メインコンテンツへ移動",
  brandSubtitle: "学習ワークスペース",
  navWorkflow: "使い方",
  navFeatures: "機能",
  navArchitecture: "アーキテクチャ",
  heroTitleOne: "分岐で学ぶ。",
  heroTitleTwo: "グラフで記憶する。",
  heroLead: "AI との会話を、分岐し、アイデアを結び、成長し続けるナレッジグラフに変えます。",
  heroPrimary: "ローカルで始める",
  heroSecondary: "使い方を見る",
  featuresTitle: "理解への道のり全体を、一つのグラフに。",
  modelsChoice: "自由に選択",
  viewSource: "GitHub でソースを見る",
};

const korean = {
  language: "언어",
  skipLink: "본문으로 건너뛰기",
  brandSubtitle: "학습 워크스페이스",
  navWorkflow: "작동 방식",
  navFeatures: "기능",
  navArchitecture: "아키텍처",
  heroTitleOne: "브랜치로 배우세요.",
  heroTitleTwo: "그래프로 기억하세요.",
  heroLead: "AI 대화를 브랜치하고 아이디어를 연결하며 계속 성장하는 지식 그래프로 바꾸세요.",
  heroPrimary: "로컬에서 시작",
  heroSecondary: "작동 방식 보기",
  featuresTitle: "이해에 이르는 모든 과정을 위한 하나의 그래프.",
  modelsChoice: "자유롭게 선택",
  viewSource: "GitHub에서 소스 보기",
};

const traditionalChinese = {
  ...chinese,
  language: "語言",
  skipLink: "跳至主要內容",
  brandSubtitle: "學習工作空間",
  navWorkflow: "運作方式",
  navFeatures: "功能",
  navArchitecture: "架構",
  heroTitleOne: "在分支中學習。",
  heroTitleTwo: "在圖譜中記憶。",
  heroLead: "把 AI 對話變成能夠分支、連結想法並持續成長的知識圖譜。",
  heroPrimary: "在本機開始",
  heroSecondary: "查看運作方式",
  featuresTitle: "用一張圖譜保留完整的理解路徑。",
  modelsChoice: "自由選擇",
  viewSource: "在 GitHub 查看原始碼",
};

const dictionaries = {
  zh: chinese,
  es: spanish,
  fr: french,
  de: german,
  ja: japanese,
  ko: korean,
  "zh-TW": traditionalChinese,
};
const supportedLanguages = ["en", "zh", "es", "fr", "de", "ja", "ko", "zh-TW"];
const htmlLanguages = {
  en: "en",
  zh: "zh-CN",
  es: "es",
  fr: "fr",
  de: "de",
  ja: "ja",
  ko: "ko",
  "zh-TW": "zh-TW",
};

const textNodes = [...document.querySelectorAll("[data-i18n]")];
const contentNodes = [...document.querySelectorAll("[data-i18n-content]")];
const ariaNodes = [...document.querySelectorAll("[data-i18n-aria]")];
const hrefNodes = [...document.querySelectorAll("[data-i18n-href]")];

const english = {
  text: new Map(textNodes.map((node) => [node, node.textContent])),
  content: new Map(contentNodes.map((node) => [node, node.getAttribute("content")])),
  aria: new Map(ariaNodes.map((node) => [node, node.getAttribute("aria-label")])),
  href: new Map(hrefNodes.map((node) => [node, node.getAttribute("href")])),
};

let currentLanguage = "en";

function translated(key, fallback, language = currentLanguage) {
  return dictionaries[language]?.[key] ?? fallback;
}

function applyLanguage(language) {
  currentLanguage = supportedLanguages.includes(language) ? language : "en";
  document.documentElement.lang = htmlLanguages[currentLanguage];
  document.documentElement.dataset.currentLanguage = currentLanguage;

  for (const node of textNodes) {
    node.textContent = translated(node.dataset.i18n, english.text.get(node), currentLanguage);
  }
  for (const node of contentNodes) {
    node.setAttribute(
      "content",
      translated(node.dataset.i18nContent, english.content.get(node), currentLanguage),
    );
  }
  for (const node of ariaNodes) {
    node.setAttribute(
      "aria-label",
      translated(node.dataset.i18nAria, english.aria.get(node), currentLanguage),
    );
  }
  for (const node of hrefNodes) {
    node.setAttribute(
      "href",
      translated(node.dataset.i18nHref, english.href.get(node), currentLanguage),
    );
  }

  for (const button of document.querySelectorAll("button[data-language]")) {
    const active = button.dataset.language === currentLanguage;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  const select = document.querySelector("[data-language-select]");
  if (select) select.value = currentLanguage;
}

function savedLanguage() {
  try {
    return window.localStorage.getItem("graphchat-language");
  } catch {
    return null;
  }
}

const requestedLanguage = new URL(window.location.href).searchParams.get("lang");
applyLanguage(supportedLanguages.includes(requestedLanguage) ? requestedLanguage : savedLanguage());

document.querySelector("[data-language-select]")?.addEventListener("change", (event) => {
  const language = supportedLanguages.includes(event.target.value) ? event.target.value : "en";
  applyLanguage(language);
  try {
    window.localStorage.setItem("graphchat-language", language);
  } catch {
    // Language switching still works when storage is unavailable.
  }
  const url = new URL(window.location.href);
  if (language === "en") url.searchParams.delete("lang");
  else url.searchParams.set("lang", language);
  window.history.replaceState(null, "", url);
});

for (const button of document.querySelectorAll("button[data-language]")) {
  button.addEventListener("click", () => {
    const language = button.dataset.language === "zh" ? "zh" : "en";
    applyLanguage(language);

    try {
      window.localStorage.setItem("graphchat-language", language);
    } catch {
      // Language switching still works when storage is unavailable.
    }

    const url = new URL(window.location.href);
    if (language === "zh") url.searchParams.set("lang", "zh");
    else url.searchParams.delete("lang");
    window.history.replaceState(null, "", url);
  });
}

const revealElements = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    },
    { threshold: 0.12 },
  );
  revealElements.forEach((element) => revealObserver.observe(element));
} else {
  revealElements.forEach((element) => element.classList.add("is-visible"));
}

for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = translated(
        button.dataset.copiedLabel,
        button.dataset.copiedLabel === "copied" ? "Copied" : "",
      );
      button.classList.add("copied");
      window.setTimeout(() => {
        button.textContent = translated(
          button.dataset.copyLabel,
          button.dataset.copyLabel === "copy" ? "Copy" : "",
        );
        button.classList.remove("copied");
      }, 1400);
    } catch {
      // Clipboard permissions vary by browser; leave the command visible for manual copying.
    }
  });
}

window.addEventListener(
  "scroll",
  () => document.querySelector(".site-header").classList.toggle("scrolled", window.scrollY > 12),
  { passive: true },
);
