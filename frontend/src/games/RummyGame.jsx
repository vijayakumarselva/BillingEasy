/**
 * 🃏 Multiplayer Indian Points Rummy — Subhi & Viju
 * 13 cards, wild joker, pure + impure sequences, sets
 */
import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import {
  playDraw, playDiscard, playGroupForm, playInvalid, playDeclareStab,
  playYourTurn, playWin, playLose, playDealHand,
  isMuted, toggleMute,
} from "./sounds";

const _BASE = (process.env.REACT_APP_BACKEND_URL || "https://billingeasy-backend-production.up.railway.app").replace(/\/$/, "");
const API   = _BASE.endsWith("/api") ? _BASE : `${_BASE}/api`;
const ROOM  = "sv2026";

const RED  = new Set(["H","D"]);
const SUIT_SYM   = { S:"♠", H:"♥", D:"♦", C:"♣" };
const RANK_ORDER = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const SUIT_ORDER = ["S","H","D","C"];
const PLAYER_INFO = {
  Subhi: { emoji:"👩‍🦱", color:"#f472b6", glow:"rgba(244,114,182,0.5)" },
  Viju:  { emoji:"👨‍🦱", color:"#60a5fa", glow:"rgba(96,165,250,0.5)"  },
};
const GROUP_COLORS = ["#f472b6","#60a5fa","#4ade80","#fb923c","#a78bfa","#facc15","#f87171","#34d399"];
const QUICK_EMOJIS = ["😂","🔥","😤","🥹","👏","🤑","😈","🫡","💀","🙏","😎","🤣"];

const ckey = (c) => `${c.r}${c.s}`;

const sortBySuit = (cards) =>
  [...cards].sort((a,b)=>{
    const s=SUIT_ORDER.indexOf(a.s)-SUIT_ORDER.indexOf(b.s);
    return s!==0?s:RANK_ORDER.indexOf(a.r)-RANK_ORDER.indexOf(b.r);
  });

const sortByRank = (cards) =>
  [...cards].sort((a,b)=>{
    const r=RANK_ORDER.indexOf(a.r)-RANK_ORDER.indexOf(b.r);
    return r!==0?r:SUIT_ORDER.indexOf(a.s)-SUIT_ORDER.indexOf(b.s);
  });

// ── API helpers ──────────────────────────────────────────────────────────────
const rget  = (path) => fetch(`${API}${path}`).then(r=>r.json());
const rpost = (path, body) => fetch(`${API}${path}`,{
  method:"POST",
  headers:body?{"Content-Type":"application/json"}:{},
  body:body?JSON.stringify(body):undefined,
}).then(r=>r.json());
const rchat = (room,player,msg) =>
  fetch(`${API}/rummy/${room}/chat?player=${encodeURIComponent(player)}&msg=${encodeURIComponent(msg)}`,{method:"POST"}).catch(()=>{});

// ── Global CSS ───────────────────────────────────────────────────────────────
const CSS = `
@keyframes dealIn { 0%{transform:translateY(-80px) rotate(-8deg) scale(0.6);opacity:0} 70%{transform:translateY(4px) rotate(1deg) scale(1.03)} 100%{transform:none;opacity:1} }
@keyframes cardPop { 0%{transform:scale(0.85);opacity:0} 60%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
@keyframes slideUp { 0%{transform:translateY(14px);opacity:0} 100%{transform:none;opacity:1} }
@keyframes glowPulse { 0%,100%{box-shadow:0 0 0 transparent} 50%{box-shadow:0 0 18px 5px var(--glow,#fff4)} }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
@keyframes confettiDrop { 0%{transform:translateY(-10px) rotate(0);opacity:1} 100%{transform:translateY(100vh) rotate(540deg);opacity:0} }
@keyframes winPop { 0%{transform:scale(0) rotate(-12deg);opacity:0} 55%{transform:scale(1.15) rotate(2deg)} 100%{transform:scale(1) rotate(0);opacity:1} }
@keyframes discardFly { 0%{transform:scale(1)} 40%{transform:scale(0.7) translateX(60px) rotate(20deg);opacity:0.4} 100%{transform:scale(1) translateX(0);opacity:1} }
@keyframes selectBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
`;

function useGlobalCss(css){
  useEffect(()=>{
    const el=document.createElement("style"); el.textContent=css;
    document.head.appendChild(el); return ()=>el.remove();
  },[]);
}

