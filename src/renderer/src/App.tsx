import { useCallback, useEffect, useState } from 'react'
import TerminalView, { type TerminalHandle } from './TerminalView'
import BlocksPanel from './blocks/BlocksPanel'
import type { Block } from './blocks/BlockTracker'

export default function App(): React.JSX.Element {
  const [handle, setHandle] = useState<TerminalHandle | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [panelOpen, setPanelOpen] = useState(true)

  const onReady = useCallback((h: TerminalHandle | null) => setHandle(h), [])

  useEffect(() => {
    if (!handle) return
    const refresh = (): void => setBlocks(handle.tracker.blocks.map((b) => ({ ...b })))
    const offStart = handle.tracker.onBlockStarted(refresh)
    const offFinish = handle.tracker.onBlockFinished(refresh)
    refresh()
    return () => {
      offStart()
      offFinish()
    }
  }, [handle])

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">Terminaltor</span>
        <button
          className={`toolbar-button${panelOpen ? ' active' : ''}`}
          onClick={() => setPanelOpen((open) => !open)}
          title="Mostrar u ocultar el panel de bloques"
        >
          Bloques{blocks.length > 0 ? ` (${blocks.length})` : ''}
        </button>
      </header>
      <div className="body">
        <main className="workspace">
          <TerminalView onReady={onReady} />
        </main>
        {panelOpen && handle && (
          <BlocksPanel
            blocks={blocks}
            onSelect={(id) => handle.scrollToBlock(id)}
            onCopy={(text) => {
              window.terminaltor.clipboard.writeText(text)
              handle.focus()
            }}
          />
        )}
      </div>
    </div>
  )
}
