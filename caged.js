const CFG = {
  notes: ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],
  noteDisplay: ['C','C#/Db','D','D#/Eb','E','F','F#/Gb','G','G#/Ab','A','A#/Bb','B'],
  tuning: [4,9,2,7,11,4],
  stringNames: ['E','A','D','G','B','e'],
  intervalNames: {0:'R',1:'\u266d2',2:'2',3:'\u266d3',4:'3',5:'4',6:'\u266d5',7:'5',8:'#5',9:'6',10:'\u266d7',11:'7'},
  shapeColors: {e:'#4DA6FF',a:'#FFB347',d:'#B980F0',c:'#FF6B6B',g:'#4ECB71'},
  chordTypes: [
    {id:'maj',name:'Major',sym:'',iv:[0,4,7],fm:['R','3','5']},
    {id:'min',name:'Minor',sym:'m',iv:[0,3,7],fm:['R','\u266d3','5']},
    {id:'7',name:'Dom 7',sym:'7',iv:[0,4,7,10],fm:['R','3','5','\u266d7']},
    {id:'maj7',name:'Maj 7',sym:'maj7',iv:[0,4,7,11],fm:['R','3','5','7']},
    {id:'m7',name:'Min 7',sym:'m7',iv:[0,3,7,10],fm:['R','\u266d3','5','\u266d7']},
    {id:'sus2',name:'Sus 2',sym:'sus2',iv:[0,2,7],fm:['R','2','5']},
    {id:'sus4',name:'Sus 4',sym:'sus4',iv:[0,5,7],fm:['R','4','5']},
    {id:'dim',name:'Dim',sym:'dim',iv:[0,3,6],fm:['R','\u266d3','\u266d5']},
    {id:'dim7',name:'Dim 7',sym:'\u00b07',iv:[0,3,6,9],fm:['R','\u266d3','\u266d5','\u266d\u266d7']},
    {id:'aug',name:'Aug',sym:'+',iv:[0,4,8],fm:['R','3','#5']},
    {id:'add9',name:'Add 9',sym:'add9',iv:[0,4,7,14],fm:['R','3','5','9']},
    {id:'5',name:'Power',sym:'5',iv:[0,7],fm:['R','5']},
  ],
  shapes: [
    {id:'e',label:'E Shape',rootStr:[0,5],muted:[],
      voices:[{str:0,fo:0},{str:1,fo:2},{str:2,fo:2},{str:3,fo:1},{str:4,fo:0},{str:5,fo:0}]},
    {id:'a',label:'A Shape',rootStr:[1],muted:[0],
      voices:[{str:1,fo:0},{str:2,fo:2},{str:3,fo:2},{str:4,fo:2},{str:5,fo:0}]},
    {id:'d',label:'D Shape',rootStr:[2],muted:[0,1],
      voices:[{str:2,fo:0},{str:3,fo:2},{str:4,fo:3},{str:5,fo:2}]},
    {id:'c',label:'C Shape',rootStr:[1],muted:[0],barreOffset:-3,
      voices:[{str:1,fo:3},{str:2,fo:2},{str:3,fo:0},{str:4,fo:1},{str:5,fo:0}]},
    {id:'g',label:'G Shape',rootStr:[0,5],muted:[],barreOffset:-3,
      voices:[{str:0,fo:3},{str:1,fo:2},{str:2,fo:0},{str:3,fo:0},{str:4,fo:0},{str:5,fo:3}]}
  ]
};

let curType = 'maj', curRoot = 7, curShape = null;

function adaptShape(sh) {
  const rb = CFG.tuning[sh.rootStr[0]], bo = sh.barreOffset || 0;
  return { ...sh, rootBase: rb, voices: sh.voices.map(v => ({ ...v, base: ((CFG.tuning[v.str] + v.fo + bo - rb) % 12 + 12) % 12 })) };
}

function getBf(sh, ri) {
  const f = ((ri - sh.rootBase) + 12) % 12 || 12;
  if (sh.barreOffset) { let r = f + sh.barreOffset; return r <= 0 ? r + 12 : r; }
  return f;
}

