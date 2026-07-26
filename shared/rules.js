// ─────────────────────────────────────────────────────────────────────────────
// REGLAS DEL JUEGO  ·  compartido entre cliente y servidor
// ─────────────────────────────────────────────────────────────────────────────
// Funciones puras (sin estado, sin efectos secundarios) que definen la lógica
// de Stratego. El SERVIDOR es quien manda: valida cada movimiento con estas
// mismas funciones para que nadie pueda hacer trampas desde el navegador.

import { PIECES, PIECE_NAMES, isLake, TOTAL_PIECES, BOARD_SIZE, SETUP_ROWS } from "./pieces.js";

// ── ¿Quién gana un combate? ──────────────────────────────────────────────────
// Devuelve "attacker", "defender" o "both" (ambos eliminados).
export function resolveBattle(attackerName, defenderName) {
  if (defenderName === "Flag") return "attacker";                        // capturar bandera
  if (defenderName === "Bomb") return attackerName === "Miner" ? "attacker" : "defender"; // solo el minero desactiva bombas
  if (attackerName === "Spy" && PIECES[defenderName].rank === 10) return "attacker";       // el espía mata al Marshal si ataca

  const a = PIECES[attackerName].rank;
  const d = PIECES[defenderName].rank;
  if (a > d) return "attacker";
  if (a < d) return "defender";
  return "both";
}

// ── ¿Cuántas casillas recorre cada pieza de una vez? ─────────────────────────
// Explorador: sin límite. Capitán o superior (rango 6+): hasta 2. El resto: 1.
// Dar dos casillas a la oficialidad agiliza la partida y, de paso, un salto de
// dos deja de ser la firma inconfundible del Explorador: también puede ser un
// oficial. Esa ambigüedad es deliberada.
export const ALCANCE_OFICIALES = 2;
export const RANGO_OFICIAL = 6;

export function alcanceDe(name) {
  if (name === "Scout") return Infinity;
  return PIECES[name].rank >= RANGO_OFICIAL ? ALCANCE_OFICIALES : 1;
}

// ── ¿A dónde puede moverse una pieza? ────────────────────────────────────────
// board: matriz 10x10 de { name, player } | null
// Devuelve una lista de [fila, columna] destino válidas.
export function getValidMoves(board, row, col) {
  const piece = board[row][col];
  if (!piece) return [];
  if (piece.name === "Bomb" || piece.name === "Flag") return []; // no se mueven

  const alcance = alcanceDe(piece.name);
  const moves = [];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (const [dr, dc] of dirs) {
    let r = row + dr, c = col + dc, pasos = 1;
    // Avanza en línea recta hasta agotar su alcance. Nadie salta por encima de
    // nada: la primera pieza o lago que encuentre le corta el paso.
    while (pasos <= alcance && r >= 0 && r < 10 && c >= 0 && c < 10 && !isLake(r, c)) {
      const target = board[r][c];
      if (target) {
        if (target.player !== piece.player) moves.push([r, c]); // puede atacar
        break;                                                  // no salta piezas
      }
      moves.push([r, c]);
      r += dr; c += dc; pasos++;
    }
  }
  return moves;
}

// ── REGLA DE LAS DOS CASILLAS (two-squares rule) ─────────────────────────────
// Sin esta regla, dos jugadores pueden mover la misma pieza adelante y atrás
// eternamente y la partida nunca termina. La regla prohíbe que una pieza siga
// haciendo el vaivén entre las MISMAS dos casillas más de 3 turnos seguidos.
//
// Así: A→B (1), B→A (2), A→B (3) están permitidos; el siguiente B→A ya no.
// (La regla oficial se interpreta de varias formas; si prefieres ser más
// estricto, baja este número a 2.)
export const MAX_SHUTTLE_MOVES = 3;

// history: los movimientos de ESE MISMO jugador, el más reciente PRIMERO,
//          cada uno como { from: [r,c], to: [r,c] }.
// Nota: seguimos el vaivén por casillas, no por pieza concreta (las piezas no
// llevan identificador). Es como se implementa habitualmente y en la práctica
// coincide, porque para repetir el patrón tiene que ser la misma pieza.
export function violatesTwoSquares(history, fromR, fromC, toR, toC) {
  let shuttle = 1;                    // el movimiento que se quiere hacer ahora
  let expFrom = [toR, toC];           // el anterior debería haber sido B→A
  let expTo = [fromR, fromC];

  for (const m of history) {
    const sigue =
      m.from[0] === expFrom[0] && m.from[1] === expFrom[1] &&
      m.to[0] === expTo[0] && m.to[1] === expTo[1];
    if (!sigue) break;                // se rompió la cadena: no hay vaivén
    shuttle++;
    [expFrom, expTo] = [expTo, expFrom]; // alternamos sentido
  }

  return shuttle > MAX_SHUTTLE_MOVES;
}

