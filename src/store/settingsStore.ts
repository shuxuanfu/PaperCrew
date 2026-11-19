import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { RunMode } from '@/domain/agent/ids'
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
} from '@/services/llm/llmConfig'
import type { ApiSettings } from '@/types/ui'

export const EMPTY_API_SETTINGS: ApiSettings = {
  baseUrl: '',
  apiKey: '',
  modelName: '',
  temperature: DEFAULT_TEMPERATURE,
  maxTokens: DEFAULT_MAX_TOKENS,
  jsonMode: true,
}

interface SettingsState {
  mode: RunMode
  api: ApiSettings
  setMode: (mode: RunMode) => void
  saveApiSettings: (api: ApiSettings) => void
  deleteApiSettings: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      mode: 'demo',
      api: EMPTY_API_SETTINGS,
      setMode: (mode) => set({ mode }),
      saveApiSettings: (api) => set({ api }),
      deleteApiSettings: () => set({ api: EMPTY_API_SETTINGS }),
    }),
    {
      name: 'papercrew.settings.v1',
      partialize: (state) => ({ mode: state.mode, api: state.api }),
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<SettingsState>
        return {
          ...current,
          mode: stored.mode === 'live' ? 'live' : 'demo',
          api: { ...EMPTY_API_SETTINGS, ...(stored.api ?? {}) },
        }
      },
    },
  ),
)