function resolve(sh, ri, iv) {
  const b = getBf(sh, ri), ivSet = new Set(iv.map(i => i % 12)), res = [], muted = [...sh.muted];
  const MAX_FO = 3;

  function calcFo(base, fo, target) {
    const diff = ((target - base) + 12) % 12;
    let nfo = fo + (diff <= 6 ? diff : diff - 12);
    if (nfo < 0) nfo += 12;
    return (nfo >= 0 && nfo <= MAX_FO) ? nfo : null;
  }

  // First pass: greedy closest PLAYABLE interval match
  const matched = [];
  for (const v of sh.voices) {
    let best = null, bd = 99, bestNfo = null;
    for (const i of ivSet) {
      const d = Math.min(Math.abs(i - v.base), 12 - Math.abs(i - v.base));
      if (d >= bd || d > 3) continue;
      const nfo = calcFo(v.base, v.fo, i);
      if (nfo === null) continue;
      bd = d; best = i; bestNfo = nfo;
    }
    if (best === null) { muted.push(v.str); continue; }
    matched.push({ v, best, bd, nfo: bestNfo });
  }

  // Second pass: place missing intervals by reassigning duplicated voices
  const covered = new Set(matched.map(m => m.best));
  for (const mi of ivSet) {
    if (covered.has(mi)) continue;
    let pick = null, pickDist = 99, pickNfo = null;
    for (const m of matched) {
      if (matched.filter(x => x.best === m.best).length < 2) continue;
      const d = Math.min(Math.abs(mi - m.v.base), 12 - Math.abs(mi - m.v.base));
      if (d > 3 || d > pickDist) continue;
      if (d === pickDist && pick && m.v.str <= pick.v.str) continue;
      const nfo = calcFo(m.v.base, m.v.fo, mi);
      if (nfo === null) continue;
      pickDist = d; pick = m; pickNfo = nfo;
    }
    if (pick) { pick.best = mi; pick.bd = pickDist; pick.nfo = pickNfo; covered.add(mi); }
  }

  // Build result from pre-validated matches
  for (const m of matched) {
    const absFret = b + m.nfo;
    const note = CFG.notes[(CFG.tuning[m.v.str] + absFret) % 12];
    res.push({ str: m.v.str, fo: m.nfo, note, semi: m.best, interval: CFG.intervalNames[m.best], isRoot: m.best === 0 });
  }

  return { bf: b, voices: res, muted: [...new Set(muted)], barreStrs: res.filter(r => r.fo === 0).map(r => r.str), rootStrs: sh.rootStr };
}

// ═══════════════════════════════════════════════════
// DIAGRAM — note+interval pills ABOVE each string
// ═══════════════════════════════════════════════════
function renderDiagram(r, color) {
  const FRET_L = 42, FRET_R = 210, TOP = 28, FH = 34, NF = 4, SP = (FRET_R - FRET_L) / 5;
  const W = FRET_R + 16, H = TOP + NF * FH + 20;
  const DR = 11;
  const { bf: bfret, voices, muted, barreStrs, rootStrs } = r;

  const strMap = {};
  voices.forEach(v => { strMap[v.str] = v; });

  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  // Muted string markers above nut
  for (let i = 0; i < 6; i++) {
    if (muted.includes(i)) {
      const cx = FRET_L + i * SP;
      s += `<text x="${cx}" y="${TOP - 12}" text-anchor="middle" dominant-baseline="central" fill="#666" font-size="16" font-weight="bold" font-family="JetBrains Mono">\u2715</text>`;
    }
  }

  // Frets
  for (let i = 0; i <= NF; i++) {
    const y = TOP + i * FH;
    s += i === 0
      ? `<rect x="${FRET_L - 2}" y="${y - 2}" width="${FRET_R - FRET_L + 4}" height="4" rx="1" fill="#555"/>`
      : `<line x1="${FRET_L}" y1="${y}" x2="${FRET_R}" y2="${y}" stroke="#3a3a3a" stroke-width="1.2"/>`;
  }

  // Strings
  for (let i = 0; i < 6; i++) {
    const x = FRET_L + i * SP;
    s += `<line x1="${x}" y1="${TOP}" x2="${x}" y2="${TOP + NF * FH}" stroke="#666" stroke-width="${2.2 - i * .25}"/>`;
    s += `<text x="${x}" y="${TOP + NF * FH + 12}" text-anchor="middle" dominant-baseline="central" fill="#555" font-size="16" font-family="JetBrains Mono">${CFG.stringNames[i]}</text>`;
  }

  // Fret numbers
  for (let i = 0; i < NF; i++)
    s += `<text x="${FRET_L - 16}" y="${TOP + i * FH + FH / 2}" text-anchor="middle" dominant-baseline="central" fill="#555" font-size="16" font-family="JetBrains Mono">${bfret + i}</text>`;

  // Barre bar
  if (barreStrs.length >= 2) {
    const mn = Math.min(...barreStrs), mx = Math.max(...barreStrs);
    const x1 = FRET_L + mn * SP, x2 = FRET_L + mx * SP, by = TOP + FH / 2;
    s += `<rect x="${x1 - 4}" y="${by - 5}" width="${x2 - x1 + 8}" height="10" rx="5" fill="${color}" opacity="0.75"/>`;
  }

  // Dots on fretboard
  voices.forEach(v => {
    const x = FRET_L + v.str * SP, y = TOP + v.fo * FH + FH / 2;
    const isR = v.isRoot && rootStrs.includes(v.str);

    if (isR) {
      s += `<circle cx="${x}" cy="${y}" r="${DR + 1}" fill="${color}"/>`;
      s += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="16" font-weight="bold" font-family="JetBrains Mono">${v.note}</text>`;
    } else {
      s += `<circle cx="${x}" cy="${y}" r="${DR}" fill="${color}"/>`;
      s += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="16" font-weight="bold" font-family="JetBrains Mono">${v.note}</text>`;
    }
  });

  s += `</svg>`;
  return s;
}

