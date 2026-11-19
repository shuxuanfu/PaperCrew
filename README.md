# PaperCrew

多智能体论文拆解与科研推演沙盘。四个 Agent（Planner → Researcher → Reviewer → Synthesizer）将研究课题转化为研究问题、文献证据、缺陷评审与科研报告。

当前阶段：**阶段 7.1 · Semantic Scholar 生产环境接入与引用加固**（浏览器只访问 PaperCrew 后端代理，Semantic Scholar Key 只存在于后端；Researcher 统计口径拆分为 API 匹配数 / 实际返回数 / 最终保留数；Synthesizer 只能使用 `[S2:paperId]` 引用真实文献，参考文献由程序生成；DEMO 模式保持不变）。

## 核心功能

- 将一句话研究课题拆解为 3 个研究问题与 2 组英文检索关键词
- 产出检索策略、关键词组合、研究空白与后续方向
- LIVE 模式通过 PaperCrew 后端代理访问 Semantic Scholar Graph API 检索真实论文，自动合并两组 Planner 关键词与 Researcher 检索计划，去重后最多保留 8 篇
- 文献元数据（标题、作者、年份、发表渠道、摘要、DOI、链接、引用数、Open PDF）只来自 API，缺失字段显示“暂无数据”，不由模型补全
- 检索统计拆分为 **API 匹配总数 / 每查询实际返回数 / 最终去重保留数**，避免把 `total` 与 `papers.length` 混为一谈
- 对研究计划与真实文献做结构化评审，输出 3 条带严重度与分类的修改意见
- 汇总上游结果，生成含 Evidence / Hypothesis / Proposal 与公式的 9 章节 Markdown 研究报告；正文只能使用 `[S2:paperId]` 引用 Researcher 真实集合，参考文献由程序根据文献元数据生成
- 四 Agent 串行编排，支持开始、暂停、恢复、取消、失败重试与整案重启
- DEMO 本地回放与 LIVE 真实模型调用共用同一状态机、编排器与结果视图
- 所有 Agent 输出经 Zod 严格校验；LIVE 失败明确标记，不回退、不造假

## 四个 Agent

| Agent | 职责 | 输入 | 输出 |
| --- | --- | --- | --- |
| Planner | 把课题转化为可执行的研究问题与检索策略 | 研究课题（+ 可选补充说明） | 3 个研究问题（q1–q3）、2 组英文检索关键词（kw1–kw2） |
| Researcher | 制定检索计划并获取真实文献（LIVE） | 课题 + Planner 输出 | 检索计划（策略、关键词组、研究空白、后续方向）+ Semantic Scholar 真实论文（最多 8 篇） |
| Reviewer | 评审计划与真实证据的可行性、创新性与严谨性 | 课题 + Planner + Researcher 输出 | 3 条评审意见（类别、严重度、问题、影响、建议、关联问题） |
| Synthesizer | 汇总全部上游结果，撰写科研报告 | 课题 + Planner + Researcher + Reviewer 输出 | 9 章节 Markdown 报告（含 Evidence / Hypothesis / Proposal 与 KaTeX 公式；只引用真实文献） |

## 两种运行模式

| 模式 | 数据来源 | 是否需要 API | 行为 |
| --- | --- | --- | --- |
| **DEMO** | `public/data/*.json` 本地案例 | 否 | 按 `durationMs` 回放时间线与输出，数据经 Zod 校验；适合快速体验与演示 |
| **LIVE** | 浏览器直连 OpenAI-compatible API；文献经 PaperCrew 后端代理访问 Semantic Scholar | 是（LLM Key + 文献代理） | 串行调用四个 Agent；Researcher 先由模型生成检索计划，再检索真实论文并注入下游；请求失败直接标记失败，**绝不自动切换到 DEMO** |

LIVE 模式下 Researcher 的 `literature` 只能来自 Semantic Scholar API：标题、作者、年份、发表渠道、摘要、DOI、URL、Open PDF、引用数均按 API 原值映射，缺失字段保持 `null` / 空数组，模型不得补全。Semantic Scholar 失败或返回空结果时，结果页明确显示失败 / 空状态，**不会用模拟文献替代**。Reviewer 与 Synthesizer 只能读取 Researcher 的真实文献集合；Synthesizer 若使用集合外的 `[S2:paperId]` 或集合外 DOI，会被跨 Agent 校验拒绝。

