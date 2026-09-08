/**
 * 🃏 Multiplayer Texas Hold'em — Subhi & Viju  (animated edition)
 */
import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import {
  playCardDeal, playCardFlip, playChip, playRaise, playFold, playAllIn,
  playYourTurn, playWin, playLose, playDealHand,
  isMuted, toggleMute,
} from "./sounds";

const _BASE = (process.env.REACT_APP_BACKEND_URL || "https://billingeasy-backend-production.up.railway.app").replace(/\/$/, "");
const API   = _BASE.endsWith("/api") ? _BASE : `${_BASE}/api`;
const ROOM  = "sv2026";
const RED   = new Set(["H","D"]);
const SUIT_SYM = { S:"♠", H:"♥", D:"♦", C:"♣" };
const HAND_NAMES = ["High Card","One Pair","Two Pair","Three of a Kind","Straight","Flush","Full House","Four of a Kind","Straight Flush","Royal Flush"];
const PLAYER_INFO = {
  Subhi: { emoji:"👩‍🦱", color:"#f472b6", glow:"rgba(244,114,182,0.6)" },
  Viju:  { emoji:"👨‍🦱", color:"#60a5fa", glow:"rgba(96,165,250,0.6)" },
};
const QUICK_EMOJIS = ["😂","🔥","😤","🥹","👏","🤑","😈","🫡","💀","🙏","😎","🤣"];
const CONFETTI_EMOJIS = ["🎉","✨","💫","🌟","🎊","💥","🃏","💰","🏆","🎶"];
const WIN_MSGS = ["BOOM! 💥","WINNER! 🏆","TAKE IT! 💰","NICE ONE! 🔥","UNSTOPPABLE! 🚀"];

// ── Global CSS keyframes ──────────────────────────────────────────────────
const GLOBAL_CSS = `
@keyframes cardDeal {
  0%   { transform: translateY(-120px) rotate(-15deg) scale(0.5); opacity:0; }
  60%  { transform: translateY(8px)   rotate(2deg)  scale(1.05); opacity:1; }
  100% { transform: translateY(0)     rotate(0deg)  scale(1);    opacity:1; }
}
@keyframes cardFlip {
  0%   { transform: rotateY(90deg) scale(0.8); opacity:0; }
  50%  { transform: rotateY(45deg) scale(0.9); }
  100% { transform: rotateY(0deg)  scale(1);   opacity:1; }
}
@keyframes pulseGlow {
  0%,100% { box-shadow: 0 0 0px transparent; }
  50%      { box-shadow: 0 0 22px 6px var(--glow); }
}
@keyframes chipFly {
  0%   { transform: translateY(0)    scale(1);    opacity:1; }
  50%  { transform: translateY(-40px) scale(1.3); opacity:1; }
  100% { transform: translateY(0)    scale(1);    opacity:1; }
}
@keyframes foldAway {
  0%   { transform: rotate(0deg)  translateX(0)   opacity:1; }
  100% { transform: rotate(-30deg) translateX(-200px); opacity:0; }
}
@keyframes raiseShake {
  0%,100% { transform: translateX(0); }
  20%     { transform: translateX(-6px); }
  40%     { transform: translateX(6px); }
  60%     { transform: translateX(-4px); }
  80%     { transform: translateX(4px); }
}
@keyframes winBounce {
  0%   { transform: scale(0) rotate(-10deg); opacity:0; }
  50%  { transform: scale(1.2) rotate(3deg);  opacity:1; }
  70%  { transform: scale(0.95) rotate(-1deg); }
  100% { transform: scale(1) rotate(0deg);    opacity:1; }
}
@keyframes confettiFall {
  0%   { transform: translateY(-20px) rotate(0deg);   opacity:1; }
  100% { transform: translateY(100vh) rotate(720deg); opacity:0; }
}
@keyframes potPulse {
  0%,100% { transform: scale(1); }
  50%      { transform: scale(1.25); }
}
@keyframes msgSlide {
  0%   { transform: translateY(12px); opacity:0; }
  100% { transform: translateY(0);    opacity:1; }
}
@keyframes actionPop {
  0%   { transform: scale(0.8); opacity:0; }
  60%  { transform: scale(1.1); }
  100% { transform: scale(1);   opacity:1; }
}
@keyframes turnArrow {
  0%,100% { transform: translateX(0); }
  50%      { transform: translateX(6px); }
}
@keyframes float {
  0%,100% { transform: translateY(0); }
  50%      { transform: translateY(-6px); }
}
@keyframes spinIn {
  0%   { transform: rotate(-180deg) scale(0); opacity:0; }
  100% { transform: rotate(0deg)    scale(1); opacity:1; }
}
`;

