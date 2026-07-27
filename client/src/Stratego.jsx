import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { theme as T, FONTS } from "./theme.js";
import { CONFIGURACIONES_AGUA, crearLagos, esLago } from "../../shared/lagos.js";

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
// `display` es lo que se pinta en la ficha: el rango en números romanos.
// `insignia` es el distintivo que lo acompaña, al estilo de las divisas de un
// ejército moderno: estrellas para la oficialidad superior, barras para los
// oficiales y galones para la tropa. Dice lo mismo que el número, pero se
// reconoce de un vistazo sin llegar a leerlo.
const PIECES = {
  Marshal:    { rank: 10, count: 1, display: "X",    label: "Marshal",    insignia: { tipo:"estrella", n:4 } },
  General:    { rank: 9,  count: 1, display: "IX",   label: "General",    insignia: { tipo:"estrella", n:3 } },
  Colonel:    { rank: 8,  count: 2, display: "VIII", label: "Coronel",    insignia: { tipo:"estrella", n:2 } },
  Major:      { rank: 7,  count: 3, display: "VII",  label: "Mayor",      insignia: { tipo:"estrella", n:1 } },
  Captain:    { rank: 6,  count: 4, display: "VI",   label: "Capitán",    insignia: { tipo:"barra",    n:3 } },
  Lieutenant: { rank: 5,  count: 4, display: "V",    label: "Teniente",   insignia: { tipo:"barra",    n:2 } },
  Sergeant:   { rank: 4,  count: 4, display: "IV",   label: "Sargento",   insignia: { tipo:"galon",    n:3 } },
  Miner:      { rank: 3,  count: 5, display: "III",  label: "Minero",     insignia: { tipo:"galon",    n:2 } },
  Scout:      { rank: 2,  count: 8, display: "II",   label: "Explorador", insignia: { tipo:"galon",    n:1 } },
  Spy:        { rank: 1,  count: 1, display: "S",    label: "Espía",      insignia: null },
  Bomb:       { rank: 11, count: 6, display: "✸",    label: "Bomba",      insignia: null },
  Flag:       { rank: 0,  count: 1, display: "⚑",    label: "Bandera",    insignia: null },
};

// Un "VIII" ocupa cuatro veces más que una "X": ajustamos el cuerpo de letra
// según lo largo que sea el número para que todos ocupen lo mismo en la ficha.
const ESCALA_NUMERAL = { 1: 1, 2: 0.82, 3: 0.70, 4: 0.58 };
const escalaNumeral = txt => ESCALA_NUMERAL[txt.length] ?? 0.54;

const PIECE_NAMES = Object.keys(PIECES);
const GAP = 2;
const CELDA_MIN = 46;
const CELDA_MAX = 86;

// Mi zona de despliegue son las cuatro filas de abajo
const enMiZona = (lagos, r, c) => r >= 6 && !esLago(lagos, r, c);

// Nombre de casilla para el registro: columna en letra, fila en número
const coord = (r, c) => `${String.fromCharCode(65 + c)}${r + 1}`;

// Color de la barrita de rango que lleva cada ficha al pie
function rankAccent(name) {
  if (!name) return T.textDim;
  if (name === "Flag") return T.ranks.flag;
  if (name === "Bomb") return T.ranks.bomb;
  if (name === "Spy")  return T.ranks.spy;
  const r = PIECES[name]?.rank ?? 0;
  if (r >= 9) return T.ranks.alto;
  if (r >= 7) return T.ranks.medio;
  if (r >= 5) return T.ranks.normal;
  if (r >= 3) return T.ranks.bajo;
  return T.ranks.minimo;
}

// Las casillas alternan dos verdes, como el tapete de un tablero de verdad
const squareBg = (r, c) => ((r + c) % 2 === 0 ? T.squareLight : T.squareDark);

// ─── LÓGICA DEL JUEGO ─────────────────────────────────────────────────────────
function createPool() {
  const pool = [];
  for (const [name, d] of Object.entries(PIECES))
    for (let i = 0; i < d.count; i++) pool.push(name);
  return pool;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function resolveBattle(attName, defName) {
  if (defName === "Flag") return "attacker";
  if (defName === "Bomb") return attName === "Miner" ? "attacker" : "defender";
  if (attName === "Spy" && PIECES[defName].rank === 10) return "attacker";
  const ar = PIECES[attName].rank, dr = PIECES[defName].rank;
  if (ar > dr) return "attacker";
  if (ar < dr) return "defender";
  return "both";
}

// ─── LOS DOS MODOS DE JUEGO ───────────────────────────────────────────────────
// Aquí está TODA la diferencia entre el Stratego de siempre y el nuestro. Cada
// modo es un puñado de interruptores; el resto del código los consulta y se
// comporta en consecuencia.
const RANGO_OFICIAL = 6;   // Capitán y por encima

export const MODOS = {
  clasico: {
    nombre: "Stratego clásico",
    lema: "Las reglas de toda la vida",
    puntos: [
      "Solo el Explorador recorre varias casillas; el resto avanza de una en una",
      "Los dos lagos de 2×2 del tablero original, siempre en el mismo sitio",
      "Sin ayudas: lo que deduzcas sale de tu memoria, como en la mesa",
    ],
    reglas: { alcanceOficiales: 1, aguaConfigurable: false, ayudas: false },
  },
  moderno: {
    nombre: "Stratego 2.0",
    lema: "Más rápido y más deductivo",
    puntos: [
      "Del Capitán para arriba se mueven hasta dos casillas",
      "Zonas de agua a elegir: clásica, reducida, sorteada o ninguna",
      "El tablero recuerda por ti: rastro de jugadas y marcas de deducción",
    ],
    reglas: { alcanceOficiales: 2, aguaConfigurable: true, ayudas: true },
  },
};

const REGLAS_POR_DEFECTO = MODOS.clasico.reglas;

// ── Cuántas casillas puede recorrer cada pieza de una vez ────────────────────
// El Explorador nunca tiene límite. La oficialidad depende del modo: una casilla
// en el clásico, dos en el 2.0. Ojo al efecto secundario en el 2.0: un salto de
// dos deja de ser la firma inconfundible del Explorador, porque también puede
// ser un oficial. Esa ambigüedad es deliberada.
const alcanceDe = (name, reglas = REGLAS_POR_DEFECTO) =>
  name === "Scout" ? Infinity
  : PIECES[name].rank >= RANGO_OFICIAL ? reglas.alcanceOficiales
  : 1;

function getValidMoves(board, row, col, lagos, reglas = REGLAS_POR_DEFECTO) {
  const piece = board[row][col];
  if (!piece || piece.name === "Bomb" || piece.name === "Flag") return [];
  const alcance = alcanceDe(piece.name, reglas);
  const moves = [];
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    let r = row + dr, c = col + dc, pasos = 1;
    // Avanza en línea recta hasta agotar su alcance. Nadie salta por encima de
    // nada: la primera pieza o lago que encuentre le corta el paso.
    while (pasos <= alcance && r >= 0 && r < 10 && c >= 0 && c < 10 && !esLago(lagos, r, c)) {
      const t = board[r][c];
      if (t) { if (t.player !== piece.player) moves.push([r, c]); break; }
      moves.push([r, c]);
      r += dr; c += dc; pasos++;
    }
  }
  return moves;
}

function aiSetup(lagos) {
  const pool = shuffle(createPool());
  const board = Array.from({length: 10}, () => Array(10).fill(null));
  let idx = 0;
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 10; c++)
      if (!esLago(lagos, r, c) && idx < pool.length)
        board[r][c] = { name: pool[idx++], player: "ai", revealed: false };
  return board;
}

function aiMove(board, lagos, reglas) {
  const moves = [];
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 10; c++) {
      const p = board[r][c];
      if (p?.player !== "ai") continue;
      for (const [tr, tc] of getValidMoves(board, r, c, lagos, reglas)) {
        const t = board[tr][tc];
        let score = (tr - r) * 4;
        if (t?.player === "human") {
          if (t.name === "Flag") { score += 9999; }
          else if (t.revealed) {
            const res = resolveBattle(p.name, t.name);
            score += res === "attacker" ? 80 + PIECES[t.name].rank * 8
                   : res === "both"     ? 10
                   : -60;
          } else { score += 25; }
        }
        moves.push({ fr: r, fc: c, tr, tc, score });
      }
    }
  if (!moves.length) return null;
  moves.sort((a, b) => b.score - a.score);
  return moves.slice(0, Math.min(6, moves.length))[Math.floor(Math.random() * Math.min(6, moves.length))];
}

function checkWinner(board, lagos, reglas) {
  const hFlag = board.flat().some(p => p?.name === "Flag" && p?.player === "human");
  const aFlag = board.flat().some(p => p?.name === "Flag" && p?.player === "ai");
  const hMoves = board.some((row, r) => row.some((_, c) => board[r][c]?.player === "human" && getValidMoves(board, r, c, lagos, reglas).length > 0));
  const aMoves = board.some((row, r) => row.some((_, c) => board[r][c]?.player === "ai"   && getValidMoves(board, r, c, lagos, reglas).length > 0));
  if (!aFlag || !aMoves) return "human";
  if (!hFlag || !hMoves) return "ai";
  return null;
}


// ─── ICONOS DE PIEZA ──────────────────────────────────────────────────────────
// Cada pieza tiene su propio dibujo, para reconocerla sin leer el número. Dos
// familias:
//   · La escala de mando se dibuja con su DIVISA (estrellas, barras, galones).
//     Contar formas es más rápido que leer "VIII", y es como funcionan las
//     divisas de verdad.
//   · Las piezas con oficio propio llevan su HERRAMIENTA: prismáticos el
//     explorador, pico el minero, un ojo el espía, la mina, la bandera.
// Todo va con trazo grueso y pocas formas: tienen que aguantar a 46 píxeles.

const ESTRELLA = "M0,-7.4 L2.1,-2.3 L7.4,-2.3 L3.2,1 L4.6,6.3 L0,3.1 L-4.6,6.3 L-3.2,1 L-7.4,-2.3 L-2.1,-2.3 Z";

