# PaperCrew 架构设计

> 多智能体论文拆解与科研推演沙盘
> 文档状态：v1 草案（待确认）
> 更新日期：2026-11-18

---

## 0. 当前目录状态

`D:\PaperCrew` 为**空目录**，非 Git 仓库，无任何历史文件。

这意味着：

- 无历史包袱，可从零按本设计落地；
- 需要自行初始化 Git 与工程脚手架；
- 无需考虑旧代码兼容或迁移。

---

## 1. 产品范围

### 1.1 核心链路

用户输入研究课题 → 四个 Agent 依次执行：

```
Planner（拆解研究问题）
   ↓
Researcher（检索/整理相关文献与证据）
   ↓
Reviewer（实验设计缺陷与严谨性评审）
   ↓
Synthesizer（输出最终科研报告）
```

### 1.2 两种运行模式

| 模式 | 数据来源 | 是否需要 API Key | 用途 |
|---|---|---|---|
| DEMO（默认） | 本地 JSON 固定用例 | 否 | 零配置体验、产品演示、UI 开发 |
| LIVE | OpenAI 兼容 API（浏览器直连） | 是 | 真实模型科研推演 |

**硬性约束：两种模式必须产出完全相同的数据结构，UI 不感知模式差异。**

模式差异只允许存在于一个位置：`AgentRunner` 实现层（见 §8）。

### 1.3 非目标（v1 明确不做）

- 不接真实文献数据库（Semantic Scholar / arXiv / PubMed 等）
- 不做 PDF 上传与解析、不做向量库 / RAG
- 不做账号体系、多人协作、后端服务、数据库
- 不做流式 token 渲染（预留事件字段，v1 不实现）
- 不做多语言 UI、不做路由（单页三栏工作台）
- 不做自动化评测 / 回归测试平台

> 以上每一项都会显著增加复杂度，且不属于"科研推演沙盘"的最小闭环。

---

## 2. 技术架构总览

### 2.1 分层

```
┌─────────────────────────────────────────────────────────┐
│  app / features（UI 层）                                  │
│  React 组件、Framer Motion 动效、表单、可视化              │
│  只读 store、只发意图（start / cancel / retry / switch）    │
└──────────────────────────┬──────────────────────────────┘
                           │ 事件（PipelineEvent）/ 动作
┌──────────────────────────▼──────────────────────────────┐
│  store（状态层，Zustand）                                 │
│  sessionStore：持久化会话与产物                            │
│  settingsStore：模式 / Provider 配置（含密钥）              │
│  纯 reducer 接收事件，不写业务判断                          │
└──────────────────────────┬──────────────────────────────┘
                           │ 调用
┌──────────────────────────▼──────────────────────────────┐
│  domain（业务核心，纯 TS + Zod，零 React 依赖）            │
│  Agent 定义与 Schema、Session 模型、Orchestrator、Reducer  │
└──────────────────────────┬──────────────────────────────┘
                           │ 端口（AgentRunner 接口）
┌──────────────────────────▼──────────────────────────────┐
│  services（适配层）                                       │
│  DemoRunner（本地 JSON） │ LiveRunner（fetch + SSE 可选）  │
│  storage（localStorage 适配）│ llm（OpenAI 兼容客户端）    │
└─────────────────────────────────────────────────────────┘
```

### 2.2 关键架构决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 业务核心位置 | 纯 TS `domain/`，不 import React / store | 可单测、可脱离 UI 推演、Orchestrator 可替换 |
| 前后端 | 无后端，浏览器直连 LLM | 部署要求；密钥仅存本地 |
| 模式统一 | 端口 `AgentRunner` + 统一 Schema | DEMO / LIVE 同构，UI 与流程零分支 |
| Agent 顺序来源 | 注册表 `AGENT_REGISTRY` 单一事实源 | 避免顺序散落在 UI 与 Orchestrator |
| 流程形态 | 异步生成器产出事件流 | 天然支持进度、取消、重试、持久化分离 |
| 状态持久化 | 仅持久化 Session + Settings | 运行态（AbortController 等）不入 store |
| 输出解析 | LLM 返回 JSON + Zod 校验 + 一次修复 | 静态部署无服务端兜底，必须自校验 |
| 路由 | v1 不引入 | 静态托管 subset fallback 风险，工作台单页足够 |

