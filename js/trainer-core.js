// ═══════════════════════════════════════════════════
// Trainer Core — Shared infrastructure for exercises
// Requires: shared.js (NOTES, A4, TUNINGS, freqToNote, yinDetect, rms)
// ═══════════════════════════════════════════════════

const NT_NATURAL = ['C','D','E','F','G','A','B'];
const NT_TUNING = TUNINGS.std.tuning;
const NT_STR_NAMES = TUNINGS.std.stringNames;
const BASE_MIDI = [40, 45, 50, 55, 59, 64];

const st = {
  phase:'idle', diff:'beginner', recall:false,
  score:0, streak:0, best:0, correct:0, attempts:0,
  holdStart:0, wrongHold:0, wrongCd:0,
  timerLeft:0, timerRef:null,
  audioCtx:null, analyser:null, stream:null, rafId:null, buf:null
};

// Exercise callbacks — set by exercise JS before calling tcInit()
const EX = { diffCfg:null, detect:null, next:null, skip:null, timeout:null, reset:null, hasMode:true, elIds:[] };

const $ = id => document.getElementById(id);
const els = {};

function tcInitEls() {
  ['ntScore','ntStreak','ntAcc','ntBest','ntDiff','ntMode',
   'ntTimer','ntFretboard','ntFbWrap','ntDetected','ntCentsLbl','ntCentsInd',
   'ntHz','ntMsg','ntStart','ntSkip','ntStop','ntReset'
  ].concat(EX.elIds).forEach(id => { const e = $(id); if (e) els[id] = e; });
}

function noteAt(s, f) { return NOTES[(NT_TUNING[s] + f) % 12]; }

function fretForNote(s, n, max) {
  const b = NT_TUNING[s], ni = NOTES.indexOf(n), r = [];
  for (let f = 0; f <= max; f++) if ((b + f) % 12 === ni) r.push(f);
  return r;
}

