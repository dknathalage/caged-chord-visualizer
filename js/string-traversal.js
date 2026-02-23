// ═══════════════════════════════════════════════════
// String Traversal — Play a note on every string
// Requires: shared.js, trainer-core.js
// ═══════════════════════════════════════════════════

const TRAV_DIFF = {
  beginner:    {label:'Beginner',    maxFret:10, naturalsOnly:true,  timer:0,  tip:'Natural notes \u00b7 Frets 0\u201310'},
  intermediate:{label:'Intermediate',maxFret:14, naturalsOnly:false, timer:0,  tip:'All notes \u00b7 Frets 0\u201314'},
  advanced:    {label:'Advanced',    maxFret:19, naturalsOnly:false, timer:30, tip:'All notes \u00b7 Frets 0\u201319 \u00b7 30s timer'}
};

let travNote = null, travFrets = null, travIdx = 0, travDone = [];

EX.diffCfg = () => TRAV_DIFF;
EX.hasMode = false;
EX.elIds = ['ntTravSection','ntTravDots','ntTravNote'];

function pickTraversal() {
  const d = TRAV_DIFF[st.diff], valid = [];
  for (let ni = 0; ni < 12; ni++) {
    const n = NOTES[ni];
    if (d.naturalsOnly && !NT_NATURAL.includes(n)) continue;
    let ok = true;
    const frets = [];
    for (let s = 0; s < 6; s++) {
      const ff = fretForNote(s, n, d.maxFret);
      if (!ff.length) { ok = false; break; }
      frets.push(ff[0]);
    }
    if (ok) valid.push({note:n, frets});
  }
  let p;
  do { p = valid[Math.floor(Math.random()*valid.length)]; }
  while (travNote && p.note === travNote && valid.length > 1);
  return p;
}

function renderTravDots() {
  let h = '';
  for (let s = 0; s < 6; s++) {
    let cls = 'nt-trav-dot';
    if (travDone[s]) cls += ' done';
    else if (s === travIdx) cls += ' active';
    h += `<div class="${cls}"><span class="nt-trav-dot-lbl">${NT_STR_NAMES[s]}</span></div>`;
  }
  els.ntTravDots.innerHTML = h;
}

function showTraversal() {
  if (!travNote) {
    els.ntTravNote.textContent = '\u2014';
    els.ntTravDots.innerHTML = '';
    els.ntFbWrap.style.display = 'none';
    return;
  }
  els.ntTravNote.textContent = travNote;
  renderTravDots();
  els.ntFbWrap.style.display = 'none';
  els.ntFretboard.innerHTML = '';
}

function showTravFretReveal(str, fret, isOk) {
  const tgt = {note:travNote, str, fret, midi:BASE_MIDI[str]+fret};
  els.ntFbWrap.style.display = '';
  els.ntFretboard.innerHTML = renderFB(tgt, null, isOk);
  els.ntFbWrap.classList.add(isOk ? 'nt-success' : '', 'nt-flash');
  setTimeout(() => {
    els.ntFbWrap.classList.remove('nt-success','nt-flash');
    if (st.phase === 'listening') els.ntFbWrap.style.display = 'none';
  }, 600);
}

function showTravAllPositions() {
  const pos = [];
  for (let s = 0; s < 6; s++) pos.push(`${NT_STR_NAMES[s]}:${travFrets[s]}`);
  els.ntFbWrap.style.display = '';
  els.ntFretboard.innerHTML =
    '<div style="text-align:center;padding:1rem;font-family:\'JetBrains Mono\',monospace;color:var(--mt);font-size:14px">' +
    `<div style="margin-bottom:.5rem;color:var(--ac)">${travNote} on every string:</div>` +
    pos.map((p,i) =>
      `<span style="display:inline-block;margin:.2rem .4rem;padding:.2rem .5rem;background:var(--sf2);border-radius:6px;color:${travDone[i]?'#4ECB71':'#FF6B6B'}">${p}</span>`
    ).join('') + '</div>';
}

function onTravStringCorrect() {
  travDone[travIdx] = true;
  showTravFretReveal(travIdx, travFrets[travIdx], true);
  travIdx++;
  st.holdStart = 0;
  renderTravDots();
  if (travIdx >= 6) {
    const pts = scoreCorrect(30, 3);
    els.ntMsg.textContent = `+${pts} points! All strings complete!`;
    els.ntMsg.className = 'nt-msg';
    setTimeout(() => {
      els.ntFbWrap.classList.remove('nt-success','nt-flash');
      if (st.phase === 'success') nextChallenge();
    }, 1200);
  } else {
    els.ntMsg.textContent = `Now play ${travNote} on ${NT_STR_NAMES[travIdx]}`;
    els.ntMsg.className = 'nt-msg';
  }
}

EX.detect = function(note, cents, hz, semi) {
  const nm = note === travNote;
  const expMidi = BASE_MIDI[travIdx] + travFrets[travIdx];
  const midiOk = Math.abs(semi + 69 - expMidi) <= 1;
  const ok = nm && midiOk;
  showDetected(note, cents, hz, ok);

  if (nm && !midiOk && st.phase === 'listening') {
    els.ntMsg.textContent = `Right note, play on ${NT_STR_NAMES[travIdx]} string!`;
    els.ntMsg.className = 'nt-msg nt-err';
  }

  checkHold(ok, onTravStringCorrect);
};

EX.next = function() {
  const pick = pickTraversal();
  travNote = pick.note;
  travFrets = pick.frets;
  travIdx = 0;
  travDone = [false,false,false,false,false,false];
  showTraversal();
  els.ntMsg.textContent = `Play ${travNote} on ${NT_STR_NAMES[0]}`;
};

EX.skip = function() {
  st.streak = 0; st.attempts++;
  st.score = Math.max(0, st.score - 10);
  clearTimer(); updateStats();
  showTravAllPositions();
  els.ntMsg.textContent = 'Skipped \u2014 positions revealed';
  els.ntMsg.className = 'nt-msg nt-err';
  setTimeout(() => nextChallenge(), 2500);
};

EX.timeout = function() {
  st.streak = 0; st.attempts++;
  st.score = Math.max(0, st.score - 10);
  updateStats();
  showTravAllPositions();
  els.ntMsg.textContent = "Time's up! Positions revealed";
  els.ntMsg.className = 'nt-msg nt-err';
  setTimeout(() => { if (st.phase === 'listening') nextChallenge(); }, 2500);
};

EX.reset = function() {
  travNote = null;
  showTraversal();
};

tcInit();
