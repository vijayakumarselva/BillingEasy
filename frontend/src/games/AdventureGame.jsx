/**
 * 🎮 "Our Adventure" — It-Takes-Two style asymmetric co-op
 * 3 levels: The Code · The Balance · The Maze
 * Neither player can finish without the other.
 */
import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import {
  playYourTurn, playWin, playChip, playRaise, playCardFlip,
  playGroupForm, playInvalid, playDeclareStab,
  isMuted, toggleMute,
} from "./sounds";

const _BASE = (process.env.REACT_APP_BACKEND_URL || "https://billingeasy-backend-production.up.railway.app").replace(/\/$/, "");
const API   = _BASE.endsWith("/api") ? _BASE : `${_BASE}/api`;
const ROOM  = "sv2026";

const SYMBOLS = ["🔴","🔵","🟡","🟢","🟣","🟠","⭐","💎"];
const PLAYER_INFO = {
  Subhi: { color:"#f472b6", glow:"rgba(244,114,182,0.6)" },
  Viju:  { color:"#60a5fa", glow:"rgba(96,165,250,0.6)"  },
};

// ── API helpers ──────────────────────────────────────────────────────────────
const aget  = (path) => fetch(`${API}${path}`).then(r=>r.json());
const apost = (path) => fetch(`${API}${path}`,{method:"POST"}).then(r=>r.json());
const achat = (room,player,msg) =>
  fetch(`${API}/adventure/${room}/chat?player=${encodeURIComponent(player)}&msg=${encodeURIComponent(msg)}`,{method:"POST"}).catch(()=>{});

// ── Global CSS ───────────────────────────────────────────────────────────────
const CSS = `
@keyframes advFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
@keyframes advPop   { 0%{transform:scale(0.7);opacity:0} 60%{transform:scale(1.12)} 100%{transform:scale(1);opacity:1} }
@keyframes advShake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-5px)} 80%{transform:translateX(5px)} }
@keyframes advSlide { 0%{transform:translateY(12px);opacity:0} 100%{transform:none;opacity:1} }
@keyframes advWin   { 0%{transform:scale(0) rotate(-15deg);opacity:0} 55%{transform:scale(1.2) rotate(3deg)} 100%{transform:scale(1) rotate(0);opacity:1} }
@keyframes confDrop { 0%{transform:translateY(-10px) rotate(0);opacity:1} 100%{transform:translateY(100vh) rotate(540deg);opacity:0} }
@keyframes balanceBob { 0%,100%{transform:scaleX(1)} 50%{transform:scaleX(1.04)} }
@keyframes mazeGlow { 0%,100%{box-shadow:0 0 8px #f472b6} 50%{box-shadow:0 0 22px #f472b6, 0 0 40px #c026d3} }
`;

function useGlobalCss(css) {
  useEffect(()=>{
    const el=document.createElement("style"); el.textContent=css;
    document.head.appendChild(el); return ()=>el.remove();
  },[]);
}

// ── Confetti win ─────────────────────────────────────────────────────────────
function Confetti() {
  const pieces = Array.from({length:30},(_,i)=>({
    id:i, emoji:["🎉","✨","💫","🌟","🎊","💥","💕","🏆","🥰"][i%9],
    left:`${Math.random()*100}%`, size:18+Math.floor(Math.random()*16),
    delay:`${Math.random()*1.5}s`, dur:`${2+Math.random()*2}s`,
  }));
  return (
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:999,overflow:"hidden"}}>
      {pieces.map(p=>(
        <div key={p.id} style={{position:"absolute",top:"-20px",left:p.left,
          fontSize:p.size,animation:`confDrop ${p.dur} ${p.delay} forwards ease-in`}}>{p.emoji}</div>
      ))}
      <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
        textAlign:"center",animation:"advWin 0.6s ease forwards"}}>
        <div style={{fontSize:64}}>🏆</div>
        <div style={{fontSize:28,fontWeight:800,color:"#fbbf24",textShadow:"0 0 20px #f59e0b"}}>
          YOU DID IT! 🎊
        </div>
        <div style={{fontSize:16,color:"#a78bfa",marginTop:8}}>Together, always 💕</div>
      </div>
    </div>
  );
}

// ── Chat ─────────────────────────────────────────────────────────────────────
const QUICK = ["👍","❤️","😂","🔥","💡","🤔","😤","👏","✅","❓"];

