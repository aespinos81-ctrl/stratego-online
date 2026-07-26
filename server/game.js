// ─────────────────────────────────────────────────────────────────────────────
// ESTADO DE UNA PARTIDA  ·  vive en el servidor (autoritativo)
// ─────────────────────────────────────────────────────────────────────────────
// Una instancia de Game representa UNA partida entre dos jugadores. El servidor
// es el único que conoce el tablero completo. A cada jugador solo le enviamos
// lo que "puede ver": sus piezas + las piezas enemigas ya reveladas.

import { resolveBattle, isLegalMove, checkWinner, validateSetup } from "../shared/rules.js";
import { setupRowsFor, BOARD_SIZE } from "../shared/pieces.js";

// Cuántos movimientos recientes guardamos de cada jugador. Solo se usan para la
// regla de las dos casillas, así que con unos pocos sobra.
const HISTORY_LENGTH = 8;

const dentroDelTablero = (r, c) =>
  Number.isInteger(r) && Number.isInteger(c) &&
  r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;

export class Game {
  constructor(id) {
    this.id = id;
    this.board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    this.players = {};        // { p1: socketId, p2: socketId }
    this.ready = { p1: false, p2: false };
    this.turn = "p1";
    this.phase = "setup";     // "setup" | "playing" | "finished"
    this.winner = null;
    this.history = { p1: [], p2: [] }; // movimientos recientes, el más nuevo primero
  }

  // Coloca el despliegue de un jugador en su mitad del tablero.
  // Devuelve { ok: true } o { ok: false, reason }. Si el despliegue es inválido
  // NO toca el tablero: se valida entero antes de colocar nada.
  setPlacement(player, placement) {
    if (this.phase !== "setup")  return { ok: false, reason: "La partida ya ha empezado." };
    if (this.ready[player])      return { ok: false, reason: "Ya has enviado tu despliegue." };

    const check = validateSetup(placement);
    if (!check.ok) return check;

    // 'row' viene 0-3 desde el cliente; lo mapeamos a la zona real del jugador
    const rows = setupRowsFor(player);
    for (const { name, row, col } of placement) {
      this.board[rows[row]][col] = { name, player, revealed: false };
    }

    this.ready[player] = true;
    if (this.ready.p1 && this.ready.p2) this.phase = "playing";
    return { ok: true };
  }

  // Aplica un movimiento SOLO si es legal.
  // Devuelve { ok: true, battle, winner, turn } o { ok: false, reason }.
  applyMove(player, fromR, fromC, toR, toC) {
    if (this.phase !== "playing") return { ok: false, reason: "La partida no está en juego." };
    if (this.turn !== player)     return { ok: false, reason: "No es tu turno." };
    if (!dentroDelTablero(fromR, fromC) || !dentroDelTablero(toR, toC)) {
      return { ok: false, reason: "Casilla fuera del tablero." };
    }
    // isLegalMove comprueba también la regla de las dos casillas con el historial
    if (!isLegalMove(this.board, fromR, fromC, toR, toC, player, this.history[player])) {
      return { ok: false, reason: "Movimiento no válido." };
    }

    const piece = this.board[fromR][fromC];
    const target = this.board[toR][toC];
    let battle = null;

    if (target && target.player !== player) {
      const result = resolveBattle(piece.name, target.name);
      battle = {
        result,
        attacker: { ...piece, row: fromR, col: fromC },
        defender: { ...target, row: toR, col: toC },
      };
      if (result === "attacker") {
        this.board[toR][toC] = { ...piece, revealed: true };
        this.board[fromR][fromC] = null;
      } else if (result === "defender") {
        this.board[fromR][fromC] = null;
        this.board[toR][toC] = { ...target, revealed: true };
      } else {
        this.board[fromR][fromC] = null;
        this.board[toR][toC] = null;
      }
    } else {
      // Movimiento simple sin combate
      this.board[toR][toC] = piece;
      this.board[fromR][fromC] = null;
    }

    // Apuntamos el movimiento: lo necesita la regla de las dos casillas
    this.history[player].unshift({ from: [fromR, fromC], to: [toR, toC] });
    if (this.history[player].length > HISTORY_LENGTH) this.history[player].pop();

    // Comprobar victoria y pasar turno
    const w = checkWinner(this.board);
    if (w) {
      this.winner = w;
      this.phase = "finished";
    } else {
      this.turn = this.turn === "p1" ? "p2" : "p1";
    }

    return { ok: true, battle, winner: this.winner, turn: this.turn };
  }

  // Genera la vista que ve UN jugador concreto (información oculta del rival).
  viewFor(player) {
    const view = this.board.map(row =>
      row.map(cell => {
        if (!cell) return null;
        if (cell.player === player || cell.revealed) {
          return { name: cell.name, player: cell.player, revealed: cell.revealed };
        }
        // Pieza enemiga oculta: solo revelamos que HAY una pieza, no cuál
        return { hidden: true, player: cell.player };
      })
    );
    return {
      board: view,
      turn: this.turn,
      phase: this.phase,
      winner: this.winner,
      // Su PROPIO historial (no el del rival), para que la interfaz pueda no
      // ofrecer el movimiento que la regla de las dos casillas va a rechazar.
      history: this.history[player],
    };
  }
}
