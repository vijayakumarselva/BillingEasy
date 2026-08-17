/**
 * 🃏 Multiplayer Texas Hold'em — Subhi & Viju
 * Each plays on their own device. Cards hidden from opponent.
 */
import { useState, useEffect, useRef, useCallback } from "react";

const API = process.env.REACT_APP_BACKEND_URL || "https://billingeasy-backend-production.up.railway.app/api";
const POKER_API = API.replace(/\/api$/, ""); // poker routes are on root, not /api
const ROOM = "sv2026";
const RED = new Set(["H","D"]);
const SUIT_SYM = { S:"♠", H:"♥", D:"♦", C:"♣" };
const HAND_NAMES = ["High Card","One Pair","Two Pair","Three of a Kind","Straight","Flush","Full House","Four of a Kind","Straight Flush","Royal Flush"];
const PLAYER_INFO = {
  Subhi: { emoji:"👩‍🦱", color:"#f472b6" },
  Viju:  { emoji:"👨‍🦱", color:"#60a5fa" },
};

// ── API helpers ────────────────────────────────────────────────────────────
const pget  = (path) => fetch(`${POKER_API}${path}`).then(r=>r.json());
const ppost = (path) => fetch(`${POKER_API}${path}`,{method:"POST"}).then(r=>r.json());

// ── Card component ─────────────────────────────────────────────────────────
function Card({ card, faceDown, small }) {
  const w = small ? 40 : 52, h = small ? 58 : 76;
  if (!card || faceDown) return (
    <div style={{
      width:w, height:h, borderRadius:7,
      background:"linear-gradient(135deg,#1e3a8a,#3730a3)",
      border:"2px solid rgba(255,255,255,0.2)",
      display:"flex", alignItems:"center", justifyContent:"center",
      boxShadow:"0 2px 8px rgba(0,0,0,0.5)",
      fontSize: small ? 18 : 24,
    }}>🂠</div>
  );
  const red = RED.has(card.s);
  const sym = SUIT_SYM[card.s] || card.s;
  return (
    <div style={{
      width:w, height:h, borderRadius:7, background:"#fff",
      display:"flex", flexDirection:"column", justifyContent:"space-between",
      padding:"3px 5px", boxSizing:"border-box",
      boxShadow:"0 2px 10px rgba(0,0,0,0.5)", color: red?"#e74c3c":"#111",
    }}>
      <div style={{fontSize: small?11:13, fontWeight:700, lineHeight:1}}>{card.r}<br/>{sym}</div>
      <div style={{fontSize: small?18:22, textAlign:"center"}}>{sym}</div>
    </div>
  );
}

// ── Opponent strip (cards hidden) ──────────────────────────────────────────
function OpponentRow({ name, data, isActor }) {
  const info = PLAYER_INFO[name] || {};
  if (!data) return null;
  return (
    <div style={{...st.row, borderColor: isActor ? info.color : "rgba(255,255,255,0.1)"}}>
      <div style={st.rowLeft}>
        <span style={{fontSize:32}}>{info.emoji}</span>
        <div>
          <div style={{fontWeight:700, color: isActor ? info.color:"#fff", fontSize:15}}>
            {name} {isActor && "⟵ thinking…"}
          </div>
          <div style={{color:"#a3e635", fontSize:13}}>💰 ₹{data.chips}</div>
          {data.folded && <div style={{color:"#ef4444",fontSize:12,fontWeight:700}}>FOLDED</div>}
        </div>
      </div>
      <div style={st.cards}>
        {data.hole ? data.hole.map((c,i)=><Card key={i} card={c} />) : [0,1].map(i=><Card key={i} faceDown />)}
        <div style={{color:"#64748b",fontSize:12,textAlign:"center"}}>
          {data.hole ? "Revealed!" : "Hidden 🙈"}
        </div>
      </div>
    </div>
  );
}

