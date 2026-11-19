import { Info, Radio } from 'lucide-react'

import { SectionHeading } from '@/components/research/SectionHeading'
import type { LiteratureClue, RetrievalPlan } from '@/types/research'

const RELEVANCE_LABEL: Record<string, string> = {
  high: 'High relevance',
  medium: 'Medium relevance',
  low: 'Low relevance',
}

interface LiteratureListProps {
  literature: LiteratureClue[]
  retrievalPlan?: RetrievalPlan | null
  live?: boolean
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

export function LiteratureList({
  literature,
  retrievalPlan = null,
  live = false,
}: LiteratureListProps) {
  const simulatedCount = literature.filter(
    (item) => item.sourceType === 'simulated',
  ).length
  const realCount = literature.length - simulatedCount

  return (
    <div>
      {live ? (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-accent-soft px-3.5 py-3">
          <Radio className="mt-0.5 size-4 shrink-0 text-accent" />
          <p className="text-[11px] leading-[1.6] text-accent">
            LIVE mode is not connected to a real literature database. The
            Researcher is instructed to return no literature clues; the search
            plan below is model-generated and must be verified before use.
          </p>
        </div>
      ) : (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-warning-soft px-3.5 py-3">
          <Info className="mt-0.5 size-4 shrink-0 text-warning-ink" />
          <p className="text-[11px] leading-[1.6] text-warning-ink">
            {simulatedCount} of {literature.length} clues are simulated demo
            data and intentionally carry no DOI or link. Only records marked
            REAL PAPER reference verifiable sources.
          </p>
        </div>
      )}

      <SectionHeading
        title={live ? 'Literature & Search Plan' : 'Literature'}
        meta={
          live
            ? `${literature.length} clues · search strategy from the model`
            : `${literature.length} clues · ${realCount} real · ${simulatedCount} simulated`
        }
      />

      {retrievalPlan ? <RetrievalPlanCard plan={retrievalPlan} /> : null}

      {literature.length === 0 ? (
        <p className="mt-4 rounded-xl bg-canvas px-3.5 py-3 text-[11px] leading-[1.6] text-muted">
          No literature clues were returned. In LIVE mode this is expected —
          the researcher does not invent papers or DOIs.
        </p>
      ) : (
        <div className="mt-1 divide-y divide-line">
          {literature.map((clue) => {
            const real = clue.sourceType === 'real'
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
                  <span className="ml-auto text-[9px] uppercase tracking-[0.06em] text-muted/70">
                    {clue.id}
                  </span>
                </div>

                <h4 className="mt-2 text-[13.5px] font-semibold leading-[1.55] text-ink">
                  {clue.title}
                </h4>
                <p className="mt-1 text-[10.5px] leading-4 text-muted">
                  {clue.authors.join(', ')} · {clue.year} · {clue.venue}
                </p>
                <p className="mt-2 text-[12px] leading-[1.65] text-ink/75">
                  {clue.abstract}
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9.5px] text-muted">
                  {real ? (
                    <>
                      {clue.doi ? (
                        <span className="rounded-[5px] bg-canvas px-1.5 py-0.5 font-mono">
                          DOI {clue.doi}
                        </span>
                      ) : null}
                      {clue.url ? (
                        <a
                          href={clue.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-accent underline-offset-2 hover:underline"
                        >
                          Verifiable source
                        </a>
                      ) : null}
                      {!clue.doi && !clue.url ? (
                        <span>Real record · DOI/URL not provided</span>
                      ) : null}
                    </>
                  ) : (
                    <span>Simulated study · DOI/URL intentionally omitted</span>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    {clue.relatedQuestionIds.map((questionId) => (
                      <span
                        key={questionId}
                        className="rounded-[5px] bg-canvas px-1.5 py-0.5 font-mono text-[9px] uppercase"
                      >
                        {questionId}
                      </span>
                    ))}
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
