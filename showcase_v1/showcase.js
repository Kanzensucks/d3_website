/* =============================================================
   showcase.js — The Territory Anomaly
   One persistent canvas swarm (1 dot ≈ 50 people) morphing
   through six acts; every on-screen number computed at runtime.
   GenAI-assisted (Claude)
   ============================================================= */

'use strict';

/* ── §1 Constants & fixed orders ─────────────────────────── */
const STATES   = ['NSW', 'Vic', 'Qld', 'WA', 'SA', 'Tas', 'ACT', 'NT'];
const NT_IDX   = 7;
const RU_CATS  = ['Vehicle occupant', 'Motorcyclist', 'Pedestrian', 'Pedal cyclist', 'Bus occupant', 'Other or unknown'];
const AGE_CATS = ['0-7', '8-16', '17-25', '26-39', '40-64', '65-74', '75+'];
const SEX_CATS = ['Female', 'Male'];
const DIMS     = { ru: RU_CATS, age: AGE_CATS, sex: SEX_CATS };
const DIM_NAME = { ru: 'road user', age: 'age band', sex: 'sex' };

let UNIT = +(new URLSearchParams(location.search).get('unit')) || 50;
if (![25, 50, 100].includes(UNIT)) UNIT = 50;

const RM  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const fc = d3.format(','), f1 = d3.format('.1f'), f2 = d3.format('.2f');
const pageLoadT = Date.now();   // for the end-card "while you've been here" line

// Deterministic per-dot hash (no Math.random — layouts must be stable)
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash01(i, salt) { return mulberry32(i * 7919 + salt * 104729 + 1)(); }

/* ── DOM handles ─────────────────────────────────────────── */
const stageEl  = document.getElementById('stage');
const canvas   = document.getElementById('swarm');
const ctx      = canvas.getContext('2d');
const svg      = d3.select('#anno');
const tipEl    = document.getElementById('tip');

/* ── §2 Theme tokens & sprite atlas ──────────────────────── */
let pal = null;          // palette object read from CSS custom properties
let sprites = [];        // sprites[colorIdx][sizeIdx] = offscreen canvas
let ghostSprites = [];   // hollow ring variants — counterfactual "excess" dots
const SIZES = [1.8, 2.2, 3.0];          // S, M, L dot radii (css px)
const SPRITE_GLOW = 2.4;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function readTokens() {
  const stateCols = [];
  for (let i = 1; i <= 7; i++) stateCols.push(cssVar(`--dot-${i}`));
  stateCols.push(cssVar('--accent'));                    // NT = accent, index 7
  const ruCols = [];
  for (let i = 1; i <= 6; i++) ruCols.push(cssVar(`--cat-ru-${i}`));
  const inkSoft = cssVar('--ink-soft'), accent2 = cssVar('--accent2');
  const ageCols = d3.quantize(d3.interpolateRgb(inkSoft, accent2), 7);
  const sexCols = [cssVar('--sex-f'), cssVar('--sex-m')];
  pal = {
    bg: cssVar('--bg'), surface: cssVar('--surface'), surface2: cssVar('--surface2'),
    ink: cssVar('--ink'), inkSoft, inkMute: cssVar('--ink-mute'),
    accent: cssVar('--accent'), accent2, accentSoft: cssVar('--accent-soft'),
    line: cssVar('--line'), line2: cssVar('--line2'),
    colors: stateCols.concat(ruCols, ageCols, sexCols),  // 8 + 6 + 7 + 2 = 23
  };
}
const COL_STATE = 0, COL_RU = 8, COL_AGE = 14, COL_SEX = 21;

function buildSprites() {
  const dpr = DPR;
  sprites = pal.colors.map((col, ci) => SIZES.map((r) => {
    const strong = ci === NT_IDX || ci === COL_RU;       // NT + Vehicle-occupant glow harder
    const R = Math.ceil(r * SPRITE_GLOW) + 2;
    const c = document.createElement('canvas');
    c.width = c.height = R * 2 * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const grad = g.createRadialGradient(R, R, r * 0.5, R, R, r * SPRITE_GLOW);
    grad.addColorStop(0, col);
    grad.addColorStop(1, 'transparent');
    g.globalAlpha = strong ? 0.35 : 0.2;
    g.fillStyle = grad;
    g.beginPath(); g.arc(R, R, r * SPRITE_GLOW, 0, TAU); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = col;
    g.beginPath(); g.arc(R, R, r, 0, TAU); g.fill();
    c._half = R;                                          // css-px half size
    return c;
  }));
  // GenAI-assisted (Claude): hollow ring variants for the counterfactual
  // ("excess") dots in act 4 — outline only, no glow, one size
  ghostSprites = pal.colors.map((col) => {
    const r = 2.6, R = Math.ceil(r) + 3;
    const c = document.createElement('canvas');
    c.width = c.height = R * 2 * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.strokeStyle = col;
    g.lineWidth = 1.1;
    g.beginPath(); g.arc(R, R, r, 0, TAU); g.stroke();
    c._half = R;
    return c;
  });
}

/* ── Stage geometry ──────────────────────────────────────── */
let W = 0, H = 0, DPR = 1, dprCap = Infinity;
const MARGIN = { top: 200, right: 96, bottom: 200, left: 140 };
let plot = { x0: 0, x1: 0, y0: 0, y1: 0 };
let panelOpen = false;

/* Caption card drag/resize state */
let captionPos = { left: null, right: null, bottom: null, top: null, width: null, height: null };
let captionDragging = false;
let dragStart = { x: 0, y: 0, captionX: 0, captionY: 0 };

function sizeStage() {
  const r = stageEl.getBoundingClientRect();
  W = Math.max(320, r.width); H = Math.max(320, r.height);
  DPR = Math.min(window.devicePixelRatio || 1, W > 1600 ? 1.5 : 2, dprCap);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  svg.attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
  computePlot();
}
function computePlot() {
  plot = {
    x0: MARGIN.left,
    x1: W - (panelOpen ? 320 : MARGIN.right),
    y0: MARGIN.top,
    y1: H - MARGIN.bottom,
  };
}

/* ── §3 Data load, coercion, derivation, assertions ──────── */
let rate$ = new Map();        // `${state}|${year}` -> {cases, population, rate}
let ru$   = new Map();        // `${state}|${year}|${cat}` -> cases  (recorded 5)
let age$  = new Map();
let sex$  = new Map();
let trend = [];               // [{year, cases}]
let geo   = null;
let YEARS = [];
let natlRate = new Map();     // year -> population-weighted rate
let ntMult   = new Map();     // year -> NT rate / national rate
let minutes  = new Map();     // year -> minutes between hospitalisations
let voRes    = new Map();     // `${state}|${year}` -> derived vehicle-occupant cases
let totalCases = 0;
let stateTotals = new Map();  // state -> decade cases
let ntExcess = 0, ntExcessFrac = 0;  // NT cases above the at-national-rate expectation
const audit = { reconciled: false, totA: 0, totB: 0, voClamps: 0, ageGaps: 0, sexGaps: 0, geoOk: false, censusOk: false };

function loadData() {
  return Promise.all([
    d3.csv('../data/state_year_per100k.csv', d => ({ year: +d.Year, state: d.state, cases: +d.cases, population: +d.population, rate: +d.cases_per_100k })),
    d3.csv('../data/national_trend.csv',     d => ({ year: +d.Year, cases: +d.cases })),
    d3.csv('../data/state_year_roaduser.csv', d => ({ year: +d.year, key: d.road_user, state: d.state, cases: +d.cases })),
    d3.csv('../data/state_year_age.csv',      d => ({ year: +d.year, key: d.age_group, state: d.state, cases: +d.cases })),
    d3.csv('../data/state_year_sex.csv',      d => ({ year: +d.year, key: d.sex, state: d.state, cases: +d.cases })),
    d3.json('../data/aus_states.geojson'),
  ]).then(([per, tr, ru, ag, sx, gj]) => {
    trend = tr.sort((a, b) => a.year - b.year);
    geo = gj;
    YEARS = [...new Set(per.map(d => d.year))].sort((a, b) => a - b);
    per.forEach(d => rate$.set(`${d.state}|${d.year}`, d));
    ru.forEach(d => ru$.set(`${d.state}|${d.year}|${d.key}`, d.cases));
    ag.forEach(d => age$.set(`${d.state}|${d.year}|${d.key}`, d.cases));
    sx.forEach(d => sex$.set(`${d.state}|${d.year}|${d.key}`, d.cases));
    deriveAll();
  });
}

function deriveAll() {
  totalCases = d3.sum([...rate$.values()], d => d.cases);
  STATES.forEach(s => stateTotals.set(s, d3.sum(YEARS, y => rate$.get(`${s}|${y}`).cases)));
  YEARS.forEach(y => {
    const rows = STATES.map(s => rate$.get(`${s}|${y}`));
    const nr = d3.sum(rows, d => d.cases) / d3.sum(rows, d => d.population) * 1e5;
    natlRate.set(y, nr);
    ntMult.set(y, rate$.get(`NT|${y}`).rate / nr);
    const natCases = trend.find(t => t.year === y).cases;
    minutes.set(y, 525600 / natCases);
  });
  // Counterfactual: NT cases had it run at the national rate each year.
  // expected(y) = cases(y) ÷ multiple(y); excess = actual − expected.
  let ntExpected = 0;
  YEARS.forEach(y => { ntExpected += rate$.get(`NT|${y}`).cases / ntMult.get(y); });
  ntExcess = stateTotals.get('NT') - ntExpected;
  ntExcessFrac = ntExcess / stateTotals.get('NT');
  // Vehicle-occupant residual — byte-for-byte the Sankey page's rule
  STATES.forEach(s => YEARS.forEach(y => {
    const tot = rate$.get(`${s}|${y}`).cases;
    const five = d3.sum(RU_CATS.slice(1), c => ru$.get(`${s}|${y}|${c}`) || 0);
    const vo = tot - five;
    if (vo < 0) { audit.voClamps++; console.warn(`VO residual clamped: ${s} ${y} (${vo})`); }
    voRes.set(`${s}|${y}`, Math.max(0, vo));
  }));
  // Assertion pass (results surface in the methods popover)
  audit.totA = totalCases;
  audit.totB = d3.sum(trend, d => d.cases);
  audit.reconciled = audit.totA === audit.totB;
  if (!audit.reconciled) console.warn(`Total mismatch: per100k ${audit.totA} vs trend ${audit.totB}`);
  STATES.forEach(s => YEARS.forEach(y => {
    const tot = rate$.get(`${s}|${y}`).cases;
    const aSum = d3.sum(AGE_CATS, c => age$.get(`${s}|${y}|${c}`) || 0);
    const xSum = d3.sum(SEX_CATS, c => sex$.get(`${s}|${y}|${c}`) || 0);
    if (aSum !== tot) audit.ageGaps++;
    if (xSum !== tot) audit.sexGaps++;
  }));
  const codes = new Set(geo.features.map(f => f.properties.code));
  audit.geoOk = STATES.every(s => codes.has(s)) && codes.size === STATES.length;
}

function catCases(dim, state, year, cat) {
  if (dim === 'ru') return cat === 'Vehicle occupant' ? voRes.get(`${state}|${year}`) : (ru$.get(`${state}|${year}|${cat}`) || 0);
  if (dim === 'age') return age$.get(`${state}|${year}|${cat}`) || 0;
  return sex$.get(`${state}|${year}|${cat}`) || 0;
}

/* ── §4 Dot census & partition tables ────────────────────── */
let N = 0;
let cohorts = [];             // {si, yi, state, year, cases, start, n}
let dotState, dotYear, dotCohort;            // Uint8 / Uint8 / Uint8
let labels = {};              // labels[dim] = Uint8Array(N) category index
let posX, posY, srcX, srcY, tgtX, tgtY, tw0, twDur, phase;
let velX, velY, sprK, dotFly, dotGhost;   // spring engine + counterfactual flags
let trackIdx = 0, trackOn = false;        // follow-one-dot

function largestRemainder(total, weights) {
  const sum = d3.sum(weights);
  const out = weights.map(() => 0);
  if (sum <= 0 || total <= 0) { if (total > 0) out[out.length - 1] = total; return out; }
  let used = 0;
  const rem = weights.map((w, i) => {
    const ideal = w / sum * total;
    out[i] = Math.floor(ideal);
    used += out[i];
    return [ideal - out[i], i];
  });
  rem.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; k < total - used; k++) out[rem[k % rem.length][1]]++;
  return out;
}