const estrellas = posiciones => (
  <>{posiciones.map(([x, y], i) => (
    <path key={i} d={ESTRELLA} transform={`translate(${x},${y})`} fill="currentColor" stroke="none" />
  ))}</>
);

const barras = ys => (
  <>{ys.map((y, i) => (
    <rect key={i} x="7" y={y} width="26" height="5" rx="1.8" fill="currentColor" stroke="none" />
  ))}</>
);

const galones = ys => (
  <>{ys.map((y, i) => (
    <path key={i} d={`M7 ${y} L20 ${y - 9} L33 ${y}`} fill="none"
          stroke="currentColor" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
  ))}</>
);

const DIBUJOS = {
  // ── escala de mando ──
  Marshal:    estrellas([[12,12],[28,12],[12,28],[28,28]]),   // cuatro, en cuadro
  General:    estrellas([[20,11],[12,27],[28,27]]),           // tres, en triángulo
  Colonel:    estrellas([[11,20],[29,20]]),                   // dos
  Major:      estrellas([[20,20]]),                           // una
  Captain:    barras([9, 18, 27]),
  Lieutenant: barras([13.5, 23.5]),
  Sergeant:   galones([16, 25, 34]),

  // ── piezas con oficio ──
  Miner: (   // pico
    <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
      <path d="M11 33 L27 15" />
      <path d="M15 13 C22 8, 31 10, 35 17" strokeWidth="4.4" />
      <path d="M19 9 L24 20" strokeWidth="3.4" />
    </g>
  ),
  Scout: (   // prismáticos
    <g fill="none" stroke="currentColor" strokeWidth="3.8">
      <circle cx="13" cy="26" r="7.5" />
      <circle cx="27" cy="26" r="7.5" />
      <path d="M13 18 V10 h5 M27 18 V10 h-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.5 26 h3" strokeLinecap="round" />
    </g>
  ),
  Spy: (     // ojo
    <g fill="none" stroke="currentColor" strokeWidth="3.6">
      <path d="M5 20 C11 11, 15.5 8, 20 8 C24.5 8, 29 11, 35 20 C29 29, 24.5 32, 20 32 C15.5 32, 11 29, 5 20 Z" />
      <circle cx="20" cy="20" r="4.6" fill="currentColor" stroke="none" />
    </g>
  ),
  Bomb: (    // mina, con sus púas
    <g stroke="currentColor" strokeWidth="3.6" strokeLinecap="round">
      <circle cx="20" cy="22" r="9.5" fill="currentColor" stroke="none" />
      <path d="M20 5 v5 M31.5 10.5 l-3.5 3.5 M8.5 10.5 l3.5 3.5 M3 22 h5 M37 22 h-5" fill="none" />
    </g>
  ),
  Flag: (    // bandera
    <g stroke="currentColor" strokeWidth="4" strokeLinecap="round">
      <path d="M12 35 V6" fill="none" />
      <path d="M12 8 H32 l-4.5 6.5 L32 21 H12 Z" fill="currentColor" stroke="none" />
    </g>
  ),
};

function Icono({ name, size }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} style={{ display:"block", color:"inherit" }}>
      {DIBUJOS[name]}
    </svg>
  );
}

// ─── FICHA ────────────────────────────────────────────────────────────────────
// `owner` es "mine" (hueso) o "theirs" (burdeos). La identidad se lee con la
// cifra grande; la barra de color del pie ayuda a agrupar rangos de un vistazo.
// El distintivo de rango: estrellas, barras o galones, como en una bocamanga
function Insignia({ name, color, scale = 1 }) {
  const spec = PIECES[name].insignia;
  if (!spec) return null;
  const { tipo, n } = spec;
  return (
    <div style={{
      position:"absolute", top:3.5 * scale, left:0, width:"100%",
      display:"flex", gap:2.5 * scale, alignItems:"flex-end", justifyContent:"center",
      height:8 * scale,
    }}>
      {Array.from({ length: n }, (_, i) =>
        tipo === "estrella" ? (
          <span key={i} style={{ fontSize:7.5 * scale, lineHeight:1, color }}>★</span>
        ) : tipo === "barra" ? (
          <span key={i} style={{ width:6.5 * scale, height:2.5 * scale, background:color, borderRadius:1 }}/>
        ) : (
          <span key={i} style={{
            width:0, height:0,
            borderLeft:`${3.5 * scale}px solid transparent`,
            borderRight:`${3.5 * scale}px solid transparent`,
            borderBottom:`${4 * scale}px solid ${color}`,
          }}/>
        )
      )}
    </div>
  );
}

// El canto de la ficha: una pila de sombras sólidas, cada una un píxel más
// abajo, que finge el grosor. Es la forma barata de que una ficha plana parezca
// una ficha de verdad apoyada en el tapete — y funciona igual con el tablero
// inclinado, sin necesidad de capas 3D reales.
function relieveDe(color, alturaPx, elevada) {
  const capas = Array.from({ length: alturaPx }, (_, i) => `0 ${i + 1}px 0 ${color}`);
  const sombra = elevada
    ? `0 ${alturaPx + 7}px 10px rgba(0,0,0,0.55)`
    : `0 ${alturaPx + 2}px 5px rgba(0,0,0,0.45)`;
  return [...capas, sombra].join(", ");
}

function PieceTile({ name, owner = "mine", scale = 1, dim = false, relieve = false, elevada = false, grosor = 0, celda = 0 }) {
  const skin = owner === "mine" ? T.mine : T.theirs;
  const d = PIECES[name];
  return (
    <div title={d.label} style={{
      width: grosor ? "100%" : "90%",
      height: grosor ? "100%" : "90%",
      position:"relative", transformStyle:"preserve-3d",
      transform: !grosor && relieve && elevada ? "translateY(-4px)" : "none",
      transition:"transform 0.14s ease",
      opacity: dim ? 0.35 : 1,
    }}>
    {grosor > 0 && <Cantos skin={skin} grosor={grosor} />}
    <div style={{
      position:"absolute", inset:0, borderRadius:7,
      background:skin.bg, border:`1px solid ${skin.border}`,
      boxShadow: grosor ? "none"
               : relieve ? relieveDe(skin.border, Math.round(4 * scale), elevada)
               : skin.shadow,
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      overflow:"hidden",
    }}>
      {/* El dibujo manda: es lo que identifica la pieza de un vistazo */}
      <span style={{ color:skin.ink, display:"block" }}>
        <Icono name={name} size={Math.round(30 * scale)} />
      </span>

      {/* El número queda de apoyo, en la esquina, para quien prefiera leerlo */}
      <span style={{
        position:"absolute", top:2.5 * scale, right:4 * scale,
        fontFamily:FONTS.rank, fontWeight:700, letterSpacing:0.3,
        fontSize: 11.5 * scale, lineHeight:1, color:skin.inkSoft,
      }}>{d.display}</span>

      {/* Y el nombre al pie, que es lo que enseña a asociar dibujo y pieza.
          Solo si la ficha da de sí: por debajo de cierto tamaño estorba. */}
      {celda >= 56 && (
        <span style={{
          position:"absolute", bottom:5.5 * scale, left:0, width:"100%",
          textAlign:"center", fontSize:7.5 * scale, fontWeight:700,
          letterSpacing:0.4, textTransform:"uppercase", color:skin.inkSoft,
        }}>{d.label}</span>
      )}
      <div style={{
        position:"absolute", bottom:0, left:0, width:"100%", height:4,
        background:rankAccent(name),
      }}/>
    </div>
    </div>
  );
}

// Ficha en miniatura, para la bandeja, el panel de reglas y el cementerio
function MiniFicha({ name, owner = "mine", size = 24, apagada = false }) {
  const skin = owner === "mine" ? T.mine : T.theirs;
  const d = PIECES[name];
  return (
    <span title={d.label} style={{
      width:size, height:size, borderRadius:size * 0.22, flexShrink:0,
      background: apagada ? "rgba(0,0,0,0.25)" : skin.bg,
      border:`1px solid ${apagada ? T.textDim : skin.border}`,
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      position:"relative", overflow:"hidden",
    }}>
      <span style={{ color: apagada ? T.textDim : skin.ink, display:"block", marginBottom:1 }}>
        <Icono name={name} size={Math.round(size * 0.66)} />
      </span>
      <span style={{
        position:"absolute", bottom:0, left:0, width:"100%",
        height: Math.max(2, size * 0.11),
        background: apagada ? T.textDim : rankAccent(name),
      }}/>
    </span>
  );
}

// Dorso de ficha enemiga: no revela nada, solo el emblema de latón.
// Encima lleva lo que hayas podido DEDUCIR de ella por cómo se ha movido:
//   · un punto → se ha movido: no es bomba ni bandera
//   · un "2"   → dio un salto de dos: Explorador u oficial (Capitán o superior)
//   · un "II"  → dio un salto de tres o más: solo puede ser un Explorador
function HiddenTile({ movida, salto, relieve = false, grosor = 0 }) {
  const marca = salto >= 3
    ? { texto: "II", pista: "Saltó tres casillas o más: solo puede ser un Explorador" }
    : salto === 2
      ? { texto: "2", pista: "Saltó dos casillas: es un Explorador o un oficial (Capitán o superior)" }
      : movida
        ? { texto: "", pista: "Ya se ha movido: no puede ser bomba ni bandera" }
        : null;
  return (
    <div style={{
      width: grosor ? "100%" : "90%",
      height: grosor ? "100%" : "90%",
      position:"relative", transformStyle:"preserve-3d",
    }}>
    {grosor > 0 && <Cantos skin={T.hidden} grosor={grosor} />}
    <div style={{
      position:"absolute", inset:0, borderRadius:7,
      background:T.hidden.bg, border:`1px solid ${T.hidden.border}`,
      boxShadow: grosor ? "none" : relieve ? relieveDe(T.hidden.border, 4, false) : "0 2px 4px rgba(0,0,0,0.4)",
      display:"flex", alignItems:"center", justifyContent:"center",
      overflow:"hidden",
    }}>
      <div style={{
        position:"absolute", inset:0,
        background:`repeating-linear-gradient(45deg, ${T.hidden.pattern} 0px, ${T.hidden.pattern} 3px, transparent 3px, transparent 8px)`,
      }}/>
      <span style={{ fontSize:18, color:T.hidden.emblem, position:"relative" }}>✦</span>
      {marca && (
        <span title={marca.pista} style={{
          position:"absolute", right:3, bottom:3,
          minWidth: marca.texto ? 13 : 6, height: marca.texto ? 11 : 6,
          padding: marca.texto ? "0 2px" : 0,
          borderRadius: marca.texto ? 3 : "50%",
          background:T.brass,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontFamily:FONTS.rank, fontSize:8, fontWeight:700, color:"#3B2A18",
          lineHeight:1,
        }}>{marca.texto}</span>
      )}
    </div>
    </div>
  );
}

