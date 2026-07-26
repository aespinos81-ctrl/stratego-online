// Prueba de humo end-to-end: arranca contra el servidor REAL por sockets.
// No es parte de `npm test` (necesita el servidor levantado). Úsalo así:
//
//   1) en una terminal:  cd server && npm run dev
//   2) en otra:          node tests/smoke-sockets.js
//
// Comprueba las tres cosas que el servidor tiene que hacer bien al emparejar y
// al desplegar, sin necesidad de abrir el navegador.

import { io } from "socket.io-client";

const URL = process.env.URL || "http://localhost:3001";
const conectar = () => io(URL, { transports: ["websocket"], forceNew: true });
const esperar = (socket, evento, ms = 3000) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout esperando "${evento}"`)), ms);
    socket.once(evento, d => { clearTimeout(t); res(d); });
  });

let fallos = 0;
const comprobar = (ok, texto) => {
  console.log(`${ok ? "✔" : "✖"} ${texto}`);
  if (!ok) fallos++;
};

// ── 1. Un jugador no puede emparejarse consigo mismo ─────────────────────────
const solo = conectar();
await esperar(solo, "connect");
solo.emit("findMatch");
await esperar(solo, "waitingForMatch");
solo.emit("findMatch");                       // insiste una segunda vez
const segunda = await Promise.race([
  esperar(solo, "matchFound", 1200).then(() => "matchFound"),
  esperar(solo, "waitingForMatch", 1200).then(() => "waitingForMatch"),
]);
comprobar(segunda === "waitingForMatch", "pulsar dos veces 'buscar partida' no te empareja contigo mismo");
solo.disconnect();

// ── 2. Sala por código: dos jugadores distintos sí se emparejan ──────────────
const a = conectar(), b = conectar();
await Promise.all([esperar(a, "connect"), esperar(b, "connect")]);
a.emit("createRoom");
const { code } = await esperar(a, "roomCreated");
b.emit("joinRoom", { code });
await esperar(b, "roomJoined");
await esperar(a, "bothPlayersReady");
comprobar(true, `sala ${code}: los dos jugadores dentro`);

// ── 3. El servidor rechaza un despliegue tramposo ────────────────────────────
const tramposo = Array.from({ length: 40 }, (_, i) => ({
  name: "Marshal", row: Math.floor(i / 10), col: i % 10,   // ¡40 Marshals!
}));
a.emit("submitPlacement", { placement: tramposo });
const error = await esperar(a, "errorMsg");
comprobar(/Marshal/.test(error), `despliegue tramposo rechazado: "${error}"`);

// ── 4. Un despliegue legal sí se acepta ──────────────────────────────────────
const { PIECES, PIECE_NAMES } = await import("../shared/pieces.js");
const piezas = [];
for (const n of PIECE_NAMES) for (let i = 0; i < PIECES[n].count; i++) piezas.push(n);
const legal = piezas.map((name, i) => ({ name, row: Math.floor(i / 10), col: i % 10 }));
a.emit("submitPlacement", { placement: legal });
await esperar(a, "waitingOpponentSetup");
comprobar(true, "despliegue legal aceptado, esperando al rival");

b.emit("submitPlacement", { placement: legal });
const estado = await esperar(b, "state");
const ocultas = estado.board[9].filter(Boolean);   // las piezas de p1 vistas por p2
comprobar(ocultas.length > 0 && ocultas.every(p => p.hidden === true),
  "p2 recibe las piezas de p1 ocultas, sin nombres");

a.disconnect(); b.disconnect();
console.log(fallos === 0 ? "\n🎉 Todo correcto." : `\n💥 ${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
