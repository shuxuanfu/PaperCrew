import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

import { motion } from 'framer-motion'
import { Eye, EyeOff, Info, Loader2, ShieldAlert, X } from 'lucide-react'

import {
  ConfigService,
  validateApiSettings,
  type SetupIssue,
} from '@/services/config/configService'
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
} from '@/services/llm/llmConfig'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import type { ApiSettings } from '@/types/ui'

const INPUT_CLASS =
  'h-9 w-full rounded-lg border border-line bg-surface px-3 text-[12.5px] text-ink placeholder:text-muted/70 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/15'

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; model: string; latencyMs: number }
  | { status: 'error'; message: string }

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[11.5px] font-medium text-ink">
          {label}
        </label>
        {hint ? <span className="text-[9.5px] text-muted">{hint}</span> : null}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function IssueText({ message }: { message: string | undefined }) {
  if (!message) return null
  return (
    <p className="mt-1 text-[10px] leading-4 text-danger-ink">{message}</p>
  )
}

function ApiSettingsDialog() {
  const api = useSettingsStore((state) => state.api)
  const closeSettings = useUiStore((state) => state.closeSettings)

  const [baseUrl, setBaseUrl] = useState(api.baseUrl)
  const [apiKey, setApiKey] = useState(api.apiKey)
  const [modelName, setModelName] = useState(api.modelName)
  const [temperature, setTemperature] = useState(String(api.temperature))
  const [maxTokens, setMaxTokens] = useState(String(api.maxTokens))
  const [jsonMode, setJsonMode] = useState(api.jsonMode)
  const [showKey, setShowKey] = useState(false)
  const [issues, setIssues] = useState<SetupIssue[]>([])
  const [testState, setTestState] = useState<TestState>({ status: 'idle' })
  const urlRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    urlRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSettings()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeSettings])

  const draft: ApiSettings = {
    baseUrl,
    apiKey,
    modelName,
    temperature: Number(temperature),
    maxTokens: Number(maxTokens),
    jsonMode,
  }

  const issueFor = (field: SetupIssue['field']) =>
    issues.find((issue) => issue.field === field)?.message

  const resetTest = () => {
    setTestState((current) =>
      current.status === 'idle' ? current : { status: 'idle' },
    )
  }

  const handleTest = async () => {
    const validation = validateApiSettings(draft)
    if (validation.length > 0) {
      setIssues(validation)
      return
    }
    setIssues([])
    setTestState({ status: 'testing' })
    try {
      const result = await ConfigService.testConnection(draft)
      setTestState({
        status: 'ok',
        model: result.model,
        latencyMs: result.latencyMs,
      })
    } catch (error) {
      setTestState({
        status: 'error',
        message:
          error instanceof Error ? error.message : '连接测试失败，请稍后重试。',
      })
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const validation = validateApiSettings(draft)
    if (validation.length > 0) {
      setIssues(validation)
      return
    }
    setIssues([])
    ConfigService.save(draft)
    closeSettings()
  }

  const handleDelete = () => {
    const confirmed = window.confirm(
      '删除已保存的 API 配置？这会清除本地存储中的 Base URL、API Key 与 Model Name。',
    )
    if (!confirmed) return
    ConfigService.clear()
    setBaseUrl('')
    setApiKey('')
    setModelName('')
    setTemperature(String(DEFAULT_TEMPERATURE))
    setMaxTokens(String(DEFAULT_MAX_TOKENS))
    setJsonMode(true)
    setShowKey(false)
    setIssues([])
    setTestState({ status: 'idle' })
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
    >
      <div
        aria-hidden="true"
        onClick={closeSettings}
        className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-settings-title"
        initial={{ opacity: 0, y: 12, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative z-10 flex max-h-[88vh] w-full max-w-[480px] flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_24px_64px_-24px_rgba(0,0,0,0.28)]"
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
            <div>
              <h2
                id="api-settings-title"
                className="text-[16px] font-semibold tracking-[-0.01em] text-ink"
              >
                API Settings
              </h2>
              <p className="mt-1 text-[11.5px] leading-4 text-muted">
                OpenAI-compatible endpoint used by LIVE mode.
              </p>
            </div>
            <button
              type="button"
              onClick={closeSettings}
              aria-label="Close API settings"
              className="flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-5">
            <div className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warning-ink" />
              <p className="text-[10.5px] leading-[1.6] text-warning-ink">
                API Key 将在浏览器环境中使用，localStorage
                不是安全密钥存储。仅建议用于个人开发和可信环境下的演示。公开部署应通过后端代理保护密钥。
              </p>
            </div>

            <Field id="api-base-url" label="Base URL" hint="Required">
              <input
                ref={urlRef}
                id="api-base-url"
                type="url"
                value={baseUrl}
                onChange={(event) => {
                  setBaseUrl(event.target.value)
                  resetTest()
                }}
                placeholder="https://api.openai.com/v1"
                autoComplete="off"
                spellCheck={false}
                className={INPUT_CLASS}
              />
              <IssueText message={issueFor('baseUrl')} />
            </Field>

            <Field id="api-key" label="API Key" hint="Required">
              <div className="relative">
                <input
                  id="api-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value)
                    resetTest()
                  }}
                  placeholder="sk-..."
                  autoComplete="off"
                  spellCheck={false}
                  className={`${INPUT_CLASS} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((value) => !value)}
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-canvas hover:text-ink"
                >
                  {showKey ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                </button>
              </div>
              <IssueText message={issueFor('apiKey')} />
            </Field>

            <Field id="api-model" label="Model Name" hint="Required">
              <input
                id="api-model"
                type="text"
                value={modelName}
                onChange={(event) => {
                  setModelName(event.target.value)
                  resetTest()
                }}
                placeholder="gpt-4o-mini"
                autoComplete="off"
                spellCheck={false}
                className={INPUT_CLASS}
              />
              <IssueText message={issueFor('modelName')} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field id="api-temperature" label="Temperature" hint="0 – 2">
                <input
                  id="api-temperature"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  max="2"
                  value={temperature}
                  onChange={(event) => {
                    setTemperature(event.target.value)
                    resetTest()
                  }}
                  className={INPUT_CLASS}
                />
                <IssueText message={issueFor('temperature')} />
              </Field>
              <Field id="api-max-tokens" label="Max Tokens" hint="256 – 32000">
                <input
                  id="api-max-tokens"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="256"
                  max="32000"
                  value={maxTokens}
                  onChange={(event) => {
                    setMaxTokens(event.target.value)
                    resetTest()
                  }}
                  className={INPUT_CLASS}
                />
                <IssueText message={issueFor('maxTokens')} />
              </Field>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-canvas px-3 py-2.5">
              <input
                type="checkbox"
                checked={jsonMode}
                onChange={(event) => {
                  setJsonMode(event.target.checked)
                  resetTest()
                }}
                className="mt-0.5 size-3.5 accent-[#007aff]"
              />
              <span>
                <span className="block text-[11.5px] font-medium text-ink">
                  Request JSON mode
                </span>
                <span className="mt-0.5 block text-[10px] leading-[1.5] text-muted">
                  Sends response_format: {'{'} type: "json_object" {'}'}. Only
                  enable it if your endpoint supports OpenAI-compatible JSON
                  mode.
                </span>
              </span>
            </label>

            <div className="rounded-lg border border-line px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-ink">
                  Connection check
                </span>
                <button
                  type="button"
                  onClick={() => void handleTest()}
                  disabled={testState.status === 'testing'}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md bg-canvas px-2.5 text-[10.5px] font-medium text-ink transition-colors hover:bg-[#ececef] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {testState.status === 'testing' ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : null}
                  {testState.status === 'testing' ? 'Testing…' : 'Test connection'}
                </button>
              </div>
              <p className="mt-1.5 text-[10px] leading-[1.55] text-muted">
                {testState.status === 'idle'
                  ? 'Sends a single minimal prompt. No research run is started.'
                  : null}
                {testState.status === 'ok'
                  ? `Connected · model ${testState.model || modelName} · ${testState.latencyMs} ms`
                  : null}
              </p>
              {testState.status === 'error' ? (
                <p className="mt-1.5 text-[10px] leading-[1.55] text-danger-ink">
                  {testState.message}
                </p>
              ) : null}
            </div>

            <p className="flex items-start gap-1.5 text-[10px] leading-4 text-muted">
              <Info className="mt-0.5 size-3 shrink-0" />
              Changed Base URL or API Key? Re-test the connection before
              starting a LIVE run. Invalid changes are never applied silently.
            </p>
          </div>

          <div className="flex items-center gap-2 border-t border-line bg-canvas/60 px-6 py-3.5">
            <button
              type="button"
              onClick={handleDelete}
              className="h-8 rounded-lg px-2.5 text-[11px] font-medium text-danger-ink transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/30"
            >
              Delete config
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={closeSettings}
                className="h-8 rounded-lg px-3 text-[11.5px] font-medium text-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-8 rounded-lg bg-accent px-3.5 text-[11.5px] font-semibold text-white shadow-[0_1px_2px_rgba(0,122,255,0.3)] transition-colors hover:bg-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                Save Settings
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}

export function ApiSettings() {
  const settingsOpen = useUiStore((state) => state.settingsOpen)

  return settingsOpen ? <ApiSettingsDialog /> : null
}
