<script>
  import { NOTES } from '$lib/constants/music.js';
  import { STRING_NAMES, BASE_MIDI } from '$lib/music/fretboard.js';
  import { CHORD_CONFIG, STANDARD_SHAPES, adaptShapeToTuning, resolve, SHAPE_COLORS } from '$lib/music/chords.js';
  import ChordDiagram from '$lib/components/svg/ChordDiagram.svelte';
  import { createHoldDetector } from './holdDetection.js';

  let { item = null, recall = false, onComplete, onWrong, onInvalid, setMsg, showDetected } = $props();

  let challenge = $state(null);
  let voiceIdx = $state(0);
  let voiceDone = $state([]);
  let fbSuccess = $state(false);
  let fbFlash = $state(false);

  const hold = createHoldDetector();

  export function prepare(inner, isRecall) {
    recall = isRecall;
    hold.reset();
    const { shapeId, typeId, rootIdx } = inner;
    const sh = STANDARD_SHAPES.find(s => s.id === shapeId);
    const ct = CHORD_CONFIG.chordTypes.find(c => c.id === typeId);
    const root = NOTES[rootIdx];
    const adapted = adaptShapeToTuning(sh);
    const r = resolve(adapted, rootIdx, ct.iv);
    if (r.voices.length < 3) { onInvalid(); return; }
    const sortedVoices = [...r.voices].sort((a, b) => a.str - b.str);
    const color = SHAPE_COLORS[sh.id] || '#58A6FF';
    const chordName = root + (ct.sym || '');
    challenge = { root, chordType: ct, shape: sh, resolved: r, sortedVoices, chordName, color, shapeName: sh.label, showDiagram: !isRecall };
    voiceIdx = 0;
    voiceDone = sortedVoices.map(() => false);
    fbSuccess = false;
    fbFlash = false;
    const firstVoice = sortedVoices[0];
    setMsg(`Play ${firstVoice.note} on ${STRING_NAMES[firstVoice.str]}`, false);
  }

  export function handleDetection(note, cents, hz, semi) {
    if (!challenge) return;
    const voice = challenge.sortedVoices[voiceIdx];
    if (!voice) return;
    const expMidi = BASE_MIDI[voice.str] + challenge.resolved.baseFret + voice.fretOffset;
    const nm = note === voice.note;
    const midiOk = Math.abs(semi + 69 - expMidi) <= 1;
    const ok = nm && midiOk;
    showDetected(note, cents, hz, ok);
    if (nm && !midiOk) { setMsg(`Right note, play on ${STRING_NAMES[voice.str]} string!`, true); }
    hold.check(ok, true, () => {
      voiceDone[voiceIdx] = true;
      voiceDone = [...voiceDone];
      fbSuccess = true;
      fbFlash = true;
      setTimeout(() => { fbSuccess = false; fbFlash = false; }, 600);
      voiceIdx++;
      hold.resetAfterVoice();
      if (voiceIdx >= challenge.sortedVoices.length) {
        onComplete(30, 3);
        setTimeout(() => { fbSuccess = false; fbFlash = false; }, 1200);
      } else {
        const nextVoice = challenge.sortedVoices[voiceIdx];
        setMsg(`Now play ${nextVoice.note} on ${STRING_NAMES[nextVoice.str]}`, false);
      }
    }, onWrong);
  }

  export function handleSilence() {
    showDetected(null, 0, 0, false);
    hold.reset();
  }
</script>

<div class="nt-chord-section">
  <div class="nt-challenge-lbl">{recall ? 'Play from memory' : 'Play the chord'}</div>
  <div class="nt-chord-name">{challenge ? challenge.chordName : '\u2014'}</div>
  <div class="nt-shape-lbl">{challenge ? challenge.shapeName : ''}</div>
</div>

<div class="nt-trav-dots">
  {#each voiceDone as done, i}
    <div class="nt-trav-dot{done ? ' done' : (i === voiceIdx && challenge ? ' active' : '')}">
      <span class="nt-trav-dot-lbl">{challenge ? STRING_NAMES[challenge.sortedVoices[i].str] : ''}</span>
    </div>
  {/each}
</div>

{#if challenge}
  {#if recall && !challenge.showDiagram}
    <div class="nt-recall-placeholder">
      <span class="nt-recall-icon">?</span>
      <span class="nt-recall-text">Play from memory</span>
    </div>
  {:else}
    <div class="nt-fb-wrap" class:nt-success={fbSuccess} class:nt-flash={fbFlash}>
      <ChordDiagram chord={challenge.resolved} color={challenge.color} />
    </div>
  {/if}
{/if}

<style>
  .nt-challenge-lbl{font-size:13px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:.2rem}
  .nt-chord-section{text-align:center}
  .nt-chord-name{font-family:'JetBrains Mono',monospace;font-size:42px;font-weight:700;color:var(--ac);line-height:1}
  .nt-shape-lbl{font-family:'JetBrains Mono',monospace;font-size:14px;color:var(--mt);margin-top:.3rem}
  .nt-trav-dots{display:flex;gap:.6rem;justify-content:center;margin-top:.5rem}
  .nt-trav-dot{width:40px;height:40px;border-radius:50%;border:2px solid var(--bd);background:var(--sf);display:flex;align-items:center;justify-content:center;transition:all .3s}
  .nt-trav-dot.active{border-color:var(--ac);background:rgba(88,166,255,.15);box-shadow:0 0 10px rgba(88,166,255,.3)}
  .nt-trav-dot.done{border-color:#4ECB71;background:rgba(78,203,113,.15)}
  .nt-trav-dot-lbl{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:var(--mt)}
  .nt-trav-dot.active .nt-trav-dot-lbl{color:var(--ac)}
  .nt-trav-dot.done .nt-trav-dot-lbl{color:#4ECB71}
  .nt-fb-wrap{background:var(--sf);border:2px solid var(--bd);border-radius:10px;padding:.5rem;width:100%;max-width:700px;transition:border-color .3s,box-shadow .3s}
  .nt-fb-wrap.nt-success{border-color:#4ECB71;box-shadow:0 0 20px rgba(78,203,113,.25)}
  @keyframes nt-glow{0%{box-shadow:0 0 20px rgba(78,203,113,.4)}100%{box-shadow:none}}
  .nt-flash{animation:nt-glow .8s ease-out}
  .nt-recall-placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.5rem;padding:2rem;background:var(--sf);border:2px dashed var(--bd);border-radius:10px;width:100%;max-width:700px}
  .nt-recall-icon{font-family:'JetBrains Mono',monospace;font-size:48px;font-weight:900;color:var(--bd);line-height:1}
  .nt-recall-text{font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--mt);text-transform:uppercase;letter-spacing:1px}
  @media(max-width:600px){
    .nt-chord-name{font-size:32px}
    .nt-trav-dot{width:34px;height:34px}
    .nt-trav-dot-lbl{font-size:11px}
  }
</style>
