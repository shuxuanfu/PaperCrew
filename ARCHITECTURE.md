# PaperCrew 架构设计

> 多智能体论文拆解与科研推演沙盘：Planner → Researcher → Reviewer → Synthesizer。
>
> 文档状态：v4（阶段 7.1，与当前代码同步）
> 更新日期：2026-11-19
> 代码位置：`D:\PaperCrew`（GitHub：https://github.com/shuxuanfu/PaperCrew）
>
> 本文只描述已经存在的实现。`src/` 下预留但尚未使用的目录会在第 8 节明确标注，未来规划不会写成已实现功能。

---

## 1. 项目整体架构

### 1.1 定位与硬约束

PaperCrew 是**前端应用 + 单一文献代理**的多智能体科研工作台。无数据库、无账号体系，前端可静态部署；文献代理是唯一后端进程，只负责转发 Semantic Scholar 请求：

- **两种模式共用一套引擎**：DEMO 回放本地校验过的 JSON；LIVE 直连 OpenAI-compatible API。两者都产生相同的 `RunSession`，由同一个 Orchestrator、状态机与结果视图消费。
- **结构优先**：LIVE 的每个 Agent 输出必须是 JSON，并经过 Zod 严格校验；结构不合格只允许一次“仅修结构”的修复请求。
- **失败即失败**：LIVE 请求失败、解析失败或校验失败都会把 Agent 与 Session 标记为 `failed`，**不会静默回退 DEMO**。
- **不伪造文献**：LIVE 下模型只生成检索计划，`literature` 必须为空；真实论文由 Semantic Scholar Graph API 提供（经后端代理），Mapper 不补全缺失字段。检索失败或为空时结果页明确显示状态，**不使用模拟文献替代**。
- **职责分离**：LLM 负责理解课题、拆解问题与制定检索策略；Semantic Scholar 负责论文搜索与元数据；参考文献元数据由程序拼装，不由模型生成；关键词匹配只用于透明展示相关度，不冒充 API 评分。
- **密钥边界**：LLM Key 仅存于浏览器 `localStorage`，只出现在 `Authorization` 请求头；Semantic Scholar Key 只存在于代理进程的 `SEMANTIC_SCHOLAR_API_KEY`，由代理放入 `x-api-key`。浏览器永远不接触 S2 Key；Key 不写日志、不进错误信息、不在 UI 展示完整值。

### 1.2 分层结构

```
┌────────────────────────────────────────────────────────────┐
│ UI 层（React 19 + Tailwind）                                │
│  App / Header / WorkspacePanel / AgentTimeline              │
│  ResearchResults（Plan/Literature/Review/Report）           │
│  ApiSettings（含 Test Connection）                          │
└──────────────────────────┬─────────────────────────────────┘
                           │ 订阅状态 / 派发命令
┌──────────────────────────▼─────────────────────────────────┐
│ Store 层（Zustand 5）                                       │
│  settingsStore：模式 + API 配置（persist → localStorage）    │
│  uiStore：topic / 案例 / tab / 移动端视图 / 设置弹窗          │
│  sessionStore：运行态镜像 + 控制命令转发                     │
└──────────────────────────┬─────────────────────────────────┘
                           │ start / pause / resume / cancel / retry / restart
┌──────────────────────────▼─────────────────────────────────┐
│ Engine 层（纯 TS，零 React）                                 │
│  TaskController：命令入口 + generation 隔离                  │
│  DemoPlayer / LivePlayer：把模板或 topic 变成 RunSession     │
│  Orchestrator：串行调度、事件记录、暂停/取消/重试             │
│  stateMachine：Agent / Session 有限状态机                    │
│  PlaybackClock：可暂停的计时器                               │
└──────────────────────────┬─────────────────────────────────┘
                           │ AgentExecutor 接口
┌──────────────────────────▼─────────────────────────────────┐
│ Executor 层                                                  │
│  DemoExecutor：从模板读取输出，按 durationMs 回放             │
│  LLMExecutor：Prompt → Provider → JSON → Zod → AgentResult  │
│  LiteratureResearcherExecutor：装饰 LLMExecutor，注入真实文献 │
└──────────────────────────┬─────────────────────────────────┘
                           │ LLMProvider / SemanticScholarProvider
┌──────────────────────────▼─────────────────────────────────┐
│ 外部服务层                                                   │
│  OpenAICompatibleProvider：POST {BaseURL}/chat/completions  │
│  SemanticScholarApiProvider：GET {代理}/api/.../search       │
│  LiteratureSearchService：查询构建、合并、去重、上限与统计    │
│  semanticScholarMapper：API 字段 → LiteratureClue           │
│  synthesizerCitations：paperId 校验 + 程序生成参考文献        │
└──────────────────────────┬─────────────────────────────────┘
                           │ 仅文献（浏览器不接触 S2）
┌──────────────────────────▼─────────────────────────────────┐
│ PaperCrew Node 代理（server/，无第三方依赖）                 │
│  固定上游 URL/fields · 参数白名单 · CORS · 限流 · 超时/取消  │
│  Key 仅来自 SEMANTIC_SCHOLAR_API_KEY                        │
└──────────────────────────┬─────────────────────────────────┘
                           │ HTTPS
                    api.semanticscholar.org

旁路支撑：
  Zod schemas（DEMO / LIVE / 文献检索）
  Prompt 注册表 · DemoDataService · ConfigService
```

依赖方向自上而下；`src/engine`、`src/agents`、`src/services`、`src/domain` 不依赖 React。UI 组件不做业务 `fetch`，Demo 数据只经 `DemoDataService` 获取。

### 1.3 关键模块职责