LIVE 的 LLM 请求使用单个 `AbortController` 覆盖完整生命周期（fetch → 读取响应体 → JSON 解析 → 内容提取）；文献代理请求复用同一会话取消信号，前端取消会同时中止代理的上游请求。超时与外部取消在整个生命周期内有效；非 2xx 时直接按 HTTP 状态报错，错误体不会覆盖原始状态，也不会阻塞错误返回。

> **CORS / 生产部署**：浏览器不再直连 `api.semanticscholar.org`，而是调用 `GET {VITE_SEMANTIC_SCHOLAR_PROXY_URL}/api/semantic-scholar/search`。代理以精确来源白名单返回 CORS 头，Key 只在服务端环境变量中。**当前仓库没有线上部署实例；需要部署后端代理后才能在生产环境使用真实文献检索。** 本地开发按下方“本地开发（前后端）”启动即可。


## 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | React 19.3 + TypeScript 7.0 |
| 构建 | Vite 8.3 |
| 样式 | Tailwind CSS 4.3（`@tailwindcss/vite`，无 `tailwind.config.js`） |
| 状态 | Zustand 5.1 |
| 动效 | Framer Motion 14.14 |
| 数据校验 | Zod 4.6 |
| Markdown | React Markdown 10.1 + remark-gfm + remark-math |
| 公式 | KaTeX 0.16（`rehype-katex` 要求 `^0.16`） |
| 图标 | Lucide React 1.75 |

## 快速开始

要求 Node.js **≥ 20.19**（Vite 8 要求）。

### 方式 A：系统已安装 Node

```bash
npm install
npm run dev
```

浏览器访问 `http://localhost:5173`。

### 方式 B：使用项目内便携 Node（当前机器）

当前系统 PATH 中没有 Node，项目内已放置便携版（`.tools/node-v24.22.3-win-x64`，不纳入版本控制）。

PowerShell：

```powershell
$env:Path = "D:\PaperCrew\.tools\node-v24.22.3-win-x64;$env:Path"
npm install
npm run dev
```

CMD：

```bat
set PATH=D:\PaperCrew\.tools\node-v24.22.3-win-x64;%PATH%
npm install
npm run dev
```

> 换机器或分享项目时，请按方式 A 安装 Node；`.tools/` 仅供本机使用。

## 本地开发（前后端）

LIVE 真实文献检索需要同时启动后端代理（`server/`，仅使用 Node 内置模块，无第三方依赖）：

```bash
# 终端 1：文献代理（默认 8787）
cd server
cp .env.example .env        # 可选：填入 SEMANTIC_SCHOLAR_API_KEY
node --env-file=.env src/index.js

# 终端 2：前端（默认 5173）
cp .env.example .env        # 已包含 VITE_SEMANTIC_SCHOLAR_PROXY_URL=http://127.0.0.1:8787
npm run dev
```

- 前端环境变量：`VITE_SEMANTIC_SCHOLAR_PROXY_URL`，只配置代理地址，不含任何 Key。
- 后端环境变量：`PORT`（默认 8787）、`SEMANTIC_SCHOLAR_API_KEY`（可选，只放 `x-api-key`）、`CORS_ALLOWED_ORIGINS`（生产必填，拒绝 `*`）、`SEMANTIC_SCHOLAR_TIMEOUT_MS`、`RATE_LIMIT_MAX`、`RATE_LIMIT_WINDOW_MS`。
- 代理接口固定为 `GET /api/semantic-scholar/search?query=...&limit=1-10`；上游地址与 fields 固定，不接受 `url`、`fields`、`apiKey` 等其他参数，避免被当作任意 URL 转发器。
- 内存限流按单实例、单 IP 生效（默认 60 次 / 60 秒）；多实例部署需改用共享限流或网关限流。
- 未配置代理地址时，LIVE 检索会直接提示配置缺失，不会静默模拟文献。
- 完整接口与环境变量说明见 [server/README.md](./server/README.md)。

## 生产部署

前端仍是静态站点，文献代理必须单独部署到支持 Node.js ≥ 20.19 的环境：

1. 部署 `server/`，设置 `NODE_ENV=production`、`PORT`、`SEMANTIC_SCHOLAR_API_KEY`，并将 `CORS_ALLOWED_ORIGINS` 设为前端实际来源（例如 `https://papercrew.example.com`，必须精确匹配，不能使用 `*`）。
2. 构建前端时设置 `VITE_SEMANTIC_SCHOLAR_PROXY_URL=https://<后端代理域名>`，再执行 `npm run build`。
3. 如果代理与前端不同域，确认反向代理透传 `Origin`，且未改写或剥离 CORS 头。

