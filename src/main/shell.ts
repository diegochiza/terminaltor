import { existsSync } from 'fs'
import { join } from 'path'
import { isPowershell, powershellIntegrationArgs } from './shellIntegration'

// En Windows preferimos PowerShell 7 (pwsh) si está instalado; si no, Windows PowerShell.
// TERMINALTOR_SHELL permite forzar otra shell (útil para desarrollar en otros sistemas).
export function defaultShell(): { file: string; args: string[] } {
  const file = process.env.TERMINALTOR_SHELL ?? platformShell()
  if (isPowershell(file)) {
    return { file, args: ['-NoLogo', ...powershellIntegrationArgs()] }
  }
  return { file, args: process.platform === 'win32' ? [] : ['-l'] }
}

function platformShell(): string {
  if (process.platform === 'win32') {
    const pathDirs = (process.env.PATH ?? '').split(';')
    const pwsh = pathDirs.map((dir) => join(dir, 'pwsh.exe')).find((p) => existsSync(p))
    return pwsh ?? 'powershell.exe'
  }
  return process.env.SHELL ?? '/bin/bash'
}
