// ─────────────────────────────────────────────────────────────────────────────
// FORMACIONES DE DESPLIEGUE
// ─────────────────────────────────────────────────────────────────────────────
// Barajar las 40 piezas y soltarlas de cualquier manera es lo peor que se puede
// hacer en Stratego: la bandera acaba en primera línea, las bombas repartidas
// sin criterio y el Marshal arrinconado donde no sirve.
//
// Aquí están las ideas que de verdad se usan al desplegar:
//
//   · La bandera va al FONDO, y protegida. En una esquina es más fácil de
//     sellar (solo tiene dos vecinos), pero también es el primer sitio donde
//     mira el rival.
//   · No todas las bombas alrededor de la bandera: eso la delata. Unas cuantas
//     sirven mejor cortando carriles o haciendo de señuelo.
//   · Los exploradores, delante: son los que salen a sondear el primer turno.
//   · Los mineros, atrás y repartidos: los vas a necesitar tarde, para abrir
//     bombas, y perderlos pronto es perder la partida.
//   · Marshal y General en flancos DISTINTOS: juntos dejan medio tablero sin
//     cubrir.
//   · Nada valioso en la primera fila, que es donde los exploradores enemigos
//     llegan el primer turno.
//
// Cada formación devuelve una rejilla de 4 filas × 10 columnas, donde la fila 0
// es la VANGUARDIA (la más cercana al centro) y la 3 la RETAGUARDIA. Es la misma
// convención que usa setupRowsFor en pieces.js, así que vale igual para los dos
// jugadores.

import { PIECES, PIECE_NAMES } from "./pieces.js";

const FILAS = 4;
const COLS = 10;

// ── Utilidades ───────────────────────────────────────────────────────────────
const crearRejilla = () => Array.from({ length: FILAS }, () => Array(COLS).fill(null));

function crearBolsa() {
  const bolsa = {};
  for (const n of PIECE_NAMES) bolsa[n] = PIECES[n].count;
  return bolsa;
}

function barajar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const alAzar = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

function huecosDe(g, fila) {
  const libres = [];
  for (let c = 0; c < COLS; c++) if (!g[fila][c]) libres.push(c);
  return libres;
}

// Pone una pieza si la casilla está libre y queda alguna en la bolsa
function poner(g, bolsa, fila, col, name) {
  if (fila < 0 || fila >= FILAS || col < 0 || col >= COLS) return false;
  if (g[fila][col] || !bolsa[name]) return false;
  g[fila][col] = name;
  bolsa[name]--;
  return true;
}

// Reparte varias piezas del mismo tipo por una fila, al azar
function ponerEnFila(g, bolsa, fila, name, cuantas, columnas) {
  const candidatas = barajar((columnas ?? huecosDe(g, fila)).filter(c => !g[fila][c]));
  let puestas = 0;
  for (const c of candidatas) {
    if (puestas >= cuantas) break;
    if (poner(g, bolsa, fila, c, name)) puestas++;
  }
  return puestas;
}

// ── Relleno con criterio ─────────────────────────────────────────────────────
// Lo que la formación no ha colocado a mano se reparte según dónde le conviene
// estar a cada pieza. No es un adorno: es lo que evita el minero en primera
// línea o el coronel malgastado en la retaguardia.
const FILA_IDEAL = {
  Scout: 0,       // salen a sondear el primer turno
  Sergeant: 0,    // carne de sondeo: mejor ellos que un coronel
  Lieutenant: 1,
  Captain: 1,
  Major: 2,
  Colonel: 2,
  General: 2,
  Marshal: 2,     // ni delante, donde lo sondean, ni tan atrás que no llegue
  Bomb: 2,
  Miner: 3,       // se necesitan tarde: hay que conservarlos
  Spy: 3,         // escondido; solo sale a por el Marshal
  Flag: 3,
};

// Las que más sufren si caen en la fila equivocada, primero
const ORDEN_DE_COLOCACION = [
  "Spy", "Miner", "Marshal", "General", "Colonel",
  "Major", "Bomb", "Captain", "Lieutenant", "Scout", "Sergeant", "Flag",
];

