import TerminalView from './TerminalView'

export default function App(): React.JSX.Element {
  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">Terminaltor</span>
      </header>
      <main className="workspace">
        <TerminalView />
      </main>
    </div>
  )
}
