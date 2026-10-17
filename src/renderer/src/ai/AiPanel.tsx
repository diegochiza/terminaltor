import { useEffect, useRef, useState } from 'react'
import {
  PROVIDERS,
  type AgentEvent,
  type AiSettingsView,
  type ContextBlock,
  type ProviderId,
  type ToolResultInput
} from '../../../shared/ai'
import type { Block } from '../blocks/BlockTracker'
import CommandCard, { type CommandTurn } from './CommandCard'
import MessageView from './MessageView'
import ProviderSettings from './ProviderSettings'

const MAX_TOOL_OUTPUT = 10_000

interface Props {
  attached: ContextBlock[]
  onRemoveAttached(index: number): void
  onClearAttached(): void
  onInsertCommand(command: string): void
  onRunCommand(command: string): Promise<Block>
  onInterrupt(): void
  onCopy(text: string): void
}

type Turn =
  | { kind: 'user'; text: string; context?: ContextBlock[] }
  | { kind: 'assistant'; text: string; model?: string; error?: string }
  | CommandTurn

function toolOutput(turn: CommandTurn): ToolResultInput {
  const { call } = turn
  if (turn.state === 'rejected') {
    return {
      id: call.id,
      isError: true,
      output: turn.error ? `No se pudo ejecutar: ${turn.error}` : 'El usuario rechazó ejecutar este comando.'
    }
  }
  const output = turn.output ?? ''
  const trimmed = output.length > MAX_TOOL_OUTPUT ? '…(salida recortada)\n' + output.slice(-MAX_TOOL_OUTPUT) : output
  const edited = turn.command !== call.command ? `El usuario modificó el comando y se ejecutó:\n${turn.command}\n\n` : ''
  return {
    id: call.id,
    isError: turn.exitCode !== 0,
    output: `${edited}Código de salida: ${turn.exitCode ?? 'desconocido'}\nSalida:\n${trimmed || '(sin salida)'}`
  }
}