const Lake = () => <span style={{ fontSize:20, color:T.lakeWave }}>〰</span>;

// ── Fichas de pie ────────────────────────────────────────────────────────────
// Sobre un tablero inclinado, una ficha plana se ve como lo que es: una
// pegatina. Aquí se la contragira exactamente el mismo ángulo que al tablero,
// así que su base queda apoyada en la casilla y el cuerpo se levanta hacia el
// jugador — como las fichas de cartón del juego de mesa. La sombra elíptica al
// pie es la que remata la ilusión: sin ella, la ficha parece flotar.
function EnPie({ inclinacion, celda, children }) {
  if (!inclinacion) return children;
  // Una ficha de pie es MÁS ALTA que su casilla: sobresale por arriba y tapa
  // parcialmente la fila de detrás. Ese solapamiento es la señal que de verdad
  // dice "esto está levantado" — sin él, por mucho canto que le pongas, se
  // sigue leyendo como una pegatina.
  const alto = celda * 1.12;   // algo más alta que la casilla, sin comerse la fila de atrás
  return (
    <>
      {/* sombra proyectada en la casilla, al pie de la ficha */}
      <span style={{
        position:"absolute", bottom:"9%", left:"12%",
        width:"76%", height:6, borderRadius:"50%",
        background:"rgba(0,0,0,0.5)", filter:"blur(3px)",
        pointerEvents:"none",
      }}/>
      <div style={{
        position:"absolute", left:"6%", bottom:"8%",
        width:"88%", height:alto,
        transform:`rotateX(${-inclinacion}deg)`,
        transformOrigin:"50% 100%",   // la base, que es por donde se apoya
        transformStyle:"preserve-3d",
      }}>{children}</div>
    </>
  );
}

// Las tres caras que se ven de una ficha de pie: la de arriba, que recibe la
// luz, y las dos laterales, en sombra. Todas salen hacia atrás desde su borde
// de la cara frontal, formando un bloque de verdad.
function Cantos({ skin, grosor }) {
  const comun = { position:"absolute", backfaceVisibility:"hidden" };
  return (
    <>
      <div style={{
        ...comun, top:0, left:0, width:"100%", height:grosor,
        background:skin.cantoAlto, borderRadius:"7px 7px 0 0",
        transformOrigin:"50% 0%", transform:"rotateX(-90deg)",
      }}/>
      <div style={{
        ...comun, top:0, left:0, width:grosor, height:"100%",
        background:skin.cantoLado,
        transformOrigin:"0% 50%", transform:"rotateY(90deg)",
      }}/>
      <div style={{
        ...comun, top:0, right:0, width:grosor, height:"100%",
        background:skin.cantoLado,
        transformOrigin:"100% 50%", transform:"rotateY(-90deg)",
      }}/>
    </>
  );
}

// ─── CEMENTERIO ───────────────────────────────────────────────────────────────
// Qué piezas ha perdido cada bando. En un tablero de verdad las ves apartadas a
// un lado; aquí había que enseñarlas. Saber cuántas bombas quedan por salir
// cambia por completo cómo se juega el final.
// Un cementerio por jugador, desglosado por tipo de pieza: "3/4" significa que
// han caído 3 de los 4 que había. Los tipos intactos se ven apagados, y los que
// se han agotado del todo salen en latón: que al rival no le queden mineros, o
// que ya hayan salido todas sus bombas, cambia la partida entera.
function Cementerio({ bajas, etiqueta, owner }) {
  const total = bajas.length;
  return (
    <div style={{ padding:13, borderRadius:10, background:T.panelBg, border:`1px solid ${T.panelBorder}` }}>
      <div style={{
        display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:9,
      }}>
        <span style={{
          fontSize:10, color:T.textSoft, letterSpacing:1.6,
          fontWeight:700, textTransform:"uppercase",
        }}>{etiqueta}</span>
        <span style={{ fontSize:10, color: total ? T.brass : T.textDim }}>{total}/40</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:"6px 4px" }}>
        {PIECE_NAMES.map(name => {
          const caidos = bajas.filter(n => n === name).length;
          const cuantos = PIECES[name].count;
          const ninguna = caidos === 0;
          const todas = caidos === cuantos;
          return (
            <div key={name}
              title={`${PIECES[name].label}: ${caidos} de ${cuantos} ${caidos === 1 ? "caído" : "caídos"}`}
              style={{ display:"flex", alignItems:"center", gap:4, opacity: ninguna ? 0.38 : 1 }}>
              <MiniFicha name={name} owner={owner} size={22} apagada={ninguna} />
              <span style={{
                fontFamily:FONTS.ui, fontSize:10.5,
                color: todas ? T.brassBright : T.textSoft,
                fontWeight: todas ? 700 : 500,
              }}>{caidos}/{cuantos}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Encabezado de panel lateral
const PanelTitle = ({ children }) => (
  <div style={{
    fontSize:10, color:T.textSoft, fontFamily:FONTS.ui,
    letterSpacing:1.6, marginBottom:9, fontWeight:700, textTransform:"uppercase",
  }}>{children}</div>
);

// ─── CÁMARA ───────────────────────────────────────────────────────────────────
// La vista del tablero es un plano inclinado, no una escena 3D: se le da
// perspectiva, se gira sobre su eje horizontal y se acerca. Cada jugador la
// ajusta a su gusto y la elección se guarda en el navegador.
//
// El tope son 45°: más allá, el plano se ve tan de canto que los números de las
// fichas dejan de leerse y la ilusión se rompe.
// Medidas del marco del tablero, para poder reservarle sitio en la maquetación
const anchoMarco = celda => 10 * celda + 9 * GAP + 24;   // rejilla + relleno + borde
const altoMarco  = celda => anchoMarco(celda) + 19;      // + la fila de coordenadas

// Una transformación CSS no ocupa espacio: el tablero se agranda pero su hueco
// sigue siendo el de antes, y acaba pisando el panel lateral. Por eso el
// contenedor reserva a mano el tamaño que el tablero va a ocupar de verdad.
// Cuánto alto ocupa de verdad el tablero una vez inclinado. La perspectiva
// acorta bastante más que el coseno del ángulo, así que estimarlo dejaba un
// hueco muerto enorme encima. Se mide el tablero ya dibujado y se reserva
// exactamente eso: el espacio de arriba queda libre para agrandarlo.
function useHuecoDeTablero(camara) {
  const ref = useRef(null);
  const [alto, setAlto] = useState(null);
  useLayoutEffect(() => {
    if (ref.current) setAlto(ref.current.getBoundingClientRect().height);
  }, [camara.inclinacion, camara.tamano]);
  const radianes = (camara.inclinacion * Math.PI) / 180;
  return [ref, {
    width:  anchoMarco(camara.tamano),
    // hasta que se mide una vez, una estimación para no dar un salto feo
    height: (alto ?? altoMarco(camara.tamano) * Math.cos(radianes)) + 10,
  }];
}

const CAMARA_POR_DEFECTO = { inclinacion: 26, tamano: 62 };
const INCLINACION_MAX = 45;
const CLAVE_CAMARA = "stratego:camara";

function leerCamaraGuardada() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_CAMARA));
    if (guardado && typeof guardado.inclinacion === "number"
                 && typeof guardado.tamano === "number") return guardado;
  } catch { /* si el navegador no deja, se usa la de por defecto */ }
  return CAMARA_POR_DEFECTO;
}

// Cuanto más inclinado, más corta la distancia focal: así el acercamiento se
// nota de verdad en vez de quedarse en un gesto.
function transformDeCamara({ inclinacion }) {
  if (inclinacion === 0) return "none";
  const foco = 1400 - inclinacion * 14;
  return `perspective(${foco}px) rotateX(${inclinacion}deg)`;
}

function ControlesCamara({ camara, onCambiar }) {
  const fila = (etiqueta, clave, min, max, paso, formato) => (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <span style={{ fontSize:10.5, color:T.textSoft, width:66, flexShrink:0 }}>{etiqueta}</span>
      <input
        type="range" min={min} max={max} step={paso} value={camara[clave]}
        onChange={e => onCambiar({ ...camara, [clave]: Number(e.target.value) })}
        style={{ flex:1, accentColor:T.brass, cursor:"pointer", minWidth:70 }}
      />
      <span style={{ fontSize:10.5, color:T.brass, width:38, textAlign:"right", flexShrink:0 }}>
        {formato(camara[clave])}
      </span>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:7, minWidth:210 }}>
      <div style={{
        fontSize:10, color:T.textSoft, letterSpacing:1.6,
        fontWeight:700, textTransform:"uppercase",
      }}>Vista</div>
      {fila("Inclinación", "inclinacion", 0, INCLINACION_MAX, 1, v => `${v}°`)}
      {fila("Tamaño", "tamano", CELDA_MIN, CELDA_MAX, 2, v => `${v}px`)}
      <div style={{ display:"flex", gap:6 }}>
        {[["Plana", { ...CAMARA_POR_DEFECTO, inclinacion:0 }],
          ["Mesa", CAMARA_POR_DEFECTO]].map(([texto, preset]) => (
          <button key={texto} onClick={() => onCambiar(preset)}
            style={{
              flex:1, padding:"4px 0", borderRadius:6,
              background:"rgba(247,238,221,0.05)", border:`1px solid ${T.panelBorder}`,
              color:T.textSoft, fontFamily:FONTS.ui, fontSize:10.5, cursor:"pointer",
            }}>{texto}</button>
        ))}
      </div>
    </div>
  );
}

