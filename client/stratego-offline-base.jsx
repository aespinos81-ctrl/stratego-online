import { useState, useEffect, useCallback, useRef } from "react";

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

function rankColor(name) {
  if (!name) return "#888";
  if (name === "Flag")  return "#FFD700";
  if (name === "Bomb")  return "#FF4455";
  if (name === "Spy")   return "#CC55FF";
  const r = PIECES[name]?.rank ?? 0;
  if (r >= 9) return "#FF6B35";
  if (r >= 7) return "#FF9F40";
  if (r >= 5) return "#4ECDC4";
  if (r >= 3) return "#45B7D1";
  return "#88DDAA";
}

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
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:20 }}>
      <p style={{ color:"#C8A96E", fontFamily:"'Cinzel',serif", fontSize:13, letterSpacing:3, margin:0 }}>
        FASE DE DESPLIEGUE — Coloca tus 40 piezas en las filas inferiores
      </p>
      <div style={{
        display:"flex", flexWrap:"wrap", gap:6, justifyContent:"center",
        maxWidth:640, padding:"10px 14px",
        background:"rgba(0,0,0,0.45)", borderRadius:12,
        border:"1px solid rgba(200,169,110,0.15)"
      }}>
        {PIECE_NAMES.map(name => {
          const active = sel === name;
          const done = remaining[name] === 0;
          return (
            <button key={name} onClick={() => setSel(active ? null : name)} disabled={done}
              style={{
                padding:"5px 9px", borderRadius:7, cursor: done ? "not-allowed" : "pointer",
                background: active ? rankColor(name) : done ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.07)",
                border: active ? "2px solid #fff" : "1px solid rgba(255,255,255,0.12)",
                color: active ? "#0d0b07" : done ? "#333" : "#bbb",
                fontFamily:"'Cinzel',serif", fontSize:11, opacity: done ? 0.4 : 1,
                transition:"all 0.12s",
              }}>
              {PIECES[name].label} <b>×{remaining[name]}</b>
            </button>
          );
        })}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:`repeat(10,${CELL}px)`, gap:2 }}>
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
                  width:CELL, height:CELL, borderRadius:6,
                  background: lake ? "rgba(20,60,120,0.55)"
                    : p ? `${rankColor(p)}18`
                    : canPlace ? "rgba(200,169,110,0.07)"
                    : zone ? "rgba(30,70,50,0.25)"
                    : "rgba(100,20,20,0.15)",
                  border: lake ? "1px solid rgba(40,100,200,0.4)"
                    : p ? `1px solid ${rankColor(p)}55`
                    : canPlace ? "1px dashed rgba(200,169,110,0.35)"
                    : zone ? "1px solid rgba(40,100,60,0.2)"
                    : "1px solid rgba(120,20,20,0.15)",
                  cursor: zone && !lake ? "pointer" : "default",
                  display:"flex", flexDirection:"column",
                  alignItems:"center", justifyContent:"center",
                  userSelect:"none", transition:"background 0.1s",
                }}>
                {lake && <span style={{ fontSize:18, color:"rgba(80,140,255,0.35)" }}>〰</span>}
                {p && (
                  <>
                    <div style={{ fontSize:20, color:rankColor(p), lineHeight:1 }}>{PIECES[p].symbol}</div>
                    <div style={{ fontSize:8, color:rankColor(p), opacity:0.7, fontFamily:"'Cinzel',serif" }}>
                      {PIECES[p].label.slice(0,6)}
                    </div>
                  </>
                )}
                {!zone && !lake && (
                  <div style={{ fontSize:9, color:"rgba(180,50,50,0.25)", fontFamily:"'Cinzel',serif" }}>IA</div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div style={{ display:"flex", gap:12 }}>
        <button onClick={autoArrange} style={{
          padding:"9px 22px", background:"rgba(200,169,110,0.12)",
          border:"1px solid rgba(200,169,110,0.35)", borderRadius:8,
          color:"#C8A96E", fontFamily:"'Cinzel',serif", fontSize:12,
          cursor:"pointer", letterSpacing:1,
        }}>Despliegue Automático</button>
        <button onClick={startGame} disabled={!allPlaced} style={{
          padding:"9px 22px",
          background: allPlaced ? "#C8A96E" : "rgba(80,80,80,0.3)",
          border:"none", borderRadius:8,
          color: allPlaced ? "#0d0b07" : "#444",
          fontFamily:"'Cinzel',serif", fontSize:12, fontWeight:700,
          cursor: allPlaced ? "pointer" : "not-allowed", letterSpacing:1,
        }}>¡Comenzar Batalla!</button>
      </div>
      {!allPlaced && (
        <p style={{ color:"#664422", fontSize:11, fontFamily:"'Cinzel',serif", margin:0 }}>
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
  const col = result === "attacker" ? "#4ECDC4" : result === "defender" ? "#FF6B6B" : "#FFD700";
  return (
    <div style={{
      position:"fixed", inset:0, zIndex:200,
      display:"flex", alignItems:"center", justifyContent:"center",
      background:"rgba(0,0,0,0.8)", backdropFilter:"blur(6px)",
      animation:"fadeIn 0.2s ease",
    }}>
      <div style={{
        background:"linear-gradient(135deg,#1a1208,#2d1f08)",
        border:"2px solid rgba(200,169,110,0.5)", borderRadius:18,
        padding:"30px 48px", textAlign:"center",
        boxShadow:"0 0 60px rgba(200,169,110,0.15)",
        animation:"popIn 0.3s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        <div style={{ fontFamily:"'Cinzel',serif", color:"#C8A96E", fontSize:11, letterSpacing:5, marginBottom:18 }}>
          ⚔ COMBATE ⚔
        </div>
        <div style={{ display:"flex", gap:36, alignItems:"center", marginBottom:22 }}>
          {[{p:attacker,label:"ATACANTE"}, null, {p:defender,label:"DEFENSOR"}].map((item,i) =>
            item === null ? (
              <div key={i} style={{ fontSize:22, color:"#C8A96E" }}>VS</div>
            ) : (
              <div key={i} style={{ textAlign:"center" }}>
                <div style={{ fontSize:36, color:rankColor(item.p.name) }}>{PIECES[item.p.name].symbol}</div>
                <div style={{ color:"#aaa", fontSize:11, fontFamily:"'Cinzel',serif", marginTop:4 }}>{PIECES[item.p.name].label}</div>
                <div style={{ fontSize:9, marginTop:3, color: item.p.player==="human" ? "#4ECDC4" : "#FF6B6B", fontFamily:"'Cinzel',serif", letterSpacing:2 }}>
                  {item.p.player==="human" ? "TÚ" : "IA"}
                </div>
                <div style={{ fontSize:9, color:"#555", marginTop:2 }}>{item.label}</div>
              </div>
            )
          )}
        </div>
        <div style={{
          fontFamily:"'Cinzel',serif", fontSize:17, fontWeight:700,
          color:col, letterSpacing:3, textShadow:`0 0 20px ${col}88`,
        }}>{txt}</div>
      </div>
    </div>
  );
}

// ─── AI MOVE ARROW OVERLAY ────────────────────────────────────────────────────
function AiMoveArrow({ aiMoveAnim }) {
  if (!aiMoveAnim) return null;
  const { fr, fc, tr, tc } = aiMoveAnim;
  const gap = 2;
  const fromX = fc * (CELL + gap) + CELL / 2;
  const fromY = fr * (CELL + gap) + CELL / 2;
  const toX   = tc * (CELL + gap) + CELL / 2;
  const toY   = tr * (CELL + gap) + CELL / 2;
  const dx = toX - fromX, dy = toY - fromY;
  const len = Math.sqrt(dx*dx + dy*dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

  return (
    <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:10 }}>
      {/* From cell highlight */}
      <div style={{
        position:"absolute",
        left: fc*(CELL+gap), top: fr*(CELL+gap),
        width:CELL, height:CELL, borderRadius:6,
        background:"rgba(255,80,80,0.22)",
        border:"2px solid rgba(255,100,100,0.8)",
        boxShadow:"0 0 18px rgba(255,80,80,0.6)",
        animation:"pulseRed 0.45s ease infinite alternate",
      }}/>
      {/* To cell highlight */}
      <div style={{
        position:"absolute",
        left: tc*(CELL+gap), top: tr*(CELL+gap),
        width:CELL, height:CELL, borderRadius:6,
        background:"rgba(255,200,60,0.18)",
        border:"2px solid rgba(255,210,80,0.8)",
        boxShadow:"0 0 18px rgba(255,200,80,0.55)",
        animation:"pulseGold 0.45s ease infinite alternate",
      }}/>
      {/* Arrow shaft */}
      <div style={{
        position:"absolute",
        left:fromX, top:fromY - 1.5,
        width: len - 16, height:3,
        background:"linear-gradient(90deg,rgba(255,100,100,0.9),rgba(255,210,80,0.9))",
        borderRadius:2,
        transformOrigin:"0 50%",
        transform:`rotate(${angle}deg)`,
        boxShadow:"0 0 10px rgba(255,160,60,0.7)",
        animation:"slideIn 0.3s ease",
      }}/>
      {/* Arrowhead */}
      <div style={{
        position:"absolute",
        left: toX - 14, top: toY - 8,
        width:0, height:0,
        borderLeft:"16px solid rgba(255,210,80,0.95)",
        borderTop:"8px solid transparent",
        borderBottom:"8px solid transparent",
        transformOrigin:"0 50%",
        transform:`rotate(${angle}deg)`,
        filter:"drop-shadow(0 0 6px rgba(255,210,80,0.9))",
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

  const isSel    = (r,c) => selCell && selCell[0]===r && selCell[1]===c;
  const isValid  = (r,c) => validMoves.some(([mr,mc]) => mr===r && mc===c);
  const isAiFrom = (r,c) => aiMoveAnim && aiMoveAnim.fr===r && aiMoveAnim.fc===c;
  const isAiTo   = (r,c) => aiMoveAnim && aiMoveAnim.tr===r && aiMoveAnim.tc===c;

  return (
    <div style={{ display:"flex", gap:22, alignItems:"flex-start" }}>
      {battle && <BattlePopup battle={battle} onDone={handleBattleDone} />}

      {gameOver && (
        <div style={{
          position:"fixed", inset:0, zIndex:300,
          display:"flex", alignItems:"center", justifyContent:"center",
          background:"rgba(0,0,0,0.88)", backdropFilter:"blur(8px)",
        }}>
          <div style={{
            textAlign:"center", fontFamily:"'Cinzel',serif",
            background:"linear-gradient(135deg,#1a1208,#2d1f08)",
            border:"2px solid rgba(200,169,110,0.6)", borderRadius:20, padding:"48px 64px",
          }}>
            <div style={{ fontSize:60, marginBottom:14 }}>{gameOver==="human" ? "🏆" : "💀"}</div>
            <div style={{ fontSize:30, color:"#C8A96E", letterSpacing:4, marginBottom:8 }}>
              {gameOver==="human" ? "¡VICTORIA!" : "DERROTA"}
            </div>
            <div style={{ color:"#666", fontSize:13, marginBottom:30 }}>
              {gameOver==="human" ? "Has capturado la bandera enemiga" : "Tu bandera ha caído"}
            </div>
            <button onClick={onReset} style={{
              padding:"11px 30px", background:"#C8A96E", border:"none", borderRadius:10,
              color:"#0d0b07", fontFamily:"'Cinzel',serif", fontSize:14, fontWeight:700,
              cursor:"pointer", letterSpacing:2,
            }}>NUEVA PARTIDA</button>
          </div>
        </div>
      )}

      {/* Board container */}
      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-start" }}>
        {/* AI banner */}
        <div style={{ height:34, display:"flex", alignItems:"center", justifyContent:"center", width:"100%", marginBottom:4 }}>
          {(aiThinking || aiMoveAnim) && (
            <div style={{
              padding:"5px 20px", borderRadius:20,
              background:"rgba(200,50,50,0.85)",
              border:"1px solid rgba(255,100,100,0.5)",
              color:"#fff", fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:2,
              boxShadow:"0 0 18px rgba(200,50,50,0.5)",
              animation:"pulseRed 0.55s ease infinite alternate",
            }}>
              {aiThinking ? "🤖 La IA está pensando…" : "🤖 La IA se mueve →"}
            </div>
          )}
        </div>

        {/* Grid + arrow overlay */}
        <div style={{ position:"relative" }}>
          <AiMoveArrow aiMoveAnim={aiMoveAnim} />
          <div style={{ display:"grid", gridTemplateColumns:`repeat(10,${CELL}px)`, gap:2 }}>
            {board.map((row, r) =>
              row.map((piece, c) => {
                const lake      = isLake(r, c);
                const sel2      = isSel(r, c);
                const valid     = isValid(r, c);
                const aiFrom    = isAiFrom(r, c);
                const aiTo      = isAiTo(r, c);
                const isHuman   = piece?.player === "human";
                const isAi      = piece?.player === "ai";
                const showPiece = isHuman || (isAi && piece?.revealed);
                const attackable = valid && piece?.player === "ai";

                return (
                  <div key={`${r}-${c}`} onClick={() => clickCell(r, c)}
                    style={{
                      width:CELL, height:CELL, borderRadius:6,
                      background: lake        ? "linear-gradient(135deg,#0b2240,#163870)"
                        : sel2     ? `${rankColor(piece.name)}28`
                        : valid && !piece     ? "rgba(200,169,110,0.10)"
                        : attackable         ? "rgba(255,80,80,0.13)"
                        : aiFrom             ? "rgba(255,80,80,0.06)"
                        : aiTo               ? "rgba(255,200,60,0.08)"
                        : isHuman            ? "rgba(20,70,50,0.45)"
                        : isAi               ? "rgba(80,15,15,0.45)"
                        : "rgba(255,255,255,0.025)",
                      border: lake        ? "1px solid #1a4a80"
                        : sel2   ? `2px solid ${rankColor(piece.name)}`
                        : valid && !piece  ? "1px dashed rgba(200,169,110,0.4)"
                        : attackable       ? "1px solid rgba(255,80,80,0.5)"
                        : showPiece        ? `1px solid ${rankColor(piece.name)}44`
                        : isAi             ? "1px solid rgba(180,40,40,0.2)"
                        : "1px solid rgba(255,255,255,0.04)",
                      cursor: (isHuman && turn==="human" && !aiThinking && !aiMoveAnim) || valid ? "pointer" : "default",
                      display:"flex", flexDirection:"column",
                      alignItems:"center", justifyContent:"center",
                      transition:"background 0.12s",
                      boxShadow: sel2 ? `0 0 18px ${rankColor(piece.name)}77` : "none",
                      userSelect:"none",
                    }}>

                    {valid && !piece && (
                      <div style={{
                        width:10, height:10, borderRadius:"50%",
                        background:"rgba(200,169,110,0.55)",
                        boxShadow:"0 0 8px rgba(200,169,110,0.4)",
                      }}/>
                    )}
                    {lake && <span style={{ fontSize:18, color:"rgba(80,140,255,0.35)" }}>〰</span>}
                    {showPiece && (
                      <>
                        <div style={{ fontSize:21, color:rankColor(piece.name), lineHeight:1 }}>
                          {PIECES[piece.name].symbol}
                        </div>
                        <div style={{ fontSize:8, color:rankColor(piece.name), opacity:0.75, fontFamily:"'Cinzel',serif", marginTop:1 }}>
                          {PIECES[piece.name].label.slice(0,6)}
                        </div>
                      </>
                    )}
                    {isAi && !piece.revealed && !lake && (
                      <div style={{
                        width:"74%", height:"74%", borderRadius:5,
                        background:"repeating-linear-gradient(45deg,rgba(160,30,30,0.12) 0px,rgba(160,30,30,0.12) 4px,transparent 4px,transparent 9px)",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        border:"1px solid rgba(180,40,40,0.18)",
                      }}>
                        <span style={{ fontSize:15, opacity:0.4 }}>🔴</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div style={{ display:"flex", gap:2, marginTop:3 }}>
          {Array.from({length:10},(_,i) => (
            <div key={i} style={{ width:CELL, textAlign:"center", fontSize:9, color:"rgba(200,169,110,0.25)", fontFamily:"'Cinzel',serif" }}>
              {String.fromCharCode(65+i)}
            </div>
          ))}
        </div>
      </div>

      {/* Sidebar */}
      <div style={{ display:"flex", flexDirection:"column", gap:14, width:182, marginTop:38 }}>
        <div style={{
          padding:"11px 14px", borderRadius:10, textAlign:"center",
          background: turn==="human" ? "rgba(20,80,60,0.35)" : "rgba(120,20,20,0.35)",
          border:`1px solid ${turn==="human" ? "rgba(78,205,196,0.3)" : "rgba(255,107,107,0.3)"}`,
        }}>
          <div style={{ fontSize:9, color:"#666", fontFamily:"'Cinzel',serif", letterSpacing:3, marginBottom:3 }}>TURNO</div>
          <div style={{ color: turn==="human" ? "#4ECDC4" : "#FF6B6B", fontFamily:"'Cinzel',serif", fontSize:13, fontWeight:700 }}>
            {turn==="human" ? "⚔ Tu turno" : aiThinking ? "🤖 Pensando…" : aiMoveAnim ? "🤖 Moviéndose…" : "🤖 IA"}
          </div>
        </div>

        <div style={{ padding:"11px", borderRadius:10, background:"rgba(0,0,0,0.35)", border:"1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ fontSize:9, color:"#555", fontFamily:"'Cinzel',serif", letterSpacing:3, marginBottom:7 }}>REGLAS</div>
          {[
            ["S","Spy","Mata al Marshal"],
            ["Ⅱ","Scout","Mueve múltiples casillas"],
            ["Ⅲ","Miner","Desactiva Bombas"],
            ["✸","Bomb","Inmóvil, mortal"],
            ["⚑","Flag","¡Captúrala para ganar!"],
          ].map(([sym,name,tip]) => (
            <div key={name} style={{ display:"flex", gap:7, marginBottom:5, alignItems:"center" }}>
              <div style={{ color:rankColor(name), fontSize:14, width:18, flexShrink:0 }}>{sym}</div>
              <div style={{ color:"#444", fontSize:9, lineHeight:1.3 }}>{tip}</div>
            </div>
          ))}
        </div>

        <div style={{ padding:"11px", borderRadius:10, background:"rgba(0,0,0,0.35)", border:"1px solid rgba(255,255,255,0.05)", flex:1 }}>
          <div style={{ fontSize:9, color:"#555", fontFamily:"'Cinzel',serif", letterSpacing:3, marginBottom:7 }}>REGISTRO</div>
          {log.map((entry,i) => (
            <div key={i} style={{
              fontSize:10, color: i===0 ? "#C8A96E" : "#3a3020",
              marginBottom:4, fontFamily:"monospace", lineHeight:1.3,
              borderLeft: i===0 ? "2px solid rgba(200,169,110,0.4)" : "none",
              paddingLeft: i===0 ? 5 : 0,
            }}>{entry}</div>
          ))}
        </div>

        <button onClick={onReset} style={{
          padding:"7px", background:"rgba(200,169,110,0.07)",
          border:"1px solid rgba(200,169,110,0.18)", borderRadius:8,
          color:"rgba(200,169,110,0.45)", fontFamily:"'Cinzel',serif",
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
      minHeight:"100vh", background:"#0d0b07",
      backgroundImage:`
        radial-gradient(ellipse at 15% 15%, rgba(60,40,10,0.5) 0%, transparent 55%),
        radial-gradient(ellipse at 85% 85%, rgba(40,15,5,0.5) 0%, transparent 55%),
        repeating-linear-gradient(0deg, transparent, transparent 58px, rgba(255,255,255,0.008) 58px, rgba(255,255,255,0.008) 59px),
        repeating-linear-gradient(90deg,transparent, transparent 58px, rgba(255,255,255,0.008) 58px, rgba(255,255,255,0.008) 59px)
      `,
      display:"flex", flexDirection:"column", alignItems:"center",
      paddingTop:28, paddingBottom:48,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes popIn    { from{transform:scale(0.5);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes pulseRed { from{opacity:0.65} to{opacity:1} }
        @keyframes pulseGold{ from{opacity:0.55} to{opacity:1} }
        @keyframes slideIn  { from{opacity:0;transform-origin:0 50%;transform:scaleX(0) rotate(var(--a,0deg))} to{opacity:1} }
      `}</style>

      <div style={{ textAlign:"center", marginBottom:28 }}>
        <div style={{
          fontSize:46, fontWeight:900, letterSpacing:14, fontFamily:"'Cinzel',serif",
          background:"linear-gradient(135deg,#C8A96E 0%,#F0D080 40%,#C8A96E 65%,#8B6914 100%)",
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
          filter:"drop-shadow(0 0 28px rgba(200,169,110,0.3))",
        }}>STRATEGO</div>
        <div style={{ color:"rgba(200,169,110,0.3)", fontSize:10, letterSpacing:7, fontFamily:"'Cinzel',serif", marginTop:4 }}>
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