| 模块 | 位置 | 职责 |
| --- | --- | --- |
| `App` / 布局组件 | `src/App.tsx`、`src/components/layout/` | 应用外壳、启动时加载默认案例、三栏工作台与移动端视图切换 |
| `sessionStore` | `src/store/sessionStore.ts` | 保存当前 `RunSession`、派生运行状态、把控制命令转给 TaskController，不实现执行逻辑 |
| `uiStore` | `src/store/uiStore.ts` | 研究课题、当前案例、结果 Tab、移动端视图、设置弹窗、案例加载状态 |
| `settingsStore` | `src/store/settingsStore.ts` | DEMO/LIVE 模式与 API 配置，经 `persist` 写入 `localStorage` |
| `TaskController` | `src/engine/taskController.ts` | 对外控制 API；持有当前 Task；用 generation 计数器隔离旧运行 |
| `DemoPlayer` / `LivePlayer` | `src/engine/demoPlayer.ts`、`livePlayer.ts` | 分别从校验后的模板、从 topic + LIVE 配置创建独立 `RunSession` |
| `Orchestrator` | `src/engine/orchestrator.ts` | 串行执行四个 Agent，注入上游输出，记录事件，处理暂停/取消/重试 |
| `PlaybackClock` | `src/engine/playbackClock.ts` | 基于 `setTimeout` 的可暂停计时器；暂停时零等待阻塞，恢复后继续 |
| `stateMachine` | `src/engine/stateMachine.ts` | Agent / Session 合法状态转换；非法转换直接抛错 |
| `DemoExecutor` | `src/agents/demoExecutor.ts` | 以模板中的 `durationMs`、进度事件与输出作为 Playbook 与结果 |
| `LLMExecutor` | `src/agents/llmExecutor.ts` | 组装 Prompt、调用 Provider、解析并校验 JSON、失败时一次结构修复；含跨 Agent DOI 与 `[S2:paperId]` 校验，并追加程序生成的参考文献 |
| `LiteratureResearcherExecutor` | `src/agents/literatureResearcherExecutor.ts` | 包装 Researcher 执行器：LLM 计划 → Semantic Scholar 检索 → 合并真实文献 → 最终 Schema + 关联问题校验 |
| `synthesizerCitations` | `src/agents/synthesizerCitations.ts` | 提取 `[S2:paperId]`、对照真实集合、生成参考文献块并插入 `## 4.` 之前 |
| `LiteratureSearchService` | `src/services/literature/literatureSearchService.ts` | 构建查询、顺序检索、合并去重、最多 8 篇、失败/部分失败状态、三类统计与每查询 `queryStats` |
| `SemanticScholarApiProvider` | `src/services/literature/semanticScholarProvider.ts` | 调用 PaperCrew 代理、校验 query/limit、HTTP 错误映射、超时/取消生命周期；不发送任何 Key |
| `semanticScholarMapper` | `src/services/literature/semanticScholarMapper.ts` | 只映射 API 原值，缺失字段保持 null / 空数组，DOI 只取 externalIds.DOI |
| 文献代理 | `server/src/` | `env` 配置、`semanticScholarClient` 固定上游、`rateLimiter`、路由参数/CORS/取消、HTTP Server |
| `LLMProvider` | `src/services/llm/llmProvider.ts` | 稳定的模型调用接口，屏蔽具体服务商 |
| `OpenAICompatibleProvider` | `src/services/llm/openAICompatibleProvider.ts` | HTTP 请求、统一超时/取消生命周期、HTTP 错误映射、响应内容提取 |
| `ConfigService` | `src/services/config/configService.ts` | 配置读取/保存/删除、完整性检查、连接测试、密钥打码 |
| Prompt | `src/prompts/` | 四个 Agent 的 System Prompt 与用户消息构造、上游 JSON 注入 |
| Zod Schema | `src/schemas/` | DEMO 会话校验、LIVE 单 Agent 输出校验、跨 Agent 一致性校验 |
| `DemoDataService` | `src/services/demoDataService.ts` | 案例列表、加载（`import.meta.env.BASE_URL`）、严格校验 |

---

## 2. 真实执行流程

### 2.1 启动与案例加载（DEMO 模板）

1. `App` 挂载时调用 `uiStore.loadCase()`，默认案例 ID 来自 `src/data/index.ts`。
2. `DemoDataService.loadDemoSession()` 通过 `fetch` 读取 `public/data/*.json`（拼接 `BASE_URL`，兼容静态子路径部署）。
3. `validateDemoSession()` 用 Zod 做两层校验：
   - 结构校验：`demoSessionSchema`（Agent、输出、事件、时间戳、报告章节等）。
   - 跨字段校验：Agent 输出类型与 Agent 身份一致、事件顺序合法、报告 9 章节齐全、Session 内 Agent 集合完整等。
4. 校验通过后存入 `sessionStore.template`；失败进入 `uiStore.demoState = 'error'`，Workspace / Process / Results 三处都显示错误与“重新加载案例”按钮。
5. 模板是**只读**的。每次运行都会 `structuredClone` 成新的 `RunSession`，回放不会修改模板。

### 2.2 DEMO 运行

1. 用户点击 **Start Research** → `sessionStore.startSession()` → `TaskController.start(template)`。
2. `TaskController` 递增 generation，销毁旧 Task，创建新的 `DemoPlayer` 会话：
   - `sessionId = run-<caseId>-<timestamp>-<rand>`，`mode = 'demo'`；
   - 四个 Agent 初始为 `idle`，`output = null`；
   - 追加 `session_created` 事件。
3. `Orchestrator.start()`：Session → `running`，按 `AGENT_IDS`（planner → researcher → reviewer → synthesizer）串行循环。
4. 每个 Agent：
   - `pending → running`，记录 `agent_started`；
   - 通过 `DemoExecutor.getPlaybook()` 取得该 Agent 的 `durationMs`，`PlaybackClock.wait(duration)` 期间可暂停/取消；
   - 进度消息按 `progressMessages` 依次发出（`agent_progress`）；
   - `DemoExecutor.execute()` 返回模板中的输出（`structuredClone`）；
   - 输出写入 `RunSession`，`agent_completed` / `agent_fallback` / `agent_failed`。
5. 四个 Agent 结束后 Session → `completed`，追加 `session_completed`。
6. 每次事件/输出变化都通过回调推给 `sessionStore`，结果页按 Agent 完成情况逐步解锁。

DEMO 的最终结果与本地 JSON 完全一致；`source = 'demo'`。

### 2.3 LIVE 运行

1. 页头切换 **LIVE**（`settingsStore.setMode`），点击 **Start LIVE Run**。
2. `sessionStore.startSession(topic)` 先检查：
   - topic 至少 4 个字符；
   - `ConfigService.getCompleteness(api)` 三项齐全（Base URL / API Key / Model Name）。
   不满足则不发请求，并在 Workspace 显示缺失字段。
3. `TaskController.startLive(topic)`：
   - 递增 generation，销毁旧 Task；
   - `LivePlayer` 创建会话：`sessionId = live-<timestamp>-<rand>`，`mode = 'live'`，带 topic 与可选描述，Agent 输出为空；
   - `LLMExecutor` 使用 `OpenAICompatibleProvider` 与 `toLLMConfig(ConfigService.read())` 构建；
   - `LivePlayer.createOrchestrator()` 在注入 `literatureSearch` 时，用 `LiteratureResearcherExecutor` 包装 Researcher，其余 Agent 仍直接使用 `LLMExecutor`。
4. 每个 Agent 执行：
   - `Orchestrator` 把已产出上游输出收集为 `AgentContext.upstream`；
   - `LLMExecutor` 从 `LIVE_PROMPTS[agentId]` 取 System Prompt，用 `topicBlock()` 与 `upstreamJson()` 拼用户消息；
   - 调用 `provider.chatCompletion(request, signal)`，`request` 含 baseURL、apiKey、model、messages、temperature、maxTokens、responseFormat、timeoutMs；
   - 响应文本先 `parseJsonResponse()`，再按 Agent 的 Zod Schema 严格校验，最后做跨 Agent 一致性检查；
   - 通过则写入 `AgentResult`（`source = 'live'`），继续下游。
5. Researcher 额外流程（`LiteratureResearcherExecutor`）：
   - LLM 只返回 `retrievalPlan`，`literature` 必须为空；
   - 使用 Planner 的 `searchKeywords` 与 `retrievalPlan.keywordGroups` 构建最多 4 个查询；
   - 每个查询单独调用 `SemanticScholarApiProvider`（`limit=5`），由代理访问 Semantic Scholar，失败记录 warning 并继续；
   - 按查询轮询合并、`paperId` 去重、最多 8 篇；
   - 真实文献注入输出，`retrieval` 记录 status / queries / queryStats / searchedAt / durationMs / totalMatched / totalFetched / totalReturned / error / warnings；
   - 最终输出经 `liveResearcherFinalSchema` 校验（全部 `sourceType: 'real'`、id 唯一、关联问题存在）。