// ─── FASE DE DESPLIEGUE ───────────────────────────────────────────────────────
function SetupPhase({ onReady, lagos, aguaId, onCambiarAgua, reglas, modo, onVolver, camara, onCambiarCamara }) {
  const relieve = camara.inclinacion > 0;
  const celda = camara.tamano;
  const [marcoRef, hueco] = useHuecoDeTablero(camara);
  // espesor del bloque, proporcional al tamaño de la casilla
  const grosor = relieve ? Math.max(4, Math.round(celda * 0.10)) : 0;
  const [placed, setPlaced] = useState(Array.from({length:10}, () => Array(10).fill(null)));
  // Qué tenemos "en la mano": una pieza de la bandeja, o una ya puesta en el
  // tablero que queremos recolocar.
  //   { kind:"tray",  name }      · { kind:"board", r, c }
  const [sel, setSel] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const usedCounts = {};
  for (let r = 6; r < 10; r++)
    for (let c = 0; c < 10; c++)
      if (placed[r][c]) usedCounts[placed[r][c]] = (usedCounts[placed[r][c]] || 0) + 1;

  const remaining = {};
  for (const n of PIECE_NAMES) remaining[n] = PIECES[n].count - (usedCounts[n] || 0);
  const faltan = PIECE_NAMES.reduce((s, n) => s + remaining[n], 0);
  const allPlaced = faltan === 0;

  const copia = () => placed.map(row => [...row]);

  // ── Las tres operaciones sobre el tablero ────────────────────────────────
  function colocar(r, c, name) {
    const nb = copia();
    nb[r][c] = name;           // si había otra pieza, vuelve sola a la bandeja
    setPlaced(nb);
  }

  // Mover una pieza ya colocada. Si el destino está ocupado, se INTERCAMBIAN:
  // es lo más cómodo para ajustar una formación sin ir vaciando casillas.
  function moverOIntercambiar(fr, fc, tr, tc) {
    const nb = copia();
    const origen = nb[fr][fc];
    nb[fr][fc] = nb[tr][tc];
    nb[tr][tc] = origen;
    setPlaced(nb);
  }

  function quitar(r, c) {
    const nb = copia();
    nb[r][c] = null;
    setPlaced(nb);
  }

  // ── Interacción: clic ────────────────────────────────────────────────────
  function clickBandeja(name) {
    if (remaining[name] === 0) return;
    setSel(prev => (prev?.kind === "tray" && prev.name === name ? null : { kind:"tray", name }));
  }

  function clickCell(r, c) {
    if (!enMiZona(lagos, r, c)) { setSel(null); return; }

    // Traigo una pieza de la bandeja
    if (sel?.kind === "tray") {
      if (remaining[sel.name] > 0) {
        colocar(r, c, sel.name);
        if (remaining[sel.name] === 1) setSel(null);   // era la última
      }
      return;
    }

    // Tengo cogida una pieza del tablero
    if (sel?.kind === "board") {
      if (sel.r === r && sel.c === c) { setSel(null); return; }  // la suelto donde estaba
      moverOIntercambiar(sel.r, sel.c, r, c);
      setSel(null);
      return;
    }

    // Sin nada en la mano: cojo la pieza que haya en esta casilla
    if (placed[r][c]) setSel({ kind:"board", r, c });
  }

  function clickDerecho(e, r, c) {
    e.preventDefault();
    if (!enMiZona(lagos, r, c)) return;
    if (placed[r][c]) { quitar(r, c); setSel(null); }
  }

  // ── Interacción: arrastrar y soltar ──────────────────────────────────────
  function soltarEn(r, c) {
    setDragOver(null);
    if (!enMiZona(lagos, r, c) || !sel) return;
    if (sel.kind === "tray") {
      if (remaining[sel.name] > 0) colocar(r, c, sel.name);
      setSel(null);
    } else {
      if (sel.r !== r || sel.c !== c) moverOIntercambiar(sel.r, sel.c, r, c);
      setSel(null);
    }
  }

  function autoArrange() {
    const pool = shuffle(createPool());
    const nb = Array.from({length:10}, () => Array(10).fill(null));
    let i = 0;
    for (let r = 6; r < 10; r++)
      for (let c = 0; c < 10; c++)
        if (!esLago(lagos, r, c) && i < pool.length) nb[r][c] = pool[i++];
    setPlaced(nb);
    setSel(null);
  }

  function vaciar() {
    setPlaced(Array.from({length:10}, () => Array(10).fill(null)));
    setSel(null);
  }

  function startGame() {
    if (!allPlaced) return;
    const aiBoard = aiSetup(lagos);
    for (let r = 6; r < 10; r++)
      for (let c = 0; c < 10; c++)
        aiBoard[r][c] = placed[r][c]
          ? { name: placed[r][c], player: "human", revealed: true }
          : null;
    onReady(aiBoard);
  }

  const cogida = (r, c) => sel?.kind === "board" && sel.r === r && sel.c === c;

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:16, fontFamily:FONTS.ui }}>
      {/* Modo en el que se va a jugar, con salida a la pantalla de inicio */}
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <span style={{
          padding:"4px 12px", borderRadius:20,
          background:T.brassFaint, border:`1px solid ${T.brassSoft}`,
          color:T.brassBright, fontSize:11.5, fontWeight:700,
        }}>{MODOS[modo].nombre}</span>
        <button onClick={onVolver} style={{
          background:"none", border:"none", padding:0,
          color:T.textSoft, fontFamily:FONTS.ui, fontSize:11.5,
          cursor:"pointer", textDecoration:"underline",
        }}>cambiar de modo</button>
      </div>

      <div style={{ textAlign:"center" }}>
        <div style={{ color:T.brass, fontSize:14, fontWeight:700, letterSpacing:0.3 }}>
          Coloca tus 40 piezas en las cuatro filas de abajo
        </div>
        <div style={{ color:T.textSoft, fontSize:12, marginTop:4 }}>
          Arrastra las fichas, o pulsa una y luego la casilla. Sobre el tablero puedes
          moverlas e intercambiarlas; con el botón derecho las devuelves a la bandeja.
        </div>
      </div>

      {/* Bandeja de piezas */}
      <div style={{
        display:"flex", flexWrap:"wrap", gap:7, justifyContent:"center",
        maxWidth:700, padding:"12px 14px",
        background:T.panelBg, borderRadius:12,
        border:`1px solid ${T.panelBorder}`,
      }}>
        {PIECE_NAMES.map(name => {
          const active = sel?.kind === "tray" && sel.name === name;
          const done = remaining[name] === 0;
          return (
            <button key={name}
              onClick={() => clickBandeja(name)}
              disabled={done}
              draggable={!done}
              onDragStart={() => setSel({ kind:"tray", name })}
              onDragEnd={() => setDragOver(null)}
              style={{
                display:"flex", alignItems:"center", gap:8,
                padding:"6px 11px 6px 7px", borderRadius:9,
                cursor: done ? "not-allowed" : "grab",
                background: active ? T.brassFaint : "rgba(247,238,221,0.06)",
                border: active ? `2px solid ${T.brassBright}` : `1px solid ${T.panelBorder}`,
                color: done ? T.textDim : T.text,
                fontFamily:FONTS.ui, fontSize:12,
                opacity: done ? 0.4 : 1, transition:"all 0.12s",
              }}>
              <MiniFicha name={name} size={24} apagada={done} />
              <span>{PIECES[name].label}</span>
              <b style={{ color: done ? T.textDim : T.brass }}>×{remaining[name]}</b>
            </button>
          );
        })}
      </div>

      <ControlesCamara camara={camara} onCambiar={onCambiarCamara} />

      {/* Selector de zonas de agua · solo en 2.0 */}
      <div style={{
        display: reglas.aguaConfigurable ? "flex" : "none",
        alignItems:"center", gap:8, flexWrap:"wrap", justifyContent:"center",
      }}>
        <span style={{ fontSize:11, color:T.textSoft, letterSpacing:1.4, fontWeight:700, textTransform:"uppercase" }}>
          Agua
        </span>
        {Object.entries(CONFIGURACIONES_AGUA).map(([id, cfg]) => {
          const activa = aguaId === id;
          return (
            <button key={id} onClick={() => onCambiarAgua(id)} title={cfg.detalle}
              style={{
                padding:"5px 12px", borderRadius:20,
                background: activa ? T.brassFaint : "rgba(247,238,221,0.05)",
                border: activa ? `1.5px solid ${T.brass}` : `1px solid ${T.panelBorder}`,
                color: activa ? T.brassBright : T.textSoft,
                fontFamily:FONTS.ui, fontSize:11.5, fontWeight: activa ? 700 : 500,
                cursor:"pointer", transition:"all 0.12s",
              }}>
              {cfg.label}{activa && cfg.aleatoria ? " ↻" : ""}
            </button>
          );
        })}
      </div>

      {/* Tablero */}
      <div style={{ ...hueco, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div ref={marcoRef} style={{
        padding:10, borderRadius:12,
        background:T.frameBg, border:`2px solid ${T.frameBorder}`,
        boxShadow:`inset 0 0 0 1px ${T.frameInner}, 0 12px 30px rgba(0,0,0,0.45)`,
        transform: transformDeCamara(camara),
        transformOrigin:"50% 100%",
      }}>
        <div style={{ display:"grid", gridTemplateColumns:`repeat(10,${celda}px)`, gap:GAP }}>
          {Array.from({length:10}, (_, r) =>
            Array.from({length:10}, (__, c) => {
              const lake = esLago(lagos, r, c);
              const p = placed[r][c];
              const mia = enMiZona(lagos, r, c);
              const enemiga = r < 4;
              const puedoSoltar = mia && sel;
              const encima = dragOver && dragOver[0] === r && dragOver[1] === c;

              return (
                <div key={`${r}-${c}`}
                  onClick={() => clickCell(r, c)}
                  onContextMenu={e => clickDerecho(e, r, c)}
                  onDragOver={e => { if (mia) { e.preventDefault(); setDragOver([r, c]); } }}
                  onDragLeave={() => setDragOver(prev => (prev && prev[0] === r && prev[1] === c ? null : prev))}
                  onDrop={e => { e.preventDefault(); soltarEn(r, c); }}
                  style={{
                    width:celda, height:celda, borderRadius:4,
                    background: lake ? T.lake : squareBg(r, c),
                    boxShadow: cogida(r, c) ? `inset 0 0 0 3px ${T.select}`
                      : encima ? `inset 0 0 0 3px ${T.dropTarget}`
                      : lake ? "none"
                      : `inset 0 0 0 1px ${T.squareEdge}`,
                    position:"relative",
                    cursor: mia ? (p ? "grab" : sel ? "pointer" : "default") : "default",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    userSelect:"none", transformStyle:"preserve-3d",
                  }}>
                  {/* tinte: mi zona y la zona enemiga */}
                  {!lake && (mia || enemiga) && (
                    <div style={{
                      position:"absolute", inset:0, borderRadius:4,
                      background: mia ? T.zoneMine : T.zoneTheirs,
                    }}/>
                  )}
                  {/* hueco libre esperando pieza */}
                  {puedoSoltar && !p && !encima && (
                    <div style={{
                      position:"absolute", inset:4, borderRadius:4,
                      border:`1px dashed ${T.brassSoft}`,
                    }}/>
                  )}
                  {lake && <Lake />}
                  {p && (
                    <div
                      draggable
                      onDragStart={() => setSel({ kind:"board", r, c })}
                      onDragEnd={() => setDragOver(null)}
                      style={{
                        width:"100%", height:"100%",
                        display:"flex", alignItems:"center", justifyContent:"center",
                      }}>
                      <EnPie inclinacion={camara.inclinacion} celda={celda}>
                        <PieceTile name={p} owner="mine" dim={cogida(r, c)}
                                   relieve={relieve} elevada={cogida(r, c)} grosor={grosor} celda={celda} />
                      </EnPie>
                    </div>
                  )}
                  {enemiga && !lake && (
                    <span style={{
                      position:"relative", fontSize:10, letterSpacing:1,
                      color:"rgba(255,255,255,0.28)", fontWeight:600,
                    }}>IA</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      </div>

      <div style={{ display:"flex", gap:10, alignItems:"center" }}>
        <button onClick={autoArrange} style={botonSecundario}>Despliegue automático</button>
        <button onClick={vaciar} disabled={faltan === 40} style={{
          ...botonSecundario,
          opacity: faltan === 40 ? 0.4 : 1,
          cursor: faltan === 40 ? "not-allowed" : "pointer",
        }}>Vaciar</button>
        <button onClick={startGame} disabled={!allPlaced} style={{
          padding:"11px 28px",
          background: allPlaced ? `linear-gradient(160deg, ${T.brassBright}, ${T.brass})` : "rgba(0,0,0,0.25)",
          border:"none", borderRadius:9,
          color: allPlaced ? "#3B2A18" : T.textDim,
          fontFamily:FONTS.ui, fontSize:13, fontWeight:700,
          cursor: allPlaced ? "pointer" : "not-allowed", letterSpacing:0.3,
          boxShadow: allPlaced ? `0 4px 14px ${T.brassSoft}` : "none",
        }}>¡Comenzar batalla!</button>
      </div>
      {!allPlaced && (
        <p style={{ color:T.textSoft, fontSize:12, margin:0 }}>
          Faltan {faltan} piezas por colocar
        </p>
      )}
    </div>
  );
}

const botonSecundario = {
  padding:"11px 20px", background:"rgba(247,238,221,0.07)",
  border:`1px solid ${T.brassSoft}`, borderRadius:9,
  color:T.brass, fontFamily:FONTS.ui, fontSize:13,
  cursor:"pointer", letterSpacing:0.3,
};

// ─── COMBATE SOBRE EL TABLERO ─────────────────────────────────────────────────
// Sin ventanas emergentes: el combate se resuelve donde ocurre. Se destapan las
// dos fichas sobre la casilla atacada, chocan, y la perdedora (o las dos, si
// empatan) se rompe y desaparece.
const DESLIZ_MS = 260;            // lo que tarda una pieza en recorrer su jugada
const COMBATE_REVELAR  = 750;   // ms mostrando las dos fichas frente a frente
const COMBATE_DESTRUIR = 600;   // ms de la ruptura de la perdedora

// Una de las dos fichas del choque. Va de pie sobre la casilla, como cualquier
// otra ficha, y desplazada a un lado para quedar cara a cara con su rival.
// El contragiro y la animación van en capas distintas a propósito: una
// animación reemplaza la propiedad `transform` entera, así que si compartieran
// elemento, al empezar a caer la ficha perdería el contragiro y se tumbaría de
// golpe sobre el tablero.
function Combatiente({ piece, lado, cae, gana, inclinacion, celda, grosor }) {
  const dx = lado === "izq" ? "-26%" : "26%";
  const animacion = cae  ? `caerAtras ${COMBATE_DESTRUIR}ms cubic-bezier(0.5,0,0.75,0) forwards`
                    : gana ? `avanzarCentro ${COMBATE_DESTRUIR}ms cubic-bezier(0.3,0.9,0.4,1) forwards`
                    : `embestir 320ms cubic-bezier(0.34,1.3,0.6,1)`;
  return (
    <div style={{
      position:"absolute", left:"6%", bottom:"8%",
      width:"88%", height: celda * 1.12,
      transform:`rotateX(${-inclinacion}deg)`,
      transformOrigin:"50% 100%",
      transformStyle:"preserve-3d",
    }}>
      <div style={{
        width:"100%", height:"100%", position:"relative",
        transformOrigin:"50% 100%", transformStyle:"preserve-3d",
        "--dx": dx,
        transform:`translateX(${dx})`,
        animation: animacion,
      }}>
        <PieceTile
          name={piece.name}
          owner={piece.player === "human" ? "mine" : "theirs"}
          grosor={grosor} celda={celda}
        />
        {/* chispas de la ficha que se rompe */}
        {cae && [0,1,2,3,4,5].map(i => (
          <span key={i} style={{
            position:"absolute", left:"50%", top:"45%",
            width:6, height:6, marginLeft:-3, marginTop:-3,
            borderRadius:"50%", background: i % 2 ? T.brassBright : T.capture,
            "--a": `${i * 60}deg`,
            animation:`chispa ${COMBATE_DESTRUIR}ms ease-out ${40 + i*16}ms forwards`,
          }}/>
        ))}
      </div>
    </div>
  );
}

// El combate ocurre EN la casilla atacada, no en un cartel aparte: las dos
// fichas se plantan ahí, se embisten, y la que pierde cae hacia atrás mientras
// la ganadora ocupa el centro.
function CombatOverlay({ combat, celda, inclinacion, grosor }) {
  if (!combat) return null;
  const { r, c, attacker, defender, result, fase } = combat;

  const cae = quien =>
    fase === "destruir" &&
    (result === "both" || (result === "attacker" && quien === "def") || (result === "defender" && quien === "att"));
  const gana = quien =>
    fase === "destruir" && result !== "both" &&
    ((result === "attacker" && quien === "att") || (result === "defender" && quien === "def"));

  return (
    <div style={{
      position:"absolute", pointerEvents:"none",
      left: c * (celda + GAP), top: r * (celda + GAP),
      width: celda, height: celda,
      transformStyle:"preserve-3d",
    }}>
      {/* destello del impacto, sobre la propia casilla */}
      {fase === "revelar" && (
        <span style={{
          position:"absolute", left:"50%", top:"50%",
          width:celda, height:celda, marginLeft:-celda/2, marginTop:-celda/2,
          borderRadius:"50%",
          background:`radial-gradient(circle, ${T.brassBright}88 0%, transparent 68%)`,
          animation:"destello 520ms ease-out forwards",
        }}/>
      )}
      <Combatiente piece={attacker} lado="izq" inclinacion={inclinacion} celda={celda} grosor={grosor}
                   cae={cae("att")} gana={gana("att")} />
      <Combatiente piece={defender} lado="der" inclinacion={inclinacion} celda={celda} grosor={grosor}
                   cae={cae("def")} gana={gana("def")} />
    </div>
  );
}

// ─── FLECHA DEL MOVIMIENTO DE LA IA ───────────────────────────────────────────
function AiMoveArrow({ aiMoveAnim, celda }) {
  if (!aiMoveAnim) return null;
  const { fr, fc, tr, tc } = aiMoveAnim;
  const fromX = fc * (celda + GAP) + celda / 2;
  const fromY = fr * (celda + GAP) + celda / 2;
  const toX   = tc * (celda + GAP) + celda / 2;
  const toY   = tr * (celda + GAP) + celda / 2;
  const dx = toX - fromX, dy = toY - fromY;
  const len = Math.sqrt(dx*dx + dy*dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

  return (
    <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:10 }}>
      <div style={{
        position:"absolute",
        left: fc*(celda+GAP), top: fr*(celda+GAP),
        width:celda, height:celda, borderRadius:4,
        background:`${T.aiFrom}33`,
        border:`2px solid ${T.aiFrom}`,
        boxShadow:`0 0 18px ${T.aiFrom}99`,
        animation:"pulseRed 0.45s ease infinite alternate",
      }}/>
      <div style={{
        position:"absolute",
        left: tc*(celda+GAP), top: tr*(celda+GAP),
        width:celda, height:celda, borderRadius:4,
        background:`${T.aiTo}2E`,
        border:`2px solid ${T.aiTo}`,
        boxShadow:`0 0 18px ${T.aiTo}88`,
        animation:"pulseGold 0.45s ease infinite alternate",
      }}/>
      <div style={{
        position:"absolute",
        left:fromX, top:fromY - 1.5,
        width: len - 16, height:3,
        background:`linear-gradient(90deg, ${T.aiFrom}, ${T.aiTo})`,
        borderRadius:2,
        transformOrigin:"0 50%",
        transform:`rotate(${angle}deg)`,
        boxShadow:`0 0 10px ${T.aiTo}AA`,
        animation:"slideIn 0.3s ease",
      }}/>
      <div style={{
        position:"absolute",
        left: toX - 14, top: toY - 8,
        width:0, height:0,
        borderLeft:`16px solid ${T.aiTo}`,
        borderTop:"8px solid transparent",
        borderBottom:"8px solid transparent",
        transformOrigin:"0 50%",
        transform:`rotate(${angle}deg)`,
        filter:`drop-shadow(0 0 6px ${T.aiTo})`,
      }}/>
    </div>
  );
}

// ─── TABLERO DE JUEGO ─────────────────────────────────────────────────────────
function GameBoard({ board: initBoard, onReset, lagos, reglas, camara, onCambiarCamara }) {
  const relieve = camara.inclinacion > 0;
  const celda = camara.tamano;
  const [marcoRef, hueco] = useHuecoDeTablero(camara);
  // espesor del bloque, proporcional al tamaño de la casilla
  const grosor = relieve ? Math.max(4, Math.round(celda * 0.10)) : 0;
  const [board, setBoard]         = useState(initBoard);
  const [selCell, setSelCell]     = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [turn, setTurn]           = useState("human");
  const [combat, setCombat]       = useState(null);
  const [gameOver, setGameOver]   = useState(null);
  const [log, setLog]             = useState(["¡La batalla comienza!"]);
  const [aiMoveAnim, setAiMoveAnim] = useState(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [bajas, setBajas]         = useState({ human: [], ai: [] });
  const [ultimoMov, setUltimoMov] = useState(null);   // última jugada de la IA
  const [deslizando, setDeslizando] = useState(null); // pieza viajando ahora mismo

  // Todos los temporizadores en marcha, para poder cancelarlos si el jugador
  // reinicia la partida a media animación.
  const timersRef = useRef([]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);
  const programar = (fn, ms) => { timersRef.current.push(setTimeout(fn, ms)); };

  // 30 entradas: ahora que se apunta cada jugada de la IA, con 18 los combates
  // desaparecían del registro en cuatro turnos.
  const addLog = msg => setLog(prev => [msg, ...prev].slice(0, 30));

  // Calcula el resultado de un movimiento SIN tocar ningún estado: devuelve el
  // tablero nuevo, el combate si lo hubo, el texto para el registro y las bajas.
  // Es importante que sea puro: durante un combate el tablero no se actualiza
  // hasta que termina la escena, y si el registro o el cementerio se apuntaran
  // aquí, cantarían el resultado segundo y medio antes de tiempo.
  function applyMove(b, fr, fc, tr, tc) {
    const nb = b.map(row => row.map(c => c ? {...c} : null));
    const piece = nb[fr][fc];
    const target = nb[tr][tc];
    const distancia = Math.abs(tr - fr) + Math.abs(tc - fc);

    // Marcas de deducción. Guardamos el salto más largo que le hemos visto dar:
    //   1  → no es bomba ni bandera
    //   2  → Explorador u oficial (Capitán o superior)
    //   3+ → solo puede ser un Explorador
    piece.hasMoved = true;
    piece.maxSalto = Math.max(piece.maxSalto ?? 1, distancia);

    let battleInfo = null, mensaje = null;
    const bajas = [];

    if (target && target.player !== piece.player) {
      const result = resolveBattle(piece.name, target.name);
      battleInfo = { attacker: piece, defender: target, result };
      if (result === "attacker") {
        nb[tr][tc] = {...piece, revealed:true}; nb[fr][fc] = null;
        bajas.push(target);
      } else if (result === "defender") {
        nb[fr][fc] = null; nb[tr][tc] = {...target, revealed:true};
        bajas.push(piece);
      } else {
        nb[fr][fc] = null; nb[tr][tc] = null;
        bajas.push(piece, target);
      }
      const desenlace = result === "attacker" ? `gana ${PIECES[piece.name].label}`
                      : result === "defender" ? `resiste ${PIECES[target.name].label}`
                      : "caen las dos";
      mensaje = `${PIECES[piece.name].label} ⚔ ${PIECES[target.name].label} · ${desenlace}`;
    } else {
      nb[tr][tc] = piece;
      nb[fr][fc] = null;
    }
    return { nb, battleInfo, mensaje, bajas, distancia };
  }

  // Apunta en el cementerio las piezas caídas
  function anotarBajas(caidas) {
    if (!caidas.length) return;
    setBajas(prev => ({
      human: [...prev.human, ...caidas.filter(p => p.player === "human").map(p => p.name)],
      ai:    [...prev.ai,    ...caidas.filter(p => p.player === "ai").map(p => p.name)],
    }));
  }

  // Cuando hay combate no actualizamos el tablero de inmediato: primero se ve la
  // escena sobre la casilla atacada, y al terminar se aplica el resultado.
  // Toda jugada pasa por aquí: la pieza recorre las casillas en vez de
  // teletransportarse, y solo cuando llega se actualiza el tablero. Si el
  // movimiento era un ataque, al aterrizar arranca la escena de combate.
  function moverConAnimacion(pieza, res, fr, fc, tr, tc, despues) {
    setDeslizando({ pieza, fr, fc, tr, tc });
    programar(() => {
      setDeslizando(null);
      if (res.battleInfo) { escenificarCombate(res, fr, fc, tr, tc, despues); return; }
      setBoard(res.nb);
      const winner = checkWinner(res.nb, lagos, reglas);
      if (winner) { setGameOver(winner); return; }
      despues();
    }, DESLIZ_MS);
  }

  function escenificarCombate(res, fr, fc, tr, tc, despues) {
    const { nb, battleInfo, mensaje, bajas: caidas } = res;
    setCombat({ ...battleInfo, fr, fc, r: tr, c: tc, fase: "revelar" });
    programar(() => setCombat(k => (k ? { ...k, fase: "destruir" } : k)), COMBATE_REVELAR);
    programar(() => {
      setCombat(null);
      setBoard(nb);
      if (mensaje) addLog(mensaje);
      anotarBajas(caidas);
      const winner = checkWinner(nb, lagos, reglas);
      if (winner) { setGameOver(winner); return; }
      despues();
    }, COMBATE_REVELAR + COMBATE_DESTRUIR);
  }

  function doAiTurn(b) {
    setTurn("ai");
    setAiThinking(true);
    programar(() => {
      const move = aiMove(b, lagos, reglas);
      if (!move) { setTurn("human"); setAiThinking(false); return; }
      setAiThinking(false);
      setAiMoveAnim({ ...move });

      programar(() => {
        const res = applyMove(b, move.fr, move.fc, move.tr, move.tc);
        setAiMoveAnim(null);
        // Rastro de la jugada del rival: casillas marcadas y línea en el registro
        if (reglas.ayudas) {
          setUltimoMov({ fr: move.fr, fc: move.fc, tr: move.tr, tc: move.tc });
          addLog(`IA · ${coord(move.fr, move.fc)} → ${coord(move.tr, move.tc)}` +
                 (res.distancia > 1 ? ` · ${res.distancia} casillas` : ""));
        }
        moverConAnimacion(b[move.fr][move.fc], res, move.fr, move.fc, move.tr, move.tc,
                          () => setTurn("human"));
      }, 950);
    }, 650);
  }

  function clickCell(r, c) {
    if (turn !== "human" || combat || gameOver || aiMoveAnim || aiThinking || deslizando) return;
    const piece = board[r][c];
    if (selCell) {
      const [sr, sc] = selCell;
      if (validMoves.some(([mr,mc]) => mr===r && mc===c)) {
        const res = applyMove(board, sr, sc, r, c);
        setSelCell(null); setValidMoves([]);
        setUltimoMov(null);          // al mover yo, se borra el rastro del rival
        moverConAnimacion(board[sr][sc], res, sr, sc, r, c, () => doAiTurn(res.nb));
      } else if (piece?.player === "human") {
        setSelCell([r,c]);
        setValidMoves(getValidMoves(board, r, c, lagos, reglas));
      } else {
        setSelCell(null); setValidMoves([]);
      }
    } else {
      if (piece?.player === "human") {
        setSelCell([r,c]);
        setValidMoves(getValidMoves(board, r, c, lagos, reglas));
      }
    }
  }

  const isSel   = (r,c) => selCell && selCell[0]===r && selCell[1]===c;
  const isValid = (r,c) => validMoves.some(([mr,mc]) => mr===r && mc===c);

  return (
    <div style={{
      display:"flex", gap:20, alignItems:"flex-start", justifyContent:"center",
      flexWrap:"wrap",   // al acercar el tablero, el panel pasa debajo en vez de cortarse
      fontFamily:FONTS.ui,
    }}>
      {gameOver && (
        <div style={{
          position:"fixed", inset:0, zIndex:300,
          display:"flex", alignItems:"center", justifyContent:"center",
          background:"rgba(30,15,5,0.86)", backdropFilter:"blur(8px)",
        }}>
          <div style={{
            textAlign:"center",
            background:T.frameBg,
            border:`2px solid ${T.brassSoft}`, borderRadius:20, padding:"44px 60px",
            boxShadow:"0 24px 70px rgba(0,0,0,0.6)",
          }}>
            <div style={{ fontSize:56, marginBottom:12 }}>{gameOver==="human" ? "🏆" : "💀"}</div>
            <div style={{
              fontSize:28, fontWeight:800, letterSpacing:0.5, marginBottom:8,
              color: gameOver==="human" ? T.win : T.lose,
            }}>
              {gameOver==="human" ? "¡Victoria!" : "Derrota"}
            </div>
            <div style={{ color:T.textSoft, fontSize:14, marginBottom:28 }}>
              {gameOver==="human" ? "Has capturado la bandera enemiga" : "Tu bandera ha caído"}
            </div>
            <button onClick={onReset} style={{
              padding:"12px 30px",
              background:`linear-gradient(160deg, ${T.brassBright}, ${T.brass})`,
              border:"none", borderRadius:10,
              color:"#3B2A18", fontFamily:FONTS.ui, fontSize:14, fontWeight:700,
              cursor:"pointer",
            }}>Nueva partida</button>
          </div>
        </div>
      )}

      {/* Tablero */}
      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-start" }}>
        <div style={{ height:34, display:"flex", alignItems:"center", justifyContent:"center", width:"100%", marginBottom:4 }}>
          {(aiThinking || aiMoveAnim) && (
            <div style={{
              padding:"6px 18px", borderRadius:20,
              background:T.themBg,
              border:`1px solid ${T.themBorder}`,
              color:T.text, fontSize:12, fontWeight:600,
              boxShadow:"0 4px 14px rgba(0,0,0,0.35)",
              animation:"pulseRed 0.55s ease infinite alternate",
            }}>
              {aiThinking ? "La IA está pensando…" : "La IA se mueve"}
            </div>
          )}
        </div>

        <div style={{ ...hueco, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
        <div ref={marcoRef} style={{
          padding:10, borderRadius:12,
          background:T.frameBg, border:`2px solid ${T.frameBorder}`,
          boxShadow:`inset 0 0 0 1px ${T.frameInner}, 0 12px 30px rgba(0,0,0,0.45)`,
          transform: transformDeCamara(camara),
          transformOrigin:"50% 100%",
        }}>
          <div style={{ position:"relative" }}>
            <div style={{ display:"grid", gridTemplateColumns:`repeat(10,${celda}px)`, gap:GAP }}>
              {board.map((row, r) =>
                row.map((piece, c) => {
                  const lake       = esLago(lagos, r, c);
                  const sel2       = isSel(r, c);
                  const valid      = isValid(r, c);
                  const isHuman    = piece?.player === "human";
                  const isAi       = piece?.player === "ai";
                  // Las dos fichas que están combatiendo se dibujan en la escena
                  // del combate, no en su casilla: aquí las ocultamos.
                  const luchando   = combat && ((combat.r === r && combat.c === c) || (combat.fr === r && combat.fc === c));
                  const saliendo   = deslizando && deslizando.fr === r && deslizando.fc === c;
                  const showPiece  = !luchando && !saliendo && (isHuman || (isAi && piece?.revealed));
                  const attackable = valid && piece?.player === "ai";
                  // Rastro de la última jugada del rival
                  const rastroDe = reglas.ayudas && ultimoMov && ultimoMov.fr === r && ultimoMov.fc === c;
                  const rastroA  = reglas.ayudas && ultimoMov && ultimoMov.tr === r && ultimoMov.tc === c;

                  return (
                    <div key={`${r}-${c}`} onClick={() => clickCell(r, c)}
                      style={{
                        width:celda, height:celda, borderRadius:4,
                        background: lake ? T.lake : squareBg(r, c),
                        boxShadow: luchando ? `inset 0 0 0 3px ${T.brassBright}, 0 0 22px ${T.brassBright}77`
                          : sel2 ? `inset 0 0 0 3px ${T.select}`
                          : attackable ? `inset 0 0 0 3px ${T.capture}`
                          : rastroA ? `inset 0 0 0 2px ${T.brass}AA`
                          : rastroDe ? `inset 0 0 0 2px ${T.brass}55`
                          : lake ? "none"
                          : `inset 0 0 0 1px ${T.squareEdge}`,
                        position:"relative",
                        cursor: (isHuman && turn==="human" && !aiThinking && !aiMoveAnim) || valid ? "pointer" : "default",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        userSelect:"none", transformStyle:"preserve-3d",
                      }}>

                      {valid && !piece && (
                        <div style={{ width:16, height:16, borderRadius:"50%", background:T.moveDot }}/>
                      )}
                      {lake && <Lake />}
                      {showPiece && (
                        <EnPie inclinacion={camara.inclinacion} celda={celda}>
                          <PieceTile name={piece.name} owner={isHuman ? "mine" : "theirs"}
                                     relieve={relieve} elevada={sel2} grosor={grosor} celda={celda} />
                        </EnPie>
                      )}
                      {isAi && !piece.revealed && !luchando && !saliendo && (
                        <EnPie inclinacion={camara.inclinacion} celda={celda}>
                          <HiddenTile
                            movida={reglas.ayudas && piece.hasMoved}
                            salto={reglas.ayudas ? piece.maxSalto : 0}
                            relieve={relieve} grosor={grosor}
                          />
                        </EnPie>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
            <AiMoveArrow aiMoveAnim={aiMoveAnim} celda={celda} />
            <CombatOverlay combat={combat} celda={celda}
                            inclinacion={camara.inclinacion} grosor={grosor} />

            {/* La pieza que está recorriendo su jugada. Si es del rival y sigue
                oculta, viaja de dorso: moverse no la desvela. */}
            {deslizando && (
              <div style={{
                position:"absolute", zIndex:15, pointerEvents:"none",
                left: deslizando.fc * (celda + GAP),
                top:  deslizando.fr * (celda + GAP),
                width:celda, height:celda,
                display:"flex", alignItems:"center", justifyContent:"center",
                "--dx": `${(deslizando.tc - deslizando.fc) * (celda + GAP)}px`,
                "--dy": `${(deslizando.tr - deslizando.fr) * (celda + GAP)}px`,
                animation:`deslizar ${DESLIZ_MS}ms cubic-bezier(0.33,0.9,0.35,1) forwards`,
              }}>
                <EnPie inclinacion={camara.inclinacion} celda={celda}>
                  {deslizando.pieza.player === "human" || deslizando.pieza.revealed ? (
                    <PieceTile
                      name={deslizando.pieza.name}
                      owner={deslizando.pieza.player === "human" ? "mine" : "theirs"}
                      relieve={relieve} elevada grosor={grosor} celda={celda}
                    />
                  ) : (
                    <HiddenTile relieve={relieve} grosor={grosor} />
                  )}
                </EnPie>
              </div>
            )}

          <div style={{ display:"flex", gap:GAP, marginTop:5 }}>
            {Array.from({length:10},(_,i) => (
              <div key={i} style={{ width:celda, textAlign:"center", fontSize:10, color:T.textDim, fontWeight:600 }}>
                {String.fromCharCode(65+i)}
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>

      {/* Panel lateral */}
      <div style={{ display:"flex", flexDirection:"column", gap:12, width:216, marginTop:38 }}>
        <div style={{
          padding:"13px 14px", borderRadius:10, textAlign:"center",
          background: turn==="human" ? T.youBg : T.themBg,
          border:`1px solid ${turn==="human" ? T.youBorder : T.themBorder}`,
        }}>
          <div style={{ fontSize:10, color:T.textSoft, letterSpacing:1.6, marginBottom:4, fontWeight:700 }}>TURNO</div>
          <div style={{ color: turn==="human" ? T.youText : T.themText, fontSize:15, fontWeight:700 }}>
            {turn==="human" ? "Te toca" : aiThinking ? "Pensando…" : aiMoveAnim ? "Moviéndose…" : "IA"}
          </div>
        </div>

        <Cementerio bajas={bajas.ai} etiqueta="Bajas de la IA" owner="theirs" />
        <Cementerio bajas={bajas.human} etiqueta="Tus bajas" owner="mine" />

        <div style={{ padding:13, borderRadius:10, background:T.panelBg, border:`1px solid ${T.panelBorder}` }}>
          <PanelTitle>Piezas especiales</PanelTitle>
          {[
            ["Spy", "Mata al Marshal si ataca"],
            ["Scout", "Avanza sin límite en línea recta"],
            ...(reglas.alcanceOficiales > 1
              ? [["Captain", "Capitán o superior: hasta 2 casillas"]] : []),
            ["Miner", "Desactiva las bombas"],
            ["Bomb", "Inmóvil y mortal"],
            ["Flag", "Captúrala para ganar"],
          ].map(([name, tip]) => (
            <div key={name} style={{ display:"flex", gap:9, marginBottom:7, alignItems:"center" }}>
              <MiniFicha name={name} size={22} />
              <span style={{ color:T.textSoft, fontSize:11, lineHeight:1.25 }}>{tip}</span>
            </div>
          ))}
        </div>

        <div style={{
          padding:13, borderRadius:10, background:T.panelBg,
          border:`1px solid ${T.panelBorder}`, flex:1,
          maxHeight:190, overflowY:"auto",
        }}>
          <PanelTitle>Registro</PanelTitle>
          {log.map((entry,i) => (
            <div key={i} style={{
              fontSize:11.5, color: i===0 ? T.brassBright : T.textDim,
              marginBottom:5, lineHeight:1.35,
              borderLeft: i===0 ? `2px solid ${T.brassSoft}` : "none",
              paddingLeft: i===0 ? 7 : 0,
            }}>{entry}</div>
          ))}
        </div>

        <div style={{
          padding:"12px", borderRadius:10,
          background:T.panelBg, border:`1px solid ${T.panelBorder}`,
        }}>
          <ControlesCamara camara={camara} onCambiar={onCambiarCamara} />
        </div>

        <button onClick={onReset} style={{
          padding:9, background:"rgba(247,238,221,0.06)",
          border:`1px solid ${T.panelBorder}`, borderRadius:8,
          color:T.textSoft, fontFamily:FONTS.ui,
          fontSize:12, cursor:"pointer",
        }}>Reiniciar</button>
      </div>
    </div>
  );
}

// ─── PANTALLA DE INICIO ───────────────────────────────────────────────────────
// Lo primero que se ve: elegir con qué reglas se juega. Cada tarjeta dice sin
// rodeos en qué se diferencia del otro modo, para poder elegir sabiendo.
function TarjetaModo({ id, modo, onElegir }) {
  const [encima, setEncima] = useState(false);
  const esModerno = id === "moderno";
  return (
    <button
      onClick={() => onElegir(id)}
      onMouseEnter={() => setEncima(true)}
      onMouseLeave={() => setEncima(false)}
      style={{
        width:300, textAlign:"left", cursor:"pointer",
        padding:"22px 22px 20px",
        borderRadius:14,
        background: encima ? "rgba(52,29,13,0.96)" : T.panelBg,
        border:`2px solid ${encima ? T.brass : T.panelBorder}`,
        boxShadow: encima
          ? `0 14px 34px rgba(0,0,0,0.5), inset 0 0 0 1px ${T.brassSoft}`
          : "0 8px 22px rgba(0,0,0,0.35)",
        transform: encima ? "translateY(-3px)" : "none",
        transition:"all 0.16s ease",
        fontFamily:FONTS.ui,
      }}>
      {/* Fichas de muestra, para que se vea de qué va cada modo */}
      <div style={{ display:"flex", gap:6, marginBottom:14 }}>
        {(esModerno ? ["Marshal","Captain","Scout","Bomb"] : ["Marshal","Scout","Miner","Flag"])
          .map(n => <MiniFicha key={n} name={n} size={30} />)}
      </div>

      <div style={{ fontSize:19, fontWeight:800, color:T.brassBright, letterSpacing:0.2 }}>
        {modo.nombre}
      </div>
      <div style={{ fontSize:12.5, color:T.brass, marginTop:3, marginBottom:14 }}>
        {modo.lema}
      </div>

      <ul style={{ margin:0, padding:0, listStyle:"none" }}>
        {modo.puntos.map((p, i) => (
          <li key={i} style={{
            display:"flex", gap:8, alignItems:"flex-start",
            fontSize:12, color:T.textSoft, lineHeight:1.4, marginBottom:8,
          }}>
            <span style={{ color:T.brass, flexShrink:0 }}>▪</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>

      <div style={{
        marginTop:16, padding:"9px 0", textAlign:"center", borderRadius:8,
        background: encima ? `linear-gradient(160deg, ${T.brassBright}, ${T.brass})` : "rgba(247,238,221,0.06)",
        border: encima ? "none" : `1px solid ${T.brassSoft}`,
        color: encima ? "#3B2A18" : T.brass,
        fontSize:13, fontWeight:700, letterSpacing:0.4,
        transition:"all 0.16s ease",
      }}>
        Jugar
      </div>
    </button>
  );
}

function PantallaInicio({ onElegir }) {
  return (
    <div style={{
      display:"flex", flexDirection:"column", alignItems:"center",
      gap:26, fontFamily:FONTS.ui, paddingTop:10,
    }}>
      <p style={{
        margin:0, color:T.textSoft, fontSize:13.5, textAlign:"center",
        maxWidth:520, lineHeight:1.5,
      }}>
        Dos formas de jugar la misma batalla. Elige con qué reglas quieres
        empezar; podrás cambiar de modo cuando quieras.
      </p>

      <div style={{ display:"flex", gap:20, flexWrap:"wrap", justifyContent:"center" }}>
        {Object.entries(MODOS).map(([id, modo]) => (
          <TarjetaModo key={id} id={id} modo={modo} onElegir={onElegir} />
        ))}
      </div>

      <p style={{ margin:0, color:T.textDim, fontSize:11.5, textAlign:"center" }}>
        En ambos modos juegas contra la máquina · el multijugador está en construcción
      </p>
    </div>
  );
}

// ─── RAÍZ ─────────────────────────────────────────────────────────────────────
export default function Stratego() {
  // Mientras no haya modo elegido, se enseña la pantalla de inicio
  const [modo, setModo] = useState(null);
  const [phase, setPhase] = useState("setup");
  const [gameBoard, setGameBoard] = useState(null);

  // Configuración de agua elegida, y las casillas que le corresponden. Se guarda
  // aquí arriba porque tiene que sobrevivir al paso de despliegue a partida.
  const [aguaId, setAguaId] = useState("clasica");
  const [lagos, setLagos] = useState(() => crearLagos("clasica"));

  // Cámara: inclinación y cercanía del tablero. Es solo apariencia, no cambia
  // ninguna regla. Se recuerda entre partidas y entre visitas.
  const [camara, setCamara] = useState(leerCamaraGuardada);
  function cambiarCamara(nueva) {
    setCamara(nueva);
    try { localStorage.setItem(CLAVE_CAMARA, JSON.stringify(nueva)); } catch { /* sin memoria, da igual */ }
  }

  const reglas = MODOS[modo]?.reglas ?? REGLAS_POR_DEFECTO;

  // Al elegir modo se empieza de cero, con el agua clásica: en el modo clásico
  // no hay otra, y en el 2.0 es el punto de partida antes de tocar el selector.
  function elegirModo(id) {
    setModo(id);
    setAguaId("clasica");
    setLagos(crearLagos("clasica"));
    setGameBoard(null);
    setPhase("setup");
  }

  function volverAlInicio() {
    setModo(null);
    setGameBoard(null);
    setPhase("setup");
  }

  // Volver a pulsar "Aleatoria" vuelve a sortear
  function cambiarAgua(id) {
    setAguaId(id);
    setLagos(crearLagos(id));
  }

  return (
    <div style={{
      minHeight:"100vh", background:T.pageBg,
      backgroundImage:`
        radial-gradient(ellipse at 12% 8%, ${T.pageGlowA} 0%, transparent 55%),
        radial-gradient(ellipse at 88% 92%, ${T.pageGlowB} 0%, transparent 60%),
        repeating-linear-gradient(93deg, transparent 0px, transparent 3px, ${T.grain} 3px, ${T.grain} 4px),
        repeating-linear-gradient(87deg, transparent 0px, transparent 7px, ${T.grain} 7px, ${T.grain} 8px)
      `,
      display:"flex", flexDirection:"column", alignItems:"center",
      paddingTop:24, paddingBottom:44, fontFamily:FONTS.ui,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Oswald:wght@500;600;700&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes popIn    { from{transform:scale(0.5);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes pulseRed { from{opacity:0.7} to{opacity:1} }
        @keyframes pulseGold{ from{opacity:0.6} to{opacity:1} }
        @keyframes slideIn  { from{opacity:0} to{opacity:1} }

        /* La pieza recorre su jugada. El desplazamiento va en variables CSS que
           se calculan al vuelo, según de dónde a dónde se mueva. */
        @keyframes deslizar {
          from { transform: translate(0, 0) }
          to   { transform: translate(var(--dx, 0), var(--dy, 0)) }
        }

        /* ── Combate ───────────────────────────────────────────────────────── */
        /* Las dos fichas entran una contra otra.
           A propósito NO se anima la opacidad: si el navegador tarda en pintar
           el primer fotograma, la ficha se quedaría invisible. Animando solo la
           escala, en el peor caso se ve algo más pequeña un instante. */
        @keyframes entrarChoque {
          from { transform: scale(0.55) }
          to   { transform: scale(1) }
        }
        /* Destello del impacto */
        @keyframes destello {
          0%   { transform: scale(0.3); opacity: 0 }
          35%  { transform: scale(1);   opacity: 1 }
          100% { transform: scale(1.5); opacity: 0 }
        }
        /* La ficha que pierde: tiembla y se rompe */
        @keyframes romper {
          0%   { transform: translateX(0)    rotate(0deg);   opacity: 1 }
          12%  { transform: translateX(-4px) rotate(-7deg);  opacity: 1 }
          24%  { transform: translateX(4px)  rotate(7deg);   opacity: 1 }
          36%  { transform: translateX(-3px) rotate(-5deg);  opacity: 1 }
          48%  { transform: translateX(3px)  rotate(4deg);   opacity: 1 }
          60%  { transform: translateX(0)    rotate(0deg);   opacity: 1 }
          100% { transform: scale(0.25) rotate(24deg);       opacity: 0 }
        }
        /* Chispas que saltan de la ficha rota */
        @keyframes chispa {
          from { transform: rotate(var(--a,0deg)) translateY(-4px)  scale(1); opacity: 1 }
          to   { transform: rotate(var(--a,0deg)) translateY(-30px) scale(0); opacity: 0 }
        }
        /* Las dos se embisten al destaparse */
        @keyframes embestir {
          0%   { transform: translateX(calc(var(--dx) * 2.1)) }
          60%  { transform: translateX(calc(var(--dx) * 0.82)) }
          100% { transform: translateX(var(--dx)) }
        }
        /* La perdedora encaja el golpe, se va hacia atrás y se derrumba */
        @keyframes caerAtras {
          0%   { transform: translateX(var(--dx)) rotateX(0deg);   opacity:1 }
          18%  { transform: translateX(calc(var(--dx) * 1.25)) rotateX(-12deg); opacity:1 }
          100% { transform: translateX(calc(var(--dx) * 1.6)) rotateX(88deg);   opacity:0 }
        }
        /* La ganadora se queda con la casilla */
        @keyframes avanzarCentro {
          0%   { transform: translateX(var(--dx)) scale(1) }
          35%  { transform: translateX(calc(var(--dx) * 0.5)) scale(1.1) }
          100% { transform: translateX(0) scale(1) }
        }

        /* La ficha que gana da un pequeño empujón */
        @keyframes vencer {
          0%   { transform: scale(1) }
          40%  { transform: scale(1.16) }
          100% { transform: scale(1) }
        }

        /* El degradado del título se recorta sobre las letras. Va aquí y no en
           un style={{}} porque el recorte sobre texto necesita el prefijo
           -webkit-, y React no lo pasa de forma fiable desde JavaScript. */
        .titulo-stratego {
          font-size: 42px;
          font-weight: 900;
          letter-spacing: 12px;
          font-family: 'Cinzel', serif;
          display: inline-block;
          background: linear-gradient(135deg, ${T.brass} 0%, #FFE9A8 42%, ${T.brassBright} 62%, #9A6B18 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
          filter: drop-shadow(0 3px 10px rgba(0,0,0,0.5));
        }
      `}</style>

      <div style={{ textAlign:"center", marginBottom:20 }}>
        <div className="titulo-stratego">STRATEGO</div>
      </div>

      {!modo && <PantallaInicio onElegir={elegirModo} />}

      {/* Al acercar el tablero puede no caber a lo ancho. Con el desplazamiento
          horizontal aquí, se centra cuando cabe y se puede arrastrar cuando no;
          sin esto, la parte izquierda se salía de la ventana y no había forma
          de llegar a ella. */}
      <div style={{ width:"100%", overflowX:"auto", overflowY:"visible" }}>
      <div style={{ display:"flex", justifyContent:"center", minWidth:"fit-content", padding:"0 14px" }}>

      {modo && phase === "setup" && (
        <SetupPhase
          onReady={b => { setGameBoard(b); setPhase("game"); }}
          lagos={lagos} aguaId={aguaId} onCambiarAgua={cambiarAgua}
          reglas={reglas} modo={modo} onVolver={volverAlInicio}
          camara={camara} onCambiarCamara={cambiarCamara}
        />
      )}
      {modo && phase === "game" && gameBoard && (
        <GameBoard
          board={gameBoard} lagos={lagos} reglas={reglas}
          camara={camara} onCambiarCamara={cambiarCamara}
          onReset={() => { setGameBoard(null); setPhase("setup"); }}
        />
      )}

      </div>
      </div>
    </div>
  );
}