// ── My row (cards visible) ─────────────────────────────────────────────────
function MyRow({ name, data, isActor, showCards, onToggle }) {
  const info = PLAYER_INFO[name] || {};
  if (!data) return null;
  return (
    <div style={{...st.row, borderColor: isActor ? info.color:"rgba(255,255,255,0.1)", background: isActor?"rgba(255,255,255,0.07)":"rgba(255,255,255,0.03)"}}>
      <div style={st.rowLeft}>
        <span style={{fontSize:32}}>{info.emoji}</span>
        <div>
          <div style={{fontWeight:700, color: isActor ? info.color:"#fff", fontSize:15}}>
            {name} (You) {isActor && "⟵ Your turn!"}
          </div>
          <div style={{color:"#a3e635",fontSize:13}}>💰 ₹{data.chips}</div>
          {data.folded && <div style={{color:"#ef4444",fontSize:12,fontWeight:700}}>FOLDED</div>}
        </div>
      </div>
      <div style={st.cards}>
        {(data.hole||[]).map((c,i)=><Card key={i} card={c} faceDown={!showCards}/>)}
        {!data.folded && (
          <button onClick={onToggle} style={st.peekBtn}>
            {showCards?"🙈 Hide":"👁️ Peek"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function PokerGame({ onBack }) {
  const [me,   setMe]   = useState(null);  // "Subhi" | "Viju"
  const [game, setGame] = useState(null);
  const [conn, setConn] = useState([]);
  const [showCards, setShowCards] = useState(false);
  const [err,  setErr]  = useState("");
  const [acting, setActing] = useState(false);
  const pollRef = useRef(null);

  // ── Poll state ───────────────────────────────────────────────────────────
  const fetchState = useCallback(async (player) => {
    try {
      const res = await pget(`/poker/${ROOM}/state?player=${player}`);
      if (res.ok) {
        setGame(res.game);
        setConn(res.connected || []);
        if (res.game?.stage !== "showdown") setShowCards(false);
      }
    } catch { /* network blip, ignore */ }
  }, []);

  useEffect(() => {
    if (!me) return;
    fetchState(me);
    pollRef.current = setInterval(() => fetchState(me), 1500);
    return () => clearInterval(pollRef.current);
  }, [me, fetchState]);

  // ── Join room ────────────────────────────────────────────────────────────
  const join = async (player) => {
    setErr("");
    try {
      const res = await pget(`/poker/${ROOM}/join?player=${player}`);
      if (res.ok) { setMe(player); }
      else setErr(res.msg || "Failed to join");
    } catch { setErr("Cannot reach game server. Try again."); }
  };

  // ── Game action ──────────────────────────────────────────────────────────
  const act = async (action, amount=0) => {
    if (acting) return;
    setActing(true);
    try {
      await ppost(`/poker/${ROOM}/action?player=${me}&action=${action}&amount=${amount}`);
      await fetchState(me);
    } catch (e) { setErr("Action failed"); }
    setActing(false);
  };

  const dealAgain = async () => {
    await ppost(`/poker/${ROOM}/deal`);
    setShowCards(false);
    await fetchState(me);
  };

  const leaveGame = async () => {
    await fetch(`${POKER_API}/poker/${ROOM}/leave?player=${me}`,{method:"DELETE"}).catch(()=>{});
    setMe(null); setGame(null); setConn([]);
  };

  // ── Login screen ─────────────────────────────────────────────────────────
  if (!me) return (
    <div style={st.wrap}>
      <button onClick={onBack} style={st.back}>← Back</button>
      <div style={st.loginBox}>
        <div style={{fontSize:56,textAlign:"center",marginBottom:16}}>🃏</div>
        <h2 style={{color:"#fff",textAlign:"center",margin:"0 0 6px",fontSize:22}}>Texas Hold'em</h2>
        <p style={{color:"#94a3b8",textAlign:"center",fontSize:14,margin:"0 0 28px"}}>
          Who are you? Each of you opens this page on your own phone.
        </p>
        {["Subhi","Viju"].map(p => (
          <button key={p} onClick={()=>join(p)} style={{
            display:"block", width:"100%", padding:"16px", marginBottom:12,
            borderRadius:14, border:"2px solid "+PLAYER_INFO[p].color,
            background:PLAYER_INFO[p].color+"22", color:"#fff",
            fontSize:18, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
          }}>
            {PLAYER_INFO[p].emoji} I am {p}
          </button>
        ))}
        {err && <p style={{color:"#ef4444",textAlign:"center",fontSize:13}}>{err}</p>}
      </div>
    </div>
  );

  const other = me==="Subhi"?"Viju":"Subhi";
  const myInfo = PLAYER_INFO[me];

  // ── Waiting for opponent ──────────────────────────────────────────────────
  if (!game && conn.length < 2) return (
    <div style={st.wrap}>
      <button onClick={leaveGame} style={st.back}>← Back</button>
      <div style={st.loginBox}>
        <div style={{fontSize:56,textAlign:"center"}}>⏳</div>
        <h2 style={{color:"#fff",textAlign:"center",fontSize:20,margin:"12px 0 6px"}}>
          Waiting for {other}…
        </h2>
        <p style={{color:"#94a3b8",textAlign:"center",fontSize:14}}>
          Ask {other} to open{" "}
          <b style={{color:"#a78bfa"}}>billingseasy.com/play/sv2026</b>{" "}
          and tap "{PLAYER_INFO[other].emoji} I am {other}"
        </p>
        <div style={{...st.badge, marginTop:20}}>✅ You ({me}) are connected</div>
        <div style={{...st.badge, background:"#374151", marginTop:8}}>
          ⏳ Waiting for {other}
        </div>
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
  const isMyTurn  = game.actor === me && !game.winner;
  const callAmt   = isMyTurn ? (game.currentBet - (myData?.roundBet||0)) : 0;
  const canCheck  = callAmt === 0;
  const commCards = game.commVisible || [];

  return (
    <div style={st.wrap}>
      {/* Header */}
      <div style={st.header}>
        <button onClick={leaveGame} style={st.back}>← Leave</button>
        <h2 style={st.title}>🃏 Texas Hold'em</h2>
        <div style={st.pot}>🏺 ₹{game.pot}</div>
      </div>

      {/* Opponent (top, cards hidden) */}
      <OpponentRow name={other} data={otherData} isActor={game.actor===other && !game.winner} />

      {/* Community cards */}
      <div style={st.commWrap}>
        <div style={st.stageLabel}>{(game.stage||"").toUpperCase()}</div>
        <div style={st.commRow}>
          {[0,1,2,3,4].map(i=>(
            <Card key={i} card={commCards[i]||null} faceDown={!commCards[i]} />
          ))}
        </div>
        {/* Showdown scores */}
        {game.stage==="showdown" && game.players && (
          <div style={{display:"flex",gap:20,justifyContent:"center",marginTop:8}}>
            {["Subhi","Viju"].map(p=>{
              const pd=game.players[p];
              if(!pd||pd.folded) return null;
              return <div key={p} style={{fontSize:12,color:game.winner===p?"#f59e0b":"#aaa"}}>
                <b>{p}</b>: {pd.winHand||""}
              </div>;
            })}
          </div>
        )}
      </div>

      {/* My cards (bottom) */}
      <MyRow
        name={me} data={myData}
        isActor={isMyTurn}
        showCards={showCards}
        onToggle={()=>setShowCards(v=>!v)}
      />

      {/* Message */}
      <div style={st.msg}>{game.msg}</div>

      {/* Actions */}
      {!game.winner ? (
        isMyTurn ? (
          <div style={st.actions}>
            <div style={{color:"#94a3b8",fontSize:13,marginBottom:10}}>
              {myInfo.emoji} Your turn — peek your cards first, then act
            </div>
            <div style={st.btnRow}>
              <Btn color="#ef4444" onClick={()=>act("fold")}    label="🏳️ Fold"      disabled={acting}/>
              {canCheck
                ? <Btn color="#3b82f6" onClick={()=>act("check")} label="✓ Check"    disabled={acting}/>
                : <Btn color="#3b82f6" onClick={()=>act("call")}  label={`📞 Call ₹${callAmt}`} disabled={acting||!myData?.chips}/>
              }
              {[20,40,80].filter(x=>myData?.chips>=(callAmt+x)).map(x=>(
                <Btn key={x} color="#8b5cf6" onClick={()=>act("raise",x)} label={`↑ +₹${x}`} disabled={acting}/>
              ))}
              {myData?.chips > callAmt && (
                <Btn color="#f59e0b" onClick={()=>act("raise", myData.chips-callAmt)} label="🔥 All In" disabled={acting}/>
              )}
            </div>
          </div>
        ) : (
          <div style={{...st.actions, color:"#94a3b8", fontSize:14, textAlign:"center"}}>
            ⏳ Waiting for {other} to act…
          </div>
        )
      ) : (
        <div style={{...st.actions, textAlign:"center"}}>
          {conn.length===2 ? (
            <>
              <button onClick={dealAgain} style={st.dealBtn}>🃏 Deal Next Hand</button>
              <div style={{color:"#aaa",fontSize:12,marginTop:10}}>
                Subhi: ₹{game.players?.Subhi?.chips||0} · Viju: ₹{game.players?.Viju?.chips||0}
              </div>
            </>
          ) : (
            <div style={{color:"#aaa",fontSize:13}}>Waiting for {other} to reconnect…</div>
          )}
        </div>
      )}

      {err && <div style={{color:"#ef4444",textAlign:"center",fontSize:13,marginTop:8}}>{err}</div>}
    </div>
  );
}

function Btn({onClick,color,label,disabled}){
  return (
    <button onClick={disabled?undefined:onClick} style={{
      padding:"10px 16px", borderRadius:12, border:"none",
      background:disabled?"#374151":color, color:"#fff", fontWeight:700,
      fontSize:14, cursor:disabled?"not-allowed":"pointer", fontFamily:"inherit",
      opacity:disabled?0.5:1, boxShadow:disabled?"none":`0 2px 12px ${color}55`,
      transition:"all 0.15s",
    }}>{label}</button>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const st = {
  wrap:{
    minHeight:"100vh", padding:"12px", maxWidth:520, margin:"0 auto",
    background:"linear-gradient(160deg,#0f172a 0%,#1e1b4b 60%,#0f172a 100%)",
    color:"#fff", fontFamily:"system-ui,sans-serif", display:"flex",
    flexDirection:"column", gap:6,
  },
  loginBox:{
    margin:"40px auto 0", maxWidth:340, width:"100%",
    background:"rgba(255,255,255,0.06)", borderRadius:20, padding:"32px 24px",
    border:"1px solid rgba(255,255,255,0.12)",
  },
  header:{ display:"flex", alignItems:"center", gap:10, marginBottom:4 },
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
    display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, flexWrap:"wrap",
    transition:"border-color 0.3s",
  },
  rowLeft:{ display:"flex", alignItems:"center", gap:10 },
  cards:{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" },
  peekBtn:{
    padding:"6px 12px", borderRadius:8, border:"1px solid rgba(255,255,255,0.2)",
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
    background:"#1e3a8a", color:"#93c5fd", borderRadius:10, padding:"8px 16px",
    fontSize:13, textAlign:"center",
  },
};