function buildCensus(unit) {
  UNIT = unit;
  const totalDots = Math.round(totalCases / unit);
  cohorts = [];
  YEARS.forEach((y, yi) => STATES.forEach((s, si) =>
    cohorts.push({ si, yi, state: s, year: y, cases: rate$.get(`${s}|${y}`).cases })));
  const alloc = largestRemainder(totalDots, cohorts.map(c => c.cases));
  let idx = 0;
  cohorts.forEach((c, i) => { c.start = idx; c.n = alloc[i]; idx += c.n; });
  N = idx;
  dotState  = new Uint8Array(N);
  dotYear   = new Uint8Array(N);
  dotCohort = new Uint8Array(N);
  posX = new Float32Array(N); posY = new Float32Array(N);
  srcX = new Float32Array(N); srcY = new Float32Array(N);
  tgtX = new Float32Array(N); tgtY = new Float32Array(N);
  tw0  = new Float32Array(N); twDur = new Float32Array(N).fill(1);
  phase = new Float32Array(N);
  velX = new Float32Array(N); velY = new Float32Array(N);
  dotFly = new Uint8Array(N);
  dotGhost = new Uint8Array(N);
  sprK = new Float32Array(N);
  cohorts.forEach((c, ci) => {
    for (let i = c.start; i < c.start + c.n; i++) {
      dotState[i] = c.si; dotYear[i] = c.yi; dotCohort[i] = ci;
      phase[i] = hash01(i, 11) * TAU;
      sprK[i] = 26 + hash01(i, 15) * 12;   // per-dot spring stiffness — organic spread
    }
  });
  // the tracked dot: middle of the NT 2020 cohort (the peak-multiple year)
  const tc = cohorts.find(c => c.state === 'NT' && c.year === 2020) || cohorts.find(c => c.state === 'NT');
  trackIdx = tc ? tc.start + Math.floor(tc.n / 2) : 0;
  // Per-dimension category labels: largest remainder inside every cohort,
  // contiguous in fixed category order so colours form readable blocks.
  labels = {};
  let censusOk = true;
  for (const dim of Object.keys(DIMS)) {
    const arr = new Uint8Array(N);
    const cats = DIMS[dim];
    cohorts.forEach(c => {
      const split = largestRemainder(c.n, cats.map(cat => catCases(dim, c.state, c.year, cat)));
      if (d3.sum(split) !== c.n) censusOk = false;
      let p = c.start;
      split.forEach((cnt, k) => { for (let j = 0; j < cnt; j++) arr[p++] = k; });
    });
    labels[dim] = arr;
  }
  audit.censusOk = censusOk && N === totalDots;
  document.getElementById('chip-unit').textContent = `● ≈ ${unit} people`;
  document.getElementById('chip-unit').title = `Each dot represents about ${unit} hospitalised people (${fc(N)} dots in total)`;
}

/* ── §5 Layout builders (six acts) ───────────────────────── */
let layouts = {};             // actIdx -> Float32Array(2N) interleaved x,y
let discs = [];               // 88 {ci, si, yi, year, state, x, y, r, sx, sy, tx, ty, t0, du}
let geoMeta = null;           // {path, clusters, actLeader}
let streamMeta = null;        // {series, xs, ys, keys}
let stackMeta = null;         // {dim, sides:[{x, bands:[{cat,y0,y1,pct,count}]}]}
let xYears = null, yRate = null, rDisc = null;

function buildAllLayouts() {
  layouts[0] = layoutPhyllo();
  layouts[1] = layoutColumns();
  layouts[2] = layoutGeo();
  buildDiscs();
  layouts[3] = layoutMerge();
  layouts[4] = layoutStacks(activeDim);
  layouts[5] = layoutStream();
}

function layoutPhyllo() {
  const out = new Float32Array(2 * N);
  const cx = W / 2, cy = (plot.y0 + plot.y1) / 2 + 10;
  const Rmax = Math.min(W, plot.y1 - plot.y0) * 0.42;
  const c = Rmax / Math.sqrt(N);
  for (let i = 0; i < N; i++) {
    const r = c * Math.sqrt(i + 0.5), a = i * GOLDEN;
    out[2 * i] = cx + r * Math.cos(a);
    out[2 * i + 1] = cy + r * Math.sin(a);
  }
  return out;
}

function layoutColumns() {
  const out = new Float32Array(2 * N);
  const xs = d3.scalePoint(YEARS, [plot.x0, plot.x1]).padding(0.5);
  const colW = 12;
  const maxDots = d3.max(YEARS, (y, yi) => d3.sum(cohorts.filter(c => c.yi === yi), c => c.n));
  const pitch = Math.min(5, (plot.y1 - plot.y0) * 0.62 / Math.ceil(maxDots / colW));
  YEARS.forEach((y, yi) => {
    const x0 = xs(y) - (colW - 1) * pitch / 2;
    let k = 0;
    // bottom-up, states in fixed order => NT lands on the crest
    cohorts.filter(c => c.yi === yi).forEach(c => {
      for (let i = c.start; i < c.start + c.n; i++, k++) {
        out[2 * i] = x0 + (k % colW) * pitch;
        out[2 * i + 1] = plot.y1 - Math.floor(k / colW) * pitch;
      }
    });
  });
  layouts._colXs = xs;
  return out;
}

function layoutGeo() {
  const out = new Float32Array(2 * N);
  // Extend bounds beyond plot to zoom in (~25% bigger map) — spreads eastern state centroids
  const proj = d3.geoIdentity().reflectY(true)
    .fitExtent([[plot.x0 - 80, plot.y0 - 40], [plot.x1 + 40, plot.y1 + 60]], geo);
  const path = d3.geoPath(proj);
  // adaptive spacing: 0.28 keeps clusters small enough to spread without mass overlap
  const maxN = d3.max(STATES, s => Math.round(stateTotals.get(s) / UNIT));
  const sp = Math.min(3.0, (plot.y1 - plot.y0) * 0.28 / Math.sqrt(maxN));
  const clusters = STATES.map((s, si) => {
    const f = geo.features.find(f => f.properties.code === s);
    let [cx, cy] = path.centroid(f);
    if (s === 'ACT') { cx += 64; cy += 56; }            // it sits inside NSW
    const n = Math.round(stateTotals.get(s) / UNIT);
    return { si, s, cx, cy, R: sp * Math.sqrt(n), f, trueC: [cx, cy] };
  });
  const clamp = (c) => {
    c.cx = Math.max(plot.x0 + c.R * 0.7, Math.min(plot.x1 - c.R * 0.7, c.cx));
    c.cy = Math.max(plot.y0 + c.R * 0.7, Math.min(plot.y1 - c.R - 16, c.cy));
  };
  // overlap separation — drift cap keeps clusters within 150px of true centroid
  const MAX_DRIFT = 150;
  for (let pass = 0; pass < 15; pass++) {
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const ci = clusters[i], cj = clusters[j];
        const dx = cj.cx - ci.cx, dy = cj.cy - ci.cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        const gap = ci.R + cj.R + 10;
        if (d < gap && d > 0.5) {
          const push = (gap - d) / d * 0.25;
          ci.cx -= dx * push; ci.cy -= dy * push;
          cj.cx += dx * push; cj.cy += dy * push;
        }
      }
    }
    clusters.forEach(c => {
      const dx = c.cx - c.trueC[0], dy = c.cy - c.trueC[1];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > MAX_DRIFT) { c.cx = c.trueC[0] + dx / d * MAX_DRIFT; c.cy = c.trueC[1] + dy / d * MAX_DRIFT; }
    });
    clusters.forEach(clamp);
  }
  const counters = STATES.map(() => 0);
  for (const c of cohorts) {
    const cl = clusters[c.si];
    for (let i = c.start; i < c.start + c.n; i++) {
      const k = counters[c.si]++;
      const r = sp * Math.sqrt(k + 0.5), a = k * GOLDEN;
      out[2 * i] = cl.cx + r * Math.cos(a);
      out[2 * i + 1] = cl.cy + r * Math.sin(a);
    }
  }
  geoMeta = { path, clusters };
  return out;
}

function buildDiscs() {
  xYears = d3.scalePoint(YEARS, [plot.x0 + 30, plot.x1]).padding(0.5);
  const maxRate = d3.max([...rate$.values()], d => d.rate);
  yRate = d3.scaleLinear([0, Math.ceil(maxRate / 50) * 50], [plot.y1, plot.y0]);
  rDisc = d3.scaleSqrt([0, d3.max(cohorts, c => c.cases)], [2.5, 24]);
  const nodes = cohorts.map(c => ({
    ci: cohorts.indexOf(c), si: c.si, yi: c.yi, year: c.year, state: c.state,
    x: xYears(c.year), y: yRate(rate$.get(`${c.state}|${c.year}`).rate),
    r: rDisc(c.cases),
  }));
  const sim = d3.forceSimulation(nodes)
    .force('x', d3.forceX(d => xYears(d.year)).strength(0.8))
    .force('y', d3.forceY(d => yRate(rate$.get(`${d.state}|${d.year}`).rate)).strength(1))
    .force('c', d3.forceCollide(d => d.r + 1))
    .stop();
  for (let t = 0; t < 120; t++) sim.tick();
  nodes.forEach(d => { d.y = yRate(rate$.get(`${d.state}|${d.year}`).rate); }); // rate stays exact; dodge is horizontal only
  discs = nodes.map(d => ({ ...d, sx: d.x, sy: d.y, tx: d.x, ty: d.y, t0: 0, du: 1 }));
}

function layoutMerge() {
  const out = new Float32Array(2 * N);
  for (const d of discs) {
    const c = cohorts[d.ci];
    for (let i = c.start; i < c.start + c.n; i++) {
      out[2 * i] = d.tx + (hash01(i, 3) - 0.5) * d.r;
      out[2 * i + 1] = d.ty + (hash01(i, 4) - 0.5) * d.r;
    }
  }
  return out;
}

function layoutStacks(dim) {
  const out = new Float32Array(2 * N);
  const cats = DIMS[dim], lab = labels[dim];
  const stackH = (plot.y1 - plot.y0) * 0.72;
  const top = plot.y0 + (plot.y1 - plot.y0 - stackH) / 2 + 14;
  const stackW = 110;
  const sides = [
    { name: 'NT', x: plot.x0 + (plot.x1 - plot.x0) * 0.32, test: i => dotState[i] === NT_IDX },
    { name: 'Rest of Australia', x: plot.x0 + (plot.x1 - plot.x0) * 0.68, test: i => dotState[i] !== NT_IDX },
  ];
  stackMeta = { dim, sides: [] };
  if (dotGhost) dotGhost.fill(0);
  for (const side of sides) {
    const members = [];
    for (let i = 0; i < N; i++) if (side.test(i)) members.push(i);
    const byCat = cats.map((c, k) => members.filter(i => lab[i] === k));
    // GenAI-assisted (Claude): flag the counterfactual excess — within each
    // NT band, the last round(n × excessFrac) dots render hollow when toggled
    if (side.name === 'NT' && dotGhost && ntExcessFrac > 0) {
      byCat.forEach(list => {
        const nGhost = Math.round(list.length * ntExcessFrac);
        for (let j = list.length - nGhost; j < list.length; j++) dotGhost[list[j]] = 1;
      });
    }
    // band heights + printed % come from CASE counts — dots are ≈50-person
    // units and would quantise the NT side to 0.7pp steps (or drop categories)
    const sideStates = side.name === 'NT' ? ['NT'] : STATES.filter(s => s !== 'NT');
    const caseCnt = cats.map(cat => d3.sum(sideStates, s => d3.sum(YEARS, y => catCases(dim, s, y, cat))));
    const caseTotal = d3.sum(caseCnt) || 1;
    let yCur = top;
    const bands = [];
    cats.forEach((cat, k) => {
      const cnt = byCat[k].length;
      const h = stackH * (caseCnt[k] / caseTotal);
      const band = { cat, y0: yCur, y1: yCur + h, pct: caseCnt[k] / caseTotal * 100, count: cnt };
      // pack the band's dots: neat grid when it fits, uniform fill when dense
      if (cnt > 0) {
        const ideal = Math.sqrt(stackW * Math.max(h, 3) / cnt);
        if (ideal >= 3.2) {
          const pitch = Math.min(13, ideal);
          const cols = Math.max(1, Math.floor(stackW / pitch));
          const rows = Math.ceil(cnt / cols);
          const gx = side.x - (Math.min(cols, cnt) - 1) * pitch / 2;
          const gy = (band.y0 + band.y1) / 2 - (rows - 1) * pitch / 2;
          byCat[k].forEach((i, j) => {
            out[2 * i] = gx + (j % cols) * pitch;
            out[2 * i + 1] = gy + Math.floor(j / cols) * pitch;
          });
        } else {
          // dense band: deterministic uniform fill stays inside the band rect
          const pad = 1.5;
          byCat[k].forEach((i) => {
            out[2 * i] = side.x - stackW / 2 + hash01(i, 13) * stackW;
            out[2 * i + 1] = band.y0 + pad + hash01(i, 14) * Math.max(1, h - pad * 2);
          });
        }
      }
      bands.push(band);
      yCur += h;
    });
    stackMeta.sides.push({ name: side.name, x: side.x, w: stackW, bands, total: members.length });
  }
  // largest composition divergence between the two sides (drives caption + SVG note)
  const [ntS, restS] = stackMeta.sides;
  let div = { cat: cats[0], d: -1, a: 0, b: 0 };
  cats.forEach((c, k) => {
    const d = Math.abs(ntS.bands[k].pct - restS.bands[k].pct);
    if (d > div.d) div = { cat: c, d, a: ntS.bands[k].pct, b: restS.bands[k].pct };
  });
  stackMeta.divergence = div;
  return out;
}