export default function AiPanel(props: Props): React.JSX.Element {
  const { attached, onRemoveAttached, onClearAttached, onInsertCommand, onRunCommand, onInterrupt, onCopy } = props
  const { ai } = window.terminaltor
  const [settings, setSettings] = useState<AiSettingsView | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [modelsError, setModelsError] = useState<string>()
  const [showSettings, setShowSettings] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  /** 'thinking': el modelo responde; 'approval': hay comandos esperando al usuario. */
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'approval'>('idle')
  const conversationId = useRef(crypto.randomUUID())
  const listRef = useRef<HTMLDivElement>(null)
  const turnsRef = useRef(turns)
  turnsRef.current = turns

  const provider = settings?.selected.provider ?? 'anthropic'
  const info = PROVIDERS.find((p) => p.id === provider)!
  const configured = settings ? !info.needsKey || settings.providers[provider].hasKey : false

  useEffect(() => {
    ai.settings().then(setSettings)
  }, [])

  // Escucha los eventos de la conversación actual.
  useEffect(() => {
    const id = conversationId.current
    return ai.onEvent(id, (event: AgentEvent) => {
      if (event.type === 'text') {
        setTurns((prev) => {
          const last = prev[prev.length - 1]
          if (last?.kind === 'assistant' && !last.model) {
            return [...prev.slice(0, -1), { ...last, text: last.text + event.text }]
          }
          return [...prev, { kind: 'assistant', text: event.text }]
        })
      } else if (event.type === 'tool_calls') {
        setTurns((prev) => [
          ...prev,
          ...event.calls.map(
            (call): CommandTurn => ({
              kind: 'command',
              call,
              command: call.command,
              state: call.invalid ? 'rejected' : 'pending'
            })
          )
        ])
        setPhase('approval')
      } else {
        setTurns((prev) => {
          const last = prev[prev.length - 1]
          const patch = event.type === 'error' ? { error: event.message } : { model: event.model || ' ' }
          if (last?.kind === 'assistant') return [...prev.slice(0, -1), { ...last, ...patch }]
          return event.type === 'error' ? [...prev, { kind: 'assistant', text: '', ...patch }] : prev
        })
        setPhase('idle')
      }
    })
  }, [conversationId.current])

  // Cuando todos los comandos pedidos en un turno se resolvieron, se devuelve la salida a la IA.
  useEffect(() => {
    if (phase !== 'approval') return
    const lastUser = turns.map((t) => t.kind).lastIndexOf('user')
    const batch = turns.slice(lastUser + 1).filter((t): t is CommandTurn => t.kind === 'command')
    const open = batch.filter((t) => !t.sent)
    if (open.length === 0 || open.some((t) => t.state === 'pending' || t.state === 'running')) return
    setTurns((prev) => prev.map((t) => (t.kind === 'command' && open.includes(t) ? { ...t, sent: true } : t)))
    setPhase('thinking')
    ai.toolResults(conversationId.current, open.map(toolOutput))
  }, [turns, phase])

  // Al cambiar de proveedor (o su configuración) se recarga la lista de modelos.
  useEffect(() => {
    if (!settings) return
    setModels(info.defaultModels)
    setModelsError(undefined)
    if (!configured) return
    ai.listModels(provider)
      .then((list) => setModels(list.length > 0 ? list : info.defaultModels))
      .catch((e: Error) => setModelsError(e.message.replace(/^Error invoking remote method '[^']+': /, '')))
  }, [provider, configured, settings?.providers[provider].baseURL])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [turns])

  const newConversation = (): void => {
    ai.reset(conversationId.current)
    conversationId.current = crypto.randomUUID()
    setTurns([])
    setPhase('idle')
  }

  const changeProvider = async (id: ProviderId): Promise<void> => {
    const first = PROVIDERS.find((p) => p.id === id)!.defaultModels[0] ?? ''
    setSettings(await ai.select(id, first))
    if (turnsRef.current.length > 0) newConversation()
  }

  const updateCommand = (call: CommandTurn['call'], patch: Partial<CommandTurn>): void =>
    setTurns((prev) => prev.map((t) => (t.kind === 'command' && t.call === call ? { ...t, ...patch } : t)))

  const runCommand = async (turn: CommandTurn, command: string): Promise<void> => {
    updateCommand(turn.call, { state: 'running', command })
    try {
      const block = await onRunCommand(command)
      updateCommand(turn.call, { state: 'done', exitCode: block.exitCode, output: block.output })
    } catch (error) {
      updateCommand(turn.call, { state: 'rejected', error: (error as Error).message })
    }
  }

  const send = (): void => {
    const text = input.trim()
    if (!text || phase !== 'idle' || !settings?.selected.model) return
    const context = attached.length > 0 ? attached : undefined
    setTurns((prev) => [...prev, { kind: 'user', text, context }])
    setInput('')
    setPhase('thinking')
    onClearAttached()
    ai.send(conversationId.current, { text, context: context ?? [] })
  }

  const stop = (): void => {
    ai.cancel(conversationId.current)
    // Los comandos sin aprobar quedan rechazados; la IA lo sabrá en el próximo mensaje.
    setTurns((prev) => prev.map((t) => (t.kind === 'command' && t.state === 'pending' ? { ...t, state: 'rejected', sent: true } : t)))
    setPhase('idle')
  }

  if (!settings) return <div className="ai-panel" />

  return (
    <div className="ai-panel">
      <div className="ai-toolbar">
        <select value={provider} onChange={(e) => changeProvider(e.target.value as ProviderId)} title="Proveedor">
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          list="ai-models"
          value={settings.selected.model}
          onChange={(e) => setSettings({ ...settings, selected: { provider, model: e.target.value } })}
          onBlur={(e) => ai.select(provider, e.target.value.trim()).then(setSettings)}
          placeholder="Modelo"
          title="Modelo: elige de la lista o escribe su nombre"
        />
        <datalist id="ai-models">
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <button className="icon-button" onClick={() => setShowSettings((v) => !v)} title="Configurar proveedor">
          ⚙
        </button>
      </div>

      {(showSettings || !configured) && (
        <ProviderSettings
          key={provider}
          info={info}
          settings={settings.providers[provider]}
          onSave={async (update) => {
            setSettings(await ai.saveProvider(provider, update))
            setShowSettings(false)
          }}
        />
      )}
      {modelsError && configured && <div className="ai-notice">No pude cargar los modelos: {modelsError}</div>}

      <div className="ai-messages" ref={listRef}>
        {turns.length === 0 && (
          <p className="blocks-empty">
            Pídele algo a la IA, por ejemplo «¿qué ocupa más espacio en esta carpeta?». Si necesita ejecutar un
            comando te lo mostrará primero y solo correrá si lo apruebas.
          </p>
        )}
        {turns.map((turn, i) =>
          turn.kind === 'command' ? (
            <CommandCard
              key={turn.call.id}
              turn={turn}
              onRun={(command) => runCommand(turn, command)}
              onReject={() => updateCommand(turn.call, { state: 'rejected' })}
              onInterrupt={onInterrupt}
            />
          ) : (
            <MessageView
              key={i}
              role={turn.kind}
              content={turn.text}
              context={turn.kind === 'user' ? turn.context : undefined}
              model={turn.kind === 'assistant' ? turn.model?.trim() : undefined}
              error={turn.kind === 'assistant' ? turn.error : undefined}
              pending={false}
              onInsert={onInsertCommand}
              onCopy={onCopy}
            />
          )
        )}
        {phase === 'thinking' && turns[turns.length - 1]?.kind !== 'assistant' && (
          <p className="message-text muted">Pensando…</p>
        )}
      </div>

      <div className="ai-composer">
        {attached.length > 0 && (
          <div className="ai-attached">
            {attached.map((block, i) => (
              <span key={i} className="chip" title={block.output}>
                {block.command}
                <button onClick={() => onRemoveAttached(i)} title="Quitar">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={configured ? 'Escribe tu pregunta (Enter para enviar)' : 'Configura el proveedor para empezar'}
          disabled={!configured}
          rows={3}
        />
        <div className="ai-composer-actions">
          {turns.length > 0 && phase === 'idle' && (
            <button className="link-button" onClick={newConversation}>
              Nueva conversación
            </button>
          )}
          {phase !== 'idle' ? (
            <button className="primary-button" onClick={stop}>
              Detener
            </button>
          ) : (
            <button className="primary-button" onClick={send} disabled={!configured || !input.trim()}>
              Enviar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
