# PaperCrew

多智能体论文拆解与科研推演沙盘。四个 Agent（Planner → Researcher → Reviewer → Synthesizer）将研究课题转化为研究问题、文献证据、缺陷评审与科研报告。

当前阶段：**阶段六收尾 · LIVE 模式与真实 LLM Agent 接入**（OpenAI-compatible Provider、ConfigService、四个 Agent Prompt、LLMExecutor、LIVE 会话与 Zod 校验；请求全生命周期超时/取消已修复；DEMO 模式保持不变）。

## 核心功能

- 将一句话研究课题拆解为 3 个研究问题与 2 组英文检索关键词
- 产出检索策略、关键词组合、研究空白与后续方向（不生成虚构文献）
- 对研究计划与证据做结构化评审，输出 3 条带严重度与分类的修改意见
- 汇总上游结果，生成含 Evidence / Hypothesis / Proposal 与公式的 9 章节 Markdown 研究报告
- 四 Agent 串行编排，支持开始、暂停、恢复、取消、失败重试与整案重启
- DEMO 本地回放与 LIVE 真实模型调用共用同一状态机、编排器与结果视图
- 所有 Agent 输出经 Zod 严格校验；LIVE 失败明确标记，不回退、不造假

## 四个 Agent

| Agent | 职责 | 输入 | 输出 |
| --- | --- | --- | --- |
| Planner | 把课题转化为可执行的研究问题与检索策略 | 研究课题（+ 可选补充说明） | 3 个研究问题（q1–q3）、2 组英文检索关键词（kw1–kw2） |
| Researcher | 制定文献检索计划，不访问真实文献库 | 课题 + Planner 输出 | **检索计划**（策略、关键词组、研究空白、后续方向）；LIVE 下 `literature` 固定为空数组 |
| Reviewer | 评审计划与证据的可行性、创新性与严谨性 | 课题 + Planner + Researcher 输出 | 3 条评审意见（类别、严重度、问题、影响、建议、关联问题） |
| Synthesizer | 汇总全部上游结果，撰写科研报告 | 课题 + Planner + Researcher + Reviewer 输出 | 9 章节 Markdown 报告（含 Evidence / Hypothesis / Proposal 与 KaTeX 公式） |

## 两种运行模式

| 模式 | 数据来源 | 是否需要 API | 行为 |
| --- | --- | --- | --- |
| **DEMO** | `public/data/*.json` 本地案例 | 否 | 按 `durationMs` 回放时间线与输出，数据经 Zod 校验；适合快速体验与演示 |
| **LIVE** | 浏览器直连 OpenAI-compatible API | 是 | 串行调用四个 Agent，真实解析与校验模型输出；超时/取消覆盖 fetch 与响应体读取；请求失败直接标记失败，**绝不自动切换到 DEMO** |

LIVE 模式下 Researcher 不会伪造论文标题、作者、DOI 或链接；当前未接入真实文献检索，结果页展示的是模型生成的检索计划，并明确标注尚未核实。

LIVE 请求使用单个 `AbortController` 覆盖完整生命周期（fetch → 读取响应体 → JSON 解析 → 内容提取）。超时与外部取消在整个生命周期内有效；非 2xx 时直接按 HTTP 状态报错，错误体不会覆盖原始状态，也不会阻塞错误返回。


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

> **安全提示**：API Key 将在浏览器环境中使用，localStorage 不是安全密钥存储。仅建议用于个人开发和可信环境下的演示。公开部署应通过后端代理保护密钥。

**请求链路**：`TaskController → Orchestrator → LLMExecutor → OpenAICompatibleProvider → {BaseURL}/chat/completions → 读取响应体 → JSON 解析 → Zod 校验 → 下一 Agent`。每个 Agent 失败后最多发起一次“仅修结构”的修复请求，仍失败则整次运行标记失败，不消耗额度重试，也不回退 DEMO。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | Vitest：状态机、执行、暂停/恢复、取消、重试、隔离，以及 Provider / 请求生命周期 / Prompt 校验 / LIVE 编排等 38 项测试（全部使用 Mock Provider / Mock fetch，不消耗 API 额度） |
| `npm run build` | 类型检查 + 生产构建，输出到 `dist/` |
| `npm run preview` | 本地预览生产构建 |

## 目录结构

