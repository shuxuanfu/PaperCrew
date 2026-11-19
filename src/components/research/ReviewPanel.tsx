import { Lightbulb } from 'lucide-react'

import { SectionHeading } from '@/components/research/SectionHeading'
import type {
  ReviewerComment,
  ReviewCategory,
  ReviewSeverity,
} from '@/types/research'

const SEVERITY_STYLE: Record<
  ReviewSeverity,
  { label: string; className: string }
> = {
  high: {
    label: 'High risk',
    className: 'bg-danger-soft text-danger-ink',
  },
  medium: {
    label: 'Medium risk',
    className: 'bg-warning-soft text-warning-ink',
  },
  low: {
    label: 'Low risk',
    className: 'bg-success-soft text-success-ink',
  },
}

const CATEGORY_LABEL: Record<ReviewCategory, string> = {
  methodology: 'Methodology',
  dataset: 'Dataset',
  evaluation: 'Evaluation',
  statistics: 'Statistics',
  reproducibility: 'Reproducibility',
  logic: 'Logic',
}

interface ReviewPanelProps {
  review: ReviewerComment[]
}

export function ReviewPanel({ review }: ReviewPanelProps) {
  const high = review.filter((item) => item.severity === 'high').length
  const medium = review.filter((item) => item.severity === 'medium').length
  const verdict =
    high > 0
      ? 'Major revision required before execution'
      : medium > 0
        ? 'Minor revision recommended before execution'
        : 'Ready for a pilot run'

  return (
    <div>
      <div className="mb-5 rounded-xl bg-canvas px-4 py-3.5">
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">
          Reviewer verdict
        </p>
        <p className="mt-1.5 text-[13px] font-semibold text-ink">{verdict}</p>
        <p className="mt-1 text-[11.5px] leading-[1.6] text-muted">
          {review.length} review notes flagged: {high} high risk, {medium}{' '}
          medium risk. Each note is linked to affected research questions.
        </p>
      </div>

      <SectionHeading
        title="Review Notes"
        meta={`${review.length} issues`}
      />

      <div className="mt-1 divide-y divide-line">
        {review.map((item) => {
          const severity = SEVERITY_STYLE[item.severity]
          return (
            <article key={item.id} className="py-5 first:pt-4 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-[13px] font-semibold leading-[1.55] text-ink">
                    {item.title}
                  </h4>
                  <p className="mt-1 text-[9.5px] uppercase tracking-[0.08em] text-muted">
                    {CATEGORY_LABEL[item.category]}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${severity.className}`}
                >
                  {severity.label}
                </span>
              </div>

              <p className="mt-2 text-[12px] leading-[1.65] text-ink/75">
                {item.problem}
              </p>
              <p className="mt-2 text-[11px] leading-[1.6] text-muted">
                <span className="font-semibold text-ink/70">Impact · </span>
                {item.impact}
              </p>

              <div className="mt-3 rounded-lg bg-canvas px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">
                  <Lightbulb className="size-3" />
                  Suggested revision
                </p>
                <p className="mt-1 text-[11.5px] leading-[1.6] text-ink/75">
                  {item.recommendation}
                </p>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1 text-[9px] text-muted">
                <span className="uppercase tracking-[0.06em]">Questions</span>
                {item.relatedQuestionIds.map((questionId) => (
                  <span
                    key={questionId}
                    className="rounded-[5px] bg-canvas px-1.5 py-0.5 font-mono uppercase"
                  >
                    {questionId}
                  </span>
                ))}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