function ChatBox({ chat, me, onSend }) {
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(true);
  const endRef = useRef(null);
  useLayoutEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); },[chat]);

  const send = (t) => { const m=(t||msg).trim(); if(!m) return; onSend(m); setMsg(""); };
  return (
    <div style={{...ch.box,height:open?200:36,overflow:"hidden",transition:"height 0.25s"}}>
      <div onClick={()=>setOpen(o=>!o)} style={ch.header}>
        💬 Chat {open?"▾":"▸"}
      </div>
      {open && <>
        <div style={ch.msgs}>
          {chat.map((c,i)=>(
            <div key={i} style={{...ch.msg,animation:"advSlide 0.2s ease"}}>
              <span style={{color:PLAYER_INFO[c.player]?.color||"#aaa",fontWeight:700}}>{c.player}: </span>
              <span style={{color:"#e2e8f0"}}>{c.msg}</span>
            </div>
          ))}
          <div ref={endRef}/>
        </div>
        <div style={ch.row}>
          {QUICK.map(q=>(
            <button key={q} onClick={()=>send(q)} style={ch.emoji}>{q}</button>
          ))}
        </div>
        <div style={ch.inputRow}>
          <input value={msg} onChange={e=>setMsg(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Type…" style={ch.input}/>
          <button onClick={()=>send()} style={ch.send}>Send</button>
        </div>
      </>}
    </div>
  );
}

const ch = {
  box:{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",
    borderRadius:14,overflow:"hidden",marginTop:8},
  header:{padding:"8px 14px",fontWeight:700,fontSize:13,color:"#a78bfa",cursor:"pointer",
    borderBottom:"1px solid rgba(255,255,255,0.1)"},
  msgs:{height:80,overflowY:"auto",padding:"8px 12px",display:"flex",flexDirection:"column",gap:4},
  msg:{fontSize:12,lineHeight:1.4},
  row:{display:"flex",gap:4,padding:"4px 10px",flexWrap:"wrap"},
  emoji:{background:"none",border:"none",cursor:"pointer",fontSize:16,padding:2},
  inputRow:{display:"flex",gap:6,padding:"4px 10px 8px"},
  input:{flex:1,background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.2)",
    borderRadius:8,padding:"5px 10px",color:"#fff",fontSize:13,outline:"none",fontFamily:"inherit"},
  send:{background:"#7c3aed",border:"none",borderRadius:8,padding:"5px 12px",
    color:"#fff",fontWeight:600,cursor:"pointer",fontSize:13,fontFamily:"inherit"},
};

