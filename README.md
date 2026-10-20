# Terminaltor

Terminal de escritorio para Windows inspirada en Warp, con IA integrada y la opción de elegir con qué agente o modelo conectarse.

Stack: Electron + React + TypeScript, xterm.js para dibujar el terminal y node-pty para conectarlo con la shell (PowerShell 7 si está instalado, si no Windows PowerShell).

## Requisitossss 

- Windows 10 u 11
- Node.js 20 o superior

node-pty trae binarios precompilados para Windows, así que no hace falta instalar Visual Studio Build Tools.

## Uso

```powershell
npm install
npm run dev        # abre la app en modo desarrollo
npm run dist:win   # genera el instalador y la versión portable en dist/
```

## Pestañas y paneles

Cada pestaña puede dividirse en varios paneles, cada uno con su propia PowerShell. La pestaña se llama como la carpeta en la que está su panel activo.

| Atajo | Acción |
| --- | --- |
| `Ctrl+Shift+T` | Nueva pestaña |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Pestaña siguiente / anterior |
| `Ctrl+1` … `Ctrl+9` | Ir a la pestaña 1 a 9 |
| `Ctrl+Shift+D` | Dividir el panel a la derecha |
| `Ctrl+Shift+E` | Dividir el panel hacia abajo |
| `Alt+Flechas` | Mover el foco al panel vecino |
| `Ctrl+Shift+W` | Cerrar el panel (o la pestaña, si es el último) |

También hay botones para dividir en la barra superior. Los separadores se arrastran para cambiar el tamaño y con doble clic vuelven a mitad y mitad. Escribir `exit` cierra ese panel; clic con la rueda en una pestaña la cierra. Al cerrar la última pestaña se cierra la ventana.

Los paneles **Bloques** e **IA** trabajan con el panel que tiene el foco: los bloques que ves son los de ese panel, y los comandos que apruebas a la IA corren ahí.

## Bloques de comandos

Al abrir PowerShell, Terminaltor le agrega una pequeña integración (sin tocar tu perfil) que marca dónde empieza y termina cada comando. Con eso:

- Cada comando queda separado por una línea, con un punto verde (correcto), rojo (error) o azul (en curso) a la izquierda y la misma marca en la barra de desplazamiento.
- El panel **Bloques** lista los comandos con su estado, duración y carpeta. Desde ahí puedes ver u ocultar la salida, copiar el comando o la salida, y hacer clic en el comando para saltar a él.
- `Ctrl+Shift+↑` / `Ctrl+Shift+↓` saltan entre bloques en el terminal.
- `Ctrl+Shift+C` / `Ctrl+Shift+V` copian y pegan.

Para probar la detección de bloques con una PowerShell real: `npm run test:blocks`.

## IA integrada

El botón **IA** abre un panel de chat. Arriba eliges el proveedor y el modelo; la lista de modelos se carga desde el proveedor con tu clave, y también puedes escribir el nombre de cualquier modelo.

| Proveedor | Qué necesita |
| --- | --- |
| Claude | Clave de API de Anthropic (console.anthropic.com) |
| OpenAI | Clave de API. Cambiando la URL base sirve para OpenRouter, Groq, LM Studio y otros compatibles |
| Gemini | Clave de API de Google AI Studio |
| Ollama | Ollama abierto en tu equipo (por defecto en http://localhost:11434) |

- Las claves se guardan cifradas con tu usuario de Windows (DPAPI, vía `safeStorage` de Electron) en `%APPDATA%\terminaltor\ai-settings.json`, y solo el proceso principal las usa.
- En el panel de bloques, **Enviar a la IA** adjunta el comando con su carpeta, código de salida y salida a tu próxima pregunta.
- Los comandos que la IA muestra en sus respuestas tienen botones **Copiar** e **Insertar en terminal**. Insertar los escribe en la línea de comandos sin ejecutarlos.

### Agente

La IA puede pedir ejecutar comandos para investigar o hacer lo que le pediste. Cada comando aparece en una tarjeta con la razón, y nada corre hasta que lo apruebas:

- **Ejecutar** lo corre en el terminal (queda como un bloque más) y le devuelve la salida y el código de salida a la IA, que sigue trabajando con eso.
- **Editar** te deja cambiarlo antes; la IA se entera de que lo modificaste.
- **Rechazar** se lo dice a la IA para que busque otra forma.
- Los comandos que borran o cambian datos (`Remove-Item`, `Stop-Process`, `Format-Volume`, `-Recurse -Force`, redirecciones `>`, etc.) se marcan con una advertencia.
- Mientras corre un comando puedes **Interrumpir** (Ctrl+C), y **Detener** corta al agente. Hay un límite de 25 comandos seguidos por cada mensaje tuyo.

## Ajustes

**Ajustes** en la barra superior cambia el tema (Oscuro, Claro, Solarizado) y el tamaño de letra; también `Ctrl +`, `Ctrl −` y `Ctrl 0`. Se recuerdan entre sesiones.

Pruebas: `npm run test:providers` comprueba los cuatro proveedores contra un servidor simulado, incluido el ciclo de pedir un comando y recibir su salida (no usa claves reales).

## Plan

1. **Base del terminal** (hecho): ventana Electron con una shell real.
2. **Bloques de comandos** (hecho): cada comando y su salida agrupados en un bloque.
3. **IA integrada con selector de modelo** (hecho): Claude, OpenAI (o compatibles), Gemini y Ollama.
4. **Agente que ejecuta** (hecho): la IA propone comandos y el usuario los aprueba; también tema y tamaño de letra.
5. **Pestañas y paneles divididos** (hecho).

## Estructura

```
src/main/      proceso principal: ventana y sesiones de shell (node-pty)
src/preload/   puente seguro entre la ventana y el proceso principal
src/renderer/  interfaz en React con xterm.js
src/shared/    tipos compartidos
```
