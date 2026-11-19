import { AlertTriangle, Info, Radio, Search } from 'lucide-react'

import { SectionHeading } from '@/components/research/SectionHeading'
import type {
  LiteratureClue,
  LiteratureRetrieval,
  LiteratureRetrievalStatus,
  RetrievalPlan,
} from '@/types/research'

const RELEVANCE_LABEL: Record<string, string> = {
  high: 'High relevance',
  medium: 'Medium relevance',
  low: 'Low relevance',
}

const RETRIEVAL_STATUS_LABEL: Record<LiteratureRetrievalStatus, string> = {
  idle: 'Not started',
  searching: 'Searching Semantic Scholar',
  completed: 'Semantic Scholar completed',
  empty: 'No results',
  failed: 'Search failed',
}

interface LiteratureListProps {
  literature: LiteratureClue[]
  retrievalPlan?: RetrievalPlan | null
  retrieval?: LiteratureRetrieval | null
  live?: boolean
}

function formatSearchedAt(value: string | null): string {
  if (!value) {
    return '暂无数据'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '暂无数据'
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function RetrievalPlanCard({ plan }: { plan: RetrievalPlan }) {
  return (
    <div className="mt-3 rounded-xl bg-canvas px-3.5 py-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted/80">
        Search strategy
      </p>
      <p className="mt-1 text-[11.5px] leading-[1.65] text-ink/80">
        {plan.searchStrategy}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {plan.keywordGroups.map((group) => (
          <span
            key={group}
            className="rounded-[5px] bg-surface px-1.5 py-0.5 font-mono text-[9.5px] text-ink/70"
          >
            {group}
          </span>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted/80">
            Research gaps
          </p>
          <ul className="mt-1 space-y-1">
            {plan.researchGaps.map((gap) => (
              <li
                key={gap}
                className="flex gap-1.5 text-[10.5px] leading-[1.55] text-muted"
              >
                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted/60" />
                {gap}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted/80">
            Next directions
          </p>
          <ul className="mt-1 space-y-1">
            {plan.nextDirections.map((direction) => (
              <li
                key={direction}
                className="flex gap-1.5 text-[10.5px] leading-[1.55] text-muted"
              >
                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-accent/60" />
                {direction}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function RetrievalMeta({ retrieval }: { retrieval: LiteratureRetrieval }) {
  return (
    <div className="mb-5 rounded-xl bg-canvas px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-ink">
          <Search className="size-3.5 text-accent" />
          {RETRIEVAL_STATUS_LABEL[retrieval.status]}
        </span>
        <span className="text-[9.5px] text-muted">
          {formatSearchedAt(retrieval.searchedAt)}
        </span>
        <span className="text-[9.5px] text-muted">
          API matched {retrieval.totalMatched} · fetched{' '}
          {retrieval.totalFetched} · kept {retrieval.totalReturned}
        </span>
        <span className="text-[9.5px] text-muted">
          {retrieval.durationMs} ms
        </span>
      </div>

      {retrieval.queries.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {retrieval.queries.map((query) => (
            <span
              key={query}
              className="rounded-[5px] bg-surface px-1.5 py-0.5 font-mono text-[9px] text-ink/65"
            >
              {query}
            </span>
          ))}
        </div>
      ) : null}

      <p className="mt-2 text-[9px] leading-[1.5] text-muted/80">
        API matched 是各查询 total 之和，可能包含跨查询重复；fetched 是实际返回条数之和；kept 是去重并限制为 8 篇后的保留数。
      </p>

      {retrieval.warnings && retrieval.warnings.length > 0 ? (
        <div className="mt-2.5 space-y-1">
          {retrieval.warnings.map((warning) => (
            <p
              key={warning}
              className="text-[10px] leading-[1.5] text-warning-ink"
            >
              {warning}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function LiveRetrievalBanner({
  retrieval,
  literature,
}: {
  retrieval: LiteratureRetrieval | null
  literature: LiteratureClue[]
}) {
  if (retrieval?.status === 'failed') {
    return (
      <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-danger-soft px-3.5 py-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
        <div>
          <p className="text-[11px] font-semibold text-danger-ink">
            Semantic Scholar 检索失败
          </p>
          <p className="mt-0.5 text-[11px] leading-[1.6] text-danger-ink/90">
            {retrieval.error ?? '未返回可读错误。'}
            系统未使用任何模拟文献替代，请检查网络、限流或 API Key 后重试。
          </p>
        </div>
      </div>
    )
  }

  if (retrieval?.status === 'empty' || (retrieval && literature.length === 0)) {
    return (
      <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-warning-soft px-3.5 py-3">
        <Search className="mt-0.5 size-4 shrink-0 text-warning-ink" />
        <div>
          <p className="text-[11px] font-semibold text-warning-ink">
            Semantic Scholar 未返回可用的真实论文
          </p>
          <p className="mt-0.5 text-[11px] leading-[1.6] text-warning-ink/90">
            {retrieval.error ??
              '检索已完成但没有结果。系统不会生成模拟文献；可调整关键词后重试。'}
          </p>
        </div>
      </div>
    )
  }

  if (retrieval?.status === 'completed' && literature.length > 0) {
    return (
      <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-accent-soft px-3.5 py-3">
        <Radio className="mt-0.5 size-4 shrink-0 text-accent" />
        <div>
          <p className="text-[11px] font-semibold text-accent">
            Semantic Scholar · {literature.length} real papers
          </p>
          <p className="mt-0.5 text-[11px] leading-[1.6] text-accent">
            所有标题、作者、年份、DOI 与链接均来自 Semantic Scholar API，
            模型未修改文献元数据。
          </p>
          {retrieval.error ? (
            <p className="mt-1 text-[10px] leading-[1.5] text-warning-ink">
              {retrieval.error}
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-canvas px-3.5 py-3">
      <Search className="mt-0.5 size-4 shrink-0 text-muted" />
      <p className="text-[11px] leading-[1.6] text-muted">
        本次运行没有记录 Semantic Scholar 检索结果。系统不会用模拟数据冒充真实论文。
      </p>
    </div>
  )
}

export function LiteratureList({
  literature,
  retrievalPlan = null,
  retrieval = null,
  live = false,
}: LiteratureListProps) {
  const simulatedCount = literature.filter(
    (item) => item.sourceType === 'simulated',
  ).length
  const realCount = literature.length - simulatedCount

  return (
    <div>
      {live ? (
        <LiveRetrievalBanner retrieval={retrieval} literature={literature} />
      ) : (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-warning-soft px-3.5 py-3">
          <Info className="mt-0.5 size-4 shrink-0 text-warning-ink" />
          <p className="text-[11px] leading-[1.6] text-warning-ink">
            {simulatedCount > 0
              ? `${simulatedCount} of ${literature.length} clues are simulated demo data and intentionally carry no DOI or link. Only records marked REAL PAPER reference verifiable sources.`
              : `${realCount} records are marked REAL PAPER and reference verifiable sources.`}
          </p>
        </div>
      )}

      <SectionHeading
        title={live ? 'Real Literature & Search Plan' : 'Literature'}
        meta={
          live
            ? `${literature.length} real papers · Semantic Scholar`
            : `${literature.length} clues · ${realCount} real · ${simulatedCount} simulated`
        }
      />

      {retrieval ? <RetrievalMeta retrieval={retrieval} /> : null}
      {retrievalPlan ? <RetrievalPlanCard plan={retrievalPlan} /> : null}

      {literature.length === 0 ? (
        <p className="mt-4 rounded-xl bg-canvas px-3.5 py-3 text-[11px] leading-[1.6] text-muted">
          {live
            ? 'No real literature is available for this run. No simulated papers were substituted.'
            : 'No literature clues were loaded for this demo case.'}
        </p>
      ) : (
        <div className="mt-1 divide-y divide-line">
          {literature.map((clue) => {
            const real = clue.sourceType === 'real'
            const authors =
              clue.authors.length > 0 ? clue.authors.join(', ') : '作者信息暂无数据'
            const venue = clue.venue ?? '发表渠道暂无数据'
            const year = clue.year !== null ? String(clue.year) : '年份暂无数据'

            return (
              <article key={clue.id} className="py-5 first:pt-4 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-[5px] px-1.5 py-0.5 text-[8.5px] font-semibold tracking-[0.08em] ${
                      real
                        ? 'bg-success-soft text-success-ink'
                        : 'bg-warning-soft text-warning-ink'
                    }`}
                  >
                    {real ? 'REAL PAPER' : 'SIMULATED'}
                  </span>
                  <span className="text-[9.5px] uppercase tracking-[0.06em] text-muted">
                    {RELEVANCE_LABEL[clue.relevance]}
                  </span>
                  <span className="ml-auto truncate text-[9px] uppercase tracking-[0.06em] text-muted/70">
                    {clue.id}
                  </span>
                </div>

                <h4 className="mt-2 text-[13.5px] font-semibold leading-[1.55] text-ink">
                  {clue.title}
                </h4>
                <p className="mt-1 text-[10.5px] leading-4 text-muted">
                  {authors} · {year} · {venue}
                </p>
                <p className="mt-2 text-[12px] leading-[1.65] text-ink/75">
                  {clue.abstract ?? '暂无摘要（Semantic Scholar 未提供）'}
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[9.5px] text-muted">
                  {real ? (
                    <>
                      {clue.doi ? (
                        <a
                          href={`https://doi.org/${clue.doi}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-accent underline-offset-2 hover:underline"
                        >
                          DOI {clue.doi}
                        </a>
                      ) : null}
                      {clue.url ? (
                        <a
                          href={clue.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-accent underline-offset-2 hover:underline"
                        >
                          Semantic Scholar source
                        </a>
                      ) : null}
                      {clue.openAccessPdf ? (
                        <a
                          href={clue.openAccessPdf}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-accent underline-offset-2 hover:underline"
                        >
                          Open PDF
                        </a>
                      ) : null}
                      {!clue.doi && !clue.url ? (
                        <span>来源链接暂无数据</span>
                      ) : null}
                      {clue.citationCount !== undefined &&
                      clue.citationCount !== null ? (
                        <span>{clue.citationCount} citations</span>
                      ) : null}
                      {clue.referenceCount !== undefined &&
                      clue.referenceCount !== null ? (
                        <span>{clue.referenceCount} references</span>
                      ) : null}
                    </>
                  ) : (
                    <span>Simulated study · DOI/URL intentionally omitted</span>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    {clue.relatedQuestionIds.length > 0 ? (
                      clue.relatedQuestionIds.map((questionId) => (
                        <span
                          key={questionId}
                          className="rounded-[5px] bg-canvas px-1.5 py-0.5 font-mono text-[9px] uppercase"
                        >
                          {questionId}
                        </span>
                      ))
                    ) : (
                      <span className="text-[9px] text-muted/80">
                        尚未关联研究问题
                      </span>
                    )}
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
