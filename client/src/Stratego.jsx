import { useState, useEffect, useRef } from "react";
import { theme as T } from "./theme.js";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PIECES = {
  Marshal:    { rank: 10, count: 1,  symbol: "Ⅹ",  label: "Marshal"    },
  General:    { rank: 9,  count: 1,  symbol: "Ⅸ",  label: "General"    },
  Colonel:    { rank: 8,  count: 2,  symbol: "Ⅷ",  label: "Coronel"    },
  Major:      { rank: 7,  count: 3,  symbol: "Ⅶ",  label: "Mayor"      },
  Captain:    { rank: 6,  count: 4,  symbol: "Ⅵ",  label: "Capitán"    },
  Lieutenant: { rank: 5,  count: 4,  symbol: "Ⅴ",  label: "Teniente"   },
  Sergeant:   { rank: 4,  count: 4,  symbol: "Ⅳ",  label: "Sargento"   },
  Miner:      { rank: 3,  count: 5,  symbol: "Ⅲ",  label: "Minero"     },
  Scout:      { rank: 2,  count: 8,  symbol: "Ⅱ",  label: "Explorador" },
  Spy:        { rank: 1,  count: 1,  symbol: "S",   label: "Espía"      },
  Bomb:       { rank: 11, count: 6,  symbol: "✸",  label: "Bomba"      },
  Flag:       { rank: 0,  count: 1,  symbol: "⚑",  label: "Bandera"    },
};

const PIECE_NAMES = Object.keys(PIECES);
const LAKES = [[4,2],[5,2],[4,3],[5,3],[4,6],[5,6],[4,7],[5,7]];
const isLake = (r, c) => LAKES.some(([lr, lc]) => lr === r && lc === c);
const CELL = 54;
const GAP = 2;

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

// ─── GAME LOGIC ───────────────────────────────────────────────────────────────
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
// Una pieza dibujada. `owner` es "mine" (hueso) o "theirs" (burdeos). El rango se
// distingue por el número romano y por la barra de color del pie.
function PieceTile({ name, owner = "mine", scale = 1 }) {
  const skin = owner === "mine" ? T.mine : T.theirs;
  return (
    <div style={{
      width:"88%", height:"88%", borderRadius:6,
      background:skin.bg, border:`1px solid ${skin.border}`,
      boxShadow:skin.shadow,
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      position:"relative", overflow:"hidden",
    }}>
      <div style={{ fontSize:20*scale, color:skin.ink, lineHeight:1, fontWeight:700 }}>
        {PIECES[name].symbol}
      </div>
      <div style={{
        fontSize:7.5*scale, color:skin.inkSoft, marginTop:1,
        fontFamily:"'Cinzel',serif", letterSpacing:0.2,
      }}>
        {PIECES[name].label.slice(0,6)}
      </div>
      <div style={{
        position:"absolute", bottom:0, left:"15%",
        width:"70%", height:3, borderRadius:"2px 2px 0 0",
        background:rankAccent(name),
      }}/>
    </div>
  );
}

// Dorso de ficha enemiga: no revela nada, solo el emblema de latón
function HiddenTile() {
  return (
    <div style={{
      width:"88%", height:"88%", borderRadius:6,
      background:T.hidden.bg, border:`1px solid ${T.hidden.border}`,
      boxShadow:"0 2px 4px rgba(0,0,0,0.4)",
      display:"flex", alignItems:"center", justifyContent:"center",
      position:"relative", overflow:"hidden",
    }}>
      <div style={{
        position:"absolute", inset:0,
        background:`repeating-linear-gradient(45deg, ${T.hidden.pattern} 0px, ${T.hidden.pattern} 3px, transparent 3px, transparent 8px)`,
      }}/>
      <span style={{ fontSize:17, color:T.hidden.emblem, position:"relative" }}>✦</span>
    </div>
  );
}