// ── API helpers ─────────────────────────────────────────────────────────────
const pget  = (path) => fetch(`${API}${path}`).then(r=>r.json());
const ppost = (path) => fetch(`${API}${path}`,{method:"POST"}).then(r=>r.json());
const pchat = (room, player, msg) =>
  fetch(`${API}/poker/${room}/chat?player=${encodeURIComponent(player)}&msg=${encodeURIComponent(msg)}`,{method:"POST"}).catch(()=>{});

// ── Inject global CSS once ──────────────────────────────────────────────────
function useGlobalCss(css) {
  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = css;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);
}

// ── Confetti overlay ────────────────────────────────────────────────────────
function Confetti({ winner, me }) {
  const pieces = Array.from({length: 28}, (_, i) => ({
    id: i,
    emoji: CONFETTI_EMOJIS[i % CONFETTI_EMOJIS.length],
    left: `${Math.random()*100}%`,
    delay: `${Math.random()*1.5}s`,
    duration: `${2 + Math.random()*2}s`,
    size: 18 + Math.floor(Math.random()*20),
  }));
  return (
    <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:999, overflow:"hidden" }}>
      {pieces.map(p => (
        <div key={p.id} style={{
          position:"absolute", top:"-30px", left:p.left,
          fontSize:p.size, animation:`confettiFall ${p.duration} ${p.delay} forwards ease-in`,
        }}>{p.emoji}</div>
      ))}
      {/* Big winner banner */}
      <div style={{
        position:"absolute", top:"38%", left:"50%", transform:"translateX(-50%)",
        background: winner===me
          ? "linear-gradient(135deg,#f59e0b,#ef4444)"
          : "linear-gradient(135deg,#374151,#1f2937)",
        color:"#fff", borderRadius:20, padding:"20px 36px", textAlign:"center",
        animation:"winBounce 0.6s forwards",
        boxShadow:"0 8px 40px rgba(0,0,0,0.7)",
        minWidth:220,
      }}>
        <div style={{fontSize:48}}>{winner===me?"🏆":"😢"}</div>
        <div style={{fontSize:22,fontWeight:900,letterSpacing:1,marginTop:6}}>
          {winner===me ? WIN_MSGS[Math.floor(Math.random()*WIN_MSGS.length)] : `${winner} wins!`}
        </div>
      </div>
    </div>
  );
}

// ── Animated Card ───────────────────────────────────────────────────────────
function Card({ card, faceDown, small, animate, delay=0 }) {
  const w = small?40:54, h = small?58:78;
  const animStyle = animate
    ? { animation:`cardDeal 0.45s ${delay}s both cubic-bezier(.22,.68,0,1.2)` }
    : {};

  if (!card || faceDown) return (
    <div style={{
      width:w, height:h, borderRadius:8,
      background:"linear-gradient(135deg,#1e3a8a,#3730a3)",
      border:"2px solid rgba(255,255,255,0.25)",
      display:"flex", alignItems:"center", justifyContent:"center",
      boxShadow:"0 4px 12px rgba(0,0,0,0.6)",
      fontSize:small?18:26, ...animStyle,
    }}>🂠</div>
  );
  const red = RED.has(card.s);
  const sym = SUIT_SYM[card.s]||card.s;
  return (
    <div style={{
      width:w, height:h, borderRadius:8,
      background:"linear-gradient(160deg,#fff 70%,#f0f0f0)",
      display:"flex", flexDirection:"column", justifyContent:"space-between",
      padding:"3px 5px", boxSizing:"border-box",
      boxShadow:"0 4px 14px rgba(0,0,0,0.55)",
      color:red?"#dc2626":"#111", ...animStyle,
    }}>
      <div style={{fontSize:small?11:14,fontWeight:800,lineHeight:1}}>{card.r}<br/>{sym}</div>
      <div style={{fontSize:small?18:24,textAlign:"center",fontWeight:700}}>{sym}</div>
    </div>
  );
}

