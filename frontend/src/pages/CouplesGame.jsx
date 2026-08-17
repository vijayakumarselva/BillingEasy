/**
 * 💑 Couples Game Hub — private page for Subhi & Viju
 * URL: /play/sv2026   Password: SubhiViju26
 */
import { useState, useEffect } from "react";

const SECRET_PASSWORD = "SubhiViju26";
const SESSION_KEY = "cg_auth_sv";

// ── Mood / game modes ──────────────────────────────────────────────────────
const MODES = [
  {
    id: "romantic",
    emoji: "💕",
    title: "Romantic Mode",
    desc: "Sweet questions, love notes & surprises for each other",
    color: "#ff6b9d",
    bg: "linear-gradient(135deg,#ff6b9d22,#ff9ecd11)",
    border: "#ff6b9d44",
    coming: false,
  },
  {
    id: "challenge",
    emoji: "🎯",
    title: "Challenge Mode",
    desc: "Dare each other with fun couple challenges",
    color: "#f59e0b",
    bg: "linear-gradient(135deg,#f59e0b22,#fcd34d11)",
    border: "#f59e0b44",
    coming: false,
  },
  {
    id: "trivia",
    emoji: "🧠",
    title: "Know Each Other",
    desc: "How well do you really know your partner?",
    color: "#8b5cf6",
    bg: "linear-gradient(135deg,#8b5cf622,#a78bfa11)",
    border: "#8b5cf644",
    coming: false,
  },
  {
    id: "tod",
    emoji: "🎲",
    title: "Truth or Dare",
    desc: "Spicy truths and daring dares — couples edition",
    color: "#ef4444",
    bg: "linear-gradient(135deg,#ef444422,#fca5a511)",
    border: "#ef444444",
    coming: false,
  },
  {
    id: "memories",
    emoji: "📸",
    title: "Memory Lane",
    desc: "Relive your favourite moments together",
    color: "#06b6d4",
    bg: "linear-gradient(135deg,#06b6d422,#67e8f911)",
    border: "#06b6d444",
    coming: true,
  },
  {
    id: "wishlist",
    emoji: "🌟",
    title: "Bucket List",
    desc: "Add & tick off dreams you want to do together",
    color: "#10b981",
    bg: "linear-gradient(135deg,#10b98122,#6ee7b711)",
    border: "#10b98144",
    coming: true,
  },
];

// ── Password Gate ──────────────────────────────────────────────────────────
function PasswordGate({ onUnlock }) {
  const [pw, setPw] = useState("");
  const [shake, setShake] = useState(false);
  const [show, setShow] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const tryLogin = () => {
    if (pw === SECRET_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, "1");
      onUnlock();
    } else {
      setShake(true);
      setAttempts(a => a + 1);
      setTimeout(() => setShake(false), 600);
      setPw("");
    }
  };

  const hints = [
    "",
    "💡 Hint: It's a mix of your names + year",
    "💡 Hint: Starts with S, ends with 26",
    "💡 Hint: SubhiViju + 26",
  ];

  return (
    <div style={s.gate}>
      <div style={{ ...s.card, ...(shake ? s.shake : {}) }}>
        <div style={s.heartRow}>💑</div>
        <h1 style={s.gateTitle}>Our Little Corner</h1>
        <p style={s.gateSub}>This page is just for Subhi &amp; Viju 🥰</p>

        <div style={s.inputWrap}>
          <input
            type={show ? "text" : "password"}
            value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === "Enter" && tryLogin()}
            placeholder="Enter your secret password"
            style={s.input}
            autoFocus
          />
          <button onClick={() => setShow(v => !v)} style={s.eyeBtn}>
            {show ? "🙈" : "👁️"}
          </button>
        </div>

        {attempts > 0 && (
          <p style={s.hint}>{hints[Math.min(attempts, hints.length - 1)]}</p>
        )}

        <button onClick={tryLogin} style={s.unlockBtn}>
          🔓 Enter Our World
        </button>
      </div>
    </div>
  );
}

// ── Mode Card ──────────────────────────────────────────────────────────────
function ModeCard({ mode, onSelect }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={() => !mode.coming && onSelect(mode)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...s.modeCard,
        background: mode.bg,
        border: `1.5px solid ${hover && !mode.coming ? mode.color : mode.border}`,
        transform: hover && !mode.coming ? "translateY(-4px) scale(1.02)" : "none",
        cursor: mode.coming ? "default" : "pointer",
        opacity: mode.coming ? 0.65 : 1,
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 8 }}>{mode.emoji}</div>
      <h3 style={{ ...s.modeTitle, color: mode.color }}>{mode.title}</h3>
      <p style={s.modeDesc}>{mode.desc}</p>
      {mode.coming && (
        <span style={{ ...s.badge, background: mode.color + "33", color: mode.color }}>
          Coming Soon
        </span>
      )}
    </div>
  );
}