---

## 3. 目录结构

```
PaperCrew/
├─ ARCHITECTURE.md
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ public/
└─ src/
   ├─ main.tsx                  # 入口：挂载 <App/>
   ├─ App.tsx                   # 顶层布局组合，无业务逻辑
   ├─ styles/
   │  ├─ index.css              # Tailwind 入口 + 设计令牌（CSS 变量）
   │  └─ katex.css              # KaTeX 样式（仅报告视图引入）
   │
   ├─ domain/                   # ★ 业务核心：纯 TS + Zod
   │  ├─ brief.ts               # ResearchBrief schema
   │  ├─ agent/
   │  │  ├─ ids.ts              # AgentId 枚举与顺序常量
   │  │  ├─ types.ts            # PipelineContext、AgentRun、AgentDefinition、AgentError
   │  │  ├─ registry.ts         # 四 Agent 注册表（顺序、元信息、promptVersion）
   │  │  ├─ planner.ts          # PlannerOutput schema + 提示词构建
   │  │  ├─ researcher.ts       # ResearcherOutput schema + 提示词构建
   │  │  ├─ reviewer.ts         # ReviewerOutput schema + 提示词构建
   │  │  ├─ synthesizer.ts      # SynthesizerOutput schema + 提示词构建
   │  │  └─ prompts/
   │  │     ├─ planner.zh.md    # 系统提示词（纯文本，非业务代码）
   │  │     ├─ researcher.zh.md
   │  │     ├─ reviewer.zh.md
   │  │     └─ synthesizer.zh.md
   │  ├─ session/
   │  │  ├─ types.ts            # Session schema、SessionStatus
   │  │  └─ factory.ts          # createSession / 空 runs 构造
   │  └─ pipeline/
   │     ├─ orchestrator.ts     # run(): AsyncGenerator<PipelineEvent>
   │     ├─ events.ts           # PipelineEvent 联合类型 + schema
   │     └─ reducer.ts          # applyPipelineEvent(session, event) -> Session（纯函数）
   │
   ├─ services/                 # ★ 适配层：可替换、无 UI 依赖
   │  ├─ runner/
   │  │  ├─ types.ts            # AgentRunner 接口（端口）
   │  │  ├─ demo.ts             # DemoAgentRunner
   │  │  ├─ live.ts             # LiveAgentRunner
   │  │  └─ index.ts            # createRunner(settings)
   │  ├─ llm/
   │  │  ├─ client.ts           # OpenAI 兼容 fetch 封装、超时、重试
   │  │  ├─ parse.ts            # extractJson / 代码块剥离 / 一次修复
   │  │  └─ errors.ts           # HTTP / 网络 / 校验错误归一化
   │  └─ storage/
   │     ├─ local.ts            # 会话持久化适配（配额保护）
   │     └─ secret.ts           # 密钥存储策略（local vs session）
   │
   ├─ store/                    # ★ 状态层
   │  ├─ sessionStore.ts        # 会话列表、activeId、dispatch(event)
   │  ├─ settingsStore.ts       # mode、provider、temperature、密钥
   │  └─ runController.ts       # 模块级 AbortController（非响应式）
   │
   ├─ features/                 # ★ 功能 UI（只依赖 store + domain 类型 + ui）
   │  ├─ brief/
   │  │  ├─ BriefForm.tsx
   │  │  └─ ModeSwitch.tsx
   │  ├─ pipeline/
   │  │  ├─ PipelineBoard.tsx   # 时间线容器（订阅 session.runs）
   │  │  └─ AgentStageCard.tsx  # 单阶段：状态、耗时、摘要、错误
   │  ├─ artifacts/
   │  │  ├─ ArtifactTabs.tsx
   │  │  ├─ PlannerView.tsx
   │  │  ├─ ResearcherView.tsx  # 文献卡片 + 证据矩阵
   │  │  ├─ ReviewerView.tsx    # 评分雷达/条形 + 缺陷列表
   │  │  ├─ ReportView.tsx      # React Markdown + KaTeX
   │  │  └─ pieces/             # PaperCard、EvidenceTable、ScoreBar、FlawItem...
   │  ├─ sessions/
   │  │  └─ SessionMenu.tsx     # 新建 / 切换 / 删除（v1 轻量）
   │  └─ settings/
   │     └─ SettingsDialog.tsx  # Provider 配置 + 连接自检
   │
   ├─ components/ui/            # ★ 无业务含义的通用原语
   │  ├─ Button.tsx  Card.tsx  Badge.tsx  Tabs.tsx
   │  ├─ Dialog.tsx  Textarea.tsx  Skeleton.tsx  Toast.tsx
   │
   ├─ data/demo/                # ★ DEMO 数据（构建期打包）
   │  ├─ cases/
   │  │  ├─ multi-agent-paper-review.json
   │  │  ├─ low-resource-rag.json
   │  │  └─ generic-fallback.json
   │  └─ index.ts               # import.meta.glob 汇总 + 启动时 Zod 校验
   │
   └─ lib/
      ├─ id.ts                  # crypto.randomUUID
      ├─ time.ts                # 时间戳 / 耗时格式化
      └─ markdown.ts            # markdown 插件配置（gfm + math）
```

