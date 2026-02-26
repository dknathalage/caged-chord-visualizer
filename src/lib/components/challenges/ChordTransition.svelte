<script>
  import { NOTES } from '$lib/constants/music.js';
  import { STRING_NAMES, BASE_MIDI } from '$lib/music/fretboard.js';
  import { CHORD_CONFIG, STANDARD_SHAPES, adaptShapeToTuning, resolve, SHAPE_COLORS } from '$lib/music/chords.js';
  import ChordDiagram from '$lib/components/svg/ChordDiagram.svelte';
  import { createHoldDetector } from './holdDetection.js';

  let { item = null, recall = false, onComplete, onWrong, onInvalid, setMsg, showDetected } = $props();

  let fromChallenge = $state(null);
  let toChallenge = $state(null);
  let cxPhase = $state('from');
  let voiceIdx = $state(0);
  let voiceDone = $state([]);
  let fbSuccess = $state(false);
  let fbFlash = $state(false);

  const hold = createHoldDetector();
  let centsBuffer = [];

  function resolveChord(shapeId, typeId, rootIdx, isRecall) {
    const sh = STANDARD_SHAPES.find(s => s.id === shapeId);
    const ct = CHORD_CONFIG.chordTypes.find(c => c.id === typeId);
    const root = NOTES[rootIdx];
    const adapted = adaptShapeToTuning(sh);
    const r = resolve(adapted, rootIdx, ct.iv);
    if (r.voices.length < 3) return null;
    const sortedVoices = [...r.voices].sort((a, b) => a.str - b.str);
    const color = SHAPE_COLORS[sh.id] || '#58A6FF';
    const chordName = root + (ct.sym || '');
    return { root, chordType: ct, shape: sh, resolved: r, sortedVoices, chordName, color, shapeName: sh.label, showDiagram: !isRecall };
  }

  export function prepare(inner, isRecall) {
    recall = isRecall;
    hold.reset();
    centsBuffer = [];
    const { fromShapeId, fromTypeId, fromRootIdx, toShapeId, toTypeId, toRootIdx } = inner;
    const from = resolveChord(fromShapeId, fromTypeId, fromRootIdx, isRecall);
    const to = resolveChord(toShapeId, toTypeId, toRootIdx, isRecall);
    if (!from || !to) { onInvalid(); return; }
    fromChallenge = from;
    toChallenge = to;
    cxPhase = 'from';
    voiceIdx = 0;
    voiceDone = from.sortedVoices.map(() => false);
    fbSuccess = false;
    fbFlash = false;
    const firstVoice = from.sortedVoices[0];
    setMsg(`Play ${from.chordName}: ${firstVoice.note} on ${STRING_NAMES[firstVoice.str]}`, false);
  }

  export function handleDetection(note, cents, hz, semi) {
    const activeChallenge = cxPhase === 'from' ? fromChallenge : toChallenge;
    if (!activeChallenge) return;
    const voice = activeChallenge.sortedVoices[voiceIdx];
    if (!voice) return;
    const expMidi = BASE_MIDI[voice.str] + activeChallenge.resolved.baseFret + voice.fretOffset;
    const nm = note === voice.note;
    const midiOk = Math.abs(semi + 69 - expMidi) <= 1;
    const ok = nm && midiOk;
    showDetected(note, cents, hz, ok);
    if (nm && !midiOk) { setMsg(`Right note, play on ${STRING_NAMES[voice.str]} string!`, true); }
    if (ok) centsBuffer.push(cents);
    else centsBuffer = [];
    hold.check(ok, true, () => {
      voiceDone[voiceIdx] = true;
      voiceDone = [...voiceDone];
      fbSuccess = true;
      fbFlash = true;
      setTimeout(() => { fbSuccess = false; fbFlash = false; }, 600);
      voiceIdx++;
      hold.resetAfterVoice();

      if (voiceIdx >= activeChallenge.sortedVoices.length) {
        if (cxPhase === 'from') {
          cxPhase = 'to';
          voiceIdx = 0;
          voiceDone = toChallenge.sortedVoices.map(() => false);
          fbSuccess = false;
          fbFlash = false;
          const firstVoice = toChallenge.sortedVoices[0];
          setMsg(`Now play ${toChallenge.chordName}: ${firstVoice.note} on ${STRING_NAMES[firstVoice.str]}`, false);
        } else {
          const extraMeta = {};
          if (centsBuffer.length > 0) {
            const avg = centsBuffer.reduce((a, b) => a + b, 0) / centsBuffer.length;
            const variance = centsBuffer.reduce((s, v) => s + (v - avg) ** 2, 0) / centsBuffer.length;
            extraMeta.avgCents = Math.round(avg * 10) / 10;
            extraMeta.stdCents = Math.round(Math.sqrt(variance) * 10) / 10;
          }
          centsBuffer = [];
          fbSuccess = true;
          fbFlash = true;
          onComplete(40, 3, extraMeta);
          setTimeout(() => { fbSuccess = false; fbFlash = false; }, 1200);
        }
      } else {
        const nextVoice = activeChallenge.sortedVoices[voiceIdx];
        setMsg(`Now play ${nextVoice.note} on ${STRING_NAMES[nextVoice.str]}`, false);
      }
    }, onWrong);
  }

  export function handleSilence() {
    showDetected(null, 0, 0, false);
    hold.reset();
    centsBuffer = [];
  }
