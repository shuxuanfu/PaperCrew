import { Compass, FileText, Layers } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useUiStore } from '@/store/uiStore'
import type { MobileView } from '@/types/ui'

const VIEWS: { id: MobileView; label: string; icon: LucideIcon }[] = [
  { id: 'workspace', label: 'Workspace', icon: Layers },
  { id: 'process', label: 'Process', icon: Compass },
  { id: 'results', label: 'Results', icon: FileText },
]

export function MobileViewSwitcher() {
  const mobileView = useUiStore((state) => state.mobileView)
  const setMobileView = useUiStore((state) => state.setMobileView)

  return (
    <div className="shrink-0 border-b border-line bg-canvas px-4 py-2 xl:hidden">
      <div className="mx-auto flex w-full max-w-[760px] gap-1 rounded-xl bg-surface p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        {VIEWS.map((view) => {
          const Icon = view.icon
          const active = mobileView === view.id

          return (
            <button
              key={view.id}
              type="button"
              onClick={() => setMobileView(view.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11.5px] font-medium transition-colors ${
                active
                  ? 'bg-ink text-white'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <Icon className="size-3.5" />
              {view.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