6. 任一 LLM Agent 失败：该 Agent → `failed`，Session → `failed`，错误写入 store，UI 显示失败原因与“重试失败 Agent”；**不切换 DEMO、不保留半成品为成功**。
7. Semantic Scholar 失败或为空：Researcher 仍可完成（不会伪造论文），`retrieval.status` 为 `failed` / `empty`，结果页展示明确状态与错误；Reviewer / Synthesizer 收到的就是空集合，Prompt 要求其说明证据不足。
8. Synthesizer 完成前：`LLMExecutor` 校验正文中的 `[S2:paperId]` 必须属于 Researcher 真实集合，未知 ID 触发一次结构修复；通过后由程序把参考文献块插入报告。App 层仍以 `RunSession` 为唯一数据源。
9. 全部完成：Session → `completed`，结果页显示 LIVE MODEL OUTPUT 标识。

LIVE 与 DEMO 共用 `RunSession`、状态机、Orchestrator、结果组件；差异只在“输出从哪来”。

---

## 3. Agent 协作关系

### 3.1 角色与输入输出

| 顺序 | Agent | 输入 | 输出 | 关键约束 |
| --- | --- | --- | --- | --- |
| 1 | Planner | 研究课题 + 可选补充说明 | `plan`：3 个研究问题（q1–q3）、2 组英文关键词（kw1–kw2）、可选备注 | ID 固定；问题与关键词必须非空 |
| 2 | Researcher | 课题 + Planner 输出 | `research`：检索策略、关键词组合、研究空白、后续方向、`retrievalPlan`；LIVE 下 `literature` 由 Semantic Scholar 注入（最多 8 篇），`retrieval` 记录检索元数据 | LLM 不生成论文；所有真实文献必须通过 API 获取并校验；缺失字段不补全 |
| 3 | Reviewer | 课题 + Planner + Researcher 输出 | `review`：恰好 3 条意见（类别、严重度、问题、影响、建议、关联问题） | `relatedQuestionIds` 必须引用存在的 q1–q3；需审查真实文献的相关性、证据充分性、缺失方向 |
| 4 | Synthesizer | 课题 + Planner + Researcher + Reviewer 输出 | `synthesis`：9 章节 Markdown，含 Evidence / Hypothesis / Proposal 与 KaTeX 公式 | 章节齐全；含 `$$` 公式；只能使用 Researcher 真实集合的 `[S2:paperId]`，不得引入新论文、集合外 paperId 或集合外 DOI；参考文献由程序追加 |

### 3.2 数据流

```
topic
  └─> Planner ──output(plan)──────────────┐
        └─> Researcher(LLM plan) ─────────┤
              └─> LiteratureResearcherExecutor
                    ├─ LiteratureSearchService
                    │    └─ SemanticScholarApiProvider
                    │         └─ PaperCrew 代理 (server/) ─> Semantic Scholar
                    └─ merge real LiteratureClue[] (≤ 8, deduped)
                          │
                          └─> Researcher output(research + retrieval)
                                └─> Reviewer ──output(review)──┐
                                      └─> Synthesizer <────────┘
                                            ├─ [S2:paperId] 校验
                                            ├─ 程序追加参考文献
                                            └─ output(synthesis)
```

- 上游输出由 `Orchestrator.collectUpstream()` 收集：只包含已结束且确实产出结果的 Agent（`completed` / `fallback`）。
- `AgentContext` 每次执行时包含：`sessionId`、`topic`、`agentId`、只读的 `session` 快照、`upstream`、`AbortSignal`。
- LIVE Prompt 通过 `upstreamJson(context, 'planner' | 'researcher' | 'reviewer')` 注入对应 JSON；缺失时注入 `{}`。
- 跨 Agent 校验在 `LLMExecutor` 中完成：Reviewer 的 `relatedQuestionIds` 必须存在于 Planner 的问题 ID 中；Synthesizer 报告中的 DOI 必须属于 Researcher 的真实文献集合，`[S2:paperId]` 必须属于同一集合，否则报“不得编造 S2 引用”。
- `LLMExecutor.validate()` 在 Synthesizer 通过校验后，用 `appendProgrammaticReferences()` 把程序生成的参考文献插入报告，再写入 `AgentResult`。
- `LiteratureResearcherExecutor` 额外校验真实文献的 `relatedQuestionIds` 只能引用 Planner 的 q1–q3。
- DEMO 模式下 `upstream` 同样被收集，但 `DemoExecutor` 直接读取模板输出，不重新生成内容。

### 3.3 失败与下游

- 上游失败时整次 LIVE 运行立即失败，下游不会拿到不完整上下文继续“编造”。
- DEMO 模板若把某个 Agent 标为 `fallback`，`DemoExecutor` 会返回 `fallback` 结果，Orchestrator 允许 Session 继续；这是模板自身的数据设定，不是运行时降级。
- 重试只从失败 Agent 开始重跑；已完成的上游直接复用。

---

## 4. 状态管理

### 4.1 Agent 状态机

状态：`idle | pending | running | completed | failed | fallback | skipped`

| 当前 | 可转换到 |
| --- | --- |
| `idle` | `pending`、`skipped` |
| `pending` | `running`、`failed`、`skipped` |
| `running` | `completed`、`failed`、`fallback`、`skipped` |
| `completed` / `failed` / `fallback` / `skipped` | 终态 |

补充规则：

- 开始会话时所有 Agent 置为 `pending`。
- 只有 `running` 才能进入 `completed` / `fallback`。
- 取消时：`idle` / `pending` / `running` 均可转 `skipped`，避免残留“运行中”状态。
- 重试时：失败 Agent 从 `failed` 重置为 `pending`，其下游同样重置；上游保持完成。

### 4.2 Session 状态机

状态：`created | running | paused | completed | failed | cancelled`

| 当前 | 可转换到 |
| --- | --- |
| `created` | `running`、`cancelled`、`failed` |
| `running` | `paused`、`completed`、`failed`、`cancelled` |
| `paused` | `running`、`cancelled`、`failed` |
| `completed` / `failed` / `cancelled` | 终态 |

- Session 进入 `completed` 前，四个 Agent 必须都处于 `completed` 或 `fallback`。
- 任一 Agent `failed` → Session `failed`。
- 取消 → Session `cancelled`；已运行/待运行的 Agent → `skipped`。
- 非法转换由 `stateMachine` 直接抛错，不静默修正。

### 4.3 事件记录

`RunSession.events` 是运行过程的唯一时间线，事件 `id` 为 `${sessionId}-evt-<n>`，按追加顺序展示：