// ═══════════════════════════════════════════════════
// NECK
// ═══════════════════════════════════════════════════
function renderNeck(ri, ct) {
  const NF = 15;
  const adapted = CFG.shapes.map(adaptShape);
  const shapes = adapted.map(sh => ({ id: sh.id, label: sh.label, color: CFG.shapeColors[sh.id], bf: getBf(sh, ri) })).sort((a, b) => a.bf - b.bf);
  const W = 700, H = 155, NL = 35, NR = 680, NT = 25, NH = 85, FW = (NR - NL) / (NF + 1), SY = i => NT + 10 + (5 - i) * (NH - 20) / 5;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  s += `<rect x="${NL}" y="${NT}" width="${NR - NL}" height="${NH}" rx="4" fill="#1a1a2e"/>`;
  s += `<rect x="${NL}" y="${NT}" width="4" height="${NH}" rx="2" fill="#ddd"/>`;
  for (let i = 1; i <= NF; i++) s += `<line x1="${NL + i * FW}" y1="${NT}" x2="${NL + i * FW}" y2="${NT + NH}" stroke="#333" stroke-width="1.2"/>`;
  for (let i = 0; i < 6; i++) { const sy = SY(i); s += `<line x1="${NL}" y1="${sy}" x2="${NR}" y2="${sy}" stroke="#444" stroke-width="${.6 + i * .12}"/><text x="${NL - 12}" y="${sy + 3}" text-anchor="middle" fill="#444" font-size="9" font-family="JetBrains Mono">${CFG.stringNames[i]}</text>`; }
  for (let i = 1; i <= NF; i++) s += `<text x="${NL + (i - .5) * FW}" y="${NT + NH + 16}" text-anchor="middle" fill="#444" font-size="9" font-family="JetBrains Mono">${i}</text>`;
  [3, 5, 7, 9, 15].forEach(f => { if (f <= NF) s += `<circle cx="${NL + (f - .5) * FW}" cy="${NT + NH + 26}" r="2" fill="#333"/>`; });
  if (NF >= 12) s += `<circle cx="${NL + 11.5 * FW - 4}" cy="${NT + NH + 26}" r="2" fill="#333"/><circle cx="${NL + 11.5 * FW + 4}" cy="${NT + NH + 26}" r="2" fill="#333"/>`;
  shapes.forEach(sh => {
    if (curShape && curShape !== sh.id) return;
    let x = NL + (sh.bf - 1) * FW, zw = 3.5 * FW;
    const xEnd = Math.min(x + zw, NR); x = Math.max(x, NL); zw = xEnd - x;
    s += `<rect x="${x}" y="${NT}" width="${zw}" height="${NH}" fill="${sh.color}" opacity=".18" rx="3"/>`;
    s += `<rect x="${x}" y="${NT}" width="${zw}" height="3" fill="${sh.color}" opacity=".8" rx="1"/>`;
    s += `<text x="${x + zw / 2}" y="${NT - 4}" text-anchor="middle" fill="${sh.color}" font-size="9" font-weight="bold" font-family="Outfit">${sh.label}</text>`;
    s += `<text x="${x + zw / 2}" y="${NT + NH / 2 + 3}" text-anchor="middle" fill="${sh.color}" font-size="9" font-weight="bold" font-family="JetBrains Mono" opacity=".5">fr${sh.bf}</text>`;
  });
  // Draw note dots + barre for selected (or all) shapes
  adapted.forEach(shDef => {
    if (curShape && curShape !== shDef.id) return;
    const col = CFG.shapeColors[shDef.id];
    const r = resolve(shDef, ri, ct.iv);
    const barreVoices = r.voices.filter(v => v.fo === 0);
    if (barreVoices.length >= 2) {
      const barreStrs = barreVoices.map(v => v.str);
      const minStr = Math.min(...barreStrs), maxStr = Math.max(...barreStrs);
      const bx = NL + (r.bf - .5) * FW;
      const by1 = SY(maxStr), by2 = SY(minStr);
      if (r.bf >= 1 && r.bf <= NF) s += `<rect x="${bx - 2.5}" y="${Math.min(by1, by2) - 3.5}" width="5" height="${Math.abs(by2 - by1) + 7}" rx="2.5" fill="${col}" opacity=".6"/>`;
    }
    r.voices.forEach(v => {
      const af = r.bf + v.fo;
      if (af < 1 || af > NF) return;
      const cx = NL + (af - .5) * FW, cy = SY(v.str);
      if (v.isRoot) {
        s += `<circle cx="${cx}" cy="${cy}" r="6.5" fill="${col}"/>`;
        s += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="9" font-weight="bold" font-family="JetBrains Mono">${v.note}</text>`;
      } else {
        s += `<circle cx="${cx}" cy="${cy}" r="6" fill="${col}"/>`;
        s += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="9" font-weight="bold" font-family="JetBrains Mono">${v.note}</text>`;
      }
    });
  });
  s += `</svg>`;
  return s;
}

