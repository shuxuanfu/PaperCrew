import type { ReactNode } from 'react'

interface PanelProps {
  children: ReactNode
  className?: string
}

export function Panel({ children, className = '' }: PanelProps) {
  return (
    <section
      className={`flex min-h-0 w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_-24px_rgba(0,0,0,0.16)] ${className}`}
    >
      {children}
    </section>
  )
}