| 事件 | 触发时机 | 要点 |
| --- | --- | --- |
| `session_created` | 新会话创建 | DEMO 带 `templateId`；LIVE 带 `mode: 'live'` |
| `session_started` | Orchestrator 开始 | 开始串行循环 |
| `session_paused` | 用户暂停 | 计时器暂停 |
| `session_resumed` | 用户恢复 / 重试 | 重试时带 `retry: true` 与起始 Agent |
| `session_completed` | 全部 Agent 结束 | 带 `summary` |
| `session_failed` | Agent 失败或取消 | 带错误信息 |
| `session_cancelled` | 用户取消 | 带原因 |
| `agent_started` | Agent 开始 | `from` / `to` 状态 |
| `agent_progress` | DEMO 进度回放 | 仅 DEMO 模板提供 |
| `agent_completed` | 成功完成 | 带 `outputType`、`summary`、`source` |
| `agent_fallback` | 模板降级输出 | 仅当 DEMO 数据明确声明 |
| `agent_failed` | 执行失败 | 带可读错误 |
| `agent_skipped` | 取消导致跳过 | 带 `from` 状态 |

事件与事件消息用于 Agent 时间线卡片；结果视图只读取 `RunSession.agents[].output` 与 Agent 状态。

### 4.4 控制语义

| 操作 | 行为 | 是否中断在途 LLM 请求 |
| --- | --- | --- |
| Start | 用当前模板（DEMO）或 topic（LIVE）创建新 Session | — |
| Pause | `PlaybackClock.pause()`，Session → `paused`；计时器与循环停在当前 Agent 边界 | **否**（按设计，已发出的请求继续完成，返回后才阻塞在 `clock.wait(0)`） |
| Resume | `PlaybackClock.resume()`，Session → `running`；从原位置继续 | — |
| Cancel | `clock.cancel()` + `AbortController.abort()`；运行/待运行 Agent → `skipped`，Session → `cancelled` | **是**（LIVE 的 fetch 与响应体读取都会中止） |
| Retry | 仅当 Session `failed`；新建 AbortController，失败 Agent 及其下游重置并重跑 | 旧请求已结束或已被 abort |
| Restart | 若仍有活动运行先取消，然后基于原模板/原 topic 创建全新的 Session | 是 |
| 切换案例 / 模式 | 先取消当前活动运行，再加载新案例或切换模式 | 是 |

细节：

- 暂停不会 abort 在途请求；因此在“暂停后立即取消”的情况下，取消仍会通过同一个 AbortController 终止请求。
- LIVE 的取消错误被 `LLMExecutor` 归一为 `AbortError`，Orchestrator 识别后不再把 Agent 标记为失败，而是走取消路径（`skipped`）。
- 超时错误保持为 `LLMTimeoutError`，会正常把 Agent/Session 置为 `failed`，不会被误判为取消或网络错误。

### 4.5 并发隔离

- `TaskController` 持有单调递增的 `generation`。每次 Start / Restart / 切换案例都会递增；旧 Task 的回调在比较 generation 后直接丢弃，**旧 Session 的异步结果不会覆盖新 Session**。
- `TaskController.dispose()` 会取消并销毁当前 Task；`sessionStore` 在案例切换与新运行前也会调用取消。
- `Orchestrator` 的 `cancelled` 标志与 `AbortController` 共同保证取消后不再写入输出、不再追加后续事件。
- 同一时刻只有一个活动 Session；历史运行不会被持久化。

### 4.6 Store 职责

- `sessionStore`：只持久于内存，保存 `currentSession`、`sessionStatus`、`error`、`isCancelling`、`liveInput`、`template`，并转发控制命令；不直接解析 JSON、不直接调用 Provider。
- `uiStore`：界面状态与案例加载状态；`loadCase` 会先取消运行，再让 DemoDataService 加载。
- `settingsStore`：模式与 API 配置；仅配置持久化到 `localStorage`，运行态不持久化。

---

## 5. 数据结构

### 5.1 核心类型

| 类型 | 位置 | 说明 |
| --- | --- | --- |
| `DemoSession` | `src/types/session.ts` | 只读模板：`id`、`title`、`description`、`topic`、`agents`、`events`、`finalReport`、时间戳 |
| `RunSession` | `src/types/session.ts` | 运行时会话：`sessionId`、`templateId?`、`mode: 'demo' \| 'live'`、`title`、`topic`、`status`、`agents`、`events`、`live?`、`startedAt`、`completedAt?` |
| `DemoAgent` | `src/types/agent.ts` | 模板中的 Agent：固定 `output`、`durationMs`、`fallbackReason?`、事件 |
| `RunAgent` | `src/types/session.ts` | 运行中的 Agent：`status`、`output: AgentOutput \| null`、`startedAt?`、`completedAt?`、`error?` |
| `AgentOutput` | `src/types/research.ts` | 四种输出的联合：`planner` / `researcher` / `reviewer` / `synthesizer` |
| `LiteratureClue` | `src/schemas/researchSchema.ts` → `types/research.ts` | 文献记录：id、标题、作者、年份、发表渠道、摘要、相关度、`sourceType`、DOI、URL、Open PDF、引用数、关联问题 |
| `LiteratureRetrieval` | `src/schemas/researchSchema.ts` | 检索元数据：status、queries、queryStats、searchedAt、durationMs、totalMatched、totalFetched、totalReturned、error、warnings |
| `LiteratureQueryStat` | `src/schemas/researchSchema.ts` | 单查询统计：query、status（completed/failed）、totalMatched、totalFetched |
| `LiteratureSearchOutcome` | `src/services/literature/semanticScholarTypes.ts` | 检索服务结果：真实文献、状态（completed/empty/failed）、查询、时间、`totalMatched` / `totalFetched` / `totalReturned`、`queryStats`、错误、warning |
| `SemanticScholarProvider` | `src/services/literature/semanticScholarTypes.ts` | `search(query, options)` 接口，隔离 HTTP 实现 |
| `AgentContext` | `src/types/engine.ts` | 执行上下文：`sessionId`、`topic`、`agentId`、`session`、`upstream`、`signal` |
| `UpstreamAgentResult` | `src/types/engine.ts` | 上游结果：`agentId`、`output`、`source` |
| `AgentResult` | `src/types/engine.ts` | 执行结果：`status`、`output?`、`error?`、`summary?`、`fallbackReason?`、`source` |
| `AgentPlaybook` | `src/types/engine.ts` | DEMO 回放脚本：`durationMs`、开始/进度/完成消息 |
| `AgentExecutor` | `src/types/engine.ts` | `execute(context)` 与可选 `getPlaybook(agentId)` |
| `LLMRequest` | `src/services/llm/llmProvider.ts` | baseURL、apiKey、model、messages、temperature、maxTokens、responseFormat、timeoutMs |
| `LLMResponse` | `src/services/llm/llmProvider.ts` | `content`、可选 `model`、`finishReason` |
| `ApiSettings` | `src/types/ui.ts` | baseUrl、apiKey、modelName、temperature、maxTokens、jsonMode（不含 Semantic Scholar Key） |

### 5.2 模板与运行态

- **模板（DemoSession）**：来自 `public/data/*.json`，经 `demoSessionSchema` 与跨字段校验；只读，不进入状态机。
- **运行态（RunSession）**：由 Player 克隆/创建；Agent 状态、输出、事件、时间戳全部属于本次运行，`Restart` 会产生新的 `sessionId`。
- 两者共享 `AgentOutput` 结构，因此结果组件对 DEMO / LIVE 完全一致。

### 5.3 Zod 校验职责