```
PaperCrew/
├─ ARCHITECTURE.md          # 架构设计（单一事实源）
├─ index.html
├─ vite.config.ts           # 插件、@ 别名、base: './'
├─ vitest.config.ts         # Node 环境 + @ 别名
├─ tests/engine/            # 引擎、状态机与 LIVE Provider / LLMExecutor 测试
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
   │  ├─ settings/          # API Settings 弹窗（含连接测试）
   │  └─ ui/                # 无业务语义的展示原语（Panel）
   ├─ store/                # Zustand：settingsStore、uiStore（视图/案例）、sessionStore（运行态）
   ├─ engine/               # 状态机、Orchestrator、PlaybackClock、DemoPlayer、LivePlayer、TaskController
   ├─ agents/               # DemoExecutor（本地回放）与 LLMExecutor（真实模型调用）
   ├─ prompts/              # Planner / Researcher / Reviewer / Synthesizer 的 LIVE Prompt 与注册表
   ├─ services/
   │  ├─ demoDataService.ts # listDemoSessions / loadDemoSession / validateDemoSession
   │  ├─ config/            # ConfigService：API 配置读取、校验、连接测试
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

### 已实现

- 统一 `LLMProvider` 接口与 `OpenAICompatibleProvider`：POST `{BaseURL}/chat/completions`，自动处理 `/v1` 与完整路径，避免 `/v1/v1`
- `ConfigService` 封装配置读写：Base URL / API Key / Model Name / Temperature / Max Tokens / JSON mode，保存前校验、支持连接测试与删除
- 四个独立 Prompt（Planner / Researcher / Reviewer / Synthesizer），明确 Role、Goal、Input、Output Schema 与约束，只输出 JSON
- `LLMExecutor` 实现与 `DemoExecutor` 相同的 `AgentExecutor` 接口：真实上游输出注入、JSON 解析、Zod 严格校验、最多一次结构修复
- LIVE 会话由 `LivePlayer` 创建，`TaskController.startLive` 串行调用四个 Agent；DEMO / LIVE 共用 Orchestrator 与状态机
- 超时与取消（AbortSignal）覆盖完整请求生命周期：fetch、响应体读取、JSON 解析与内容提取共用一个 `AbortController`；非 2xx 时按 HTTP 状态报错，错误体不会覆盖原状态；完成后统一清理定时器与 abort 监听器
- 错误分级：认证 / 地址 / 模型 / 限流 / 5xx / 网络 / 超时 / 解析 / 校验，均返回可读中文提示，不暴露 Header 或密钥
- LIVE 启动前检查配置完整性；请求失败直接标记失败，**绝不静默回退 DEMO**；Researcher 不返回虚构的真实文献（literature 为空，仅输出检索计划）
- Vitest 新增 23 项 LIVE 测试（Mock Provider / Mock fetch），覆盖正常请求、响应体读取阶段超时/取消、HTTP 状态兼容、错误体阻塞与资源清理；`npm run typecheck`、`npm test`、`npm run build` 均通过

### 阶段五：多智能体执行引擎

- Agent 状态机（idle / pending / running / completed / failed / fallback / skipped）与 Session 状态机（created / running / paused / completed / failed / cancelled），非法转换抛错
- Orchestrator 串行调度 Planner → Researcher → Reviewer → Synthesizer，上游输出作为下游输入，事件驱动时间线；执行器通过 `AgentExecutor` 接口注入
- DemoPlayer 从只读模板创建独立运行 Session，按 `durationMs` 回放事件与输出；最终结果与 JSON 完全一致
- TaskController 支持 Start / Pause / Resume / Cancel / Retry / Restart；重试只重跑失败 Agent，Restart 新建 Session；generation 计数隔离旧异步任务
- Session Store 只持有运行态并转发控制命令，执行逻辑保留在 Engine 层；案例切换会取消旧运行并隔离旧事件
- 结果页随着 Agent 完成逐步解锁；完成或失败 / 取消均有状态提示，失败可一键重试
- Vitest 覆盖 15 项引擎 / DEMO 测试（当前总计 38 项）；`npm run typecheck`、`npm test`、`npm run build` 均通过

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
- 真实文献检索（Semantic Scholar 等）、流式输出、并行模型与后端密钥代理

## 技术备注

- **静态部署**：`vite.config.ts` 使用 `base: './'`，产物可部署在任意子路径；v1 不使用路由，避免静态托管深链 404。
- **包体**：当前主 chunk 约 1,010 kB（KaTeX + Markdown 未拆分），后续阶段可按结果页做动态 `import()`。
- **KaTeX 版本**：固定 0.16.x 以匹配 `rehype-katex@7` 的 `^0.16.0` 依赖，避免双份 KaTeX 样式错配。
- **数据来源**：两套案例中仅 U-Net 与 AutoGen 两条线索标记为 REAL PAPER，DOI / 链接可核验；其余文献均为模拟研究线索，不提供 DOI 或链接。案例 JSON 通过 `import.meta.env.BASE_URL` 加载，兼容 `base: './'` 的静态部署。
- **校验入口**：`validateDemoSession` 基于 Zod `safeParse` 返回可读问题列表；加载失败时 Workspace / Process / Results 均显示错误与重试按钮，不会静默显示空数据。
- **API Key**：设置保存在浏览器 `localStorage` 明文，无服务端存储或加密。API Key 将在浏览器环境中使用，localStorage 不是安全密钥存储；仅建议用于个人开发和可信环境下的演示，公开部署应通过后端代理保护密钥。密钥只通过 `ConfigService` 读取，不写入日志、不进入错误信息。
- **请求生命周期**：`OpenAICompatibleProvider` 用单个 `AbortController` 覆盖 fetch、响应体读取、JSON 解析与内容提取；超时与外部取消在完整生命周期内有效，外部取消优先于超时判定；非 2xx 时立即取消并丢弃错误体，原始 HTTP 状态错误优先；超时定时器与 abort 监听器只在 `finally` 中统一清理。
- **LIVE 失败语义**：模型请求失败、JSON 解析失败或 Zod 校验失败都会让当前 Agent 与 Session 进入 failed；最多自动发起一次“仅修结构”的修复请求，之后不再重试，也不会回退到 DEMO 数据。暂停不会中断在途请求，取消会通过同一个 AbortController 终止请求。
- **文献边界**：LIVE 阶段未接入真实文献数据库，Researcher 的 `literature` 必须为空数组；结果页展示的是模型生成的检索计划，并明确提示尚未核实。

## 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md)
