// ═══════════════════════════════════════════════════
// Interval Trainer — Practice intervals on the fretboard
// Requires: shared.js, trainer-core.js
// ═══════════════════════════════════════════════════

const INTV_DIFF = {
  beginner:    {label:'Beginner',    maxFret:10, naturalsOnly:true,  timer:0,  intervals:[3,4,5,7,12], tip:'5 common intervals \u00b7 Naturals'},
  intermediate:{label:'Intermediate',maxFret:14, naturalsOnly:false, timer:0,  intervals:'all', tip:'All 12 intervals'},
  advanced:    {label:'Advanced',    maxFret:19, naturalsOnly:false, timer:15, intervals:'all', tip:'All intervals \u00b7 15s timer'}
};

const INTERVALS = [
  {semi:1,  name:'Minor 2nd',   abbr:'m2'},
  {semi:2,  name:'Major 2nd',   abbr:'M2'},
  {semi:3,  name:'Minor 3rd',   abbr:'m3'},
  {semi:4,  name:'Major 3rd',   abbr:'M3'},
  {semi:5,  name:'Perfect 4th', abbr:'P4'},
  {semi:6,  name:'Tritone',     abbr:'TT'},
  {semi:7,  name:'Perfect 5th', abbr:'P5'},
  {semi:8,  name:'Minor 6th',   abbr:'m6'},
  {semi:9,  name:'Major 6th',   abbr:'M6'},
  {semi:10, name:'Minor 7th',   abbr:'m7'},
  {semi:11, name:'Major 7th',   abbr:'M7'},
  {semi:12, name:'Octave',      abbr:'P8'}
];

let intvRef = null, intvInterval = null, intvTarget = null;

EX.diffCfg = () => INTV_DIFF;
EX.hasMode = true;
EX.elIds = ['ntIntvSection','ntIntvRef','ntIntvArrow','ntIntvName','ntIntvTarget'];

function pickInterval() {
  const d = INTV_DIFF[st.diff];
  const allowed = d.intervals === 'all'
    ? INTERVALS : INTERVALS.filter(iv => d.intervals.includes(iv.semi));
  const intv = allowed[Math.floor(Math.random() * allowed.length)];
  const cands = [];
  for (let s = 0; s < 6; s++)
    for (let f = 0; f <= d.maxFret; f++) {
      const n = noteAt(s, f);
      if (d.naturalsOnly && !NT_NATURAL.includes(n)) continue;
      const tn = NOTES[(NOTES.indexOf(n) + intv.semi) % 12];
      if (d.naturalsOnly && !NT_NATURAL.includes(tn)) continue;
      cands.push({note:n, str:s, fret:f, midi:BASE_MIDI[s]+f});
    }
  if (!cands.length) return pickInterval();
  let ref;
  do { ref = cands[Math.floor(Math.random()*cands.length)]; }
  while (intvRef && ref.note===intvRef.note && ref.str===intvRef.str && cands.length>6);
  return {ref, interval:intv, targetNote:NOTES[(NOTES.indexOf(ref.note)+intv.semi)%12]};
}

function showInterval() {
  if (!intvRef) {
    els.ntIntvRef.textContent = '\u2014';
    els.ntIntvName.textContent = '';
    els.ntIntvTarget.textContent = '\u2014';
    els.ntFretboard.innerHTML = '';
    return;
  }
  els.ntIntvRef.textContent = intvRef.note;
  els.ntIntvName.textContent = intvInterval.name;
  if (st.recall) {
    els.ntIntvTarget.textContent = '?';
    els.ntIntvTarget.className = 'nt-intv-note nt-intv-hidden';
    els.ntFretboard.innerHTML = '<svg viewBox="0 0 396 212" xmlns="http://www.w3.org/2000/svg"><text x="198" y="106" text-anchor="middle" dominant-baseline="central" fill="#222" font-size="60" font-family="Outfit" font-weight="900">?</text></svg>';
  } else {
    els.ntIntvTarget.textContent = intvTarget;
    els.ntIntvTarget.className = 'nt-intv-note';
    els.ntFretboard.innerHTML = renderFB(intvRef, null, false);
  }
}

EX.detect = function(note, cents, hz, semi) {
  const ok = note === intvTarget;
  showDetected(note, cents, hz, ok);

  checkHold(ok, () => {
    const pts = scoreCorrect(10, 2);
    els.ntIntvTarget.textContent = intvTarget;
    els.ntIntvTarget.className = 'nt-intv-note';
    els.ntFretboard.innerHTML = renderFB(intvRef, null, true);
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
  const pick = pickInterval();
  intvRef = pick.ref;
  intvInterval = pick.interval;
  intvTarget = pick.targetNote;
  showInterval();
  els.ntMsg.textContent = 'Listening...';
};

EX.skip = function() {
  st.streak = 0; st.attempts++;
  st.score = Math.max(0, st.score - 5);
  clearTimer(); updateStats();
  els.ntIntvTarget.textContent = intvTarget;
  els.ntIntvTarget.className = 'nt-intv-note';
  els.ntFretboard.innerHTML = renderFB(intvRef, null, false);
  els.ntMsg.textContent = `Was: ${intvTarget}`;
  els.ntMsg.className = 'nt-msg nt-err';
  setTimeout(() => nextChallenge(), 1500);
};

EX.timeout = function() {
  st.streak = 0; st.attempts++;
  st.score = Math.max(0, st.score - 5);
  updateStats();
  els.ntIntvTarget.textContent = intvTarget;
  els.ntIntvTarget.className = 'nt-intv-note';
  els.ntFretboard.innerHTML = renderFB(intvRef, null, false);
  els.ntMsg.textContent = `Time's up! Was: ${intvTarget}`;
  els.ntMsg.className = 'nt-msg nt-err';
  setTimeout(() => { if (st.phase === 'listening') nextChallenge(); }, st.recall ? 1500 : 800);
};

EX.reset = function() {
  intvRef = null;
  showInterval();
};

tcInit();