| Schema | 作用 |
| --- | --- |
| `agentSchema` / `researchSchema` | 输出结构、ID 规则、长度与数量约束、9 章节报告结构；文献记录区分 real / simulated，simulated 禁止 DOI/链接 |
| `sessionSchema` | DEMO 模板结构；`demoSessionSchema` 追加跨字段一致性检查（含文献关联问题与 Agent 输出一致） |
| `liveSchemas.ts` | LIVE 单 Agent 输出：Planner ID 固定 q1–q3/kw1–kw2；Researcher 计划阶段 `literature` 必须为空、必须有 `retrievalPlan`；最终阶段最多 8 篇且全部 `sourceType: 'real'`、id 唯一；Reviewer 恰好 3 条；Synthesizer 必须有 9 章节与 `$$` 公式 |
| `sessionSchema` 校验器 | `validateDemoSession()` 返回结构化问题列表，供 UI 展示 |

校验链路（LLM）：`parseJsonResponse()` → `liveAgentOutputSchemas[agentId].safeParse()` → 跨 Agent 检查（Reviewer 问题 ID、Synthesizer DOI 与 `[S2:paperId]`）。任何一步失败都进入“一次结构修复”流程；修复后仍失败则抛 `AgentExecutionError`；通过后 Synthesizer 报告由程序追加参考文献。
校验链路（文献）：代理 payload → `parseSearchPayload()`（data 数组）→ Mapper（不补全缺失字段）→ `liveResearcherFinalSchema`（数量 / id / real-only）→ 关联问题校验。

---

## 6. LIVE 模式

### 6.1 配置

`ConfigService` 管理 `ApiSettings`：

- **Base URL**：支持 `https://host`、`https://host/v1` 或完整 `/chat/completions`；`resolveChatCompletionsUrl()` 自动补全并去重 `/v1/v1`。
- **API Key**：密码输入框，可显示/隐藏；仅保存在 `localStorage`。
- **Model Name**：原样发送给服务商。
- **Temperature**：0–2；**Max Tokens**：256–32000；**JSON Mode**：可开关，开启时发送 `response_format: { type: 'json_object' }`。
- **Semantic Scholar 配置不在浏览器**：代理地址由构建环境变量 `VITE_SEMANTIC_SCHOLAR_PROXY_URL` 提供；S2 Key 由代理进程的 `SEMANTIC_SCHOLAR_API_KEY` 提供。设置页不再包含 S2 Key 字段，旧持久化值由 `settingsStore` 在恢复时删除。
- **Test Connection**：发送最小请求验证 LLM 连通性，独立 20 秒超时；不会调用 Semantic Scholar，也不会启动研究运行。
- 保存在 `localStorage` 的键由 `ConfigService` 统一管理；删除配置会同时清除内存与本地存储。

### 6.2 Provider 接口

```ts
interface LLMProvider {
  chatCompletion(request: LLMRequest, signal?: AbortSignal): Promise<LLMResponse>
}
```

`OpenAICompatibleProvider` 的实现要点：

- **请求**：`POST {BaseURL}/chat/completions`，Header 仅 `Authorization: Bearer <key>` 与 `Content-Type: application/json`；Body 含 `model`、`messages`、`temperature`、`max_tokens`，按需带 `response_format`。
- **响应**：`choices[0].message.content`，兼容字符串与分段数组（`{ type: 'text', text }`）两种形态；缺失内容时报 `LLMResponseError`。
- **密钥边界**：不打印请求头、不把 Key 放入错误消息；错误消息只描述类别与建议。

### 6.3 超时与取消生命周期（阶段六修复）

一次请求的完整生命周期共用**同一个** `AbortController`：

```
fetch 请求 → 读取响应体 → response.json() → 提取 content
```

- **超时**：`setTimeout` 从请求开始计时，覆盖上述全部阶段；触发后 `controller.abort()` 并置 `timedOut = true`，最终抛 `LLMTimeoutError`（`code: 'timeout'`）。
- **外部取消**：传入的 `AbortSignal` 通过 `{ once: true }` 监听转发到内部 controller；请求任意阶段被取消都会抛 `LLMCancelledError`（`code: 'cancelled'`）。
- **判定优先级**：外部 `signal.aborted` 优先于 `timedOut`，避免“取消”被误报为超时；两者都不是时才归为 `LLMNetworkError`。
- **清理**：`clearTimeout` 与 `removeEventListener('abort', ...)` 只在最外层 `finally` 执行，即所有阶段结束（成功或失败）后；不会在响应头到达后就提前移除保护。
- **HTTP 错误优先**：非 2xx 时立即取消响应体（fire-and-forget，不等待），然后按状态码映射错误；**错误体解析不会覆盖原始 HTTP 状态错误**，也不会阻塞错误返回。
- **不新增错误类型**：沿用 `LLMTimeoutError` / `LLMCancelledError` / 既有 HTTP 映射错误。

旧实现的问题：清理逻辑只包住 `fetch`，响应头返回后超时与外部取消即失效，`response.json()` 可能永久挂起且无法取消。现已修复，并由 `tests/engine/live.test.ts` 的生命周期用例覆盖。

### 6.4 错误映射

| 条件 | 错误类型 | `code` | 用户可读消息（示例） |
| --- | --- | --- | --- |
| 401 / 403 | `LLMAuthError` | `auth` | 认证失败：请检查 API Key。 |
| 404 | `LLMEndpointError` | `endpoint` | 接口地址不存在：请检查 Base URL。 |
| 429 | `LLMRateLimitError` | `rate_limit` | 请求过于频繁：请稍后重试。 |
| ≥ 500 | `LLMServerError` | `server` | 服务商暂时不可用（5xx）：请稍后重试。 |
| 400 / 422 | `LLMRequestError` | `request` | 请求参数被拒绝：请检查模型与参数。 |
| 其他 HTTP | `LLMRequestError` | `request` | 请求失败（HTTP `<status>`）。 |
| 网络失败 | `LLMNetworkError` | `network` | 网络请求失败：请检查网络或接口地址。 |
| 超时 | `LLMTimeoutError` | `timeout` | 请求超时：请检查网络或适当增加超时时间。 |
| 外部取消 | `LLMCancelledError` | `cancelled` | 请求已取消。 |
| 非法 JSON / 缺内容 | `LLMResponseError` / `LLMParseError` | `response` / `parse` | 响应格式错误… |
| Zod 校验失败 | `LLMValidationError` | `validation` | 输出结构校验失败… |

`LLMExecutor` 将 `LLMError` 包装为 `AgentExecutionError`（保留可读消息）；若 `context.signal.aborted`，改写为 `AbortError`，让 Orchestrator 走取消流程而非失败流程。

### 6.5 错误传播与 UI

```
Provider 抛错
  → LLMExecutor 包装（取消 → AbortError；其余 → AgentExecutionError）
  → Orchestrator：Agent failed + Session failed，追加 agent_failed / session_failed
  → sessionStore.error / currentSession
  → WorkspacePanel 执行失败卡片（可重试）+ AgentTimeline 红色状态
  → ResearchResults 当前 Tab 显示失败原因
```

- 用户可读中文消息贯穿全链路，不暴露 Header、Key、原始请求体。
- LIVE 失败**绝不自动切 DEMO**；`currentSession.mode` 始终为 `live`，结果页保留 LIVE 标识。
- 旧 Session 的迟到回调被 TaskController 的 generation 计数器丢弃，不会覆盖新 Session 的错误或结果。

