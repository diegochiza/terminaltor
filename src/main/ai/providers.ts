import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenAI, type Content, type Part } from '@google/genai'
import { Ollama, type Message as OllamaMessage } from 'ollama'
import type { ProviderId, ToolCallRequest } from '../../shared/ai'
import type { ProviderConfig } from './settings'

/**
 * Cada proveedor guarda el historial en su propio formato (así se conservan
 * intactos los bloques que la API exige devolver, como el razonamiento de Claude
 * o las firmas de Gemini). Afuera solo se ve como un arreglo opaco.
 */
export type History = unknown[]

export interface ToolResult {
  id: string
  name: string
  output: string
  isError: boolean
}

export interface TurnOptions {
  model: string
  system: string
  history: History
  signal: AbortSignal
  onText(text: string): void
}

export interface TurnResult {
  toolCalls: ToolCallRequest[]
  /** Modelo que respondió (puede cambiar si hubo un respaldo). */
  model: string
}

interface Provider {
  listModels(config: ProviderConfig): Promise<string[]>
  /** Agrega un mensaje del usuario al historial. */
  addUser(history: History, text: string): void
  /** Agrega los resultados de las herramientas al historial. */
  addToolResults(history: History, results: ToolResult[]): void
  /** Pide un turno al modelo; agrega su respuesta al historial y devuelve las herramientas que pidió. */
  turn(config: ProviderConfig, options: TurnOptions): Promise<TurnResult>
}

export const RUN_COMMAND = 'run_command'
const runCommandDescription =
  'Ejecuta un comando de PowerShell en el terminal del usuario y devuelve su salida y código de salida. ' +
  'El usuario ve el comando y debe aprobarlo antes de que se ejecute; puede editarlo o rechazarlo. ' +
  'Úsalo para inspeccionar el sistema o hacer lo que el usuario pidió. Un comando por llamada.'
const runCommandSchema = {
  type: 'object' as const,
  properties: {
    command: { type: 'string' as const, description: 'Comando o script de PowerShell a ejecutar.' },
    reason: { type: 'string' as const, description: 'Explicación breve, para el usuario, de por qué hace falta.' }
  },
  required: ['command', 'reason'],
  additionalProperties: false
}

/** Valida los argumentos que mandó el modelo; si no son válidos, el comando no se ofrece. */
function toToolCall(id: string, name: string, args: unknown): ToolCallRequest {
  const input = (typeof args === 'string' ? safeParse(args) : args) as Record<string, unknown> | undefined
  if (name !== RUN_COMMAND || typeof input?.command !== 'string' || !input.command.trim()) {
    return { id, name, command: '', reason: '', invalid: true }
  }
  return { id, name, command: input.command, reason: typeof input.reason === 'string' ? input.reason : '' }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function requireKey(config: ProviderConfig): string {
  if (!config.apiKey) throw new Error('Falta la clave de API. Agrégala en la configuración del proveedor.')
  return config.apiKey
}

const anthropic: Provider = {
  async listModels(config) {
    const client = new Anthropic({ apiKey: requireKey(config) })
    const ids: string[] = []
    for await (const model of client.models.list()) ids.push(model.id)
    return ids
  },
  addUser(history, text) {
    history.push({ role: 'user', content: text })
  },
  addToolResults(history, results) {
    history.push({
      role: 'user',
      content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.output, is_error: r.isError }))
    })
  },
  async turn(config, { model, system, history, signal, onText }) {
    const client = new Anthropic({ apiKey: requireKey(config) })
    // fallbacks "default": si el modelo rechaza la petición por política, la API la
    // reintenta en el modelo de respaldo recomendado; en modelos sin respaldo no cambia nada.
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 64000,
        system,
        messages: history as Anthropic.Beta.BetaMessageParam[],
        tools: [
          {
            name: RUN_COMMAND,
            description: runCommandDescription,
            input_schema: runCommandSchema,
            strict: true,
            eager_input_streaming: true
          }
        ],
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default'
      },
      { signal }
    )
    stream.on('text', onText)
    const final = await stream.finalMessage()
    if (final.stop_reason === 'refusal') {
      onText('\n\n_(El modelo rechazó responder esta petición.)_')
      return { toolCalls: [], model: final.model }
    }
    // El contenido completo (incluidos los bloques de razonamiento) se devuelve tal cual.
    history.push({ role: 'assistant', content: final.content })
    // Con max_tokens la entrada de una herramienta puede venir truncada: no se ejecuta.
    const truncated = final.stop_reason === 'max_tokens'
    const toolCalls = final.content
      .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
      .map((b) => (truncated ? { id: b.id, name: b.name, command: '', reason: '', invalid: true } : toToolCall(b.id, b.name, b.input)))
    return { toolCalls, model: final.model }
  }
}

