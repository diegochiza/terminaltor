# Terminaltor

Terminal de escritorio para Windows inspirada en Warp, con IA integrada y la opción de elegir con qué agente o modelo conectarse.

Stack: Electron + React + TypeScript, xterm.js para dibujar el terminal y node-pty para conectarlo con la shell (PowerShell 7 si está instalado, si no Windows PowerShell).

## Requisitos

- Windows 10 u 11
- Node.js 20 o superior

node-pty trae binarios precompilados para Windows, así que no hace falta instalar Visual Studio Build Tools.

## Uso

```powershell
npm install
npm run dev        # abre la app en modo desarrollo
npm run dist:win   # genera el instalador en dist/
```

## Plan

1. **Base del terminal** (hecho): ventana Electron con una shell real.
2. **Bloques de comandos**: cada comando y su salida agrupados en un bloque.
3. **IA integrada con selector de modelo**: Claude, OpenAI, Gemini u Ollama mediante Vercel AI SDK.
4. **Agente que ejecuta**: la IA propone comandos y el usuario los aprueba.

## Estructura

```
src/main/      proceso principal: ventana y sesiones de shell (node-pty)
src/preload/   puente seguro entre la ventana y el proceso principal
src/renderer/  interfaz en React con xterm.js
src/shared/    tipos compartidos
```