function layoutStream() {
  const out = new Float32Array(2 * N);
  const cats = RU_CATS, lab = labels.ru;
  const rows = YEARS.map(y => {
    const o = { year: y };
    cats.forEach(c => { o[c] = d3.sum(STATES, s => catCases('ru', s, y, c)); });
    return o;
  });
  const series = d3.stack().keys(cats)
    .offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut)(rows);
  const xs = d3.scalePoint(YEARS, [plot.x0 + 10, plot.x1 - 10]).padding(0.35);
  const lo = d3.min(series, s => d3.min(s, d => d[0]));
  const hi = d3.max(series, s => d3.max(s, d => d[1]));
  const ys = d3.scaleLinear([lo, hi], [plot.y1 - 20, plot.y0 + 30]);
  const step = xs.step();
  const sIdx = {}; series.forEach(s => { sIdx[s.key] = s; });
  for (let i = 0; i < N; i++) {
    const yi = dotYear[i], cat = cats[lab[i]], s = sIdx[cat];
    const jit = (hash01(i, 7) - 0.5) * 0.999;
    const x = xs(YEARS[yi]) + jit * step;
    // lerp the band edges toward the neighbouring year for a true stream shape
    const nb = jit > 0 ? Math.min(yi + 1, YEARS.length - 1) : Math.max(yi - 1, 0);
    const t = nb === yi ? 0 : Math.abs(jit);
    const e0 = s[yi][0] + (s[nb][0] - s[yi][0]) * t;
    const e1 = s[yi][1] + (s[nb][1] - s[yi][1]) * t;
    out[2 * i] = x;
    out[2 * i + 1] = ys(e0 + hash01(i, 8) * (e1 - e0));
  }
  streamMeta = { series, xs, ys, keys: cats };
  return out;
}

/* ── §6 Tween engine & render loop ───────────────────────── */
let timer = null, running = false;
let morphEnd = 0, settled = true, trailsOn = false, fadeMode = null; // 'merge' | 'burst'
let frameTick = 0;
let lastMaxRes = 0, lastFrameT = 0;     // spring residual + dt bookkeeping
const FE_R = 90, FE_D = 2.2;            // fisheye radius / distortion (explore mode)

/* GenAI-assisted (Claude): ambient intricacy engine — Delaunay neural web,
   density topography, shockwaves, cursor force field. All d3-bundle only. */
let webLayer = null, webDel = null, webPts = null, contourLayer = null;
let ambientT = 0, ambientTimer = null;
let waves = [];                          // {x, y, t0, amp} travelling rings
const WEB_ACTS = { 0: 30, 2: 17, 5: 14 };  // act -> max web edge length (px)
const WAVE_V = 0.45, WAVE_SIG = 38, WAVE_LIFE = 1600;
const REPEL_R = 80;
function ambientOK() { return dprCap === Infinity && !RM; }
let rmPrev = null, rmFadeEnd = 0;       // reduced-motion crossfade
let probe = { samples: [], active: false, phase: 0 };
let quad = null, lensSet = null, mouse = { x: -1e4, y: -1e4 };
let spotlight = null;          // legend-selected colour group to highlight (null = all)

function ease3(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }

function staggerRank(i, mode) {
  if (mode === 'year')  return dotYear[i] / YEARS.length;
  if (mode === 'state') return dotState[i] / STATES.length;
  if (mode === 'cat')   return labels[activeDim][i] / DIMS[activeDim].length;
  if (mode === 'ru')    return labels.ru[i] / RU_CATS.length;
  return 0;
}

let bowAmp = 0;
function retarget(target, opts = {}) {
  const now = performance.now();
  if (RM) {                              // crossfade between settled end states
    snapshotForRM();
    for (let i = 0; i < N; i++) {
      posX[i] = srcX[i] = tgtX[i] = target[2 * i];
      posY[i] = srcY[i] = tgtY[i] = target[2 * i + 1];
      tw0[i] = now; twDur[i] = 1;
    }
    morphEnd = now; settled = false; trailsOn = false; bowAmp = 0;
    rmFadeEnd = now + 320;
    lastMaxRes = 0;
    wake();
    return;
  }
  const stagger = opts.stagger || 'none';
  const spread = opts.spread ?? 600;
  bowAmp = opts.bow ?? 0.08;
  trailsOn = opts.trails !== false && dprCap === Infinity;
  fadeMode = opts.fade || null;
  dotFly.fill(0);          // springs: every dot re-launches with a fresh kick
  lastMaxRes = 1e9;
  let end = 0;
  for (let i = 0; i < N; i++) {
    srcX[i] = posX[i]; srcY[i] = posY[i];
    tgtX[i] = target[2 * i]; tgtY[i] = target[2 * i + 1];
    const delay = staggerRank(i, stagger) * spread + hash01(i, 5) * 80;
    const dist = Math.hypot(tgtX[i] - srcX[i], tgtY[i] - srcY[i]);
    const du = Math.min(1400, 900 + dist * 0.35);
    tw0[i] = now + delay; twDur[i] = du;
    if (now + delay + du > end) end = now + delay + du;
  }
  morphEnd = end;
  settled = false;
  hideTip();
  if (!probe.active && probe.phase < 2) { probe.active = true; probe.samples = []; }
  wake();
}

function snapshotForRM() {
  if (!rmPrev) { rmPrev = document.createElement('canvas'); }
  rmPrev.width = canvas.width; rmPrev.height = canvas.height;
  rmPrev.getContext('2d').drawImage(canvas, 0, 0);
}

function onSettle() {
  settled = true;
  trailsOn = false;
  fadeMode = null;
  for (let i = 0; i < N; i++) { posX[i] = tgtX[i]; posY[i] = tgtY[i]; }
  velX.fill(0); velY.fill(0);
  if (actCur !== 3) {
    quad = d3.quadtree().x(i => posX[i]).y(i => posY[i]).addAll(d3.range(N));
  } else quad = null;
  if (probe.active) evalProbe();
  scheduleAmbient();
  // settle thump — the swarm lands and breathes one ring outward
  if (N > 0) {
    let sx = 0, sy = 0, sn = 0;
    for (let i = 0; i < N; i += 64) { sx += tgtX[i]; sy += tgtY[i]; sn++; }
    emitWave(sx / sn, sy / sn, 8);
  }
}

function evalProbe() {
  probe.active = false;
  // need a real run of frames; the median ignores one-off GC/tab-switch spikes
  if (probe.samples.length < 20) return;
  const mean = d3.median(probe.samples);
  if (mean > 24) {
    probe.phase++;
    if (probe.phase === 1) {
      dprCap = 1; sizeStage(); buildSprites();
      console.warn('Perf probe: frame mean ' + f1(mean) + 'ms — DPR capped at 1');
    } else if (UNIT === 50) {
      console.warn('Perf probe: still slow — rebuilding census at 1 dot ≈ 100 people');
      rebuildUnit(100);
    }
  } else probe.phase = 2;
}

function rebuildUnit(unit) {
  buildCensus(unit);
  buildAllLayouts();
  const t = layouts[actCur === 3 ? 3 : actCur];
  for (let i = 0; i < N; i++) {
    posX[i] = srcX[i] = tgtX[i] = t[2 * i];
    posY[i] = srcY[i] = tgtY[i] = t[2 * i + 1];
    tw0[i] = 0; twDur[i] = 1;
  }
  velX.fill(0); velY.fill(0); dotFly.fill(0); lastMaxRes = 0;
  morphEnd = 0; settled = false;          // forces onSettle housekeeping next frame
  buildActSvg(actCur);
  wake();
}

