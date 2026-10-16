import { existsSync } from 'fs'
import { join } from 'path'

// En Windows preferimos PowerShell 7 (pwsh) si está instalado; si no, Windows PowerShell.
export function defaultShell(): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    const pathDirs = (process.env.PATH ?? '').split(';')
    const pwsh = pathDirs.map((dir) => join(dir, 'pwsh.exe')).find((p) => existsSync(p))
    return { file: pwsh ?? 'powershell.exe', args: ['-NoLogo'] }
  }
  return { file: process.env.SHELL ?? '/bin/bash', args: ['-l'] }
}
