# 🎖️ Stratego Online — Guía de proyecto

Este es el esqueleto de tu Stratego multijugador. Está pensado para que lo abras
con **Claude Code** y lo vayas construyendo paso a paso, entendiendo cada pieza.

Decisiones que ya tomamos juntos:
- **Multijugador en tiempo real** primero (por turnos asíncrono vendrá después).
- **Dos formas de emparejar**: sala con código para amigos + cola automática.
- **Objetivo**: aprender montándolo poco a poco.

---

## 🧠 La idea clave que hace especial a Stratego online

En casi todos los juegos online, el servidor puede mandar el estado completo a
ambos jugadores. En Stratego **no**, porque el juego se basa en *información
oculta*: no debes ver las piezas del rival.

Por eso la regla de oro de este proyecto es:

> **El servidor conoce todo el tablero. A cada jugador solo le envía lo que puede ver.**

Si mandáramos el tablero completo al navegador, cualquiera podría abrir las
herramientas de desarrollo y leer las piezas del rival. Trampa instantánea.
La función `viewFor(player)` en `server/game.js` es la que oculta esa información.

Esto también obliga a que el servidor sea **autoritativo**: valida cada
movimiento con las reglas de `/shared`. El navegador solo *pide* mover; el
servidor *decide*.

---

## 📁 Estructura del proyecto

```
stratego-online/
├── package.json         ← marca todo el proyecto como ESM ("type": "module")
│
├── shared/              ← reglas del juego (las usan cliente Y servidor)
│   ├── lagos.js         ← disposiciones de agua (clásica, reducida, aleatoria…)
│   ├── pieces.js        ← definición de las 12 piezas y el tablero
│   └── rules.js         ← combates, movimientos válidos, victoria
│
├── server/              ← el "árbitro" en tiempo real (Node + Socket.io)
│   ├── index.js         ← salas, emparejamiento, retransmisión
│   ├── game.js          ← estado de una partida + info oculta
│   └── package.json
│
├── tests/               ← pruebas automáticas (sin librerías, node --test)
│   ├── rules.test.js
│   ├── game.test.js
│   └── smoke-sockets.js ← prueba end-to-end contra el servidor real
│
└── client/              ← la interfaz (React), parte de tu stratego.jsx
    └── README.md
```

> El `package.json` de la raíz no es decorativo: sin él, Node trata los archivos
> de `shared/` como CommonJS y el servidor no arranca en Node 18.

---

## 🚀 Ruta de aprendizaje (haz esto en orden)

### Paso 0 · Prepara tu ordenador
Necesitas **Node.js** instalado (versión 18 o superior). Compruébalo con:
```bash
node --version
```
Si no lo tienes, descárgalo de nodejs.org. Y abre este proyecto en Claude Code.

### Paso 1 · Arranca el servidor y compruébalo
```bash
cd server
npm install
npm run dev
```
Deberías ver `🎖️  Servidor de Stratego escuchando en el puerto 3001`.
Si llegas aquí, tu backend ya vive. 🎉

Para comprobar que las reglas siguen bien después de tocar código, desde la raíz:
```bash
npm test
```
Y con el servidor arrancado, una prueba de extremo a extremo por sockets:
```bash
node tests/smoke-sockets.js
```

### Paso 2 · Monta el cliente con Vite
```bash
cd ../client
npm create vite@latest . -- --template react
npm install
npm install socket.io-client
```
Trae el tablero y el despliegue de tu `stratego.jsx` a este proyecto.

### Paso 3 · Conecta cliente y servidor
Reemplaza la IA local por el socket. Pídele a Claude Code que adapte el flujo
siguiendo el **protocolo de eventos** de más abajo. Prueba abriendo el juego en
**dos pestañas** del navegador: una crea sala, la otra entra con el código.

### Paso 4 · Pule la experiencia
Reconexión si se cae internet, mensajes de "tu rival se ha ido", indicador de
"esperando al rival", animaciones de combate como en la versión offline.

### Paso 5 · Turnos asíncronos (2ª modalidad)
Guardar partidas en una base de datos (por ejemplo SQLite o PostgreSQL) para que
los jugadores no tengan que estar conectados a la vez. Esto se añade *encima* de
lo ya construido.

### Paso 6 · Empaquetar como app móvil
Con **Capacitor** envuelves la web app para App Store y Google Play sin reescribir
casi nada. (Recuerda: cuenta de desarrollador Apple 99€/año, Google 25$ único, y
para iOS necesitas un Mac.)

---

## 📡 Protocolo de eventos (contrato cliente ↔ servidor)

Esto es lo que se dicen el navegador y el servidor. Mantenerlo claro evita el 90%
de los dolores de cabeza.

**El cliente ENVÍA:**
| Evento              | Datos                          | Cuándo |
|---------------------|--------------------------------|--------|
| `createRoom`        | —                              | Crear sala para un amigo |
| `joinRoom`          | `{ code }`                     | Entrar con un código |
| `findMatch`         | —                              | Buscar rival automático |
| `submitPlacement`   | `{ placement: [{name,row,col}] }` | Al terminar el despliegue |
| `move`              | `{ from: [r,c], to: [r,c] }`   | Al mover una pieza |