### 6.6 JSON 修复

- 第一次解析或 Zod 校验失败时，`LLMExecutor` 追加一条 assistant（原始响应）与 user（`repairInstruction` + 具体问题）消息，再请求一次。
- 修复只针对结构，不改变研究内容，且**最多一次**。
- 第二次仍失败 → `AgentExecutionError('响应格式错误：…（已尝试一次修复）…')`，整次运行失败，不重试、不回退。

### 6.7 密钥存储与安全边界

- LLM API Key 只通过 `ConfigService` 读取，只放入 `Authorization` 头。Semantic Scholar Key 只存在于代理进程，由代理放入 `x-api-key`；浏览器请求只包含 `query` / `limit`，不包含 Key。
- 两个 Key 都不写 `console`、不进入错误对象、不在 UI 完整展示（LLM Key 仅提供显示/隐藏切换）；错误消息只描述类别与建议。代理在转发上游错误时只返回类别与状态，不返回上游响应体，避免泄露。
- `localStorage` 为明文存储，**不是安全密钥存储**；仅适合个人开发与可信环境演示。公开部署建议把 LLM 也放到服务端转发。
- 连接测试与正式请求使用同一 Provider 与同一套错误映射，不会把 Key 作为查询参数；代理拒绝 `apiKey` 查询参数。

### 6.8 Semantic Scholar 文献检索（7.1：后端代理）

**分层与职责**

```
LiteratureResearcherExecutor (AgentExecutor 装饰器)
  └─ LiteratureSearchService
       ├─ buildQueries：Planner 2 组关键词优先 + retrievalPlan.keywordGroups 补充
       ├─ SemanticScholarApiProvider.search(query, { signal, limit, timeoutMs })
       │    └─ GET {VITE_SEMANTIC_SCHOLAR_PROXY_URL}/api/semantic-scholar/search?query&limit
       └─ mergeResults：按查询轮询合并 → paperId 去重 → 最多 8 篇 → 统计

server/ 代理
  └─ GET /api/semantic-scholar/search
       ├─ 参数白名单 + 长度/范围校验 + 方法/请求体限制
       ├─ CORS 精确来源 + 限流 → semanticScholarClient
       └─ GET https://api.semanticscholar.org/graph/v1/paper/search（固定 fields）
```

LLM 只生成 `retrievalPlan`，不得生成文献；真实文献由服务层注入。这样既保持 `AgentExecutor` / Orchestrator / DEMO-LIVE 共用结构不变，也把“搜索”和“生成”职责分开。

**前端请求**

- 只请求 `GET {代理}/api/semantic-scholar/search`，参数仅 `query` 与 `limit`；`limit` 固定为 5（Provider 允许 1–10，非法值直接抛 `LiteratureConfigError`）
- Header 仅 `Accept: application/json`；不发送 `x-api-key`、不发送 Authorization、不发送任何 S2 Key
- 未配置代理地址、非 http(s)、非法 URL → `LiteratureConfigError`，提示设置 `VITE_SEMANTIC_SCHOLAR_PROXY_URL`
- 每个查询独立请求；最多 4 个查询；超时 20 秒；复用 Session `AbortSignal`；`fetch` 与 `response.json()` 共用一个 `AbortController` 生命周期

**代理接口与安全边界**

- 接口：`GET /api/semantic-scholar/search?query=<2-300 字符>&limit=<1-10>`；`limit` 默认 5
- 拒绝其他参数（包括 `url`、`fields`、`apiKey`）、非 GET 方法、带请求体的 GET；上游 URL 与 fields **硬编码**，不存在任意 URL 转发
- Key：只读取 `SEMANTIC_SCHOLAR_API_KEY`，仅在有值时添加 `x-api-key`；不返回前端、不写日志、不进入错误消息
- CORS：`CORS_ALLOWED_ORIGINS` 精确来源，拒绝 `*` 和带路径的值；开发环境默认 `http://localhost:5173` / `http://127.0.0.1:5173`；生产未配置则为空（拒绝浏览器来源）
- 限流：单实例内存、按 IP、默认 60 次 / 60 秒；超限返回 `429 rate_limited` 与 `Retry-After`
- 超时：上游默认 15 秒，返回 `504 upstream_timeout`；客户端断开（`req.aborted` / `res.close`）会 abort 上游
- 状态映射：400 `upstream_request`、401/403 `upstream_auth`、404 `upstream_not_found`、429 `upstream_rate_limit`、502 `upstream_network`、5xx `upstream_server`、499 `client_cancelled`（不返回响应体）、500 `internal_error`

**统计口径**

| 字段 | 定义 | 注意 |
| --- | --- | --- |
| `totalMatched` | 各查询上游 `total` 之和 | 上游 total 可能包含跨查询重复，不等于实际返回数 |
| `totalFetched` | 各查询 `data` 实际取回条数之和 | 去重前；成功查询的 `papers.length` 之和 |
| `totalReturned` | 合并去重并截断到 8 篇后的数量 | 最终注入 Researcher 的文献数 |
| `queryStats[]` | 每查询 `status` / `totalMatched` / `totalFetched` | 失败查询 `totalMatched=null`、`totalFetched=0` |

失败 / 空结果路径同样返回 `queryStats` 与三项计数（为 0 或已成功查询的累计值），不伪造论文。

**字段映射（不造数据）**

| LiteratureClue | 来源 | 缺失时 |
| --- | --- | --- |
| `id` | `paperId` | 无 paperId / title 的条目直接丢弃 |
| `title` | `title` | 丢弃 |
| `authors` | `authors[].name`（过滤空白） | `[]` |
| `year` | `year`（1900–2100） | `null` |
| `venue` / `abstract` | 原值 trim | `null` |
| `doi` | `externalIds.DOI`，去掉 doi.org 前缀，必须以 `10.` 开头 | `null` |
| `url` / `openAccessPdf` | API 返回的 http(s) 链接 | `null` |
| `citationCount` / `referenceCount` | 非负整数 | `null` |
| `relevance` | 标题/摘要/venue/fieldsOfStudy 中的关键词匹配（≥3 high，≥1 medium，否则 low） | `low` |
| `sourceType` | 固定 `real` | — |
| `relatedQuestionIds` | Mapper 不推测，默认 `[]` | `[]` |

**引用与参考文献**

- 正文引用格式：`[S2:<paperId>]`；`extractS2PaperIds()` 去重提取，`citationIssues()` 对照 Researcher 集合
- 未知 paperId：作为校验失败进入 `LLMExecutor` 的“一次结构修复”；修复后仍未知则 Agent / Session 失败
- DOI 校验保留：报告中出现的 DOI 必须属于真实集合
- 成功后 `appendProgrammaticReferences()` 生成参考文献块并插入 `## 4. 研究假设` 之前（找不到则追加到末尾）；标题固定为“参考文献（由程序根据 Semantic Scholar 数据生成）”；作者 / 年份 / 渠道缺失写“暂无数据”，无 DOI 写“DOI：暂无数据”，无链接写“来源链接：暂无数据”；模型不参与该块生成

**状态与错误**

