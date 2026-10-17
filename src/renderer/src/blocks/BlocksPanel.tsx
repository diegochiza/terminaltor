import { useState } from 'react'
import type { Block } from './BlockTracker'

interface Props {
  blocks: Block[]
  onSelect(id: number): void
  onCopy(text: string): void
  onSendToAi(block: Block): void
}

function formatDuration(ms?: number): string {
  if (ms === undefined) return 'en curso'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`
}

function statusLabel(block: Block): string {
  if (block.status === 'running') return 'En curso'
  if (block.status === 'success') return 'Correcto'
  return `Error (código ${block.exitCode ?? '?'})`
}

export default function BlocksPanel({ blocks, onSelect, onCopy, onSendToAi }: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggle = (id: number): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <>
      {blocks.length === 0 ? (
        <p className="blocks-empty">
          Cada comando que ejecutes aparecerá aquí con su salida. Usa Ctrl+Shift+↑/↓ para saltar entre bloques en
          el terminal.
        </p>
      ) : (
        <ol className="blocks-list">
          {[...blocks].reverse().map((block) => {
            const open = expanded.has(block.id)
            return (
              <li key={block.id} className="block-card" data-status={block.status}>
                <div className="block-row">
                  <button
                    className="block-toggle"
                    onClick={() => toggle(block.id)}
                    aria-expanded={open}
                    title={open ? 'Colapsar salida' : 'Ver salida'}
                  >
                    {open ? '▾' : '▸'}
                  </button>
                  <button className="block-command" onClick={() => onSelect(block.id)} title="Ir al bloque">
                    {block.command}
                  </button>
                </div>
                <div className="block-meta">
                  <span className="block-status">{statusLabel(block)}</span>
                  <span>{formatDuration(block.durationMs)}</span>
                </div>
                {block.cwd && <div className="block-cwd" title={block.cwd}>{block.cwd}</div>}
                {open && <pre className="block-output">{block.output || '(sin salida)'}</pre>}
                <div className="block-actions">
                  <button onClick={() => onCopy(block.command)}>Copiar comando</button>
                  <button onClick={() => onCopy(block.output)} disabled={block.status === 'running'}>
                    Copiar salida
                  </button>
                  <button onClick={() => onSendToAi(block)} disabled={block.status === 'running'}>
                    Enviar a la IA
                  </button>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </>
  )
}
