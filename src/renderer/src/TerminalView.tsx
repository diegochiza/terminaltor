import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'

const theme = {
  background: '#0f1117',
  foreground: '#e6e6e6',
  cursor: '#7aa2f7',
  selectionBackground: '#33467c'
}

export default function TerminalView(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
      fontSize: 14,
      cursorBlink: true,
      allowProposedApi: true,
      theme
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(container)
    fit.fit()

    const { pty } = window.terminaltor
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
        pty.onExit(id, (code) => term.write(`\r\n[proceso terminado con código ${code}]\r\n`))
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

    return () => {
      disposed = true
      observer.disconnect()
      cleanups.forEach((cleanup) => cleanup())
      if (ptyId !== undefined) pty.kill(ptyId)
      term.dispose()
    }
  }, [])

  return <div className="terminal" ref={containerRef} />
}