- `retrieval.status`：`idle | searching | completed | empty | failed`（运行结果只落 completed / empty / failed；searching 在 LIVE 运行中由结果页提示）。
- 单查询失败：记录 warning，继续其他查询；最终 `error = 部分查询失败：…`。
- 全部失败：`status = failed`，`literature = []`，不生成模拟论文。
- HTTP / 传输错误：前端把代理的 400、401/403、404/405、429、502、504、5xx、网络、非法 JSON、超时、取消分别映射为 `Literature*Error`，消息可读且不含 Key。
- 取消 Session 会 abort 当前前端请求；代理检测到断开后 abort 上游；Researcher 走取消流程（`skipped`），不会把取消误报为检索失败。

**部署边界**

- 仓库只包含可部署实现，**没有线上实例**；未部署代理时生产环境无法进行真实文献检索，错误会明确提示代理未配置 / 不可达。
- 代理必须运行在支持 Node.js ≥ 20.19 的环境；不能部署为纯静态站点。
- 多实例部署时内存限流不共享，需要共享限流存储或网关限流。
- 线上验证需在真实部署后单独执行；Mock 测试不代表真实 API 成功。

---

## 7. 已实现 / 未实现

### 7.1 已实现

- 四 Agent 串行流水线（Planner → Researcher → Reviewer → Synthesizer），DEMO 与 LIVE 共用同一套 `RunSession`、状态机、Orchestrator 与结果视图。
- Agent 与 Session 的完整状态机，非法转换抛错；暂停/恢复/取消/失败重试/整案重启。
- DEMO 本地回放：模板加载、Zod 结构 + 跨字段校验、按 `durationMs` 回放、事件时间线、结果逐步解锁。
- LIVE 真实调用：OpenAI-compatible Provider、URL 规范化、JSON Mode 可选、结构化 Prompt、严格 Zod 校验、一次结构修复。
- 请求全生命周期超时与取消：覆盖 fetch、响应体读取、JSON 解析；HTTP 状态错误优先且不被错误体覆盖；资源在完成后统一清理。
- 错误分级与中文提示：认证、地址、模型/参数、限流、5xx、网络、超时、取消、解析、校验。
- API Settings：完整性检查、连接测试、显示/隐藏密钥、打码展示、删除配置。
- 失败语义：LIVE 失败不回退 DEMO、不伪造文献；Semantic Scholar 失败/为空时明确展示失败/空状态，Researcher 不生成替代论文。
- Semantic Scholar 真实文献检索：Provider、Mapper、SearchService、Researcher 装饰器、最终 Schema 校验、Reviewer / Synthesizer 真实文献约束。
- **节点 7.1 代理链路**：浏览器 → PaperCrew Node 代理 → Semantic Scholar；固定上游与 fields、参数白名单、CORS 白名单、单实例限流、上游超时与客户端取消传播；S2 Key 只在服务端。
- **节点 7.1 Key 清理**：删除 `ApiSettings.semanticScholarApiKey`、设置页输入、ConfigService 写入与 Provider 传参；`settingsStore` 在 rehydrate 时删除旧 `papercrew.settings.v1.semanticScholarApiKey`。
- **节点 7.1 统计口径**：`totalMatched` / `totalFetched` / `totalReturned` + `queryStats`，覆盖成功、部分失败、全部失败、空结果。
- **节点 7.1 引用加固**：`[S2:paperId]` 确定性校验、一次结构修复、DOI 校验保留；程序生成参考文献并插入报告。
- 文献 UI：检索状态 / 时间 / 三类计数 / 查询 / warning、失败与空状态、REAL PAPER 与 SIMULATED 区分、缺失字段“暂无数据”、DOI / S2 / Open PDF 链接。
- 响应式三栏工作台 + 移动端视图切换；Markdown + GFM 表格 + KaTeX 报告渲染。
- Vitest + `node:test` 自动化测试（Mock Provider / Mock fetch，不消耗真实 API 额度）、TypeScript 严格类型检查、生产构建。

### 7.2 未实现（明确不在当前版本）

- **多源文献与全文**：只接入 Semantic Scholar Graph API；未接入 Crossref、arXiv、PDF 下载/解析、RAG、引用管理。
- **线上部署与运维**：代理实现存在但**没有线上实例**；真实文献检索需要先部署后端代理。多实例限流、缓存、指标与告警未实现。
- **流式输出**：当前为一次性请求完成后解析，不做 SSE/流式增量渲染。
- **会话持久化 / 历史记录 / 导出**：运行态只在内存；刷新即丢失；无运行历史列表、无导出。
- **多用户与账号体系**：无账号、无数据库；LLM Key 仍在前端明文使用。
- **并行模型 / 多轮辩论 / 动态 Agent 编排**：固定四个 Agent 串行；未实现并行调用、投票或递归规划。
- **自动重试策略**：网络/超时/5xx 不自动重试；只有 JSON 结构修复的一次机会；429 不循环重试。
- **路由与深链**：当前为单页无路由，以兼容静态托管。
- **E2E / 浏览器自动化测试、CI 流水线**：当前只包含 Vitest 与 `node:test` 单元/集成测试。

`src/features/`、`src/lib/`、`src/domain/session/`、`src/domain/pipeline/`、`src/domain/agent/prompts/`、`src/services/runner/`、`src/services/storage/`、`src/data/demo/cases/` 目前是预留目录（仅 `.gitkeep`），没有运行时代码。

---

## 8. 真实目录结构

