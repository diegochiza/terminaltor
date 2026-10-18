import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import TerminalView, { type TerminalHandle } from './TerminalView'
import BlocksPanel from './blocks/BlocksPanel'
import type { Block } from './blocks/BlockTracker'
import AiPanel from './ai/AiPanel'
import type { ContextBlock } from '../../shared/ai'
import { THEMES, findTheme, loadPreferences, savePreferences, type Preferences } from './themes'
import {
  layout,
  leaves,
  neighbor,
  removePane,
  setRatio,
  splitPane,
  type Direction,
  type DividerRect,
  type PaneNode
} from './panes/layout'

type SidePage = 'blocks' | 'ai'

interface TabState {
  id: string
  root: PaneNode
  /** Panel con el foco dentro de la pestaña. */
  focused: string
}

let nextId = 1
const uid = (prefix: string): string => `${prefix}${nextId++}`

function createTab(): TabState {
  const pane = uid('pane')
  return { id: uid('tab'), root: { kind: 'leaf', id: pane }, focused: pane }
}

/** Nombre de la pestaña: la carpeta actual de su panel activo. */
function folderName(cwd: string | undefined): string {
  if (!cwd) return 'PowerShell'
  const parts = cwd.split(/[\\/]/).filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 1] : cwd
}

const pct = (value: number): string => `${value * 100}%`

const ARROWS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down'
}