**目录约 40 个文件**，不含组件内部碎片。刻意不引入 `pages/`、`hooks/`、`api/` 等与现有规模不匹配的层级。

---

## 4. 模块职责与依赖规则

### 4.1 职责表

| 模块 | 职责 | 明确不做 |
|---|---|---|
| `domain/agent` | Agent Schema、提示词、顺序注册 | 不发起网络请求、不读写存储 |
| `domain/session` | Session 数据模型与工厂 | 不含流程推进逻辑 |
| `domain/pipeline` | 执行顺序、事件产出、状态归约 | 不感知 React、Zustand、fetch |
| `services/runner` | 将"调一次 Agent"落到 DEMO / LIVE | 不修改 Session |
| `services/llm` | 请求、超时、重试、JSON 提取与修复 | 不含科研业务提示词 |
| `store` | 会话与设置的唯一可变入口 | 不直接 fetch / 不拼提示词 |
| `features/*` | 展示与用户意图 | 不写流程控制、不拼消息 |
| `components/ui` | 纯展示原语 | 不读 store |

### 4.2 依赖矩阵（→ 表示允许依赖）

| 层 | → domain | → services | → store | → features | → ui |
|---|---|---|---|---|---|
| domain | — | ✗ | ✗ | ✗ | ✗ |
| services | ✓ | — | ✗ | ✗ | ✗ |
| store | ✓ | ✓（仅端口类型与适配） | — | ✗ | ✗ |
| features | ✓（仅类型） | ✗ | ✓ | 同层禁止互相引用 | ✓ |
| components/ui | ✗ | ✗ | ✗ | ✗ | — |

约束要点：

1. `domain/` 只允许依赖 `zod`。
2. `features/` 之间不互相 import，共用片段下沉到 `features/artifacts/pieces` 或 `components/ui`；跨功能组合只在 `App.tsx`。
3. 任何组件不得出现 `fetch`、`localStorage`、提示词字符串。
4. 违反依赖规则视为 Code Review 阻断项（v1 用约定约束，不引入 lint 边界插件）。

---

## 5. 核心数据契约

所有 Schema 定义在 `domain/`，**DEMO JSON 与 LIVE 输出共用同一套 Schema**。流经 UI 的数据永远只有"已通过 Zod 校验"的对象。

### 5.1 基础类型

```ts
export const AGENT_IDS = ['planner', 'researcher', 'reviewer', 'synthesizer'] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export type AgentStatus = 'pending' | 'running' | 'done' | 'error';

export type RunMode = 'demo' | 'live';

export const researchBriefSchema = z.object({
  topic: z.string().min(4).max(500),          // 研究课题
  field: z.string().max(80).optional(),       // 学科领域（可选）
  constraints: z.string().max(800).optional(),// 约束：实验条件、数据、时间
  outputLanguage: z.enum(['zh', 'en']).default('zh'),
});
export type ResearchBrief = z.infer<typeof researchBriefSchema>;
```

### 5.2 四个 Agent 的输出结构

**PlannerOutput**（研究问题拆解）

```ts
{
  researchQuestion: string;                 // 凝练后的核心研究问题
  subQuestions: Array<{
    id: string;                             // q1, q2...
    question: string;
    rationale: string;
  }>;
  hypotheses: string[];                     // 待验证假设
  searchQueries: string[];                  // 供 Researcher 使用的检索式
  methodOutline: string[];                  // 初步方法路线
  risks: string[];                          // 课题风险
}
```

