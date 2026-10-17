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

export interface ContextBlock {
  command: string
  cwd?: string
  exitCode?: number
  output: string
}

/** Comando que la IA quiere ejecutar; el usuario debe aprobarlo. */
export interface ToolCallRequest {
  id: string
  name: string
  command: string
  reason: string
  /** Argumentos inválidos o truncados: no se ofrece para ejecutar. */
  invalid?: boolean
}

export interface ToolResultInput {
  id: string
  output: string
  isError: boolean
}

export interface UserMessage {
  text: string
  /** Bloques del terminal adjuntos a este mensaje. */
  context: ContextBlock[]
}

export type AgentEvent =
  | { type: 'text'; text: string }
  /** El turno terminó pidiendo comandos: se espera toolResults() para seguir. */
  | { type: 'tool_calls'; calls: ToolCallRequest[] }
  | { type: 'done'; model: string }
  | { type: 'error'; message: string }
