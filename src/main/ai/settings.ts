import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { PROVIDERS, type AiSettingsView, type ProviderId } from '../../shared/ai'

interface StoredProvider {
  /** Clave de API cifrada con safeStorage (DPAPI en Windows), en base64. */
  apiKey?: string
  baseURL?: string
}

interface StoredSettings {
  providers: Partial<Record<ProviderId, StoredProvider>>
  selected: { provider: ProviderId; model: string }
}

export interface ProviderConfig {
  apiKey?: string
  baseURL?: string
}

const defaults: StoredSettings = {
  providers: {},
  selected: { provider: 'anthropic', model: 'claude-opus-5-5' }
}

function file(): string {
  return join(app.getPath('userData'), 'ai-settings.json')
}

function load(): StoredSettings {
  try {
    if (existsSync(file())) return { ...defaults, ...JSON.parse(readFileSync(file(), 'utf8')) }
  } catch {
    // Archivo dañado: se empieza de cero.
  }
  return structuredClone(defaults)
}

function save(settings: StoredSettings): void {
  writeFileSync(file(), JSON.stringify(settings, null, 2), 'utf8')
}

export function settingsView(): AiSettingsView {
  const stored = load()
  const providers = {} as AiSettingsView['providers']
  for (const p of PROVIDERS) {
    const s = stored.providers[p.id] ?? {}
    providers[p.id] = { hasKey: Boolean(s.apiKey), baseURL: s.baseURL ?? p.defaultBaseURL }
  }
  return { providers, selected: stored.selected }
}

export function providerConfig(id: ProviderId): ProviderConfig {
  const s = load().providers[id] ?? {}
  const info = PROVIDERS.find((p) => p.id === id)
  let apiKey: string | undefined
  if (s.apiKey) {
    const buffer = Buffer.from(s.apiKey, 'base64')
    apiKey = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buffer) : buffer.toString('utf8')
  }
  return { apiKey, baseURL: s.baseURL ?? info?.defaultBaseURL }
}

/** apiKey: undefined deja la clave como está, '' la borra. */
export function saveProvider(id: ProviderId, update: { apiKey?: string; baseURL?: string }): void {
  const stored = load()
  const current = stored.providers[id] ?? {}
  if (update.apiKey !== undefined) {
    const key = update.apiKey.trim()
    current.apiKey = key
      ? (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key) : Buffer.from(key, 'utf8')).toString(
          'base64'
        )
      : undefined
  }
  if (update.baseURL !== undefined) current.baseURL = update.baseURL.trim() || undefined
  stored.providers[id] = current
  save(stored)
}

export function selectModel(provider: ProviderId, model: string): void {
  const stored = load()
  stored.selected = { provider, model }
  save(stored)
}
