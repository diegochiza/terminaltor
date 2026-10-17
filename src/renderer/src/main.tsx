import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  // Sin StrictMode: en desarrollo monta los efectos dos veces y abriría y cerraría
  // una shell de más (node-pty lo reporta como "AttachConsole failed" en Windows).
  <App />
)
