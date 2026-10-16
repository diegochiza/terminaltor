import { ipcMain, type WebContents } from 'electron'
import { homedir } from 'os'
import * as pty from 'node-pty'
import type { PtyStartOptions } from '../shared/api'
import { defaultShell } from './shell'

const sessions = new Map<number, pty.IPty>()
let nextId = 1

function start(sender: WebContents, options: PtyStartOptions): number {
  const id = nextId++
  const shell = defaultShell()
  const proc = pty.spawn(shell.file, shell.args, {
    name: 'xterm-256color',
    cols: options.cols,
    rows: options.rows,
    cwd: options.cwd ?? homedir(),
    env: { ...process.env, TERM_PROGRAM: 'Terminaltor' } as Record<string, string>
  })
  sessions.set(id, proc)

  proc.onData((data) => {
    if (!sender.isDestroyed()) sender.send(`pty:data:${id}`, data)
  })
  proc.onExit(({ exitCode }) => {
    sessions.delete(id)
    if (!sender.isDestroyed()) sender.send(`pty:exit:${id}`, exitCode)
  })
  sender.once('destroyed', () => kill(id))
  return id
}

function kill(id: number): void {
  sessions.get(id)?.kill()
  sessions.delete(id)
}

export function registerPtyHandlers(): void {
  ipcMain.handle('pty:start', (event, options: PtyStartOptions) => start(event.sender, options))
  ipcMain.on('pty:write', (_event, id: number, data: string) => sessions.get(id)?.write(data))
  ipcMain.on('pty:resize', (_event, id: number, cols: number, rows: number) => {
    if (cols > 0 && rows > 0) sessions.get(id)?.resize(cols, rows)
  })
  ipcMain.on('pty:kill', (_event, id: number) => kill(id))
}

export function killAllPtys(): void {
  for (const id of [...sessions.keys()]) kill(id)
}
