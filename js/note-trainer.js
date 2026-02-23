// ═══════════════════════════════════════════════════
// Note Trainer — Pitch Detection + Gamified Practice
// Requires: shared.js (NOTES, A4, TUNINGS, freqToNote, yinDetect, rms)
// ═══════════════════════════════════════════════════

const NT_NATURAL = ['C','D','E','F','G','A','B'];
const NT_TUNING = TUNINGS.std.tuning;
const NT_STR_NAMES = TUNINGS.std.stringNames;
const BASE_MIDI = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4

const DIFF = {
  beginner:    {label:'Beginner',    maxFret:5,  naturalsOnly:true,  timer:0, tip:'Natural notes only · Frets 0–5'},
  intermediate:{label:'Intermediate',maxFret:12, naturalsOnly:false, timer:0, tip:'All 12 notes · Frets 0–12'},
  advanced:    {label:'Advanced',    maxFret:19, naturalsOnly:false, timer:10, tip:'All 12 notes · Frets 0–19 · 10s timer'}
};

// ═══ State ═══
let st = {
  phase:'idle', // idle | listening | success
  diff:'beginner',
  score:0, streak:0, best:0, correct:0, attempts:0,
  target:null, // {note, str, fret}
  recall:false,
  holdStart:0, wrongHold:0, wrongCd:0,
  timerLeft:0, timerRef:null,
  audioCtx:null, analyser:null, stream:null, rafId:null,
  buf:null
};

// ═══ DOM refs ═══
const $ = id => document.getElementById(id);
const els = {};
function initEls() {
  ['ntScore','ntStreak','ntAcc','ntBest','ntTarget','ntPos',
   'ntFretboard','ntFbWrap','ntDetected','ntCentsLbl','ntCentsInd',
   'ntHz','ntMsg','ntTimer','ntStart','ntSkip','ntStop','ntReset',
   'ntDiff','ntChallenge','ntDetect','ntMode'].forEach(id => els[id] = $(id));
}

// ═══ Difficulty pills ═══
function renderDiff() {
  els.ntDiff.innerHTML = Object.keys(DIFF).map(k =>
    `<div class="pill${st.diff===k?' on':''}" title="${DIFF[k].tip}" onclick="setDiff('${k}')">${DIFF[k].label}</div>`
  ).join('');
}

function setDiff(d) {
  if (st.phase !== 'idle') return;
  st.diff = d;
  renderDiff();
}

// ═══ Mode toggle ═══
function renderMode() {
  els.ntMode.innerHTML =
    `<div class="pill${st.recall?'':' on'}" title="Shows string, fret & fretboard" onclick="setMode(false)">Guided</div>` +
    `<div class="pill${st.recall?' on':''}" title="Shows note & string only — you recall the fret" onclick="setMode(true)">Recall</div>`;
}

function setMode(r) {
  if (st.phase !== 'idle') return;
  st.recall = r;
  renderMode();
}

// ═══ Note helpers ═══
function noteAt(str, fret) {
  return NOTES[(NT_TUNING[str] + fret) % 12];
}

function pickTarget() {
  const d = DIFF[st.diff];
  const candidates = [];
  for (let s = 0; s < 6; s++) {
    for (let f = 0; f <= d.maxFret; f++) {
      const n = noteAt(s, f);
      if (d.naturalsOnly && !NT_NATURAL.includes(n)) continue;
      candidates.push({note: n, str: s, fret: f, midi: BASE_MIDI[s] + f});
    }
  }
  // Avoid repeating same note+string
  let pick;
  do {
    pick = candidates[Math.floor(Math.random() * candidates.length)];
  } while (st.target && pick.note === st.target.note && pick.str === st.target.str && candidates.length > 6);
  return pick;
}

