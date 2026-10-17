// Prueba los adaptadores de IA contra un servidor falso que imita las API de
// Anthropic, OpenAI, Gemini y Ollama. En cada proveedor el modelo pide primero
// ejecutar un comando y, al recibir la salida, responde con texto. No usa claves reales.
// Uso: npx tsx scripts/test-providers.ts
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'

const requests: Record<string, any[]> = { anthropic: [], openai: [], gemini: [], ollama: [] }

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

function json(res: ServerResponse, data: unknown): void {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(data))
}

const COMMAND = { command: 'Get-Date', reason: 'Ver la fecha' }

function anthropicResponse(res: ServerResponse, first: boolean): void {
  const msg = { id: 'm1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } }
  const events: Array<[string, unknown]> = [['message_start', { type: 'message_start', message: msg }]]
  if (first) {
    events.push(
      ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } }],
      ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'firma' } }],
      ['content_block_stop', { type: 'content_block_stop', index: 0 }],
      ['content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_1', name: 'run_command', input: {} } }],
      ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: JSON.stringify(COMMAND) } }],
      ['content_block_stop', { type: 'content_block_stop', index: 1 }],
      ['message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 5 } }]
    )
  } else {
    events.push(
      ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
      ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Listo Claude' } }],
      ['content_block_stop', { type: 'content_block_stop', index: 0 }],
      ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } }]
    )
  }
  events.push(['message_stop', { type: 'message_stop' }])
  sse(res, events)
}

const server = createServer(async (req, res) => {
  const url = req.url ?? ''
  if (req.method === 'GET' && url.startsWith('/v1/models')) {
    return json(res, { data: [{ id: 'claude-opus-5-5', type: 'model', display_name: 'x', created_at: '2026-01-01' }], has_more: false, first_id: null, last_id: null })
  }
  if (req.method === 'POST' && url.startsWith('/v1/messages')) {
    const b = { ...(await body(req)), beta: req.headers['anthropic-beta'] }
    requests.anthropic.push(b)
    return anthropicResponse(res, requests.anthropic.length === 1)
  }
  if (req.method === 'GET' && url.startsWith('/openai/models')) {
    return json(res, { object: 'list', data: [{ id: 'gpt-x', object: 'model' }, { id: 'gpt-a', object: 'model' }] })
  }
  if (req.method === 'POST' && url.startsWith('/openai/chat/completions')) {
    requests.openai.push(await body(req))
    const chunk = (delta: unknown) => ({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'gpt-x', choices: [{ index: 0, delta, finish_reason: null }] })
    if (requests.openai.length === 1) {
      const args = JSON.stringify(COMMAND)
      return sse(res, [
        [null, chunk({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'run_command', arguments: args.slice(0, 10) } }] })],
        [null, chunk({ tool_calls: [{ index: 0, function: { arguments: args.slice(10) } }] })],
        [null, '[DONE]']
      ])
    }
    return sse(res, [[null, chunk({ content: 'Listo OpenAI' })], [null, '[DONE]']])
  }
  if (req.method === 'GET' && url.startsWith('/v1beta/models')) {
    return json(res, { models: [{ name: 'models/gemini-x', supportedGenerationMethods: ['generateContent'] }] })
  }
  if (req.method === 'POST' && url.includes(':streamGenerateContent')) {
    requests.gemini.push(await body(req))
    const part =
      requests.gemini.length === 1
        ? { functionCall: { id: 'fc_1', name: 'run_command', args: COMMAND }, thoughtSignature: 'sig' }
        : { text: 'Listo Gemini' }
    return sse(res, [[null, { candidates: [{ content: { role: 'model', parts: [part] }, index: 0 }] }]])
  }
  if (req.method === 'GET' && url === '/api/tags') return json(res, { models: [{ name: 'llama3.2:latest' }] })
  if (req.method === 'POST' && url === '/api/chat') {
    requests.ollama.push(await body(req))
    res.writeHead(200, { 'content-type': 'application/x-ndjson' })
    const message =
      requests.ollama.length === 1
        ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'run_command', arguments: COMMAND } }] }
        : { role: 'assistant', content: 'Listo Ollama' }
    res.end(JSON.stringify({ model: 'llama3.2', message, done: true }) + '\n')
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

  const configs = {
    anthropic: { apiKey: 'k' },
    openai: { apiKey: 'k', baseURL: `${base}/openai` },
    gemini: { apiKey: 'k', baseURL: base },
    ollama: { baseURL: base }
  }
  const names = { anthropic: 'Claude', openai: 'OpenAI', gemini: 'Gemini', ollama: 'Ollama' }

  for (const id of ['anthropic', 'openai', 'gemini', 'ollama'] as const) {
    const provider = providers[id]
    const history: unknown[] = []
    let text = ''
    const options = { model: 'm', system: 'sistema', history, signal: new AbortController().signal, onText: (t: string) => (text += t) }
    provider.addUser(history, 'qué fecha es')
    const first = await provider.turn(configs[id], options)
    const call = first.toolCalls[0]
    check(call?.command === 'Get-Date' && call.reason === 'Ver la fecha' && !call.invalid, `${names[id]}: pide ejecutar el comando`)
    provider.addToolResults(history, [{ id: call.id, name: call.name, output: 'viernes', isError: false }])
    const second = await provider.turn(configs[id], options)
    check(second.toolCalls.length === 0 && text === `Listo ${names[id]}`, `${names[id]}: responde después de recibir la salida`)
    check((await provider.listModels(configs[id])).length > 0, `${names[id]}: lista de modelos`)
  }

  const [a1, a2] = requests.anthropic
  check(a1.fallbacks === 'default' && String(a1.beta).includes('server-side-fallback-2026-07-01'), 'Claude: respaldo por defecto')
  check(a1.tools[0].strict === true && a1.tools[0].eager_input_streaming === true, 'Claude: herramienta estricta con streaming de entrada')
  const echoed = a2.messages[1].content
  check(echoed[0].type === 'thinking' && echoed[0].signature === 'firma', 'Claude: devuelve el razonamiento sin cambios')
  check(a2.messages[2].content[0].type === 'tool_result' && a2.messages[2].content[0].content === 'viernes', 'Claude: resultado del comando')

  const o2 = requests.openai[1]
  check(o2.messages[2].tool_calls[0].function.arguments === JSON.stringify(COMMAND), 'OpenAI: une los argumentos en streaming')
  check(o2.messages[3].role === 'tool' && o2.messages[3].tool_call_id === 'call_1', 'OpenAI: resultado del comando')

  const g2 = requests.gemini[1]
  check(g2.contents[1].parts[0].thoughtSignature === 'sig', 'Gemini: devuelve la firma de razonamiento')
  check(g2.contents[2].parts[0].functionResponse.response.output === 'viernes', 'Gemini: resultado del comando')

  const l2 = requests.ollama[1]
  check(l2.messages[3].role === 'tool' && l2.messages[3].content === 'viernes', 'Ollama: resultado del comando')

  let error = ''
  try {
    await providers.anthropic.turn({}, { model: 'x', system: '', history: [], signal: new AbortController().signal, onText: () => {} })
  } catch (e) {
    error = (e as Error).message
  }
  check(error.startsWith('Falta la clave'), 'Sin clave: mensaje claro')

  server.close()
  process.exit(failures ? 1 : 0)
}
main()
