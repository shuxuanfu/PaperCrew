import { Settings2 } from 'lucide-react'

import { getCompleteness } from '@/services/config/configService'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'

function Logo() {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-accent text-white shadow-[0_2px_8px_rgba(0,122,255,0.24)]"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="size-[18px]"
      >
        <circle cx="12" cy="5.2" r="2.1" />
        <circle cx="5.2" cy="17.4" r="2.1" />
        <circle cx="18.8" cy="17.4" r="2.1" />
        <path d="M10.6 7.1 6.4 15.5M13.4 7.1l4.2 8.4M7.3 17.4h9.4" />
      </svg>
    </span>
  )
}

export function Header() {
  const mode = useSettingsStore((state) => state.mode)
  const setMode = useSettingsStore((state) => state.setMode)
  const api = useSettingsStore((state) => state.api)
  const openSettings = useUiStore((state) => state.openSettings)

  const apiConfigured = getCompleteness(api).complete

  return (
    <header className="z-30 flex h-[60px] shrink-0 items-center border-b border-line bg-surface/85 backdrop-blur-xl">
      <div className="mx-auto flex h-full w-full max-w-[1680px] items-center gap-3 px-4 sm:px-5 lg:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo />
          <div className="min-w-0">
            <span className="block text-[15px] font-semibold leading-[18px] tracking-[-0.015em] text-ink">
              PaperCrew
            </span>
            <span className="hidden text-[10px] leading-[14px] text-muted sm:block">
              Multi-Agent Research Workspace
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
          <div
            role="group"
            aria-label="Run mode"
            className="flex items-center rounded-[9px] bg-canvas p-0.5"
          >
            {(['demo', 'live'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                aria-pressed={mode === item}
                title={
                  item === 'live' && !apiConfigured
                    ? 'API settings are required for LIVE mode'
                    : undefined
                }
                className={`flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[10px] font-semibold tracking-[0.05em] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
                  mode === item
                    ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.1)]'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {item === 'live' && !apiConfigured ? (
                  <span className="size-1.5 rounded-full bg-warning" />
                ) : null}
                {item.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={openSettings}
            aria-label="Open API settings"
            title={
              apiConfigured
                ? `Model: ${api.modelName} · Key stored locally`
                : 'API settings incomplete'
            }
            className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11.5px] font-medium text-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            <Settings2 className="size-[15px]" />
            <span className="hidden md:inline">API Settings</span>
          </button>

          <span aria-hidden="true" className="hidden h-4 w-px bg-line sm:block" />

          <div
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-[10px] font-semibold tracking-[0.04em] text-accent"
          >
            PC
          </div>
        </div>
      </div>
    </header>
  )
}