function frame() {
  const now = performance.now();
  frameTick++;
  if (probe.active) {
    if (probe._last) probe.samples.push(now - probe._last);
    probe._last = now;
  } else probe._last = 0;

  const dt = Math.min(0.033, Math.max(0, (now - lastFrameT) / 1000));
  lastFrameT = now;
  const morphing = now < morphEnd;
  // springs settle on residual energy, with a hard failsafe past morphEnd
  if (!morphing && !settled && (lastMaxRes < 0.7 || now > morphEnd + 1200)) onSettle();

  // physics-sleep: settled + idle -> render breathe at half rate; stop entirely when allowed
  if (settled && now > rmFadeEnd) {
    if (RM || document.hidden) { sleep(); return; }
    if (frameTick % 2 && !(exploreMode && mouse.x > -1e3)) return;  // full rate under the lens
  }

  if (trailsOn && morphing) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);
  }

  const colorBase = actCur >= 4 ? (actCur === 5 ? COL_RU : dimOffset(activeDim)) : COL_STATE;
  const labArr = actCur === 5 ? labels.ru : (actCur === 4 ? labels[activeDim] : null);
  const breatheT = now * 0.0015;
  const ghostOn = actCur === 4 && ghostMode;


  let lastA = 1, frMaxRes = 0;
  ctx.globalAlpha = 1;

  for (let i = 0; i < N; i++) {
    let x, y, a = 1;
    if (settled) {
      x = tgtX[i];
      y = tgtY[i] + (RM ? 0 : Math.sin(breatheT + phase[i]) * 0.6);
      if (fadeMode === 'merged') a = 0;
    } else {
      // GenAI-assisted (Claude): underdamped spring integrator — dots carry
      // momentum, overshoot a touch and settle, instead of riding an ease curve
      let p = (now - tw0[i]) / twDur[i];
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      if (now < tw0[i]) {
        x = srcX[i]; y = srcY[i];
      } else {
        if (!dotFly[i]) {                  // launch: lateral kick replaces the bow
          dotFly[i] = 1;
          const dx0 = tgtX[i] - srcX[i], dy0 = tgtY[i] - srcY[i];
          const d0 = Math.hypot(dx0, dy0);
          if (d0 > 1 && bowAmp > 0) {
            const kick = (hash01(i, 6) > 0.5 ? 1 : -1) * bowAmp * d0 * 6.5;
            velX[i] = (-dy0 / d0) * kick;
            velY[i] = (dx0 / d0) * kick;
          } else { velX[i] = 0; velY[i] = 0; }
        }
        const k = sprK[i], damp = 1.4 * Math.sqrt(k);   // ζ ≈ 0.7 — one soft overshoot
        velX[i] += ((tgtX[i] - posX[i]) * k - velX[i] * damp) * dt;
        velY[i] += ((tgtY[i] - posY[i]) * k - velY[i] * damp) * dt;
        x = posX[i] + velX[i] * dt;
        y = posY[i] + velY[i] * dt;
        const res = Math.abs(tgtX[i] - x) + Math.abs(tgtY[i] - y)
                  + (Math.abs(velX[i]) + Math.abs(velY[i])) * 0.04;
        if (res > frMaxRes) frMaxRes = res;
      }
      if (fadeMode === 'merge') a = p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
      else if (fadeMode === 'burst') a = p < 0.2 ? p / 0.2 : 1;
    }
    posX[i] = x; posY[i] = y;
    if (spotlight != null) {
      const grp = colorBase === COL_STATE ? dotState[i] : labArr[i];
      if (grp !== spotlight) a *= 0.10;
    }
    if (a <= 0.02) continue;
    const ghost = ghostOn && dotGhost[i];
    if (ghost) a *= 0.55 + 0.3 * Math.sin(now * 0.003 + phase[i]);   // slow pulse
    if (a !== lastA) { ctx.globalAlpha = a; lastA = a; }
    const ci = colorBase === COL_STATE ? dotState[i] : colorBase + labArr[i];
    if (ghost) {
      const gs = ghostSprites[ci], gh = gs._half;
      ctx.drawImage(gs, x - gh, y - gh, gh * 2, gh * 2);
      continue;
    }
    const sz = (lensSet && lensSet.has(i)) ? 2 : (actCur === 1 ? 1 : 0);
    const sp = sprites[ci][sz];
    const half = sp._half;
    ctx.drawImage(sp, x - half, y - half, half * 2, half * 2);
  }
  ctx.globalAlpha = 1;
  if (!settled) lastMaxRes = frMaxRes;

  if (inAct3 || discFade > 0) drawDiscs(now, morphing);

  if (trackOn) drawTracker(now);

  if (RM && now < rmFadeEnd && rmPrev) {
    ctx.globalAlpha = (rmFadeEnd - now) / 320;
    ctx.drawImage(rmPrev, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

let discFade = 0, discLeaveT = 0;
function drawDiscs(now, morphing) {
  for (const d of discs) {
    // disc position tween (panel open/close re-dodge)
    let p = (now - d.t0) / d.du;
    p = p < 0 ? 0 : p > 1 ? 1 : p;
    const e = ease3(p);
    d.x = d.sx + (d.tx - d.sx) * e;
    d.y = d.sy + (d.ty - d.sy) * e;
    // alpha
    let a;
    if (actCur === 3) {
      if (settled || RM) a = 1;
      else {
        const c = cohorts[d.ci];
        let q = (now - tw0[c.start]) / twDur[c.start];
        q = q < 0 ? 0 : q > 1 ? 1 : q;
        a = q > 0.75 ? (q - 0.75) / 0.25 : 0;
      }
      discFade = 1;
    } else {
      a = discFade * Math.max(0, 1 - (now - discLeaveT) / 180);
    }
    if (focusYear != null && d.year !== focusYear) a *= 0.3;
    if (spotlight != null && d.si !== spotlight) a *= 0.14;
    if (a <= 0.02) continue;
    ctx.globalAlpha = a;
    if (d.si === NT_IDX) {
      ctx.fillStyle = pal.accent;
      ctx.globalAlpha = a * 0.22;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 1.7, 0, TAU); ctx.fill();
      ctx.globalAlpha = a;
    }
    ctx.fillStyle = pal.colors[d.si];
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (actCur !== 3 && performance.now() - discLeaveT > 200) discFade = 0;
}

function retargetDiscs(du = 320) {
  const now = performance.now();
  for (const d of discs) { d.sx = d.x; d.sy = d.y; d.t0 = now; d.du = du; }
  wake();
}

/* GenAI-assisted (Claude): follow-one-dot — ring-buffer trail + halo + label.
   In act 3 the dots hide inside their cohort discs, so the halo hands over
   to the disc that contains the tracked dot. */
let trailBuf = new Float32Array(2 * 64), trailLen = 0, trailHead = 0, trailTick = 0;
function drawTracker(now) {
  let tx, ty, inDisc = false;
  if (actCur === 3) {
    const d = discs[dotCohort[trackIdx]];
    if (!d) return;
    tx = d.x; ty = d.y; inDisc = true;
  } else { tx = posX[trackIdx]; ty = posY[trackIdx]; }
  if (++trailTick % 2 === 0) {
    trailBuf[2 * trailHead] = tx; trailBuf[2 * trailHead + 1] = ty;
    trailHead = (trailHead + 1) % 64;
    if (trailLen < 64) trailLen++;
  }
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = pal.accent;
  for (let s = 0; s < trailLen - 1; s++) {
    const i0 = (trailHead - trailLen + s + 128) % 64;
    const i1 = (trailHead - trailLen + s + 1 + 128) % 64;
    ctx.globalAlpha = (s / trailLen) * 0.38 + 0.04;
    ctx.beginPath();
    ctx.moveTo(trailBuf[2 * i0], trailBuf[2 * i0 + 1]);
    ctx.lineTo(trailBuf[2 * i1], trailBuf[2 * i1 + 1]);
    ctx.stroke();
  }
  const pulse = 1 + 0.15 * Math.sin(now * 0.004);
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.arc(tx, ty, (inDisc ? 14 : 7) * pulse, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.arc(tx, ty, (inDisc ? 20 : 12) * pulse, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = pal.ink;
  ctx.font = '10px "IBM Plex Mono", monospace';
  const flip = tx > W - 200;
  ctx.textAlign = flip ? 'right' : 'left';
  ctx.fillText(inDisc ? `◎ our dot is in this disc — NT 2020` : `◎ ≈${UNIT} people — NT, 2020`,
    tx + (flip ? -16 : 16), ty - 12);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

/* GenAI-assisted (Claude): ambient layers are rebuilt once per settle —
   never per frame — then composited as cached offscreen bitmaps. */
function scheduleAmbient() {
  webLayer = contourLayer = null; webDel = null; webPts = null;
  clearTimeout(ambientTimer);
  if (!ambientOK()) return;
  const act = actCur;
  // deferred so the settle snap frame paints before the (one-off) build cost
  ambientTimer = setTimeout(() => { if (settled && actCur === act) buildAmbient(); }, 80);
}

function buildAmbient() {
  ambientT = performance.now();
  const ldpr = Math.min(DPR, 1.5);
  // 1 — Delaunay neural web: every dot threaded to its natural neighbours
  if (WEB_ACTS[actCur] != null) {
    const pts = new Float64Array(2 * N);
    for (let i = 0; i < N; i++) { pts[2 * i] = tgtX[i]; pts[2 * i + 1] = tgtY[i]; }
    webDel = new d3.Delaunay(pts);
    webPts = pts;
    const max = WEB_ACTS[actCur];
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * ldpr));
    c.height = Math.max(1, Math.round(H * ldpr));
    const g = c.getContext('2d');
    g.scale(ldpr, ldpr);
    g.strokeStyle = pal.inkSoft;
    g.lineWidth = 0.55;
    const { halfedges, triangles } = webDel;
    // two passes: faint long threads, slightly brighter short ones
    for (const [amax, alpha] of [[max, 0.045], [max * 0.55, 0.055]]) {
      const m2 = amax * amax;
      g.globalAlpha = alpha;
      g.beginPath();
      for (let e = 0; e < halfedges.length; e++) {
        if (halfedges[e] !== -1 && halfedges[e] < e) continue;   // dedupe twin edges
        const p = triangles[e], q = triangles[e % 3 === 2 ? e - 2 : e + 1];
        const dx = pts[2 * p] - pts[2 * q], dy = pts[2 * p + 1] - pts[2 * q + 1];
        if (dx * dx + dy * dy > m2) continue;
        g.moveTo(pts[2 * p], pts[2 * p + 1]);
        g.lineTo(pts[2 * q], pts[2 * q + 1]);
      }
      g.stroke();
    }
    webLayer = c;
  }
  // 2 — density topography (act 2): crash-density contour "elevation" lines
  if (actCur === 2) {
    const sample = [];
    for (let i = 0; i < N; i += 3) sample.push(i);
    const dens = d3.contourDensity()
      .x(i => tgtX[i]).y(i => tgtY[i])
      .size([W, H]).bandwidth(22).thresholds(9)(sample);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * ldpr));
    c.height = Math.max(1, Math.round(H * ldpr));
    const g = c.getContext('2d');
    g.scale(ldpr, ldpr);
    const path = d3.geoPath(null, g);
    dens.forEach((ct, k) => {
      g.globalAlpha = 0.05 + (k / dens.length) * 0.10;
      g.strokeStyle = pal.accent;
      g.lineWidth = 0.7;
      g.beginPath(); path(ct); g.stroke();
    });
    contourLayer = c;
  }
  wake();
}

function emitWave(x, y, amp) {
  if (!ambientOK()) return;
  if (waves.length > 3) waves.shift();
  waves.push({ x, y, t0: performance.now(), amp });
  wake();
}

/* near-cursor web relight: BFS the Delaunay neighbours around the pointer
   and redraw those edges live from displaced dot positions — the web
   stretches with the dots it connects */
function drawWebGlow() {
  const start = webDel.find(mouse.x, mouse.y);
  if (start == null || start < 0) return;
  const R2 = 90 * 90;
  const seen = new Set([start]);
  const queue = [start];
  ctx.strokeStyle = pal.accent2;
  ctx.lineWidth = 0.7;
  let drawn = 0;
  while (queue.length && seen.size < 240) {
    const i = queue.shift();
    for (const j of webDel.neighbors(i)) {
      const dx = webPts[2 * j] - mouse.x, dy = webPts[2 * j + 1] - mouse.y;
      if (dx * dx + dy * dy > R2) continue;
      if (!seen.has(j)) { seen.add(j); queue.push(j); }
      if (j < i) continue;                                  // dedupe i—j / j—i
      const mx = (posX[i] + posX[j]) / 2 - mouse.x, my = (posY[i] + posY[j]) / 2 - mouse.y;
      const md = Math.sqrt(mx * mx + my * my);
      if (md > 90) continue;
      ctx.globalAlpha = (1 - md / 90) * 0.4;
      ctx.beginPath();
      ctx.moveTo(posX[i], posY[i]);
      ctx.lineTo(posX[j], posY[j]);
      ctx.stroke();
      if (++drawn > 400) break;
    }
  }
  ctx.globalAlpha = 1;
}

function dimOffset(dim) { return dim === 'ru' ? COL_RU : dim === 'age' ? COL_AGE : COL_SEX; }

function wake() {
  if (!running) {
    running = true;
    timer = d3.timer(frame);
  }
}
function sleep() {
  if (running && timer) { timer.stop(); running = false; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });

/* ── §7 Act state machine & input ────────────────────────── */
const ACT_DEFS = [
  { label: '00 · the unit',       title: 'One dot' },
  { label: '01 · counts by year', title: 'The decade' },
  { label: '02 · geography',      title: 'Where the dots live' },
  { label: '03 · per 100,000',    title: 'The great inversion' },
  { label: '04 · composition',    title: 'Who gets hurt' },
  { label: '05 · road users',     title: 'Eleven years, one stream' },
];
let actCur = 0, activeDim = 'sex', focusYear = null, exploreMode = false;
let inAct3 = false;
let dataReady = false, totalCounted = false;
let actTimeouts = [];
function later(ms, fn) { actTimeouts.push(setTimeout(fn, RM ? 0 : ms)); }
function clearLater() { actTimeouts.forEach(clearTimeout); actTimeouts = []; }

function canNavigate() {
  return dataReady && performance.now() > morphEnd + 250;
}

function goToAct(a, viaCinema = false) {
  if (!dataReady) return;
  a = Math.max(0, Math.min(5, a));
  if (a === actCur && settled) return;
  clearLater();
  if (!totalCounted && totalCases) { totalCounted = true; countUpTotal(); }
  hideTip();
  const hadPanel = panelOpen;
  closePanel(true);
  hideEndCard();
  exitHeld();
  setGhostMode(false);
  lensSet = null;
  spotlight = null;
  const prev = actCur;
  actCur = a;
  inAct3 = (a === 3);
  document.getElementById('scroll-hint').classList.add('is-gone');

  if (prev === 3 && a !== 3) { discLeaveT = performance.now(); }

  const opts = [
    { stagger: 'none',  bow: 0.07 },
    { stagger: 'year',  bow: 0.07 },
    { stagger: 'state', bow: 0.18, spread: 700 },
    { stagger: 'state', bow: 0.10, fade: 'merge' },
    { stagger: 'cat',   bow: 0.08, fade: prev === 3 ? 'burst' : null },
    { stagger: 'ru',    bow: 0.06, fade: prev === 3 ? 'burst' : null },
  ][a];

  // leaving the merged state: dots restart from their disc with a radial burst
  if (prev === 3 && a !== 3) {
    for (const d of discs) {
      const c = cohorts[d.ci];
      for (let i = c.start; i < c.start + c.n; i++) {
        const ang = hash01(i, 9) * TAU, rr = hash01(i, 10) * d.r;
        posX[i] = d.x + Math.cos(ang) * rr;
        posY[i] = d.y + Math.sin(ang) * rr;
      }
    }
    if (!opts.fade) opts.fade = 'burst';
  }
  // a panel was open: discs/scales were built for the narrow plot — rebuild
  // for full width (burst origins above already consumed the old positions)
  if (hadPanel) { buildDiscs(); syncDiscTweens(); }

  if (a === 4) layouts[4] = layoutStacks(activeDim);
  retarget(layouts[a], opts);

  // chrome
  updateRail();
  updateModeBadge(a);
  updateCaption(a);
  buildLegend(a);
  document.getElementById('dim-bar').hidden = a !== 4;
  // Sync chip highlight to activeDim every time Act 4 is entered
  if (a === 4) {
    document.querySelectorAll('.p-chip').forEach(b =>
      b.classList.toggle('is-active', b.dataset.dim === activeDim));
  }

  // Update caption position class — acts 2 move to right to avoid blocking view
  // BUT: only apply if user hasn't manually positioned it (no inline left/top set)
  const captionEl = document.getElementById('caption-card');
  if (captionEl) {
    ['act-0', 'act-1', 'act-2', 'act-3', 'act-4', 'act-5'].forEach(cls => captionEl.classList.remove(cls));
    // Only reset position if the user hasn't manually dragged it
    const hasManualPos = captionEl.style.left !== '' || captionEl.style.top !== '';
    if (!hasManualPos && a !== 5) {
      captionEl.classList.add(`act-${a}`);
    }
  }
  if (a !== 3) focusYear = null;
  buildActSvg(a);
  updateCounters(a);

  if (a === 5 && !exploreMode && !viaCinema) {
    later(Math.max(0, morphEnd - performance.now()) + 2400, showEndCard);
  }
}

function updateRail() {
  d3.selectAll('.rail-node').classed('is-active', (d, i) => i === actCur);
}
function updateModeBadge(a) {
  const el = document.getElementById('chip-mode');
  const show = a === 2 || a === 3 || exploreMode;
  el.hidden = !show;
  if (show) {
    const txt = a === 3 ? 'PER 100K' : 'COUNTS';
    if (el.textContent !== txt) {
      el.textContent = txt;
      el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
    }
  }
}

/* Wheel / touch / keys */
let wheelAcc = 0, wheelLast = 0;
stageEl.addEventListener('wheel', (e) => {
  e.preventDefault();
  cinemaPause();
  const now = performance.now();
  if (now - wheelLast > 400) wheelAcc = 0;
  wheelLast = now;
  if (!canNavigate()) return;
  wheelAcc += e.deltaY;
  if (Math.abs(wheelAcc) > 160) {
    goToAct(actCur + (wheelAcc > 0 ? 1 : -1));
    wheelAcc = 0;
  }
}, { passive: false });

let touchY = null;
stageEl.addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; cinemaPause(); }, { passive: true });
stageEl.addEventListener('touchend', (e) => {
  if (touchY == null) return;
  const dy = touchY - e.changedTouches[0].clientY;
  touchY = null;
  if (Math.abs(dy) >= 60 && canNavigate()) goToAct(actCur + (dy > 0 ? 1 : -1));
}, { passive: true });

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!document.getElementById('methods-pop').hidden) return toggleMethods(false);
    if (panelOpen) return closePanel();
    if (!document.getElementById('end-scrim').hidden) return hideEndCard();
    return;
  }
  cinemaPause();
  if (/^[1-6]$/.test(e.key)) { if (canNavigate()) goToAct(+e.key - 1); return; }
  if (actCur === 3 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    const yi = focusYear == null ? YEARS.length - 1 : YEARS.indexOf(focusYear);
    const ni = Math.max(0, Math.min(YEARS.length - 1, yi + (e.key === 'ArrowRight' ? 1 : -1)));
    setFocusYear(YEARS[ni]);
    e.preventDefault();
    return;
  }
  const nav = { ArrowDown: 1, PageDown: 1, ' ': 1, ArrowUp: -1, PageUp: -1 }[e.key];
  if (nav && canNavigate()) { goToAct(actCur + nav); e.preventDefault(); }
  else if (e.key === 'Home' && canNavigate()) goToAct(0);
  else if (e.key === 'End' && canNavigate()) goToAct(5);
});