// ── Win confetti ─────────────────────────────────────────────────────────────
function Confetti({ winner, me }) {
  const emojis = ["🎉","✨","🃏","💰","🏆","🌟","🎊","💫"];
  const pieces = Array.from({length:24},(_,i)=>({
    id:i, emoji:emojis[i%emojis.length],
    left:`${Math.random()*100}%`, size:16+Math.floor(Math.random()*18),
    delay:`${Math.random()*1.2}s`, dur:`${2+Math.random()*2}s`,
  }));
  const iWon = winner===me;
  return (
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:999,overflow:"hidden"}}>
      {iWon && pieces.map(p=>(
        <div key={p.id} style={{position:"absolute",top:"-20px",left:p.left,
          fontSize:p.size,animation:`confettiDrop ${p.dur} ${p.delay} forwards ease-in`}}>{p.emoji}</div>
      ))}
      <div style={{position:"absolute",top:"35%",left:"50%",transform:"translateX(-50%)",
        background:iWon?"linear-gradient(135deg,#f59e0b,#ef4444)":"linear-gradient(135deg,#374151,#1f2937)",
        color:"#fff",borderRadius:20,padding:"24px 40px",textAlign:"center",
        animation:"winPop 0.5s forwards",boxShadow:"0 8px 40px rgba(0,0,0,0.7)",minWidth:220}}>
        <div style={{fontSize:48}}>{iWon?"🏆":"😢"}</div>
        <div style={{fontSize:22,fontWeight:900,marginTop:8}}>
          {iWon?"You Declared! 🎊":`${winner} wins!`}
        </div>
      </div>
    </div>
  );
}

// ── Single card ───────────────────────────────────────────────────────────────
function RCard({ card, faceDown, isJoker, selected, isDiscard, groupColor, small, animate, delay=0, onClick }) {
  const w=small?36:48, h=small?52:68;
  const [pressed,setPressed]=useState(false);

  if (!card||faceDown) return (
    <div style={{width:w,height:h,borderRadius:7,
      background:"linear-gradient(135deg,#1e3a8a,#3730a3)",
      border:"2px solid rgba(255,255,255,0.2)",display:"flex",
      alignItems:"center",justifyContent:"center",fontSize:small?14:20,
      boxShadow:"0 3px 8px rgba(0,0,0,0.5)",flexShrink:0}}>🂠</div>
  );

  const red=RED.has(card.s);
  const sym=SUIT_SYM[card.s]||card.s;
  const lift = selected ? -12 : 0;
  const outline = isDiscard ? "3px solid #ef4444"
    : groupColor         ? `3px solid ${groupColor}`
    : selected           ? "3px solid #fff"
    : isJoker            ? "2px solid #f59e0b"
    : "none";

  return (
    <div onClick={onClick}
      onPointerDown={()=>setPressed(true)}
      onPointerUp={()=>setPressed(false)}
      style={{
        width:w,height:h,borderRadius:7,
        background: isJoker
          ? "linear-gradient(160deg,#fff8e1 60%,#fef3c7)"
          : "linear-gradient(160deg,#fff 70%,#f0f0f0)",
        display:"flex",flexDirection:"column",justifyContent:"space-between",
        padding:"2px 4px",boxSizing:"border-box",
        boxShadow: selected ? "0 8px 20px rgba(0,0,0,0.6)" : "0 3px 10px rgba(0,0,0,0.5)",
        color:red?"#dc2626":"#111",
        outline, outlineOffset:"-2px",
        transform:`translateY(${lift}px) scale(${pressed?0.92:1})`,
        transition:"transform 0.12s, box-shadow 0.15s, outline 0.1s",
        cursor:onClick?"pointer":"default",flexShrink:0,
        animation:animate?`dealIn 0.4s ${delay}s both ease-out`:"none",
      }}>
      <div style={{fontSize:small?9:12,fontWeight:800,lineHeight:1.1}}>
        {card.r}<br/>{sym}
      </div>
      <div style={{fontSize:small?14:18,textAlign:"center",fontWeight:700}}>{sym}</div>
      {isJoker && <div style={{position:"absolute",bottom:2,right:3,fontSize:8,color:"#b45309",fontWeight:900}}>J</div>}
    </div>
  );
}

// ── Opponent strip ────────────────────────────────────────────────────────────
function OpponentStrip({ name, count, hand, isActor, joker }) {
  const info=PLAYER_INFO[name]||{};
  return (
    <div style={{padding:"10px 12px",borderRadius:14,border:"2px solid",
      "--glow":info.glow,
      borderColor:isActor?info.color:"rgba(255,255,255,0.1)",
      animation:isActor?"glowPulse 2s infinite":"none",
      background:"rgba(255,255,255,0.04)",transition:"all 0.3s"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
        <span style={{fontSize:28,animation:"float 3s ease-in-out infinite"}}>{info.emoji}</span>
        <div>
          <div style={{fontWeight:700,color:isActor?info.color:"#e2e8f0",fontSize:14}}>
            {name} {isActor&&<span style={{fontSize:11,color:info.color}}>● thinking…</span>}
          </div>
          <div style={{color:"#64748b",fontSize:12}}>{count} cards in hand</div>
        </div>
      </div>
      {/* Opponent cards — face down, fanned */}
      <div style={{display:"flex",gap:3,overflowX:"auto",paddingBottom:2}}>
        {hand
          ? hand.map((c,i)=><RCard key={i} card={c} small isJoker={joker&&c.r===joker.r}/>)
          : Array.from({length:Math.min(count,13)},(_,i)=>(
              <RCard key={i} faceDown small delay={i*0.03} animate/>
            ))
        }
      </div>
    </div>
  );
}

// ── Table centre ──────────────────────────────────────────────────────────────
function TableCenter({ stockCount, discardTop, joker, onDrawStock, onDrawDiscard, canDraw }) {
  return (
    <div style={{display:"flex",gap:16,justifyContent:"center",
      alignItems:"center",padding:"12px 0"}}>
      {/* Stock */}
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:11,color:"#64748b",marginBottom:5,letterSpacing:1}}>STOCK</div>
        <div onClick={canDraw?onDrawStock:undefined}
          style={{cursor:canDraw?"pointer":"default",
            transition:"transform 0.15s",transform:canDraw?"scale(1)":"scale(0.95)"}}>
          <RCard faceDown animate={false}/>
        </div>
        <div style={{fontSize:11,color:"#64748b",marginTop:4}}>{stockCount} left</div>
      </div>

      {/* Joker indicator */}
      {joker && (
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:11,color:"#f59e0b",marginBottom:5,letterSpacing:1}}>WILD JOKER</div>
          <RCard card={joker} isJoker/>
          <div style={{fontSize:10,color:"#f59e0b",marginTop:4}}>All {joker.r}s</div>
        </div>
      )}

      {/* Discard */}
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:11,color:"#64748b",marginBottom:5,letterSpacing:1}}>DISCARD</div>
        <div onClick={canDraw?onDrawDiscard:undefined}
          style={{cursor:canDraw?"pointer":"default",transition:"transform 0.15s"}}>
          {discardTop
            ? <RCard card={discardTop} isJoker={joker&&discardTop.r===joker.r}/>
            : <div style={{width:48,height:68,borderRadius:7,
                border:"2px dashed rgba(255,255,255,0.15)",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:20,color:"rgba(255,255,255,0.2)"}}>+</div>
          }
        </div>
        {canDraw&&discardTop&&<div style={{fontSize:10,color:"#60a5fa",marginTop:4}}>tap to pick</div>}
      </div>
    </div>
  );
}

