// Tests de la IA. No comprueban "que juegue bien" —eso no es medible— sino que
// cada dial del nivel CAMBIA su conducta de una forma concreta y verificable.

import { test } from "node:test";
import assert from "node:assert/strict";

import { NIVELES_IA, elegirJugadaIA } from "../shared/ia.js";
import { LAGOS_CLASICOS } from "../shared/pieces.js";

const tablero = () => Array.from({ length: 10 }, () => Array(10).fill(null));
const ia    = (name, extra = {}) => ({ name, player: "ai", revealed: false, ...extra });
const mia   = (name, extra = {}) => ({ name, player: "human", revealed: false, ...extra });

// Niveles a medida, para aislar un dial cada vez. `amplitud: 1` hace que la
// elección sea determinista: siempre su mejor jugada.
const nivel = dials => ({
  amplitud: 1, prudencia: false, seguridad: false, deduccion: false, ...dials,
});

const jugar = (board, dials, extra = {}) =>
  elegirJugadaIA(board, { lagos: LAGOS_CLASICOS, nivel: nivel(dials), ...extra });

// ── Sin jugadas ──────────────────────────────────────────────────────────────
test("sin ninguna jugada posible devuelve null", () => {
  const b = tablero();
  b[0][0] = ia("Bomb");     // no se mueve
  b[0][1] = ia("Flag");     // tampoco
  assert.equal(jugar(b, {}), null);
});

// ── La bandera se captura siempre ────────────────────────────────────────────
test("si puede capturar la bandera, la captura en cualquier nivel", () => {
  for (const id of Object.keys(NIVELES_IA)) {
    const b = tablero();
    b[5][5] = ia("Scout");
    b[6][5] = mia("Flag");
    b[5][0] = ia("Marshal");
    b[6][0] = mia("Sergeant", { revealed: true });   // una captura fácil, de distracción
    const j = elegirJugadaIA(b, { lagos: LAGOS_CLASICOS, nivel: { ...NIVELES_IA[id], amplitud: 1 } });
    assert.deepEqual([j.tr, j.tc], [6, 5], `${id} no fue a por la bandera`);
  }
});

// ── Dial · PRUDENCIA ─────────────────────────────────────────────────────────
test("con prudencia sondea con el explorador y no con el Marshal", () => {
  const b = tablero();
  b[5][0] = ia("Marshal");
  b[6][0] = mia("Captain");     // desconocida
  b[5][9] = ia("Scout");
  b[6][9] = mia("Captain");     // desconocida

  const j = jugar(b, { prudencia: true });
  assert.deepEqual([j.fr, j.fc], [5, 9], "debería atacar con el explorador");
});

test("sin prudencia le da igual con qué pieza ataca", () => {
  const b = tablero();
  b[5][0] = ia("Marshal");
  b[6][0] = mia("Captain");
  b[5][9] = ia("Scout");
  b[6][9] = mia("Captain");

  // Con las dos jugadas empatadas, elige entre ambas: a lo largo de muchas
  // tiradas tiene que sacar el Marshal alguna vez.
  let conMarshal = 0;
  for (let i = 0; i < 300; i++) {
    const j = jugar(b, { prudencia: false, amplitud: 2 });
    if (j.fr === 5 && j.fc === 0) conMarshal++;
  }
  assert.ok(conMarshal > 30, `solo sacó el Marshal ${conMarshal} veces de 300`);
});

// ── Dial · SEGURIDAD ─────────────────────────────────────────────────────────
test("con seguridad no se pone a tiro de una pieza conocida más fuerte", () => {
  const b = tablero();
  b[4][0] = ia("Sergeant");
  b[6][0] = mia("Marshal", { revealed: true });   // alcanza (5,0)

  const j = jugar(b, { seguridad: true });
  assert.notDeepEqual([j.tr, j.tc], [5, 0], "se metió en la boca del Marshal");
});

test("sin seguridad avanza igual y se deja capturar", () => {
  const b = tablero();
  b[4][0] = ia("Sergeant");
  b[6][0] = mia("Marshal", { revealed: true });

  const j = jugar(b, { seguridad: false });
  assert.deepEqual([j.tr, j.tc], [5, 0], "sin el dial debería avanzar sin mirar");
});