// ═══════════════════════════════════════════════════
// UI
// ═══════════════════════════════════════════════════
function setRoot(i) { curRoot = i; U(); }

function pickShape(id) { curShape = curShape === id ? null : id; U(); }

function U() {
  const ri = curRoot;
  const ct = CFG.chordTypes.find(c => c.id === curType);
  const rn = CFG.noteDisplay[ri];
  const cn = `${rn}${ct.sym}`;

  document.getElementById('kPills').innerHTML =
    CFG.noteDisplay.map((n, i) =>
    `<div class="pill ${i === ri ? 'on' : ''}" onclick="setRoot(${i})">${n}</div>`
  ).join('');

  document.getElementById('tPills').innerHTML = CFG.chordTypes.map(c =>
    `<div class="pill ${c.id === curType ? 'on' : ''}" onclick="curType='${c.id}';U()">${c.name}</div>`
  ).join('');

  const adapted = CFG.shapes.map(adaptShape);
  let gridHTML = '';
  const sortedShapes = [...adapted].sort((a, b) => getBf(a, ri) - getBf(b, ri));
  sortedShapes.forEach(sh => {
    const col = CFG.shapeColors[sh.id];
    const r = resolve(sh, ri, ct.iv);
    const intervalStr = [0,1,2,3,4,5].map(si => {
      if (r.muted.includes(si)) return 'x';
      const v = r.voices.find(v => v.str === si);
      return v ? v.interval : 'x';
    }).join('-');
    const sel = curShape === sh.id;
    gridHTML += `<div class="shape-card${sel ? ' sel' : ''}" style="${sel ? '--sel-color:' + col : ''}" onclick="pickShape('${sh.id}')">
      <div class="sh-title" style="color:${col}">${sh.label} (${intervalStr})</div>
      <div class="sh-sub">Fret ${r.bf} \u00b7 ${cn}</div>
      <div class="fb">${renderDiagram(r, col)}</div>
    </div>`;
  });
  document.getElementById('grid').innerHTML = gridHTML;

  const shLabel = curShape ? CFG.shapes.find(s => s.id === curShape)?.label : 'All Shapes';
  document.title = `${rn} ${ct.name} \u2014 ${shLabel}`;
  document.getElementById('titleLine1').textContent = `${rn} ${ct.name}`;
  document.getElementById('titleLine2').textContent = shLabel;
  document.getElementById('nC').innerHTML = renderNeck(ri, ct);
}

U();
