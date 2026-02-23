// ═══════════════════════════════════════════════════
// Guitar Tuner — Pitch Detection + String Matching
// Requires: shared.js (NOTES, A4, TUNINGS, semiToFreq, freqToNote, yinDetect, rms)
// ═══════════════════════════════════════════════════

const LS_KEY = 'guitar-tuner-custom-tunings';

// Standard MIDI base notes for each string: E2=40, A2=45, D3=50, G3=55, B3=59, E4=64
const STD_MIDI = [40, 45, 50, 55, 59, 64];
const STD_SEMI = [4, 9, 2, 7, 11, 4]; // standard tuning semitone classes

// ═══ State ═══
let tu = {
  running: false,
  tuningId: 'std',
  tuning: [...TUNINGS.std.tuning],
  strNames: [...TUNINGS.std.stringNames],
  locked: -1, // -1 = auto-detect, 0-5 = locked string
  targetFreqs: [],
  tunedTimers: [0,0,0,0,0,0], // timestamps when string entered ±5 cents
  tunedFlags: [false,false,false,false,false,false],
  activeStr: -1,
  audioCtx: null, analyser: null, stream: null, rafId: null, buf: null,
  customOpen: false
};

// ═══ DOM ═══
const $ = id => document.getElementById(id);
const els = {};
function initEls() {
  ['tuTunSel','tuCustomBtn','tuCustom','tuCustomRow','tuApply','tuSave',
   'tuCancelCustom','tuSavedList','tuDetect','tuNote','tuCentsLbl','tuCentsInd',
   'tuHz','tuStrings','tuMsg','tuStart','tuStop'].forEach(id => els[id] = $(id));
}

// ═══ Target frequencies ═══
// Calculate target freq for each string based on tuning semitone offsets from standard
function calcTargetFreqs(tuning) {
  const freqs = [];
  for (let i = 0; i < 6; i++) {
    const diff = ((tuning[i] - STD_SEMI[i]) + 12) % 12;
    // Choose the smaller interval direction (up or down from standard)
    const semiOffset = diff <= 6 ? diff : diff - 12;
    const midi = STD_MIDI[i] + semiOffset;
    // MIDI note to freq: A4=440=MIDI69
    freqs.push(A4 * Math.pow(2, (midi - 69) / 12));
  }
  return freqs;
}

// ═══ Tuning dropdown ═══
function renderTuningDropdown() {
  const customs = loadCustomTunings();
  let html = '';
  Object.values(TUNINGS).forEach(t => {
    html += `<option value="${t.id}"${t.id === tu.tuningId ? ' selected' : ''}>${t.name} (${t.label})</option>`;
  });
  if (customs.length) {
    html += `<option disabled>────────</option>`;
    customs.forEach((c, i) => {
      html += `<option value="custom_${i}"${tu.tuningId === 'custom_' + i ? ' selected' : ''}>${c.name} (${c.label})</option>`;
    });
  }
  html += `<option value="__custom__">Custom...</option>`;
  els.tuTunSel.innerHTML = html;
}

function onTuningChange(val) {
  if (val === '__custom__') {
    openCustomEditor();
    // Reset dropdown to current tuning
    els.tuTunSel.value = tu.tuningId;
    return;
  }
  if (val.startsWith('custom_')) {
    const idx = parseInt(val.split('_')[1]);
    const customs = loadCustomTunings();
    if (customs[idx]) {
      tu.tuningId = val;
      tu.tuning = [...customs[idx].tuning];
      tu.strNames = [...customs[idx].stringNames];
    }
  } else if (TUNINGS[val]) {
    tu.tuningId = val;
    tu.tuning = [...TUNINGS[val].tuning];
    tu.strNames = [...TUNINGS[val].stringNames];
  }
  tu.targetFreqs = calcTargetFreqs(tu.tuning);
  resetTuned();
  tu.locked = -1;
  renderStrings();
  renderTuningDropdown();
}

// ═══ Custom tuning editor ═══
function openCustomEditor() {
  tu.customOpen = true;
  els.tuCustom.classList.add('tu-open');
  renderCustomRow();
  renderSavedList();
}

function closeCustomEditor() {
  tu.customOpen = false;
  els.tuCustom.classList.remove('tu-open');
}

function renderCustomRow() {
  const labels = ['6th','5th','4th','3rd','2nd','1st'];
  let html = '';
  for (let i = 0; i < 6; i++) {
    html += `<div class="tu-custom-str">`;
    html += `<label>${labels[i]}</label>`;
    html += `<select data-str="${i}">`;
    NOTES.forEach((n, ni) => {
      html += `<option value="${ni}"${ni === tu.tuning[i] ? ' selected' : ''}>${n}</option>`;
    });
    html += `</select></div>`;
  }
  els.tuCustomRow.innerHTML = html;
}

function getCustomValues() {
  const selects = els.tuCustomRow.querySelectorAll('select');
  const tuning = [];
  const names = [];
  selects.forEach(sel => {
    const val = parseInt(sel.value);
    tuning.push(val);
    const idx = parseInt(sel.dataset.str);
    // Uppercase for low strings (0-4), lowercase for highest (5)
    names.push(idx === 5 ? NOTES[val].toLowerCase() : NOTES[val]);
  });
  return { tuning, stringNames: names, label: names.join('') };
}