// ── Community card with flip ────────────────────────────────────────────────
function CommCard({ card, index, prevCount }) {
  const isNew = card && index >= prevCount;
  const style = isNew
    ? { animation:`cardFlip 0.5s ${index*0.12}s both ease-out` }
    : {};
  if (!card) return (
    <div style={{
      width:54, height:78, borderRadius:8,
      background:"rgba(255,255,255,0.05)",
      border:"2px dashed rgba(255,255,255,0.15)",
    }}/>
  );
  const red = RED.has(card.s);
  const sym = SUIT_SYM[card.s]||card.s;
  return (
    <div style={{
      width:54, height:78, borderRadius:8,
      background:"linear-gradient(160deg,#fff 70%,#f0f0f0)",
      display:"flex", flexDirection:"column", justifyContent:"space-between",
      padding:"3px 5px", boxSizing:"border-box",
      boxShadow:"0 4px 18px rgba(0,0,0,0.6)",
      color:red?"#dc2626":"#111", ...style,
    }}>
      <div style={{fontSize:14,fontWeight:800,lineHeight:1}}>{card.r}<br/>{sym}</div>
      <div style={{fontSize:24,textAlign:"center",fontWeight:700}}>{sym}</div>
    </div>
  );
}

// ── Floating action toast ───────────────────────────────────────────────────
function ActionToast({ action }) {
  if (!action) return null;
  const map = {
    fold:  { icon:"🏳️", label:"FOLD",  bg:"#ef4444" },
    check: { icon:"✓",  label:"CHECK", bg:"#3b82f6" },
    call:  { icon:"📞", label:"CALL",  bg:"#3b82f6" },
    raise: { icon:"📈", label:"RAISE", bg:"#8b5cf6" },
    allin: { icon:"🔥", label:"ALL IN",bg:"#f59e0b" },
  };
  const a = map[action] || { icon:"⚡",label:action.toUpperCase(),bg:"#64748b" };
  return (
    <div style={{
      position:"fixed", top:"50%", left:"50%",
      transform:"translate(-50%,-50%)",
      background:a.bg, color:"#fff",
      padding:"18px 36px", borderRadius:20, fontSize:26, fontWeight:900,
      zIndex:500, animation:"winBounce 0.4s forwards",
      boxShadow:`0 8px 40px ${a.bg}88`, letterSpacing:2,
      display:"flex", alignItems:"center", gap:12, pointerEvents:"none",
    }}>
      <span style={{fontSize:32}}>{a.icon}</span> {a.label}
    </div>
  );
}

// ── Opponent strip ──────────────────────────────────────────────────────────
function OpponentRow({ name, data, isActor }) {
  const info = PLAYER_INFO[name]||{};
  if (!data) return null;
  return (
    <div style={{
      ...st.row,
      "--glow": info.glow,
      borderColor: isActor ? info.color : "rgba(255,255,255,0.1)",
      animation: isActor ? "pulseGlow 1.8s infinite" : "none",
      transition:"border-color 0.4s",
    }}>
      <div style={st.rowLeft}>
        <span style={{fontSize:34, animation:"float 3s ease-in-out infinite"}}>{info.emoji}</span>
        <div>
          <div style={{fontWeight:700, color:isActor?info.color:"#e2e8f0", fontSize:15,
            display:"flex", alignItems:"center", gap:6}}>
            {name}
            {isActor && <span style={{animation:"turnArrow 0.7s ease-in-out infinite",display:"inline-block"}}>⟵</span>}
          </div>
          <div style={{color:"#a3e635",fontSize:13}}>💰 ₹{data.chips}</div>
          {data.folded && <div style={{color:"#ef4444",fontSize:12,fontWeight:700,
            animation:"actionPop 0.3s forwards"}}>FOLDED 🏳️</div>}
        </div>
      </div>
      <div style={st.cards}>
        {data.hole
          ? data.hole.map((c,i)=><Card key={i} card={c} animate />)
          : [0,1].map(i=><Card key={i} faceDown animate delay={i*0.1}/>)
        }
        <div style={{color:"#64748b",fontSize:12,textAlign:"center",marginTop:2}}>
          {data.hole?"Revealed! 👀":"Hidden 🙈"}
        </div>
      </div>
    </div>
  );
}

