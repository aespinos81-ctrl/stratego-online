import { useState, useEffect, useRef } from "react";
import { theme as T, FONTS } from "./theme.js";

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
const LAKES = [[4,2],[5,2],[4,3],[5,3],[4,6],[5,6],[4,7],[5,7]];
const isLake = (r, c) => LAKES.some(([lr, lc]) => lr === r && lc === c);
const CELL = 58;
const GAP = 2;

// Mi zona de despliegue son las cuatro filas de abajo
const enMiZona = (r, c) => r >= 6 && !isLake(r, c);

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

function getValidMoves(board, row, col) {
  const piece = board[row][col];
  if (!piece || piece.name === "Bomb" || piece.name === "Flag") return [];
  const moves = [];
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    if (piece.name === "Scout") {
      let r = row + dr, c = col + dc;
      while (r >= 0 && r < 10 && c >= 0 && c < 10 && !isLake(r, c)) {
        const t = board[r][c];
        if (t) { if (t.player !== piece.player) moves.push([r, c]); break; }
        moves.push([r, c]);
        r += dr; c += dc;
      }
    } else {
      const r = row + dr, c = col + dc;
      if (r < 0 || r >= 10 || c < 0 || c >= 10 || isLake(r, c)) continue;
      const t = board[r][c];
      if (!t || t.player !== piece.player) moves.push([r, c]);
    }
  }
  return moves;
}

function aiSetup() {
  const pool = shuffle(createPool());
  const board = Array.from({length: 10}, () => Array(10).fill(null));
  let idx = 0;
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 10; c++)
      if (!isLake(r, c) && idx < pool.length)
        board[r][c] = { name: pool[idx++], player: "ai", revealed: false };
  return board;
}