// ── ¿Es legal este movimiento concreto? ──────────────────────────────────────
// El servidor llama a esto antes de aplicar nada.
// history es opcional: si se pasa, también se comprueba la regla de las dos casillas.
export function isLegalMove(board, fromR, fromC, toR, toC, player, history = []) {
  const piece = board[fromR][fromC];
  if (!piece || piece.player !== player) return false; // no es tu pieza
  if (!getValidMoves(board, fromR, fromC).some(([r, c]) => r === toR && c === toC)) return false;
  if (violatesTwoSquares(history, fromR, fromC, toR, toC)) return false;
  return true;
}

// ── Movimientos que el cliente debe pintar como disponibles ──────────────────
// Igual que getValidMoves, pero descartando los que rompen la regla de las dos
// casillas. Úsalo en la interfaz para no ofrecer una jugada que el servidor va
// a rechazar.
export function getLegalMoves(board, row, col, history = []) {
  return getValidMoves(board, row, col)
    .filter(([r, c]) => !violatesTwoSquares(history, row, col, r, c));
}

// ── ¿Ha terminado la partida? Devuelve "p1", "p2" o null ─────────────────────
export function checkWinner(board) {
  let flags = { p1: false, p2: false };
  let movable = { p1: false, p2: false };

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const p = board[r][c];
      if (!p) continue;
      if (p.name === "Flag") flags[p.player] = true;
      if (getValidMoves(board, r, c).length > 0) movable[p.player] = true;
    }
  }

  if (!flags.p2 || !movable.p2) return "p1"; // p2 perdió su bandera o no puede mover
  if (!flags.p1 || !movable.p1) return "p2";
  return null;
}

// ── Validar un despliegue inicial ────────────────────────────────────────────
// El servidor NO puede fiarse de lo que le manda el navegador: alguien podría
// editar el código de su cliente y enviarse 6 Marshals, 40 bombas, o colocar dos
// piezas en la misma casilla. Aquí se comprueba todo antes de tocar el tablero.
//
// placement: array de { name, row, col }, con row 0-3 (coordenadas locales del
//            jugador, ver setupRowsFor en pieces.js) y col 0-9.
// Devuelve { ok: true } o { ok: false, reason: "..." } para poder decirle al
// jugador qué ha fallado exactamente.
export function validateSetup(placement) {
  if (!Array.isArray(placement)) {
    return { ok: false, reason: "El despliegue debe ser una lista de piezas." };
  }
  if (placement.length !== TOTAL_PIECES) {
    return { ok: false, reason: `Debes colocar exactamente ${TOTAL_PIECES} piezas (has enviado ${placement.length}).` };
  }

  const counts = {};
  const ocupadas = new Set();

  for (const pieza of placement) {
    if (!pieza || typeof pieza !== "object") {
      return { ok: false, reason: "Hay una pieza mal formada en el despliegue." };
    }
    const { name, row, col } = pieza;

    if (!PIECES[name]) {
      return { ok: false, reason: `Pieza desconocida: ${name}` };
    }
    if (!Number.isInteger(row) || row < 0 || row >= SETUP_ROWS) {
      return { ok: false, reason: `Fila fuera de tu zona de despliegue: ${row} (debe ser 0-${SETUP_ROWS - 1}).` };
    }
    if (!Number.isInteger(col) || col < 0 || col >= BOARD_SIZE) {
      return { ok: false, reason: `Columna fuera del tablero: ${col} (debe ser 0-${BOARD_SIZE - 1}).` };
    }

    const casilla = `${row},${col}`;
    if (ocupadas.has(casilla)) {
      return { ok: false, reason: `Dos piezas en la misma casilla (fila ${row}, columna ${col}).` };
    }
    ocupadas.add(casilla);

    counts[name] = (counts[name] || 0) + 1;
  }

  for (const name of PIECE_NAMES) {
    const tiene = counts[name] || 0;
    if (tiene !== PIECES[name].count) {
      return { ok: false, reason: `Has puesto ${tiene} × ${PIECES[name].label} y debe haber exactamente ${PIECES[name].count}.` };
    }
  }

  return { ok: true };
}