// ── My hand ───────────────────────────────────────────────────────────────────
function MyHand({ hand, joker, selected, onToggle, sortMode, onSort, isNew }) {
  const jrank = joker?.r;
  return (
    <div>
      {/* Sort controls */}
      <div style={{display:"flex",gap:6,marginBottom:8,justifyContent:"flex-end"}}>
        {["suit","rank","none"].map(m=>(
          <button key={m} onClick={()=>onSort(m)} style={{
            padding:"4px 10px",borderRadius:8,border:"1px solid rgba(255,255,255,0.15)",
            background:sortMode===m?"rgba(255,255,255,0.15)":"transparent",
            color:sortMode===m?"#fff":"#64748b",fontSize:11,cursor:"pointer",
            fontFamily:"inherit",fontWeight:sortMode===m?700:400,
          }}>{m==="none"?"custom":m}</button>
        ))}
      </div>

      {/* Cards */}
      <div style={{display:"flex",flexWrap:"wrap",gap:5,justifyContent:"center"}}>
        {hand.map((c,i)=>{
          const k=ckey(c);
          const isSel=selected.has(k);
          const isJoker=jrank&&c.r===jrank;
          return (
            <RCard
              key={k} card={c}
              isJoker={isJoker}
              selected={isSel}
              animate={i>=hand.length-(isNew?1:0)}
              delay={i*0.04}
              onClick={()=>onToggle(k)}
            />
          );
        })}
      </div>
      <div style={{fontSize:11,color:"#475569",textAlign:"center",marginTop:6}}>
        {hand.length} cards · tap to select
      </div>
    </div>
  );
}

