# Cliente (el navegador)

Aquí irá la parte visual: el tablero, el despliegue y la conexión al servidor.

## De dónde partimos

Ya tienes un juego de Stratego de un jugador hecho en React (el archivo
`stratego.jsx` que creamos antes). **Ese es tu punto de partida para la interfaz.**
Reutilizarás casi todo el dibujo del tablero, las piezas y el despliegue.

## Qué cambia respecto a la versión de un jugador

En la versión offline, toda la lógica vivía en el navegador. En la versión online
**el navegador ya NO decide nada**: solo dibuja lo que el servidor le manda y le
envía las intenciones del jugador ("quiero mover de aquí a allá").

El flujo pasa a ser:

1. El cliente se conecta al servidor con Socket.io.
2. El jugador crea/entra en una sala (o busca partida automática).
3. Cada jugador despliega sus 40 piezas y pulsa "listo" → `submitPlacement`.
4. Cuando el jugador mueve, se emite `move` al servidor.
5. El servidor valida, actualiza y devuelve el nuevo `state` a ambos.
6. El cliente redibuja con lo que llega en `state` (nunca inventa nada).

## Cómo montarlo (esto lo harás con Claude Code)

Se recomienda **Vite + React**:

```bash
npm create vite@latest . -- --template react
npm install
npm install socket.io-client
```

Luego, dentro del código React, la conexión es tan simple como:

```js
import { io } from "socket.io-client";
const socket = io("http://localhost:3001");

socket.on("state", (data) => setBoard(data.board));   // redibujar
socket.emit("move", { from: [r1, c1], to: [r2, c2] }); // enviar jugada
```

> Cuando llegues a este punto, pídele a Claude Code:
> *"Adapta stratego.jsx para que en lugar de la IA local use el socket del servidor,
> siguiendo el protocolo de eventos del README principal."*
