/**
 * 🔊 Web Audio API sound synthesis — no external files, no CDN
 * All sounds generated programmatically.
 */

let _ctx = null;
let _muted = localStorage.getItem("gameSfxMuted") === "1";

function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

export function isMuted() { return _muted; }
export function toggleMute() {
  _muted = !_muted;
  localStorage.setItem("gameSfxMuted", _muted ? "1" : "0");
  return _muted;
}

// ── Primitives ────────────────────────────────────────────────────────────────

function tone(freq, dur, { type="sine", vol=0.25, at=0, attack=0.005, decay=0 } = {}) {
  if (_muted) return;
  const c = ctx(); const t = c.currentTime + at;
  const osc = c.createOscillator();
  const g   = c.createGain();
  osc.connect(g); g.connect(c.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (decay) g.gain.setValueAtTime(vol * decay, t + attack);
  osc.start(t); osc.stop(t + dur + 0.05);
}

function slide(f0, f1, dur, { type="sine", vol=0.2, at=0 } = {}) {
  if (_muted) return;
  const c = ctx(); const t = c.currentTime + at;
  const osc = c.createOscillator();
  const g   = c.createGain();
  osc.connect(g); g.connect(c.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.start(t); osc.stop(t + dur + 0.05);
}

function noise(dur, { vol=0.12, at=0, lpFreq=4000, hpFreq=200 } = {}) {
  if (_muted) return;
  const c = ctx(); const t = c.currentTime + at;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const lp  = c.createBiquadFilter(); lp.type = "lowpass";  lp.frequency.value = lpFreq;
  const hp  = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = hpFreq;
  const g   = c.createGain();
  src.connect(lp); lp.connect(hp); hp.connect(g); g.connect(c.destination);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.start(t); src.stop(t + dur + 0.05);
}

// ── Card sounds ───────────────────────────────────────────────────────────────

/** Short swish — card dealt from deck */
export function playCardDeal() {
  noise(0.07, { vol: 0.18, lpFreq: 5000, hpFreq: 1000 });
  tone(900, 0.05, { type:"square", vol: 0.06, attack: 0.002 });
}

/** Crisp snap — card flipped face-up */
export function playCardFlip() {
  noise(0.04, { vol: 0.22, lpFreq: 8000, hpFreq: 2000 });
  tone(1400, 0.04, { type:"square", vol: 0.05, attack: 0.001, at: 0.01 });
}

/** Soft thud — card placed on table */
export function playCardPlace() {
  noise(0.06, { vol: 0.15, lpFreq: 800, hpFreq: 60 });
  tone(180, 0.08, { type:"sine", vol: 0.15, attack: 0.003 });
}

// ── Poker action sounds ───────────────────────────────────────────────────────

/** Bright double-ping — it's your turn! */
export function playYourTurn() {
  tone(880,  0.14, { vol: 0.28, attack: 0.005 });
  tone(1100, 0.10, { vol: 0.18, attack: 0.005, at: 0.1 });
}

/** Metallic chip clink — check or call */
export function playChip() {
  tone(1200, 0.12, { type:"triangle", vol: 0.22, attack: 0.003 });
  tone(1800, 0.08, { type:"sine",     vol: 0.12, attack: 0.002, at: 0.03 });
}

/** Ascending chips — raise */
export function playRaise() {
  [600, 800, 1000].forEach((f, i) =>
    tone(f, 0.14, { type:"sine", vol: 0.18, attack: 0.005, at: i * 0.055 })
  );
}

/** Descending whoosh — fold */
export function playFold() {
  noise(0.25, { vol: 0.2, lpFreq: 3000, hpFreq: 200 });
  slide(600, 160, 0.28, { type:"sine", vol: 0.18 });
}

/** Escalating burst — all-in */
export function playAllIn() {
  noise(0.12, { vol: 0.25, lpFreq: 6000, hpFreq: 300 });
  [300, 500, 700, 900, 1100].forEach((f, i) =>
    tone(f, 0.18, { type:"sawtooth", vol: 0.09, at: i * 0.04 })
  );
}

// ── Win / Lose ────────────────────────────────────────────────────────────────

/** Joyful ascending arpeggio + chord */
export function playWin() {
  const C = [523, 659, 784, 1047]; // C E G C
  C.forEach((f, i) => tone(f, 0.35, { vol: 0.22, attack: 0.01, at: i * 0.11 }));
  // final chord shimmer
  [523, 659, 784].forEach((f, i) =>
    tone(f, 0.7, { vol: 0.14, attack: 0.02, at: C.length * 0.11 + i * 0.02 })
  );
}

/** Sad descending tones */
export function playLose() {
  [440, 330, 262].forEach((f, i) =>
    tone(f, 0.45, { type:"triangle", vol: 0.2, attack: 0.01, at: i * 0.14 })
  );
}

// ── Rummy-specific ────────────────────────────────────────────────────────────

/** Card drawn from pile — swish + click */
export function playDraw() {
  noise(0.09, { vol: 0.16, lpFreq: 5000, hpFreq: 800 });
  tone(750, 0.07, { type:"square", vol: 0.07, attack: 0.002, at: 0.02 });
}

/** Card discarded — soft slap */
export function playDiscard() {
  noise(0.05, { vol: 0.14, lpFreq: 1200, hpFreq: 100 });
  tone(220, 0.07, { type:"sine", vol: 0.12, attack: 0.003 });
}

/** Meld formed — satisfying chord snap */
export function playGroupForm() {
  tone(523, 0.12, { vol: 0.20, attack: 0.005 });
  tone(659, 0.10, { vol: 0.15, attack: 0.005, at: 0.04 });
  tone(784, 0.08, { vol: 0.12, attack: 0.005, at: 0.08 });
}

/** Invalid group tap — soft buzz */
export function playInvalid() {
  tone(180, 0.18, { type:"sawtooth", vol: 0.15, attack: 0.003 });
}

/** Declare chosen — dramatic rising stab */
export function playDeclareStab() {
  [349, 440, 523, 659, 784, 1047].forEach((f, i) =>
    tone(f, 0.18, { vol: 0.2, attack: 0.005, at: i * 0.06 })
  );
  noise(0.18, { vol: 0.1, lpFreq: 4000, hpFreq: 500, at: 0.1 });
}

/** New hand dealt — multiple card sounds */
export function playDealHand(count = 13) {
  for (let i = 0; i < Math.min(count, 6); i++) {
    const at = i * 0.06;
    noise(0.06, { vol: 0.12, lpFreq: 5000, hpFreq: 1000, at });
    tone(800 + i * 40, 0.05, { type:"square", vol: 0.05, at: at + 0.01 });
  }
}
