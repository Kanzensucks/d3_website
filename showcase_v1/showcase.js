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
}

/* ── Stage geometry ──────────────────────────────────────── */
let W = 0, H = 0, DPR = 1, dprCap = Infinity;
const MARGIN = { top: 96, right: 96, bottom: 88, left: 96 };
let plot = { x0: 0, x1: 0, y0: 0, y1: 0 };
let panelOpen = false;

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
  cohorts.forEach((c, ci) => {
    for (let i = c.start; i < c.start + c.n; i++) {
      dotState[i] = c.si; dotYear[i] = c.yi; dotCohort[i] = ci;
      phase[i] = hash01(i, 11) * TAU;
    }
  });
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
  // Planar identity like the map page — the geojson winding breaks spherical fills
  const proj = d3.geoIdentity().reflectY(true)
    .fitExtent([[plot.x0, plot.y0], [plot.x1, plot.y1]], geo);
  const path = d3.geoPath(proj);
  // adaptive spacing: largest cluster must fit inside ~38% of the plot height
  const maxN = d3.max(STATES, s => Math.round(stateTotals.get(s) / UNIT));
  const sp = Math.min(3.4, (plot.y1 - plot.y0) * 0.38 / Math.sqrt(maxN));
  const clusters = STATES.map((s, si) => {
    const f = geo.features.find(f => f.properties.code === s);
    let [cx, cy] = path.centroid(f);
    if (s === 'ACT') { cx += 64; cy += 56; }            // it sits inside NSW
    const n = Math.round(stateTotals.get(s) / UNIT);
    return { si, s, cx, cy, R: sp * Math.sqrt(n), f, trueC: path.centroid(f) };
  });
  // relaxation (overlap) + containment (stage bounds) passes
  const clamp = (c) => {
    c.cx = Math.max(plot.x0 + c.R * 0.7, Math.min(plot.x1 - c.R * 0.7, c.cx));
    c.cy = Math.max(plot.y0 + c.R * 0.7, Math.min(plot.y1 - c.R - 16, c.cy));
  };
  for (let pass = 0; pass < 3; pass++) {
    clusters.forEach(clamp);
    for (let a = 0; a < clusters.length; a++) for (let b = a + 1; b < clusters.length; b++) {
      const A = clusters[a], B = clusters[b];
      const dx = B.cx - A.cx, dy = B.cy - A.cy;
      const d = Math.hypot(dx, dy) || 1, min = A.R + B.R + 8;
      if (d < min) {
        const push = (min - d) / 2;
        A.cx -= dx / d * push; A.cy -= dy / d * push;
        B.cx += dx / d * push; B.cy += dy / d * push;
      }
    }
  }
  clusters.forEach(clamp);
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
  for (const side of sides) {
    const members = [];
    for (let i = 0; i < N; i++) if (side.test(i)) members.push(i);
    const byCat = cats.map((c, k) => members.filter(i => lab[i] === k));
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
let rmPrev = null, rmFadeEnd = 0;       // reduced-motion crossfade
let probe = { samples: [], active: false, phase: 0 };
let quad = null, lensSet = null, mouse = { x: -1e4, y: -1e4 };

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
    wake();
    return;
  }
  const stagger = opts.stagger || 'none';
  const spread = opts.spread ?? 600;
  bowAmp = opts.bow ?? 0.08;
  trailsOn = opts.trails !== false && dprCap === Infinity;
  fadeMode = opts.fade || null;
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
  fadeMode = actCur === 3 ? 'merged' : null;
  for (let i = 0; i < N; i++) { posX[i] = tgtX[i]; posY[i] = tgtY[i]; }
  if (actCur !== 3) {
    quad = d3.quadtree().x(i => posX[i]).y(i => posY[i]).addAll(d3.range(N));
  } else quad = null;
  if (probe.active) evalProbe();
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

  const morphing = now < morphEnd;
  if (!morphing && !settled) onSettle();

  // physics-sleep: settled + idle -> render breathe at half rate; stop entirely when allowed
  if (settled && now > rmFadeEnd) {
    if (RM || document.hidden) { sleep(); return; }
    if (frameTick % 2) return;
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
  const inAct3 = actCur === 3;
  let lastA = 1;
  ctx.globalAlpha = 1;

  for (let i = 0; i < N; i++) {
    let x, y, a = 1;
    if (settled) {
      x = tgtX[i];
      y = tgtY[i] + (RM ? 0 : Math.sin(breatheT + phase[i]) * 0.6);
      if (fadeMode === 'merged') a = 0;
    } else {
      let p = (now - tw0[i]) / twDur[i];
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      const e = ease3(p);
      x = srcX[i] + (tgtX[i] - srcX[i]) * e;
      y = srcY[i] + (tgtY[i] - srcY[i]) * e;
      if (bowAmp > 0 && p > 0 && p < 1) {
        const dx = tgtX[i] - srcX[i], dy = tgtY[i] - srcY[i];
        const d = Math.hypot(dx, dy);
        if (d > 1) {
          const s = (hash01(i, 6) > 0.5 ? 1 : -1) * bowAmp * d * Math.sin(Math.PI * p);
          x += (-dy / d) * s; y += (dx / d) * s;
        }
      }
      if (fadeMode === 'merge') a = p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
      else if (fadeMode === 'burst') a = p < 0.2 ? p / 0.2 : 1;
    }
    posX[i] = x; posY[i] = y;
    if (a <= 0.02) continue;
    if (a !== lastA) { ctx.globalAlpha = a; lastA = a; }
    const ci = colorBase === COL_STATE ? dotState[i] : colorBase + labArr[i];
    const sz = (lensSet && lensSet.has(i)) ? 2 : (actCur === 1 ? 1 : 0);
    const sp = sprites[ci][sz];
    const half = sp._half;
    ctx.drawImage(sp, x - half, y - half, half * 2, half * 2);
  }
  ctx.globalAlpha = 1;

  if (inAct3 || discFade > 0) drawDiscs(now, morphing);

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
let actCur = 0, activeDim = 'ru', focusYear = null, exploreMode = false;
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
  lensSet = null;
  const prev = actCur;
  actCur = a;
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
  document.getElementById('partition-chips').hidden = a !== 4;
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
    html = d ? `Same dots, split by ${em(DIM_NAME[activeDim])}. Biggest gap: ${em(d.cat)} — ${em(f1(d.a) + '%')} of the NT's burden vs ${f1(d.b)}% in the rest of Australia.` : '';
  } else if (a === 5) {
    const sums = RU_CATS.map(c => [c, d3.sum(STATES, s => d3.sum(YEARS, y => catCases('ru', s, y, c)))]);
    sums.sort((x, y) => y[1] - x[1]);
    html = `The national burden by road user. ${em(sums[0][0] + 's')} are the largest group — ${em(f1(sums[0][1] / totalCases * 100) + '%')} of the decade — with ${sums[1][0].toLowerCase()}s second at ${f1(sums[1][1] / totalCases * 100)}%.`;
  }
  bEl.innerHTML = html;
}

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
    lensSet = set.size ? set : null;
    wake();
  }
  const i = quad.find(mouse.x, mouse.y, 14);
  if (i == null) { hideTip(); return; }
  const c = cohorts[dotCohort[i]];
  let extra = '';
  if (actCur === 4) extra = `<br><span class="tip-k">${DIMS[activeDim][labels[activeDim][i]]}</span>`;
  if (actCur === 5) extra = `<br><span class="tip-k">${RU_CATS[labels.ru[i]]}</span>`;
  if (actCur === 1) extra = `<br><span class="tip-k">${fc(trend.find(t => t.year === c.year).cases)} national cases in ${c.year}</span>`;
  showTip(e, `<b>≈ ${UNIT} people</b> — ${c.state}, ${c.year}${extra}`);
});
canvas.addEventListener('mouseleave', () => { hideTip(); lensSet = null; mouse.x = mouse.y = -1e4; });
canvas.addEventListener('click', (e) => {
  cinemaPause();
  if (actCur !== 3 || !settled) return;
  const r = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
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
    layouts[4] = layoutStacks(activeDim);
    retarget(layouts[4], { stagger: 'cat', bow: 0.05, spread: 400 });
    buildActSvg(4);
    updateCaption(4);
  });
});