</script>

<div class="cx-section">
  <div class="cx-label">{recall ? 'Transition from memory' : 'Chord Transition'}</div>
  <div class="cx-names">
    <span class="cx-name" class:cx-active={cxPhase === 'from'}>{fromChallenge?.chordName ?? '\u2014'}</span>
    <span class="cx-arrow">&rarr;</span>
    <span class="cx-name" class:cx-active={cxPhase === 'to'}>{toChallenge?.chordName ?? '\u2014'}</span>
  </div>
  <div class="cx-shapes">
    <span class="cx-shape-lbl">{cxPhase === 'from' ? fromChallenge?.shapeName : toChallenge?.shapeName}</span>
  </div>
</div>

<div class="nt-trav-dots">
  {#each voiceDone as done, i}
    {@const activeChallenge = cxPhase === 'from' ? fromChallenge : toChallenge}
    <div class="nt-trav-dot{done ? ' done' : (i === voiceIdx && activeChallenge ? ' active' : '')}">
      <span class="nt-trav-dot-lbl">{activeChallenge ? STRING_NAMES[activeChallenge.sortedVoices[i]?.str] : ''}</span>
    </div>
  {/each}
</div>

<div class="cx-diagrams">
  {#if fromChallenge}
    {#if recall && !fromChallenge.showDiagram}
      <div class="cx-recall-placeholder" class:cx-diagram-active={cxPhase === 'from'}>
        <span class="cx-recall-icon">?</span>
      </div>
    {:else}
      <div class="cx-diagram" class:cx-diagram-active={cxPhase === 'from'} class:nt-success={cxPhase === 'from' && fbSuccess} class:nt-flash={cxPhase === 'from' && fbFlash}>
        <ChordDiagram chord={fromChallenge.resolved} color={fromChallenge.color} />
      </div>
    {/if}
  {/if}
  {#if toChallenge}
    {#if recall && !toChallenge.showDiagram}
      <div class="cx-recall-placeholder" class:cx-diagram-active={cxPhase === 'to'}>
        <span class="cx-recall-icon">?</span>
      </div>
    {:else}
      <div class="cx-diagram" class:cx-diagram-active={cxPhase === 'to'} class:nt-success={cxPhase === 'to' && fbSuccess} class:nt-flash={cxPhase === 'to' && fbFlash}>
        <ChordDiagram chord={toChallenge.resolved} color={toChallenge.color} />
      </div>
    {/if}
  {/if}
</div>

<style>
  .cx-section{text-align:center}
  .cx-label{font-size:13px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:.2rem}
  .cx-names{display:flex;align-items:center;justify-content:center;gap:.5rem;font-family:'JetBrains Mono',monospace}
  .cx-name{font-size:32px;font-weight:700;color:var(--mt);transition:color .3s}
  .cx-name.cx-active{color:var(--ac)}
  .cx-arrow{font-size:24px;color:var(--mt);opacity:.5}
  .cx-shapes{font-size:14px;color:var(--mt);font-family:'JetBrains Mono',monospace;margin-top:.3rem}
  .cx-diagrams{display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap;margin-top:.5rem}
  .cx-diagram{background:var(--sf);border:2px solid var(--bd);border-radius:10px;padding:.5rem;max-width:340px;flex:1;opacity:.5;transition:all .3s}
  .cx-diagram.cx-diagram-active{opacity:1;border-color:var(--ac)}
  .cx-diagram.nt-success{border-color:#4ECB71;box-shadow:0 0 20px rgba(78,203,113,.25)}
  .cx-recall-placeholder{display:flex;align-items:center;justify-content:center;padding:2rem;background:var(--sf);border:2px dashed var(--bd);border-radius:10px;max-width:340px;flex:1;opacity:.5;transition:all .3s}
  .cx-recall-placeholder.cx-diagram-active{opacity:1;border-color:var(--ac)}
  .cx-recall-icon{font-family:'JetBrains Mono',monospace;font-size:36px;font-weight:900;color:var(--bd);line-height:1}
  .nt-trav-dots{display:flex;gap:.6rem;justify-content:center;margin-top:.5rem}
  .nt-trav-dot{width:40px;height:40px;border-radius:50%;border:2px solid var(--bd);background:var(--sf);display:flex;align-items:center;justify-content:center;transition:all .3s}
  .nt-trav-dot.active{border-color:var(--ac);background:rgba(88,166,255,.15);box-shadow:0 0 10px rgba(88,166,255,.3)}
  .nt-trav-dot.done{border-color:#4ECB71;background:rgba(78,203,113,.15)}
  .nt-trav-dot-lbl{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:var(--mt)}
  .nt-trav-dot.active .nt-trav-dot-lbl{color:var(--ac)}
  .nt-trav-dot.done .nt-trav-dot-lbl{color:#4ECB71}
  @keyframes nt-glow{0%{box-shadow:0 0 20px rgba(78,203,113,.4)}100%{box-shadow:none}}
  .nt-flash{animation:nt-glow .8s ease-out}
  @media(max-width:600px){
    .cx-name{font-size:24px}
    .cx-arrow{font-size:18px}
    .nt-trav-dot{width:34px;height:34px}
    .nt-trav-dot-lbl{font-size:11px}
  }
</style>