// ── Declare modal ─────────────────────────────────────────────────────────────
function DeclareModal({ hand, joker, myColor, onDeclare, onCancel }) {
  const [phase,      setPhase]      = useState(1);  // 1=pick discard, 2=group
  const [discardKey, setDiscardKey] = useState(null);
  const [selected,   setSelected]   = useState(new Set());
  const [groups,     setGroups]     = useState([]);
  const [err,        setErr]        = useState("");

  const jrank  = joker?.r;
  const cardMap = {};
  hand.forEach(c=>{ cardMap[ckey(c)]=c; });

  const allGroupedKeys = new Set(groups.flat());
  const totalGrouped = groups.flat().length;
  const canDeclare = discardKey && totalGrouped===13;

  const handlePhase1Tap = (k) => {
    setDiscardKey(prev => prev===k ? null : k);
  };

  const handlePhase2Tap = (k) => {
    if (allGroupedKeys.has(k)) return;
    setSelected(prev=>{
      const n=new Set(prev);
      n.has(k)?n.delete(k):n.add(k);
      return n;
    });
    setErr("");
  };

  const addGroup = () => {
    if (selected.size<3||selected.size>4){setErr("Select 3 or 4 cards");playInvalid();return;}
    setGroups(g=>[...g,[...selected]]);
    playGroupForm();
    setSelected(new Set()); setErr("");
  };

  const removeGroup = (i) => {
    setGroups(g=>g.filter((_,j)=>j!==i));
  };

  const remaining13 = hand.filter(c=>ckey(c)!==discardKey);

  return (
    <div style={{position:"fixed",inset:0,background:"#080515",zIndex:800,
      overflowY:"auto",padding:"16px 12px 40px",color:"#fff",fontFamily:"system-ui,sans-serif"}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <button onClick={onCancel} style={dm.backBtn}>✕ Cancel</button>
        <h2 style={{fontSize:17,fontWeight:700,margin:0,flex:1,textAlign:"center"}}>🏆 Declare</h2>
        <div style={{width:80}}/>
      </div>

      {/* Step indicator */}
      <div style={{display:"flex",gap:4,marginBottom:18}}>
        {[1,2].map(s=>(
          <div key={s} style={{
            flex:1,height:4,borderRadius:4,
            background:phase>=s?myColor:"rgba(255,255,255,0.1)",
            transition:"background 0.3s",
          }}/>
        ))}
      </div>

      {/* Phase 1 */}
      {phase===1&&(
        <div style={{animation:"slideUp 0.25s forwards"}}>
          <div style={{fontSize:14,color:"#94a3b8",marginBottom:14,textAlign:"center"}}>
            Step 1 — Tap the card you want to <b style={{color:"#ef4444"}}>discard</b>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",marginBottom:20}}>
            {hand.map(c=>{
              const k=ckey(c);
              const isSel=discardKey===k;
              return (
                <div key={k} style={{position:"relative"}} onClick={()=>handlePhase1Tap(k)}>
                  <RCard card={c} isJoker={jrank&&c.r===jrank}
                    isDiscard={isSel} selected={false}/>
                  {isSel&&(
                    <div style={{position:"absolute",top:-8,left:"50%",transform:"translateX(-50%)",
                      background:"#ef4444",color:"#fff",fontSize:9,fontWeight:900,
                      padding:"2px 6px",borderRadius:8,whiteSpace:"nowrap"}}>DISCARD</div>
                  )}
                </div>
              );
            })}
          </div>
          <button
            disabled={!discardKey}
            onClick={()=>{setPhase(2);setErr("");}}
            style={{...dm.actionBtn,background:discardKey?myColor:"#374151",
              opacity:discardKey?1:0.5,width:"100%"}}>
            Next: Group Cards →
          </button>
        </div>
      )}

      {/* Phase 2 */}
      {phase===2&&(
        <div style={{animation:"slideUp 0.25s forwards"}}>
          <div style={{fontSize:13,color:"#94a3b8",marginBottom:4,textAlign:"center"}}>
            Step 2 — Group your 13 remaining cards into valid melds
          </div>
          <div style={{fontSize:11,color:"#475569",textAlign:"center",marginBottom:12}}>
            Need: ≥1 pure sequence + ≥2 sequences total
          </div>

          {/* Discarded card preview */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,
            padding:"8px 12px",borderRadius:10,background:"rgba(239,68,68,0.1)",
            border:"1px solid rgba(239,68,68,0.3)"}}>
            <RCard card={cardMap[discardKey]} isJoker={jrank&&cardMap[discardKey]?.r===jrank} small/>
            <span style={{fontSize:12,color:"#fca5a5"}}>← discarding this</span>
          </div>

          {/* Remaining cards */}
          <div style={{fontSize:11,color:"#64748b",marginBottom:6}}>
            {remaining13.length-totalGrouped} cards remaining to group:
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12}}>
            {remaining13.map(c=>{
              const k=ckey(c);
              const grpIdx=groups.findIndex(g=>g.includes(k));
              const isSel=selected.has(k);
              const gc=grpIdx>=0?GROUP_COLORS[grpIdx%GROUP_COLORS.length]:undefined;
              return (
                <div key={k} style={{position:"relative"}} onClick={()=>handlePhase2Tap(k)}>
                  <RCard card={c} isJoker={jrank&&c.r===jrank}
                    selected={isSel} groupColor={gc}/>
                  {grpIdx>=0&&(
                    <div style={{position:"absolute",top:-6,right:-4,
                      background:GROUP_COLORS[grpIdx%GROUP_COLORS.length],
                      color:"#000",fontSize:9,fontWeight:900,width:16,height:16,
                      borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {grpIdx+1}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Group action */}
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button
              disabled={selected.size<3||selected.size>4}
              onClick={addGroup}
              style={{...dm.actionBtn,flex:1,
                background:selected.size>=3&&selected.size<=4?myColor:"#374151",
                opacity:selected.size>=3&&selected.size<=4?1:0.5}}>
              ➕ Group {selected.size>0?`(${selected.size})`:""}
            </button>
            {selected.size>0&&(
              <button onClick={()=>setSelected(new Set())} style={{...dm.actionBtn,
                background:"rgba(255,255,255,0.1)",flex:0,padding:"10px 14px"}}>✕</button>
            )}
          </div>

          {/* Formed groups */}
          {groups.map((g,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,
              padding:"8px 10px",borderRadius:10,
              background:`${GROUP_COLORS[i%GROUP_COLORS.length]}18`,
              border:`1px solid ${GROUP_COLORS[i%GROUP_COLORS.length]}44`}}>
              <div style={{fontWeight:700,fontSize:12,color:GROUP_COLORS[i%GROUP_COLORS.length],
                minWidth:20}}>#{i+1}</div>
              <div style={{display:"flex",gap:4,flex:1,flexWrap:"wrap"}}>
                {g.map(k=>(<RCard key={k} card={cardMap[k]}
                  isJoker={jrank&&cardMap[k]?.r===jrank} small
                  groupColor={GROUP_COLORS[i%GROUP_COLORS.length]}/>))}
              </div>
              <button onClick={()=>removeGroup(i)} style={{background:"none",border:"none",
                color:"#64748b",cursor:"pointer",fontSize:16,padding:"0 4px"}}>✕</button>
            </div>
          ))}

          {err&&<div style={{color:"#fca5a5",fontSize:12,marginBottom:8,textAlign:"center"}}>{err}</div>}

          <div style={{display:"flex",gap:8,marginTop:4}}>
            <button onClick={()=>{setPhase(1);setGroups([]);setSelected(new Set());}}
              style={{...dm.actionBtn,background:"rgba(255,255,255,0.08)",flex:0,padding:"12px 16px"}}>
              ← Back
            </button>
            <button
              disabled={!canDeclare}
              onClick={()=>onDeclare(cardMap[discardKey], groups.map(g=>g.map(k=>cardMap[k])))}
              style={{...dm.actionBtn,flex:1,
                background:canDeclare?"linear-gradient(135deg,#f59e0b,#ef4444)":"#374151",
                opacity:canDeclare?1:0.5,fontWeight:900,fontSize:16}}>
              🏆 Declare!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const dm = {
  backBtn:{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",
    color:"#fff",borderRadius:10,padding:"8px 14px",cursor:"pointer",fontSize:13,fontFamily:"inherit"},
  actionBtn:{padding:"12px 16px",borderRadius:12,border:"none",color:"#fff",
    fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"},
};

// ── Chat (same as poker) ──────────────────────────────────────────────────────
function ChatBox({ chat, me, chatMsg, setChatMsg, sendChat, chatEndRef }) {
  const [open,setBadgeOpen]=useState(false);
  const [badge,setBadge]=useState(0);
  const info=PLAYER_INFO[me]||{};
  const prevLen=useRef(chat.length);
  useEffect(()=>{
    if(!open&&chat.length>prevLen.current) setBadge(b=>b+chat.length-prevLen.current);
    prevLen.current=chat.length;
  },[chat.length,open]);
  return (
    <div style={{marginTop:4}}>
      <button onClick={()=>{setBadgeOpen(v=>!v);setBadge(0);}} style={{
        width:"100%",padding:"10px 16px",borderRadius:open?"14px 14px 0 0":14,
        border:"1px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.07)",
        color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",
        display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span>💬 Chat {badge>0&&<span style={{background:"#ef4444",color:"#fff",
          borderRadius:99,padding:"1px 7px",fontSize:11,marginLeft:6}}>{badge}</span>}</span>
        <span style={{color:"#64748b"}}>{open?"▲":"▼"}</span>
      </button>
      {open&&(
        <div style={{background:"rgba(10,18,36,0.97)",border:"1px solid rgba(255,255,255,0.15)",
          borderTop:"none",borderRadius:"0 0 14px 14px",padding:"0 0 10px"}}>
          <div style={{maxHeight:180,overflowY:"auto",padding:"10px 12px 6px",
            display:"flex",flexDirection:"column"}}>
            {chat.length===0&&<div style={{color:"#475569",textAlign:"center",fontSize:13,padding:"12px 0"}}>Say hi! 👋</div>}
            {chat.map((c,i)=>{
              const isMe=c.player===me; const ci=PLAYER_INFO[c.player]||{};
              return (
                <div key={i} style={{display:"flex",flexDirection:isMe?"row-reverse":"row",
                  alignItems:"flex-end",gap:6,marginBottom:7,animation:"slideUp 0.2s forwards"}}>
                  <span style={{fontSize:16}}>{ci.emoji}</span>
                  <div style={{maxWidth:"72%",padding:"7px 11px",borderRadius:12,
                    borderBottomRightRadius:isMe?4:12,borderBottomLeftRadius:isMe?12:4,
                    background:isMe?ci.color+"44":"rgba(255,255,255,0.1)",
                    border:`1px solid ${isMe?ci.color+"66":"rgba(255,255,255,0.15)"}`,
                    color:"#fff",fontSize:14,lineHeight:1.4,wordBreak:"break-word"}}>{c.msg}</div>
                </div>
              );
            })}
            <div ref={chatEndRef}/>
          </div>
          <div style={{display:"flex",gap:5,padding:"6px 12px",flexWrap:"wrap",
            borderTop:"1px solid rgba(255,255,255,0.07)",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
            {QUICK_EMOJIS.map(e=>(
              <button key={e} onClick={()=>sendChat(e)} style={{background:"rgba(255,255,255,0.07)",
                border:"1px solid rgba(255,255,255,0.12)",borderRadius:7,padding:"4px 7px",
                fontSize:17,cursor:"pointer",lineHeight:1}}>{e}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:8,padding:"8px 12px 0",alignItems:"center"}}>
            <input value={chatMsg} onChange={e=>setChatMsg(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&sendChat(chatMsg)}
              placeholder="Say something…"
              style={{flex:1,padding:"9px 12px",borderRadius:9,
                border:"1px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.07)",
                color:"#fff",fontSize:13,fontFamily:"inherit",outline:"none"}}/>
            <button onClick={()=>sendChat(chatMsg)} style={{padding:"9px 14px",borderRadius:9,
              border:"none",background:info.color,color:"#fff",fontSize:15,
              fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>➤</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RummyGame({ onBack, playerName }) {
  useGlobalCss(CSS);

  const [me,        setMe]        = useState(null);
  const [game,      setGame]      = useState(null);
  const [conn,      setConn]      = useState([]);
  const [chat,      setChat]      = useState([]);
  const [chatMsg,   setChatMsg]   = useState("");
  const [sortMode,  setSortMode]  = useState("suit");
  const [selected,  setSelected]  = useState(new Set());   // for discard selection
  const [declaring, setDeclaring] = useState(false);
  const [err,       setErr]       = useState("");
  const [showWin,   setShowWin]   = useState(false);
  const [isNewCard, setIsNewCard] = useState(false);
  const [muted, setMuted] = useState(isMuted());
  const pollRef    = useRef(null);
  const chatEndRef = useRef(null);
  const prevWinner = useRef(null);
  const prevActor  = useRef(null);
  const prevHand   = useRef(0);

  const fetchState = useCallback(async (player) => {
    try {
      const res = await rget(`/rummy/${ROOM}/state?player=${player}`);
      if (res.ok) {
        setGame(g => {
          const newLen=(res.game?.myHand||[]).length;
          const oldLen=(g?.myHand||[]).length;
          if(newLen>oldLen) setIsNewCard(true);
          // New hand dealt
          if(newLen===13 && prevHand.current<13) playDealHand(13);
          prevHand.current=newLen;
          // Your-turn sound
          const actor=res.game?.actor;
          if(actor && actor!==prevActor.current){
            prevActor.current=actor;
            if(actor===player) playYourTurn();
          }
          return res.game;
        });
        setConn(res.connected||[]);
        if(res.chat) setChat(res.chat);
        if(res.game?.winner && res.game.winner!==prevWinner.current){
          prevWinner.current=res.game.winner;
          setShowWin(true); setTimeout(()=>setShowWin(false),3500);
          if(res.game.winner===player) playWin(); else playLose();
        }
      }
    } catch {}
  }, []);

  useEffect(()=>{ if(playerName&&!me) join(playerName); },[playerName]);

  useEffect(()=>{
    if(!me) return;
    fetchState(me);
    pollRef.current=setInterval(()=>fetchState(me),1500);
    return ()=>clearInterval(pollRef.current);
  },[me,fetchState]);

  useLayoutEffect(()=>{ chatEndRef.current?.scrollIntoView({behavior:"smooth"}); },[chat]);

  const join = async (player) => {
    setErr("");
    try {
      const res=await rget(`/rummy/${ROOM}/join?player=${player}`);
      if(res.ok) setMe(player);
      else setErr(res.msg||"Failed to join");
    } catch { setErr("Cannot reach server. Retry."); }
  };

  const drawCard = async (source) => {
    setErr(""); setIsNewCard(false);
    playDraw();
    try {
      await rpost(`/rummy/${ROOM}/draw?player=${me}&source=${source}`);
      await fetchState(me);
    } catch { setErr("Draw failed"); }
  };

  const discardSelected = async () => {
    if(selected.size!==1){ setErr("Tap one card to discard"); return; }
    const [key]=[...selected];
    // CRITICAL: must use original hand order (game.myHand), NOT the sorted display order
    const idx = game.myHand.findIndex(c => ckey(c) === key);
    if(idx<0){ setErr("Card not found — try again"); return; }
    setErr(""); setSelected(new Set());
    playDiscard();
    try {
      await rpost(`/rummy/${ROOM}/discard?player=${me}&card_index=${idx}`);
      await fetchState(me);
    } catch { setErr("Discard failed"); }
  };

  const submitDeclare = async (discardCard, groups) => {
    setDeclaring(false);
    playDeclareStab();
    try {
      const res=await rpost(`/rummy/${ROOM}/declare?player=${me}`,{discard:discardCard,groups});
      if(!res.valid){ setErr(res.reason||"Invalid declare"); playInvalid(); }
      await fetchState(me);
    } catch { setErr("Declare failed"); }
  };

  const dealAgain = async () => {
    prevWinner.current=null; setErr(""); setSelected(new Set());
    try { await rpost(`/rummy/${ROOM}/deal`); await fetchState(me); } catch {}
  };

  const leaveGame = async () => {
    await fetch(`${API}/rummy/${ROOM}/leave?player=${me}`,{method:"DELETE"}).catch(()=>{});
    setMe(null); setGame(null); setConn([]);
  };

  const sendChat = async (text) => {
    const msg=text.trim(); if(!msg||!me) return;
    setChatMsg(""); await rchat(ROOM,me,msg); await fetchState(me);
  };

  const sortedHand = useCallback(() => {
    if(!game?.myHand) return [];
    if(sortMode==="suit") return sortBySuit(game.myHand);
    if(sortMode==="rank") return sortByRank(game.myHand);
    return game.myHand;
  },[game?.myHand, sortMode]);

  const toggleSelected = (k) => {
    setSelected(prev=>{
      const n=new Set(prev); n.has(k)?n.delete(k):n.add(k); return n;
    });
  };

  // ── Declare modal overlay ──────────────────────────────────────────────────
  if (declaring && game) {
    return (
      <DeclareModal
        hand={sortedHand()}
        joker={game.joker}
        myColor={PLAYER_INFO[me]?.color||"#60a5fa"}
        onDeclare={submitDeclare}
        onCancel={()=>setDeclaring(false)}
      />
    );
  }

  // ── Joining screen ─────────────────────────────────────────────────────────
  if (!me) {
    const info=playerName?PLAYER_INFO[playerName]:null;
    return (
      <div style={st.wrap}>
        <button onClick={onBack} style={st.back}>← Back</button>
        <div style={st.loginBox}>
          <div style={{fontSize:56,textAlign:"center",marginBottom:16,animation:"float 2s ease-in-out infinite"}}>🃏</div>
          <h2 style={{color:"#fff",textAlign:"center",margin:"0 0 6px",fontSize:20}}>Indian Rummy</h2>
          {playerName?(
            <>
              <p style={{color:"#94a3b8",textAlign:"center",fontSize:14,margin:"0 0 20px"}}>
                {info?.emoji} Joining as <b style={{color:info?.color}}>{playerName}</b>…
              </p>
              {err?(
                <>
                  <p style={{color:"#ef4444",textAlign:"center",fontSize:13,marginBottom:12}}>{err}</p>
                  <button onClick={()=>join(playerName)} style={{...dm.actionBtn,width:"100%",background:info?.color}}>🔄 Retry</button>
                </>
              ):<div style={{textAlign:"center",color:"#475569",fontSize:13}}>Connecting…</div>}
            </>
          ):<p style={{color:"#ef4444",textAlign:"center",fontSize:14}}>Please go back and log in again.</p>}
        </div>
      </div>
    );
  }

  const other  = me==="Subhi"?"Viju":"Subhi";
  const myInfo = PLAYER_INFO[me];

  // ── Waiting ────────────────────────────────────────────────────────────────
  if (!game && conn.length<2) return (
    <div style={st.wrap}>
      <button onClick={leaveGame} style={st.back}>← Back</button>
      <div style={st.loginBox}>
        <div style={{fontSize:52,textAlign:"center",animation:"float 1.5s ease-in-out infinite"}}>⏳</div>
        <h2 style={{color:"#fff",textAlign:"center",fontSize:18,margin:"12px 0 6px"}}>Waiting for {other}…</h2>
        <p style={{color:"#94a3b8",textAlign:"center",fontSize:13}}>
          Ask {other} to open <b style={{color:"#a78bfa"}}>billingseasy.com/play/sv2026</b> → Rummy 🃏
        </p>
        <div style={{...st.badge,marginTop:16,animation:"cardPop 0.4s forwards"}}>✅ {me} connected</div>
        <div style={{...st.badge,background:"#374151",marginTop:8}}>⏳ Waiting for {other}</div>
      </div>
    </div>
  );

  if (!game) return (
    <div style={st.wrap}><button onClick={leaveGame} style={st.back}>← Back</button>
      <div style={{color:"#aaa",textAlign:"center",marginTop:40}}>Dealing cards…</div></div>
  );

  // ── Game ───────────────────────────────────────────────────────────────────
  const isMyTurn  = game.actor===me && game.stage==="playing";
  const canDraw   = isMyTurn && !game.drawn;
  const canDiscard= isMyTurn && game.drawn && selected.size===1;
  const canDeclare= isMyTurn && game.drawn;
  const hand      = sortedHand();

  return (
    <div style={st.wrap}>
      {showWin && game.winner && <Confetti winner={game.winner} me={me}/>}

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
        <button onClick={leaveGame} style={st.back}>← Leave</button>
        <h2 style={{flex:1,textAlign:"center",fontSize:16,fontWeight:700,margin:0}}>🃏 Indian Rummy</h2>
        <div style={{background:"#1e3a8a",padding:"4px 10px",borderRadius:20,fontSize:11,fontWeight:700,color:"#93c5fd",flexShrink:0}}>
          S:{game.scores?.Subhi||0} · V:{game.scores?.Viju||0}
        </div>
        <button onClick={()=>{toggleMute();setMuted(m=>!m);}} style={st.muteBtn} title={muted?"Unmute":"Mute"}>
          {muted?"🔇":"🔊"}
        </button>
      </div>

      {/* Opponent */}
      <OpponentStrip
        name={other} count={game.opponentCount} hand={game.opponentHand}
        isActor={game.actor===other&&game.stage==="playing"} joker={game.joker}
      />

      {/* Table */}
      <TableCenter
        stockCount={game.stockCount} discardTop={game.discardTop} joker={game.joker}
        canDraw={canDraw}
        onDrawStock={()=>drawCard("stock")}
        onDrawDiscard={()=>drawCard("discard")}
      />

      {/* Message */}
      <div style={{...st.msg,animation:"slideUp 0.3s forwards"}} key={game.msg}>{game.msg}</div>
      {game.invalidMsg&&<div style={{color:"#fca5a5",fontSize:12,textAlign:"center",marginTop:4}}>{game.invalidMsg}</div>}

      {/* My hand */}
      <div style={{...st.panel,borderColor:isMyTurn?myInfo.color:"rgba(255,255,255,0.1)",
        animation:isMyTurn?"glowPulse 2s infinite":"none","--glow":myInfo.glow}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <span style={{fontSize:13,fontWeight:700,color:isMyTurn?myInfo.color:"#e2e8f0"}}>
            {myInfo.emoji} {me} (You) {isMyTurn&&!game.drawn&&"— Draw a card!"}
            {isMyTurn&&game.drawn&&"— Discard or Declare"}
          </span>
          {selected.size>0&&(
            <button onClick={()=>setSelected(new Set())} style={{
              background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:12}}>
              clear
            </button>
          )}
        </div>
        <MyHand
          hand={hand} joker={game.joker} selected={selected}
          onToggle={toggleSelected} sortMode={sortMode} onSort={setSortMode}
          isNew={isNewCard}
        />
      </div>

      {/* Actions */}
      {game.stage==="playing" ? (
        isMyTurn ? (
          <div style={{display:"flex",gap:8,flexWrap:"wrap",animation:"cardPop 0.3s forwards"}}>
            {!game.drawn ? (
              <div style={{width:"100%",padding:"10px",borderRadius:12,
                background:"rgba(255,255,255,0.05)",border:"1px dashed rgba(255,255,255,0.15)",
                fontSize:13,color:"#64748b",textAlign:"center"}}>
                👆 Tap the <b style={{color:"#fff"}}>Stock</b> or <b style={{color:"#60a5fa"}}>Discard pile</b> above to draw
              </div>
            ) : (
              <>
                <button
                  onClick={canDiscard ? discardSelected : ()=>setErr("Tap one card in your hand first")}
                  style={{...dm.actionBtn, flex:1,
                    background: canDiscard ? "#ef4444" : "#374151",
                    opacity: canDiscard ? 1 : 0.55,
                    boxShadow: canDiscard ? "0 3px 14px rgba(239,68,68,0.5)" : "none"}}>
                  🗑️ {canDiscard ? "Discard selected" : "Select 1 card to discard"}
                </button>
                <button onClick={()=>setDeclaring(true)} style={{...dm.actionBtn,
                  flex:1,background:"linear-gradient(135deg,#f59e0b,#ef4444)",
                  boxShadow:"0 3px 14px rgba(245,158,11,0.5)",fontWeight:900}}>
                  🏆 Declare!
                </button>
              </>
            )}
          </div>
        ) : (
          <div style={{color:"#475569",fontSize:13,textAlign:"center",padding:"8px 0",
            animation:"float 2s ease-in-out infinite"}}>
            ⏳ Waiting for {other} to play…
          </div>
        )
      ) : (
        <div style={{textAlign:"center",padding:"8px 0"}}>
          {conn.length===2?(
            <button onClick={dealAgain} style={{...dm.actionBtn,
              background:"linear-gradient(135deg,#7c3aed,#4f46e5)",
              padding:"14px 36px",fontSize:16,
              boxShadow:"0 4px 20px rgba(124,58,237,0.5)",
              animation:"winPop 0.5s 0.2s both"}}>
              🃏 Deal Next Hand
            </button>
          ):(
            <div style={{color:"#aaa",fontSize:13}}>Waiting for {other} to reconnect…</div>
          )}
        </div>
      )}

      {err&&<div style={{color:"#fca5a5",fontSize:13,textAlign:"center",marginTop:4}}>{err}</div>}

      {/* Chat */}
      <ChatBox chat={chat} me={me} chatMsg={chatMsg}
        setChatMsg={setChatMsg} sendChat={sendChat} chatEndRef={chatEndRef}/>
    </div>
  );
}

const st = {
  wrap:{
    minHeight:"100vh",padding:"12px",maxWidth:520,margin:"0 auto",
    background:"linear-gradient(160deg,#0f172a 0%,#1e1b4b 60%,#0f172a 100%)",
    color:"#fff",fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column",gap:8,
  },
  loginBox:{margin:"40px auto 0",maxWidth:340,width:"100%",
    background:"rgba(255,255,255,0.06)",borderRadius:20,padding:"32px 24px",
    border:"1px solid rgba(255,255,255,0.12)"},
  back:{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",
    borderRadius:10,padding:"6px 12px",color:"#fff",cursor:"pointer",fontSize:13,fontFamily:"inherit"},
  muteBtn:{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",
    borderRadius:8,padding:"4px 8px",cursor:"pointer",fontSize:16,color:"#fff",flexShrink:0},
  msg:{background:"rgba(255,255,255,0.06)",borderRadius:12,padding:"10px 14px",
    fontSize:13,color:"#e2e8f0",textAlign:"center",lineHeight:1.5},
  panel:{padding:"12px",borderRadius:14,border:"2px solid",
    background:"rgba(255,255,255,0.04)",transition:"border-color 0.3s"},
  badge:{background:"#1e3a8a",color:"#93c5fd",borderRadius:10,padding:"8px 16px",fontSize:13,textAlign:"center"},
};