export default function App(): React.JSX.Element {
  const [tabs, setTabs] = useState<TabState[]>(() => [createTab()])
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id)
  const [handles, setHandles] = useState<Record<string, TerminalHandle>>({})
  const [cwds, setCwds] = useState<Record<string, string>>({})
  const [blocks, setBlocks] = useState<Block[]>([])
  const [panelOpen, setPanelOpen] = useState(true)
  const [page, setPage] = useState<SidePage>('blocks')
  const [attached, setAttached] = useState<ContextBlock[]>([])
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences)
  const [showPreferences, setShowPreferences] = useState(false)
  const workspaceRef = useRef<HTMLElement>(null)
  /** Terminal donde corrió el último comando de la IA (para poder interrumpirlo). */
  const aiTerminal = useRef<TerminalHandle | null>(null)
  const activeIndex = useRef(0)
  const theme = findTheme(preferences.themeId)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
  const handle = activeTab ? (handles[activeTab.focused] ?? null) : null
  if (activeTab) activeIndex.current = tabs.indexOf(activeTab)

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

  // Si se cerró la pestaña activa se pasa a la vecina; sin pestañas se cierra la ventana.
  useEffect(() => {
    if (tabs.length === 0) window.close()
    else if (!tabs.some((t) => t.id === activeTabId)) {
      setActiveTabId(tabs[Math.min(activeIndex.current, tabs.length - 1)].id)
    }
  }, [tabs, activeTabId])

  // Al cambiar de pestaña o de panel, el teclado va al terminal elegido.
  useEffect(() => {
    handle?.focus()
  }, [handle])

  // Los bloques que se muestran son los del panel activo.
  useEffect(() => {
    if (!handle) {
      setBlocks([])
      return
    }
    const refresh = (): void => setBlocks(handle.tracker.blocks.map((b) => ({ ...b })))
    const offStart = handle.tracker.onBlockStarted(refresh)
    const offFinish = handle.tracker.onBlockFinished(refresh)
    refresh()
    return () => {
      offStart()
      offFinish()
    }
  }, [handle])

  const updateTab = (tabId: string, change: (tab: TabState) => TabState): void =>
    setTabs((prev) => prev.map((t) => (t.id === tabId ? change(t) : t)))

  const addTab = (): void => {
    const tab = createTab()
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
  }

  const closeTab = (tabId: string): void => setTabs((prev) => prev.filter((t) => t.id !== tabId))

  /** Cierra un panel (su shell termina); si era el único, se cierra la pestaña. */
  const closePane = useCallback((paneId: string): void => {
    setTabs((prev) =>
      prev.flatMap((tab) => {
        if (!leaves(tab.root).includes(paneId)) return [tab]
        const root = removePane(tab.root, paneId)
        if (!root) return []
        const focused =
          tab.focused !== paneId
            ? tab.focused
            : ((['left', 'up', 'right', 'down'] as const)
                .map((d) => neighbor(tab.root, paneId, d))
                .find((id) => id !== undefined) ?? leaves(root)[0])
        return [{ ...tab, root, focused }]
      })
    )
  }, [])

  const split = (axis: 'row' | 'column'): void => {
    if (!activeTab) return
    const pane = uid('pane')
    updateTab(activeTab.id, (t) => ({
      ...t,
      root: splitPane(t.root, t.focused, axis, pane, uid('split')),
      focused: pane
    }))
  }

  const focusPane = useCallback((tabId: string, paneId: string): void => {
    setTabs((prev) => prev.map((t) => (t.id === tabId && t.focused !== paneId ? { ...t, focused: paneId } : t)))
  }, [])

  const moveFocus = (direction: Direction): void => {
    if (!activeTab) return
    const target = neighbor(activeTab.root, activeTab.focused, direction)
    if (target) focusPane(activeTab.id, target)
  }

  const cycleTab = (delta: number): void => {
    if (tabs.length < 2) return
    setActiveTabId(tabs[(activeIndex.current + delta + tabs.length) % tabs.length].id)
  }

  const registerHandle = useCallback((paneId: string, h: TerminalHandle | null): void => {
    setHandles((prev) => {
      const next = { ...prev }
      if (h) next[paneId] = h
      else delete next[paneId]
      return next
    })
    if (!h) {
      setCwds(({ [paneId]: _, ...rest }) => rest)
      return
    }
    // El tracker se descarta con el terminal, junto con este oyente.
    h.tracker.onCwdChanged((cwd) => setCwds((prev) => ({ ...prev, [paneId]: cwd })))
  }, [])

  // Atajos de pestañas y paneles. Se capturan antes de que lleguen a la shell; el
  // manejador se renueva en cada render para que siempre vea el estado actual.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {})
  keyHandler.current = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase()
    const ctrlShift = e.ctrlKey && e.shiftKey && !e.altKey
    if (ctrlShift && key === 't') addTab()
    else if (ctrlShift && key === 'w') activeTab && closePane(activeTab.focused)
    else if (ctrlShift && key === 'd') split('row')
    else if (ctrlShift && key === 'e') split('column')
    else if (e.ctrlKey && !e.altKey && key === 'tab') cycleTab(e.shiftKey ? -1 : 1)
    else if (e.ctrlKey && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
      const tab = tabs[Number(e.key) - 1]
      if (!tab) return
      setActiveTabId(tab.id)
    } else if (e.altKey && !e.ctrlKey && !e.shiftKey && ARROWS[e.key]) moveFocus(ARROWS[e.key])
    // Ctrl + / Ctrl - / Ctrl 0 cambian el tamaño de letra.
    else if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === '=' || e.key === '+'))
      updatePreferences({ fontSize: preferences.fontSize + 1 })
    else if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === '-')
      updatePreferences({ fontSize: preferences.fontSize - 1 })
    else if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === '0') updatePreferences({ fontSize: 14 })
    else return
    e.preventDefault()
    e.stopPropagation()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => keyHandler.current(e)
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const startDrag = (event: React.PointerEvent<HTMLDivElement>, tabId: string, divider: DividerRect): void => {
    const element = event.currentTarget
    element.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent): void => {
      const box = workspaceRef.current!.getBoundingClientRect()
      const { parent } = divider
      const ratio =
        divider.axis === 'row'
          ? ((e.clientX - box.left) / box.width - parent.x) / parent.w
          : ((e.clientY - box.top) / box.height - parent.y) / parent.h
      updateTab(tabId, (t) => ({
        ...t,
        root: setRatio(t.root, divider.id, ratio)
      }))
    }
    const up = (): void => {
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', up)
    }
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', up)
  }

  const copy = (text: string): void => {
    window.terminaltor.clipboard.writeText(text)
  }

  const openPage = (next: SidePage): void => {
    if (panelOpen && page === next) setPanelOpen(false)
    else {
      setPage(next)
      setPanelOpen(true)
    }
  }

  const noTerminal = (): Promise<Block> => Promise.reject(new Error('No hay un terminal activo.'))

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">Terminaltor</span>
        <nav className="tabs" aria-label="Pestañas">
          {tabs.map((tab, i) => {
            const count = leaves(tab.root).length
            const cwd = cwds[tab.focused]
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={tab.id === activeTab?.id}
                className={`tab${tab.id === activeTab?.id ? ' active' : ''}`}
                title={`${cwd ?? 'PowerShell'}${i < 9 ? `  (Ctrl+${i + 1})` : ''}`}
                onClick={() => setActiveTabId(tab.id)}
                onAuxClick={(e) => e.button === 1 && closeTab(tab.id)}
              >
                <span className="tab-title">{folderName(cwd)}</span>
                {count > 1 && <span className="tab-count">{count}</span>}
                <button
                  className="tab-close"
                  title="Cerrar pestaña"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                >
                  ×
                </button>
              </div>
            )
          })}
          <button className="tab-add" onClick={addTab} title="Nueva pestaña (Ctrl+Shift+T)">
            +
          </button>
        </nav>
        <div className="toolbar-tabs">
          <button
            className="toolbar-button icon"
            onClick={() => split('row')}
            title="Dividir a la derecha (Ctrl+Shift+D)"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" />
              <line x1="8" y1="2.5" x2="8" y2="13.5" stroke="currentColor" />
            </svg>
          </button>
          <button
            className="toolbar-button icon"
            onClick={() => split('column')}
            title="Dividir hacia abajo (Ctrl+Shift+E)"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" />
              <line x1="1.5" y1="8" x2="14.5" y2="8" stroke="currentColor" />
            </svg>
          </button>
          <button
            className={`toolbar-button${panelOpen && page === 'blocks' ? ' active' : ''}`}
            onClick={() => openPage('blocks')}
          >
            Bloques{blocks.length > 0 ? ` (${blocks.length})` : ''}
          </button>
          <button
            className={`toolbar-button${panelOpen && page === 'ai' ? ' active' : ''}`}
            onClick={() => openPage('ai')}
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
        {/* Todos los paneles de todas las pestañas viven aquí, con posición calculada.
            Así dividir o cerrar un panel nunca reinicia la shell de los demás. */}
        <main className="workspace" ref={workspaceRef}>
          {tabs.map((tab) => {
            const { panes, dividers } = layout(tab.root)
            const visible = tab.id === activeTab?.id
            const multi = panes.length > 1
            return (
              <Fragment key={tab.id}>
                {panes.map(({ id, rect }) => (
                  <div
                    key={id}
                    className={`pane${multi ? ' multi' : ''}${tab.focused === id ? ' focused' : ''}`}
                    style={{
                      left: pct(rect.x),
                      top: pct(rect.y),
                      width: pct(rect.w),
                      height: pct(rect.h),
                      display: visible ? undefined : 'none'
                    }}
                  >
                    <TerminalView
                      theme={theme}
                      fontSize={preferences.fontSize}
                      onReady={(h) => registerHandle(id, h)}
                      onFocus={() => focusPane(tab.id, id)}
                      onExit={() => closePane(id)}
                    />
                  </div>
                ))}
                {visible &&
                  dividers.map((d) => (
                    <div
                      key={d.id}
                      className={`divider ${d.axis}`}
                      style={
                        d.axis === 'row'
                          ? {
                              left: pct(d.at),
                              top: pct(d.parent.y),
                              height: pct(d.parent.h)
                            }
                          : {
                              top: pct(d.at),
                              left: pct(d.parent.x),
                              width: pct(d.parent.w)
                            }
                      }
                      onPointerDown={(e) => startDrag(e, tab.id, d)}
                      onDoubleClick={() =>
                        updateTab(tab.id, (t) => ({
                          ...t,
                          root: setRatio(t.root, d.id, 0.5)
                        }))
                      }
                      title="Arrastra para cambiar el tamaño (doble clic: mitad y mitad)"
                    />
                  ))}
              </Fragment>
            )
          })}
        </main>
        <aside className="side-panel" hidden={!panelOpen}>
          <div hidden={page !== 'blocks'} className="side-panel-page">
            <BlocksPanel
              blocks={blocks}
              onSelect={(id) => handle?.scrollToBlock(id)}
              onCopy={(text) => {
                copy(text)
                handle?.focus()
              }}
              onSendToAi={(block) => {
                setAttached((prev) => [
                  ...prev,
                  {
                    command: block.command,
                    cwd: block.cwd,
                    exitCode: block.exitCode,
                    output: block.output
                  }
                ])
                setPage('ai')
              }}
            />
          </div>
          {/* El panel de IA queda montado aunque esté oculto para no perder la conversación.
              Sus comandos corren en el panel que tenga el foco. */}
          <div hidden={page !== 'ai'} className="side-panel-page">
            <AiPanel
              attached={attached}
              onRemoveAttached={(i) => setAttached((prev) => prev.filter((_, j) => j !== i))}
              onClearAttached={() => setAttached([])}
              onInsertCommand={(command) => handle?.insert(command)}
              onRunCommand={(command) => {
                aiTerminal.current = handle
                return handle ? handle.run(command) : noTerminal()
              }}
              onInterrupt={() => aiTerminal.current?.interrupt()}
              onCopy={copy}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}