/* ── §8 SVG annotation builders ──────────────────────────── */
let gActs = [];
function initSvgGroups() {
  svg.selectAll('*').remove();
  gActs = d3.range(6).map(i => svg.append('g').attr('class', `g-act${i}`).style('opacity', 0));
}

function buildActSvg(a) {
  gActs.forEach((g, i) => {
    g.interrupt().transition().duration(RM ? 0 : 450).style('opacity', i === a ? 1 : 0);
    if (i !== a) g.selectAll('.hit').style('pointer-events', 'none');
  });
  const g = gActs[a];
  g.selectAll('*').remove();
  // giant editorial numeral watermarked behind each scene
  g.append('text').attr('class', 'act-ghost-num')
    .attr('x', W - 28).attr('y', (plot.y0 + plot.y1) / 2 + 90)
    .attr('text-anchor', 'end')
    .text(String(a).padStart(2, '0'));
  if (a === 1) buildSvg1(g);
  if (a === 2) buildSvg2(g);
  if (a === 3) buildSvg3(g);
  if (a === 4) buildSvg4(g);
  if (a === 5) buildSvg5(g);
}

function buildSvg1(g) {
  const xs = layouts._colXs;
  YEARS.forEach(y => {
    g.append('text').attr('class', 'axis-tick')
      .attr('x', xs(y)).attr('y', plot.y1 + 18).attr('text-anchor', 'middle')
      .text(y);
  });
  const pct = (trend.at(-1).cases - trend[0].cases) / trend[0].cases * 100;
  const peak = layouts[1];
  // height of the 2021 column ≈ its dot count / 12 rows
  const c21 = cohorts.filter(c => c.yi === YEARS.length - 1);
  const dots21 = d3.sum(c21, c => c.n);
  const topY = plot.y1 - Math.ceil(dots21 / 12) * Math.min(5, (plot.y1 - plot.y0) * 0.62 / Math.ceil(dots21 / 12));
  const x21 = xs(YEARS.at(-1));
  g.append('path').attr('class', 'leader')
    .attr('d', `M${x21 + 26},${topY - 6} L${x21 + 46},${topY - 30} H${x21 + 54}`);
  const note = g.append('text').attr('class', 'anno-note')
    .attr('x', x21 + 58).attr('y', topY - 27);
  note.append('tspan').attr('class', 'em').text(`+${f1(pct)}%`);
  note.append('tspan').text(' since 2011');
  if (x21 + 170 > W) note.attr('text-anchor', 'end').attr('x', x21 - 30)
    .select(function () { return this; });
}

function buildSvg2(g) {
  const { path, clusters } = geoMeta;
  const outlines = g.selectAll('.geo-outline').data(geo.features).join('path')
    .attr('class', 'geo-outline').attr('d', path);
  if (RM) outlines.style('opacity', 0.25);
  else outlines.transition().delay((d, i) => 500 + i * 110).duration(700).style('opacity', 0.25);
  const act = clusters[STATES.indexOf('ACT')];
  g.append('path').attr('class', 'leader')
    .attr('d', `M${act.trueC[0]},${act.trueC[1]} L${act.cx - act.R - 4},${act.cy - act.R - 4}`)
    .style('opacity', 0.5);
  clusters.forEach(c => {
    g.append('text').attr('class', 'axis-tick')
      .attr('x', c.cx).attr('y', c.cy + c.R + 14).attr('text-anchor', 'middle')
      .style('fill', c.si === NT_IDX ? pal.accent : null)
      .text(c.s);
  });
}

function buildSvg3(g) {
  // y axis
  const axis = g.append('g');
  const ticks = yRate.ticks(6);
  ticks.forEach(t => {
    axis.append('line').attr('class', 'grid-line')
      .attr('x1', plot.x0 - 6).attr('x2', plot.x1).attr('y1', yRate(t)).attr('y2', yRate(t));
    axis.append('text').attr('class', 'axis-tick')
      .attr('x', plot.x0 - 12).attr('y', yRate(t) + 3).attr('text-anchor', 'end').text(t);
  });
  // axis label cross-fade: 'cases' -> 'per 100,000 residents' (the lesson)
  const lblY = plot.y0 - 14;
  const l1 = axis.append('text').attr('class', 'axis-label')
    .attr('x', plot.x0 - 6).attr('y', lblY).text('hospitalisations — counts');
  const l2 = axis.append('text').attr('class', 'axis-label')
    .attr('x', plot.x0 - 6).attr('y', lblY).style('opacity', 0)
    .text('hospitalisations per 100,000 residents');
  if (!RM) {
    l1.transition().delay(900).duration(600).style('opacity', 0);
    l2.transition().delay(900).duration(600).style('opacity', 1);
  } else { l1.style('opacity', 0); l2.style('opacity', 1); }
  // x labels (seeded from focusYear so rebuilds don't wipe the highlight)
  YEARS.forEach(y => {
    g.append('text').attr('class', 'axis-tick xlab').attr('data-year', y)
      .attr('x', xYears(y)).attr('y', plot.y1 + 18).attr('text-anchor', 'middle')
      .style('fill', y === focusYear ? pal.accent : null)
      .text(y);
  });
  // national average line (population-weighted, matching the map page)
  const avgLine = d3.line().x(y => xYears(y)).y(y => yRate(natlRate.get(y)))(YEARS);
  const p = g.append('path').attr('class', 'natl-line').attr('d', avgLine);
  const len = p.node().getTotalLength();
  if (!RM) p.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len)
    .transition().delay(700).duration(1200).attr('stroke-dashoffset', 0)
    .on('end', function () { d3.select(this).attr('stroke-dasharray', '5 4').attr('stroke-dashoffset', null); });
  g.append('text').attr('class', 'axis-tick')
    .attr('x', xYears(YEARS.at(-1)) + 30).attr('y', yRate(natlRate.get(YEARS.at(-1))) + 3)
    .text('natl avg');
  // NT polyline over its discs
  const ntDiscs = discs.filter(d => d.si === NT_IDX).sort((a, b) => a.yi - b.yi);
  const ntPath = d3.line().x(d => d.tx).y(d => d.ty)(ntDiscs);
  const np = g.append('path').attr('class', 'nt-line').attr('d', ntPath);
  if (!RM) {
    const nlen = np.node().getTotalLength();
    np.attr('stroke-dasharray', `${nlen} ${nlen}`).attr('stroke-dashoffset', nlen)
      .transition().delay(1300).duration(1100).attr('stroke-dashoffset', 0);
  }
  // leader on the peak-multiple year
  const peakY = YEARS.reduce((b, y) => ntMult.get(y) > ntMult.get(b) ? y : b, YEARS[0]);
  const pk = ntDiscs.find(d => d.year === peakY);
  const txAnchor = pk.tx > W * 0.6 ? 'end' : 'start';
  const off = txAnchor === 'end' ? -1 : 1;
  g.append('path').attr('class', 'leader')
    .attr('d', `M${pk.tx + off * (pk.r + 4)},${pk.ty - 8} L${pk.tx + off * (pk.r + 26)},${pk.ty - 34}`);
  const nt = g.append('text').attr('class', 'anno-note')
    .attr('x', pk.tx + off * (pk.r + 30)).attr('y', pk.ty - 38).attr('text-anchor', txAnchor);
  nt.append('tspan').attr('class', 'em')
    .text(`NT ${peakY} — ${f1(rate$.get(`NT|${peakY}`).rate)} per 100k`);
  nt.append('tspan').attr('x', pk.tx + off * (pk.r + 30)).attr('dy', 14)
    .text(`${f2(ntMult.get(peakY))}× the national average`);
  // focused-year readout + scrub hit band
  g.append('text').attr('class', 'yr-focus').attr('id', 'yr-focus')
    .attr('x', plot.x1 - 4).attr('y', plot.y0 + 6).attr('text-anchor', 'end')
    .text(focusYear == null ? '' : focusYear);
  g.append('rect').attr('class', 'hit')
    .attr('x', plot.x0).attr('y', plot.y1).attr('width', plot.x1 - plot.x0).attr('height', 30)
    .attr('fill', 'transparent')
    .call(d3.drag()
      .on('start drag', (e) => { scrubToX(e.x); }))
    .on('click', (e) => { scrubToX(d3.pointer(e, svg.node())[0]); });
}

