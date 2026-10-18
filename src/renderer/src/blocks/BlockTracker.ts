import type { IDisposable, IMarker, Terminal } from '@xterm/xterm'

export type BlockStatus = 'running' | 'success' | 'error'

export interface Block {
  id: number
  command: string
  cwd?: string
  status: BlockStatus
  exitCode?: number
  startedAt: number
  durationMs?: number
  /** Salida del comando, capturada al terminar. */
  output: string
}

export interface BlockMarkers {
  prompt?: IMarker
  output: IMarker
}

type Listener = (block: Block, markers: BlockMarkers) => void

const MAX_BLOCKS = 500
const MAX_OUTPUT_CHARS = 200_000

function decodeBase64(value: string): string {
  try {
    const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return ''
  }
}

/**
 * Escucha las secuencias OSC que emite la integración de la shell y arma la lista
 * de bloques (comando + salida + código de salida).
 */
export class BlockTracker implements IDisposable {
  readonly blocks: Block[] = []
  private readonly markers = new Map<number, BlockMarkers>()
  private readonly disposables: IDisposable[] = []
  private readonly startListeners = new Set<Listener>()
  private readonly finishListeners = new Set<Listener>()
  private readonly cwdListeners = new Set<(cwd: string) => void>()
  private nextId = 1
  private cwd?: string
  private pendingCommand?: string
  private promptMarker?: IMarker
  private current?: Block

  constructor(private readonly term: Terminal) {
    this.disposables.push(
      term.parser.registerOscHandler(133, (data) => this.handleSemanticPrompt(data)),
      term.parser.registerOscHandler(7717, (data) => this.handleTerminaltor(data))
    )
  }

  /** true cuando la shell está enviando las marcas (si no, no hay bloques). */
  get active(): boolean {
    return this.cwd !== undefined
  }

  /** Carpeta actual de la shell, según la última marca recibida. */
  get workingDirectory(): string | undefined {
    return this.cwd
  }

  /** true mientras un comando está corriendo. */
  get busy(): boolean {
    return this.current !== undefined
  }

  onBlockStarted(listener: Listener): () => void {
    this.startListeners.add(listener)
    return () => this.startListeners.delete(listener)
  }

  onBlockFinished(listener: Listener): () => void {
    this.finishListeners.add(listener)
    return () => this.finishListeners.delete(listener)
  }

  onCwdChanged(listener: (cwd: string) => void): () => void {
    this.cwdListeners.add(listener)
    return () => this.cwdListeners.delete(listener)
  }

  /** Línea del buffer donde empieza el bloque, o undefined si ya salió del historial. */
  blockLine(id: number): number | undefined {
    const markers = this.markers.get(id)
    const marker = markers?.prompt && !markers.prompt.isDisposed ? markers.prompt : markers?.output
    return marker && !marker.isDisposed ? marker.line : undefined
  }

  /** La shell terminó (por ejemplo con exit): cierra el bloque que estaba corriendo. */
  shellExited(exitCode: number): void {
    this.finishBlock(exitCode)
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose())
    this.startListeners.clear()
    this.finishListeners.clear()
    this.cwdListeners.clear()
  }

  private handleSemanticPrompt(data: string): boolean {
    const [kind, arg] = data.split(';')
    switch (kind) {
      case 'A':
        this.promptMarker = this.term.registerMarker(0)
        break
      case 'C':
        this.startBlock()
        break
      case 'D':
        this.finishBlock(arg === undefined ? undefined : Number(arg))
        break
    }
    return true
  }

  private handleTerminaltor(data: string): boolean {
    const separator = data.indexOf(';')
    const key = data.slice(0, separator)
    const value = decodeBase64(data.slice(separator + 1))
    if (key === 'Cwd' && value !== this.cwd) {
      this.cwd = value
      this.cwdListeners.forEach((l) => l(value))
    }
    if (key === 'Cmd') this.pendingCommand = value
    return true
  }

  private startBlock(): void {
    const command = (this.pendingCommand ?? '').trim()
    this.pendingCommand = undefined
    // Enter en una línea vacía no genera bloque.
    if (!command) {
      this.promptMarker?.dispose()
      this.promptMarker = undefined
      return
    }
    const output = this.term.registerMarker(0)
    const block: Block = {
      id: this.nextId++,
      command,
      cwd: this.cwd,
      status: 'running',
      startedAt: Date.now(),
      output: ''
    }
    const markers = { prompt: this.promptMarker, output }
    this.promptMarker = undefined
    this.current = block
    this.blocks.push(block)
    this.markers.set(block.id, markers)
    this.trim()
    this.startListeners.forEach((l) => l(block, markers))
  }

  private finishBlock(exitCode: number | undefined): void {
    const block = this.current
    if (!block) return
    this.current = undefined
    const markers = this.markers.get(block.id)!
    block.exitCode = Number.isFinite(exitCode) ? exitCode : undefined
    block.status = block.exitCode === undefined || block.exitCode === 0 ? 'success' : 'error'
    block.durationMs = Date.now() - block.startedAt
    block.output = markers.output.isDisposed ? '' : this.readOutput(markers.output.line)
    this.finishListeners.forEach((l) => l(block, markers))
  }

  private readOutput(startLine: number): string {
    const buffer = this.term.buffer.active
    const cursorLine = buffer.baseY + buffer.cursorY
    const endLine = buffer.cursorX > 0 ? cursorLine : cursorLine - 1
    const lines: string[] = []
    for (let y = startLine; y <= endLine; y++) {
      const line = buffer.getLine(y)
      if (!line) continue
      const text = line.translateToString(true)
      if (line.isWrapped && lines.length > 0) lines[lines.length - 1] += text
      else lines.push(text)
    }
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
    const output = lines.join('\n')
    return output.length > MAX_OUTPUT_CHARS ? output.slice(-MAX_OUTPUT_CHARS) : output
  }

  private trim(): void {
    while (this.blocks.length > MAX_BLOCKS) {
      const old = this.blocks.shift()!
      const markers = this.markers.get(old.id)
      markers?.prompt?.dispose()
      markers?.output.dispose()
      this.markers.delete(old.id)
    }
  }
}