test("una bomba revelada no cuenta como amenaza: no se mueve", () => {
  const b = tablero();
  b[4][0] = ia("Sergeant");
  b[6][0] = mia("Bomb", { revealed: true });
  // La bomba no puede atacar, así que avanzar a (5,0) es perfectamente seguro
  const j = jugar(b, { seguridad: true });
  assert.deepEqual([j.tr, j.tc], [5, 0]);
});

// ── Dial · DEDUCCIÓN ─────────────────────────────────────────────────────────
test("con deducción el minero va a por las piezas que nunca se han movido", () => {
  const b = tablero();
  b[5][0] = ia("Miner");
  b[6][0] = mia("Bomb", { hasMoved: true });     // se ha movido: no puede ser bomba
  b[5][9] = ia("Miner");
  b[6][9] = mia("Bomb");                          // quieta: candidata a bomba

  const j = jugar(b, { prudencia: true, deduccion: true });
  assert.deepEqual([j.fr, j.fc], [5, 9], "debería ir a por la que no se ha movido");
});

test("con deducción se lanza sobre un explorador confirmado", () => {
  const b = tablero();
  b[5][0] = ia("Captain");
  b[6][0] = mia("Scout", { hasMoved: true, maxSalto: 4 });   // delatado
  b[5][5] = ia("Captain");
  b[6][5] = mia("Colonel", { hasMoved: true, maxSalto: 1 }); // podría ser cualquier cosa

  const j = jugar(b, { prudencia: true, deduccion: true });
  assert.deepEqual([j.tr, j.tc], [6, 0], "el explorador delatado es la presa obvia");
});

test("sin bombas vivas pierde el miedo a las piezas quietas", () => {
  const b = tablero();
  b[5][0] = ia("Marshal");
  b[6][0] = mia("Colonel");        // quieta y desconocida

  const dials = { prudencia: true, deduccion: true };
  const conBombas = jugar(b, dials, { bajasDelRival: [] });
  const sinBombas = jugar(b, dials, { bajasDelRival: ["Bomb","Bomb","Bomb","Bomb","Bomb","Bomb"] });

  // Con bombas en juego prefiere no tocarla; agotadas, ataca.
  assert.notDeepEqual([conBombas.tr, conBombas.tc], [6, 0]);
  assert.deepEqual([sinBombas.tr, sinBombas.tc], [6, 0]);
});

// ── Dial · AMPLITUD ──────────────────────────────────────────────────────────
test("la amplitud decide cuánto varía de una partida a otra", () => {
  const b = tablero();
  for (let c = 0; c < 8; c++) b[6][c] = ia("Sergeant");   // muchas jugadas equivalentes

  const clave = j => `${j.fr},${j.fc}->${j.tr},${j.tc}`;
  const conUna  = new Set(), conDoce = new Set();
  for (let i = 0; i < 60; i++) {
    conUna.add(clave(jugar(b, { amplitud: 1 })));
    conDoce.add(clave(jugar(b, { amplitud: 12 })));
  }
  assert.equal(conUna.size, 1, "con amplitud 1 debería ser siempre la misma jugada");
  assert.ok(conDoce.size > 3, `con amplitud 12 solo varió entre ${conDoce.size}`);
});

// ── Los cuatro niveles existen y están ordenados ─────────────────────────────
test("los niveles van de más torpe a más fino", () => {
  const orden = ["recluta", "oficial", "veterano", "estratega"];
  assert.deepEqual(Object.keys(NIVELES_IA), orden);

  const amplitudes = orden.map(id => NIVELES_IA[id].amplitud);
  for (let i = 1; i < amplitudes.length; i++) {
    assert.ok(amplitudes[i] <= amplitudes[i-1], "la amplitud debe ir estrechándose");
  }
  assert.equal(NIVELES_IA.recluta.formacion, "azar");
  assert.equal(NIVELES_IA.estratega.deduccion, true);
});
