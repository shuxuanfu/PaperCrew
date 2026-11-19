import { SectionHeading } from '@/components/research/SectionHeading'
import type { ResearchPlan as ResearchPlanData } from '@/types/research'

interface ResearchPlanProps {
  plan: ResearchPlanData
}

const DETAIL_LABELS = [
  { key: 'rationale', label: 'Rationale' },
  { key: 'methodology', label: 'Methodology' },
  { key: 'expectedOutcome', label: 'Expected outcome' },
] as const

export function ResearchPlan({ plan }: ResearchPlanProps) {
  return (
    <div className="space-y-7">
      <section>
        <SectionHeading
          title="Research Questions"
          meta={`${plan.researchQuestions.length} structured questions`}
        />
        <ol className="mt-3.5 space-y-4">
          {plan.researchQuestions.map((item, index) => (
            <li key={item.id} className="flex items-start gap-3">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-accent-soft text-[9px] font-semibold tabular-nums text-accent">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium leading-[1.7] text-ink/85">
                  {item.question}
                </p>
                <dl className="mt-2 space-y-1.5">
                  {DETAIL_LABELS.map(({ key, label }) => (
                    <div key={key} className="flex gap-2">
                      <dt className="w-[92px] shrink-0 pt-px text-[9px] font-semibold uppercase tracking-[0.08em] text-muted/80">
                        {label}
                      </dt>
                      <dd className="text-[11px] leading-[1.6] text-muted">
                        {item[key]}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <SectionHeading title="Search Keywords" meta="English queries" />
        <div className="mt-3 space-y-4">
          {plan.searchKeywords.map((group) => (
            <div key={group.id}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-accent">
                  {group.label}
                </p>
                <span className="text-[9px] text-muted">{group.id}</span>
              </div>
              <p className="mt-1 text-[10.5px] leading-[1.5] text-muted">
                {group.purpose}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {group.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-md bg-canvas px-2 py-1 font-mono text-[10.5px] text-ink/70"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="border-t border-line pt-3 text-[10px] text-muted">
        Planner output · {plan.researchQuestions.length} questions ·{' '}
        {plan.searchKeywords.length} keyword groups.
      </p>
    </div>
  )
}