> 当前仓库未提供线上部署地址，也未验证任何线上实例。**需要部署后端代理后才能在生产环境使用真实文献检索**；未部署时只有 DEMO 模式和 LLM 请求（不含文献）可用。

## LIVE 模式 API 配置

1. 启动应用后，点击页头右上角的 **API Settings**。
2. 填写并保存以下字段：
   - **Base URL**：OpenAI-compatible 服务地址，例如 `https://api.openai.com/v1`（程序会自动补全或去重 `/chat/completions`）
   - **API Key**：密码输入框，支持显示 / 隐藏；仅保存在浏览器 `localStorage`
   - **Model Name**：例如 `gpt-4o-mini`，需与服务商支持的模型一致
   - **Temperature**：0–2，默认 `0.2`
   - **Max Tokens**：整数，256–32000，默认 `4096`
   - **JSON Mode**：仅在服务商支持 `response_format: { "type": "json_object" }` 时开启
3. 点击 **Test Connection** 发送一条最小请求验证连通性；保存前会检查配置完整性与取值范围。
4. 在页头切换 **DEMO / LIVE**，然后点击 **Start LIVE Run**。配置不完整时不会发起请求，界面会列出缺失字段。

> **密钥边界**：LLM API Key 仍只在浏览器中使用（`localStorage` 明文，仅适合个人开发 / 可信环境）。Semantic Scholar API Key **不再由浏览器保存或发送**，只存在于后端代理的 `SEMANTIC_SCHOLAR_API_KEY` 环境变量中；设置页已移除该字段，旧版本可能残留在 `localStorage` 中的值会在启动时自动清理。公开部署时，LLM Key 仍建议通过后端转发保护。

**请求链路（LLM）**：`TaskController → Orchestrator → LLMExecutor → OpenAICompatibleProvider → {BaseURL}/chat/completions → 读取响应体 → JSON 解析 → Zod 校验 → 下一 Agent`。每个 Agent 失败后最多发起一次“仅修结构”的修复请求，仍失败则整次运行标记失败，不消耗额度重试，也不回退 DEMO。

**请求链路（文献）**：`TaskController → LiteratureResearcherExecutor → LiteratureSearchService → SemanticScholarApiProvider → GET {VITE_SEMANTIC_SCHOLAR_PROXY_URL}/api/semantic-scholar/search → PaperCrew Node 代理 → api.semanticscholar.org/graph/v1/paper/search`。Planner 两组关键词优先，Researcher 的 `retrievalPlan.keywordGroups` 补充；每个查询单独请求、合并去重后最多 8 篇。单查询失败会记录 warning 并继续，全部失败则 `retrieval.status = failed`，不生成任何模拟论文；取消 Session 会通过同一 `AbortSignal` 终止前端请求，代理检测到客户端断开后中止上游请求。

## Semantic Scholar 检索细节

- 后端代理固定上游 `https://api.semanticscholar.org/graph/v1/paper/search`；固定请求字段：`paperId,title,authors,year,venue,abstract,url,externalIds,publicationTypes,openAccessPdf,citationCount,referenceCount,fieldsOfStudy`
- 每查询 `limit=5`、最多 4 个查询；按查询轮询合并，按 `paperId` 去重，最终最多 8 篇
- 统计口径：
  - **API 匹配总数 `totalMatched`**：各查询上游 `total` 之和，可能包含跨查询重复，不等于实际返回数
  - **实际返回数 `totalFetched`**：各查询从 `data` 中实际取回的论文数之和，去重前
  - **最终保留数 `totalReturned`**：按 `paperId` 去重并截断到 8 篇后的数量
  - 每个查询的 `queryStats` 记录 `status`、`totalMatched`、`totalFetched`
