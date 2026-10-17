import type { AiSettingsView, ChatEvent, ChatRequest, ProviderId } from './ai'

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
    chat(requestId: string, request: ChatRequest): void
    cancel(requestId: string): void
    onEvent(requestId: string, listener: (event: ChatEvent) => void): () => void
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
