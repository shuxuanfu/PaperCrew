import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { RunMode } from '@/domain/agent/ids'
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
} from '@/services/llm/llmConfig'
import type { ApiSettings } from '@/types/ui'

const SETTINGS_STORAGE_KEY = 'papercrew.settings.v1'

export const EMPTY_API_SETTINGS: ApiSettings = {
  baseUrl: '',
  apiKey: '',
  modelName: '',
  temperature: DEFAULT_TEMPERATURE,
  maxTokens: DEFAULT_MAX_TOKENS,
  jsonMode: true,
}

function sanitizeApiSettings(value: unknown): ApiSettings {
  const raw =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {}
  return {
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : '',
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
    modelName: typeof raw.modelName === 'string' ? raw.modelName : '',
    temperature:
      typeof raw.temperature === 'number' && Number.isFinite(raw.temperature)
        ? raw.temperature
        : DEFAULT_TEMPERATURE,
    maxTokens:
      typeof raw.maxTokens === 'number' && Number.isInteger(raw.maxTokens)
        ? raw.maxTokens
        : DEFAULT_MAX_TOKENS,
    jsonMode: typeof raw.jsonMode === 'boolean' ? raw.jsonMode : true,
  }
}

function removeLegacyScholarKey(): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) {
      return
    }
    const parsed = JSON.parse(raw) as {
      state?: { api?: Record<string, unknown> }
    }
    const api = parsed.state?.api
    if (
      api &&
      Object.prototype.hasOwnProperty.call(api, 'semanticScholarApiKey')
    ) {
      delete api.semanticScholarApiKey
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(parsed))
    }
  } catch {
    // Ignore malformed or unavailable localStorage.
  }
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
      name: SETTINGS_STORAGE_KEY,
      partialize: (state) => ({ mode: state.mode, api: state.api }),
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<SettingsState>
        return {
          ...current,
          mode: stored.mode === 'live' ? 'live' : 'demo',
          api: sanitizeApiSettings(stored.api),
        }
      },
      onRehydrateStorage: () => () => {
        removeLegacyScholarKey()
      },
    },
  ),
)
