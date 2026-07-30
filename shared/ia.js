// ─────────────────────────────────────────────────────────────────────────────
// EL OPONENTE
// ─────────────────────────────────────────────────────────────────────────────
// La IA puntúa todas sus jugadas posibles y elige entre las mejores. Su fuerza
// no se ajusta con un único mando de "torpeza" —una máquina que juega bien y de
// pronto hace una tontería se siente tramposa, no fácil—, sino con cuatro
// interruptores que tapan cuatro agujeros distintos:
//
//   1. AMPLITUD    · entre cuántas de sus mejores jugadas elige al azar.
//   2. PRUDENCIA   · si mide con qué pieza sondea. Sin esto tira el Marshal
//                    contra lo primero que ve; un jugador decente sondea con
//                    exploradores y sargentos, que son la calderilla.
//   3. SEGURIDAD   · si comprueba que la casilla de destino no queda a tiro de
//                    una pieza tuya que ya conoce. Sin esto, te regala piezas.
//   4. DEDUCCIÓN   · si usa lo que cualquiera puede deducir mirando el tablero:
//                    que una pieza que se ha movido no es bomba ni bandera, que
//                    una que salta tres casillas es un explorador, y cuántas
//                    bombas te quedan por sacar.
//
// El nivel también decide con qué formación despliega.

import { PIECES } from "./pieces.js";
import { getValidMoves, resolveBattle, ALCANCE_OFICIALES } from "./rules.js";

export const NIVELES_IA = {
  recluta: {
    label: "Recluta",
    detalle: "Avanza sin plan y ataca con lo primero que tiene a mano, Marshal incluido. Despliega sin criterio.",
    amplitud: 12,
    prudencia: false,
    seguridad: false,
    deduccion: false,
    formacion: "azar",
  },
  oficial: {
    label: "Oficial",
    detalle: "Sondea con piezas baratas y guarda las buenas. Despliega con una formación con criterio.",
    amplitud: 6,
    prudencia: true,
    seguridad: false,
    deduccion: false,
    formacion: null,
  },
  veterano: {
    label: "Veterano",
    detalle: "Lo anterior y, además, evita dejar sus piezas a tiro de las tuyas que ya conoce.",
    amplitud: 3,
    prudencia: true,
    seguridad: true,
    deduccion: false,
    formacion: null,
  },
  estratega: {
    label: "Estratega",
    detalle: "Juega siempre su mejor jugada y deduce como tú: qué piezas tuyas se han movido y cuántas bombas te quedan.",
    amplitud: 1,
    prudencia: true,
    seguridad: true,
    deduccion: true,
    formacion: null,
  },
};

export const NIVEL_IA_POR_DEFECTO = "oficial";

const RIVAL = "human";   // a quién se enfrenta la IA en la versión de un jugador
const inmovil = name => name === "Bomb" || name === "Flag";

// ── Dial 2 · ¿cuánto vale lanzarse contra una pieza desconocida? ─────────────
function valorDeSondear(atacante, objetivo, nivel, bombasVivas) {
  if (!nivel.prudencia) return 25;    // como antes: le da igual con qué ataca

  // Sondear cuesta la pieza con la que sondeas. Con un explorador (rango 2) es
  // barato; con el Marshal (rango 10) es tirar la partida.
  let valor = 40 - PIECES[atacante.name].rank * 6;

  if (nivel.deduccion) {
    if (objetivo.maxSalto >= 3) {
      valor += 45;                    // saltó tres casillas: es un explorador, presa fácil
    } else if (!objetivo.hasMoved) {
      // Quieta desde el principio: puede ser bomba o bandera.
      if (bombasVivas === 0) {
        // Sin bombas en juego la cautela no tiene fundamento: una pieza quieta
        // solo puede ser la bandera o tropa que no ha querido moverse. Y el
        // espía únicamente mata al Marshal si es él quien ataca.
        valor += 22;
      } else {
        valor += atacante.name === "Miner" ? 30 : -18;
      }
    }
  }
  return valor;
}

// ── Dial 3 · ¿nos ponemos a tiro al movernos ahí? ────────────────────────────
// Se recorren las piezas del rival YA REVELADAS (las ocultas no se pueden tener
// en cuenta sin hacer trampa) y se mira si alguna alcanza esa casilla y ganaría.
function riesgoDe(board, pieza, destinoR, destinoC, lagos, alcanceOficiales) {
  let peor = 0;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const v = board[r][c];
      if (v?.player !== RIVAL || !v.revealed || inmovil(v.name)) continue;
      const alcanza = getValidMoves(board, r, c, lagos, alcanceOficiales)
        .some(([mr, mc]) => mr === destinoR && mc === destinoC);
      if (!alcanza) continue;
      if (resolveBattle(v.name, pieza.name) === "attacker") {
        // cuanto más valiosa sea la pieza que exponemos, peor
        peor = Math.max(peor, 30 + PIECES[pieza.name].rank * 5);
      }
    }
  }
  return peor;
}

// ── La decisión ──────────────────────────────────────────────────────────────
// bajasDelRival: nombres de las piezas del rival ya caídas, para contar bombas.
export function elegirJugadaIA(board, opciones = {}) {
  const {
    lagos,
    alcanceOficiales = ALCANCE_OFICIALES,
    nivel = NIVELES_IA[NIVEL_IA_POR_DEFECTO],
    bajasDelRival = [],
  } = opciones;

  const bombasVivas = PIECES.Bomb.count - bajasDelRival.filter(n => n === "Bomb").length;
  const jugadas = [];

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const p = board[r][c];
      if (!p || p.player === RIVAL) continue;

      for (const [tr, tc] of getValidMoves(board, r, c, lagos, alcanceOficiales)) {
        const objetivo = board[tr][tc];
        let puntos = (tr - r) * 4;      // premia avanzar hacia el rival

        if (objetivo?.player === RIVAL) {
          if (objetivo.name === "Flag") {
            puntos += 9999;
          } else if (objetivo.revealed) {
            const res = resolveBattle(p.name, objetivo.name);
            puntos += res === "attacker" ? 80 + PIECES[objetivo.name].rank * 8
                    : res === "both"     ? 10
                    :                      -60;
          } else {
            puntos += valorDeSondear(p, objetivo, nivel, bombasVivas);
          }
        }

        if (nivel.seguridad) {
          puntos -= riesgoDe(board, p, tr, tc, lagos, alcanceOficiales);
        }

        jugadas.push({ fr: r, fc: c, tr, tc, puntos });
      }
    }
  }

  if (!jugadas.length) return null;
  jugadas.sort((a, b) => b.puntos - a.puntos);
  const entre = Math.min(nivel.amplitud, jugadas.length);
  return jugadas[Math.floor(Math.random() * entre)];
}
