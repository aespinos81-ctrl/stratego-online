// ─────────────────────────────────────────────────────────────────────────────
// DEFINICIÓN DE PIEZAS  ·  compartido entre cliente y servidor
// ─────────────────────────────────────────────────────────────────────────────
// Este archivo es la "fuente de la verdad" de las piezas. Tanto el navegador
// (para dibujar) como el servidor (para validar) importan de aquí. Así nunca
// hay dos versiones distintas de las reglas que puedan desincronizarse.

export const PIECES = {
  Marshal:    { rank: 10, count: 1, label: "Marshal"    },
  General:    { rank: 9,  count: 1, label: "General"    },
  Colonel:    { rank: 8,  count: 2, label: "Coronel"    },
  Major:      { rank: 7,  count: 3, label: "Mayor"      },
  Captain:    { rank: 6,  count: 4, label: "Capitán"    },
  Lieutenant: { rank: 5,  count: 4, label: "Teniente"   },
  Sergeant:   { rank: 4,  count: 4, label: "Sargento"   },
  Miner:      { rank: 3,  count: 5, label: "Minero"     },
  Scout:      { rank: 2,  count: 8, label: "Explorador" },
  Spy:        { rank: 1,  count: 1, label: "Espía"      },
  Bomb:       { rank: 11, count: 6, label: "Bomba"      },
  Flag:       { rank: 0,  count: 1, label: "Bandera"    },
};

export const PIECE_NAMES = Object.keys(PIECES);

// Lagos: casillas intransitables en el centro del tablero 10x10
export const LAKES = [
  [4, 2], [5, 2], [4, 3], [5, 3],
  [4, 6], [5, 6], [4, 7], [5, 7],
];

export const isLake = (r, c) => LAKES.some(([lr, lc]) => lr === r && lc === c);

// El total de piezas de un ejército (debe ser 40)
export const TOTAL_PIECES = PIECE_NAMES.reduce((sum, n) => sum + PIECES[n].count, 0);

// Medidas del tablero y de la zona de despliegue
export const BOARD_SIZE = 10;
export const SETUP_ROWS = 4;   // cada jugador despliega en 4 filas × 10 columnas = 40 casillas

// ── Del despliegue del cliente a las filas reales del tablero ────────────────
// El cliente coloca sus piezas en coordenadas "locales": fila 0 = su VANGUARDIA
// (la fila más cercana al centro del tablero), fila 3 = su RETAGUARDIA (el fondo,
// donde normalmente esconde la bandera).
//
// p1 ocupa las filas 6-9 del tablero, así que su vanguardia es la 6 → [6,7,8,9].
// p2 ocupa las filas 0-3, y su vanguardia es la 3 → [3,2,1,0] (invertido).
//
// Ojo: si esto no se invierte para p2, su formación se despliega del revés y la
// bandera que quería esconder al fondo acaba en primera línea.
export function setupRowsFor(player) {
  return player === "p1" ? [6, 7, 8, 9] : [3, 2, 1, 0];
}
