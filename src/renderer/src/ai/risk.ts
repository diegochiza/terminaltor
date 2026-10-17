// Patrones de comandos que borran, sobrescriben o cambian el sistema. Solo sirven
// para advertir: todos los comandos piden aprobación igual.
const risky: RegExp[] = [
  /\b(Remove-Item|rm|rmdir|del|erase|rd|ri)\b/i,
  /\b(Format-Volume|format|Clear-Disk|Initialize-Disk|diskpart)\b/i,
  /\b(Stop-Computer|Restart-Computer|shutdown)\b/i,
  /\b(Set-ExecutionPolicy|reg\s+(delete|add)|Remove-ItemProperty|Set-ItemProperty)\b/i,
  /\b(Stop-Process|kill|taskkill|Stop-Service)\b/i,
  /\b(Uninstall-|winget\s+uninstall|choco\s+uninstall)/i,
  /-Recurse\b.*-Force\b|-Force\b.*-Recurse\b/i,
  /\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|push\s+.*--force)/i,
  /(^|[^>])>\s*[^>&\s]/ // redirección que sobrescribe un archivo
]

export function isRisky(command: string): boolean {
  return risky.some((pattern) => pattern.test(command))
}
