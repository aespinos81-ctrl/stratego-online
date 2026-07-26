// ─────────────────────────────────────────────────────────────────────────────
// ZONAS DE AGUA
// ─────────────────────────────────────────────────────────────────────────────
// Los lagos son las casillas intransitables del centro del tablero. En el
// Stratego clásico son ocho, en dos bloques de 2×2, pero cambiarlos altera por
// completo el ritmo de la partida: menos agua significa más pasillos abiertos y
// choques más tempranos.
//
// REGLA DE ORO: cualquier disposición tiene que ser simétrica al girar el
// tablero 180°, o uno de los dos jugadores saldría beneficiado. La rotación
// lleva la casilla (fila, columna) a (9 - fila, 9 - columna).

export const CONFIGURACIONES_AGUA = {
  clasica: {
    label: "Clásica",
    detalle: "Dos lagos de 2×2, como el juego original",
    casillas: [[4,2],[5,2],[4,3],[5,3],[4,6],[5,6],[4,7],[5,7]],
  },
  reducida: {
    label: "Reducida",
    detalle: "Solo cuatro casillas: el centro queda mucho más abierto",
    casillas: [[4,2],[5,2],[4,7],[5,7]],
  },
  aleatoria: {
    label: "Aleatoria",
    detalle: "Se sortea al empezar; púlsalo otra vez para volver a sortear",
    aleatoria: true,
  },
  ninguna: {
    label: "Sin agua",
    detalle: "Tablero despejado: nada frena el avance",
    casillas: [],
  },
};

const clave = ([r, c]) => `${r},${c}`;

// Sortea una disposición simétrica. Elige unas cuantas casillas de la fila 4 y
// añade su reflejo en la fila 5, que es lo que garantiza la simetría.
function sortear() {
  for (let intento = 0; intento < 50; intento++) {
    const pares = 2 + Math.floor(Math.random() * 4);          // entre 2 y 5
    const columnas = [...Array(10).keys()]
      .sort(() => Math.random() - 0.5)
      .slice(0, pares);

    const set = new Set();
    for (const c of columnas) {
      set.add(clave([4, c]));
      set.add(clave([5, 9 - c]));      // el reflejo al girar el tablero
    }

    // Tienen que quedar al menos tres columnas del todo libres, o el centro se
    // vuelve un embudo y la partida se atasca.
    let libres = 0;
    for (let c = 0; c < 10; c++) {
      if (!set.has(clave([4, c])) && !set.has(clave([5, c]))) libres++;
    }
    if (libres >= 3) return set;
  }
  // Si el sorteo se atasca (no debería), volvemos al clásico
  return new Set(CONFIGURACIONES_AGUA.clasica.casillas.map(clave));
}

// Devuelve el conjunto de casillas de agua de una configuración
export function crearLagos(id) {
  const cfg = CONFIGURACIONES_AGUA[id] ?? CONFIGURACIONES_AGUA.clasica;
  return cfg.aleatoria ? sortear() : new Set(cfg.casillas.map(clave));
}

export const esLago = (lagos, r, c) => lagos.has(`${r},${c}`);
