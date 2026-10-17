import { clipboard, contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { TerminaltorApi } from '../shared/api'

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T): void => listener(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: TerminaltorApi = {
  platform: process.platform,
  clipboard: {
    writeText: (text) => clipboard.writeText(text),
    readText: () => clipboard.readText()
  },
  ai: {
    settings: () => ipcRenderer.invoke('ai:settings'),
    saveProvider: (id, update) => ipcRenderer.invoke('ai:saveProvider', id, update),
    select: (provider, model) => ipcRenderer.invoke('ai:select', provider, model),
    listModels: (id) => ipcRenderer.invoke('ai:listModels', id),
    send: (id, message) => ipcRenderer.send('ai:send', id, message),
    toolResults: (id, results) => ipcRenderer.send('ai:toolResults', id, results),
    cancel: (id) => ipcRenderer.send('ai:cancel', id),
    reset: (id) => ipcRenderer.send('ai:reset', id),
    onEvent: (id, listener) => subscribe(`ai:event:${id}`, listener)
  },
  pty: {
    start: (options) => ipcRenderer.invoke('pty:start', options),
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id) => ipcRenderer.send('pty:kill', id),
    onData: (id, listener) => subscribe(`pty:data:${id}`, listener),
    onExit: (id, listener) => subscribe(`pty:exit:${id}`, listener)
  }
}

contextBridge.exposeInMainWorld('terminaltor', api)