```
PaperCrew/
├─ ARCHITECTURE.md              # 本文（单一事实源）
├─ README.md
├─ .env.example                 # 前端：VITE_SEMANTIC_SCHOLAR_PROXY_URL
├─ index.html
├─ package.json
├─ vite.config.ts               # @ 别名、base: './'
├─ vitest.config.ts             # node 环境、tests/**/*.test.ts
├─ tsconfig.json / tsconfig.app.json / tsconfig.node.json
├─ server/                      # Node 文献代理（无第三方依赖）
│  ├─ package.json              # start / dev / test / check
│  ├─ .env.example
│  ├─ README.md
│  ├─ src/
│  │  ├─ index.js               # createProxyServer / listen / 优雅退出
│  │  ├─ config/env.js          # PORT / Key / CORS / 超时 / 限流
│  │  ├─ routes/semanticScholar.js
│  │  └─ services/
│  │     ├─ semanticScholarClient.js
│  │     └─ rateLimiter.js
│  └─ tests/proxy.test.js       # 9 项代理测试（Mock fetch）
├─ public/
│  └─ data/
│     ├─ demo-medical.json      # 案例 A：小样本医学图像分割
│     └─ demo-multiagent.json   # 案例 B：多智能体协作科研求解
├─ tests/
│  ├─ engine/
│  │  ├─ engine.test.ts         # 状态机、编排、暂停/恢复、取消、重试、隔离（15 项）
│  │  ├─ live.test.ts           # Provider、生命周期、Prompt、LIVE 编排、文献工作流（27 项）
│  │  └─ synthesizerCitations.test.ts  # paperId 校验、程序参考文献、DOI 边界（7 项）
│  └─ literature/
│     └─ literature.test.ts     # 代理 Provider / Mapper / SearchService / 统计（23 项）
└─ src/
   ├─ main.tsx
   ├─ App.tsx                   # 外壳：Header / 三栏 / 设置弹窗 / 移动端切换
   ├─ styles/index.css          # Tailwind + 设计令牌 + 报告排版
   ├─ types/
   │  ├─ ui.ts                  # 运行状态、Tab、案例加载状态、ApiSettings
   │  ├─ agent.ts               # Agent ID/状态/模板输出类型
   │  ├─ research.ts            # 四种 Agent 输出结构
   │  ├─ session.ts             # DemoSession / RunSession / RunAgent
   │  └─ engine.ts              # AgentContext / AgentResult / AgentExecutor
   ├─ schemas/
   │  ├─ agentSchema.ts
   │  ├─ researchSchema.ts
   │  ├─ sessionSchema.ts       # DEMO 模板与跨字段校验
   │  └─ liveSchemas.ts         # LIVE 严格输出校验
   ├─ domain/
   │  ├─ brief.ts               # 研究课题 schema/工具
   │  ├─ agent/
   │  │  ├─ ids.ts              # AGENT_IDS 顺序
   │  │  ├─ definitions.ts      # 展示名称/描述/图标元数据
   │  │  └─ prompts/.gitkeep    # 预留
   │  ├─ session/.gitkeep       # 预留（运行态在 src/types + engine）
   │  └─ pipeline/.gitkeep      # 预留（Orchestrator 在 src/engine）
   ├─ data/
   │  ├─ index.ts               # 案例注册表与默认案例
   │  └─ demo/cases/.gitkeep    # 预留
   ├─ engine/
   │  ├─ agentExecutor.ts       # 对外类型出口
   │  ├─ stateMachine.ts
   │  ├─ playbackClock.ts
   │  ├─ orchestrator.ts
   │  ├─ demoPlayer.ts
   │  ├─ livePlayer.ts
   │  └─ taskController.ts
   ├─ agents/
   │  ├─ demoExecutor.ts
   │  ├─ llmExecutor.ts
   │  ├─ literatureResearcherExecutor.ts
   │  └─ synthesizerCitations.ts
   ├─ prompts/
   │  ├─ index.ts               # LIVE_PROMPTS 注册表
   │  ├─ promptUtils.ts         # topicBlock / upstreamJson
   │  ├─ plannerPrompt.ts
   │  ├─ researcherPrompt.ts
   │  ├─ reviewerPrompt.ts
   │  └─ synthesizerPrompt.ts
   ├─ services/
   │  ├─ demoDataService.ts
   │  ├─ config/configService.ts
   │  ├─ literature/
   │  │  ├─ semanticScholarTypes.ts
   │  │  ├─ semanticScholarProvider.ts
   │  │  ├─ semanticScholarMapper.ts
   │  │  ├─ literatureSearchService.ts
   │  │  └─ errors.ts
   │  ├─ llm/
   │  │  ├─ llmProvider.ts
   │  │  ├─ openAICompatibleProvider.ts
   │  │  ├─ llmConfig.ts
   │  │  ├─ errors.ts
   │  │  └─ responseParser.ts
   │  ├─ runner/.gitkeep        # 预留
   │  └─ storage/.gitkeep       # 预留
   ├─ store/
   │  ├─ sessionStore.ts
   │  ├─ settingsStore.ts
   │  └─ uiStore.ts
   ├─ components/
   │  ├─ layout/                # Header / MainWorkspace / WorkspacePanel / MobileViewSwitcher
   │  ├─ agents/                # AgentCard / AgentTimeline
   │  ├─ research/              # ResearchResults / Plan / Literature / Review / Report
   │  ├─ settings/              # ApiSettings
   │  └─ ui/                    # Panel
   ├─ features/                 # 预留（brief / sessions / pipeline / settings / artifacts）
   └─ lib/.gitkeep              # 预留
```

路径别名：`@/*` → `src/*`。构建使用 `base: './'`，可部署到任意子路径；当前不使用路由。

---

## 9. 测试与验证

| 命令 | 内容 |
| --- | --- |
| `npm run typecheck` | `tsc -b` 严格类型检查 |
| `npm test` | Vitest：15 项引擎/状态机/DEMO + 27 项 LIVE Provider/编排/文献工作流 + 7 项引用/参考文献 + 23 项代理 Provider/Mapper/SearchService/统计，共 72 项 |
| `npm run build` | 类型检查 + Vite 生产构建（输出 `dist/`） |
| `cd server && npm test` | `node:test`：9 项代理测试（Mock fetch） |
| `cd server && npm run check` | 代理源码 `node --check` |

所有测试使用 Mock Provider / Mock `fetch`，不访问真实 API、不消耗额度。覆盖范围包括：正常 LLM 请求；响应体读取阶段超时；响应体读取阶段取消（且不被误报为超时）；401/403/404/429/500/503 映射；错误体阻塞时仍返回原 HTTP 错误；超时定时器与外部 abort 监听器清理；LIVE 超时导致 Agent 与 Session 失败且不产生 fallback。

代理 Provider / 检索覆盖：代理 URL、query / limit、无 Key；无效 limit；代理未配置；401/403、400、404/405、429、504、5xx、网络、非法 JSON、超时、取消；Mapper 正常与缺失字段（abstract、venue、DOI、authors、year）不补全；paperId / title 缺失时丢弃；两组关键词参与检索；合并去重；最多 8 篇且跨查询轮询；空结果；全部失败返回 `failed` 且不生成模拟文献；部分失败保留其他结果并写 warning；API 匹配数 / 实际返回数 / 去重保留数三者不同；每查询统计；Researcher 注入真实文献并被 Reviewer / Synthesizer 读取；S2 失败不伪造；Session 取消会中止检索；DEMO 15 项测试保持通过。

引用与参考文献覆盖：已知 paperId 通过；未知 paperId 一次修复后仍失败；空文献集合禁止 S2 引用；无 DOI / 无链接写“暂无数据”；稀疏元数据不补作者 / DOI；编造 DOI 被拒绝；参考文献块插入 `## 4.` 之前。

代理后端覆盖：正常转发（固定上游 URL、fields、服务端 Key）；缺失 query、空 query、超长 query；非法 limit；拒绝 `url` / `apiKey` 等额外参数；上游 400 / 401 / 403 / 429 / 5xx 状态与错误码；网络失败 502；上游超时 504；客户端断开 abort 上游；CORS 精确来源与拒绝 `*`；方法限制 405；拒绝 GET 请求体；限流 429 + `Retry-After`；Key 不写日志、不出现在响应；不允许任意 URL 转发。

浏览器实测（2026-11-19，本地真实代理，非 Mock）：DEMO 案例完整运行 4/4 Agent 并正确渲染 9 章节报告；API Settings 不再包含 Semantic Scholar Key 输入，人工写入旧 `semanticScholarApiKey` 后刷新会被清理；在页面上下文直接 `fetch` 本地代理，跨域成功并返回 HTTP 200 与真实论文数据；随后通过页面动态加载的 `SemanticScholarApiProvider` 再次请求，命中上游匿名 429 并被正确映射为 `LiteratureRateLimitError`。LIVE 端到端未执行：当前环境没有可用的 LLM 凭据。仓库没有线上部署，Mock 测试不代表生产 API 成功。
