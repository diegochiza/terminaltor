import type { AgentEvent, AiSettingsView, ProviderId, ToolResultInput, UserMessage } from './ai'

export interface PtyStartOptions {
  cols: number
  rows: number
  cwd?: string
}

export interface TerminaltorApi {
  platform: NodeJS.Platform
  clipboard: {
    writeText(text: string): void
    readText(): Promise<string>
  }
  ai: {
    settings(): Promise<AiSettingsView>
    saveProvider(id: ProviderId, update: { apiKey?: string; baseURL?: string }): Promise<AiSettingsView>
    select(provider: ProviderId, model: string): Promise<AiSettingsView>
    listModels(id: ProviderId): Promise<string[]>
    /** Envía un mensaje en una conversación (se crea si no existe). */
    send(conversationId: string, message: UserMessage): void
    /** Devuelve a la IA el resultado de los comandos que pidió y sigue la conversación. */
    toolResults(conversationId: string, results: ToolResultInput[]): void
    cancel(conversationId: string): void
    reset(conversationId: string): void
    onEvent(conversationId: string, listener: (event: AgentEvent) => void): () => void
  }
  pty: {
    start(options: PtyStartOptions): Promise<number>
    write(id: number, data: string): void
    resize(id: number, cols: number, rows: number): void
    kill(id: number): void
    onData(id: number, listener: (data: string) => void): () => void
    onExit(id: number, listener: (exitCode: number) => void): () => void
  }
}
