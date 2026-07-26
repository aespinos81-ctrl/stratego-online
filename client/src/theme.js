// ─────────────────────────────────────────────────────────────────────────────
// TEMAS VISUALES
// ─────────────────────────────────────────────────────────────────────────────
// Toda la paleta del juego vive aquí. La interfaz NO tiene ni un color escrito a
// mano: lee siempre de este objeto. Así, añadir un tema nuevo (como los tableros
// de chess.com) es copiar uno de estos bloques y cambiar los valores, sin tocar
// el resto del código.
//
// Para añadir un tema:
//   1) copia el objeto "madera" entero,
//   2) cámbiale la clave, el `label` y los colores,
//   3) ya aparece disponible en THEMES.

// Tipografías. No dependen del tema: la interfaz usa una sans limpia (como
// chess.com) y la serif elegante se reserva para el título.
export const FONTS = {
  ui: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  display: "'Cinzel', serif",
};

export const THEMES = {
  madera: {
    label: "Mesa de madera",

    // ── El "mueble": fondo de la página y marco del tablero ──────────────────
    pageBg: "#6B4326",
    pageGlowA: "rgba(215, 160, 90, 0.25)",   // luz cálida arriba a la izquierda
    pageGlowB: "rgba(60, 30, 10, 0.55)",     // sombra abajo a la derecha
    grain: "rgba(255, 240, 210, 0.035)",     // veta de la madera

    frameBg: "linear-gradient(160deg, #5A3419, #3E2310)",
    frameBorder: "#2B1809",
    frameInner: "rgba(217, 164, 65, 0.35)",

    // ── El tablero: tapete verde con dos tonos alternos ──────────────────────
    squareLight: "#66944F",
    squareDark: "#557E42",
    squareEdge: "rgba(30, 50, 25, 0.25)",
    zoneMine: "rgba(245, 235, 220, 0.10)",   // tu mitad, apenas insinuada
    zoneTheirs: "rgba(140, 47, 57, 0.16)",   // la mitad del rival

    lake: "linear-gradient(160deg, #3D7EA6, #2A5C7D)",
    lakeBorder: "#24506E",
    lakeWave: "rgba(210, 240, 255, 0.5)",

    // ── Las piezas ───────────────────────────────────────────────────────────
    // Tuyas: fichas de hueso, como las blancas del ajedrez.
    mine: {
      bg: "linear-gradient(160deg, #F7EEDD, #E4D3B8)",
      border: "#B99B72",
      ink: "#3B2A18",
      inkSoft: "rgba(59, 42, 24, 0.65)",
      shadow: "0 2px 4px rgba(0,0,0,0.35)",
    },
    // Del rival, ya reveladas: fichas burdeos con tinta clara.
    theirs: {
      bg: "linear-gradient(160deg, #A33B44, #7A2630)",
      border: "#5E1C24",
      ink: "#FBEFE2",
      inkSoft: "rgba(251, 239, 226, 0.7)",
      shadow: "0 2px 4px rgba(0,0,0,0.4)",
    },
    // Del rival, ocultas: el "dorso" de la ficha, sin información.
    hidden: {
      bg: "linear-gradient(160deg, #8C2F39, #641F27)",
      border: "#4E1720",
      emblem: "rgba(217, 164, 65, 0.55)",
      pattern: "rgba(255, 220, 160, 0.07)",
    },

    // ── Latón: acentos, títulos y bordes nobles ──────────────────────────────
    brass: "#D9A441",
    brassBright: "#F2C14E",
    brassSoft: "rgba(217, 164, 65, 0.25)",
    brassFaint: "rgba(217, 164, 65, 0.12)",

    // ── Paneles laterales ────────────────────────────────────────────────────
    panelBg: "rgba(52, 29, 13, 0.85)",
    panelBorder: "rgba(217, 164, 65, 0.22)",
    text: "#F7EEDD",
    textSoft: "rgba(247, 238, 221, 0.62)",
    textDim: "rgba(247, 238, 221, 0.34)",

    // ── Marcas de juego ──────────────────────────────────────────────────────
    select: "#F2C14E",                       // pieza seleccionada
    moveDot: "rgba(25, 15, 5, 0.42)",        // casilla libre a la que puedes ir
    capture: "#E8543F",                      // casilla que puedes atacar
    dropTarget: "rgba(242, 193, 78, 0.45)",  // casilla bajo la pieza que arrastras
    aiFrom: "#E8543F",                       // de dónde salió la IA
    aiTo: "#F2C14E",                         // a dónde llegó

    youBg: "rgba(90, 130, 70, 0.35)",
    youBorder: "rgba(150, 200, 120, 0.45)",
    youText: "#C8E6A8",
    themBg: "rgba(140, 47, 57, 0.35)",
    themBorder: "rgba(220, 120, 120, 0.45)",
    themText: "#F0AFA8",

    win: "#F2C14E",
    lose: "#E8776A",

    // ── Color por rango ──────────────────────────────────────────────────────
    // Es la barrita de color al pie de cada ficha. Se eligieron tonos que se
    // leen bien tanto sobre el hueso como sobre el burdeos.
    ranks: {
      flag: "#D9A441",   // bandera  · latón
      bomb: "#8C2F39",   // bomba    · burdeos
      spy: "#7A4FA8",    // espía    · violeta
      alto: "#A32B1C",   // 10-9     · rojo profundo
      medio: "#C2680F",  // 8-7      · ámbar tostado
      normal: "#1F7A6B", // 6-5      · verde azulado
      bajo: "#2A6BA8",   // 4-3      · azul
      minimo: "#5B7F2E", // 2        · verde oliva
    },
  },
};

// Tema activo. Cuando montemos el selector, esto pasará a ser un estado de React
// (y se podrá guardar en el navegador para recordar la elección del jugador).
export const DEFAULT_THEME = "madera";
export const theme = THEMES[DEFAULT_THEME];