function rellenar(g, bolsa) {
  const pendientes = [];
  for (const n of PIECE_NAMES) for (let i = 0; i < bolsa[n]; i++) pendientes.push(n);
  pendientes.sort((a, b) => ORDEN_DE_COLOCACION.indexOf(a) - ORDEN_DE_COLOCACION.indexOf(b));

  for (const name of pendientes) {
    const ideal = FILA_IDEAL[name];
    // su fila preferida y, si está llena, las de al lado
    const porCercania = [0, 1, 2, 3]
      .map(f => [f, Math.abs(f - ideal)])
      .sort((a, b) => a[1] - b[1])
      .map(([f]) => f);

    for (const fila of porCercania) {
      const libres = barajar(huecosDe(g, fila));
      if (libres.length && poner(g, bolsa, fila, libres[0], name)) break;
    }
  }
}

// ── Las formaciones ──────────────────────────────────────────────────────────

// Bandera en una esquina, sellada con bombas. Difícil de alcanzar, pero si el
// rival adivina la esquina sabe exactamente dónde cavar.
function fortaleza() {
  const g = crearRejilla(), bolsa = crearBolsa();
  const izquierda = Math.random() < 0.5;
  const esquina = izquierda ? 0 : 9;
  const contigua = izquierda ? 1 : 8;
  const flancoOpuesto = izquierda ? 8 : 1;

  poner(g, bolsa, 3, esquina, "Flag");
  // en una esquina la bandera solo tiene dos vecinos: con dos bombas queda sellada
  poner(g, bolsa, 2, esquina, "Bomb");
  poner(g, bolsa, 3, contigua, "Bomb");
  poner(g, bolsa, 2, contigua, "Bomb");   // una tercera, para dar fondo

  // el Marshal cubre el flanco CONTRARIO: con todo en una esquina, el otro lado
  // queda regalado
  poner(g, bolsa, 2, flancoOpuesto, "Marshal");
  poner(g, bolsa, 2, izquierda ? 6 : 3, "General");
  poner(g, bolsa, 3, izquierda ? 7 : 2, "Spy");

  ponerEnFila(g, bolsa, 0, "Scout", 5);
  ponerEnFila(g, bolsa, 3, "Miner", 2);
  rellenar(g, bolsa);
  return g;
}

// Bandera al fondo pero sin arrinconar, bombas repartidas y fuerza en los dos
// flancos. Sin puntos débiles claros y sin apuestas.
function equilibrada() {
  const g = crearRejilla(), bolsa = crearBolsa();
  const colBandera = alAzar(2, 7);   // nunca en esquina: ahí la buscan primero

  poner(g, bolsa, 3, colBandera, "Flag");
  poner(g, bolsa, 2, colBandera, "Bomb");
  poner(g, bolsa, 3, colBandera - 1, "Bomb");
  poner(g, bolsa, 3, colBandera + 1, "Bomb");
  // dos bombas en las esquinas del fondo: cuestan poco y hacen perder tiempo
  poner(g, bolsa, 3, 0, "Bomb");
  poner(g, bolsa, 3, 9, "Bomb");

  poner(g, bolsa, 1, alAzar(1, 3), "Marshal");
  poner(g, bolsa, 1, alAzar(6, 8), "General");
  poner(g, bolsa, 3, colBandera > 4 ? 1 : 8, "Spy");

  ponerEnFila(g, bolsa, 0, "Scout", 4);
  ponerEnFila(g, bolsa, 3, "Miner", 2);
  rellenar(g, bolsa);
  return g;
}

// Fuerza arriba y mineros pronto para abrir paso. Se busca romper el frente
// antes de que el rival se organice, a cambio de dejar la bandera más floja.
function ofensiva() {
  const g = crearRejilla(), bolsa = crearBolsa();
  const esquina = Math.random() < 0.5 ? 0 : 9;

  poner(g, bolsa, 3, esquina, "Flag");
  poner(g, bolsa, 3, esquina === 0 ? 1 : 8, "Bomb");
  poner(g, bolsa, 2, esquina, "Bomb");
  // las demás bombas cortan el centro, para poder atacar sin cubrirse tanto
  ponerEnFila(g, bolsa, 1, "Bomb", 3, [2, 3, 4, 5, 6, 7]);

  // segunda línea, no primera: en la primera los sondean el turno uno
  poner(g, bolsa, 1, alAzar(2, 4), "Marshal");
  poner(g, bolsa, 1, alAzar(5, 7), "General");
  poner(g, bolsa, 2, esquina === 0 ? 7 : 2, "Spy");

  ponerEnFila(g, bolsa, 0, "Scout", 6);
  ponerEnFila(g, bolsa, 1, "Miner", 2);   // adelantados, para abrir bombas pronto
  rellenar(g, bolsa);
  return g;
}

