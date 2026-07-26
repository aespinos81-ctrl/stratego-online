// Tests de las reglas compartidas.  Ejecútalos con:  npm test
// No hacen falta librerías: usan el "test runner" que trae Node de serie.

import { test } from "node:test";
import assert from "node:assert/strict";

import { PIECES, PIECE_NAMES, TOTAL_PIECES, setupRowsFor } from "../shared/pieces.js";
import {
  resolveBattle, getValidMoves, getLegalMoves, isLegalMove,
  violatesTwoSquares, validateSetup, checkWinner, MAX_SHUTTLE_MOVES,
} from "../shared/rules.js";

// Un despliegue válido de las 40 piezas, ordenadas de corrido en 4 filas × 10 col.
function despliegueValido() {
  const piezas = [];
  for (const name of PIECE_NAMES)
    for (let i = 0; i < PIECES[name].count; i++) piezas.push(name);
  return piezas.map((name, i) => ({ name, row: Math.floor(i / 10), col: i % 10 }));
}

const tableroVacio = () => Array.from({ length: 10 }, () => Array(10).fill(null));

// ── COMBATES ─────────────────────────────────────────────────────────────────
test("el espía mata al Marshal si ataca, pero muere si defiende", () => {
  assert.equal(resolveBattle("Spy", "Marshal"), "attacker");
  assert.equal(resolveBattle("Marshal", "Spy"), "attacker");
});

test("solo el minero desactiva bombas", () => {
  assert.equal(resolveBattle("Miner", "Bomb"), "attacker");
  assert.equal(resolveBattle("Marshal", "Bomb"), "defender");
});

test("capturar la bandera siempre gana", () => {
  assert.equal(resolveBattle("Scout", "Flag"), "attacker");
});

// ── VALIDACIÓN DEL DESPLIEGUE ────────────────────────────────────────────────
test("acepta un despliegue correcto de 40 piezas", () => {
  assert.equal(validateSetup(despliegueValido()).ok, true);
});

test("rechaza si faltan o sobran piezas", () => {
  const corto = despliegueValido().slice(0, 39);
  const res = validateSetup(corto);
  assert.equal(res.ok, false);
  assert.match(res.reason, new RegExp(String(TOTAL_PIECES)));
});

test("rechaza un ejército con piezas repetidas de más (tramposo)", () => {
  const trampa = despliegueValido();
  trampa[5] = { ...trampa[5], name: "Marshal" };   // un segundo Marshal
  const res = validateSetup(trampa);
  assert.equal(res.ok, false);
  assert.match(res.reason, /Marshal/);
});

test("rechaza dos piezas en la misma casilla", () => {
  const trampa = despliegueValido();
  trampa[1] = { ...trampa[1], row: trampa[0].row, col: trampa[0].col };
  const res = validateSetup(trampa);
  assert.equal(res.ok, false);
  assert.match(res.reason, /misma casilla/);
});

test("rechaza colocar fuera de tu zona o fuera del tablero", () => {
  const fuera = despliegueValido();
  fuera[0] = { ...fuera[0], row: 5 };
  assert.equal(validateSetup(fuera).ok, false);

  const fuera2 = despliegueValido();
  fuera2[0] = { ...fuera2[0], col: 99 };
  assert.equal(validateSetup(fuera2).ok, false);
});

test("rechaza nombres de pieza inventados", () => {
  const trampa = despliegueValido();
  trampa[0] = { name: "Dragón", row: 0, col: 0 };
  assert.equal(validateSetup(trampa).ok, false);
});

// ── ZONA DE DESPLIEGUE ───────────────────────────────────────────────────────
test("la fila 0 es la vanguardia de los DOS jugadores", () => {
  // p1 juega abajo (filas 6-9): su vanguardia es la 6, su retaguardia la 9
  assert.deepEqual(setupRowsFor("p1"), [6, 7, 8, 9]);
  // p2 juega arriba (filas 0-3): su vanguardia es la 3, su retaguardia la 0
  assert.deepEqual(setupRowsFor("p2"), [3, 2, 1, 0]);
  // Es decir: lo que cada jugador pone en su última fila (row 3) queda en el
  // fondo de su campo, lejos del enemigo. Simétrico para los dos.
  assert.equal(setupRowsFor("p1")[3], 9);
  assert.equal(setupRowsFor("p2")[3], 0);
});

