// Tests de la partida completa (la clase Game del servidor).

import { test } from "node:test";
import assert from "node:assert/strict";

import { Game } from "../server/game.js";
import { PIECES, PIECE_NAMES, isLake } from "../shared/pieces.js";

// Despliegue válido y realista: primero las piezas que se mueven (así la
// vanguardia, fila local 0, siempre puede avanzar), luego las bombas, y la
// bandera la última → acaba en la retaguardia (fila local 3).
function despliegueValido() {
  const piezas = [];
  for (const name of PIECE_NAMES)
    for (let i = 0; i < PIECES[name].count; i++) piezas.push(name);

  const ordenadas = [
    ...piezas.filter(n => n !== "Bomb" && n !== "Flag"),
    ...piezas.filter(n => n === "Bomb"),
    "Flag",
  ];
  return ordenadas.map((name, i) => ({ name, row: Math.floor(i / 10), col: i % 10 }));
}

function partidaEnJuego() {
  const g = new Game("TEST");
  g.players = { p1: "s1", p2: "s2" };
  assert.equal(g.setPlacement("p1", despliegueValido()).ok, true);
  assert.equal(g.setPlacement("p2", despliegueValido()).ok, true);
  assert.equal(g.phase, "playing");
  return g;
}

test("un despliegue tramposo no llega a tocar el tablero", () => {
  const g = new Game("TEST");
  const trampa = despliegueValido().map(p => ({ ...p, name: "Marshal" })); // 40 marshals
  const res = g.setPlacement("p1", trampa);
  assert.equal(res.ok, false);
  assert.equal(g.ready.p1, false);
  assert.equal(g.board.flat().filter(Boolean).length, 0); // tablero intacto
});

test("no puedes desplegar dos veces", () => {
  const g = new Game("TEST");
  assert.equal(g.setPlacement("p1", despliegueValido()).ok, true);
  const segundo = g.setPlacement("p1", despliegueValido());
  assert.equal(segundo.ok, false);
});

test("la bandera de cada jugador queda en su retaguardia, no en primera línea", () => {
  const g = partidaEnJuego();
  const banderas = {};
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 10; c++)
      if (g.board[r][c]?.name === "Flag") banderas[g.board[r][c].player] = r;
  assert.equal(banderas.p1, 9); // p1 juega abajo: su fondo es la fila 9
  assert.equal(banderas.p2, 0); // p2 juega arriba: su fondo es la fila 0
});

test("no puedes mover fuera de turno ni piezas del rival", () => {
  const g = partidaEnJuego();
  assert.equal(g.applyMove("p2", 3, 0, 4, 0).ok, false);         // no es su turno
  assert.equal(g.applyMove("p1", 3, 0, 4, 0).ok, false);         // pieza de p2
  assert.equal(g.applyMove("p1", 99, 0, 4, 0).ok, false);        // fuera del tablero
});

test("el servidor corta el vaivén infinito entre dos casillas", () => {
  const g = partidaEnJuego();
  // Buscamos una pieza de p1 en la vanguardia (fila 6) que pueda subir a la 5.
  // Ojo: la fila 5 tiene lagos en las columnas 2, 3, 6 y 7.
  let col = -1;
  for (let c = 0; c < 10; c++) {
    const p = g.board[6][c];
    if (p && !["Bomb", "Flag"].includes(p.name) && !isLake(5, c) && g.board[5][c] === null) { col = c; break; }
  }
  assert.notEqual(col, -1, "debería haber alguna pieza móvil en la vanguardia");

  // p1 hace el vaivén 6↔5 mientras p2 mueve piezas distintas cada vez.
  // La fila 4 también tiene lagos en 2, 3, 6 y 7: p2 avanza por columnas libres.
  const colsP2 = [0, 1, 4, 5];
  let rechazado = null;
  for (let i = 0; i < 4 && rechazado === null; i++) {
    const desde = i % 2 === 0 ? 6 : 5;
    const hacia = i % 2 === 0 ? 5 : 6;
    const res = g.applyMove("p1", desde, col, hacia, col);
    if (!res.ok) { rechazado = i; break; }
    // turno de p2: una pieza diferente cada vez, para no romper nada
    const cP2 = colsP2[i];
    const mov = g.applyMove("p2", 3, cP2, 4, cP2);
    assert.equal(mov.ok, true, `p2 debería poder mover en la columna ${cP2}`);
  }
  assert.equal(rechazado, 3, "el cuarto vaivén seguido debe rechazarse");
});

test("viewFor oculta las piezas del rival pero no las tuyas", () => {
  const g = partidaEnJuego();
  const vista = g.viewFor("p1");
  const mias = vista.board[9].filter(Boolean);
  const suyas = vista.board[0].filter(Boolean);
  assert.ok(mias.every(p => p.name && p.player === "p1"), "debes ver tus piezas");
  assert.ok(suyas.every(p => p.hidden === true && !p.name), "no debes ver las del rival");
  // Y desde luego el nombre no puede viajar escondido en el JSON
  assert.ok(!JSON.stringify(vista.board[0]).includes("Flag"));
});

test("una pieza revelada en combate sí se ve", () => {
  const g = partidaEnJuego();
  // Forzamos un combate en el centro: colocamos dos piezas conocidas
  g.board[4][0] = { name: "Marshal", player: "p1", revealed: false };
  g.board[5][0] = { name: "Scout", player: "p2", revealed: false };
  g.turn = "p1";
  const res = g.applyMove("p1", 4, 0, 5, 0);
  assert.equal(res.ok, true);
  assert.equal(res.battle.result, "attacker");
  // El Marshal ganó, ocupa la casilla y ahora es visible para p2
  const vistaP2 = g.viewFor("p2");
  assert.equal(vistaP2.board[5][0].name, "Marshal");
});