// Una fortaleza falsa en una esquina —bombas, pero sin bandera— y la bandera de
// verdad en la punta contraria con una sola bomba. Se gana el tiempo que el
// rival gasta cavando donde no hay nada.
function senuelo() {
  const g = crearRejilla(), bolsa = crearBolsa();
  const falsa = Math.random() < 0.5 ? 0 : 9;
  const real = falsa === 0 ? 9 : 0;

  // el cebo: tres bombas apiladas donde no hay nada que proteger
  poner(g, bolsa, 3, falsa, "Bomb");
  poner(g, bolsa, 2, falsa, "Bomb");
  poner(g, bolsa, 3, falsa === 0 ? 1 : 8, "Bomb");

  // la bandera de verdad, discreta
  poner(g, bolsa, 3, real, "Flag");
  poner(g, bolsa, 3, real === 0 ? 1 : 8, "Bomb");

  poner(g, bolsa, 2, alAzar(4, 5), "Marshal");
  poner(g, bolsa, 2, falsa === 0 ? 7 : 2, "General");
  poner(g, bolsa, 3, alAzar(4, 6), "Spy");

  ponerEnFila(g, bolsa, 0, "Scout", 5);
  ponerEnFila(g, bolsa, 3, "Miner", 2);
  rellenar(g, bolsa);
  return g;
}

// Sin ningún criterio, como estaba antes. Se deja para poder comparar.
function alBuenTuntun() {
  const g = crearRejilla(), bolsa = crearBolsa();
  rellenarSinCriterio(g, bolsa);
  return g;
}

function rellenarSinCriterio(g, bolsa) {
  const todas = [];
  for (const n of PIECE_NAMES) for (let i = 0; i < bolsa[n]; i++) todas.push(n);
  const mezcladas = barajar(todas);
  let i = 0;
  for (let f = 0; f < FILAS; f++)
    for (let c = 0; c < COLS; c++)
      if (!g[f][c]) { g[f][c] = mezcladas[i]; bolsa[mezcladas[i]]--; i++; }
}

export const ESTRATEGIAS = {
  equilibrada: {
    label: "Equilibrado",
    detalle: "Bandera al fondo sin arrinconar, bombas repartidas y fuerza en los dos flancos. Sin puntos débiles claros.",
    generar: equilibrada,
  },
  fortaleza: {
    label: "Fortaleza",
    detalle: "Bandera en una esquina sellada con bombas. Muy difícil de alcanzar, pero si adivinan la esquina saben dónde cavar.",
    generar: fortaleza,
  },
  ofensiva: {
    label: "Ofensivo",
    detalle: "Fuerza en segunda línea y mineros adelantados para romper pronto. La bandera queda más floja.",
    generar: ofensiva,
  },
  senuelo: {
    label: "Señuelo",
    detalle: "Fortaleza falsa en una esquina y bandera de verdad en la contraria. Gana el tiempo que el rival pierde cavando.",
    generar: senuelo,
  },
  azar: {
    label: "Al azar",
    detalle: "Sin ningún criterio, como repartir las fichas a voleo. Sirve para comparar.",
    generar: alBuenTuntun,
  },
};

export const ESTRATEGIA_POR_DEFECTO = "equilibrada";

// Devuelve la rejilla 4×10 de una formación (fila 0 = vanguardia)
export function generarDespliegue(id = ESTRATEGIA_POR_DEFECTO) {
  const estrategia = ESTRATEGIAS[id] ?? ESTRATEGIAS[ESTRATEGIA_POR_DEFECTO];
  return estrategia.generar();
}

// Una formación al azar de entre las que tienen criterio (la IA no juega "al azar")
export function estrategiaAleatoria() {
  const conCriterio = Object.keys(ESTRATEGIAS).filter(id => id !== "azar");
  return conCriterio[Math.floor(Math.random() * conCriterio.length)];
}