function aiMove(board) {
  const moves = [];
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 10; c++) {
      const p = board[r][c];
      if (p?.player !== "ai") continue;
      for (const [tr, tc] of getValidMoves(board, r, c)) {
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

function checkWinner(board) {
  const hFlag = board.flat().some(p => p?.name === "Flag" && p?.player === "human");
  const aFlag = board.flat().some(p => p?.name === "Flag" && p?.player === "ai");
  const hMoves = board.some((row, r) => row.some((_, c) => board[r][c]?.player === "human" && getValidMoves(board, r, c).length > 0));
  const aMoves = board.some((row, r) => row.some((_, c) => board[r][c]?.player === "ai"   && getValidMoves(board, r, c).length > 0));
  if (!aFlag || !aMoves) return "human";
  if (!hFlag || !hMoves) return "ai";
  return null;
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

function PieceTile({ name, owner = "mine", scale = 1, dim = false }) {
  const skin = owner === "mine" ? T.mine : T.theirs;
  const d = PIECES[name];
  return (
    <div title={d.label} style={{
      width:"90%", height:"90%", borderRadius:7,
      background:skin.bg, border:`1px solid ${skin.border}`,
      boxShadow:skin.shadow,
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      position:"relative", overflow:"hidden",
      opacity: dim ? 0.35 : 1,
    }}>
      <Insignia name={name} color={skin.inkSoft} scale={scale} />
      <span style={{
        fontFamily:FONTS.rank, fontSize:27 * scale * escalaNumeral(d.display),
        fontWeight:700, color:skin.ink, lineHeight:0.95, letterSpacing:0.5,
        marginTop: 5 * scale,   // deja sitio a la insignia de arriba
      }}>{d.display}</span>
      <div style={{
        position:"absolute", bottom:0, left:0, width:"100%", height:4,
        background:rankAccent(name),
      }}/>
    </div>
  );
}

// Dorso de ficha enemiga: no revela nada, solo el emblema de latón
function HiddenTile() {
  return (
    <div style={{
      width:"90%", height:"90%", borderRadius:7,
      background:T.hidden.bg, border:`1px solid ${T.hidden.border}`,
      boxShadow:"0 2px 4px rgba(0,0,0,0.4)",
      display:"flex", alignItems:"center", justifyContent:"center",
      position:"relative", overflow:"hidden",
    }}>
      <div style={{
        position:"absolute", inset:0,
        background:`repeating-linear-gradient(45deg, ${T.hidden.pattern} 0px, ${T.hidden.pattern} 3px, transparent 3px, transparent 8px)`,
      }}/>
      <span style={{ fontSize:18, color:T.hidden.emblem, position:"relative" }}>✦</span>
    </div>
  );
}

const Lake = () => <span style={{ fontSize:20, color:T.lakeWave }}>〰</span>;

// Encabezado de panel lateral
const PanelTitle = ({ children }) => (
  <div style={{
    fontSize:10, color:T.textSoft, fontFamily:FONTS.ui,
    letterSpacing:1.6, marginBottom:9, fontWeight:700, textTransform:"uppercase",
  }}>{children}</div>
);

// ─── FASE DE DESPLIEGUE ───────────────────────────────────────────────────────
function SetupPhase({ onReady }) {
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
    if (!enMiZona(r, c)) { setSel(null); return; }

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
    if (!enMiZona(r, c)) return;
    if (placed[r][c]) { quitar(r, c); setSel(null); }
  }

  // ── Interacción: arrastrar y soltar ──────────────────────────────────────
  function soltarEn(r, c) {
    setDragOver(null);
    if (!enMiZona(r, c) || !sel) return;
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
        if (!isLake(r, c) && i < pool.length) nb[r][c] = pool[i++];
    setPlaced(nb);
    setSel(null);
  }

  function vaciar() {
    setPlaced(Array.from({length:10}, () => Array(10).fill(null)));
    setSel(null);
  }

  function startGame() {
    if (!allPlaced) return;
    const aiBoard = aiSetup();
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
              <span style={{
                width:24, height:24, borderRadius:5, flexShrink:0,
                background: done ? "transparent" : T.mine.bg,
                border: `1px solid ${done ? T.textDim : T.mine.border}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                position:"relative", overflow:"hidden",
              }}>
                <span style={{
                  fontFamily:FONTS.rank, fontWeight:600, letterSpacing:0.3,
                  fontSize: 15 * escalaNumeral(PIECES[name].display),
                  color: done ? T.textDim : T.mine.ink, marginBottom:1,
                }}>{PIECES[name].display}</span>
                <span style={{
                  position:"absolute", bottom:0, left:0, width:"100%", height:3,
                  background: done ? T.textDim : rankAccent(name),
                }}/>
              </span>
              <span>{PIECES[name].label}</span>
              <b style={{ color: done ? T.textDim : T.brass }}>×{remaining[name]}</b>
            </button>
          );
        })}
      </div>

      {/* Tablero */}
      <div style={{
        padding:10, borderRadius:12,
        background:T.frameBg, border:`2px solid ${T.frameBorder}`,
        boxShadow:`inset 0 0 0 1px ${T.frameInner}, 0 12px 30px rgba(0,0,0,0.45)`,
      }}>
        <div style={{ display:"grid", gridTemplateColumns:`repeat(10,${CELL}px)`, gap:GAP }}>
          {Array.from({length:10}, (_, r) =>
            Array.from({length:10}, (__, c) => {
              const lake = isLake(r, c);
              const p = placed[r][c];
              const mia = enMiZona(r, c);
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
                    width:CELL, height:CELL, borderRadius:4,
                    background: lake ? T.lake : squareBg(r, c),
                    boxShadow: cogida(r, c) ? `inset 0 0 0 3px ${T.select}`
                      : encima ? `inset 0 0 0 3px ${T.dropTarget}`
                      : lake ? "none"
                      : `inset 0 0 0 1px ${T.squareEdge}`,
                    position:"relative",
                    cursor: mia ? (p ? "grab" : sel ? "pointer" : "default") : "default",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    userSelect:"none",
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
                      <PieceTile name={p} owner="mine" dim={cogida(r, c)} />
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
const COMBATE_REVELAR  = 750;   // ms mostrando las dos fichas frente a frente
const COMBATE_DESTRUIR = 600;   // ms de la ruptura de la perdedora

// Una de las dos fichas del choque
function Combatiente({ piece, cae, gana }) {
  // La animación de entrada va sin retardo y sin `fill-mode`: así, si por lo que
  // sea se reiniciara, la ficha se queda visible en su estado normal en vez de
  // desaparecer. Con `both` bastaba un reinicio para dejarla en opacidad cero.
  return (
    <div style={{
      width:56, height:56, position:"relative",
      display:"flex", alignItems:"center", justifyContent:"center",
      animation: cae ? `romper ${COMBATE_DESTRUIR}ms ease-in forwards`
               : gana ? "vencer 400ms ease-out"
               : "entrarChoque 260ms cubic-bezier(0.34,1.56,0.64,1)",
    }}>
      <PieceTile name={piece.name} owner={piece.player === "human" ? "mine" : "theirs"} scale={1.12} />
      {/* chispas de la ruptura */}
      {cae && [0,1,2,3,4,5].map(i => (
        <span key={i} style={{
          position:"absolute", left:"50%", top:"50%",
          width:6, height:6, marginLeft:-3, marginTop:-3,
          borderRadius:"50%", background: i % 2 ? T.brassBright : T.capture,
          "--a": `${i * 60}deg`,      // dirección en la que sale cada chispa
          animation:`chispa ${COMBATE_DESTRUIR}ms ease-out ${60 + i*18}ms forwards`,
        }}/>
      ))}
    </div>
  );
}

function CombatOverlay({ combat }) {
  if (!combat) return null;
  const { r, c, attacker, defender, result, fase } = combat;
  const ANCHO_ESCENA = 120;
  const anchoTablero = 10 * CELL + 9 * GAP;
  const cx = c * (CELL + GAP) + CELL / 2;
  const cy = r * (CELL + GAP) + CELL / 2;
  // Si el combate cae en una columna del borde, pegamos la escena al tablero
  // para que no se salga por fuera del marco.
  const izquierda = Math.max(0, Math.min(cx - ANCHO_ESCENA / 2, anchoTablero - ANCHO_ESCENA));

  const cae = quien =>
    fase === "destruir" &&
    (result === "both" || (result === "attacker" && quien === "def") || (result === "defender" && quien === "att"));
  const gana = quien =>
    fase === "destruir" && result !== "both" &&
    ((result === "attacker" && quien === "att") || (result === "defender" && quien === "def"));

  return (
    <div style={{
      position:"absolute", zIndex:20, pointerEvents:"none",
      left: izquierda, top: cy - 32,
      width: ANCHO_ESCENA, height:64,
      display:"flex", alignItems:"center", justifyContent:"center", gap:6,
    }}>
      {/* Fondo oscuro: despega la escena de las casillas de alrededor. Sin
          animación a propósito: al cambiar de fase se reiniciaría y se quedaría
          congelado en su primer fotograma, es decir, invisible. */}
      <div style={{
        position:"absolute", inset:0, borderRadius:12,
        background:"rgba(28,14,4,0.72)",
        border:`1px solid ${T.brassSoft}`,
        boxShadow:"0 6px 20px rgba(0,0,0,0.5)",
      }}/>
      {/* Destello del impacto: solo existe mientras se destapan las fichas */}
      {fase === "revelar" && (
        <div style={{
          position:"absolute", left:"50%", top:"50%",
          width:70, height:70, marginLeft:-35, marginTop:-35,
          borderRadius:"50%",
          background:`radial-gradient(circle, ${T.brassBright}66 0%, transparent 70%)`,
          animation:"destello 500ms ease-out forwards",
        }}/>
      )}
      <Combatiente piece={attacker} cae={cae("att")} gana={gana("att")} />
      <Combatiente piece={defender} cae={cae("def")} gana={gana("def")} />
    </div>
  );
}

// ─── FLECHA DEL MOVIMIENTO DE LA IA ───────────────────────────────────────────
function AiMoveArrow({ aiMoveAnim }) {
  if (!aiMoveAnim) return null;
  const { fr, fc, tr, tc } = aiMoveAnim;
  const fromX = fc * (CELL + GAP) + CELL / 2;
  const fromY = fr * (CELL + GAP) + CELL / 2;
  const toX   = tc * (CELL + GAP) + CELL / 2;
  const toY   = tr * (CELL + GAP) + CELL / 2;
  const dx = toX - fromX, dy = toY - fromY;
  const len = Math.sqrt(dx*dx + dy*dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

  return (
    <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:10 }}>
      <div style={{
        position:"absolute",
        left: fc*(CELL+GAP), top: fr*(CELL+GAP),
        width:CELL, height:CELL, borderRadius:4,
        background:`${T.aiFrom}33`,
        border:`2px solid ${T.aiFrom}`,
        boxShadow:`0 0 18px ${T.aiFrom}99`,
        animation:"pulseRed 0.45s ease infinite alternate",
      }}/>
      <div style={{
        position:"absolute",
        left: tc*(CELL+GAP), top: tr*(CELL+GAP),
        width:CELL, height:CELL, borderRadius:4,
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
function GameBoard({ board: initBoard, onReset }) {
  const [board, setBoard]         = useState(initBoard);
  const [selCell, setSelCell]     = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [turn, setTurn]           = useState("human");
  const [combat, setCombat]       = useState(null);
  const [gameOver, setGameOver]   = useState(null);
  const [log, setLog]             = useState(["¡La batalla comienza!"]);
  const [aiMoveAnim, setAiMoveAnim] = useState(null);
  const [aiThinking, setAiThinking] = useState(false);

  // Todos los temporizadores en marcha, para poder cancelarlos si el jugador
  // reinicia la partida a media animación.
  const timersRef = useRef([]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);
  const programar = (fn, ms) => { timersRef.current.push(setTimeout(fn, ms)); };

  const addLog = msg => setLog(prev => [msg, ...prev].slice(0, 18));

  function applyMove(b, fr, fc, tr, tc) {
    const nb = b.map(row => row.map(c => c ? {...c} : null));
    const piece = nb[fr][fc];
    const target = nb[tr][tc];
    let battleInfo = null;
    if (target && target.player !== piece.player) {
      const result = resolveBattle(piece.name, target.name);
      battleInfo = { attacker: piece, defender: target, result };
      if (result === "attacker")      { nb[tr][tc] = {...piece, revealed:true}; nb[fr][fc] = null; }
      else if (result === "defender") { nb[fr][fc] = null; nb[tr][tc] = {...target, revealed:true}; }
      else                            { nb[fr][fc] = null; nb[tr][tc] = null; }
      const desenlace = result === "attacker" ? `gana ${PIECES[piece.name].label}`
                      : result === "defender" ? `resiste ${PIECES[target.name].label}`
                      : "caen las dos";
      addLog(`${PIECES[piece.name].label} ⚔ ${PIECES[target.name].label} · ${desenlace}`);
    } else {
      nb[tr][tc] = piece;
      nb[fr][fc] = null;
    }
    return { nb, battleInfo };
  }

  // Cuando hay combate no actualizamos el tablero de inmediato: primero se ve la
  // escena sobre la casilla atacada, y al terminar se aplica el resultado.
  function escenificarCombate(nb, battleInfo, fr, fc, tr, tc, despues) {
    setCombat({ ...battleInfo, fr, fc, r: tr, c: tc, fase: "revelar" });
    programar(() => setCombat(k => (k ? { ...k, fase: "destruir" } : k)), COMBATE_REVELAR);
    programar(() => {
      setCombat(null);
      setBoard(nb);
      const winner = checkWinner(nb);
      if (winner) { setGameOver(winner); return; }
      despues();
    }, COMBATE_REVELAR + COMBATE_DESTRUIR);
  }

  function doAiTurn(b) {
    setTurn("ai");
    setAiThinking(true);
    programar(() => {
      const move = aiMove(b);
      if (!move) { setTurn("human"); setAiThinking(false); return; }
      setAiThinking(false);
      setAiMoveAnim({ ...move });

      programar(() => {
        const { nb, battleInfo } = applyMove(b, move.fr, move.fc, move.tr, move.tc);
        setAiMoveAnim(null);
        if (battleInfo) {
          escenificarCombate(nb, battleInfo, move.fr, move.fc, move.tr, move.tc, () => setTurn("human"));
          return;
        }
        setBoard(nb);
        const winner = checkWinner(nb);
        if (winner) { setGameOver(winner); return; }
        setTurn("human");
      }, 950);
    }, 650);
  }

  function clickCell(r, c) {
    if (turn !== "human" || combat || gameOver || aiMoveAnim || aiThinking) return;
    const piece = board[r][c];
    if (selCell) {
      const [sr, sc] = selCell;
      if (validMoves.some(([mr,mc]) => mr===r && mc===c)) {
        const { nb, battleInfo } = applyMove(board, sr, sc, r, c);
        setSelCell(null); setValidMoves([]);
        if (battleInfo) {
          escenificarCombate(nb, battleInfo, sr, sc, r, c, () => doAiTurn(nb));
          return;
        }
        setBoard(nb);
        const winner = checkWinner(nb);
        if (winner) { setGameOver(winner); return; }
        doAiTurn(nb);
      } else if (piece?.player === "human") {
        setSelCell([r,c]);
        setValidMoves(getValidMoves(board, r, c));
      } else {
        setSelCell(null); setValidMoves([]);
      }
    } else {
      if (piece?.player === "human") {
        setSelCell([r,c]);
        setValidMoves(getValidMoves(board, r, c));
      }
    }
  }

  const isSel   = (r,c) => selCell && selCell[0]===r && selCell[1]===c;
  const isValid = (r,c) => validMoves.some(([mr,mc]) => mr===r && mc===c);

  return (
    <div style={{ display:"flex", gap:20, alignItems:"flex-start", fontFamily:FONTS.ui }}>
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

        <div style={{
          padding:10, borderRadius:12,
          background:T.frameBg, border:`2px solid ${T.frameBorder}`,
          boxShadow:`inset 0 0 0 1px ${T.frameInner}, 0 12px 30px rgba(0,0,0,0.45)`,
        }}>
          <div style={{ position:"relative" }}>
            <AiMoveArrow aiMoveAnim={aiMoveAnim} />
            <CombatOverlay combat={combat} />
            <div style={{ display:"grid", gridTemplateColumns:`repeat(10,${CELL}px)`, gap:GAP }}>
              {board.map((row, r) =>
                row.map((piece, c) => {
                  const lake       = isLake(r, c);
                  const sel2       = isSel(r, c);
                  const valid      = isValid(r, c);
                  const isHuman    = piece?.player === "human";
                  const isAi       = piece?.player === "ai";
                  // Las dos fichas que están combatiendo se dibujan en la escena
                  // del combate, no en su casilla: aquí las ocultamos.
                  const luchando   = combat && ((combat.r === r && combat.c === c) || (combat.fr === r && combat.fc === c));
                  const showPiece  = !luchando && (isHuman || (isAi && piece?.revealed));
                  const attackable = valid && piece?.player === "ai";

                  return (
                    <div key={`${r}-${c}`} onClick={() => clickCell(r, c)}
                      style={{
                        width:CELL, height:CELL, borderRadius:4,
                        background: lake ? T.lake : squareBg(r, c),
                        boxShadow: sel2 ? `inset 0 0 0 3px ${T.select}`
                          : attackable ? `inset 0 0 0 3px ${T.capture}`
                          : lake ? "none"
                          : `inset 0 0 0 1px ${T.squareEdge}`,
                        position:"relative",
                        cursor: (isHuman && turn==="human" && !aiThinking && !aiMoveAnim) || valid ? "pointer" : "default",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        userSelect:"none",
                      }}>

                      {valid && !piece && (
                        <div style={{ width:16, height:16, borderRadius:"50%", background:T.moveDot }}/>
                      )}
                      {lake && <Lake />}
                      {showPiece && <PieceTile name={piece.name} owner={isHuman ? "mine" : "theirs"} />}
                      {isAi && !piece.revealed && !luchando && <HiddenTile />}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div style={{ display:"flex", gap:GAP, marginTop:5 }}>
            {Array.from({length:10},(_,i) => (
              <div key={i} style={{ width:CELL, textAlign:"center", fontSize:10, color:T.textDim, fontWeight:600 }}>
                {String.fromCharCode(65+i)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Panel lateral */}
      <div style={{ display:"flex", flexDirection:"column", gap:12, width:200, marginTop:38 }}>
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

        <div style={{ padding:13, borderRadius:10, background:T.panelBg, border:`1px solid ${T.panelBorder}` }}>
          <PanelTitle>Piezas especiales</PanelTitle>
          {[
            ["Spy", "Mata al Marshal si ataca"],
            ["Scout", "Avanza varias casillas"],
            ["Miner", "Desactiva las bombas"],
            ["Bomb", "Inmóvil y mortal"],
            ["Flag", "Captúrala para ganar"],
          ].map(([name, tip]) => (
            <div key={name} style={{ display:"flex", gap:9, marginBottom:7, alignItems:"center" }}>
              <span style={{
                width:22, height:22, borderRadius:5, flexShrink:0,
                background:T.mine.bg, border:`1px solid ${T.mine.border}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                position:"relative", overflow:"hidden",
              }}>
                <span style={{
                  fontFamily:FONTS.rank, fontWeight:600, letterSpacing:0.3,
                  fontSize: 14 * escalaNumeral(PIECES[name].display),
                  color:T.mine.ink, marginBottom:1,
                }}>{PIECES[name].display}</span>
                <span style={{ position:"absolute", bottom:0, left:0, width:"100%", height:3, background:rankAccent(name) }}/>
              </span>
              <span style={{ color:T.textSoft, fontSize:11, lineHeight:1.25 }}>{tip}</span>
            </div>
          ))}
        </div>

        <div style={{ padding:13, borderRadius:10, background:T.panelBg, border:`1px solid ${T.panelBorder}`, flex:1 }}>
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

// ─── RAÍZ ─────────────────────────────────────────────────────────────────────
export default function Stratego() {
  const [phase, setPhase] = useState("setup");
  const [gameBoard, setGameBoard] = useState(null);

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

      {phase === "setup" && (
        <SetupPhase onReady={b => { setGameBoard(b); setPhase("game"); }} />
      )}
      {phase === "game" && gameBoard && (
        <GameBoard board={gameBoard} onReset={() => { setGameBoard(null); setPhase("setup"); }} />
      )}
    </div>
  );
}