**ResearcherOutput**（文献与证据）

```ts
{
  papers: Array<{
    id: string;                             // p1, p2...（全局稳定，供引用）
    title: string;
    authors: string[];
    year: number;                           // 1900–2030
    venue?: string;
    summary: string;                        // 1–3 句
    relevance: 'high' | 'medium' | 'low';
    keyFindings: string[];
    limitations: string[];
  }>;
  evidenceMap: Array<{
    claim: string;                          // 结论 / 论点
    supportPaperIds: string[];              // 引用 papers[].id
    stance: 'support' | 'contradict' | 'mixed';
  }>;
  gaps: string[];                           // 研究空白
  synthesisNotes: string;                   // 文献综述要点
}
```

**ReviewerOutput**（缺陷与评审）

```ts
{
  scores: {
    novelty: number;        // 0–10 整数
    feasibility: number;
    rigor: number;
    clarity: number;
  };
  verdict: 'pass' | 'revise' | 'reject';
  flaws: Array<{
    id: string;             // f1, f2...
    target: 'research_question' | 'method' | 'evidence' | 'analysis';
    severity: 'blocker' | 'major' | 'minor';
    description: string;
    suggestion: string;
  }>;
  missingEvidence: string[];
  methodologicalRisks: string[];
  summary: string;
}
```

**SynthesizerOutput**（最终报告）

```ts
{
  title: string;
  abstract: string;
  sections: Array<{          // 正文按章节拆开，便于 UI 分块可折叠
    id: string;              // s1, s2...
    heading: string;
    markdown: string;        // 可包含表格、$公式$
  }>;
  conclusions: string[];
  limitations: string[];
  nextSteps: string[];
  references: Array<{        // 由 papers + 评审补充来源汇总
    id: string;
    title: string;
    authors: string[];
    year: number;
    venue?: string;
  }>;
}
```

> 设计原则：**正文用 Markdown 字符串，结构用字段**。不把整个报告塞进一个大 Markdown 字符串，避免 UI 无法定位章节；也不把每段都结构化到句子级，避免过度设计。

### 5.3 统一运行信封 AgentRun

四种输出共用一个信封，UI 渲染阶段状态时无需关心具体 Agent：

```ts
export type AgentErrorCode =
  | 'auth' | 'rate_limit' | 'network' | 'timeout'
  | 'bad_response' | 'schema_invalid' | 'aborted'
  | 'interrupted' | 'config' | 'unknown';

export interface AgentRun<TOutput> {
  agent: AgentId;
  status: AgentStatus;
  output: TOutput | null;
  error: { code: AgentErrorCode; message: string; retryable: boolean } | null;
  meta: {
    mode: RunMode;
    model: string | null;       // DEMO 为 'demo-fixture'
    promptVersion: string;      // 追踪提示词迭代
    startedAt: string;          // ISO
    finishedAt: string | null;
    durationMs: number | null;
  };
}

export interface PipelineRuns {
  planner: AgentRun<PlannerOutput>;
  researcher: AgentRun<ResearcherOutput>;
  reviewer: AgentRun<ReviewerOutput>;
  synthesizer: AgentRun<SynthesizerOutput>;
}
```

使用具名字段而非 `Record<AgentId, AgentRun<unknown>>`，换取四个视图的完整类型安全；泛型信封保证 DEMO/LIVE 同构。

### 5.4 Session

```ts
export type SessionStatus =
  | 'draft'        // 尚未运行
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Session {
  id: string;                     // crypto.randomUUID
  schemaVersion: 1;               // 持久化迁移锚点
  title: string;                  // 默认取 brief.topic 前 40 字
  brief: ResearchBrief;
  mode: RunMode;                  // 快照：运行开始时锁定
  status: SessionStatus;
  runs: PipelineRuns;             // 始终存在，初始为四个 pending
  runId: string | null;           // 最近一次运行标识
  demoCaseId: string | null;      // DEMO 命中用例（便于调试与埋点）
  createdAt: string;
  updatedAt: string;
}
```

### 5.5 流水线事件