- DOI 只取 `externalIds.DOI`，URL / Open PDF 只接受 API 返回的 http(s) 链接；缺失时不猜测
- 结果页显示检索状态、时间、API 匹配总数、实际返回数、最终保留数、耗时、实际查询词、warning，并区分 REAL PAPER / SIMULATED
- **引用规则**：Synthesizer 正文只能使用 `[S2:<paperId>]` 引用 Researcher 真实集合中的文献。未知 paperId 会触发一次结构修复，修复后仍未知则整次运行失败；DOI 校验继续保留。文末参考文献由程序插入到“相关研究与证据”末尾（`## 4.` 之前），标题为“参考文献（由程序根据 Semantic Scholar 数据生成）”，缺失字段写“暂无数据”，模型不得自行编写文献元数据
- 错误分类：网络 / 代理未配置、400、401/403、404/405、429、5xx、504（上游超时）、非法 JSON、超时、取消；任何 Key 都不出现在浏览器请求、日志或错误信息中

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | Vitest：状态机、执行、暂停/恢复、取消、重试、隔离、Provider / 请求生命周期 / Prompt 校验 / LIVE 编排 / Semantic Scholar Provider / Mapper / 检索服务 / 文献工作流 / `[S2:paperId]` 引用与程序参考文献等 72 项测试（全部使用 Mock Provider / Mock fetch，不消耗 API 额度） |
| `npm run build` | 类型检查 + 生产构建，输出到 `dist/` |
| `npm run preview` | 本地预览生产构建 |
| `cd server && npm test` | 代理测试：正常转发、参数校验、上游 400/401/403/429/5xx、网络、超时、客户端取消、CORS、方法/请求体限制、限流、Key 不入日志、固定上游（9 项，Mock fetch） |
| `cd server && npm run check` | 代理源码语法检查 |

## 目录结构

```
PaperCrew/
├─ ARCHITECTURE.md          # 架构设计（单一事实源）
├─ .env.example             # 前端：VITE_SEMANTIC_SCHOLAR_PROXY_URL
├─ index.html
├─ vite.config.ts           # 插件、@ 别名、base: './'
├─ vitest.config.ts         # Node 环境 + @ 别名
├─ tests/engine/            # 引擎、状态机与 LIVE Provider / LLMExecutor / 文献工作流 / 引用校验测试
├─ tests/literature/        # Semantic Scholar Provider、Mapper、检索服务测试
├─ server/                  # Node 后端代理（无依赖）
│  ├─ src/config/env.js     # PORT / Key / CORS / 超时 / 限流配置
│  ├─ src/services/semanticScholarClient.js  # 固定上游与字段、超时/取消、错误映射
│  ├─ src/services/rateLimiter.js            # 单实例内存限流
│  ├─ src/routes/semanticScholar.js          # 参数校验、CORS、取消传播
│  ├─ src/index.js          # HTTP Server 与优雅退出
│  ├─ tests/proxy.test.js   # 9 项代理测试（Mock fetch）
│  └─ README.md             # 接口、环境变量、部署边界
├─ tsconfig*.json
├─ public/data/
│  ├─ demo-medical.json     # 案例 A：小样本医学图像分割
│  └─ demo-multiagent.json  # 案例 B：多智能体协作科研求解
└─ src/
   ├─ App.tsx               # 应用外壳：Header / 视图切换 / 工作台 / 设置弹窗
   ├─ main.tsx
   ├─ styles/index.css      # Tailwind + 浅色设计令牌 + 报告排版
   ├─ types/                # ui.ts + 由 Schema 推导的 agent / research / session 类型
   ├─ schemas/              # Zod：agentSchema / researchSchema / sessionSchema / liveSchemas
   ├─ data/index.ts         # Demo 案例注册表（ID、文件名、标题、默认 topic）
   ├─ components/
   │  ├─ layout/            # Header、三栏容器、Workspace、移动端视图切换
   │  ├─ agents/            # Agent 卡片与时间线
   │  ├─ research/          # 研究计划 / 文献与检索计划 / 评审 / 最终报告
   │  ├─ settings/          # API Settings 弹窗（含连接测试，不再含 S2 Key）
   │  └─ ui/                # 无业务语义的展示原语（Panel）
   ├─ store/                # Zustand：settingsStore（含旧 S2 Key 清理）、uiStore、sessionStore
   ├─ engine/               # 状态机、Orchestrator、PlaybackClock、DemoPlayer、LivePlayer、TaskController
   ├─ agents/               # DemoExecutor、LLMExecutor（引用校验）、LiteratureResearcherExecutor、synthesizerCitations
   ├─ prompts/              # Planner / Researcher / Reviewer / Synthesizer 的 LIVE Prompt 与注册表
   ├─ services/
   │  ├─ demoDataService.ts # listDemoSessions / loadDemoSession / validateDemoSession
   │  ├─ config/            # ConfigService：LLM 配置读取、校验、连接测试
   │  ├─ literature/        # 代理 Provider / Mapper / SearchService / 统计类型 / errors
   │  └─ llm/               # llmProvider / openAICompatibleProvider / llmConfig / responseParser / errors
   ├─ domain/               # 纯 TS + Zod，零 React 依赖
   │  ├─ brief.ts           # 研究课题 Schema
   │  ├─ agent/             # Agent id 顺序与展示定义
   │  ├─ session/           # 预留目录（运行态类型在 types/session.ts）
   │  └─ pipeline/          # 预留目录（Orchestrator 在 engine/）
   ├─ features/             # 预留目录（尚未实现功能）
   └─ lib/                  # 预留目录（暂无工具函数）
```

