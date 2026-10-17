import { useEffect, useRef } from 'react'
import { Terminal, type IDecoration } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { AppTheme } from './themes'
import { BlockTracker, type Block, type BlockStatus } from './blocks/BlockTracker'


const rulerColors: Record<BlockStatus, string> = {
  running: '#7aa2f7',
  success: '#3fb950',
  error: '#f85149'
}

export interface TerminalHandle {
  tracker: BlockTracker
  scrollToBlock(id: number): void
  /** Escribe texto en la línea de comandos sin ejecutarlo. */
  insert(text: string): void
  /** Ejecuta un comando en el terminal y espera a que termine su bloque. */
  run(command: string): Promise<Block>
  /** Interrumpe el comando en curso (Ctrl+C). */
  interrupt(): void
  focus(): void
}

interface Props {
  theme: AppTheme
  fontSize: number
  onReady(handle: TerminalHandle | null): void
}

export default function TerminalView({ theme, fontSize, onReady }: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const initial = useRef({ theme, fontSize })
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
      fontSize: initial.current.fontSize,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 10000,
      overviewRuler: { width: 8 },
      theme: initial.current.theme.terminal
    })
    termRef.current = term
    const fit = new FitAddon()
    fitRef.current = fit
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(container)
    fit.fit()

    const { pty, clipboard } = window.terminaltor
    const tracker = new BlockTracker(term)
    const decorations = new Map<number, IDecoration>()

    // Marca de color a la izquierda de cada bloque y en la barra de desplazamiento.
    const paint = (decoration: IDecoration, block: Block): void => {
      decoration.options.overviewRulerOptions = { color: rulerColors[block.status], position: 'left' }
      if (decoration.element) decoration.element.dataset.status = block.status
    }
    tracker.onBlockStarted((block, markers) => {
      const decoration = term.registerDecoration({
        marker: markers.prompt ?? markers.output,
        overviewRulerOptions: { color: rulerColors.running, position: 'left' }
      })
      if (!decoration) return
      decoration.onRender((element) => {
        element.classList.add('block-mark')
        element.dataset.status = block.status
        element.title = block.command
      })
      decorations.set(block.id, decoration)
    })
    tracker.onBlockFinished((block) => {
      const decoration = decorations.get(block.id)
      if (decoration) paint(decoration, block)
    })

    const blockLines = (): number[] =>
      tracker.blocks.map((b) => tracker.blockLine(b.id)).filter((l): l is number => l !== undefined)

    // Ctrl+Shift+Flechas salta entre bloques; Ctrl+Shift+C/V copia y pega.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown' || !event.ctrlKey || !event.shiftKey) return true
      const top = term.buffer.active.viewportY
      if (event.key === 'ArrowUp') {
        const line = blockLines().filter((l) => l < top).pop()
        if (line !== undefined) term.scrollToLine(line)
        return false
      }
      if (event.key === 'ArrowDown') {
        const line = blockLines().find((l) => l > top)
        if (line !== undefined) term.scrollToLine(line)
        else term.scrollToBottom()
        return false
      }
      if (event.key === 'C') {
        if (term.hasSelection()) clipboard.writeText(term.getSelection())
        return false
      }
      if (event.key === 'V') {
        clipboard.readText().then((text) => term.paste(text))
        return false
      }
      return true
    })

    let ptyId: number | undefined
    let disposed = false
    const cleanups: Array<() => void> = []

    pty.start({ cols: term.cols, rows: term.rows }).then((id) => {
      if (disposed) {
        pty.kill(id)
        return
      }
      ptyId = id
      cleanups.push(pty.onData(id, (data) => term.write(data)))
      cleanups.push(
        pty.onExit(id, (code) => {
          tracker.shellExited(code)
          term.write(`\r\n[proceso terminado con código ${code}]\r\n`)
        })
      )
      const input = term.onData((data) => pty.write(id, data))
      cleanups.push(() => input.dispose())
    })

    // Cualquier cambio de columnas o filas (ventana, tamaño de letra) se avisa a la shell.
    const resize = term.onResize(({ cols, rows }) => {
      if (ptyId !== undefined) pty.resize(ptyId, cols, rows)
    })
    cleanups.push(() => resize.dispose())
    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(container)
    term.focus()

    onReadyRef.current({
      tracker,
      scrollToBlock: (id) => {
        const line = tracker.blockLine(id)
        if (line !== undefined) term.scrollToLine(line)
        term.focus()
      },
      run: (command) =>
        new Promise<Block>((resolve, reject) => {
          if (ptyId === undefined || !tracker.active) {
            reject(new Error('El terminal no está listo (no se detectó la integración con PowerShell).'))
            return
          }
          if (tracker.busy) {
            reject(new Error('Ya hay un comando corriendo en el terminal.'))
            return
          }
          let blockId: number | undefined
          const offStart = tracker.onBlockStarted((block) => {
            if (blockId === undefined) blockId = block.id
            offStart()
          })
          const offFinish = tracker.onBlockFinished((block) => {
            if (block.id !== blockId) return
            offFinish()
            resolve(block)
          })
          term.scrollToBottom()
          term.paste(command)
          pty.write(ptyId, '\r')
        }),
      interrupt: () => {
        if (ptyId !== undefined) pty.write(ptyId, '\x03')
      },
      insert: (text) => {
        term.paste(text)
        term.focus()
      },
      focus: () => term.focus()
    })

    return () => {
      disposed = true
      onReadyRef.current(null)
      observer.disconnect()
      cleanups.forEach((cleanup) => cleanup())
      if (ptyId !== undefined) pty.kill(ptyId)
      tracker.dispose()
      termRef.current = null
      term.dispose()
    }
  }, [])

  // Cambios de tema y tamaño de letra sin reiniciar la shell.
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = theme.terminal
    term.options.fontSize = fontSize
    fitRef.current?.fit()
  }, [theme, fontSize])

  return <div className="terminal" ref={containerRef} />
}
