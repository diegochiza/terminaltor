import { useState } from 'react'
import type { ProviderInfo, ProviderSettingsView } from '../../../shared/ai'

interface Props {
  info: ProviderInfo
  settings: ProviderSettingsView
  onSave(update: { apiKey?: string; baseURL?: string }): void
}

export default function ProviderSettings({ info, settings, onSave }: Props): React.JSX.Element {
  const [apiKey, setApiKey] = useState('')
  const [baseURL, setBaseURL] = useState(settings.baseURL ?? '')

  return (
    <form
      className="provider-settings"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ apiKey: apiKey || undefined, baseURL: info.hasBaseURL ? baseURL : undefined })
        setApiKey('')
      }}
    >
      <div className="provider-title">{info.name}</div>
      {info.needsKey && (
        <label>
          Clave de API {settings.hasKey && <span className="muted">(guardada; deja vacío para conservarla)</span>}
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" />
        </label>
      )}
      {info.hasBaseURL && (
        <label>
          URL base
          <input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder={info.defaultBaseURL} />
        </label>
      )}
      {info.id === 'openai' && (
        <p className="muted">Sirve también para servicios compatibles con OpenAI (OpenRouter, Groq, LM Studio…).</p>
      )}
      {info.id === 'ollama' && <p className="muted">Ollama debe estar abierto en tu equipo.</p>}
      <div className="provider-actions">
        {info.needsKey && settings.hasKey && (
          <button type="button" className="link-button" onClick={() => onSave({ apiKey: '' })}>
            Borrar clave
          </button>
        )}
        <button type="submit" className="primary-button">
          Guardar
        </button>
      </div>
      <p className="muted">La clave se guarda cifrada con tu usuario de Windows y nunca sale de este equipo salvo hacia el proveedor.</p>
    </form>
  )
}