// ── My row ──────────────────────────────────────────────────────────────────
function MyRow({ name, data, isActor, showCards, onToggle }) {
  const info = PLAYER_INFO[name]||{};
  if (!data) return null;
  return (
    <div style={{
      ...st.row,
      "--glow": info.glow,
      borderColor: isActor ? info.color : "rgba(255,255,255,0.1)",
      background: isActor ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
      animation: isActor ? "pulseGlow 1.8s infinite" : "none",
      transition:"all 0.4s",
    }}>
      <div style={st.rowLeft}>
        <span style={{fontSize:34, animation:"float 2.5s ease-in-out infinite"}}>{info.emoji}</span>
        <div>
          <div style={{fontWeight:700, color:isActor?info.color:"#e2e8f0", fontSize:15,
            display:"flex", alignItems:"center", gap:6}}>
            {name} <span style={{color:"#64748b",fontWeight:400,fontSize:12}}>(You)</span>
            {isActor && (
              <span style={{background:info.color+"33", color:info.color,
                padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:700,
                animation:"actionPop 0.3s forwards"}}>
                YOUR TURN ⚡
              </span>
            )}
          </div>
          <div style={{color:"#a3e635",fontSize:13}}>💰 ₹{data.chips}</div>
          {data.folded && <div style={{color:"#ef4444",fontSize:12,fontWeight:700}}>FOLDED 🏳️</div>}
        </div>
      </div>
      <div style={st.cards}>
        {(data.hole||[]).map((c,i)=>(
          <Card key={i} card={c} faceDown={!showCards} animate delay={i*0.1}/>
        ))}
        {!data.folded && (
          <button onClick={onToggle} style={{
            ...st.peekBtn,
            background: showCards ? info.color+"33" : "rgba(255,255,255,0.1)",
            borderColor: showCards ? info.color : "rgba(255,255,255,0.2)",
            color: showCards ? info.color : "#fff",
            transition:"all 0.2s",
          }}>
            {showCards?"🙈 Hide":"👁️ Peek"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Animated action button ──────────────────────────────────────────────────
function Btn({ onClick, color, label, disabled, big }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onPointerDown={() => !disabled && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onClick={disabled ? undefined : onClick}
      style={{
        padding: big?"14px 28px":"10px 16px",
        borderRadius:12, border:"none",
        background: disabled ? "#374151" : color,
        color:"#fff", fontWeight:700,
        fontSize: big?16:14,
        cursor: disabled?"not-allowed":"pointer",
        fontFamily:"inherit",
        opacity: disabled ? 0.45 : 1,
        boxShadow: disabled ? "none" : `0 4px 18px ${color}66`,
        transform: pressed ? "scale(0.93)" : "scale(1)",
        transition:"transform 0.1s, box-shadow 0.2s, background 0.2s",
      }}
    >{label}</button>
  );
}

// ── Chat box ────────────────────────────────────────────────────────────────
function ChatBox({ chat, me, chatMsg, setChatMsg, sendChat, chatEndRef }) {
  const [open, setOpen] = useState(false);
  const [badge, setBadge] = useState(0);
  const prevLen = useRef(chat.length);
  const info = PLAYER_INFO[me]||{};

  useEffect(() => {
    if (!open && chat.length > prevLen.current)
      setBadge(b => b + chat.length - prevLen.current);
    prevLen.current = chat.length;
  }, [chat.length, open]);

  return (
    <div style={{marginTop:4}}>
      <button onClick={() => { setOpen(v=>!v); setBadge(0); }} style={{
        width:"100%", padding:"10px 16px",
        borderRadius: open ? "14px 14px 0 0" : 14,
        border:"1px solid rgba(255,255,255,0.15)",
        background:"rgba(255,255,255,0.07)", color:"#fff",
        fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"inherit",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        transition:"border-radius 0.2s",
      }}>
        <span>💬 Chat {badge>0 && (
          <span style={{background:"#ef4444",color:"#fff",borderRadius:99,
            padding:"1px 7px",fontSize:11,marginLeft:6,
            animation:"spinIn 0.3s forwards"}}>{badge}</span>
        )}</span>
        <span style={{color:"#64748b",transition:"transform 0.2s",
          transform:open?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
      </button>

      {open && (
        <div style={{
          background:"rgba(10,18,36,0.97)",
          border:"1px solid rgba(255,255,255,0.15)", borderTop:"none",
          borderRadius:"0 0 14px 14px", padding:"0 0 10px",
          animation:"actionPop 0.2s forwards",
        }}>
          <div style={{maxHeight:200,overflowY:"auto",padding:"12px 14px 8px",
            display:"flex",flexDirection:"column"}}>
            {chat.length===0 && (
              <div style={{color:"#475569",textAlign:"center",fontSize:13,padding:"16px 0"}}>
                No messages yet. Say hi! 👋
              </div>
            )}
            {chat.map((c,i) => {
              const isMe = c.player===me;
              const ci = PLAYER_INFO[c.player]||{};
              return (
                <div key={i} style={{
                  display:"flex", flexDirection:isMe?"row-reverse":"row",
                  alignItems:"flex-end", gap:6, marginBottom:8,
                  animation:"msgSlide 0.25s forwards",
                }}>
                  <span style={{fontSize:18}}>{ci.emoji}</span>
                  <div style={{
                    maxWidth:"72%", padding:"8px 12px", borderRadius:14,
                    borderBottomRightRadius:isMe?4:14,
                    borderBottomLeftRadius:isMe?14:4,
                    background:isMe?ci.color+"44":"rgba(255,255,255,0.1)",
                    border:`1px solid ${isMe?ci.color+"66":"rgba(255,255,255,0.15)"}`,
                    color:"#fff", fontSize:15, lineHeight:1.4, wordBreak:"break-word",
                  }}>{c.msg}</div>
                </div>
              );
            })}
            <div ref={chatEndRef}/>
          </div>

          <div style={{display:"flex",gap:5,padding:"6px 14px",flexWrap:"wrap",
            borderTop:"1px solid rgba(255,255,255,0.07)",
            borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
            {QUICK_EMOJIS.map(e=>(
              <button key={e} onClick={()=>sendChat(e)} style={{
                background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",
                borderRadius:8,padding:"5px 8px",fontSize:18,cursor:"pointer",lineHeight:1,
                transition:"transform 0.1s",
              }} onPointerDown={ev=>ev.currentTarget.style.transform="scale(0.82)"}
                 onPointerUp={ev=>ev.currentTarget.style.transform="scale(1)"}>{e}</button>
            ))}
          </div>

          <div style={{display:"flex",gap:8,padding:"10px 14px 0",alignItems:"center"}}>
            <input value={chatMsg} onChange={e=>setChatMsg(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&sendChat(chatMsg)}
              placeholder="Say something…"
              style={{flex:1,padding:"10px 14px",borderRadius:10,
                border:"1px solid rgba(255,255,255,0.2)",
                background:"rgba(255,255,255,0.07)",color:"#fff",
                fontSize:14,fontFamily:"inherit",outline:"none"}}/>
            <button onClick={()=>sendChat(chatMsg)} style={{
              padding:"10px 16px",borderRadius:10,border:"none",
              background:info.color,color:"#fff",fontSize:16,
              fontWeight:700,cursor:"pointer",fontFamily:"inherit",
              boxShadow:`0 3px 12px ${info.color}66`,
            }}>➤</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function PokerGame({ onBack, playerName }) {
  useGlobalCss(GLOBAL_CSS);

  const [me,        setMe]       = useState(null);
  const [game,      setGame]     = useState(null);
  const [conn,      setConn]     = useState([]);
  const [showCards, setShowCards]= useState(false);
  const [err,       setErr]      = useState("");
  const [acting,    setActing]   = useState(false);
  const [chat,      setChat]     = useState([]);
  const [chatMsg,   setChatMsg]  = useState("");
  const [lastAction,setLastAction]=useState(null); // for toast
  const [showWin,   setShowWin]  = useState(false);
  const [prevComm,  setPrevComm] = useState(0);    // for flip animation
  const [muted,     setMuted]    = useState(isMuted());
  const chatEndRef = useRef(null);
  const pollRef    = useRef(null);
  const prevWinner = useRef(null);
  const prevActor  = useRef(null);

  const fetchState = useCallback(async (player) => {
    try {
      const res = await pget(`/poker/${ROOM}/state?player=${player}`);
      if (res.ok) {
        setGame(prev => {
          // track community card count for flip animation + sound
          const newCount = (res.game?.commVisible||[]).length;
          const oldCount = (prev?.commVisible||[]).length;
          if (newCount > oldCount) {
            setPrevComm(oldCount);
            for (let i=0;i<newCount-oldCount;i++) setTimeout(()=>playCardFlip(), i*180);
          }
          // Your-turn notification
          const actor = res.game?.actor;
          if (actor && actor !== prevActor.current) {
            prevActor.current = actor;
            if (actor === player) playYourTurn();
            else playCardDeal();
          }
          // New hand dealt
          if (res.game?.stage === "pre-flop" && prev?.stage === "idle") playDealHand(2);
          return res.game;
        });
        setConn(res.connected||[]);
        if (res.chat) setChat(res.chat);
        if (res.game?.stage !== "showdown") setShowCards(false);
        // Win animation + sound
        if (res.game?.winner && res.game.winner !== prevWinner.current) {
          prevWinner.current = res.game.winner;
          setShowWin(true);
          setTimeout(() => setShowWin(false), 3500);
          if (res.game.winner === player) playWin();
          else if (res.game.winner !== "tie") playLose();
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (playerName && !me) join(playerName);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerName]);

  useEffect(() => {
    if (!me) return;
    fetchState(me);
    pollRef.current = setInterval(() => fetchState(me), 1500);
    return () => clearInterval(pollRef.current);
  }, [me, fetchState]);

  useLayoutEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [chat]);

  const join = async (player) => {
    setErr("");
    try {
      const res = await pget(`/poker/${ROOM}/join?player=${player}`);
      if (res.ok) setMe(player);
      else setErr(res.msg || "Failed to join");
    } catch { setErr("Cannot reach game server. Try again."); }
  };

  const act = async (action, amount=0) => {
    if (acting) return;
    setActing(true);
    setLastAction(action);
    setTimeout(() => setLastAction(null), 900);
    // sound feedback on action
    if (action === "fold")  playFold();
    else if (action === "raise" && amount >= (game?.players?.[me]?.chips||0)) playAllIn();
    else if (action === "raise") playRaise();
    else playChip();
    try {
      await ppost(`/poker/${ROOM}/action?player=${me}&action=${action}&amount=${amount}`);
      await fetchState(me);
    } catch { setErr("Action failed"); }
    setActing(false);
  };

  const dealAgain = async () => {
    prevWinner.current = null;
    setPrevComm(0);
    await ppost(`/poker/${ROOM}/deal`);
    setShowCards(false);
    await fetchState(me);
  };

  const leaveGame = async () => {
    await fetch(`${API}/poker/${ROOM}/leave?player=${me}`,{method:"DELETE"}).catch(()=>{});
    setMe(null); setGame(null); setConn([]);
  };

  const sendChat = async (text) => {
    const msg = text.trim();
    if (!msg || !me) return;
    setChatMsg("");
    await pchat(ROOM, me, msg);
    await fetchState(me);
  };

  // ── Auto-join / error screen ──────────────────────────────────────────────
  if (!me) {
    const info = playerName ? PLAYER_INFO[playerName] : null;
    return (
      <div style={st.wrap}>
        <button onClick={onBack} style={st.back}>← Back</button>
        <div style={st.loginBox}>
          <div style={{fontSize:60,textAlign:"center",marginBottom:16,
            animation:"float 2s ease-in-out infinite"}}>🃏</div>
          <h2 style={{color:"#fff",textAlign:"center",margin:"0 0 6px",fontSize:22}}>Texas Hold'em</h2>
          {playerName ? (
            <>
              <p style={{color:"#94a3b8",textAlign:"center",fontSize:14,margin:"0 0 24px"}}>
                {info?.emoji} Joining as <b style={{color:info?.color}}>{playerName}</b>…
              </p>
              {err ? (
                <>
                  <p style={{color:"#ef4444",textAlign:"center",fontSize:13,marginBottom:16}}>{err}</p>
                  <button onClick={()=>join(playerName)} style={{
                    display:"block",width:"100%",padding:"14px",borderRadius:14,
                    border:"2px solid "+info?.color,background:info?.color+"22",
                    color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
                  }}>🔄 Retry</button>
                </>
              ) : (
                <div style={{textAlign:"center",color:"#64748b",fontSize:13}}>Connecting…</div>
              )}
            </>
          ) : (
            <p style={{color:"#ef4444",textAlign:"center",fontSize:14}}>
              Please go back and log in again.
            </p>
          )}
        </div>
      </div>
    );
  }

  const other   = me==="Subhi"?"Viju":"Subhi";
  const myInfo  = PLAYER_INFO[me];

  // ── Waiting screen ────────────────────────────────────────────────────────
  if (!game && conn.length < 2) return (
    <div style={st.wrap}>
      <button onClick={leaveGame} style={st.back}>← Back</button>
      <div style={st.loginBox}>
        <div style={{fontSize:56,textAlign:"center",animation:"float 1.5s ease-in-out infinite"}}>⏳</div>
        <h2 style={{color:"#fff",textAlign:"center",fontSize:20,margin:"12px 0 6px"}}>
          Waiting for {other}…
        </h2>
        <p style={{color:"#94a3b8",textAlign:"center",fontSize:14}}>
          Ask {other} to open <b style={{color:"#a78bfa"}}>billingseasy.com/play/sv2026</b> and tap Poker Night 🃏
        </p>
        <div style={{...st.badge,marginTop:20,animation:"actionPop 0.4s forwards"}}>✅ You ({me}) connected</div>
        <div style={{...st.badge,background:"#374151",marginTop:8}}>⏳ Waiting for {other}</div>
      </div>
    </div>
  );

  if (!game) return (
    <div style={st.wrap}>
      <button onClick={leaveGame} style={st.back}>← Back</button>
      <div style={{color:"#aaa",textAlign:"center",marginTop:40}}>Starting game…</div>
    </div>
  );

  // ── Game screen ───────────────────────────────────────────────────────────
  const myData    = game.players?.[me];
  const otherData = game.players?.[other];
  const isMyTurn  = game.actor===me && !game.winner;
  const callAmt   = isMyTurn ? (game.currentBet-(myData?.roundBet||0)) : 0;
  const canCheck  = callAmt===0;
  const commCards = game.commVisible||[];

  return (
    <div style={st.wrap}>
      {/* Global win celebration */}
      {showWin && game.winner && game.winner!=="tie" && (
        <Confetti winner={game.winner} me={me}/>
      )}

      {/* Action toast */}
      <ActionToast action={lastAction}/>

      {/* Header */}
      <div style={st.header}>
        <button onClick={leaveGame} style={st.back}>← Leave</button>
        <h2 style={st.title}>🃏 Texas Hold'em</h2>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{
            ...st.pot,
            animation: game.pot>0?"potPulse 1.5s ease-in-out infinite":"none",
          }}>🏺 ₹{game.pot}</div>
          <button onClick={()=>{toggleMute();setMuted(m=>!m);}} style={st.muteBtn} title={muted?"Unmute":"Mute"}>
            {muted?"🔇":"🔊"}
          </button>
        </div>
      </div>

      {/* Opponent */}
      <OpponentRow name={other} data={otherData} isActor={game.actor===other && !game.winner}/>

      {/* Community cards */}
      <div style={st.commWrap}>
        <div style={st.stageLabel}>{(game.stage||"").toUpperCase()}</div>
        <div style={st.commRow}>
          {[0,1,2,3,4].map(i=>(
            <CommCard key={i} card={commCards[i]||null} index={i} prevCount={prevComm}/>
          ))}
        </div>
        {game.stage==="showdown" && game.players && (
          <div style={{display:"flex",gap:20,justifyContent:"center",marginTop:8,flexWrap:"wrap"}}>
            {["Subhi","Viju"].map(p=>{
              const pd=game.players[p]; if(!pd||pd.folded) return null;
              const isWinner=game.winner===p;
              return (
                <div key={p} style={{
                  fontSize:12, padding:"4px 12px", borderRadius:20,
                  background:isWinner?"#f59e0b33":"rgba(255,255,255,0.07)",
                  color:isWinner?"#fbbf24":"#aaa",
                  border:`1px solid ${isWinner?"#f59e0b":"rgba(255,255,255,0.1)"}`,
                  animation:isWinner?"winBounce 0.5s 0.3s both":"none",
                }}>
                  {isWinner?"🏆 ":""}<b>{p}</b>: {pd.winHand||""}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* My cards */}
      <MyRow
        name={me} data={myData} isActor={isMyTurn}
        showCards={showCards} onToggle={()=>setShowCards(v=>!v)}
      />

      {/* Message */}
      <div style={{...st.msg, animation:"msgSlide 0.3s forwards"}} key={game.msg}>
        {game.msg}
      </div>

      {/* Actions */}
      {!game.winner ? (
        isMyTurn ? (
          <div style={{...st.actions, animation:"actionPop 0.35s forwards"}}>
            <div style={{color:"#94a3b8",fontSize:13,marginBottom:10,textAlign:"center"}}>
              {myInfo.emoji} Your turn — peek your cards first, then act
            </div>
            <div style={st.btnRow}>
              <Btn color="#ef4444" onClick={()=>act("fold")}   label="🏳️ Fold" disabled={acting}/>
              {canCheck
                ?<Btn color="#3b82f6" onClick={()=>act("check")} label="✓ Check" disabled={acting}/>
                :<Btn color="#3b82f6" onClick={()=>act("call")}  label={`📞 Call ₹${callAmt}`} disabled={acting||!myData?.chips}/>
              }
              {[20,40,80].filter(x=>myData?.chips>=(callAmt+x)).map(x=>(
                <Btn key={x} color="#8b5cf6" onClick={()=>act("raise",x)} label={`↑ +₹${x}`} disabled={acting}/>
              ))}
              {myData?.chips>callAmt && (
                <Btn color="#f59e0b" onClick={()=>act("raise",myData.chips-callAmt)} label="🔥 All In" disabled={acting}/>
              )}
            </div>
          </div>
        ) : (
          <div style={{...st.actions,color:"#64748b",fontSize:14,textAlign:"center"}}>
            <span style={{animation:"float 2s ease-in-out infinite",display:"inline-block"}}>⏳</span>
            {" "}Waiting for {other} to act…
          </div>
        )
      ) : (
        <div style={{...st.actions,textAlign:"center"}}>
          {conn.length===2 ? (
            <>
              <button onClick={dealAgain} style={{
                ...st.dealBtn,
                animation:"winBounce 0.5s 0.2s both",
              }}>🃏 Deal Next Hand</button>
              <div style={{color:"#aaa",fontSize:12,marginTop:10}}>
                Subhi: ₹{game.players?.Subhi?.chips||0} · Viju: ₹{game.players?.Viju?.chips||0}
              </div>
            </>
          ) : (
            <div style={{color:"#aaa",fontSize:13}}>Waiting for {other} to reconnect…</div>
          )}
        </div>
      )}

      {/* Chat */}
      <ChatBox
        chat={chat} me={me} chatMsg={chatMsg}
        setChatMsg={setChatMsg} sendChat={sendChat}
        chatEndRef={chatEndRef}
      />

      {err && <div style={{color:"#ef4444",textAlign:"center",fontSize:13,marginTop:8}}>{err}</div>}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const st = {
  wrap:{
    minHeight:"100vh", padding:"12px", maxWidth:520, margin:"0 auto",
    background:"linear-gradient(160deg,#0f172a 0%,#1e1b4b 60%,#0f172a 100%)",
    color:"#fff", fontFamily:"system-ui,sans-serif",
    display:"flex", flexDirection:"column", gap:6,
  },
  loginBox:{
    margin:"40px auto 0", maxWidth:340, width:"100%",
    background:"rgba(255,255,255,0.06)", borderRadius:20, padding:"32px 24px",
    border:"1px solid rgba(255,255,255,0.12)",
  },
  header:{ display:"flex", alignItems:"center", gap:10, marginBottom:4 },
  muteBtn:{ background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:8, padding:"4px 8px", cursor:"pointer", fontSize:16, color:"#fff" },
  back:{
    background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)",
    borderRadius:10, padding:"6px 12px", color:"#fff", cursor:"pointer",
    fontSize:13, fontFamily:"inherit",
  },
  title:{ flex:1, textAlign:"center", fontSize:18, fontWeight:700, margin:0 },
  pot:{ background:"#78350f", padding:"4px 12px", borderRadius:20, fontSize:13, fontWeight:700 },
  row:{
    padding:"12px 14px", borderRadius:14, border:"2px solid",
    background:"rgba(255,255,255,0.05)",
    display:"flex", justifyContent:"space-between", alignItems:"center", gap:10,
    flexWrap:"wrap", transition:"border-color 0.3s",
  },
  rowLeft:{ display:"flex", alignItems:"center", gap:10 },
  cards:{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" },
  peekBtn:{
    padding:"6px 12px", borderRadius:8,
    border:"1px solid rgba(255,255,255,0.2)",
    background:"rgba(255,255,255,0.1)", color:"#fff", cursor:"pointer",
    fontSize:12, fontFamily:"inherit",
  },
  commWrap:{ textAlign:"center", padding:"10px 0" },
  stageLabel:{ fontSize:10, letterSpacing:3, color:"#64748b", marginBottom:8 },
  commRow:{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" },
  msg:{
    background:"rgba(255,255,255,0.06)", borderRadius:12, padding:"10px 14px",
    fontSize:14, color:"#e2e8f0", textAlign:"center", lineHeight:1.5,
  },
  actions:{ padding:"8px 0" },
  btnRow:{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"center" },
  dealBtn:{
    padding:"14px 36px", borderRadius:14, border:"none",
    background:"linear-gradient(135deg,#7c3aed,#4f46e5)", color:"#fff",
    fontSize:16, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
    boxShadow:"0 4px 20px rgba(124,58,237,0.5)",
  },
  badge:{
    background:"#1e3a8a", color:"#93c5fd", borderRadius:10,
    padding:"8px 16px", fontSize:13, textAlign:"center",
  },
};