// ── Level 1: The Code ────────────────────────────────────────────────────────
function LevelCode({ game, me, room, onRefresh }) {
  const [shake, setShake] = useState(false);
  const isRevealer = game.role === "revealer"; // Subhi
  const isActor    = game.role === "actor";    // Viju

  const press = async (sym) => {
    if (!isActor) return;
    const res = await apost(`/adventure/${room}/code_press?player=${me}&symbol=${encodeURIComponent(sym)}`);
    if (res.wrong) { setShake(true); playInvalid(); setTimeout(()=>setShake(false),500); }
    else playChip();
    onRefresh();
  };

  const retry = async () => { await apost(`/adventure/${room}/code_reset`); playCardFlip(); onRefresh(); };

  if (game.code_done) return (
    <div style={{textAlign:"center",padding:20}}>
      <div style={{fontSize:56,animation:"advPop 0.5s ease"}}>✅</div>
      <div style={{fontSize:20,fontWeight:700,color:"#4ade80",marginTop:8}}>Level 1 Complete!</div>
      <div style={{color:"#a78bfa",marginTop:4}}>You cracked the code together 🔓</div>
    </div>
  );

  if (game.code_failed) return (
    <div style={{textAlign:"center",padding:20}}>
      <div style={{fontSize:56}}>💀</div>
      <div style={{fontSize:18,fontWeight:700,color:"#ef4444",marginTop:8}}>3 fails — code locked!</div>
      <button onClick={retry} style={lv.btn}>🔄 Reset Code</button>
    </div>
  );

  return (
    <div style={{padding:16}}>
      <h3 style={{textAlign:"center",color:"#fbbf24",fontSize:18,margin:"0 0 4px"}}>🔐 Level 1 — The Code</h3>
      <p style={{textAlign:"center",color:"#94a3b8",fontSize:12,margin:"0 0 16px"}}>
        Attempts left: {3-game.code_attempts}/3
      </p>

      {isRevealer ? (
        <div style={{textAlign:"center"}}>
          <div style={{color:"#f472b6",fontWeight:700,marginBottom:12,fontSize:14}}>
            👩‍🦱 Subhi — you see the secret sequence. Describe it to Viju!
          </div>
          <div style={{display:"flex",gap:12,justifyContent:"center",marginBottom:16}}>
            {game.code_seq?.map((s,i)=>(
              <div key={i} style={{...lv.seqCard,animationDelay:`${i*0.1}s`,animation:"advPop 0.4s ease forwards"}}>
                <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>#{i+1}</div>
                <div style={{fontSize:32}}>{s}</div>
              </div>
            ))}
          </div>
          <div style={{color:"#94a3b8",fontSize:13,background:"rgba(255,255,255,0.05)",
            borderRadius:12,padding:"10px 16px",marginBottom:8}}>
            Viju's progress: {game.code_input?.map((s,i)=><span key={i}>{s} </span>)||"none yet"}
          </div>
          <div style={{color:"#fbbf24",fontSize:12}}>💡 Describe the symbols — don't show your screen!</div>
        </div>
      ) : (
        <div style={{textAlign:"center"}}>
          <div style={{color:"#60a5fa",fontWeight:700,marginBottom:12,fontSize:14}}>
            👨‍🦱 Viju — press the symbols in order Subhi describes!
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap",marginBottom:16,
            animation:shake?"advShake 0.4s ease":"none"}}>
            {SYMBOLS.map(s=>(
              <button key={s} onClick={()=>press(s)} style={lv.symBtn}>{s}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:8}}>
            {[0,1,2,3].map(i=>(
              <div key={i} style={{...lv.slot, background: game.code_input?.[i]?"rgba(96,165,250,0.3)":"rgba(255,255,255,0.06)"}}>
                {game.code_input?.[i]||"_"}
              </div>
            ))}
          </div>
          <div style={{color:"#94a3b8",fontSize:12}}>Listen to Subhi — she sees the answer!</div>
        </div>
      )}
    </div>
  );
}

