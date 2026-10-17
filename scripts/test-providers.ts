// Prueba los adaptadores de IA contra un servidor falso que imita las API de
// Anthropic, OpenAI y Ollama (streaming y lista de modelos). No usa claves reales.
// Uso: npx tsx scripts/test-providers.ts
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'

const seen: Record<string, unknown> = {}

function body(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data ? JSON.parse(data) : {}))
  })
}

function sse(res: ServerResponse, events: Array<[string | null, unknown]>): void {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  for (const [event, data] of events) {
    res.write((event ? `event: ${event}\n` : '') + `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`)
  }
  res.end()
}

const server = createServer(async (req, res) => {
  const url = req.url ?? ''
  if (req.method === 'GET' && url.startsWith('/v1/models') && req.headers['x-api-key']) {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ data: [{ id: 'claude-opus-5-5', type: 'model', display_name: 'x', created_at: '2026-01-01' }], has_more: false, first_id: null, last_id: null }))
    return
  }
  if (req.method === 'POST' && url.startsWith('/v1/messages')) {
    seen.anthropic = { ...(await body(req)), beta: req.headers['anthropic-beta'] }
    const msg = { id: 'm1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } }
    sse(res, [
      ['message_start', { type: 'message_start', message: msg }],
      ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
      ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hola ' } }],
      ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Claude' } }],
      ['content_block_stop', { type: 'content_block_stop', index: 0 }],
      ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } }],
      ['message_stop', { type: 'message_stop' }]
    ])
    return
  }
  if (req.method === 'GET' && url.startsWith('/openai/models')) {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'gpt-x', object: 'model' }, { id: 'gpt-a', object: 'model' }] }))
    return
  }
  if (req.method === 'POST' && url.startsWith('/openai/chat/completions')) {
    seen.openai = await body(req)
    const chunk = (content: string) => ({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'gpt-x', choices: [{ index: 0, delta: { content }, finish_reason: null }] })
    sse(res, [[null, chunk('Hola ')], [null, chunk('OpenAI')], [null, '[DONE]']])
    return
  }
  if (req.method === 'GET' && url === '/api/tags') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ models: [{ name: 'llama3.2:latest' }] }))
    return
  }
  if (req.method === 'POST' && url === '/api/chat') {
    seen.ollama = await body(req)
    res.writeHead(200, { 'content-type': 'application/x-ndjson' })
    res.write(JSON.stringify({ model: 'llama3.2', message: { role: 'assistant', content: 'Hola ' }, done: false }) + '\n')
    res.end(JSON.stringify({ model: 'llama3.2', message: { role: 'assistant', content: 'Ollama' }, done: true }) + '\n')
    return
  }
  res.writeHead(404)
  res.end(`no route ${req.method} ${url}`)
})

async function main(): Promise<void> {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  process.env.ANTHROPIC_BASE_URL = base
  const { providers } = await import('../src/main/ai/providers')

  let failures = 0
  const check = (cond: boolean, msg: string): void => {
    console.log(`${cond ? 'OK   ' : 'FALLO'} ${msg}`)
    if (!cond) failures++
  }
  const run = async (id: keyof typeof providers, config: { apiKey?: string; baseURL?: string }, model: string) => {
    let text = ''
    const served = await providers[id].stream(config, {
      model,
      system: 'sistema',
      messages: [{ role: 'user', content: 'hola' }],
      signal: new AbortController().signal,
      onText: (t) => (text += t)
    })
    return { text, served, models: await providers[id].listModels(config) }
  }

  const a = await run('anthropic', { apiKey: 'k' }, 'claude-opus-5-5')
  check(a.text === 'Hola Claude', 'Claude: texto en streaming')
  check(a.models.includes('claude-opus-5-5'), 'Claude: lista de modelos')
  const sa = seen.anthropic as any
  check(sa.system === 'sistema' && sa.fallbacks === 'default' && String(sa.beta).includes('server-side-fallback-2026-07-01'), 'Claude: system y respaldo por defecto')

  const o = await run('openai', { apiKey: 'k', baseURL: `${base}/openai` }, 'gpt-x')
  check(o.text === 'Hola OpenAI', 'OpenAI: texto en streaming')
  check(o.models.join() === 'gpt-a,gpt-x', 'OpenAI: lista de modelos')
  check((seen.openai as any).messages[0].role === 'system', 'OpenAI: mensaje de sistema')

  const l = await run('ollama', { baseURL: base }, 'llama3.2')
  check(l.text === 'Hola Ollama', 'Ollama: texto en streaming')
  check(l.models[0] === 'llama3.2:latest', 'Ollama: lista de modelos')

  let error = ''
  try {
    await providers.anthropic.stream({}, { model: 'x', system: '', messages: [], signal: new AbortController().signal, onText: () => {} })
  } catch (e) {
    error = (e as Error).message
  }
  check(error.startsWith('Falta la clave'), 'Sin clave: mensaje claro')

  server.close()
  process.exit(failures ? 1 : 0)
}
main()