/* End card */
function showEndCard() {
  const peakY = YEARS.reduce((b, y) => ntMult.get(y) > ntMult.get(b) ? y : b, YEARS[0]);
  const lo = d3.min(YEARS, y => ntMult.get(y)), hi = d3.max(YEARS, y => ntMult.get(y));
  const pct = (trend.at(-1).cases - trend[0].cases) / trend[0].cases * 100;
  document.getElementById('end-headline').innerHTML =
    `One territory drives <span class="hl">on a different road</span>.`;
  document.getElementById('end-stats').innerHTML = `
    <li><b>${fc(totalCases)}</b> hospitalised road-crash injuries, 2011–2021</li>
    <li><b>+${f1(pct)}%</b> over the decade — one every <b>${f1(minutes.get(YEARS.at(-1)))} minutes</b> by 2021</li>
    <li>The NT ran <span class="em">${f2(lo)}–${f2(hi)}×</span> the national rate — above average <b>all 11 years</b>, peaking in ${peakY}</li>`;
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
function unlockExplore() {
  if (exploreMode) return;
  exploreMode = true;
  buildMinimap();
  document.getElementById('minimap').hidden = false;
  document.getElementById('rail-skip').textContent = 'explore mode on';
  document.getElementById('rail-skip').disabled = true;
}
document.getElementById('rail-skip').addEventListener('click', unlockExplore);

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
  const HOLDS = [4000, 6000, 6000, 12000, 8000, 8000];
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
  rmPrev = null;                           // don't smear the old-theme snapshot
  rmFadeEnd = performance.now() + 50;      // force ≥1 painted frame past the RM/idle gate
  wake();
}
new MutationObserver(onThemeChange)
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
window.addEventListener('storage', (e) => {
  if (e.key === 'rc-theme' && e.newValue && e.newValue !== document.documentElement.dataset.theme) {
    document.documentElement.dataset.theme = e.newValue;
    const btn = document.getElementById('chip-theme');
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
  console.info(`[showcase] ${fc(N)} dots · totals ${audit.reconciled ? 'reconciled ✓' : 'MISMATCH ✗'} · VO clamps: ${audit.voClamps} · census ${audit.censusOk ? 'ok ✓' : 'BROKEN ✗'}`);
  intro();
}).catch(err => {
  console.error(err);
  document.getElementById('cap-title').textContent = 'Data failed to load';
  document.getElementById('cap-body').textContent =
    'Serve the site over HTTP (e.g. npx http-server) — browsers block CSV loads from file://.';
});
