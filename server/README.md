# PaperCrew Semantic Scholar Proxy

轻量 Node.js 代理，用于替代浏览器直连 Semantic Scholar。仅使用 Node 原生 `http`、`fetch` 与内置测试运行器，无第三方依赖。

## 接口

`GET /api/semantic-scholar/search?query=<keyword>&limit=<1-10>`

- `query`：必填，2–300 字符。
- `limit`：可选，默认 5，范围 1–10。
- 不接受其他参数；`url`、`fields`、`apiKey` 等参数会被拒绝。
- 上游地址与 fields 固定，不能由请求方指定。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `PORT` | 否 | 默认 `8787` |
| `SEMANTIC_SCHOLAR_API_KEY` | 否 | 只存在于后端，通过 `x-api-key` 发送；留空则匿名请求 |
| `CORS_ALLOWED_ORIGINS` | 生产必填 | 逗号分隔的精确来源；拒绝 `*`。开发环境未设置时默认 `http://localhost:5173,http://127.0.0.1:5173` |
| `SEMANTIC_SCHOLAR_TIMEOUT_MS` | 否 | 上游超时，默认 `15000` |
| `RATE_LIMIT_MAX` | 否 | 单实例、单 IP 时间窗内最大请求数，默认 `60` |
| `RATE_LIMIT_WINDOW_MS` | 否 | 限流时间窗，默认 `60000` |

## 本地运行

```bash
cd server
cp .env.example .env
# 编辑 .env，填入 SEMANTIC_SCHOLAR_API_KEY（可选）
node --env-file=.env src/index.js
```

或直接在 shell 中设置变量后运行：

```bash
SEMANTIC_SCHOLAR_API_KEY=... CORS_ALLOWED_ORIGINS=http://localhost:5173 node src/index.js
```

前端设置：

```bash
VITE_SEMANTIC_SCHOLAR_PROXY_URL=http://127.0.0.1:8787
```

## 测试与检查

```bash
npm test
npm run check
```

测试使用 Mock fetch，不会请求真实 Semantic Scholar。

## 部署边界

- 代理必须部署到支持 Node.js 的服务环境；不能部署为纯静态站点。
- 生产环境必须显式配置 `CORS_ALLOWED_ORIGINS`，且必须与前端实际来源完全一致。
- 内存限流只在单实例内有效；多实例部署需要共享限流存储或网关级限流。
- Key 不会返回给前端、不会写入日志、不会出现在错误消息中。
