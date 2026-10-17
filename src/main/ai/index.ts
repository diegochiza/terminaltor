import { ipcMain } from 'electron'
import type { ChatEvent, ChatRequest, ContextBlock, ProviderId } from '../../shared/ai'
import { providers } from './providers'
import { providerConfig, saveProvider, selectModel, settingsView } from './settings'

const MAX_CONTEXT_OUTPUT = 8000

const systemPrompt = `Eres el asistente integrado en Terminaltor, una terminal para Windows que usa PowerShell.
Responde en el idioma en que te escriba el usuario, de forma breve y práctica.
Cuando propongas comandos, escríbelos en bloques de código \`\`\`powershell, un comando o script por bloque, listos para ejecutar en PowerShell.
Explica en una línea qué hace cada comando y avisa claramente si borra, sobrescribe o cambia algo del sistema.
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

const running = new Map<string, AbortController>()

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

  ipcMain.on('ai:chat', async (event, requestId: string, request: ChatRequest) => {
    const send = (e: ChatEvent): void => {
      if (!event.sender.isDestroyed()) event.sender.send(`ai:event:${requestId}`, e)
    }
    const controller = new AbortController()
    running.set(requestId, controller)
    try {
      const { provider, model } = settingsView().selected
      const messages = request.messages.map((m) => ({ ...m }))
      const last = messages[messages.length - 1]
      if (last && request.context.length > 0) {
        last.content = `Contexto del terminal:\n\n${formatContext(request.context)}\n\n${last.content}`
      }
      const served = await providers[provider].stream(providerConfig(provider), {
        model,
        system: systemPrompt,
        messages,
        signal: controller.signal,
        onText: (text) => send({ type: 'text', text })
      })
      send({ type: 'done', model: served })
    } catch (error) {
      if (controller.signal.aborted) send({ type: 'done', model: '' })
      else send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      running.delete(requestId)
    }
  })
  ipcMain.on('ai:cancel', (_e, requestId: string) => running.get(requestId)?.abort())
}
