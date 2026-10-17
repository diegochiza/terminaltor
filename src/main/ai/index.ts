import { ipcMain, type WebContents } from 'electron'
import type { AgentEvent, ContextBlock, ProviderId, ToolCallRequest, ToolResultInput, UserMessage } from '../../shared/ai'
import { providers, type History } from './providers'
import { providerConfig, saveProvider, selectModel, settingsView } from './settings'

const MAX_CONTEXT_OUTPUT = 8000
/** Límite de comandos seguidos por cada mensaje del usuario, para que el agente no quede en un ciclo. */
const MAX_STEPS = 25

const systemPrompt = `Eres el asistente integrado en Terminaltor, una terminal para Windows que usa PowerShell.
Responde en el idioma en que te escriba el usuario, de forma breve y práctica.

Puedes ejecutar comandos con la herramienta run_command. Cada comando lo ve y lo aprueba el usuario antes de que corra en su terminal, y luego recibes su salida y código de salida. Úsala cuando necesites información del sistema o para hacer lo que el usuario pidió; para preguntas que no lo requieren, responde sin ejecutar nada.
- Un comando por llamada, con una razón breve que el usuario entienda.
- Prefiere comandos de solo lectura para investigar antes de cambiar algo.
- No uses comandos interactivos que esperen respuesta del teclado (usa parámetros como -Confirm:$false solo si el usuario pidió el cambio).
- Si el usuario rechaza un comando, no insistas con el mismo: pregunta o propone otra forma.
Cuando muestres comandos sin ejecutarlos, escríbelos en bloques \`\`\`powershell.
Si el usuario adjunta bloques del terminal (comando, carpeta, código de salida y salida), úsalos para diagnosticar.`

function formatContext(blocks: ContextBlock[]): string {
  return blocks
    .map((b) => {
      const output =
        b.output.length > MAX_CONTEXT_OUTPUT ? '…' + b.output.slice(-MAX_CONTEXT_OUTPUT) : b.output || '(sin salida)'
      return [
        `Comando: ${b.command}`,
        b.cwd ? `Carpeta: ${b.cwd}` : '',
        b.exitCode !== undefined ? `Código de salida: ${b.exitCode}` : '',
        'Salida:',
        '```',
        output,
        '```'
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')
}

interface Conversation {
  provider: ProviderId
  model: string
  history: History
  pending: ToolCallRequest[]
  steps: number
  controller?: AbortController
}

const conversations = new Map<string, Conversation>()

async function runTurn(id: string, conversation: Conversation, sender: WebContents): Promise<void> {
  const send = (event: AgentEvent): void => {
    if (!sender.isDestroyed()) sender.send(`ai:event:${id}`, event)
  }
  const controller = new AbortController()
  conversation.controller = controller
  try {
    const result = await providers[conversation.provider].turn(providerConfig(conversation.provider), {
      model: conversation.model,
      system: systemPrompt,
      history: conversation.history,
      signal: controller.signal,
      onText: (text) => send({ type: 'text', text })
    })
    if (result.toolCalls.length > 0 && conversation.steps < MAX_STEPS) {
      conversation.steps += result.toolCalls.length
      conversation.pending = result.toolCalls
      send({ type: 'tool_calls', calls: result.toolCalls })
    } else {
      if (result.toolCalls.length > 0) {
        // Se cierran las llamadas pendientes para que el historial quede válido.
        providers[conversation.provider].addToolResults(
          conversation.history,
          result.toolCalls.map((c) => ({ id: c.id, name: c.name, output: 'Límite de comandos alcanzado.', isError: true }))
        )
        send({ type: 'text', text: `\n\n_(Se alcanzó el límite de ${MAX_STEPS} comandos seguidos. Escribe para continuar.)_` })
      }
      send({ type: 'done', model: result.model })
    }
  } catch (error) {
    if (controller.signal.aborted) send({ type: 'done', model: '' })
    else send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  } finally {
    conversation.controller = undefined
  }
}

export function registerAiHandlers(): void {
  ipcMain.handle('ai:settings', () => settingsView())
  ipcMain.handle('ai:saveProvider', (_e, id: ProviderId, update: { apiKey?: string; baseURL?: string }) => {
    saveProvider(id, update)
    return settingsView()
  })
  ipcMain.handle('ai:select', (_e, provider: ProviderId, model: string) => {
    selectModel(provider, model)
    return settingsView()
  })
  ipcMain.handle('ai:listModels', (_e, id: ProviderId) => providers[id].listModels(providerConfig(id)))

  ipcMain.on('ai:send', (event, id: string, message: UserMessage) => {
    const { provider, model } = settingsView().selected
    let conversation = conversations.get(id)
    // Si cambió el proveedor, el historial de otro formato no sirve: se empieza de nuevo.
    if (!conversation || conversation.provider !== provider) {
      conversation = { provider, model, history: [], pending: [], steps: 0 }
      conversations.set(id, conversation)
    }
    conversation.model = model
    conversation.steps = 0
    if (conversation.pending.length > 0) {
      // Llamadas sin responder (por ejemplo, se detuvo el agente): se marcan como canceladas.
      providers[provider].addToolResults(
        conversation.history,
        conversation.pending.map((c) => ({ id: c.id, name: c.name, output: 'Cancelado por el usuario.', isError: true }))
      )
      conversation.pending = []
    }
    const text = message.context.length > 0 ? `Contexto del terminal:\n\n${formatContext(message.context)}\n\n${message.text}` : message.text
    providers[provider].addUser(conversation.history, text)
    runTurn(id, conversation, event.sender)
  })

  ipcMain.on('ai:toolResults', (event, id: string, results: ToolResultInput[]) => {
    const conversation = conversations.get(id)
    if (!conversation || conversation.pending.length === 0) return
    const byId = new Map(results.map((r) => [r.id, r]))
    providers[conversation.provider].addToolResults(
      conversation.history,
      conversation.pending.map((c) => {
        const r = byId.get(c.id)
        return { id: c.id, name: c.name, output: r?.output ?? 'Sin resultado.', isError: r?.isError ?? true }
      })
    )
    conversation.pending = []
    runTurn(id, conversation, event.sender)
  })

  ipcMain.on('ai:cancel', (_e, id: string) => conversations.get(id)?.controller?.abort())
  ipcMain.on('ai:reset', (_e, id: string) => {
    conversations.get(id)?.controller?.abort()
    conversations.delete(id)
  })
}
