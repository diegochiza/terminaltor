import type { ITheme } from '@xterm/xterm'

export interface AppTheme {
  id: string
  name: string
  /** Variables CSS de la interfaz. */
  ui: Record<string, string>
  terminal: ITheme
}

export const THEMES: AppTheme[] = [
  {
    id: 'dark',
    name: 'Oscuro',
    ui: { '--bg': '#0f1117', '--panel': '#161922', '--border': '#262b38', '--text': '#e6e6e6', '--muted': '#8a90a2', '--code-bg': '#0a0c11', '--chip': '#24304a', '--user-bg': '#1d2433' },
    terminal: { background: '#0f1117', foreground: '#e6e6e6', cursor: '#7aa2f7', selectionBackground: '#33467c', overviewRulerBorder: '#262b38' }
  },
  {
    id: 'light',
    name: 'Claro',
    ui: { '--bg': '#ffffff', '--panel': '#f4f5f7', '--border': '#d9dce3', '--text': '#1f2328', '--muted': '#656d76', '--code-bg': '#f6f8fa', '--chip': '#dde6f7', '--user-bg': '#e8eefb' },
    terminal: {
      background: '#ffffff',
      foreground: '#1f2328',
      cursor: '#2f5bd3',
      selectionBackground: '#b6cdf5',
      overviewRulerBorder: '#d9dce3',
      black: '#24292f',
      red: '#cf222e',
      green: '#116329',
      yellow: '#7d4e00',
      blue: '#0969da',
      magenta: '#8250df',
      cyan: '#1b7c83',
      white: '#6e7781',
      brightBlack: '#57606a',
      brightRed: '#a40e26',
      brightGreen: '#1a7f37',
      brightYellow: '#633c01',
      brightBlue: '#218bff',
      brightMagenta: '#a475f9',
      brightCyan: '#3192aa',
      brightWhite: '#8c959f'
    }
  },
  {
    id: 'solarized',
    name: 'Solarizado',
    ui: { '--bg': '#002b36', '--panel': '#073642', '--border': '#0d4a58', '--text': '#eee8d5', '--muted': '#93a1a1', '--code-bg': '#00212b', '--chip': '#0d4a58', '--user-bg': '#0a3f4c' },
    terminal: {
      background: '#002b36',
      foreground: '#eee8d5',
      cursor: '#268bd2',
      selectionBackground: '#0d4a58',
      overviewRulerBorder: '#0d4a58',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#586e75',
      brightRed: '#cb4b16',
      brightGreen: '#93a1a1',
      brightYellow: '#839496',
      brightBlue: '#6c71c4',
      brightMagenta: '#d33682',
      brightCyan: '#2aa198',
      brightWhite: '#fdf6e3'
    }
  }
]

export interface Preferences {
  themeId: string
  fontSize: number
}

const KEY = 'terminaltor.preferences'
const defaults: Preferences = { themeId: 'dark', fontSize: 14 }

export function loadPreferences(): Preferences {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return defaults
  }
}

export function savePreferences(preferences: Preferences): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences))
  } catch {
    // Sin almacenamiento: las preferencias duran hasta cerrar la app.
  }
}

export function findTheme(id: string): AppTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