function buildSvg4(g) {
  g.append('text').attr('class', 'banner')
    .attr('x', (plot.x0 + plot.x1) / 2).attr('y', plot.y0 + 4).attr('text-anchor', 'middle')
    .text(`share of each group's hospitalisations · 2011–2021 · by ${DIM_NAME[activeDim]}`);
  const cats = DIMS[activeDim];
  stackMeta.sides.forEach((side, sIdx) => {
    const left = sIdx === 0;
    g.append('text').attr('class', 'anno-note')
      .attr('x', side.x).attr('y', stackMeta.sides[0].bands[0].y0 - 16).attr('text-anchor', 'middle')
      .style('font-weight', 700)
      .style('fill', left ? pal.accent : null)
      .text(left ? `NT — ${fc(stateTotals.get('NT'))} cases` : `Rest of Australia — ${fc(totalCases - stateTotals.get('NT'))} cases`);
    side.bands.forEach((b, k) => {
      if (b.pct <= 0) return;   // hairline box still drawn for tiny nonzero bands
      g.append('rect').attr('class', 'band-box')
        .attr('x', side.x - side.w / 2 - 8).attr('y', b.y0)
        .attr('width', side.w + 16).attr('height', Math.max(1, b.y1 - b.y0));
      const lx = left ? side.x - side.w / 2 - 16 : side.x + side.w / 2 + 16;
      const anchor = left ? 'end' : 'start';
      const ly = Math.max((b.y0 + b.y1) / 2, b.y0 + 8);
      if (b.y1 - b.y0 > 13 || b.pct > 2) {
        g.append('text').attr('class', 'band-pct').attr('x', lx).attr('y', ly)
          .attr('text-anchor', anchor).text(`${f1(b.pct)}%`);
        g.append('text').attr('class', 'band-label').attr('x', lx).attr('y', ly + 12)
          .attr('text-anchor', anchor).text(b.cat);
      }
    });
  });
  // largest divergence call-out between the two compositions
  const div = stackMeta.divergence;
  const mid = g.append('text').attr('class', 'anno-note')
    .attr('x', (plot.x0 + plot.x1) / 2).attr('y', plot.y1 + 16).attr('text-anchor', 'middle');
  mid.append('tspan').attr('class', 'em').text(div.cat);
  mid.append('tspan').text(`: ${f1(div.a)}% of the NT's burden vs ${f1(div.b)}% elsewhere`);
}

function buildSvg5(g) {
  const { series, xs, ys, keys } = streamMeta;
  const area = d3.area()
    .x(d => xs(d.data.year)).y0(d => ys(d[0])).y1(d => ys(d[1]));
  series.forEach((s, i) => {
    const ci = COL_RU + RU_CATS.indexOf(s.key);
    const p = g.append('path').attr('class', 'stream-edge')
      .attr('d', area(s)).attr('stroke', pal.colors[ci]).attr('stroke-width', 1);
    if (!RM) {
      const len = p.node().getTotalLength();
      p.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len)
        .transition().delay(800 + i * 120).duration(1400).attr('stroke-dashoffset', 0);
    }
    const last = s.at(-1);
    g.append('text').attr('class', 'band-label')
      .attr('x', xs(YEARS.at(-1)) + 14).attr('y', ys((last[0] + last[1]) / 2) + 3)
      .style('fill', pal.colors[ci])
      .text(s.key);
  });
  YEARS.forEach(y => {
    g.append('text').attr('class', 'axis-tick')
      .attr('x', xs(y)).attr('y', plot.y1 + 4).attr('text-anchor', 'middle').text(y);
  });
}

/* Act-3 year scrub */
function scrubToX(px) {
  let best = YEARS[0], bd = Infinity;
  YEARS.forEach(y => { const d = Math.abs(xYears(y) - px); if (d < bd) { bd = d; best = y; } });
  setFocusYear(best);
}
function setFocusYear(y) {
  focusYear = y;
  d3.select('#yr-focus').text(y == null ? '' : y);
  gActs[3].selectAll('.xlab').style('fill', function () {
    return +this.dataset.year === y ? pal.accent : null;
  });
  updateCaption(3);
  setMinutes(y);
  wake();
}

/* ── §9 Chrome: captions, counters, panels, minimap, tips ── */
function em(t) { return `<span class="em">${t}</span>`; }

function updateCaption(a) {
  const tEl = document.getElementById('cap-title');
  const bEl = document.getElementById('cap-body');
  tEl.textContent = ACT_DEFS[a].title;
  let html = '';
  if (a === 0) {
    html = `Each dot is about ${em(UNIT + ' people')} hospitalised after a road crash. All together: ${em(fc(totalCases))} Australians, 2011–2021.`;
  } else if (a === 1) {
    const pct = (trend.at(-1).cases - trend[0].cases) / trend[0].cases * 100;
    html = `National hospitalisations rose ${em('+' + f1(pct) + '%')} over the decade — by 2021, one person every ${em(f1(minutes.get(YEARS.at(-1))) + ' minutes')}. NT cases ride the crest of every column.`;
  } else if (a === 2) {
    const nswPct = stateTotals.get('NSW') / totalCases * 100;
    const ntPct = stateTotals.get('NT') / totalCases * 100;
    html = `Raw counts follow population: NSW holds ${em(f1(nswPct) + '%')} of all hospitalisations, the NT just ${em(f1(ntPct) + '%')}. Counts can't tell you where the risk is.`;
  } else if (a === 3) {
    if (focusYear != null) {
      const r = rate$.get(`NT|${focusYear}`).rate;
      html = `In ${em(focusYear)}, the NT recorded ${em(f1(r) + ' per 100,000')} — ${em(f2(ntMult.get(focusYear)) + '×')} the national average of ${f1(natlRate.get(focusYear))}. Drag the axis to change year.`;
    } else {
      const peakY = YEARS.reduce((b, y) => ntMult.get(y) > ntMult.get(b) ? y : b, YEARS[0]);
      const lo = d3.min(YEARS, y => ntMult.get(y)), hi = d3.max(YEARS, y => ntMult.get(y));
      html = `Divide by population and the picture inverts: the NT runs ${em(f2(lo) + '–' + f2(hi) + '×')} the national rate — above average ${em('all 11 years')}, peaking in ${peakY}. Drag the year axis, or click a disc.`;
    }
  } else if (a === 4) {
    const d = stackMeta.divergence;
    tEl.textContent = `Who gets hurt · by ${DIM_NAME[activeDim]}`;
    html = `Each column is one state — colours show how ${em(DIM_NAME[activeDim])} splits the hospitalisations within it.`
      + (d ? ` Biggest NT gap: ${em(d.cat)} makes up ${em(f1(d.a) + '%')} of NT cases vs ${em(f1(d.b) + '%')} nationally.` : '')
      + (ghostMode ? `<span class="ghost-note">◌ At the national rate, ≈${em(fc(Math.round(ntExcess)))} of the NT's ${fc(stateTotals.get('NT'))} hospitalisations — its hollow dots — would never have happened.</span>` : '');
  } else if (a === 5) {
    const sums = RU_CATS.map(c => [c, d3.sum(STATES, s => d3.sum(YEARS, y => catCases('ru', s, y, c)))]);
    sums.sort((x, y) => y[1] - x[1]);
    html = `The national burden by road user. ${em(sums[0][0] + 's')} are the largest group — ${em(f1(sums[0][1] / totalCases * 100) + '%')} of the decade — with ${sums[1][0].toLowerCase()}s second at ${f1(sums[1][1] / totalCases * 100)}%.`;
  }
  if (trackOn) html += `<span class="track-note">◎ following one dot — ≈${UNIT} people, NT 2020 — ringed on the canvas.</span>`;
  bEl.innerHTML = html;
}

/* Per-scene colour legend — what the dot colours encode this act.
   Scenes 0–3 colour by state; 4 by the active partition; 5 by road user.
   Each swatch is clickable to spotlight that group (dims all others). */
function buildLegend(a) {
  const wrap = document.getElementById('cap-legend');
  if (!wrap) return;
  let groups, key;
  if (a <= 3) {
    groups = STATES.map((s, si) => ({ idx: si, label: s, color: pal.colors[si], nt: si === NT_IDX }));
    key = 'state';
  } else if (a === 4) {
    const cats = DIMS[activeDim], off = dimOffset(activeDim);
    groups = cats.map((c, k) => ({ idx: k, label: c, color: pal.colors[off + k] }));
    key = DIM_NAME[activeDim];
  } else {
    groups = RU_CATS.map((c, k) => ({ idx: k, label: c, color: pal.colors[COL_RU + k] }));
    key = 'road user';
  }
  wrap.innerHTML =
    `<span class="legend-cap">coloured by ${key} · click to spotlight</span>` +
    groups.map(g =>
      `<button class="legend-item${g.nt ? ' is-nt' : ''}${spotlight === g.idx ? ' is-spot' : ''}" ` +
      `data-grp="${g.idx}" type="button">` +
      `<span class="legend-sw" style="background:${g.color}"></span>${g.label}</button>`
    ).join('');
}

document.getElementById('cap-legend').addEventListener('click', (e) => {
  const btn = e.target.closest('.legend-item');
  if (!btn) return;
  const g = +btn.dataset.grp;
  spotlight = spotlight === g ? null : g;
  document.querySelectorAll('#cap-legend .legend-item').forEach(b =>
    b.classList.toggle('is-spot', spotlight != null && +b.dataset.grp === spotlight));
  wake();
});

document.getElementById('cap-collapse').addEventListener('click', () => {
  const card = document.getElementById('caption-card');
  const collapsed = card.classList.toggle('is-collapsed');
  document.getElementById('cap-collapse').textContent = collapsed ? '+' : '–';
});

/* Caption card drag & resize — user can move/size it anywhere */
function resetCaptionPosition() {
  const card = document.getElementById('caption-card');
  if (!card) return;
  captionPos = { left: null, right: null, bottom: null, top: null, width: null, height: null };
  card.style.left = '';
  card.style.right = '';
  card.style.bottom = '';
  card.style.top = '';
  card.style.width = '';
  card.style.height = '';
  card.classList.remove('is-dragging', 'is-resizing');
}

const captionCard = document.getElementById('caption-card');
const captionTitle = document.getElementById('cap-title');
captionTitle.addEventListener('mousedown', (e) => {
  if (captionDragging) return;
  captionDragging = true;
  const rect = captionCard.getBoundingClientRect();
  dragStart = { x: e.clientX, y: e.clientY, captionX: rect.left, captionY: rect.top };
  // Remove act classes so their bottom/left CSS rules can't fight inline top/left
  ['act-0','act-1','act-2','act-3','act-4','act-5'].forEach(c => captionCard.classList.remove(c));
  // Explicitly override bottom/right to 'auto' — clearing '' would just restore the class values
  captionCard.style.bottom = 'auto';
  captionCard.style.right = 'auto';
  captionCard.style.left = rect.left - stageEl.getBoundingClientRect().left + 'px';
  captionCard.style.top  = rect.top  - stageEl.getBoundingClientRect().top  + 'px';
  captionCard.classList.add('is-dragging');
  e.preventDefault();
  e.stopPropagation();
});


document.addEventListener('mousemove', (e) => {
  if (!captionDragging) return;
  const stageRect = stageEl.getBoundingClientRect();
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  const newLeft = Math.max(0, Math.min(stageRect.width - 100, dragStart.captionX - stageRect.left + dx));
  const newTop  = Math.max(0, Math.min(stageRect.height - 40, dragStart.captionY - stageRect.top  + dy));
  captionCard.style.left = newLeft + 'px';
  captionCard.style.top  = newTop  + 'px';
  captionPos.left = newLeft;
  captionPos.top  = newTop;
});

document.addEventListener('mouseup', () => {
  if (captionDragging) {
    captionDragging = false;
    captionCard.classList.remove('is-dragging');
  }
});