// ── Level 2: The Balance ──────────────────────────────────────────────────────
function LevelBalance({ game, me, room, onRefresh }) {
  const isLeft  = me === "Subhi"; // Subhi pushes left
  const isRight = me === "Viju";
  const pos     = game.balance_pos ?? 0;
  const hold    = game.balance_hold ?? 0;

  const push = async () => {
    const dir = isLeft ? "left" : "right";
    await apost(`/adventure/${room}/balance_push?player=${me}&direction=${dir}`);
    playChip();
    onRefresh();
  };

  if (game.balance_done) return (
    <div style={{textAlign:"center",padding:20}}>
      <div style={{fontSize:56,animation:"advPop 0.5s ease"}}>✅</div>
      <div style={{fontSize:20,fontWeight:700,color:"#4ade80",marginTop:8}}>Level 2 Complete!</div>
      <div style={{color:"#a78bfa",marginTop:4}}>Perfect balance — just like you two 💕</div>
    </div>
  );

  const pct = ((pos+1)/2)*100; // 0-100%
  const inZone = Math.abs(pos) < 0.15;

  return (
    <div style={{padding:16}}>
      <h3 style={{textAlign:"center",color:"#a78bfa",fontSize:18,margin:"0 0 4px"}}>⚖️ Level 2 — The Balance</h3>
      <p style={{textAlign:"center",color:"#94a3b8",fontSize:12,margin:"0 0 16px"}}>
        Keep it centred for 3 seconds together!
      </p>

      {/* Balance bar */}
      <div style={{position:"relative",height:48,borderRadius:24,
        background:"rgba(255,255,255,0.08)",margin:"0 8px 8px",overflow:"hidden",
        border:`2px solid ${inZone?"#4ade80":"rgba(255,255,255,0.15)"}`,
        boxShadow:inZone?"0 0 16px rgba(74,222,128,0.4)":"none",
        transition:"all 0.2s"}}>
        {/* Zone indicator */}
        <div style={{position:"absolute",left:"42.5%",width:"15%",height:"100%",
          background:"rgba(74,222,128,0.15)",borderLeft:"2px dashed rgba(74,222,128,0.5)",
          borderRight:"2px dashed rgba(74,222,128,0.5)"}}/>
        {/* Ball */}
        <div style={{position:"absolute",top:"50%",left:`calc(${pct}% - 16px)`,
          transform:"translateY(-50%)",width:32,height:32,borderRadius:"50%",
          background: inZone?"#4ade80":"#f59e0b",
          boxShadow:inZone?"0 0 12px #4ade80":"0 0 8px #f59e0b",
          transition:"left 0.15s ease, background 0.2s",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>⚽</div>
      </div>

      {/* Hold timer */}
      <div style={{textAlign:"center",marginBottom:12}}>
        {inZone ? (
          <div style={{color:"#4ade80",fontWeight:700,fontSize:14}}>
            ✅ Holding! {Math.floor(hold/10)}s / 3s
          </div>
        ) : (
          <div style={{color:"#94a3b8",fontSize:13}}>Get the ball to the green zone!</div>
        )}
      </div>

      {/* Progress bar */}
      {inZone && (
        <div style={{background:"rgba(255,255,255,0.08)",borderRadius:20,height:8,margin:"0 8px 12px",overflow:"hidden"}}>
          <div style={{height:"100%",borderRadius:20,background:"linear-gradient(90deg,#4ade80,#22c55e)",
            width:`${Math.min(100,(hold/30)*100)}%`,transition:"width 0.1s"}}/>
        </div>
      )}

      {/* Push button */}
      <div style={{textAlign:"center"}}>
        <div style={{color:"#94a3b8",fontSize:12,marginBottom:8}}>
          {isLeft ? "👩‍🦱 Subhi — you push LEFT ←" : "👨‍🦱 Viju — you push RIGHT →"}
        </div>
        <button
          onMouseDown={push} onTouchStart={(e)=>{e.preventDefault();push();}}
          style={{...lv.bigBtn, background:isLeft?"#f472b6":"#60a5fa",
            boxShadow:`0 4px 20px ${isLeft?"rgba(244,114,182,0.5)":"rgba(96,165,250,0.5)"}`}}>
          {isLeft ? "← Push Left" : "Push Right →"}
        </button>
        <div style={{color:"#94a3b8",fontSize:11,marginTop:8}}>
          Tap rapidly to move. Work together to balance!
        </div>
      </div>
    </div>
  );
}

// ── Level 3: The Maze ─────────────────────────────────────────────────────────
function LevelMaze({ game, me, room, onRefresh }) {
  const isNavigator = me === "Viju";   // Viju sees full map
  const isMover     = me === "Subhi";  // Subhi moves blindly
  const maze = game.maze || [];
  const px = game.maze_px ?? 1, py = game.maze_py ?? 1;

  const move = async (dir) => {
    await apost(`/adventure/${room}/maze_move?player=${me}&direction=${dir}`);
    playChip();
    onRefresh();
  };

  const handleKey = useCallback((e) => {
    if (!isMover) return;
    const map = {ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right",
      w:"up",s:"down",a:"left",d:"right"};
    if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
  },[isMover, game]);

  useEffect(()=>{
    window.addEventListener("keydown",handleKey);
    return ()=>window.removeEventListener("keydown",handleKey);
  },[handleKey]);

  if (game.maze_done) return (
    <div style={{textAlign:"center",padding:20}}>
      <div style={{fontSize:56,animation:"advPop 0.5s ease"}}>🏆</div>
      <div style={{fontSize:20,fontWeight:700,color:"#fbbf24",marginTop:8}}>Level 3 Complete!</div>
      <div style={{color:"#a78bfa",marginTop:4}}>You made it through together! 🥰</div>
    </div>
  );

  const cellSize = 36;
  const W=7,H=7;

  return (
    <div style={{padding:16}}>
      <h3 style={{textAlign:"center",color:"#34d399",fontSize:18,margin:"0 0 4px"}}>🗺️ Level 3 — The Maze</h3>
      <p style={{textAlign:"center",color:"#94a3b8",fontSize:12,margin:"0 0 12px"}}>
        {isNavigator ? "You see the map — guide Subhi to 🏁!" : "You're blind — listen to Viju!"}
      </p>

      {isNavigator ? (
        /* Navigator sees full map */
        <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${W},${cellSize}px)`,gap:1}}>
            {maze.map((row,y)=>row.map((cell,x)=>{
              const isPlayer=x===px&&y===py;
              const isGoal=x===W-2&&y===H-2;
              const isStart=x===1&&y===1;
              return (
                <div key={`${x}-${y}`} style={{
                  width:cellSize,height:cellSize,
                  background:isPlayer?"transparent":cell===1?"#1e293b":"#0f172a",
                  border:isPlayer?"none":cell===1?"none":"1px solid rgba(255,255,255,0.05)",
                  borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:cell===1?0:14,
                }}>
                  {isPlayer && <div style={{fontSize:20,animation:"mazeGlow 1.5s ease-in-out infinite"}}>👩‍🦱</div>}
                  {!isPlayer && isGoal && "🏁"}
                  {!isPlayer && isStart && !isPlayer && "🟢"}
                  {cell===1 && <div style={{width:"100%",height:"100%",background:"#334155",borderRadius:4}}/>}
                </div>
              );
            }))}
          </div>
        </div>
      ) : (
        /* Mover — sees only nearby area (fog of war) */
        <div style={{textAlign:"center",marginBottom:12}}>
          <div style={{display:"inline-grid",gridTemplateColumns:`repeat(3,${cellSize}px)`,gap:1,
            border:"2px solid rgba(244,114,182,0.3)",borderRadius:8,padding:4,
            background:"rgba(244,114,182,0.05)"}}>
            {[-1,0,1].map(dy=>
              [-1,0,1].map(dx=>{
                const nx=px+dx, ny=py+dy;
                const inBounds=nx>=0&&nx<W&&ny>=0&&ny<H;
                const cell=inBounds?maze[ny]?.[nx]:1;
                const isMe=dx===0&&dy===0;
                const isGoal=nx===W-2&&ny===H-2;
                return (
                  <div key={`${dx}-${dy}`} style={{
                    width:cellSize,height:cellSize,
                    background:isMe?"rgba(244,114,182,0.2)":cell===1?"#1e293b":"#0f172a",
                    borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:14, border:isMe?"2px solid #f472b6":"none",
                  }}>
                    {isMe?"👩‍🦱":isGoal?"🏁":cell===1?"🧱":""}
                  </div>
                );
              })
            )}
          </div>
          <div style={{color:"#f472b6",fontSize:12,marginTop:8,fontWeight:600}}>
            👩‍🦱 You see 1 cell around you. Viju guides you!
          </div>
        </div>
      )}

      {isMover && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,maxWidth:180,margin:"0 auto"}}>
          <div/><button onClick={()=>move("up")} style={lv.dirBtn}>↑</button><div/>
          <button onClick={()=>move("left")} style={lv.dirBtn}>←</button>
          <button onClick={()=>move("down")} style={lv.dirBtn}>↓</button>
          <button onClick={()=>move("right")} style={lv.dirBtn}>→</button>
        </div>
      )}
      {isNavigator && (
        <div style={{textAlign:"center",color:"#34d399",fontSize:12,
          background:"rgba(52,211,153,0.1)",borderRadius:10,padding:"8px 12px"}}>
          🗺️ Tell Subhi: up/down/left/right — she only sees 1 step around her!
        </div>
      )}
    </div>
  );
}

const lv = {
  btn:{background:"#7c3aed",border:"none",borderRadius:12,padding:"10px 24px",
    color:"#fff",fontWeight:700,cursor:"pointer",fontSize:15,marginTop:16,fontFamily:"inherit"},
  bigBtn:{border:"none",borderRadius:20,padding:"18px 40px",color:"#fff",
    fontWeight:800,cursor:"pointer",fontSize:20,fontFamily:"inherit",
    transition:"transform 0.1s",userSelect:"none",WebkitUserSelect:"none"},
  symBtn:{background:"rgba(255,255,255,0.08)",border:"2px solid rgba(255,255,255,0.15)",
    borderRadius:12,padding:"10px",fontSize:28,cursor:"pointer",transition:"transform 0.1s",
    fontFamily:"inherit"},
  seqCard:{background:"rgba(255,255,255,0.08)",border:"2px solid rgba(244,114,182,0.4)",
    borderRadius:14,padding:"10px 14px",textAlign:"center",minWidth:52,opacity:0},
  slot:{width:44,height:44,borderRadius:10,display:"flex",alignItems:"center",
    justifyContent:"center",fontSize:22,border:"2px solid rgba(255,255,255,0.2)"},
  dirBtn:{background:"rgba(255,255,255,0.12)",border:"2px solid rgba(255,255,255,0.2)",
    borderRadius:10,padding:"12px",color:"#fff",fontWeight:800,cursor:"pointer",fontSize:20,
    fontFamily:"inherit",transition:"all 0.1s"},
};

// ── Level progress bar ────────────────────────────────────────────────────────
function LevelBar({ current, completed }) {
  const levels = [
    { n:1, icon:"🔐", name:"The Code" },
    { n:2, icon:"⚖️", name:"Balance" },
    { n:3, icon:"🗺️", name:"The Maze" },
  ];
  return (
    <div style={{display:"flex",gap:4,justifyContent:"center",marginBottom:16}}>
      {levels.map((l,i)=>(
        <div key={l.n} style={{display:"flex",alignItems:"center",gap:4}}>
          <div style={{
            padding:"4px 10px",borderRadius:20,fontSize:12,fontWeight:700,
            background:completed.includes(l.n)?"rgba(74,222,128,0.2)":
              current===l.n?"rgba(167,139,250,0.25)":"rgba(255,255,255,0.06)",
            border:`1.5px solid ${completed.includes(l.n)?"#4ade80":current===l.n?"#a78bfa":"rgba(255,255,255,0.1)"}`,
            color:completed.includes(l.n)?"#4ade80":current===l.n?"#a78bfa":"#64748b",
          }}>
            {completed.includes(l.n)?"✅":l.icon} {l.name}
          </div>
          {i<2&&<div style={{color:"rgba(255,255,255,0.2)",fontSize:10}}>›</div>}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdventureGame({ onBack, playerName }) {
  useGlobalCss(CSS);

  const [me,       setMe]      = useState(null);
  const [game,     setGame]    = useState(null);
  const [conn,     setConn]    = useState([]);
  const [chat,     setChat]    = useState([]);
  const [err,      setErr]     = useState("");
  const [showWin,  setShowWin] = useState(false);
  const [muted,    setMuted]   = useState(isMuted());
  const pollRef    = useRef(null);
  const prevWon    = useRef(false);
  const prevLevel  = useRef(1);

  const fetchState = useCallback(async (player) => {
    try {
      const res = await aget(`/adventure/${ROOM}/state?player=${player}`);
      if (res.ok) {
        setGame(g => {
          if (res.won && !prevWon.current) { prevWon.current=true; playWin(); setShowWin(true); setTimeout(()=>setShowWin(false),6000); }
          if (res.level > (prevLevel.current||1)) { prevLevel.current=res.level; playRaise(); }
          return res;
        });
        setConn(res.connected||[]);
        if (res.chat) setChat(res.chat);
      }
    } catch {}
  },[]);

  useEffect(()=>{ if(playerName&&!me) join(playerName); },[playerName]);

  useEffect(()=>{
    if(!me) return;
    fetchState(me);
    pollRef.current=setInterval(()=>fetchState(me),1200);
    return ()=>clearInterval(pollRef.current);
  },[me,fetchState]);

  const join = async (player) => {
    setErr("");
    try {
      const res=await apost(`/adventure/${ROOM}/join?player=${player}`);
      if(res.ok) setMe(player);
      else setErr(res.msg||"Failed to join");
    } catch { setErr("Cannot reach server. Retry."); }
  };

  const sendChat = (text) => {
    const msg=text.trim(); if(!msg||!me) return;
    achat(ROOM,me,msg).then(()=>fetchState(me));
  };

  const resetGame = async () => {
    prevWon.current=false; prevLevel.current=1;
    await apost(`/adventure/${ROOM}/reset`);
    await fetchState(me);
  };

  const pInfo = PLAYER_INFO[me] || PLAYER_INFO.Viju;
  const other = me==="Subhi"?"Viju":"Subhi";

  // ── Loading / join screens ─────────────────────────────────────────────────
  if (!me) return (
    <div style={st.wrap}>
      <button onClick={onBack} style={st.back}>← Back</button>
      <div style={{textAlign:"center",marginTop:60,color:"#a78bfa"}}>Joining as {playerName}…</div>
      {err && <div style={{textAlign:"center",color:"#ef4444",marginTop:8}}>{err}<br/>
        <button onClick={()=>join(playerName)} style={lv.btn}>Retry</button></div>}
    </div>
  );

  if (!game) return (
    <div style={st.wrap}>
      <button onClick={onBack} style={st.back}>← Back</button>
      <div style={{textAlign:"center",marginTop:60,color:"#a78bfa"}}>Loading…</div>
    </div>
  );

  const waiting = conn.length < 2;

  // ── Main game ──────────────────────────────────────────────────────────────
  return (
    <div style={st.wrap}>
      {showWin && <Confetti/>}

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <button onClick={onBack} style={st.back}>← Leave</button>
        <h2 style={{flex:1,textAlign:"center",fontSize:15,fontWeight:700,margin:0,color:"#fff"}}>
          🎮 Our Adventure
        </h2>
        <button onClick={()=>{toggleMute();setMuted(m=>!m);}} style={st.muteBtn}>{muted?"🔇":"🔊"}</button>
      </div>

      {/* Players online */}
      <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:8}}>
        {["Subhi","Viju"].map(p=>(
          <div key={p} style={{
            padding:"3px 12px",borderRadius:20,fontSize:12,fontWeight:600,
            background:conn.includes(p)?"rgba(74,222,128,0.15)":"rgba(255,255,255,0.05)",
            border:`1.5px solid ${conn.includes(p)?"#4ade80":"rgba(255,255,255,0.1)"}`,
            color:conn.includes(p)?PLAYER_INFO[p].color:"#64748b",
          }}>
            {conn.includes(p)?"🟢":"⚫"} {p}
          </div>
        ))}
      </div>

      {waiting && (
        <div style={{textAlign:"center",color:"#fbbf24",fontSize:13,
          background:"rgba(251,191,36,0.1)",borderRadius:12,padding:"10px",marginBottom:8,
          animation:"advFloat 2s ease-in-out infinite"}}>
          ⏳ Waiting for {other} to join…
        </div>
      )}

      {/* Level progress */}
      <LevelBar current={game.level} completed={game.completed||[]}/>

      {/* Current level */}
      <div style={st.levelBox}>
        {game.won ? (
          <div style={{textAlign:"center",padding:24}}>
            <div style={{fontSize:56}}>🏆</div>
            <div style={{fontSize:22,fontWeight:800,color:"#fbbf24",marginTop:8}}>
              Adventure Complete!
            </div>
            <div style={{color:"#a78bfa",marginTop:6,fontSize:14}}>
              3 levels, together every step 💕
            </div>
            <button onClick={resetGame} style={{...lv.btn,background:"#7c3aed",marginTop:20}}>
              🔄 Play Again
            </button>
          </div>
        ) : game.level===1 ? (
          <LevelCode game={game} me={me} room={ROOM} onRefresh={()=>fetchState(me)}/>
        ) : game.level===2 ? (
          <LevelBalance game={game} me={me} room={ROOM} onRefresh={()=>fetchState(me)}/>
        ) : (
          <LevelMaze game={game} me={me} room={ROOM} onRefresh={()=>fetchState(me)}/>
        )}
      </div>

      {/* Chat */}
      <ChatBox chat={chat} me={me} onSend={sendChat}/>
    </div>
  );
}

const st = {
  wrap:{
    position:"fixed",inset:0,
    background:"linear-gradient(135deg,#0a0020 0%,#0d1b3e 50%,#0a0020 100%)",
    overflowY:"auto",padding:"16px 16px 40px",maxWidth:480,margin:"0 auto",
    fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    WebkitFontSmoothing:"antialiased",color:"#fff",
  },
  back:{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",
    borderRadius:10,padding:"6px 12px",color:"#fff",cursor:"pointer",fontSize:13,fontFamily:"inherit"},
  muteBtn:{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",
    borderRadius:8,padding:"4px 8px",cursor:"pointer",fontSize:16,color:"#fff",flexShrink:0},
  levelBox:{
    background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",
    borderRadius:20,overflow:"hidden",marginBottom:8,minHeight:200,
  },
};