// ── MOVIMIENTOS ──────────────────────────────────────────────────────────────
test("bombas y bandera no se mueven", () => {
  const b = tableroVacio();
  b[7][5] = { name: "Bomb", player: "p1" };
  b[8][5] = { name: "Flag", player: "p1" };
  assert.equal(getValidMoves(b, 7, 5).length, 0);
  assert.equal(getValidMoves(b, 8, 5).length, 0);
});

test("el explorador avanza en línea recta pero no salta piezas", () => {
  const b = tableroVacio();
  b[9][0] = { name: "Scout", player: "p1" };
  b[6][0] = { name: "Miner", player: "p1" };     // pieza propia bloqueando
  const destinos = getValidMoves(b, 9, 0).map(([r, c]) => `${r},${c}`);
  assert.ok(destinos.includes("8,0"));
  assert.ok(destinos.includes("7,0"));
  assert.ok(!destinos.includes("6,0"));           // no puede comerse a los suyos
  assert.ok(!destinos.includes("5,0"));           // ni saltar por encima
});

test("nadie puede meterse en los lagos", () => {
  const b = tableroVacio();
  b[4][1] = { name: "Sergeant", player: "p1" };
  const destinos = getValidMoves(b, 4, 1).map(([r, c]) => `${r},${c}`);
  assert.ok(!destinos.includes("4,2"));           // (4,2) es lago
});

// ── REGLA DE LAS DOS CASILLAS ────────────────────────────────────────────────
test("se permite el vaivén hasta el límite y se prohíbe el siguiente", () => {
  const A = [7, 0], B = [6, 0];
  const history = [];
  // Simulamos vaivenes A→B, B→A, A→B… hasta agotar el máximo permitido
  let desde = A, hacia = B;
  for (let i = 0; i < MAX_SHUTTLE_MOVES; i++) {
    assert.equal(
      violatesTwoSquares(history, desde[0], desde[1], hacia[0], hacia[1]), false,
      `el movimiento nº ${i + 1} debería permitirse`
    );
    history.unshift({ from: desde, to: hacia });
    [desde, hacia] = [hacia, desde];
  }
  // El siguiente ya es uno de más
  assert.equal(violatesTwoSquares(history, desde[0], desde[1], hacia[0], hacia[1]), true);
});

test("mover otra pieza en medio rompe la cadena del vaivén", () => {
  const history = [
    { from: [3, 3], to: [3, 4] },   // ← movimiento de otra pieza, el más reciente
    { from: [6, 0], to: [7, 0] },
    { from: [7, 0], to: [6, 0] },
    { from: [6, 0], to: [7, 0] },
  ];
  assert.equal(violatesTwoSquares(history, 7, 0, 6, 0), false);
});

test("isLegalMove y getLegalMoves aplican la regla de las dos casillas", () => {
  const b = tableroVacio();
  b[7][0] = { name: "Sergeant", player: "p1" };
  const history = [
    { from: [6, 0], to: [7, 0] },
    { from: [7, 0], to: [6, 0] },
    { from: [6, 0], to: [7, 0] },
  ];
  assert.equal(isLegalMove(b, 7, 0, 6, 0, "p1", history), false);
  assert.equal(isLegalMove(b, 7, 0, 7, 1, "p1", history), true); // otra dirección sí
  const legales = getLegalMoves(b, 7, 0, history).map(([r, c]) => `${r},${c}`);
  assert.ok(!legales.includes("6,0"));
  assert.ok(legales.includes("7,1"));
});

test("no puedes mover una pieza que no es tuya", () => {
  const b = tableroVacio();
  b[7][0] = { name: "Sergeant", player: "p2" };
  assert.equal(isLegalMove(b, 7, 0, 6, 0, "p1"), false);
});

// ── VICTORIA ─────────────────────────────────────────────────────────────────
test("gana quien captura la bandera; pierde quien no puede mover", () => {
  const sinBandera = tableroVacio();
  sinBandera[9][0] = { name: "Flag", player: "p1" };
  sinBandera[8][0] = { name: "Scout", player: "p1" };
  sinBandera[0][0] = { name: "Scout", player: "p2" };  // p2 sin bandera
  assert.equal(checkWinner(sinBandera), "p1");

  const inmovil = tableroVacio();
  inmovil[9][0] = { name: "Flag", player: "p1" };
  inmovil[8][0] = { name: "Scout", player: "p1" };
  inmovil[0][0] = { name: "Flag", player: "p2" };
  inmovil[0][1] = { name: "Bomb", player: "p2" };      // p2 solo tiene inmóviles
  assert.equal(checkWinner(inmovil), "p1");
});
