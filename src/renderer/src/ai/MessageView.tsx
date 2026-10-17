import type { ContextBlock } from '../../../shared/ai'

interface Props {
  role: 'user' | 'assistant'
  content: string
  context?: ContextBlock[]
  model?: string
  error?: string
  pending: boolean
  onInsert(command: string): void
  onCopy(text: string): void
}

type Part = { kind: 'text'; text: string } | { kind: 'code'; lang: string; code: string }

// Separa el texto en párrafos y bloques de código ``` (también uno sin cerrar, mientras llega).
function parse(content: string): Part[] {
  const parts: Part[] = []
  const fence = /```([\w-]*)\n([\s\S]*?)(?:```|$)/g
  let last = 0
  for (const match of content.matchAll(fence)) {
    if (match.index! > last) parts.push({ kind: 'text', text: content.slice(last, match.index) })
    parts.push({ kind: 'code', lang: match[1], code: match[2].replace(/\n$/, '') })
    last = match.index! + match[0].length
  }
  if (last < content.length) parts.push({ kind: 'text', text: content.slice(last) })
  return parts
}

const shellLangs = new Set(['', 'powershell', 'pwsh', 'ps1', 'ps', 'shell', 'sh', 'bash', 'cmd', 'bat', 'console'])

export default function MessageView({
  role,
  content,
  context,
  model,
  error,
  pending,
  onInsert,
  onCopy
}: Props): React.JSX.Element {
  return (
    <div className={`message message-${role}`}>
      {context && (
        <div className="message-context">
          {context.map((b, i) => (
            <span key={i} className="chip">
              {b.command}
            </span>
          ))}
        </div>
      )}
      {parse(content).map((part, i) =>
        part.kind === 'text' ? (
          <p key={i} className="message-text">
            {part.text.trim()}
          </p>
        ) : (
          <div key={i} className="message-code">
            <pre>{part.code}</pre>
            <div className="message-code-actions">
              <button onClick={() => onCopy(part.code)}>Copiar</button>
              {shellLangs.has(part.lang.toLowerCase()) && (
                <button onClick={() => onInsert(part.code)} title="Escribe el comando en el terminal sin ejecutarlo">
                  Insertar en terminal
                </button>
              )}
            </div>
          </div>
        )
      )}
      {pending && content === '' && <p className="message-text muted">Pensando…</p>}
      {error && <p className="message-error">{error}</p>}
      {model && role === 'assistant' && <div className="message-model">{model}</div>}
    </div>
  )
}