let countUpTimer = null;
function updateCounters(a) {
  const mEl = document.getElementById('hdr-minutes');
  if (a === 0) setMinutes(null);
  else if (a === 1 && !RM) tweenMinutes(YEARS[0], YEARS.at(-1));
  else if (a !== 3) setMinutes(YEARS.at(-1));
  mEl.classList.toggle('is-hidden', false);
}
function setTotal(v) { document.getElementById('hdr-total').textContent = `${fc(Math.round(v))} hospitalisations`; }
function setMinutes(y) {
  const el = document.getElementById('hdr-minutes');
  if (y == null) {
    const avg = 525600 / (totalCases / YEARS.length);
    el.textContent = `· one every ${f1(avg)} min (decade avg)`;
  } else {
    el.textContent = `· one every ${f1(minutes.get(y))} min (${y})`;
  }
}
function tweenMinutes(yA, yB) {
  const a = minutes.get(yA), b = minutes.get(yB);
  const el = document.getElementById('hdr-minutes');
  const t0 = performance.now();
  const tm = d3.timer(() => {
    const p = Math.min(1, (performance.now() - t0) / 1200);
    const v = a + (b - a) * ease3(p);
    el.textContent = `· one every ${f1(v)} min (${p < 1 ? '…' : yB})`;
    if (p >= 1) tm.stop();
  });
}
function countUpTotal() {
  if (RM) { setTotal(totalCases); return; }
  const t0 = performance.now();
  const tm = d3.timer(() => {
    const p = Math.min(1, (performance.now() - t0) / 2400);
    setTotal(totalCases * ease3(p));
    if (p >= 1) tm.stop();
  });
}

/* Detail panel (state unroll) */
const dpEl = document.getElementById('detail-panel');
let dpState = null;
function openPanel(si) {
  dpState = si;
  const s = STATES[si];
  panelOpen = true;
  computePlot();
  buildDiscs();             // re-dodge into the narrower plot
  syncDiscTweens();
  buildActSvg(3);
  const rates = YEARS.map(y => rate$.get(`${s}|${y}`));
  const lo = d3.min(rates, d => d.rate), hi = d3.max(rates, d => d.rate);
  const head = document.getElementById('dp-head');
  let extra = '';
  if (si === NT_IDX) {
    const mLo = d3.min(YEARS, y => ntMult.get(y)), mHi = d3.max(YEARS, y => ntMult.get(y));
    extra = `<p class="dp-nt">${f2(mLo)}–${f2(mHi)}× national · above average all 11 years</p>`;
  }
  head.innerHTML = `<h3>${geo.features.find(f => f.properties.code === s).properties.name}</h3>
    <p class="dp-sub">${fc(stateTotals.get(s))} hospitalisations 2011–2021<br>rate ${f1(lo)}–${f1(hi)} per 100,000</p>${extra}`;
  const maxR = d3.max([...rate$.values()], d => d.rate);
  const rows = document.getElementById('dp-rows');
  rows.innerHTML = YEARS.map(y => {
    const d = rate$.get(`${s}|${y}`);
    const natl = natlRate.get(y);
    return `<div class="dp-row">
      <div class="dp-row-label"><span>${y}</span><b>${f1(d.rate)} /100k · ${fc(d.cases)} cases</b></div>
      <div class="dp-bar-track">
        <div class="dp-bar ${si === NT_IDX ? 'is-nt' : ''}" data-w="${d.rate / maxR * 100}"></div>
        <div class="dp-natl" style="left:${natl / maxR * 100}%"></div>
      </div>
    </div>`;
  }).join('');
  dpEl.hidden = false;
  requestAnimationFrame(() => {
    dpEl.classList.add('is-open');
    rows.querySelectorAll('.dp-bar').forEach((b, i) => {
      setTimeout(() => { b.style.width = b.dataset.w + '%'; }, RM ? 0 : 60 + i * 40);
    });
  });
}
function closePanel(silent) {
  if (!panelOpen) return;
  panelOpen = false;
  dpState = null;
  dpEl.classList.remove('is-open');
  setTimeout(() => { dpEl.hidden = true; }, RM ? 0 : 360);
  computePlot();
  if (!silent && actCur === 3) {
    buildDiscs();
    syncDiscTweens();
    buildActSvg(3);
  }
}
function syncDiscTweens() {
  // buildDiscs rebuilt the array — restore current positions as tween sources
  retargetDiscs(360);
}
document.getElementById('dp-close').addEventListener('click', () => closePanel());

/* Minimap (explore) */
function buildMinimap() {
  const mm = d3.select('#mm-svg');
  mm.selectAll('*').remove();
  const cw = 17, ch = 12, lx = 30, ty = 4;
  mm.attr('width', lx + cw * YEARS.length + 4).attr('height', ty + ch * STATES.length + 16);
  const maxRate = d3.max([...rate$.values()], d => d.rate);
  const col = d3.scaleSequential(d3.interpolateRgb(pal.surface2, pal.accent)).domain([0, maxRate]);
  STATES.forEach((s, si) => {
    mm.append('text').attr('x', lx - 5).attr('y', ty + si * ch + ch / 2 + 3)
      .attr('text-anchor', 'end').text(s);
    YEARS.forEach((y, yi) => {
      const d = rate$.get(`${s}|${y}`);
      mm.append('rect').attr('class', 'mm-cell')
        .attr('x', lx + yi * cw).attr('y', ty + si * ch)
        .attr('width', cw - 1).attr('height', ch - 1)
        .attr('fill', col(d.rate))
        .on('mousemove', (e) =>

          showTip(e, `<b>${s} · ${y}</b><br>${f1(d.rate)} per 100k<br><span class="tip-k">${fc(d.cases)} cases</span>`))
        .on('mouseleave', hideTip)
        .on('click', () => {
          hideTip();
          if (canNavigate()) {
            goToAct(3);
            later(Math.max(0, morphEnd - performance.now()) + 60, () => {
              setFocusYear(y);
              openPanel(si);
            });
          }
        });
    });
  });
  YEARS.forEach((y, yi) => {
    if (yi % 5 === 0 || yi === YEARS.length - 1)
      mm.append('text').attr('x', lx + yi * cw + cw / 2).attr('y', ty + STATES.length * ch + 11)
        .attr('text-anchor', 'middle').text(`'${String(y).slice(2)}`);
  });
}

/* Tooltip */
function showTip(e, html) {
  tipEl.innerHTML = html;
  tipEl.hidden = false;
  const r = tipEl.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 14;
  tipEl.style.left = x + 'px';
  tipEl.style.top = y + 'px';
}
function hideTip() { tipEl.hidden = true; }

canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  if (!settled) { hideTip(); return; }
  if (actCur === 3) {
    let hit = null;
    for (const d of discs) {
      if (Math.hypot(d.x - mouse.x, d.y - mouse.y) <= d.r + 2) { hit = d; break; }
    }
    canvas.style.cursor = hit ? 'pointer' : '';
    if (hit) {
      const dd = rate$.get(`${hit.state}|${hit.year}`);
      showTip(e, `<b>${hit.state} · ${hit.year}</b><br>${f1(dd.rate)} per 100k · ${fc(dd.cases)} cases<br><span class="tip-hl">${f2(dd.rate / natlRate.get(hit.year))}× national</span>`);
    } else hideTip();
    return;
  }
  if (!quad) return;
  // explore hover-lens: collect neighbours within 56px
  if (exploreMode) {
    const set = new Set();
    quad.visit((node, x0, y0, x1, y1) => {
      if (x0 > mouse.x + 56 || x1 < mouse.x - 56 || y0 > mouse.y + 56 || y1 < mouse.y - 56) return true;
      if (!node.length) {
        let n = node;
        do {
          const i = n.data;
          if (Math.hypot(posX[i] - mouse.x, posY[i] - mouse.y) <= 56 && set.size < 300) set.add(i);
        } while ((n = n.next));
      }
      return false;
    });
    lensSet = null;  // lens effect disabled
    wake();
  }
  const i = quad.find(mouse.x, mouse.y, 14);
  canvas.style.cursor = i == null ? '' : 'crosshair';   // signal dots are inspectable
  if (i == null) { hideTip(); return; }
  const c = cohorts[dotCohort[i]];
  let extra = '';
  if (actCur === 4) extra = `<br><span class="tip-k">${DIMS[activeDim][labels[activeDim][i]]}</span>`;
  if (actCur === 5) extra = `<br><span class="tip-k">${RU_CATS[labels.ru[i]]}</span>`;
  if (actCur === 1) extra = `<br><span class="tip-k">${fc(trend.find(t => t.year === c.year).cases)} national cases in ${c.year}</span>`;
  showTip(e, `<b>≈ ${UNIT} people</b> — ${c.state}, ${c.year}${extra}`);
});
canvas.addEventListener('mouseleave', () => { hideTip(); lensSet = null; canvas.style.cursor = ''; mouse.x = mouse.y = -1e4; });
canvas.addEventListener('click', (e) => {
  cinemaPause();
  const r = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  if (actCur !== 3) {
    if (settled) emitWave(mx, my, 16);    // tap the swarm — it ripples
    return;
  }
  if (!settled) return;
  for (const d of discs) {
    if (Math.hypot(d.x - mx, d.y - my) <= d.r + 2) { openPanel(d.si); return; }
  }
  if (panelOpen) closePanel();
});

/* Partition chips */
document.querySelectorAll('.p-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.dim === activeDim) return;
    activeDim = btn.dataset.dim;
    document.querySelectorAll('.p-chip').forEach(b => b.classList.toggle('is-active', b === btn));
    spotlight = null;
    layouts[4] = layoutStacks(activeDim);
    retarget(layouts[4], { stagger: 'none', bow: 0 });
    buildActSvg(4);
    updateCaption(4);
    buildLegend(4);
  });
});

/* End card */
function showEndCard() {
  const peakY = YEARS.reduce((b, y) => ntMult.get(y) > ntMult.get(b) ? y : b, YEARS[0]);
  const lo = d3.min(YEARS, y => ntMult.get(y)), hi = d3.max(YEARS, y => ntMult.get(y));
  const pct = (trend.at(-1).cases - trend[0].cases) / trend[0].cases * 100;
  document.getElementById('end-headline').innerHTML =
    `One territory drives <span class="hl">on a different road</span>.`;
  // GenAI-assisted (Claude): "while you've been here" — binds the data's pace
  // to the reader's own elapsed session
  const elapsed = (Date.now() - pageLoadT) / 60000;
  const pace = minutes.get(YEARS.at(-1));
  const est = elapsed / pace;
  const live = est >= 1
    ? `In the <b>${f1(elapsed)} minutes</b> you've had this page open: roughly <b>${Math.round(est)}</b> more ${Math.round(est) === 1 ? 'Australian was' : 'Australians were'} hospitalised`
    : `You've had this page open <b>${f1(elapsed)} minutes</b> — at the 2021 pace, the next hospitalisation arrives in about <b>${f1(Math.max(0.1, pace - elapsed))} minutes</b>`;
  document.getElementById('end-stats').innerHTML = `
    <li><b>${fc(totalCases)}</b> hospitalised road-crash injuries, 2011–2021</li>
    <li><b>+${f1(pct)}%</b> over the decade — one every <b>${f1(minutes.get(YEARS.at(-1)))} minutes</b> by 2021</li>
    <li>The NT ran <span class="em">${f2(lo)}–${f2(hi)}×</span> the national rate — above average <b>all 11 years</b>, peaking in ${peakY}</li>
    <li class="end-live">${live}</li>`;
  const sc = document.getElementById('end-scrim');
  sc.hidden = false;
  requestAnimationFrame(() => sc.classList.add('is-on'));
}
function hideEndCard() {
  const sc = document.getElementById('end-scrim');
  if (sc.hidden) return;
  sc.classList.remove('is-on');
  setTimeout(() => { sc.hidden = true; }, RM ? 0 : 450);
}
document.getElementById('end-explore').addEventListener('click', () => {
  hideEndCard();
  unlockExplore();
});
document.getElementById('end-replay').addEventListener('click', () => {
  hideEndCard();
  goToAct(0);
  later(800, cinemaPlay);
});
document.getElementById('end-scrim').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) hideEndCard();
});

/* Explore mode */
function toggleExplore() {
  exploreMode = !exploreMode;
  const mm = document.getElementById('minimap');
  const btn = document.getElementById('rail-skip');
  if (exploreMode) {
    buildMinimap();
    mm.hidden = false;
    btn.textContent = '← back to tour';
  } else {
    mm.hidden = true;
    btn.textContent = 'skip to explore →';
  }
}
document.getElementById('rail-skip').addEventListener('click', toggleExplore);