const openai: Provider = {
  async listModels(config) {
    const client = new OpenAI({ apiKey: requireKey(config), baseURL: config.baseURL })
    const ids: string[] = []
    for await (const model of client.models.list()) ids.push(model.id)
    return ids.sort()
  },
  addUser(history, text) {
    history.push({ role: 'user', content: text })
  },
  addToolResults(history, results) {
    for (const r of results) history.push({ role: 'tool', tool_call_id: r.id, content: r.output })
  },
  async turn(config, { model, system, history, signal, onText }) {
    const client = new OpenAI({ apiKey: requireKey(config), baseURL: config.baseURL })
    const stream = await client.chat.completions.create(
      {
        model,
        stream: true,
        messages: [{ role: 'system', content: system }, ...(history as OpenAI.Chat.ChatCompletionMessageParam[])],
        tools: [
          {
            type: 'function',
            function: { name: RUN_COMMAND, description: runCommandDescription, parameters: runCommandSchema, strict: true }
          }
        ]
      },
      { signal }
    )
    let served = model
    let content = ''
    const calls: Array<{ id: string; name: string; arguments: string }> = []
    for await (const chunk of stream) {
      served = chunk.model || served
      const delta = chunk.choices[0]?.delta
      if (delta?.content) {
        content += delta.content
        onText(delta.content)
      }
      for (const call of delta?.tool_calls ?? []) {
        const slot = (calls[call.index] ??= { id: '', name: '', arguments: '' })
        if (call.id) slot.id = call.id
        if (call.function?.name) slot.name += call.function.name
        if (call.function?.arguments) slot.arguments += call.function.arguments
      }
    }
    history.push({
      role: 'assistant',
      content: content || null,
      ...(calls.length > 0 && {
        tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } }))
      })
    })
    return { toolCalls: calls.map((c) => toToolCall(c.id, c.name, c.arguments)), model: served }
  }
}

const gemini: Provider = {
  async listModels(config) {
    const client = new GoogleGenAI({ apiKey: requireKey(config), httpOptions: { baseUrl: config.baseURL } })
    const ids: string[] = []
    for await (const model of await client.models.list()) {
      if (model.name && model.supportedActions?.includes('generateContent')) ids.push(model.name.replace(/^models\//, ''))
    }
    return ids
  },
  addUser(history, text) {
    history.push({ role: 'user', parts: [{ text }] } satisfies Content)
  },
  addToolResults(history, results) {
    history.push({
      role: 'user',
      parts: results.map((r) => ({
        functionResponse: { id: r.id, name: r.name, response: r.isError ? { error: r.output } : { output: r.output } }
      }))
    } satisfies Content)
  },
  async turn(config, { model, system, history, signal, onText }) {
    const client = new GoogleGenAI({ apiKey: requireKey(config), httpOptions: { baseUrl: config.baseURL } })
    const stream = await client.models.generateContentStream({
      model,
      contents: history as Content[],
      config: {
        systemInstruction: system,
        abortSignal: signal,
        tools: [{ functionDeclarations: [{ name: RUN_COMMAND, description: runCommandDescription, parametersJsonSchema: runCommandSchema }] }]
      }
    })
    // Se guardan todas las partes tal como llegan (Gemini exige devolver sus firmas de razonamiento).
    const parts: Part[] = []
    for await (const chunk of stream) {
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        parts.push(part)
        if (part.text && !part.thought) onText(part.text)
      }
    }
    history.push({ role: 'model', parts } satisfies Content)
    const toolCalls = parts
      .filter((p) => p.functionCall)
      .map((p, i) => toToolCall(p.functionCall!.id ?? `call_${history.length}_${i}`, p.functionCall!.name ?? '', p.functionCall!.args))
    return { toolCalls, model }
  }
}

const ollama: Provider = {
  async listModels(config) {
    const client = new Ollama({ host: config.baseURL })
    const { models } = await client.list()
    return models.map((m) => m.name)
  },
  addUser(history, text) {
    history.push({ role: 'user', content: text } satisfies OllamaMessage)
  },
  addToolResults(history, results) {
    for (const r of results) history.push({ role: 'tool', tool_name: r.name, content: r.output } satisfies OllamaMessage)
  },
  async turn(config, { model, system, history, signal, onText }) {
    const client = new Ollama({ host: config.baseURL })
    signal.addEventListener('abort', () => client.abort())
    const request = {
      model,
      stream: true as const,
      messages: [{ role: 'system', content: system }, ...(history as OllamaMessage[])]
    }
    const tools = [{ type: 'function', function: { name: RUN_COMMAND, description: runCommandDescription, parameters: runCommandSchema } }]
    let stream
    try {
      stream = await client.chat({ ...request, tools })
    } catch (error) {
      // Algunos modelos locales no aceptan herramientas: se sigue como chat normal.
      if (!/does not support tools/i.test(String(error))) throw error
      onText('_(Este modelo no admite ejecutar comandos; responde solo con texto.)_\n\n')
      stream = await client.chat(request)
    }
    let content = ''
    const calls: OllamaMessage['tool_calls'] = []
    for await (const part of stream) {
      if (part.message?.content) {
        content += part.message.content
        onText(part.message.content)
      }
      calls.push(...(part.message?.tool_calls ?? []))
    }
    history.push({ role: 'assistant', content, ...(calls.length > 0 && { tool_calls: calls }) } satisfies OllamaMessage)
    const toolCalls = calls.map((c, i) => toToolCall(`ollama_${history.length}_${i}`, c.function.name, c.function.arguments))
    return { toolCalls, model }
  }
}

export const providers: Record<ProviderId, Provider> = { anthropic, openai, gemini, ollama }