function applyCustom() {
  const c = getCustomValues();
  tu.tuningId = '__applied__';
  tu.tuning = c.tuning;
  tu.strNames = c.stringNames;
  tu.targetFreqs = calcTargetFreqs(tu.tuning);
  resetTuned();
  tu.locked = -1;
  renderStrings();
  renderTuningDropdown();
  // Set dropdown to show nothing special since it's unsaved
  els.tuTunSel.value = tu.tuningId;
  closeCustomEditor();
}

function saveCustom() {
  const c = getCustomValues();
  const name = prompt('Tuning name:');
  if (!name || !name.trim()) return;
  const customs = loadCustomTunings();
  customs.push({ name: name.trim(), label: c.label, tuning: c.tuning, stringNames: c.stringNames });
  localStorage.setItem(LS_KEY, JSON.stringify(customs));
  // Apply and select
  const idx = customs.length - 1;
  tu.tuningId = 'custom_' + idx;
  tu.tuning = c.tuning;
  tu.strNames = c.stringNames;
  tu.targetFreqs = calcTargetFreqs(tu.tuning);
  resetTuned();
  tu.locked = -1;
  renderStrings();
  renderTuningDropdown();
  renderSavedList();
  closeCustomEditor();
}

function loadCustomTunings() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || [];
  } catch { return []; }
}

function deleteCustomTuning(idx) {
  const customs = loadCustomTunings();
  customs.splice(idx, 1);
  localStorage.setItem(LS_KEY, JSON.stringify(customs));
  // If we deleted the active tuning, revert to standard
  if (tu.tuningId === 'custom_' + idx) {
    onTuningChange('std');
  } else if (tu.tuningId.startsWith('custom_')) {
    // Recalculate index if needed
    const curIdx = parseInt(tu.tuningId.split('_')[1]);
    if (curIdx > idx) tu.tuningId = 'custom_' + (curIdx - 1);
  }
  renderTuningDropdown();
  renderSavedList();
}

function renderSavedList() {
  const customs = loadCustomTunings();
  if (!customs.length) { els.tuSavedList.innerHTML = ''; return; }
  let html = '';
  customs.forEach((c, i) => {
    html += `<div class="tu-saved-item">`;
    html += `<button class="tu-btn tu-small" onclick="onTuningChange('custom_${i}');closeCustomEditor()">${c.name} (${c.label})</button>`;
    html += `<button class="tu-saved-del" onclick="deleteCustomTuning(${i})" title="Delete">&times;</button>`;
    html += `</div>`;
  });
  els.tuSavedList.innerHTML = html;
}

// ═══ String panel ═══
function renderStrings() {
  let html = '';
  for (let i = 5; i >= 0; i--) { // high e first
    const freq = tu.targetFreqs[i];
    const active = tu.activeStr === i;
    const locked = tu.locked === i;
    const tuned = tu.tunedFlags[i];
    let cls = 'tu-str';
    if (active) cls += ' tu-active';
    if (locked) cls += ' tu-locked';
    if (tuned) cls += ' tu-tuned';
    html += `<div class="${cls}" data-str="${i}" onclick="toggleLock(${i})">`;
    html += `<span class="tu-str-name">${tu.strNames[i]}</span>`;
    html += `<span class="tu-str-line"><span class="tu-str-dot"></span></span>`;
    html += `<span class="tu-str-hz">${freq.toFixed(1)} Hz</span>`;
    html += `<span class="tu-str-status">`;
    if (locked) html += '\u{1F512}';
    else if (tuned) html += '\u2713';
    else if (active) html += '\u25CF';
    html += `</span></div>`;
  }
  els.tuStrings.innerHTML = html;
}

function toggleLock(i) {
  tu.locked = tu.locked === i ? -1 : i;
  renderStrings();
}

function resetTuned() {
  tu.tunedTimers = [0,0,0,0,0,0];
  tu.tunedFlags = [false,false,false,false,false,false];
  tu.activeStr = -1;
}

// ═══ Detection display ═══
function showDetection(note, cents, hz, color) {
  if (!note) {
    els.tuNote.textContent = '—';
    els.tuNote.style.color = 'var(--mt)';
    els.tuCentsLbl.textContent = '';
    els.tuCentsInd.style.left = '50%';
    els.tuCentsInd.style.background = 'var(--bd)';
    els.tuHz.textContent = '';
    return;
  }
  els.tuNote.textContent = note;
  els.tuNote.style.color = color;
  const sign = cents > 0 ? '+' : '';
  els.tuCentsLbl.textContent = `${sign}${cents}c`;
  const pct = Math.max(5, Math.min(95, 50 + cents / 50 * 45));
  els.tuCentsInd.style.left = pct + '%';
  els.tuCentsInd.style.background = color;
  els.tuHz.textContent = hz.toFixed(1) + ' Hz';
}