路径别名：`@/*` → `src/*`（Vite 与 TypeScript 同步配置；TS 7 已移除 `baseUrl`，仅使用 `paths`）。

## 实现进度

### 阶段 7.1：Semantic Scholar 生产环境接入与引用可靠性加固

- 新增 `server/` Node 代理：浏览器不再直连 Semantic Scholar；代理固定上游 URL 与 fields，只接受 `query` / `limit`，拒绝 `url`、`fields`、`apiKey` 等参数，避免 SSRF 与任意转发
- Key 只存在于后端 `SEMANTIC_SCHOLAR_API_KEY`，通过 `x-api-key` 发送；不返回前端、不写日志、不进入错误信息。前端删除 S2 Key 配置、配置服务写入与 UI 输入，并在持久化恢复时清理旧字段
- CORS 使用精确来源白名单（拒绝 `*`，开发环境默认 localhost / 127.0.0.1:5173）；支持 `OPTIONS` 预检、`405`、拒绝 GET 请求体、单实例内存限流（默认 60 次 / 60 秒）
- 代理检测客户端断开（`req.aborted` / `res.close`）后中止上游请求；上游超时（默认 15 秒）与取消分别映射为 `504 upstream_timeout` 与不返回响应
- `SemanticScholarApiProvider` 保持接口不变，改为调用 `VITE_SEMANTIC_SCHOLAR_PROXY_URL`；未配置、协议错误、CORS/网络失败、401/403、429、504、5xx 分别映射为现有 `Literature*Error`，错误提示指向后端配置
- 统计口径拆分：`totalMatched`（上游 `total` 之和，可能跨查询重复）、`totalFetched`（实际取回数之和）、`totalReturned`（去重截断后保留数）；新增每查询 `queryStats`；结果页与 Researcher 摘要同步展示
- Synthesizer 引用改为确定性 `[S2:paperId]`：每次校验 paperId 是否属于 Researcher 真实集合；未知 ID 先触发一次结构修复，仍失败则整次运行失败。参考文献块由 `synthesizerCitations.ts` 根据文献元数据生成，插入到“相关研究与证据”末尾（`## 4.` 之前），缺失字段写“暂无数据”
- 新增 7 项引用 / 参考文献测试与 9 项后端代理测试，并更新 Provider、检索服务与 LIVE 工作流测试以适配代理与统计口径；前端 72 项、后端 9 项全部使用 Mock，不消耗真实 API 额度
- 当前没有线上部署；真实文献检索需要本地或生产后端代理。**需要部署后端代理后才能在生产环境使用真实文献检索。**
- 本地浏览器实测：DEMO 4/4 完成并渲染报告；设置页无 S2 Key 字段且旧值会被清理；页面直接请求本地代理获得 HTTP 200 真实论文数据（匿名额度随后触发的 429 也能正确映射）。LIVE 端到端因缺少 LLM 凭据未执行。

### 阶段七：Semantic Scholar 真实文献检索（已被 7.1 取代的关键部分）