// ═══ SVG Fretboard — 5-fret sliding window ═══
function renderFB(target, detected, isCorrect) {
  const WIN = 5;
  let startFret = Math.max(0, target.fret - 2);
  if (startFret + WIN > 22) startFret = Math.max(0, 22 - WIN);

  const FRET_L = 42, FRET_R = 380, TOP = 18, FH = 30;
  const SP = (FRET_R - FRET_L) / 6;
  const FW = (FRET_R - FRET_L) / WIN;
  const W = FRET_R + 16, H = TOP + 6 * FH + 14;
  const isOpen = startFret === 0;

  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  // Background
  s += `<rect x="${FRET_L - 4}" y="${TOP}" width="${FRET_R - FRET_L + 8}" height="${6 * FH}" rx="3" fill="#1a1a2e"/>`;

  // Fret lines
  for (let i = 0; i <= WIN; i++) {
    const x = FRET_L + i * FW;
    s += i === 0 && isOpen
      ? `<rect x="${x - 2}" y="${TOP}" width="4" height="${6 * FH}" rx="2" fill="#ddd"/>`
      : `<line x1="${x}" y1="${TOP}" x2="${x}" y2="${TOP + 6 * FH}" stroke="#333" stroke-width="1.2"/>`;
  }

  // Strings (tab orientation: high e at top, low E at bottom)
  for (let i = 0; i < 6; i++) {
    const ri = 5 - i; // reverse: row 0 = string 5 (high e)
    const y = TOP + i * FH + FH / 2;
    s += `<line x1="${FRET_L}" y1="${y}" x2="${FRET_R}" y2="${y}" stroke="#444" stroke-width="${2.2 - ri * .25}"/>`;
    s += `<text x="${FRET_L - 16}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="#444" font-size="13" font-family="JetBrains Mono">${NT_STR_NAMES[ri]}</text>`;
  }

  // Fret numbers
  for (let i = 0; i < WIN; i++) {
    const fn = startFret + i + (isOpen ? 1 : 1);
    const x = FRET_L + i * FW + FW / 2;
    s += `<text x="${x}" y="${TOP + 6 * FH + 11}" text-anchor="middle" fill="#444" font-size="11" font-family="JetBrains Mono">${startFret + i + (isOpen ? 1 : 1)}</text>`;
  }

  // Inlay dots
  const inlays = [3,5,7,9,15,17,19,21];
  for (let i = 0; i < WIN; i++) {
    const fn = startFret + i + 1;
    if (inlays.includes(fn)) {
      const x = FRET_L + i * FW + FW / 2;
      s += `<circle cx="${x}" cy="${TOP - 6}" r="2.5" fill="#333"/>`;
    }
    if (fn === 12) {
      const x = FRET_L + i * FW + FW / 2;
      s += `<circle cx="${x - 5}" cy="${TOP - 6}" r="2.5" fill="#333"/>`;
      s += `<circle cx="${x + 5}" cy="${TOP - 6}" r="2.5" fill="#333"/>`;
    }
  }

  // Target dot
  const tFretRel = target.fret - startFret;
  if (tFretRel >= 0 && tFretRel <= WIN) {
    const cy = TOP + (5 - target.str) * FH + FH / 2;
    let cx;
    if (target.fret === 0) {
      cx = FRET_L + 2; // on the nut
    } else {
      cx = FRET_L + (tFretRel - 1) * FW + FW / 2;
    }
    const col = isCorrect ? '#4ECB71' : '#58A6FF';
    // Glow
    s += `<circle cx="${cx}" cy="${cy}" r="16" fill="${col}" opacity=".15"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="12" fill="${col}"/>`;
    const fs = target.note.length > 1 ? 10 : 13;
    s += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="${fs}" font-weight="bold" font-family="JetBrains Mono">${target.note}</text>`;
  }

  s += `</svg>`;
  return s;
}

// ═══ UI Updates ═══
function updateStats() {
  els.ntScore.textContent = st.score;
  els.ntStreak.textContent = st.streak;
  els.ntBest.textContent = st.best;
  els.ntAcc.textContent = st.attempts > 0
    ? Math.round(st.correct / st.attempts * 100) + '%' : '—';
}

function showPhase() {
  const running = st.phase !== 'idle';
  els.ntStart.style.display = running ? 'none' : '';
  els.ntSkip.style.display = running ? '' : 'none';
  els.ntStop.style.display = running ? '' : 'none';
  els.ntReset.style.display = st.score > 0 || st.attempts > 0 ? '' : 'none';
}

function showChallenge() {
  if (!st.target) {
    els.ntTarget.textContent = '—';
    els.ntTarget.classList.remove('nt-recall');
    els.ntPos.textContent = '';
    els.ntFretboard.innerHTML = '';
    return;
  }
  const t = st.target;
  els.ntTarget.textContent = t.note;
  const lbl = els.ntChallenge.querySelector('.nt-challenge-lbl');
  if (st.recall) {
    els.ntTarget.classList.add('nt-recall');
    els.ntPos.textContent = `on string ${NT_STR_NAMES[t.str]}`;
    els.ntFretboard.innerHTML = `<svg viewBox="0 0 396 212" xmlns="http://www.w3.org/2000/svg"><text x="198" y="106" text-anchor="middle" dominant-baseline="central" fill="#222" font-size="60" font-family="Outfit" font-weight="900">?</text></svg>`;
    lbl.textContent = 'Play this note';
  } else {
    els.ntTarget.classList.remove('nt-recall');
    els.ntPos.textContent = `String ${NT_STR_NAMES[t.str]} \u00b7 Fret ${t.fret}`;
    els.ntFretboard.innerHTML = renderFB(t, null, false);
    lbl.textContent = 'Find this note';
  }
}

function showDetected(note, cents, hz, correct) {
  if (!note) {
    els.ntDetected.textContent = '—';
    els.ntDetected.className = 'nt-detect-note';
    els.ntCentsLbl.textContent = '';
    els.ntCentsInd.style.left = '50%';
    els.ntHz.textContent = '';
    return;
  }
  els.ntDetected.textContent = note;
  els.ntDetected.className = 'nt-detect-note ' + (correct ? 'nt-correct' : 'nt-wrong');
  const sign = cents > 0 ? '+' : '';
  els.ntCentsLbl.textContent = `${sign}${cents} cents`;
  const pct = Math.max(5, Math.min(95, 50 + cents / 50 * 45));
  els.ntCentsInd.style.left = pct + '%';
  els.ntHz.textContent = hz.toFixed(1) + ' Hz';
}

// ═══ Audio / Pitch Detection ═══
async function startAudio() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {echoCancellation:false, noiseSuppression:false, autoGainControl:false}
    });
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 8192;
    src.connect(analyser);
    st.audioCtx = ctx;
    st.analyser = analyser;
    st.stream = stream;
    st.buf = new Float32Array(analyser.fftSize);
    return true;
  } catch (e) {
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
    showDetected(null);
    st.holdStart = 0;
    st.rafId = requestAnimationFrame(detectLoop);
    return;
  }

  const hz = yinDetect(st.buf, st.audioCtx.sampleRate);
  if (!hz || hz < 50 || hz > 1400) {
    showDetected(null);
    st.holdStart = 0;
    st.rafId = requestAnimationFrame(detectLoop);
    return;
  }

  const {note, cents, semi} = freqToNote(hz);
  const noteMatch = st.target && note === st.target.note;
  const octaveOk = !st.recall || !st.target || Math.abs((semi + 69) - st.target.midi) <= 1;
  const correct = noteMatch && octaveOk;
  showDetected(note, cents, hz, correct);

  if (noteMatch && !octaveOk && st.phase === 'listening') {
    els.ntMsg.textContent = 'Right note, wrong string!';
    els.ntMsg.className = 'nt-msg nt-err';
  }

  if (correct && st.phase === 'listening') {
    st.wrongHold = 0;
    if (!st.holdStart) st.holdStart = performance.now();
    if (performance.now() - st.holdStart >= 300) {
      onCorrect();
      st.rafId = requestAnimationFrame(detectLoop);
      return;
    }
  } else {
    st.holdStart = 0;
    // Wrong note penalty — held 600ms, 2s cooldown between penalties
    if (!correct && st.phase === 'listening' && st.target) {
      if (!st.wrongHold) st.wrongHold = performance.now();
      const now = performance.now();
      if (now - st.wrongHold >= 600 && now - st.wrongCd >= 2000) {
        onWrong();
      }
    } else {
      st.wrongHold = 0;
    }
  }

  st.rafId = requestAnimationFrame(detectLoop);
}

// ═══ Game logic ═══
function onWrong() {
  st.streak = 0;
  st.attempts++;
  const pen = Math.min(st.score, 5);
  st.score -= pen;
  st.wrongCd = performance.now();
  st.wrongHold = 0;
  updateStats();
  els.ntMsg.textContent = pen > 0 ? `−${pen} points` : 'Wrong!';
  els.ntMsg.className = 'nt-msg nt-err';
}

function onCorrect() {
  st.phase = 'success';
  st.correct++;
  st.attempts++;
  st.streak++;
  if (st.streak > st.best) st.best = st.streak;

  let pts = 10 + st.streak * 2;
  if (st.streak === 5) pts += 20;
  if (st.streak === 10) pts += 50;
  st.score += pts;

  clearTimer();
  updateStats();
  if (st.recall) els.ntPos.textContent = `Fret ${st.target.fret}`;
  els.ntFretboard.innerHTML = renderFB(st.target, null, true);
  els.ntFbWrap.classList.add('nt-success', 'nt-flash');
  els.ntMsg.textContent = `+${pts} points!`;
  els.ntMsg.className = 'nt-msg';

  setTimeout(() => {
    els.ntFbWrap.classList.remove('nt-success', 'nt-flash');
    if (st.phase === 'success') nextChallenge();
  }, st.recall ? 1200 : 800);
}

function onSkip() {
  st.streak = 0;
  st.attempts++;
  st.score = Math.max(0, st.score - 5);
  clearTimer();
  updateStats();
  if (st.recall && st.target) {
    els.ntPos.textContent = `Fret ${st.target.fret}`;
    els.ntFretboard.innerHTML = renderFB(st.target, null, false);
    els.ntMsg.textContent = `Was: Fret ${st.target.fret}`;
    els.ntMsg.className = 'nt-msg nt-err';
    setTimeout(() => nextChallenge(), 1500);
  } else {
    nextChallenge();
  }
}

function onTimeout() {
  st.streak = 0;
  st.attempts++;
  st.score = Math.max(0, st.score - 5);
  updateStats();
  if (st.recall && st.target) {
    els.ntPos.textContent = `Fret ${st.target.fret}`;
    els.ntFretboard.innerHTML = renderFB(st.target, null, false);
    els.ntMsg.textContent = `Time's up! Was: Fret ${st.target.fret}`;
    els.ntMsg.className = 'nt-msg nt-err';
  } else {
    els.ntMsg.textContent = 'Time\'s up!';
    els.ntMsg.className = 'nt-msg nt-err';
  }
  setTimeout(() => {
    if (st.phase === 'listening') nextChallenge();
  }, st.recall ? 1500 : 800);
}

