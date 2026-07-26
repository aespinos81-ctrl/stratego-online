// ─────────────────────────────────────────────────────────────────────────────
// SERVIDOR  ·  Node.js + Socket.io
// ─────────────────────────────────────────────────────────────────────────────
// Este es el proceso que corre en tu ordenador (o en un servidor en la nube).
// Se encarga de:
//   1) Emparejar jugadores: por CÓDIGO DE SALA o por COLA AUTOMÁTICA.
//   2) Retransmitir movimientos entre los dos jugadores en TIEMPO REAL.
//   3) Ser la autoridad: valida todo con la lógica de /shared.
//
// Arráncalo con:  node server/index.js
// (necesita las dependencias del package.json de esta carpeta)

import { createServer } from "http";
import { Server } from "socket.io";
import { Game } from "./game.js";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" }, // en producción, restringe esto a tu dominio
});

// Estado en memoria del servidor
const games = new Map();       // roomCode -> Game
let waitingPlayer = null;      // socket a la espera de rival (cola automática)

// Genera un código de sala corto y legible, tipo "K4P9"
function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (games.has(code));
  return code;
}

// ¿Este socket ya está metido en una partida? Sin esta comprobación, un jugador
// podría crear una sala y además ponerse en la cola automática, y acabar en dos
// partidas a la vez (o emparejado consigo mismo).
function yaEstaJugando(socket) {
  const room = socket.data?.room;
  return Boolean(room && games.has(room));
}

// Si el socket estaba haciendo cola, lo sacamos de ella.
function salirDeLaCola(socket) {
  if (waitingPlayer?.id === socket.id) waitingPlayer = null;
}

io.on("connection", (socket) => {
  console.log("🔌 Conectado:", socket.id);

  // ── CREAR SALA (jugar con un amigo) ────────────────────────────────────────
  socket.on("createRoom", () => {
    if (yaEstaJugando(socket)) return socket.emit("errorMsg", "Ya estás en una partida.");
    salirDeLaCola(socket);
    const code = makeRoomCode();
    const game = new Game(code);
    game.players.p1 = socket.id;
    games.set(code, game);
    socket.join(code);
    socket.data = { room: code, player: "p1" };
    socket.emit("roomCreated", { code, player: "p1" });
    console.log(`🏠 Sala ${code} creada por ${socket.id}`);
  });

  // ── UNIRSE A SALA POR CÓDIGO ───────────────────────────────────────────────
  socket.on("joinRoom", ({ code }) => {
    if (yaEstaJugando(socket)) return socket.emit("errorMsg", "Ya estás en una partida.");
    const game = games.get(code);
    if (!game)            return socket.emit("errorMsg", "Esa sala no existe.");
    if (game.players.p2)  return socket.emit("errorMsg", "La sala ya está llena.");
    if (game.players.p1 === socket.id) return socket.emit("errorMsg", "No puedes unirte a tu propia sala.");
    salirDeLaCola(socket);
    game.players.p2 = socket.id;
    socket.join(code);
    socket.data = { room: code, player: "p2" };
    socket.emit("roomJoined", { code, player: "p2" });
    io.to(code).emit("bothPlayersReady"); // ambos dentro: a desplegar
    console.log(`➡️  ${socket.id} se unió a ${code}`);
  });

  // ── EMPAREJAMIENTO AUTOMÁTICO (con desconocidos) ───────────────────────────
  socket.on("findMatch", () => {
    if (yaEstaJugando(socket)) return socket.emit("errorMsg", "Ya estás en una partida.");
    // Si eres TÚ quien ya está esperando, no te emparejamos contigo mismo:
    // simplemente te recordamos que sigues en la cola.
    if (waitingPlayer?.id === socket.id) return socket.emit("waitingForMatch");

    if (waitingPlayer && waitingPlayer.connected) {
      const code = makeRoomCode();
      const game = new Game(code);
      game.players.p1 = waitingPlayer.id;
      game.players.p2 = socket.id;
      games.set(code, game);
      waitingPlayer.join(code);
      socket.join(code);
      waitingPlayer.data = { room: code, player: "p1" };
      socket.data = { room: code, player: "p2" };
      waitingPlayer.emit("matchFound", { code, player: "p1" });
      socket.emit("matchFound", { code, player: "p2" });
      io.to(code).emit("bothPlayersReady");
      console.log(`🤝 Emparejados en ${code}`);
      waitingPlayer = null;
    } else {
      waitingPlayer = socket;
      socket.emit("waitingForMatch");
      console.log(`⏳ ${socket.id} esperando rival...`);
    }
  });

  // ── DESPLIEGUE INICIAL ─────────────────────────────────────────────────────
  socket.on("submitPlacement", ({ placement }) => {
    const { room, player } = socket.data || {};
    const game = games.get(room);
    if (!game) return socket.emit("errorMsg", "No estás en ninguna partida.");
    // El servidor NO se fía del navegador: valida las 40 piezas antes de nada.
    const res = game.setPlacement(player, placement);
    if (!res.ok) return socket.emit("errorMsg", res.reason);
    if (game.phase === "playing") {
      // Ambos han desplegado: enviamos a cada uno SU vista del tablero
      sendState(game);
    } else {
      socket.emit("waitingOpponentSetup");
    }
  });

  // ── MOVIMIENTO EN PARTIDA ──────────────────────────────────────────────────
  socket.on("move", ({ from, to }) => {
    const { room, player } = socket.data || {};
    const game = games.get(room);
    if (!game) return socket.emit("errorMsg", "No estás en ninguna partida.");
    if (!Array.isArray(from) || !Array.isArray(to)) {
      return socket.emit("errorMsg", "Movimiento mal formado.");
    }
    const result = game.applyMove(player, from[0], from[1], to[0], to[1]);
    if (!result.ok) return socket.emit("errorMsg", result.reason);
    // Retransmitimos el nuevo estado a ambos + info del combate si lo hubo
    sendState(game, result.battle);
    if (result.winner) io.to(room).emit("gameOver", { winner: result.winner });
  });

  // ── DESCONEXIÓN ────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log("❌ Desconectado:", socket.id);
    salirDeLaCola(socket);
    const { room } = socket.data || {};
    if (room && games.has(room)) {
      io.to(room).emit("opponentLeft");
      games.delete(room);
    }
  });
});

// Envía a cada jugador su vista personalizada del tablero (info oculta protegida)
function sendState(game, battle = null) {
  for (const player of ["p1", "p2"]) {
    const socketId = game.players[player];
    if (socketId) {
      io.to(socketId).emit("state", { ...game.viewFor(player), battle });
    }
  }
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🎖️  Servidor de Stratego escuchando en el puerto ${PORT}\n`);
});