function renderFB(target, detected, isCorrect) {
  const WIN = 5;
  let sf = Math.max(0, target.fret - 2);
  if (sf + WIN > 22) sf = Math.max(0, 22 - WIN);
  const FL = 42, FR = 380, TOP = 18, FH = 30;
  const FW = (FR - FL) / WIN, W = FR + 16, H = TOP + 6 * FH + 14;
  const isOpen = sf === 0;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  s += `<rect x="${FL-4}" y="${TOP}" width="${FR-FL+8}" height="${6*FH}" rx="3" fill="#1a1a2e"/>`;
  for (let i = 0; i <= WIN; i++) {
    const x = FL + i * FW;
    s += i === 0 && isOpen
      ? `<rect x="${x-2}" y="${TOP}" width="4" height="${6*FH}" rx="2" fill="#ddd"/>`
      : `<line x1="${x}" y1="${TOP}" x2="${x}" y2="${TOP+6*FH}" stroke="#333" stroke-width="1.2"/>`;
  }
  for (let i = 0; i < 6; i++) {
    const ri = 5 - i, y = TOP + i * FH + FH / 2;
    s += `<line x1="${FL}" y1="${y}" x2="${FR}" y2="${y}" stroke="#444" stroke-width="${2.2-ri*.25}"/>`;
    s += `<text x="${FL-16}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="#444" font-size="13" font-family="JetBrains Mono">${NT_STR_NAMES[ri]}</text>`;
  }
  for (let i = 0; i < WIN; i++) {
    const x = FL + i * FW + FW / 2;
    s += `<text x="${x}" y="${TOP+6*FH+11}" text-anchor="middle" fill="#444" font-size="11" font-family="JetBrains Mono">${sf+i+1}</text>`;
  }
  const inlays = [3,5,7,9,15,17,19,21];
  for (let i = 0; i < WIN; i++) {
    const fn = sf + i + 1, x = FL + i * FW + FW / 2;
    if (inlays.includes(fn)) s += `<circle cx="${x}" cy="${TOP-6}" r="2.5" fill="#333"/>`;
    if (fn === 12) {
      s += `<circle cx="${x-5}" cy="${TOP-6}" r="2.5" fill="#333"/>`;
      s += `<circle cx="${x+5}" cy="${TOP-6}" r="2.5" fill="#333"/>`;
    }
  }
  const tfr = target.fret - sf;
  if (tfr >= 0 && tfr <= WIN) {
    const cy = TOP + (5 - target.str) * FH + FH / 2;
    const cx = target.fret === 0 ? FL + 2 : FL + (tfr - 1) * FW + FW / 2;
    const col = isCorrect ? '#4ECB71' : '#58A6FF';
    s += `<circle cx="${cx}" cy="${cy}" r="16" fill="${col}" opacity=".15"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="12" fill="${col}"/>`;
    const fs = target.note.length > 1 ? 10 : 13;
    s += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="${fs}" font-weight="bold" font-family="JetBrains Mono">${target.note}</text>`;
  }
  s += `</svg>`;
  return s;
}

// ═══ Difficulty ═══
function renderDiff() {
  const cfg = EX.diffCfg();
  if (!cfg[st.diff]) st.diff = 'beginner';
  els.ntDiff.innerHTML = Object.keys(cfg).map(k =>
    `<div class="pill${st.diff===k?' on':''}" title="${cfg[k].tip}" onclick="setDiff('${k}')">${cfg[k].label}</div>`
  ).join('');
}
function setDiff(d) { if (st.phase !== 'idle') return; st.diff = d; renderDiff(); }

// ═══ Mode toggle ═══
function renderMode() {
  if (!EX.hasMode || !els.ntMode) return;
  els.ntMode.innerHTML =
    `<div class="pill${st.recall?'':' on'}" title="Shows position & fretboard" onclick="setMode(false)">Guided</div>` +
    `<div class="pill${st.recall?' on':''}" title="Hides position — you recall it" onclick="setMode(true)">Recall</div>`;
}
function setMode(r) { if (st.phase !== 'idle') return; st.recall = r; renderMode(); }

// ═══ Stats & UI ═══
function updateStats() {
  els.ntScore.textContent = st.score;
  els.ntStreak.textContent = st.streak;
  els.ntBest.textContent = st.best;
  els.ntAcc.textContent = st.attempts > 0 ? Math.round(st.correct / st.attempts * 100) + '%' : '\u2014';
}

function showPhase() {
  const r = st.phase !== 'idle';
  els.ntStart.style.display = r ? 'none' : '';
  els.ntSkip.style.display = r ? '' : 'none';
  els.ntStop.style.display = r ? '' : 'none';
  els.ntReset.style.display = st.score > 0 || st.attempts > 0 ? '' : 'none';
}

function showDetected(note, cents, hz, correct) {
  if (!note) {
    els.ntDetected.textContent = '\u2014';
    els.ntDetected.className = 'nt-detect-note';
    els.ntCentsLbl.textContent = '';
    els.ntCentsInd.style.left = '50%';
    els.ntHz.textContent = '';
    return;
  }
  els.ntDetected.textContent = note;
  els.ntDetected.className = 'nt-detect-note ' + (correct ? 'nt-correct' : 'nt-wrong');
  els.ntCentsLbl.textContent = (cents > 0 ? '+' : '') + cents + ' cents';
  els.ntCentsInd.style.left = Math.max(5, Math.min(95, 50 + cents / 50 * 45)) + '%';
  els.ntHz.textContent = hz.toFixed(1) + ' Hz';
}

// ═══ Audio ═══
async function startAudio() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}
    });
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 8192;
    src.connect(an);
    st.audioCtx = ctx; st.analyser = an; st.stream = stream;
    st.buf = new Float32Array(an.fftSize);
    return true;
  } catch(e) {
    els.ntMsg.textContent = 'Mic access denied. Please allow microphone and try again.';
    els.ntMsg.className = 'nt-msg nt-err';
    return false;
  }
}

function stopAudio() {
  if (st.rafId) { cancelAnimationFrame(st.rafId); st.rafId = null; }
  if (st.stream) { st.stream.getTracks().forEach(t => t.stop()); st.stream = null; }
  if (st.audioCtx) { st.audioCtx.close(); st.audioCtx = null; }
  st.analyser = null; st.buf = null;
}

// ═══ Detection loop ═══
function detectLoop() {
  if (st.phase === 'idle' || !st.analyser) return;
  st.analyser.getFloatTimeDomainData(st.buf);
  if (rms(st.buf) < 0.003) {
    showDetected(null); st.holdStart = 0;
    st.rafId = requestAnimationFrame(detectLoop); return;
  }
  const hz = yinDetect(st.buf, st.audioCtx.sampleRate);
  if (!hz || hz < 50 || hz > 1400) {
    showDetected(null); st.holdStart = 0;
    st.rafId = requestAnimationFrame(detectLoop); return;
  }
  const {note, cents, semi} = freqToNote(hz);
  EX.detect(note, cents, hz, semi);
  st.rafId = requestAnimationFrame(detectLoop);
}

// ═══ Timer ═══
function startTimer() {
  clearTimer();
  const d = EX.diffCfg()[st.diff];
  if (!d.timer) { els.ntTimer.textContent = ''; return; }
  st.timerLeft = d.timer;
  els.ntTimer.textContent = st.timerLeft;
  st.timerRef = setInterval(() => {
    st.timerLeft--;
    els.ntTimer.textContent = st.timerLeft > 0 ? st.timerLeft : '';
    if (st.timerLeft <= 0) { clearTimer(); EX.timeout(); }
  }, 1000);
}

function clearTimer() {
  if (st.timerRef) { clearInterval(st.timerRef); st.timerRef = null; }
  els.ntTimer.textContent = '';
}

// ═══ Scoring ═══
function onWrong() {
  st.streak = 0; st.attempts++;
  const pen = Math.min(st.score, 5);
  st.score -= pen;
  st.wrongCd = performance.now(); st.wrongHold = 0;
  updateStats();
  els.ntMsg.textContent = pen > 0 ? '\u2212' + pen + ' points' : 'Wrong!';
  els.ntMsg.className = 'nt-msg nt-err';
}

function scoreCorrect(base, mult) {
  st.phase = 'success'; st.correct++; st.attempts++; st.streak++;
  if (st.streak > st.best) st.best = st.streak;
  let pts = base + st.streak * mult;
  if (st.streak === 5) pts += 20;
  if (st.streak === 10) pts += 50;
  st.score += pts;
  clearTimer(); updateStats();
  return pts;
}

function checkHold(isCorrect, onConfirm) {
  if (isCorrect && st.phase === 'listening') {
    st.wrongHold = 0;
    if (!st.holdStart) st.holdStart = performance.now();
    if (performance.now() - st.holdStart >= 300) { onConfirm(); return; }
  } else {
    st.holdStart = 0;
    if (!isCorrect && st.phase === 'listening') {
      if (!st.wrongHold) st.wrongHold = performance.now();
      const now = performance.now();
      if (now - st.wrongHold >= 600 && now - st.wrongCd >= 2000) onWrong();
    } else {
      st.wrongHold = 0;
    }
  }
}

// ═══ Flow ═══
function nextChallenge() {
  st.holdStart = 0; st.phase = 'listening';
  showDetected(null);
  EX.next();
  els.ntMsg.className = 'nt-msg';
  startTimer();
}

async function onStart() {
  if (!await startAudio()) return;
  st.phase = 'listening';
  showPhase();
  nextChallenge();
  detectLoop();
}

function onStop() {
  st.phase = 'idle'; stopAudio(); clearTimer();
  showPhase(); showDetected(null);
  els.ntMsg.textContent = 'Stopped. Press Start to resume.';
  els.ntMsg.className = 'nt-msg';
}

function onReset() {
  onStop();
  st.score = 0; st.streak = 0; st.best = 0; st.correct = 0; st.attempts = 0;
  updateStats();
  if (EX.reset) EX.reset();
  els.ntMsg.textContent = 'Press Start to begin';
  els.ntMsg.className = 'nt-msg';
  showPhase();
}

function tcInit() {
  tcInitEls();
  renderDiff();
  if (EX.hasMode) renderMode();
  updateStats(); showPhase();
  if (EX.reset) EX.reset();
  els.ntStart.addEventListener('click', onStart);
  els.ntSkip.addEventListener('click', () => EX.skip());
  els.ntStop.addEventListener('click', onStop);
  els.ntReset.addEventListener('click', onReset);
}

window.setDiff = setDiff;
window.setMode = setMode;