/* Counterfactual ghost mode (act 4) */
let ghostMode = false;
function setGhostMode(on) {
  if (ghostMode === on) return;
  ghostMode = on;
  const b = document.getElementById('ghost-btn');
  if (b) {
    b.classList.toggle('is-on', on);
    b.textContent = on ? '● back to what happened' : '◌ show the excess';
  }
  if (actCur === 4) updateCaption(4);
  wake();
}
document.getElementById('ghost-btn').addEventListener('click', () => setGhostMode(!ghostMode));

/* Held frame — the cinema "moment of silence" */
function enterHeld(text) {
  document.getElementById('held-text').innerHTML = text;
  const el = document.getElementById('held-line');
  el.hidden = false;
  stageEl.classList.add('is-held');
  // rAF pauses in background tabs — the timeout fallback still lands the class
  requestAnimationFrame(() => el.classList.add('is-on'));
  setTimeout(() => el.classList.add('is-on'), 60);
}
function exitHeld() {
  const el = document.getElementById('held-line');
  if (el.hidden) return;
  el.classList.remove('is-on');
  stageEl.classList.remove('is-held');
  setTimeout(() => { el.hidden = true; }, RM ? 0 : 700);
}

/* Follow-one-dot toggle */
document.getElementById('chip-track').addEventListener('click', (e) => {
  e.stopPropagation();
  trackOn = !trackOn;
  trailLen = 0; trailHead = 0;
  document.getElementById('chip-track').classList.toggle('is-on', trackOn);
  updateCaption(actCur);
  wake();
});

/* Methods popover */
function toggleMethods(open) {
  const el = document.getElementById('methods-pop');
  const want = open ?? el.hidden;
  if (!want) { el.hidden = true; return; }
  document.getElementById('methods-body').innerHTML = `
    <h3>Methods &amp; data notes</h3>
    <h4>The unit</h4>
    <p>1 dot ≈ ${UNIT} people. The swarm holds exactly ${fc(N)} dots = round(${fc(totalCases)} ÷ ${UNIT}),
    allocated across the 88 state-year cohorts by largest-remainder rounding, so cohort dot counts
    always sum to the published totals.</p>
    <h4>Vehicle occupant (derived)</h4>
    <p>BITRE does not record vehicle occupants separately. Derived per state-year as
    <code>total − Σ(five recorded groups)</code>, clamped at zero — the same rule as Chart 2 (Sankey),
    so the two pages can never disagree.</p>
    <h4>Partition allocation</h4>
    <p>Dots carry a fixed (state, year) identity. Category labels (road user / age / sex) are allocated
    within each cohort by deterministic largest remainder against the published marginals.
    Only one partition is shown at a time — no joint distribution is implied.
    Composition-stack heights and printed percentages are computed from the underlying case
    counts; the dots filling them are ≈${UNIT}-person units (one dot ≈ 0.7% on the NT side),
    so very small categories appear as outlined bands with few or no dots.</p>
    <h4>National average</h4>
    <p>Population-weighted: Σcases ÷ Σpopulation × 100,000 per year — the same convention as Chart 1 (map).
    The NT multiple is computed from this at runtime
    (${f2(d3.min(YEARS, y => ntMult.get(y)))}–${f2(d3.max(YEARS, y => ntMult.get(y)))}× across 2011–2021).</p>
    <h4>The excess (hollow dots, act 4)</h4>
    <p>Expected NT cases at the national rate = Σ<sub>year</sub> cases ÷ NT-multiple.
    Excess = actual − expected ≈ ${fc(Math.round(ntExcess))} of ${fc(stateTotals.get('NT'))} NT
    hospitalisations (${f1(ntExcessFrac * 100)}%). The hollow dots mark that share inside
    each composition band.</p>
    <h4>Ambient layers (decorative)</h4>
    <p>The neighbour web is a Delaunay triangulation of the dot positions (d3-delaunay);
    act 2's elevation lines are kernel-density contours of the same positions (d3-contour).
    Both are recomputed each time the swarm settles, encode no extra data, and are disabled
    under reduced motion or degraded performance.</p>
    <h4>Data checks (run at load)</h4>
    <ul>
      <li class="${audit.reconciled ? 'ok' : ''}">totals reconciled: ${fc(audit.totA)} (per-state file) = ${fc(audit.totB)} (national file)</li>
      <li class="${audit.voClamps === 0 ? 'ok' : ''}">${audit.voClamps === 0 ? 'all 88 vehicle-occupant residuals ≥ 0' : audit.voClamps + ' residuals clamped at 0'}</li>
      <li class="${audit.geoOk ? 'ok' : ''}">geojson codes match CSV state codes (8 of 8)</li>
      <li class="${audit.censusOk ? 'ok' : ''}">dot census reproduces every cohort total</li>
      <li>${audit.ageGaps} state-years have suppressed age cells; ${audit.sexGaps} have sex gaps (missing treated as 0)</li>
    </ul>
    <h4>Source</h4>
    <p>BITRE hospitalised road-crash injuries · ABS state populations · CC BY 4.0.
    Rates are per 100,000 of <em>total</em> state population (no stratified denominators).</p>`;
  el.hidden = false;
  document.getElementById('methods-close').focus();
}
document.getElementById('chip-methods').addEventListener('click', () => toggleMethods());
document.getElementById('methods-close').addEventListener('click', () => toggleMethods(false));
document.addEventListener('click', (e) => {
  const mp = document.getElementById('methods-pop');
  if (!mp.hidden && !mp.contains(e.target) && e.target.id !== 'chip-methods') toggleMethods(false);
});

/* ── §10 Cinema mode ─────────────────────────────────────── */
let cinema = { playing: false, timeouts: [], sweep: null };
const CHIP_CINEMA = document.getElementById('chip-cinema');
function cinemaPlay() {
  if (RM) return;                       // off under reduced motion
  cinemaStopTimers();
  cinema.playing = true;
  CHIP_CINEMA.textContent = '⏸ playing — tap to pause';
  const HOLDS = [4000, 6000, 6000, 12000, 14000, 8000];
  let step = actCur === 5 ? 0 : actCur;   // restart from current act (or 0 after end)
  const run = () => {
    if (!cinema.playing) return;
    goToAct(step, true);
    const wait = Math.max(0, morphEnd - performance.now()) + HOLDS[step];
    if (step === 3) {
      // automatic year sweep
      const t0 = Math.max(0, morphEnd - performance.now()) + 1200;
      cinema.timeouts.push(setTimeout(() => {
        let yi = 0;
        cinema.sweep = setInterval(() => {
          if (!cinema.playing) { clearInterval(cinema.sweep); return; }
          setFocusYear(YEARS[yi]);
          yi++;
          if (yi >= YEARS.length) clearInterval(cinema.sweep);
        }, 800);
      }, t0));
    }
    if (step === 4) {
      // GenAI-assisted (Claude): the held frame — ghost the excess, fade the
      // chrome, hold one line in silence before moving on
      const tSettle = Math.max(0, morphEnd - performance.now());
      cinema.timeouts.push(setTimeout(() => {
        if (!cinema.playing) return;
        setGhostMode(true);
        cinema.timeouts.push(setTimeout(() => {
          if (!cinema.playing) return;
          enterHeld(`If the Territory had run at the national rate,<br>≈${fc(Math.round(ntExcess))} people would never have been hospitalised.`);
          cinema.timeouts.push(setTimeout(exitHeld, 5000));
        }, 1400));
      }, tSettle + 2000));
    }
    cinema.timeouts.push(setTimeout(() => {
      step++;
      if (step > 5) { cinema.playing = false; CHIP_CINEMA.textContent = '▶ play all'; showEndCard(); return; }
      run();
    }, wait));
  };
  run();
}
function cinemaPause() {
  if (!cinema.playing) return;
  cinema.playing = false;
  cinemaStopTimers();
  exitHeld();
  CHIP_CINEMA.textContent = '▶ resume tour';
}
function cinemaStopTimers() {
  cinema.timeouts.forEach(clearTimeout);
  cinema.timeouts = [];
  if (cinema.sweep) clearInterval(cinema.sweep);
}
CHIP_CINEMA.addEventListener('click', (e) => {
  e.stopPropagation();
  if (cinema.playing) cinemaPause();
  else cinemaPlay();
});

/* ── §11 Theme / resize / visibility ─────────────────────── */
function onThemeChange() {
  readTokens();
  buildSprites();
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, W, H);               // kill stale trail smear
  if (exploreMode) buildMinimap();
  buildActSvg(actCur);                     // restyle runtime-coloured SVG bits
  buildLegend(actCur);                     // recolour legend swatches for new theme
  scheduleAmbient();                       // recolour cached web/contour layers
  rmPrev = null;                           // don't smear the old-theme snapshot
  rmFadeEnd = performance.now() + 50;      // force ≥1 painted frame past the RM/idle gate
  wake();
}
new MutationObserver(onThemeChange)
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
window.addEventListener('storage', (e) => {
  if (e.key === 'rc-theme' && e.newValue && e.newValue !== document.documentElement.dataset.theme) {
    document.documentElement.dataset.theme = e.newValue;
    const btn = document.getElementById('nav-theme-btn');
    if (btn) btn.textContent = e.newValue === 'dark' ? '☀' : '🌙';
  }
});

let resizeT = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    sizeStage();
    buildSprites();
    buildAllLayouts();
    retarget(layouts[actCur], { stagger: 'none', bow: 0, trails: false, fade: actCur === 3 ? 'merge' : null });
    buildActSvg(actCur);
  }, 250);
});

/* Rail construction */
function buildRail() {
  const rail = d3.select('#rail');
  ACT_DEFS.forEach((d, i) => {
    rail.append('button')
      .attr('class', 'rail-node' + (i === 0 ? ' is-active' : ''))
      .attr('type', 'button')
      .attr('aria-label', `Scene ${i + 1}: ${d.title}`)
      .on('click', () => { cinemaPause(); if (canNavigate()) goToAct(i); })
      .call(b => {
        b.append('span').attr('class', 'rail-dot');
        b.append('span').attr('class', 'rail-label').text(d.label);
      });
  });
}

/* ── §12 Init ────────────────────────────────────────────── */
function intro() {
  // Act 0 entrance: a single dot, then the flood
  const t0 = layouts[0];
  const cx = W / 2, cy = (plot.y0 + plot.y1) / 2;
  if (RM) {
    for (let i = 0; i < N; i++) {
      posX[i] = srcX[i] = tgtX[i] = t0[2 * i];
      posY[i] = srcY[i] = tgtY[i] = t0[2 * i + 1];
      twDur[i] = 1;
    }
    morphEnd = 0; settled = false;
    totalCounted = true;
    setTotal(totalCases);
    setMinutes(null);
    wake();
    return;
  }
  // park everyone off-stage except dot 0
  for (let i = 0; i < N; i++) {
    const a = hash01(i, 12) * TAU;
    const rr = Math.max(W, H) * 0.75;
    posX[i] = srcX[i] = tgtX[i] = cx + Math.cos(a) * rr;
    posY[i] = srcY[i] = tgtY[i] = cy + Math.sin(a) * rr;
    twDur[i] = 1;
  }
  posX[0] = srcX[0] = tgtX[0] = cx;
  posY[0] = srcY[0] = tgtY[0] = cy;
  morphEnd = 0; settled = false;
  setTotal(1 * UNIT);
  document.getElementById('hdr-minutes').classList.add('is-hidden');
  wake();
  later(1300, () => {
    totalCounted = true;
    retarget(t0, { stagger: 'none', bow: 0.05 });
    countUpTotal();
    later(1800, () => {
      setMinutes(null);
      document.getElementById('hdr-minutes').classList.remove('is-hidden');
    });
  });
}

sizeStage();
readTokens();
buildRail();
initSvgGroups();

loadData().then(() => {
  buildCensus(UNIT);
  buildSprites();
  buildAllLayouts();
  dataReady = true;
  updateCaption(0);
  buildLegend(0);
  buildActSvg(0);                          // ghost numeral for the opening act
  document.getElementById('dim-bar').hidden = true;
  console.info(`[showcase] ${fc(N)} dots · totals ${audit.reconciled ? 'reconciled ✓' : 'MISMATCH ✗'} · VO clamps: ${audit.voClamps} · census ${audit.censusOk ? 'ok ✓' : 'BROKEN ✗'}`);
  intro();
}).catch(err => {
  console.error(err);
  document.getElementById('cap-title').textContent = 'Data failed to load';
  document.getElementById('cap-body').textContent =
    'Serve the site over HTTP (e.g. npx http-server) — browsers block CSV loads from file://.';
});