function nextChallenge() {
  st.target = pickTarget();
  st.phase = 'listening';
  st.holdStart = 0;
  showChallenge();
  showDetected(null);
  els.ntMsg.textContent = 'Listening...';
  els.ntMsg.className = 'nt-msg';
  startTimer();
}

// ═══ Timer ═══
function startTimer() {
  clearTimer();
  const d = DIFF[st.diff];
  if (!d.timer) { els.ntTimer.textContent = ''; return; }
  st.timerLeft = d.timer;
  els.ntTimer.textContent = st.timerLeft;
  st.timerRef = setInterval(() => {
    st.timerLeft--;
    els.ntTimer.textContent = st.timerLeft > 0 ? st.timerLeft : '';
    if (st.timerLeft <= 0) {
      clearTimer();
      onTimeout();
    }
  }, 1000);
}

function clearTimer() {
  if (st.timerRef) { clearInterval(st.timerRef); st.timerRef = null; }
  els.ntTimer.textContent = '';
}

// ═══ Controls ═══
async function onStart() {
  const ok = await startAudio();
  if (!ok) return;
  st.phase = 'listening';
  showPhase();
  nextChallenge();
  detectLoop();
}

function onStop() {
  st.phase = 'idle';
  stopAudio();
  clearTimer();
  showPhase();
  showDetected(null);
  els.ntMsg.textContent = 'Stopped. Press Start to resume.';
  els.ntMsg.className = 'nt-msg';
}

function onReset() {
  onStop();
  st.score = 0; st.streak = 0; st.best = 0; st.correct = 0; st.attempts = 0;
  st.target = null;
  updateStats();
  showChallenge();
  els.ntMsg.textContent = 'Press Start to begin';
  els.ntMsg.className = 'nt-msg';
  showPhase();
}

// ═══ Init ═══
function init() {
  initEls();
  renderDiff();
  renderMode();
  updateStats();
  showPhase();
  showChallenge();

  els.ntStart.addEventListener('click', onStart);
  els.ntSkip.addEventListener('click', onSkip);
  els.ntStop.addEventListener('click', onStop);
  els.ntReset.addEventListener('click', onReset);
}

// Make setDiff accessible from onclick
window.setDiff = setDiff;
window.setMode = setMode;

init();
