export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'ollama'

export interface ProviderInfo {
  id: ProviderId
  name: string
  needsKey: boolean
  /** Permite cambiar la URL base (OpenAI compatible u Ollama). */
  hasBaseURL: boolean
  defaultBaseURL?: string
  defaultModels: string[]
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'anthropic',
    name: 'Claude',
    needsKey: true,
    hasBaseURL: false,
    defaultModels: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1']
  },
  {
    id: 'openai',
    name: 'OpenAI',
    needsKey: true,
    hasBaseURL: true,
    defaultBaseURL: 'https://api.openai.com/v1',
    defaultModels: []
  },
  {
    id: 'gemini',
    name: 'Gemini',
    needsKey: true,
    hasBaseURL: false,
    defaultModels: []
  },
  {
    id: 'ollama',
    name: 'Ollama',
    needsKey: false,
    hasBaseURL: true,
    defaultBaseURL: 'http://localhost:11434',
    defaultModels: []
  }
]

export interface ProviderSettingsView {
  hasKey: boolean
  baseURL?: string
}

export interface AiSettingsView {
  providers: Record<ProviderId, ProviderSettingsView>
  selected: { provider: ProviderId; model: string }
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ContextBlock {
  command: string
  cwd?: string
  exitCode?: number
  output: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  /** Bloques del terminal adjuntos al último mensaje del usuario. */
  context: ContextBlock[]
}

export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; model: string }
  | { type: 'error'; message: string }
