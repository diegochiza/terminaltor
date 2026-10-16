// Integración con PowerShell: envuelve el prompt y la lectura de línea para que la
// shell emita secuencias OSC que marcan cada comando. El terminal las usa para armar
// los bloques:
//   OSC 133;A  inicio del prompt        OSC 133;B  fin del prompt
//   OSC 133;C  empieza la salida        OSC 133;D;<código>  terminó el comando
//   OSC 7717;Cmd;<base64>  texto del comando   OSC 7717;Cwd;<base64>  carpeta actual
// Se pasa con -EncodedCommand (y no como archivo .ps1) para que la política de
// ejecución de Windows no lo bloquee.
const powershellScript = [
  '$Global:__TtE = [char]0x1b',
  '$Global:__TtB = [char]0x07',
  '$Global:__TtRunning = $false',
  'function Global:__TtB64([string]$s) { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s)) }',
  '$Global:__TtOriginalPrompt = $function:Prompt',
  'function Global:Prompt() {',
  '  $ok = $global:?',
  '  $code = $global:LASTEXITCODE',
  "  $out = ''",
  '  if ($Global:__TtRunning) {',
  '    $exit = if ($ok) { 0 } elseif ($code) { $code } else { 1 }',
  "    $out += $Global:__TtE + ']133;D;' + $exit + $Global:__TtB",
  '    $Global:__TtRunning = $false',
  '  }',
  '  $cwd = $executionContext.SessionState.Path.CurrentLocation.ProviderPath',
  "  $out += $Global:__TtE + ']7717;Cwd;' + (__TtB64 $cwd) + $Global:__TtB",
  "  $out += $Global:__TtE + ']133;A' + $Global:__TtB",
  "  $out += (& $Global:__TtOriginalPrompt) -join ''",
  "  $out += $Global:__TtE + ']133;B' + $Global:__TtB",
  '  $global:LASTEXITCODE = $code',
  '  $out',
  '}',
  'if (Get-Command PSConsoleHostReadLine -ErrorAction SilentlyContinue) {',
  '  $Global:__TtOriginalReadLine = $function:PSConsoleHostReadLine',
  '  function Global:PSConsoleHostReadLine {',
  '    $line = & $Global:__TtOriginalReadLine',
  '    $Global:__TtRunning = $true',
  "    [Console]::Write($Global:__TtE + ']7717;Cmd;' + (__TtB64 ([string]$line)) + $Global:__TtB + $Global:__TtE + ']133;C' + $Global:__TtB)",
  '    $line',
  '  }',
  '}'
].join('\n')

export function powershellIntegrationArgs(): string[] {
  const encoded = Buffer.from(powershellScript, 'utf16le').toString('base64')
  return ['-NoExit', '-EncodedCommand', encoded]
}

export function isPowershell(file: string): boolean {
  return /(^|[\\/])(pwsh|powershell)(\.exe)?$/i.test(file)
}
