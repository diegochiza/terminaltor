import { useState } from 'react'
import type { ToolCallRequest } from '../../../shared/ai'
import { isRisky } from './risk'

export type CommandState = 'pending' | 'running' | 'done' | 'rejected'

export interface CommandTurn {
  kind: 'command'
  call: ToolCallRequest
  state: CommandState
  /** Comando que se ejecutó (el usuario puede editarlo antes). */
  command: string
  exitCode?: number
  output?: string
  error?: string
  /** Ya se devolvió el resultado a la IA. */
  sent?: boolean
}

interface Props {
  turn: CommandTurn
  onRun(command: string): void
  onReject(): void
  onInterrupt(): void
}

export default function CommandCard({ turn, onRun, onReject, onInterrupt }: Props): React.JSX.Element {
  const [command, setCommand] = useState(turn.command)
  const [editing, setEditing] = useState(false)
  const [showOutput, setShowOutput] = useState(false)
  const risky = isRisky(command)

  if (turn.call.invalid) {
    return <div className="command-card" data-state="rejected">La IA pidió un comando con datos incompletos; no se ejecutó.</div>
  }

  return (
    <div className="command-card" data-state={turn.state} data-risky={risky || undefined}>
      <div className="command-label">
        {turn.state === 'pending' && 'La IA quiere ejecutar:'}
        {turn.state === 'running' && 'Ejecutando…'}
        {turn.state === 'done' && (turn.exitCode === 0 ? 'Ejecutado' : `Terminó con código ${turn.exitCode ?? '?'}`)}
        {turn.state === 'rejected' && (turn.error ? 'No se pudo ejecutar' : 'Rechazado')}
      </div>
      {editing ? (
        <textarea
          className="command-edit"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          rows={Math.min(8, command.split('\n').length + 1)}
          autoFocus
        />
      ) : (
        <pre className="command-text">{turn.state === 'pending' ? command : turn.command}</pre>
      )}
      {turn.call.reason && <div className="command-reason">{turn.call.reason}</div>}
      {turn.state === 'pending' && risky && (
        <div className="command-warning">Este comando puede borrar o cambiar datos. Revísalo antes de ejecutarlo.</div>
      )}
      {turn.error && <div className="message-error">{turn.error}</div>}
      {turn.state === 'pending' && (
        <div className="command-actions">
          <button className="primary-button" onClick={() => onRun(command)} disabled={!command.trim()}>
            Ejecutar
          </button>
          <button onClick={() => setEditing((v) => !v)}>{editing ? 'Listo' : 'Editar'}</button>
          <button onClick={onReject}>Rechazar</button>
        </div>
      )}
      {turn.state === 'running' && (
        <div className="command-actions">
          <button onClick={onInterrupt} title="Envía Ctrl+C al terminal">
            Interrumpir
          </button>
        </div>
      )}
      {turn.state === 'done' && (
        <>
          <button className="link-button" onClick={() => setShowOutput((v) => !v)}>
            {showOutput ? 'Ocultar salida' : 'Ver salida'}
          </button>
          {showOutput && <pre className="block-output">{turn.output || '(sin salida)'}</pre>}
        </>
      )}
    </div>
  )
}