// ── Placeholder game screen ────────────────────────────────────────────────
function GameScreen({ mode, onBack }) {
  return (
    <div style={s.gameScreen}>
      <button onClick={onBack} style={s.backBtn}>← Back</button>
      <div style={{ textAlign: "center", marginTop: 60 }}>
        <div style={{ fontSize: 64 }}>{mode.emoji}</div>
        <h2 style={{ ...s.gateTitle, fontSize: 28, marginTop: 16 }}>{mode.title}</h2>
        <p style={{ color: "#888", marginTop: 8, fontSize: 15 }}>
          This game is being crafted just for you two. 🛠️<br />
          Check back soon!
        </p>
        <div style={{
          marginTop: 32, padding: "20px 32px", borderRadius: 16,
          background: mode.bg, border: `1px solid ${mode.border}`,
          display: "inline-block",
        }}>
          <p style={{ color: mode.color, fontWeight: 600 }}>
            {mode.title} is coming very soon 💫
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main Hub ───────────────────────────────────────────────────────────────
function GameHub({ onLogout }) {
  const [selected, setSelected] = useState(null);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (selected) return <GameScreen mode={selected} onBack={() => setSelected(null)} />;

  return (
    <div style={s.hub}>
      {/* Header */}
      <div style={s.hubHeader}>
        <div>
          <div style={s.greet}>{greeting} 💕</div>
          <h1 style={s.hubTitle}>Subhi &amp; Viju's Game World</h1>
          <p style={s.hubSub}>Pick your mood and let's play!</p>
        </div>
        <button onClick={onLogout} style={s.logoutBtn} title="Logout">🚪</button>
      </div>

      {/* Floating hearts */}
      <div style={s.heartsRow} aria-hidden>
        {["💕","🌹","✨","💫","🥰","💝","🌸","💖"].map((h, i) => (
          <span key={i} style={{ ...s.floatHeart, animationDelay: `${i * 0.4}s` }}>{h}</span>
        ))}
      </div>

      {/* Mode grid */}
      <div style={s.grid}>
        {MODES.map(m => (
          <ModeCard key={m.id} mode={m} onSelect={setSelected} />
        ))}
      </div>

      <p style={s.footer}>
        Made with ❤️ just for you two · Private &amp; secure
      </p>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────
export default function CouplesGame() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === "1") setAuthed(true);
  }, []);

  const logout = () => { sessionStorage.removeItem(SESSION_KEY); setAuthed(false); };

  return authed
    ? <GameHub onLogout={logout} />
    : <PasswordGate onUnlock={() => setAuthed(true)} />;
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = {
  gate: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "linear-gradient(135deg,#1a0533 0%,#0d1b3e 50%,#1a0533 100%)",
    padding: 20,
  },
  card: {
    background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)",
    border: "1px solid rgba(255,107,157,0.3)", borderRadius: 24,
    padding: "48px 40px", maxWidth: 400, width: "100%", textAlign: "center",
    boxShadow: "0 0 60px rgba(255,107,157,0.15)",
  },
  shake: {
    animation: "none",
    transform: "translateX(-8px)",
    transition: "transform 0.1s",
  },
  heartRow: { fontSize: 56, marginBottom: 16, lineHeight: 1 },
  gateTitle: {
    fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 8px",
    fontFamily: "Georgia, serif",
  },
  gateSub: { color: "#ffb3d1", fontSize: 14, margin: "0 0 28px" },
  inputWrap: { position: "relative", marginBottom: 12 },
  input: {
    width: "100%", padding: "14px 48px 14px 18px", borderRadius: 12,
    border: "1.5px solid rgba(255,107,157,0.4)", background: "rgba(255,255,255,0.08)",
    color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box",
    fontFamily: "inherit",
  },
  eyeBtn: {
    position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
    background: "none", border: "none", cursor: "pointer", fontSize: 18,
  },
  hint: { color: "#ffa0c8", fontSize: 13, margin: "0 0 16px", textAlign: "left" },
  unlockBtn: {
    width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
    background: "linear-gradient(135deg,#ff6b9d,#c53b8e)", color: "#fff",
    fontSize: 16, fontWeight: 600, cursor: "pointer", marginTop: 8,
    fontFamily: "inherit",
  },
  hub: {
    minHeight: "100vh",
    background: "linear-gradient(135deg,#1a0533 0%,#0d1b3e 50%,#1a0533 100%)",
    padding: "32px 24px 60px", overflowX: "hidden",
  },
  hubHeader: {
    maxWidth: 700, margin: "0 auto 8px", display: "flex",
    justifyContent: "space-between", alignItems: "flex-start",
  },
  greet: { color: "#ffb3d1", fontSize: 14, marginBottom: 4 },
  hubTitle: {
    fontSize: 28, fontWeight: 700, color: "#fff", margin: "0 0 4px",
    fontFamily: "Georgia, serif",
  },
  hubSub: { color: "#a78bfa", fontSize: 14, margin: 0 },
  logoutBtn: {
    background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontSize: 18,
    color: "#fff",
  },
  heartsRow: {
    display: "flex", gap: 16, justifyContent: "center", margin: "16px 0 28px",
    flexWrap: "wrap",
  },
  floatHeart: {
    fontSize: 20, animation: "float 3s ease-in-out infinite",
    display: "inline-block",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 20, maxWidth: 700, margin: "0 auto",
  },
  modeCard: {
    borderRadius: 20, padding: "28px 24px", transition: "all 0.25s ease",
    boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
  },
  modeTitle: { fontSize: 18, fontWeight: 700, margin: "0 0 6px", fontFamily: "inherit" },
  modeDesc: { color: "#ccc", fontSize: 13, margin: 0, lineHeight: 1.5 },
  badge: {
    display: "inline-block", marginTop: 10, padding: "3px 10px",
    borderRadius: 20, fontSize: 11, fontWeight: 600,
  },
  footer: { color: "#666", fontSize: 12, textAlign: "center", marginTop: 40 },
  gameScreen: {
    minHeight: "100vh",
    background: "linear-gradient(135deg,#1a0533 0%,#0d1b3e 50%,#1a0533 100%)",
    padding: "24px",
  },
  backBtn: {
    background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
    color: "#fff", borderRadius: 10, padding: "8px 18px", cursor: "pointer",
    fontSize: 14, fontFamily: "inherit",
  },
};
