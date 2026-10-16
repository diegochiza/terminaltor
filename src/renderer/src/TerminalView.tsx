import { useEffect, useRef } from 'react'
import { Terminal, type IDecoration } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { BlockTracker, type Block, type BlockStatus } from './blocks/BlockTracker'

const theme = {
  background: '#0f1117',
  foreground: '#e6e6e6',
  cursor: '#7aa2f7',
  selectionBackground: '#33467c',
  overviewRulerBorder: '#262b38'
}

const rulerColors: Record<BlockStatus, string> = {
  running: '#7aa2f7',
  success: '#3fb950',
  error: '#f85149'
}

export interface TerminalHandle {
  tracker: BlockTracker
  scrollToBlock(id: number): void
  focus(): void
}

interface Props {
  onReady(handle: TerminalHandle | null): void
}

export default function TerminalView({ onReady }: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
      fontSize: 14,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 10000,
      overviewRuler: { width: 8 },
      theme
    })
    const fit = new FitAddon()
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

    const observer = new ResizeObserver(() => {
      fit.fit()
      if (ptyId !== undefined) pty.resize(ptyId, term.cols, term.rows)
    })
    observer.observe(container)
    term.focus()

    onReadyRef.current({
      tracker,
      scrollToBlock: (id) => {
        const line = tracker.blockLine(id)
        if (line !== undefined) term.scrollToLine(line)
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
      term.dispose()
    }
  }, [])

  return <div className="terminal" ref={containerRef} />
}