- 新增 `src/services/literature/`：`SemanticScholarApiProvider`、字段映射 Mapper、`LiteratureSearchService`、分级错误类型；组件层不直接发起文献请求
- 原始实现为浏览器直连 Graph API，并曾在设置页提供 Semantic Scholar Key；7.1 已将请求迁移到后端代理并删除浏览器 Key（详见上一节）
- `LiteratureSearchService` 使用 Planner 两组关键词 + Researcher 检索计划，最多 4 个查询独立执行；合并去重后最多 8 篇；单查询失败保留其他结果并写入 warning，全部失败返回 `failed` 且文献为空
- `LiteratureResearcherExecutor` 装饰器保持 `AgentExecutor` / Orchestrator 结构不变：LLM 只生成检索计划，Semantic Scholar 提供真实文献，合并后的输出经 `liveResearcherFinalSchema` 校验（最多 8 篇、id 唯一、全部 `sourceType: 'real'`、关联问题必须存在）
- Reviewer 与 Synthesizer Prompt 只读取真实文献；`LLMExecutor` 增加跨 Agent 校验，拒绝 Synthesizer 引用 Researcher 集合外的 DOI（7.1 追加 `[S2:paperId]` 校验与程序参考文献）
- Literature UI 展示检索状态、时间、三类计数、耗时、实际查询、warning、失败 / 空状态；真实文献展示作者、年份、发表渠道、摘要、DOI、Semantic Scholar 来源、Open PDF、引用数、关联问题，缺失字段显示“暂无数据”

### 阶段六：LIVE 收尾

- 统一 `LLMProvider` 接口与 `OpenAICompatibleProvider`：POST `{BaseURL}/chat/completions`，自动处理 `/v1` 与完整路径，避免 `/v1/v1`
- `ConfigService` 封装配置读写：Base URL / API Key / Model Name / Temperature / Max Tokens / JSON mode，保存前校验、支持连接测试与删除
- 四个独立 Prompt（Planner / Researcher / Reviewer / Synthesizer），明确 Role、Goal、Input、Output Schema 与约束，只输出 JSON
- `LLMExecutor` 实现与 `DemoExecutor` 相同的 `AgentExecutor` 接口：真实上游输出注入、JSON 解析、Zod 严格校验、最多一次结构修复
- LIVE 会话由 `LivePlayer` 创建，`TaskController.startLive` 串行调用四个 Agent；DEMO / LIVE 共用 Orchestrator 与状态机
- 超时与取消（AbortSignal）覆盖完整请求生命周期：fetch、响应体读取、JSON 解析与内容提取共用一个 `AbortController`；非 2xx 时按 HTTP 状态报错，错误体不会覆盖原状态；完成后统一清理定时器与 abort 监听器
- 错误分级：认证 / 地址 / 模型 / 限流 / 5xx / 网络 / 超时 / 解析 / 校验，均返回可读中文提示，不暴露 Header 或密钥
- LIVE 启动前检查配置完整性；模型请求失败直接标记失败，**绝不静默回退 DEMO**

### 阶段五：多智能体执行引擎

- Agent 状态机（idle / pending / running / completed / failed / fallback / skipped）与 Session 状态机（created / running / paused / completed / failed / cancelled），非法转换抛错
- Orchestrator 串行调度 Planner → Researcher → Reviewer → Synthesizer，上游输出作为下游输入，事件驱动时间线；执行器通过 `AgentExecutor` 接口注入
- DemoPlayer 从只读模板创建独立运行 Session，按 `durationMs` 回放事件与输出；最终结果与 JSON 完全一致
- TaskController 支持 Start / Pause / Resume / Cancel / Retry / Restart；重试只重跑失败 Agent，Restart 新建 Session；generation 计数隔离旧异步任务
- Session Store 只持有运行态并转发控制命令，执行逻辑保留在 Engine 层；案例切换会取消旧运行并隔离旧事件
- 结果页随着 Agent 完成逐步解锁；完成或失败 / 取消均有状态提示，失败可一键重试
- Vitest 覆盖 15 项引擎 / DEMO 测试；截至阶段 7.1，前端总计 72 项，`npm run typecheck`、`npm test`、`npm run build` 均通过

### 阶段四：Demo 数据系统

- 两套完整 Demo 案例（医学图像分割 / 多智能体协作），覆盖 Planner 3 个研究问题与 2 组检索关键词、Researcher 5 条线索、Reviewer 3 条评审、Synthesizer 9 章节报告
- 本地 JSON 经 Zod 严格校验：字段完整性、跨字段一致性（Agent 输出与会话集合相等）、事件顺序、时间戳与报告章节
- `DemoDataService` 统一负责加载 / 列表 / 校验；组件不直接 `fetch`，失败返回可读错误并支持重试
- Quick Start 切换案例时同步 topic、时间线、结果视图；文献区分 REAL PAPER 与 SIMULATED（模拟线索不提供 DOI / 链接）
- Final Report 使用 Markdown + GFM 表格 + KaTeX 渲染；模拟流水线按 JSON 中的 `durationMs` 推进
- 保留三栏工作台、响应式断点与既有视觉设计