```ts
export type PipelineEvent =
  | { type: 'run/start';    runId: string; at: string; mode: RunMode }
  | { type: 'agent/start';  runId: string; at: string; agent: AgentId; model: string | null }
  | { type: 'agent/done';   runId: string; at: string; agent: AgentId; run: AgentRun<unknown> }
  | { type: 'agent/error';  runId: string; at: string; agent: AgentId; error: AgentError }
  | { type: 'run/end';      runId: string; at: string; status: 'completed' | 'failed' | 'cancelled' };
```

事件是 UI 与业务核心之间**唯一**的通信协议。`applyPipelineEvent` 是纯函数，便于脱离浏览器测试。

---

## 6. Session 与 Orchestrator 的关系

### 6.1 职责边界

| | Session | Orchestrator |
|---|---|---|
| 本质 | 持久化数据快照 | 一次性执行过程 |
| 生命周期 | 跨刷新、跨运行 | 单次 `run()` 调用 |
| 可变性 | 只通过 reducer 变更 | 无内部可变状态 |
| 知道什么 | 课题、四阶段产物、状态、错误 | Agent 顺序、Runner、输入的前序产物 |
| 不知道什么 | 如何调用模型、如何重试 | Zustand、React、存储 |

一句话：**Session 记录"发生了什么"，Orchestrator 决定"下一步做什么"。**

### 6.2 时序

```
BriefForm            sessionStore          Orchestrator           AgentRunner
    │ start(brief)         │                      │                     │
    ├────────────────────►│ createRun + snapshot │                     │
    │                     ├─────────────────────►│ run(ctx, signal)    │
    │                     │                      ├─ planner ──────────►│
    │                     │◄── agent/start ──────┤                     │
    │                     │  (reducer: running)  │◄── output + meta ───┤
    │                     │◄── agent/done ───────┤                     │
    │                     │  (reducer: done)     ├─ researcher ───────►│  ...
    │                     │                      │  (前序产物作为输入)    │
    │                     │◄── run/end ──────────┤                     │
    │  (渲染随时间线推进)   │  persist(session)    │                     │
```

### 6.3 执行契约

```ts
interface OrchestratorDeps {
  runner: AgentRunner;
  agents?: AgentDefinition<unknown>[];   // 默认 AGENT_REGISTRY
}

function createOrchestrator({ runner }: OrchestratorDeps) {
  return {
    run(
      brief: ResearchBrief,
      ctx: { runId: string; signal: AbortSignal },
    ): AsyncGenerator<PipelineEvent, void, void>;
  };
}
```

- 顺序完全由 `AGENT_REGISTRY` 决定，Orchestrator 不硬编码 `planner → researcher → ...`。
- 每个阶段输入为 `PipelineContext = { brief, planner?, researcher?, reviewer? }`，由注册表的 `buildMessages` 消费。
- 单个阶段失败（重试用尽）：产出 `agent/error` + `run/end(failed)`，**保留已完成的产物**，UI 可查看部分结果并重新运行。
- `AbortSignal` 贯穿到 fetch；取消 → 当前阶段标记 `error(aborted)`，run 结束为 `cancelled`。
- v1 重跑策略：**全流程重跑**（覆盖本 Session 的 runs）。断点续跑（从失败阶段开始）列入 P2。

### 6.4 状态机

```
draft ──start──► running ──run/end(completed)──► completed
                    │
                    ├──run/end(failed)──────► failed
                    └──run/end(cancelled)───► cancelled
completed/failed/cancelled ──start（重跑）──► running
```

不变量：

1. 同一 Session 同时最多一个 `runId`（由 `runController` 模块级锁保证，非 store 状态）。
2. Orchestrator 执行期间收到的 `settings` 变更不影响当前 run（run 开始时快照 `mode` 与配置）。
3. 刷新页面导致 in-flight run 丢失：启动时将所有 `running` 会话归约为 `failed`，`error.code = 'interrupted'`，提示重跑。
4. 只有 `reducer` 能修改 Session；Runner 与 Orchestrator 只读。

---

## 7. DEMO / LIVE 的统一

### 7.1 端口定义

```ts
interface AgentRunner {
  readonly mode: RunMode;
  run<T>(args: {
    agent: AgentDefinition<unknown, T>;
    ctx: PipelineContext;
    signal: AbortSignal;
  }): Promise<{ output: T; meta: Pick<AgentRun<T>['meta'], 'model' | 'startedAt' | 'finishedAt' | 'durationMs'> }>;
}
```

