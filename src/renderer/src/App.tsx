import { useCallback, useEffect, useState } from 'react'
import TerminalView, { type TerminalHandle } from './TerminalView'
import BlocksPanel from './blocks/BlocksPanel'
import type { Block } from './blocks/BlockTracker'
import AiPanel from './ai/AiPanel'
import type { ContextBlock } from '../../shared/ai'
import { THEMES, findTheme, loadPreferences, savePreferences, type Preferences } from './themes'

type Tab = 'blocks' | 'ai'

export default function App(): React.JSX.Element {
  const [handle, setHandle] = useState<TerminalHandle | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [panelOpen, setPanelOpen] = useState(true)
  const [tab, setTab] = useState<Tab>('blocks')
  const [attached, setAttached] = useState<ContextBlock[]>([])
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences)
  const [showPreferences, setShowPreferences] = useState(false)
  const theme = findTheme(preferences.themeId)

  const updatePreferences = (patch: Partial<Preferences>): void =>
    setPreferences((prev) => {
      const next = { ...prev, ...patch }
      next.fontSize = Math.min(28, Math.max(9, next.fontSize))
      savePreferences(next)
      return next
    })

  // El tema de la interfaz se aplica con variables CSS.
  useEffect(() => {
    for (const [name, value] of Object.entries(theme.ui)) document.documentElement.style.setProperty(name, value)
    document.documentElement.dataset.theme = theme.id
  }, [theme])

  // Ctrl + / Ctrl - / Ctrl 0 cambian el tamaño de letra.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey || e.shiftKey || e.altKey) return
      if (e.key === '=' || e.key === '+') updatePreferences({ fontSize: preferences.fontSize + 1 })
      else if (e.key === '-') updatePreferences({ fontSize: preferences.fontSize - 1 })
      else if (e.key === '0') updatePreferences({ fontSize: 14 })
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [preferences.fontSize])

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
          <button
            className={`toolbar-button${showPreferences ? ' active' : ''}`}
            onClick={() => setShowPreferences((v) => !v)}
            title="Tema y tamaño de letra"
          >
            Ajustes
          </button>
          {showPreferences && (
            <div className="preferences">
              <label>
                Tema
                <select value={preferences.themeId} onChange={(e) => updatePreferences({ themeId: e.target.value })}>
                  {THEMES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tamaño de letra
                <span className="font-size">
                  <button onClick={() => updatePreferences({ fontSize: preferences.fontSize - 1 })}>−</button>
                  {preferences.fontSize}
                  <button onClick={() => updatePreferences({ fontSize: preferences.fontSize + 1 })}>+</button>
                </span>
              </label>
              <p className="muted">También con Ctrl + y Ctrl −.</p>
            </div>
          )}
        </div>
      </header>
      <div className="body">
        <main className="workspace">
          <TerminalView theme={theme} fontSize={preferences.fontSize} onReady={onReady} />
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
                onRunCommand={(command) => handle.run(command)}
                onInterrupt={() => handle.interrupt()}
                onCopy={copy}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
