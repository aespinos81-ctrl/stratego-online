import { useState, useEffect, useRef } from "react";
import { theme as T, FONTS } from "./theme.js";

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
// `display` es lo que se pinta en la ficha. Se usan cifras árabes (10, 9, 8…)
// en vez de números romanos porque se leen mucho mejor de un vistazo; las tres
// piezas especiales llevan símbolo propio.
const PIECES = {
  Marshal:    { rank: 10, count: 1, display: "10", label: "Marshal"    },
  General:    { rank: 9,  count: 1, display: "9",  label: "General"    },
  Colonel:    { rank: 8,  count: 2, display: "8",  label: "Coronel"    },
  Major:      { rank: 7,  count: 3, display: "7",  label: "Mayor"      },
  Captain:    { rank: 6,  count: 4, display: "6",  label: "Capitán"    },
  Lieutenant: { rank: 5,  count: 4, display: "5",  label: "Teniente"   },
  Sergeant:   { rank: 4,  count: 4, display: "4",  label: "Sargento"   },
  Miner:      { rank: 3,  count: 5, display: "3",  label: "Minero"     },
  Scout:      { rank: 2,  count: 8, display: "2",  label: "Explorador" },
  Spy:        { rank: 1,  count: 1, display: "S",  label: "Espía"      },
  Bomb:       { rank: 11, count: 6, display: "✸",  label: "Bomba"      },
  Flag:       { rank: 0,  count: 1, display: "⚑",  label: "Bandera"    },
};

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
function PieceTile({ name, owner = "mine", scale = 1, dim = false }) {
  const skin = owner === "mine" ? T.mine : T.theirs;
  const d = PIECES[name];
  const size = (d.display.length > 1 ? 21 : 26) * scale;
  return (
    <div title={d.label} style={{
      width:"90%", height:"90%", borderRadius:7,
      background:skin.bg, border:`1px solid ${skin.border}`,
      boxShadow:skin.shadow,
      display:"flex", alignItems:"center", justifyContent:"center",
      position:"relative", overflow:"hidden",
      opacity: dim ? 0.35 : 1,
    }}>
      <span style={{
        fontFamily:FONTS.ui, fontSize:size, fontWeight:800,
        color:skin.ink, lineHeight:1, letterSpacing:-0.5,
        marginBottom:2,
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
                  fontSize: PIECES[name].display.length > 1 ? 11 : 13,
                  fontWeight:800, color: done ? T.textDim : T.mine.ink, marginBottom:1,
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

// ─── POPUP DE COMBATE ─────────────────────────────────────────────────────────
function BattlePopup({ battle, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, [onDone]);
  if (!battle) return null;
  const { attacker, defender, result } = battle;
  const txt = result === "attacker" ? "¡Gana el atacante!" : result === "defender" ? "¡Gana el defensor!" : "¡Empate!";
  const col = result === "attacker" ? T.youText : result === "defender" ? T.themText : T.brassBright;
  return (
    <div style={{
      position:"fixed", inset:0, zIndex:200,
      display:"flex", alignItems:"center", justifyContent:"center",
      background:"rgba(30,15,5,0.78)", backdropFilter:"blur(6px)",
      animation:"fadeIn 0.2s ease", fontFamily:FONTS.ui,
    }}>
      <div style={{
        background:T.frameBg,
        border:`2px solid ${T.brassSoft}`, borderRadius:18,
        padding:"28px 46px", textAlign:"center",
        boxShadow:"0 20px 60px rgba(0,0,0,0.55)",
        animation:"popIn 0.3s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        <div style={{ color:T.brass, fontSize:11, letterSpacing:2.5, marginBottom:20, fontWeight:700 }}>
          ⚔ COMBATE ⚔
        </div>
        <div style={{ display:"flex", gap:32, alignItems:"center", marginBottom:20 }}>
          {[{p:attacker,label:"Atacante"}, null, {p:defender,label:"Defensor"}].map((item,i) =>
            item === null ? (
              <div key={i} style={{ fontSize:15, color:T.brass, fontWeight:700 }}>VS</div>
            ) : (
              <div key={i} style={{ textAlign:"center" }}>
                <div style={{ width:70, height:70, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <PieceTile name={item.p.name} owner={item.p.player==="human" ? "mine" : "theirs"} scale={1.7} />
                </div>
                <div style={{ color:T.text, fontSize:13, marginTop:8, fontWeight:600 }}>
                  {PIECES[item.p.name].label}
                </div>
                <div style={{
                  fontSize:11, marginTop:2,
                  color: item.p.player==="human" ? T.youText : T.themText,
                }}>
                  {item.p.player==="human" ? "Tú" : "IA"} · {item.label}
                </div>
              </div>
            )
          )}
        </div>
        <div style={{ fontSize:17, fontWeight:700, color:col }}>{txt}</div>
      </div>
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
  const [battle, setBattle]       = useState(null);
  const [gameOver, setGameOver]   = useState(null);
  const [log, setLog]             = useState(["¡La batalla comienza!"]);
  const [aiMoveAnim, setAiMoveAnim] = useState(null);
  const [aiThinking, setAiThinking] = useState(false);
  const pendingRef = useRef(null);

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
      addLog(`${PIECES[piece.name].label} atacó a ${PIECES[target.name].label}`);
    } else {
      nb[tr][tc] = piece;
      nb[fr][fc] = null;
    }
    return { nb, battleInfo };
  }

  function doAiTurn(b) {
    setTurn("ai");
    setAiThinking(true);
    setTimeout(() => {
      const move = aiMove(b);
      if (!move) { setTurn("human"); setAiThinking(false); return; }
      setAiThinking(false);
      setAiMoveAnim({ ...move });

      setTimeout(() => {
        const { nb, battleInfo } = applyMove(b, move.fr, move.fc, move.tr, move.tc);
        setAiMoveAnim(null);
        setBoard(nb);
        const winner = checkWinner(nb);
        if (battleInfo) {
          setBattle(battleInfo);
          pendingRef.current = { winner };
        } else {
          setTurn("human");
          if (winner) setGameOver(winner);
        }
      }, 950);
    }, 650);
  }

  function handleBattleDone() {
    setBattle(null);
    const { winner } = pendingRef.current || {};
    pendingRef.current = null;
    if (winner) { setGameOver(winner); return; }
    const w2 = checkWinner(board);
    if (w2) { setGameOver(w2); return; }
    if (turn === "ai") setTurn("human");
    else doAiTurn(board);
  }

  function clickCell(r, c) {
    if (turn !== "human" || battle || gameOver || aiMoveAnim || aiThinking) return;
    const piece = board[r][c];
    if (selCell) {
      const [sr, sc] = selCell;
      if (validMoves.some(([mr,mc]) => mr===r && mc===c)) {
        const { nb, battleInfo } = applyMove(board, sr, sc, r, c);
        setBoard(nb);
        setSelCell(null); setValidMoves([]);
        const winner = checkWinner(nb);
        if (battleInfo) {
          setBattle(battleInfo);
          pendingRef.current = { winner };
        } else {
          if (winner) { setGameOver(winner); return; }
          doAiTurn(nb);
        }
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
      {battle && <BattlePopup battle={battle} onDone={handleBattleDone} />}

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
            <div style={{ display:"grid", gridTemplateColumns:`repeat(10,${CELL}px)`, gap:GAP }}>
              {board.map((row, r) =>
                row.map((piece, c) => {
                  const lake       = isLake(r, c);
                  const sel2       = isSel(r, c);
                  const valid      = isValid(r, c);
                  const isHuman    = piece?.player === "human";
                  const isAi       = piece?.player === "ai";
                  const showPiece  = isHuman || (isAi && piece?.revealed);
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
                      {isAi && !piece.revealed && <HiddenTile />}
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
                <span style={{ fontSize:12, fontWeight:800, color:T.mine.ink, marginBottom:1 }}>
                  {PIECES[name].display}
                </span>
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
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes popIn    { from{transform:scale(0.5);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes pulseRed { from{opacity:0.7} to{opacity:1} }
        @keyframes pulseGold{ from{opacity:0.6} to{opacity:1} }
        @keyframes slideIn  { from{opacity:0} to{opacity:1} }

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
