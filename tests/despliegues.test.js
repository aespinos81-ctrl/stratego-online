// Tests de las formaciones de despliegue.
// Lo crítico aquí es el RECUENTO: una formación que se deje una pieza o
// duplique otra rompe la partida en cuanto el servidor la valide.

import { test } from "node:test";
import assert from "node:assert/strict";

import { PIECES, PIECE_NAMES, TOTAL_PIECES } from "../shared/pieces.js";
import { ESTRATEGIAS, generarDespliegue, estrategiaAleatoria } from "../shared/despliegues.js";
import { validateSetup } from "../shared/rules.js";

const IDS = Object.keys(ESTRATEGIAS);

// Convierte la rejilla 4×10 al formato que espera el servidor
const aPlacement = g => {
  const lista = [];
  for (let f = 0; f < 4; f++)
    for (let c = 0; c < 10; c++)
      if (g[f][c]) lista.push({ name: g[f][c], row: f, col: c });
  return lista;
};

test("todas las formaciones colocan las 40 piezas exactas", () => {
  for (const id of IDS) {
    for (let intento = 0; intento < 60; intento++) {
      const g = generarDespliegue(id);
      const cuenta = {};
      let total = 0;
      for (let f = 0; f < 4; f++)
        for (let c = 0; c < 10; c++) {
          const n = g[f][c];
          assert.ok(n, `${id}: casilla vacía en fila ${f}, columna ${c}`);
          cuenta[n] = (cuenta[n] || 0) + 1;
          total++;
        }
      assert.equal(total, TOTAL_PIECES, `${id}: no son ${TOTAL_PIECES} piezas`);
      for (const n of PIECE_NAMES) {
        assert.equal(cuenta[n], PIECES[n].count, `${id}: ${n} sale ${cuenta[n]} veces`);
      }
    }
  }
});

test("el servidor da por bueno lo que generan", () => {
  for (const id of IDS) {
    const res = validateSetup(aPlacement(generarDespliegue(id)));
    assert.equal(res.ok, true, `${id}: ${res.reason}`);
  }
});

test("las formaciones con criterio esconden la bandera al fondo", () => {
  for (const id of IDS.filter(x => x !== "azar")) {
    for (let intento = 0; intento < 40; intento++) {
      const g = generarDespliegue(id);
      let filaBandera = -1;
      for (let f = 0; f < 4; f++)
        for (let c = 0; c < 10; c++) if (g[f][c] === "Flag") filaBandera = f;
      assert.equal(filaBandera, 3, `${id}: la bandera acabó en la fila ${filaBandera}`);
    }
  }
});

test("la bandera nunca queda a la intemperie", () => {
  // Al menos una bomba pegada a ella. Sin eso, un explorador la captura de paso.
  for (const id of IDS.filter(x => x !== "azar")) {
    for (let intento = 0; intento < 40; intento++) {
      const g = generarDespliegue(id);
      let fb = -1, cb = -1;
      for (let f = 0; f < 4; f++)
        for (let c = 0; c < 10; c++) if (g[f][c] === "Flag") { fb = f; cb = c; }
      const vecinas = [[fb-1,cb],[fb+1,cb],[fb,cb-1],[fb,cb+1]]
        .filter(([f,c]) => f >= 0 && f < 4 && c >= 0 && c < 10)
        .map(([f,c]) => g[f][c]);
      assert.ok(vecinas.includes("Bomb"), `${id}: bandera sin ninguna bomba al lado`);
    }
  }
});

test("no se malgastan piezas valiosas en la primera línea", () => {
  // La fila 0 es la que sondean los exploradores enemigos en el turno uno.
  for (const id of IDS.filter(x => x !== "azar")) {
    for (let intento = 0; intento < 40; intento++) {
      const primeraFila = generarDespliegue(id)[0];
      assert.ok(!primeraFila.includes("Marshal"), `${id}: Marshal en vanguardia`);
      assert.ok(!primeraFila.includes("Flag"),    `${id}: bandera en vanguardia`);
      assert.ok(!primeraFila.includes("Spy"),     `${id}: espía en vanguardia`);
    }
  }
});

test("estrategiaAleatoria nunca devuelve la de sin criterio", () => {
  for (let i = 0; i < 50; i++) {
    const id = estrategiaAleatoria();
    assert.ok(ESTRATEGIAS[id], `id desconocido: ${id}`);
    assert.notEqual(id, "azar");
  }
});
