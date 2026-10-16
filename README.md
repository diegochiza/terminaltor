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

## Bloques de comandos

Al abrir PowerShell, Terminaltor le agrega una pequeña integración (sin tocar tu perfil) que marca dónde empieza y termina cada comando. Con eso:

- Cada comando queda separado por una línea, con un punto verde (correcto), rojo (error) o azul (en curso) a la izquierda y la misma marca en la barra de desplazamiento.
- El panel **Bloques** lista los comandos con su estado, duración y carpeta. Desde ahí puedes ver u ocultar la salida, copiar el comando o la salida, y hacer clic en el comando para saltar a él.
- `Ctrl+Shift+↑` / `Ctrl+Shift+↓` saltan entre bloques en el terminal.
- `Ctrl+Shift+C` / `Ctrl+Shift+V` copian y pegan.

Para probar la detección de bloques con una PowerShell real: `npm run test:blocks`.

## Plan

1. **Base del terminal** (hecho): ventana Electron con una shell real.
2. **Bloques de comandos** (hecho): cada comando y su salida agrupados en un bloque.
3. **IA integrada con selector de modelo**: Claude, OpenAI, Gemini u Ollama mediante Vercel AI SDK.
4. **Agente que ejecuta**: la IA propone comandos y el usuario los aprueba.

## Estructura

```
src/main/      proceso principal: ventana y sesiones de shell (node-pty)
src/preload/   puente seguro entre la ventana y el proceso principal
src/renderer/  interfaz en React con xterm.js
src/shared/    tipos compartidos
```
