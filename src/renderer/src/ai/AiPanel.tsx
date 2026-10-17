import { useEffect, useRef, useState } from 'react'
import { PROVIDERS, type AiSettingsView, type ChatMessage, type ContextBlock, type ProviderId } from '../../../shared/ai'
import MessageView from './MessageView'
import ProviderSettings from './ProviderSettings'

interface Props {
  attached: ContextBlock[]
  onRemoveAttached(index: number): void
  onClearAttached(): void
  onInsertCommand(command: string): void
  onCopy(text: string): void
}

interface Turn extends ChatMessage {
  context?: ContextBlock[]
  model?: string
  error?: string
}

export default function AiPanel({
  attached,
  onRemoveAttached,
  onClearAttached,
  onInsertCommand,
  onCopy
}: Props): React.JSX.Element {
  const { ai } = window.terminaltor
  const [settings, setSettings] = useState<AiSettingsView | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [modelsError, setModelsError] = useState<string>()
  const [showSettings, setShowSettings] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [requestId, setRequestId] = useState<string>()
  const listRef = useRef<HTMLDivElement>(null)

  const provider = settings?.selected.provider ?? 'anthropic'
  const info = PROVIDERS.find((p) => p.id === provider)!
  const configured = settings ? !info.needsKey || settings.providers[provider].hasKey : false

  useEffect(() => {
    ai.settings().then(setSettings)
  }, [])

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

  const changeProvider = async (id: ProviderId): Promise<void> => {
    const first = PROVIDERS.find((p) => p.id === id)!.defaultModels[0] ?? ''
    setSettings(await ai.select(id, first))
  }

  const changeModel = async (model: string): Promise<void> => {
    setSettings(await ai.select(provider, model))
  }

  const send = (): void => {
    const text = input.trim()
    if (!text || requestId || !settings?.selected.model) return
    const userTurn: Turn = { role: 'user', content: text, context: attached.length > 0 ? attached : undefined }
    const history = [...turns, userTurn]
    const id = crypto.randomUUID()
    setTurns([...history, { role: 'assistant', content: '' }])
    setInput('')
    setRequestId(id)
    onClearAttached()

    const update = (patch: (turn: Turn) => Turn): void =>
      setTurns((prev) => [...prev.slice(0, -1), patch(prev[prev.length - 1])])

    const off = ai.onEvent(id, (event) => {
      if (event.type === 'text') update((t) => ({ ...t, content: t.content + event.text }))
      if (event.type === 'error') update((t) => ({ ...t, error: event.message }))
      if (event.type === 'done') update((t) => ({ ...t, model: event.model || undefined }))
      if (event.type !== 'text') {
        off()
        setRequestId(undefined)
      }
    })
    // El contexto de bloques viaja solo con el mensaje en que se adjuntó; los
    // mensajes anteriores van con su texto.
    ai.chat(id, {
      messages: history.filter((t) => !t.error).map(({ role, content }) => ({ role, content })),
      context: userTurn.context ?? []
    })
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
          onBlur={(e) => changeModel(e.target.value.trim())}
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
            Pregunta lo que necesites sobre tu terminal. Desde el panel de bloques puedes enviar un comando con su
            salida para que la IA lo analice.
          </p>
        )}
        {turns.map((turn, i) => (
          <MessageView
            key={i}
            role={turn.role}
            content={turn.content}
            context={turn.context}
            model={turn.model}
            error={turn.error}
            pending={turn.role === 'assistant' && i === turns.length - 1 && requestId !== undefined}
            onInsert={onInsertCommand}
            onCopy={onCopy}
          />
        ))}
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
          {turns.length > 0 && !requestId && (
            <button className="link-button" onClick={() => setTurns([])}>
              Nueva conversación
            </button>
          )}
          {requestId ? (
            <button className="primary-button" onClick={() => ai.cancel(requestId)}>
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
