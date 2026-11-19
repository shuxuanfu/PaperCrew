import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

interface FinalReportProps {
  report: string
  title: string
}

export function FinalReport({ report, title }: FinalReportProps) {
  return (
    <div>
      <header className="mb-5">
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">
          Synthesizer output
        </p>
        <h3 className="mt-1.5 text-[16px] font-semibold leading-6 tracking-[-0.01em] text-ink">
          {title}
        </h3>
        <p className="mt-1 text-[10.5px] text-muted">
          9 sections · Evidence / Hypothesis / Proposal · Markdown rendered
        </p>
      </header>

      <div className="report-markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {report}
        </ReactMarkdown>
      </div>
    </div>
  )
}
