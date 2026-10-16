// Prueba de los bloques con una shell real: lanza PowerShell con la integración,
// ejecuta algunos comandos y comprueba que el BlockTracker arma los bloques bien.
// Uso: TERMINALTOR_SHELL=<ruta a pwsh> npx tsx scripts/test-blocks.ts
import { Terminal } from '@xterm/headless'
import * as pty from 'node-pty'
import { defaultShell } from '../src/main/shell'
import { BlockTracker } from '../src/renderer/src/blocks/BlockTracker'

const term = new Terminal({ cols: 100, rows: 30, allowProposedApi: true })
const tracker = new BlockTracker(term as never)
const shell = defaultShell()
const proc = pty.spawn(shell.file, shell.args, {
  name: 'xterm-256color',
  cols: 100,
  rows: 30,
  cwd: process.cwd(),
  env: { ...process.env, POWERSHELL_TELEMETRY_OPTOUT: '1', POWERSHELL_UPDATECHECK: 'Off' } as Record<string, string>
})
proc.onData((data) => term.write(data))
term.onData((data) => proc.write(data))

const commands = ['Write-Output "hola mundo"', '', '1..3 | ForEach-Object { "linea $_" }', 'Get-Item no-existe', 'exit']
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main(): Promise<void> {
  await wait(3000)
  for (const command of commands) {
    proc.write(command + '\r')
    await wait(1500)
  }
  const summary = tracker.blocks.map((b) => ({ command: b.command, status: b.status, exitCode: b.exitCode, output: b.output }))
  console.log(JSON.stringify(summary, null, 2))
  const expect = (cond: boolean, msg: string) => {
    if (!cond) {
      console.error('FALLO: ' + msg)
      process.exitCode = 1
    }
  }
  const [hola, lineas, error] = tracker.blocks
  expect(tracker.blocks.length >= 3, 'deberían existir al menos 3 bloques (la línea vacía no cuenta)')
  expect(hola?.output === 'hola mundo' && hola.status === 'success', 'bloque "hola mundo"')
  expect(lineas?.output === 'linea 1\nlinea 2\nlinea 3', 'bloque con varias líneas')
  expect(error?.status === 'error', 'Get-Item de un archivo inexistente debe marcar error')
  proc.kill()
  process.exit()
}
main()
