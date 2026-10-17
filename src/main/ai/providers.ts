import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import { Ollama } from 'ollama'
import type { ChatMessage, ProviderId } from '../../shared/ai'
import type { ProviderConfig } from './settings'

export interface StreamOptions {
  model: string
  system: string
  messages: ChatMessage[]
  signal: AbortSignal
  onText(text: string): void
}

interface Provider {
  listModels(config: ProviderConfig): Promise<string[]>
  /** Devuelve el modelo que respondió (puede cambiar si hubo un respaldo). */
  stream(config: ProviderConfig, options: StreamOptions): Promise<string>
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
  async stream(config, { model, system, messages, signal, onText }) {
    const client = new Anthropic({ apiKey: requireKey(config) })
    // fallbacks "default": si el modelo rechaza la petición por política, la API
    // la reintenta en el modelo de respaldo recomendado. En modelos sin respaldo
    // no cambia nada.
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 64000,
        system,
        messages,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default'
      },
      { signal }
    )
    stream.on('text', onText)
    const final = await stream.finalMessage()
    if (final.stop_reason === 'refusal') {
      onText('\n\n_(El modelo rechazó responder esta petición.)_')
    }
    return final.model
  }
}

const openai: Provider = {
  async listModels(config) {
    const client = new OpenAI({ apiKey: requireKey(config), baseURL: config.baseURL })
    const ids: string[] = []
    for await (const model of client.models.list()) ids.push(model.id)
    return ids.sort()
  },
  async stream(config, { model, system, messages, signal, onText }) {
    const client = new OpenAI({ apiKey: requireKey(config), baseURL: config.baseURL })
    const stream = await client.chat.completions.create(
      { model, stream: true, messages: [{ role: 'system', content: system }, ...messages] },
      { signal }
    )
    let served = model
    for await (const chunk of stream) {
      served = chunk.model || served
      const text = chunk.choices[0]?.delta?.content
      if (text) onText(text)
    }
    return served
  }
}

const gemini: Provider = {
  async listModels(config) {
    const client = new GoogleGenAI({ apiKey: requireKey(config) })
    const ids: string[] = []
    for await (const model of await client.models.list()) {
      if (model.name && model.supportedActions?.includes('generateContent')) {
        ids.push(model.name.replace(/^models\//, ''))
      }
    }
    return ids
  },
  async stream(config, { model, system, messages, signal, onText }) {
    const client = new GoogleGenAI({ apiKey: requireKey(config) })
    const stream = await client.models.generateContentStream({
      model,
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      config: { systemInstruction: system, abortSignal: signal }
    })
    for await (const chunk of stream) {
      if (chunk.text) onText(chunk.text)
    }
    return model
  }
}

const ollama: Provider = {
  async listModels(config) {
    const client = new Ollama({ host: config.baseURL })
    const { models } = await client.list()
    return models.map((m) => m.name)
  },
  async stream(config, { model, system, messages, signal, onText }) {
    const client = new Ollama({ host: config.baseURL })
    signal.addEventListener('abort', () => client.abort())
    const stream = await client.chat({
      model,
      stream: true,
      messages: [{ role: 'system', content: system }, ...messages]
    })
    for await (const part of stream) {
      if (part.message?.content) onText(part.message.content)
    }
    return model
  }
}

export const providers: Record<ProviderId, Provider> = { anthropic, openai, gemini, ollama }