**El servidor ENVÍA:**
| Evento               | Datos                     | Significa |
|----------------------|---------------------------|-----------|
| `roomCreated`        | `{ code, player }`        | Tu sala está lista |
| `roomJoined`         | `{ code, player }`        | Entraste en la sala |
| `waitingForMatch`    | —                         | En cola, buscando rival |
| `matchFound`         | `{ code, player }`        | ¡Rival encontrado! |
| `bothPlayersReady`   | —                         | Los dos dentro, a desplegar |
| `waitingOpponentSetup`| —                        | Esperando que el rival despliegue |
| `state`              | `{ board, turn, phase, winner, battle, history }` | Nuevo estado (redibuja) |
| `gameOver`           | `{ winner }`              | Fin de la partida |
| `opponentLeft`       | —                         | Tu rival se desconectó |
| `errorMsg`           | `string`                  | Algo salió mal |

> `player` es siempre `"p1"` o `"p2"`. El tablero que recibes en `state` ya viene
> filtrado: las piezas enemigas ocultas llegan como `{ hidden: true }`.
>
> En `submitPlacement`, `row` va de **0 a 3 en coordenadas tuyas**: la 0 es tu
> vanguardia (la fila más cercana al centro) y la 3 tu retaguardia (donde se
> suele esconder la bandera). El servidor la traduce a la fila real del tablero,
> invirtiéndola para p2 (ver `setupRowsFor` en `shared/pieces.js`).
>
> `history` son **tus** últimos movimientos, `[{ from:[r,c], to:[r,c] }]` con el
> más reciente primero. Pásaselo a `getLegalMoves()` para no ofrecerle al jugador
> una jugada que el servidor va a rechazar por la regla de las dos casillas.

---

## 🎮 Los dos modos de juego

Al abrir el juego se elige con qué reglas jugar. La diferencia está definida en
un solo sitio, la constante `MODOS` de `client/src/Stratego.jsx`, y todo lo demás
la consulta:

| | Stratego clásico | Stratego 2.0 |
|---|---|---|
| Movimiento | Solo el Explorador recorre varias casillas | + del Capitán para arriba, hasta 2 |
| Zonas de agua | Las clásicas, fijas | A elegir: clásica, reducida, sorteada o ninguna |
| Marcas de deducción | No | Sí: rastro de la última jugada y marcas por el salto visto |
| Cementerio | Sí | Sí |

El cementerio está en los dos porque no es una ayuda añadida: en una partida de
mesa las piezas capturadas se dejan a la vista. Lo que sí es ayuda —y por eso
solo aparece en el 2.0— es que el tablero **recuerde por ti** qué piezas se han
movido y cuánto.

> ⚠️ Pendiente para el multijugador: el modo tiene que fijarse al crear la sala y
> guardarse en `Game`, igual que se hizo con las zonas de agua. Hoy `shared/rules.js`
> aplica siempre el alcance del 2.0.

---

## ⚖️ Estado de las reglas

**Ya implementadas y con tests** (`npm test`):
combates completos (espía, minero, bombas, bandera), movimiento del explorador,
lagos, victoria por bandera o por quedarse sin movimientos, validación del
despliegue en el servidor y **regla de las dos casillas** (`MAX_SHUTTLE_MOVES`
en `shared/rules.js`: una pieza no puede hacer el vaivén entre las mismas dos
casillas más de 3 turnos seguidos).

**Zonas de agua** (en `shared/lagos.js`): la disposición ya no es fija. Hay
cuatro opciones —**clásica** (8 casillas), **reducida** (4), **aleatoria** (se
sortea) y **sin agua**— y se elige en la pantalla de despliegue. Toda
disposición es simétrica al girar el tablero 180°, o un jugador saldría
beneficiado; el sorteo además garantiza tres columnas libres para que el centro
no se convierta en un embudo. El servidor guarda la suya en `Game` y la envía en
`state.lagos` para que el navegador sepa dibujar el tablero.

**Movimiento** (en `shared/rules.js`, lo usan cliente y servidor):
- Explorador: línea recta sin límite.
- **Capitán o superior (rango 6+): hasta 2 casillas.**
- El resto: 1 casilla.

Nadie salta por encima de nada. Ojo al efecto secundario: un salto de dos ya no
identifica a un Explorador, porque también puede ser un oficial.

**Ayudas de deducción** (de momento solo en el cliente, versión offline): un
cementerio por jugador desglosado por tipo de pieza, y marcas sobre las fichas
enemigas según el salto más largo que les hayas visto dar — 1 casilla: no es
bomba ni bandera; 2: Explorador u oficial; 3 o más: Explorador seguro. Más el
rastro de la última jugada del rival.

> ⚠️ Al conectar el multijugador, `viewFor()` tendrá que enviar `hasMoved` y
> `maxSalto` de las piezas enemigas ocultas. No es hacer trampa: son datos que
> cualquiera puede deducir mirando el tablero. Si no se envían, el jugador online
> perderá unas ayudas que sí tiene contra la IA.

**Todavía pendientes:**
- *More-squares rule*: la hermana mayor de la anterior, prohíbe repetir
  indefinidamente un patrón más largo. Es bastante más liosa de implementar.
- Reconexión: si se te cae internet, ahora mismo la partida se borra (paso 4).
- Límite de tiempo por turno.

---

## 💡 Consejos para trabajar con Claude Code

- Ve **paso a paso**. No intentes montar todo de golpe; sigue la ruta de arriba.
- Cuando algo falle, copia el error completo y pídele a Claude Code que lo explique.
- Pídele que te comente el código que genera, así aprendes mientras avanzas.
- Prueba a menudo con **dos pestañas** abiertas: es tu campo de pruebas multijugador.

¡Suerte, general! 🫡