const Lake = () => <span style={{ fontSize:18, color:T.lakeWave }}>〰</span>;

// ─── SETUP PHASE ──────────────────────────────────────────────────────────────
function SetupPhase({ onReady }) {
  const [placed, setPlaced] = useState(Array.from({length:10}, () => Array(10).fill(null)));
  const [sel, setSel] = useState(null);

  const usedCounts = {};
  for (let r = 6; r < 10; r++)
    for (let c = 0; c < 10; c++)
      if (placed[r][c]) usedCounts[placed[r][c]] = (usedCounts[placed[r][c]] || 0) + 1;

  const remaining = {};
  for (const n of PIECE_NAMES) remaining[n] = PIECES[n].count - (usedCounts[n] || 0);
  const allPlaced = PIECE_NAMES.every(n => remaining[n] === 0);

  function clickCell(r, c) {
    if (r < 6 || isLake(r, c)) return;
    const nb = placed.map(row => [...row]);
    if (sel) {
      if (remaining[sel] > 0) { nb[r][c] = sel; setPlaced(nb); }
      else if (placed[r][c] === sel) { nb[r][c] = null; setPlaced(nb); }
    } else {
      if (placed[r][c]) setSel(placed[r][c]);
    }
  }

  function removeCell(e, r, c) {
    e.preventDefault();
    if (r < 6 || isLake(r, c)) return;
    const nb = placed.map(row => [...row]);
    nb[r][c] = null; setPlaced(nb);
  }

  function autoArrange() {
    const pool = shuffle(createPool());
    const nb = Array.from({length:10}, () => Array(10).fill(null));
    let i = 0;
    for (let r = 6; r < 10; r++)
      for (let c = 0; c < 10; c++)
        if (!isLake(r, c) && i < pool.length) nb[r][c] = pool[i++];
    setPlaced(nb);
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

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:18 }}>
      <p style={{ color:T.brass, fontFamily:"'Cinzel',serif", fontSize:13, letterSpacing:3, margin:0 }}>
        FASE DE DESPLIEGUE — Coloca tus 40 piezas en las filas inferiores
      </p>

      {/* Bandeja de piezas */}
      <div style={{
        display:"flex", flexWrap:"wrap", gap:6, justifyContent:"center",
        maxWidth:680, padding:"11px 14px",
        background:T.panelBg, borderRadius:12,
        border:`1px solid ${T.panelBorder}`,
      }}>
        {PIECE_NAMES.map(name => {
          const active = sel === name;
          const done = remaining[name] === 0;
          return (
            <button key={name} onClick={() => setSel(active ? null : name)} disabled={done}
              style={{
                display:"flex", alignItems:"center", gap:6,
                padding:"5px 10px", borderRadius:8,
                cursor: done ? "not-allowed" : "pointer",
                background: active ? T.mine.bg : done ? "rgba(0,0,0,0.25)" : "rgba(247,238,221,0.08)",
                border: active ? `2px solid ${T.brassBright}` : `1px solid ${T.panelBorder}`,
                color: active ? T.mine.ink : done ? T.textDim : T.text,
                fontFamily:"'Cinzel',serif", fontSize:11,
                opacity: done ? 0.45 : 1, transition:"all 0.12s",
              }}>
              <span style={{ color: done ? T.textDim : rankAccent(name), fontSize:13, fontWeight:700 }}>
                {PIECES[name].symbol}
              </span>
              {PIECES[name].label} <b>×{remaining[name]}</b>
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
              const zone = r >= 6;
              const canPlace = zone && !lake && sel && remaining[sel] > 0;
              return (
                <div key={`${r}-${c}`}
                  onClick={() => clickCell(r, c)}
                  onContextMenu={e => removeCell(e, r, c)}
                  style={{
                    width:CELL, height:CELL, borderRadius:4,
                    background: lake ? T.lake : squareBg(r, c),
                    boxShadow: lake ? "none" : `inset 0 0 0 1px ${T.squareEdge}`,
                    position:"relative",
                    cursor: zone && !lake ? "pointer" : "default",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    userSelect:"none",
                  }}>
                  {!lake && (
                    <div style={{
                      position:"absolute", inset:0, borderRadius:4,
                      background: zone ? T.zoneMine : T.zoneTheirs,
                    }}/>
                  )}
                  {canPlace && !p && (
                    <div style={{
                      position:"absolute", inset:3, borderRadius:4,
                      border:`1px dashed ${T.brassSoft}`,
                    }}/>
                  )}
                  {lake && <Lake />}
                  {p && <PieceTile name={p} owner="mine" />}
                  {!zone && !lake && (
                    <span style={{
                      position:"relative", fontSize:9, letterSpacing:1,
                      color:"rgba(255,255,255,0.3)", fontFamily:"'Cinzel',serif",
                    }}>IA</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div style={{ display:"flex", gap:12 }}>
        <button onClick={autoArrange} style={{
          padding:"10px 22px", background:"rgba(247,238,221,0.08)",
          border:`1px solid ${T.brassSoft}`, borderRadius:9,
          color:T.brass, fontFamily:"'Cinzel',serif", fontSize:12,
          cursor:"pointer", letterSpacing:1,
        }}>Despliegue Automático</button>
        <button onClick={startGame} disabled={!allPlaced} style={{
          padding:"10px 26px",
          background: allPlaced ? `linear-gradient(160deg, ${T.brassBright}, ${T.brass})` : "rgba(0,0,0,0.25)",
          border:"none", borderRadius:9,
          color: allPlaced ? "#3B2A18" : T.textDim,
          fontFamily:"'Cinzel',serif", fontSize:12, fontWeight:700,
          cursor: allPlaced ? "pointer" : "not-allowed", letterSpacing:1,
          boxShadow: allPlaced ? `0 4px 14px ${T.brassSoft}` : "none",
        }}>¡Comenzar Batalla!</button>
      </div>
      {!allPlaced && (
        <p style={{ color:T.textSoft, fontSize:11, fontFamily:"'Cinzel',serif", margin:0 }}>
          Faltan {PIECE_NAMES.reduce((s,n) => s + remaining[n], 0)} piezas por colocar
        </p>
      )}
    </div>
  );
}

// ─── BATTLE POPUP ─────────────────────────────────────────────────────────────
function BattlePopup({ battle, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, [onDone]);
  if (!battle) return null;
  const { attacker, defender, result } = battle;
  const txt = result === "attacker" ? "¡ATACANTE GANA!" : result === "defender" ? "¡DEFENSOR GANA!" : "¡EMPATE!";
  const col = result === "attacker" ? T.youText : result === "defender" ? T.themText : T.brassBright;
  return (
    <div style={{
      position:"fixed", inset:0, zIndex:200,
      display:"flex", alignItems:"center", justifyContent:"center",
      background:"rgba(30,15,5,0.78)", backdropFilter:"blur(6px)",
      animation:"fadeIn 0.2s ease",
    }}>
      <div style={{
        background:T.frameBg,
        border:`2px solid ${T.brassSoft}`, borderRadius:18,
        padding:"30px 48px", textAlign:"center",
        boxShadow:"0 20px 60px rgba(0,0,0,0.55)",
        animation:"popIn 0.3s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        <div style={{ fontFamily:"'Cinzel',serif", color:T.brass, fontSize:11, letterSpacing:5, marginBottom:18 }}>
          ⚔ COMBATE ⚔
        </div>
        <div style={{ display:"flex", gap:36, alignItems:"center", marginBottom:22 }}>
          {[{p:attacker,label:"ATACANTE"}, null, {p:defender,label:"DEFENSOR"}].map((item,i) =>
            item === null ? (
              <div key={i} style={{ fontSize:20, color:T.brass, fontFamily:"'Cinzel',serif" }}>VS</div>
            ) : (
              <div key={i} style={{ textAlign:"center" }}>
                <div style={{ width:66, height:66, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <PieceTile name={item.p.name} owner={item.p.player==="human" ? "mine" : "theirs"} scale={1.6} />
                </div>
                <div style={{ color:T.text, fontSize:11, fontFamily:"'Cinzel',serif", marginTop:6 }}>
                  {PIECES[item.p.name].label}
                </div>
                <div style={{
                  fontSize:9, marginTop:3, letterSpacing:2, fontFamily:"'Cinzel',serif",
                  color: item.p.player==="human" ? T.youText : T.themText,
                }}>
                  {item.p.player==="human" ? "TÚ" : "IA"}
                </div>
                <div style={{ fontSize:9, color:T.textDim, marginTop:2 }}>{item.label}</div>
              </div>
            )
          )}
        </div>
        <div style={{
          fontFamily:"'Cinzel',serif", fontSize:17, fontWeight:700,
          color:col, letterSpacing:3, textShadow:`0 0 20px ${col}66`,
        }}>{txt}</div>
      </div>
    </div>
  );
}

// ─── AI MOVE ARROW OVERLAY ────────────────────────────────────────────────────
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

// ─── GAME BOARD ───────────────────────────────────────────────────────────────
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
    <div style={{ display:"flex", gap:22, alignItems:"flex-start" }}>
      {battle && <BattlePopup battle={battle} onDone={handleBattleDone} />}

      {gameOver && (
        <div style={{
          position:"fixed", inset:0, zIndex:300,
          display:"flex", alignItems:"center", justifyContent:"center",
          background:"rgba(30,15,5,0.86)", backdropFilter:"blur(8px)",
        }}>
          <div style={{
            textAlign:"center", fontFamily:"'Cinzel',serif",
            background:T.frameBg,
            border:`2px solid ${T.brassSoft}`, borderRadius:20, padding:"48px 64px",
            boxShadow:"0 24px 70px rgba(0,0,0,0.6)",
          }}>
            <div style={{ fontSize:60, marginBottom:14 }}>{gameOver==="human" ? "🏆" : "💀"}</div>
            <div style={{
              fontSize:30, letterSpacing:4, marginBottom:8,
              color: gameOver==="human" ? T.win : T.lose,
            }}>
              {gameOver==="human" ? "¡VICTORIA!" : "DERROTA"}
            </div>
            <div style={{ color:T.textSoft, fontSize:13, marginBottom:30 }}>
              {gameOver==="human" ? "Has capturado la bandera enemiga" : "Tu bandera ha caído"}
            </div>
            <button onClick={onReset} style={{
              padding:"11px 30px",
              background:`linear-gradient(160deg, ${T.brassBright}, ${T.brass})`,
              border:"none", borderRadius:10,
              color:"#3B2A18", fontFamily:"'Cinzel',serif", fontSize:14, fontWeight:700,
              cursor:"pointer", letterSpacing:2,
            }}>NUEVA PARTIDA</button>
          </div>
        </div>
      )}

      {/* Tablero */}
      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-start" }}>
        <div style={{ height:34, display:"flex", alignItems:"center", justifyContent:"center", width:"100%", marginBottom:4 }}>
          {(aiThinking || aiMoveAnim) && (
            <div style={{
              padding:"5px 20px", borderRadius:20,
              background:T.themBg,
              border:`1px solid ${T.themBorder}`,
              color:T.text, fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:2,
              boxShadow:"0 4px 14px rgba(0,0,0,0.35)",
              animation:"pulseRed 0.55s ease infinite alternate",
            }}>
              {aiThinking ? "🤖 La IA está pensando…" : "🤖 La IA se mueve →"}
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
                        <div style={{ width:15, height:15, borderRadius:"50%", background:T.moveDot }}/>
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

          <div style={{ display:"flex", gap:GAP, marginTop:4 }}>
            {Array.from({length:10},(_,i) => (
              <div key={i} style={{ width:CELL, textAlign:"center", fontSize:9, color:T.textDim, fontFamily:"'Cinzel',serif" }}>
                {String.fromCharCode(65+i)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Panel lateral */}
      <div style={{ display:"flex", flexDirection:"column", gap:14, width:190, marginTop:38 }}>
        <div style={{
          padding:"11px 14px", borderRadius:10, textAlign:"center",
          background: turn==="human" ? T.youBg : T.themBg,
          border:`1px solid ${turn==="human" ? T.youBorder : T.themBorder}`,
        }}>
          <div style={{ fontSize:9, color:T.textSoft, fontFamily:"'Cinzel',serif", letterSpacing:3, marginBottom:3 }}>TURNO</div>
          <div style={{ color: turn==="human" ? T.youText : T.themText, fontFamily:"'Cinzel',serif", fontSize:13, fontWeight:700 }}>
            {turn==="human" ? "⚔ Tu turno" : aiThinking ? "🤖 Pensando…" : aiMoveAnim ? "🤖 Moviéndose…" : "🤖 IA"}
          </div>
        </div>

        <div style={{ padding:12, borderRadius:10, background:T.panelBg, border:`1px solid ${T.panelBorder}` }}>
          <div style={{ fontSize:9, color:T.textSoft, fontFamily:"'Cinzel',serif", letterSpacing:3, marginBottom:8 }}>REGLAS</div>
          {[
            ["S","Spy","Mata al Marshal"],
            ["Ⅱ","Scout","Mueve múltiples casillas"],
            ["Ⅲ","Miner","Desactiva Bombas"],
            ["✸","Bomb","Inmóvil, mortal"],
            ["⚑","Flag","¡Captúrala para ganar!"],
          ].map(([sym,name,tip]) => (
            <div key={name} style={{ display:"flex", gap:8, marginBottom:6, alignItems:"center" }}>
              <div style={{ color:rankAccent(name), fontSize:14, width:18, flexShrink:0, fontWeight:700 }}>{sym}</div>
              <div style={{ color:T.textSoft, fontSize:9.5, lineHeight:1.3 }}>{tip}</div>
            </div>
          ))}
        </div>

        <div style={{ padding:12, borderRadius:10, background:T.panelBg, border:`1px solid ${T.panelBorder}`, flex:1 }}>
          <div style={{ fontSize:9, color:T.textSoft, fontFamily:"'Cinzel',serif", letterSpacing:3, marginBottom:8 }}>REGISTRO</div>
          {log.map((entry,i) => (
            <div key={i} style={{
              fontSize:10, color: i===0 ? T.brassBright : T.textDim,
              marginBottom:4, fontFamily:"monospace", lineHeight:1.35,
              borderLeft: i===0 ? `2px solid ${T.brassSoft}` : "none",
              paddingLeft: i===0 ? 6 : 0,
            }}>{entry}</div>
          ))}
        </div>

        <button onClick={onReset} style={{
          padding:8, background:"rgba(247,238,221,0.06)",
          border:`1px solid ${T.panelBorder}`, borderRadius:8,
          color:T.textSoft, fontFamily:"'Cinzel',serif",
          fontSize:10, cursor:"pointer", letterSpacing:1,
        }}>Reiniciar</button>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
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
      paddingTop:26, paddingBottom:48,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&display=swap');
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
          font-size: 46px;
          font-weight: 900;
          letter-spacing: 14px;
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

      <div style={{ textAlign:"center", marginBottom:24 }}>
        <div className="titulo-stratego">STRATEGO</div>
        <div style={{ color:T.brass, opacity:0.55, fontSize:10, letterSpacing:7, fontFamily:"'Cinzel',serif", marginTop:4 }}>
          EL JUEGO DE GUERRA CLÁSICO
        </div>
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
