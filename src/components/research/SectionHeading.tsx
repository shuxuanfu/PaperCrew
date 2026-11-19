interface SectionHeadingProps {
  title: string
  meta?: string
}

export function SectionHeading({ title, meta }: SectionHeadingProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="text-[13px] font-semibold tracking-[-0.005em] text-ink">
        {title}
      </h3>
      {meta ? <span className="text-[10px] text-muted">{meta}</span> : null}
    </div>
  )
}