### 7.2 DemoAgentRunner

- 启动时用各 Agent 的 Zod Schema 校验全部用例；开发环境校验失败直接抛错，生产环境降级到 `generic-fallback`。
- 用例匹配：对 `brief.topic + field` 做关键词打分，命中最高分用例；低于阈值用 fallback。
- 模拟节奏：每阶段 500–900ms，让时间线可见（可由 Framer Motion 呈现）。
- 输出仍走统一 Schema 解析（即使数据是可信的），保证 UI 路径一致。
- `meta.model = 'demo-fixture'`，UI 显示"示例数据"徽标。

### 7.3 LiveAgentRunner

- 请求：`POST {baseUrl}/chat/completions`，`Authorization: Bearer <key>`，`messages` 由 Agent 定义构建。
- 结构化输出：优先 `response_format: { type: 'json_object' }`；不支持时依赖提示词约束 + 解析兜底。
- 解析管线：`extractJson`（剥离 ```json 围栏、截取首尾花括号）→ `JSON.parse` → `schema.safeParse`。
- 校验失败：携带 Zod `issues` 追加一次修复请求（最多 1 次），仍失败则 `schema_invalid`。
- 重试：`429 / 5xx / 网络错误` 指数退避 2 次；`401/403` 直接 `auth` 不重试；超时 90s。
- 取消：`AbortSignal` 合并超时信号，取消后不再重试。

### 7.4 能力差异（必须由 UI 明示）

| 能力 | DEMO | LIVE |
|---|---|---|
| 内容真实性 | 人工编写示例 | 模型生成，可能有幻觉 |
| 引用可核验性 | 示例文献（标注） | 不可信，需人工核验 |
| 网络 | 不需要 | 需要，受 CORS 影响 |
| 耗时 | 约 3–5s | 30–120s（4 次串行调用） |
| 成本 | 0 | 消耗用户 token |

---

## 8. 状态管理

只保留两个持久化 store，避免碎片化：

**settingsStore（persist）**
```ts
{
  mode: 'demo' | 'live';
  provider: { baseUrl: string; model: string; temperature: number };
  apiKey: string;               // 存储策略见 §10
  rememberKey: boolean;         // false → sessionStorage
  hydrated: boolean;            // 规避 SSR/首帧闪烁（纯 CSR 下仍用于开关弹窗）
}
```

**sessionStore（persist，部分字段）**
```ts
{
  sessions: Record<string, Session>;
  activeSessionId: string | null;
  // actions
  createSession(brief, mode): string;
  dispatch(event: PipelineEvent): void;   // 内部调用纯 reducer
  deleteSession(id): void;
  setActive(id): void;
}
```

持久化策略：

- key：`papercrew:sessions:v1`、`papercrew:settings:v1`。
- 只持久化 `schemaVersion` 匹配的数据；不匹配时丢弃并提示（v1 不做迁移逻辑）。
- 会话上限 20 条，超出淘汰最旧；持久化前剥离 `meta` 中的冗余字段。
- 使用 Zustand `persist` + 自定义 `storage`（捕获 `QuotaExceededError`，触发 UI 提示并降级为仅内存）。

`runController.ts` 持有 `AbortController` 与当前 `runId`，**故意不放进 store**：不可序列化，且不参与渲染。

---

## 9. UI 结构与状态呈现

### 9.1 布局（桌面三栏）

```
┌──────────────────────────────────────────────────────────────┐
│ Topbar  PaperCrew · 会话标题 · [DEMO|LIVE] · 会话菜单 · 设置    │
├───────────────┬──────────────────────┬───────────────────────┤
│ BriefPanel    │ PipelineBoard        │ ArtifactPanel         │
│ 课题 / 领域   │ ① Planner  ✓ 2.3s    │ [规划][文献][评审][报告]│
│ 约束          │ ② Researcher ● ...   │                       │
│ [开始推演]    │ ③ Reviewer  ○        │ 对应产物渲染           │
│ [取消]        │ ④ Synthesizer ○      │                       │
└───────────────┴──────────────────────┴───────────────────────┘
```

- `< 1024px`：纵向堆叠，Pipeline 变为顶部横向步骤条，产物通过 Tabs 切换。
- 报告视图：`react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex`，不启用 `rehype-raw`；`throwOnError: false`；外链 `rel="noreferrer"`。
- 动效：阶段卡片状态切换用 `layout` + `AnimatePresence`；产物切换用淡入位移；**禁止**为每个元素加动效。
- 空态 / 运行中 / 失败 / 中断均有明确文案；失败卡片展示错误码、可读原因与"重新推演"。
- 成功产物页固定展示来源徽标：`示例数据` 或 `模型生成 · 请核验引用`。

### 9.2 组件通信

- 组件只从 store 选择所需切片（selector 粒度到 `runs.planner` 等），避免全量重渲染。
- 用户动作：`startRun()`（`features/brief` 内本地 hook 调用 `app` 层编排）→ 创建 runner → 消费事件 → `dispatch`。
- `App.tsx` 是唯一装配点：注入 settings、构造 runner、接线 store 与 UI。

---

## 10. 纯前端静态部署的技术限制与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| **CORS** | 目标 Provider 可能拒绝浏览器直连（预检失败） | 允许自定义 `baseUrl`；设置页提供"连接自检"按钮（发送 1 次最小请求）；错误提示区分"疑似跨域/网络"；文档列出实测可用的 Provider，不写死 |
| **密钥暴露** | 密钥存浏览器可被 XSS / 他人读取 | 默认不记忆（`sessionStorage`），可选记忆并明确警告；密钥仅发往用户配置的 `baseUrl`；展示目标域名确认；不使用任何第三方脚本 |
| **不可撤销密钥** | 无后端可做代理/轮换 | 提示用户使用**限额子密钥**；一键清除 |
| **无服务端兜底** | 模型返回非法 JSON 无法救回 | Zod 校验 + 一次修复 + 明确错误码；失败保留前序产物 |
| **文献真实性** | Researcher/Synthesizer 可能编造文献 | UI 全局标注"AI 生成，请核验"；DEMO 标注示例；不展示伪造的 DOI/URL 为可点击真链 |
| **SPA 路由** | 静态托管深链 404 | v1 不使用路由；未来如需要，用 hash 路由 |
| **子路径部署** | 资源 404 | Vite `base: './'`，相对路径产物 |
| **localStorage 配额** | 约 5MB，多会话易超 | 会话上限 20、剥离冗余字段、捕获配额错误并降级内存模式 |
| **包体** | KaTeX 字体 + Markdown 约 1MB+ | 报告视图动态 `import()` 拆分 chunk；KaTeX CSS 仅报告页加载；Framer Motion 按需导入 |
| **混合内容** | HTTPS 页面调用 HTTP 本地模型（如 Ollama） | 现代浏览器将 `localhost` 视为可信源通常放行；设置页提示若被拦截需改用 HTTPS 或本地代理 |
| **流式能力** | 部分 Provider SSE 或 CORS 受限 | v1 不依赖流式；事件类型预留扩展位 |
| **成本失控** | 4 次串行调用 + 修复重试 | 每阶段 `max_tokens` 上限、单次运行最大 6 次请求、展示阶段耗时；取消按钮全程可用 |
| **刷新丢运行** | 无服务端任务可恢复 | 启动归约 `running → failed(interrupted)`；明确提示重跑（v1 不支持续跑） |
| **无监控** | 线上失败难定位 | 仅本地错误码与时间线；不做遥测（隐私优先） |

---

## 11. 安全与内容边界

- Markdown 不渲染原始 HTML（不启用 `rehype-raw`），链接协议白名单（`http/https`）。
- LLM 输出只作为**数据**渲染，不执行任何工具调用或脚本。
- 提示词模板内不含任何用户密钥；密钥仅存在于请求头。
- 会话可一键清除；设置页提供"清除全部本地数据"。
- 学术诚信提示：产物定位为"研究推演与写作辅助"，不得直接作为论文投稿内容；界面固定免责声明。

---

## 12. 依赖清单

**运行时（均为需求指定 + 必要伴随包）**

| 包 | 用途 | 说明 |
|---|---|---|
| `react` / `react-dom` | UI | React 19 |
| `typescript` | 语言 | 严格模式 |
| `vite` / `@vitejs/plugin-react` | 构建 | 纯静态产物 |
| `tailwindcss` / `@tailwindcss/vite` | 样式 | 推荐 v4（CSS-first，无 config 文件） |
| `zustand` | 状态 | 两个 store |
| `framer-motion` | 动效 | 仅关键转场 |
| `zod` | 数据契约 | domain 唯一校验来源 |
| `react-markdown` | 报告渲染 | 无 raw HTML |
| `remark-gfm` / `remark-math` / `rehype-katex` | Markdown 表格与公式 | KaTeX 的必要伴随包 |
| `katex` | 公式渲染 | 按需加载 |

**明确不引入**：axios（用 `fetch`）、react-router、react-query、任何 UI 组件库、日期库、uuid 库、图标库（内联 SVG）、i18n 库、测试框架（P2 视需要再加 Vitest）。

**开发可选**：`vitest`（P2，用于 reducer / parse / 匹配器单测）。

---

## 13. 开发顺序

每阶段结束都应处于"可运行、可演示"状态。

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| **P0 脚手架** | Vite + React + TS + Tailwind、设计令牌、`base: './'`、三栏静态布局 | `npm run dev` 显示空工作台；`npm run build` 通过 |
| **P1 数据契约** | `domain/` 全部 Schema、Session 工厂、Agent 注册表、提示词初稿 | 四 Agent Schema 可解析合法/非法样本；会话可创建并持久化 |
| **P2 DEMO 闭环** | 3 个 JSON 用例 + DemoRunner + Orchestrator + reducer + sessionStore | 输入任意课题 → 四阶段依次完成 → 刷新后产物仍在；取消可用 |
| **P3 产物视图** | Planner / Researcher / Reviewer / Report 四个视图 + KaTeX | 四类产物完整可读；报告公式与表格正确渲染 |
| **P4 LIVE** | 设置页、LiveRunner、JSON 解析/修复/重试、错误 UX、模式切换守卫 | 配置真实 Provider 可跑通；断网/错密钥/超时有明确提示 |
| **P5 打磨** | 动效、空态、会话菜单、响应式、配额降级、免责声明 | 移动端可用；超配额不崩溃；全流程无控制台报错 |
| **P6 部署** | Qoder Sites 发布、子路径验证、线上冒烟 | 线上 DEMO 全流程通过；LIVE 自检通过（按可用 Provider） |

建议顺序理由：先把 DEMO 做成完整闭环，可在没有密钥、没有网络依赖的情况下验证架构与 UI；LIVE 只是替换 Runner，风险被隔离在 `services/`。

---

## 14. 待确认决策（附建议）

1. **Tailwind 版本**：建议 v4（Vite 插件，零配置）。若团队偏好 v3.4，需额外 `tailwind.config.js` 与 PostCSS 配置。
2. **KaTeX 伴随包**：`remark-gfm / remark-math / rehype-katex` 为渲染表格与公式所必需，建议纳入。
3. **重跑策略**：v1 建议全流程重跑；断点续跑（复用已完成阶段）放 P2。
4. **会话历史 UI**：v1 建议仅"新建 / 切换 / 删除"轻量菜单，不做搜索与分组。
5. **默认输出语言**：建议中文优先，报告语言跟随 `brief.outputLanguage`，不做界面多语言。
6. **Node 工具链**：当前 shell 中未检测到 `node/npm`（可能在 Qoder 内置环境或未加入 PATH），P0 前需确认可用版本（建议 Node ≥ 20）。

---

## 15. 风险总览

| 风险 | 等级 | 缓解 |
|---|---|---|
| Provider CORS 不兼容导致 LIVE 不可用 | 高 | 可自定义 baseUrl + 自检 + 明确错误提示；DEMO 始终可用 |
| 模型输出结构漂移 | 中 | 严格 Zod + 修复重试 + 错误码；Schema 版本化 |
| 引用幻觉损害信任 | 中 | 全局免责声明 + 不生成可验证链接假象 |
| KaTeX 包体拖慢首屏 | 中 | 报告视图懒加载 |
| 4 次串行调用耗时长 | 中 | 阶段级进度、耗时展示、取消、阶段摘要 |
| localStorage 超限 | 低 | 会话上限 + 配额降级 |
| 静态托管子路径 404 | 低 | 相对 base + 无路由 |

---

*本文档仅描述架构，不含业务实现。确认后按 §13 顺序进入 P0。*