function centsColor(cents) {
  const a = Math.abs(cents);
  if (a <= 5) return '#4ECB71';
  if (a <= 15) return '#FFB347';
  return '#FF6B6B';
}

// ═══ Closest string matching ═══
function closestString(hz) {
  let best = -1, bestDist = Infinity;
  for (let i = 0; i < 6; i++) {
    const target = tu.targetFreqs[i];
    const cents = Math.abs(1200 * Math.log2(hz / target));
    if (cents < bestDist) { bestDist = cents; best = i; }
  }
  return bestDist < 200 ? best : -1; // only match if within 200 cents (~2 semitones)
}

function centsFromTarget(hz, strIdx) {
  const target = tu.targetFreqs[strIdx];
  return Math.round(1200 * Math.log2(hz / target));
}

// ═══ Audio ═══
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
    tu.audioCtx = ctx;
    tu.analyser = analyser;
    tu.stream = stream;
    tu.buf = new Float32Array(analyser.fftSize);
    return true;
  } catch (e) {
    els.tuMsg.textContent = 'Mic access denied. Please allow microphone.';
    els.tuMsg.className = 'tu-msg tu-err';
    return false;
  }
}

function stopAudio() {
  if (tu.rafId) { cancelAnimationFrame(tu.rafId); tu.rafId = null; }
  if (tu.stream) { tu.stream.getTracks().forEach(t => t.stop()); tu.stream = null; }
  if (tu.audioCtx) { tu.audioCtx.close(); tu.audioCtx = null; }
  tu.analyser = null; tu.buf = null;
}

// ═══ Detection loop ═══
function detectLoop() {
  if (!tu.running || !tu.analyser) return;
  tu.analyser.getFloatTimeDomainData(tu.buf);

  if (rms(tu.buf) < 0.005) {
    showDetection(null);
    tu.activeStr = -1;
    renderStrings();
    tu.rafId = requestAnimationFrame(detectLoop);
    return;
  }

  const hz = yinDetect(tu.buf, tu.audioCtx.sampleRate);
  if (!hz || hz < 50 || hz > 1400) {
    showDetection(null);
    tu.activeStr = -1;
    renderStrings();
    tu.rafId = requestAnimationFrame(detectLoop);
    return;
  }

  const {note} = freqToNote(hz);
  let strIdx;
  if (tu.locked >= 0) {
    strIdx = tu.locked;
  } else {
    strIdx = closestString(hz);
  }

  if (strIdx < 0) {
    showDetection(note, 0, hz, 'var(--mt)');
    tu.activeStr = -1;
    renderStrings();
    tu.rafId = requestAnimationFrame(detectLoop);
    return;
  }

  const cents = centsFromTarget(hz, strIdx);
  const col = centsColor(cents);
  showDetection(note, cents, hz, col);

  // Update active string
  const prevActive = tu.activeStr;
  tu.activeStr = strIdx;

  // Tuned detection: ±5 cents held for 1 second
  const now = performance.now();
  if (Math.abs(cents) <= 5) {
    if (!tu.tunedTimers[strIdx]) tu.tunedTimers[strIdx] = now;
    if (now - tu.tunedTimers[strIdx] >= 1000 && !tu.tunedFlags[strIdx]) {
      tu.tunedFlags[strIdx] = true;
    }
  } else {
    tu.tunedTimers[strIdx] = 0;
    // Don't clear tuned flag once achieved
  }

  if (prevActive !== tu.activeStr || tu.tunedFlags[strIdx]) renderStrings();

  tu.rafId = requestAnimationFrame(detectLoop);
}

// ═══ Controls ═══
async function onStart() {
  const ok = await startAudio();
  if (!ok) return;
  tu.running = true;
  resetTuned();
  els.tuStart.style.display = 'none';
  els.tuStop.style.display = '';
  els.tuMsg.textContent = 'Listening... pluck a string';
  els.tuMsg.className = 'tu-msg';
  detectLoop();
}

function onStop() {
  tu.running = false;
  stopAudio();
  els.tuStart.style.display = '';
  els.tuStop.style.display = 'none';
  showDetection(null);
  tu.activeStr = -1;
  renderStrings();
  els.tuMsg.textContent = 'Press Start to tune';
  els.tuMsg.className = 'tu-msg';
}

// ═══ Init ═══
function init() {
  initEls();
  tu.targetFreqs = calcTargetFreqs(tu.tuning);
  renderTuningDropdown();
  renderStrings();

  els.tuTunSel.addEventListener('change', function() { onTuningChange(this.value); });
  els.tuCustomBtn.addEventListener('click', () => {
    tu.customOpen ? closeCustomEditor() : openCustomEditor();
  });
  els.tuApply.addEventListener('click', applyCustom);
  els.tuSave.addEventListener('click', saveCustom);
  els.tuCancelCustom.addEventListener('click', closeCustomEditor);
  els.tuStart.addEventListener('click', onStart);
  els.tuStop.addEventListener('click', onStop);
}

// Expose for inline onclick handlers
window.toggleLock = toggleLock;
window.onTuningChange = onTuningChange;
window.closeCustomEditor = closeCustomEditor;
window.deleteCustomTuning = deleteCustomTuning;

init();
