import { useCallback, useEffect, useState } from 'react'
import TerminalView, { type TerminalHandle } from './TerminalView'
import BlocksPanel from './blocks/BlocksPanel'
import type { Block } from './blocks/BlockTracker'
import AiPanel from './ai/AiPanel'
import type { ContextBlock } from '../../shared/ai'

type Tab = 'blocks' | 'ai'

export default function App(): React.JSX.Element {
  const [handle, setHandle] = useState<TerminalHandle | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [panelOpen, setPanelOpen] = useState(true)
  const [tab, setTab] = useState<Tab>('blocks')
  const [attached, setAttached] = useState<ContextBlock[]>([])

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

  const copy = (text: string): void => {
    window.terminaltor.clipboard.writeText(text)
  }

  const openTab = (next: Tab): void => {
    if (panelOpen && tab === next) setPanelOpen(false)
    else {
      setTab(next)
      setPanelOpen(true)
    }
  }

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">Terminaltor</span>
        <div className="toolbar-tabs">
          <button
            className={`toolbar-button${panelOpen && tab === 'blocks' ? ' active' : ''}`}
            onClick={() => openTab('blocks')}
          >
            Bloques{blocks.length > 0 ? ` (${blocks.length})` : ''}
          </button>
          <button
            className={`toolbar-button${panelOpen && tab === 'ai' ? ' active' : ''}`}
            onClick={() => openTab('ai')}
          >
            IA{attached.length > 0 ? ` (${attached.length})` : ''}
          </button>
        </div>
      </header>
      <div className="body">
        <main className="workspace">
          <TerminalView onReady={onReady} />
        </main>
        {handle && (
          <aside className="side-panel" hidden={!panelOpen}>
            <div hidden={tab !== 'blocks'} className="side-panel-page">
              <BlocksPanel
                blocks={blocks}
                onSelect={(id) => handle.scrollToBlock(id)}
                onCopy={(text) => {
                  copy(text)
                  handle.focus()
                }}
                onSendToAi={(block) => {
                  setAttached((prev) => [
                    ...prev,
                    { command: block.command, cwd: block.cwd, exitCode: block.exitCode, output: block.output }
                  ])
                  setTab('ai')
                }}
              />
            </div>
            {/* El panel de IA queda montado aunque esté oculto para no perder la conversación. */}
            <div hidden={tab !== 'ai'} className="side-panel-page">
              <AiPanel
                attached={attached}
                onRemoveAttached={(i) => setAttached((prev) => prev.filter((_, j) => j !== i))}
                onClearAttached={() => setAttached([])}
                onInsertCommand={(command) => handle.insert(command)}
                onCopy={copy}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
