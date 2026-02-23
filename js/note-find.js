// ═══════════════════════════════════════════════════
// Note Find — Practice finding notes on the fretboard
// Requires: shared.js, trainer-core.js
// ═══════════════════════════════════════════════════

const NF_DIFF = {
  beginner:    {label:'Beginner',    maxFret:5,  naturalsOnly:true,  timer:0,  tip:'Natural notes only \u00b7 Frets 0\u20135'},
  intermediate:{label:'Intermediate',maxFret:12, naturalsOnly:false, timer:0,  tip:'All 12 notes \u00b7 Frets 0\u201312'},
  advanced:    {label:'Advanced',    maxFret:19, naturalsOnly:false, timer:10, tip:'All 12 notes \u00b7 Frets 0\u201319 \u00b7 10s timer'}
};

let target = null;

EX.diffCfg = () => NF_DIFF;
EX.hasMode = true;
EX.elIds = ['ntChallenge','ntTarget','ntPos'];

function pickTarget() {
  const d = NF_DIFF[st.diff], cands = [];
  for (let s = 0; s < 6; s++)
    for (let f = 0; f <= d.maxFret; f++) {
      const n = noteAt(s, f);
      if (d.naturalsOnly && !NT_NATURAL.includes(n)) continue;
      cands.push({note:n, str:s, fret:f, midi:BASE_MIDI[s]+f});
    }
  let p;
  do { p = cands[Math.floor(Math.random()*cands.length)]; }
  while (target && p.note===target.note && p.str===target.str && cands.length>6);
  return p;
}

function showChallenge() {
  if (!target) {
    els.ntTarget.textContent = '\u2014';
    els.ntTarget.classList.remove('nt-recall');
    els.ntPos.textContent = '';
    els.ntFretboard.innerHTML = '';
    return;
  }
  const t = target;
  els.ntTarget.textContent = t.note;
  const lbl = els.ntChallenge.querySelector('.nt-challenge-lbl');
  if (st.recall) {
    els.ntTarget.classList.add('nt-recall');
    els.ntPos.textContent = `on string ${NT_STR_NAMES[t.str]}`;
    els.ntFretboard.innerHTML = '<svg viewBox="0 0 396 212" xmlns="http://www.w3.org/2000/svg"><text x="198" y="106" text-anchor="middle" dominant-baseline="central" fill="#222" font-size="60" font-family="Outfit" font-weight="900">?</text></svg>';
    lbl.textContent = 'Play this note';
  } else {
    els.ntTarget.classList.remove('nt-recall');
    els.ntPos.textContent = `String ${NT_STR_NAMES[t.str]} \u00b7 Fret ${t.fret}`;
    els.ntFretboard.innerHTML = renderFB(t, null, false);
    lbl.textContent = 'Find this note';
  }
}

EX.detect = function(note, cents, hz, semi) {
  const nm = target && note === target.note;
  const octOk = !st.recall || !target || Math.abs((semi+69) - target.midi) <= 1;
  const ok = nm && octOk;
  showDetected(note, cents, hz, ok);

  if (nm && !octOk && st.phase === 'listening') {
    els.ntMsg.textContent = 'Right note, wrong string!';
    els.ntMsg.className = 'nt-msg nt-err';
  }

  checkHold(ok, () => {
    const pts = scoreCorrect(10, 2);
    if (st.recall) els.ntPos.textContent = `Fret ${target.fret}`;
    els.ntFretboard.innerHTML = renderFB(target, null, true);
    els.ntFbWrap.classList.add('nt-success','nt-flash');
    els.ntMsg.textContent = `+${pts} points!`;
    els.ntMsg.className = 'nt-msg';
    setTimeout(() => {
      els.ntFbWrap.classList.remove('nt-success','nt-flash');
      if (st.phase === 'success') nextChallenge();
    }, st.recall ? 1200 : 800);
  });
};

EX.next = function() {
  target = pickTarget();
  showChallenge();
  els.ntMsg.textContent = 'Listening...';
};

EX.skip = function() {
  st.streak = 0; st.attempts++;
  st.score = Math.max(0, st.score - 5);
  clearTimer(); updateStats();
  if (st.recall && target) {
    els.ntPos.textContent = `Fret ${target.fret}`;
    els.ntFretboard.innerHTML = renderFB(target, null, false);
    els.ntMsg.textContent = `Was: Fret ${target.fret}`;
    els.ntMsg.className = 'nt-msg nt-err';
    setTimeout(() => nextChallenge(), 1500);
  } else nextChallenge();
};

EX.timeout = function() {
  st.streak = 0; st.attempts++;
  st.score = Math.max(0, st.score - 5);
  updateStats();
  if (st.recall && target) {
    els.ntPos.textContent = `Fret ${target.fret}`;
    els.ntFretboard.innerHTML = renderFB(target, null, false);
    els.ntMsg.textContent = `Time's up! Was: Fret ${target.fret}`;
    els.ntMsg.className = 'nt-msg nt-err';
  } else {
    els.ntMsg.textContent = "Time's up!";
    els.ntMsg.className = 'nt-msg nt-err';
  }
  setTimeout(() => { if (st.phase === 'listening') nextChallenge(); }, st.recall ? 1500 : 800);
};

EX.reset = function() {
  target = null;
  showChallenge();
};

tcInit();
