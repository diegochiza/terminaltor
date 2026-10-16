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
  pty: {
    start(options: PtyStartOptions): Promise<number>
    write(id: number, data: string): void
    resize(id: number, cols: number, rows: number): void
    kill(id: number): void
    onData(id: number, listener: (data: string) => void): () => void
    onExit(id: number, listener: (exitCode: number) => void): () => void
  }
}