### 阶段三：工作台与设置

Apple 风格三栏工作台、四 Agent 时间线、模拟运行控制、四个结果标签页、API Settings 弹窗。

### 尚未实现

- Session 持久化 / 历史记录与运行导出
- 流式输出、并行模型、多源文献库、PDF 全文解析 / RAG、引用管理
- 代理的生产部署与运维：仓库内只有可部署实现，没有线上实例；多实例限流需引入共享存储或网关限流
- 代理级自动重试、请求缓存与可观测性（日志聚合 / 指标）
- 账号体系、数据库、CI / E2E 浏览器自动化

## 技术备注

- **静态部署**：`vite.config.ts` 使用 `base: './'`，产物可部署在任意子路径；v1 不使用路由，避免静态托管深链 404。
- **包体**：当前主 chunk 约 1,031 kB（KaTeX + Markdown 未拆分），后续阶段可按结果页做动态 `import()`。
- **KaTeX 版本**：固定 0.16.x 以匹配 `rehype-katex@7` 的 `^0.16.0` 依赖，避免双份 KaTeX 样式错配。
- **数据来源**：两套案例中仅 U-Net 与 AutoGen 两条线索标记为 REAL PAPER，DOI / 链接可核验；其余文献均为模拟研究线索，不提供 DOI 或链接。案例 JSON 通过 `import.meta.env.BASE_URL` 加载，兼容 `base: './'` 的静态部署。
- **校验入口**：`validateDemoSession` 基于 Zod `safeParse` 返回可读问题列表；加载失败时 Workspace / Process / Results 均显示错误与重试按钮，不会静默显示空数据。
- **API Key**：LLM Key 保存在浏览器 `localStorage` 明文，无服务端存储或加密，仅建议用于个人开发与可信环境演示；它只通过 `ConfigService` 读取并放入 `Authorization` 头。Semantic Scholar Key 只存在于后端 `SEMANTIC_SCHOLAR_API_KEY`，由代理放入 `x-api-key`，不返回前端、不写日志、不进入错误信息，也不作为查询参数。旧版本残留在 `localStorage` 的 S2 Key 会在 settings 恢复时删除。
- **请求生命周期**：`OpenAICompatibleProvider` 用单个 `AbortController` 覆盖 fetch、响应体读取、JSON 解析与内容提取；超时与外部取消在完整生命周期内有效，外部取消优先于超时判定；非 2xx 时立即取消并丢弃错误体，原始 HTTP 状态错误优先；超时定时器与 abort 监听器只在 `finally` 中统一清理。`SemanticScholarApiProvider` 对代理请求复用同一模式；代理端另有独立的上游超时（默认 15 秒）并把客户端断开转发为上游 abort。
- **LIVE 失败语义**：模型请求失败、JSON 解析失败或 Zod 校验失败都会让当前 Agent 与 Session 进入 failed；最多自动发起一次“仅修结构”的修复请求，之后不再重试，也不会回退到 DEMO 数据。文献检索失败不会伪造论文，也不会静默切换 DEMO：Researcher 仍产出检索计划与 `retrieval.status = failed`，结果页明确显示失败。
- **文献边界**：LIVE 的文献元数据只能来自 Semantic Scholar；Mapper 不填缺失字段、不生成 DOI / 链接，`relatedQuestionIds` 默认留空。模型只负责检索计划，输出 `literature` 必须为空；合并后的真实文献由装饰器注入并再次校验。DEMO 的模拟线索继续带 `SIMULATED` 标签，不提供 DOI / 链接。
- **引用与参考文献**：Synthesizer 正文只允许 `[S2:<paperId>]`。`extractS2PaperIds()` 提取引用，`citationIssues()` 对照 Researcher 集合；未知 ID 走一次结构修复，随后仍未知则失败。`buildProgrammaticReferences()` / `appendProgrammaticReferences()` 只用文献字段拼装参考文献块（作者、年份、渠道、DOI、S2 / Open PDF 链接，缺失写“暂无数据”），插入到 `## 4. 研究假设` 之前；模型不参与参考文献元数据生成。
- **代理边界**：代理只接受 GET 与白名单参数，固定上游地址和 fields，不转发任意 URL；CORS 精确匹配来源，拒绝 `*`；限流为单实例内存实现，重启后清零，多实例之间不共享。

## 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md)
