// GenAI-assisted (Claude) — extraction + edits
const STATES = ['NSW','Vic','Qld','SA','WA','Tas','NT','ACT'];
const FULL = {
  NSW:'New South Wales', Vic:'Victoria', Qld:'Queensland',
  SA:'South Australia',  WA:'Western Australia', Tas:'Tasmania',
  NT:'Northern Territory', ACT:'Australian Capital Territory'
};

const RU_ORDER = ['Vehicle occupant','Motorcyclist','Pedal cyclist','Pedestrian','Bus occupant','Other or unknown'];

const RU_COLORS_DARK = {
  'Vehicle occupant': '#e8523a',
  'Motorcyclist':     '#4d9de0',
  'Pedal cyclist':    '#3ec99a',
  'Pedestrian':       '#f0c040',
  'Bus occupant':     '#b07ce8',
  'Other or unknown': '#6a7a90'
};

const RU_COLORS_LIGHT = {
  'Vehicle occupant': '#c8391e',
  'Motorcyclist':     '#1a6fb5',
  'Pedal cyclist':    '#1a9e68',
  'Pedestrian':       '#c48a00',
  'Bus occupant':     '#8040cc',
  'Other or unknown': '#55637a'
};

const STATE_COLORS_DARK = {
  NSW:'#e8523a', Vic:'#4d9de0', Qld:'#3ec99a', SA:'#f0c040',
  WA:'#b07ce8', Tas:'#f08850', NT:'#ff3d71', ACT:'#30d8d0'
};
const STATE_COLORS_LIGHT = {
  NSW:'#c8391e', Vic:'#1a6fb5', Qld:'#1a9e68', SA:'#c48a00',
  WA:'#6030bb', Tas:'#c06028', NT:'#cc1155', ACT:'#0099a0'
};

function ruColors() {
  return document.documentElement.dataset.theme === 'dark' ? RU_COLORS_DARK : RU_COLORS_LIGHT;
}
function stateColors() {
  return document.documentElement.dataset.theme === 'dark' ? STATE_COLORS_DARK : STATE_COLORS_LIGHT;
}

let selectedState = null;
let currentYear = 2021;
let ruIdx = {};
let totIdx = {};

// ── Theme toggle ───────────────────────────────────
// Show the right glyph when arriving with a saved light theme
document.getElementById('nav-theme-btn').textContent =
  document.documentElement.dataset.theme === 'dark' ? '☀' : '🌙';
document.getElementById('nav-theme-btn').addEventListener('click', () => {
  const html = document.documentElement;
  const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
  html.dataset.theme = next;
  try { localStorage.setItem('rc-theme', next); } catch (e) {}
  document.getElementById('nav-theme-btn').textContent = next === 'dark' ? '☀' : '🌙';
  if (selectedState) render(selectedState);
  buildLegend();
});

// ── Data load ──────────────────────────────────────
Promise.all([
  d3.csv('../data/state_year_roaduser.csv', d => ({
    year:+d.year, state:d.state, cat:d.road_user, cases:+d.cases
  })),
  d3.csv('../data/state_year_per100k.csv', d => ({
    year:+d.Year, state:d.state, cases:+d.cases, rate:+d.cases_per_100k
  }))
]).then(([ruData, totData]) => {
  ruData.forEach(r => {
    (ruIdx[r.state] ??= {});
    (ruIdx[r.state][r.year] ??= {});
    ruIdx[r.state][r.year][r.cat] = (ruIdx[r.state][r.year][r.cat]||0) + r.cases;
  });
  totData.forEach(r => {
    (totIdx[r.state] ??= {});
    totIdx[r.state][r.year] = { cases:r.cases, rate:r.rate };
  });

  buildSidebar();
  buildLegend();
  updateStats(null);

  document.getElementById('yr').addEventListener('input', e => {
    currentYear = +e.target.value;
    document.getElementById('yrnum').textContent = currentYear;
    render(selectedState);
    updateStats(selectedState);
  });
});

function voCount(state, year) {
  const total = totIdx[state]?.[year]?.cases || 0;
  const known = Object.values(ruIdx[state]?.[year]||{}).reduce((a,b)=>a+b,0);
  return Math.max(0, total - known);
}

// ── Sidebar ────────────────────────────────────────
function buildSidebar() {
  const list = document.getElementById('state-list');
  STATES.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'state-btn';
    btn.dataset.state = s;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = FULL[s];

    const abbr = document.createElement('span');
    abbr.className = 'state-abbr';
    abbr.textContent = s;

    const bar = document.createElement('div');
    bar.className = 'bar-bg';

    btn.appendChild(nameSpan);
    btn.appendChild(abbr);
    btn.appendChild(bar);

    btn.addEventListener('click', () => {
      if (selectedState === s) {
        selectedState = null;
        document.querySelectorAll('.state-btn').forEach(b => b.classList.remove('active'));
      } else {
        selectedState = s;
        document.querySelectorAll('.state-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.state === s)
        );
      }
      render(selectedState);
      updateStats(selectedState);
    });

    list.appendChild(btn);
  });

  // Update bar widths after data load
  setTimeout(updateBarWidths, 100);
}

function updateBarWidths() {
  const maxCases = Math.max(...STATES.map(s => totIdx[s]?.[currentYear]?.cases || 0));
  document.querySelectorAll('.state-btn').forEach(btn => {
    const s = btn.dataset.state;
    const cases = totIdx[s]?.[currentYear]?.cases || 0;
    const pct = maxCases > 0 ? (cases / maxCases * 100) : 0;
    btn.querySelector('.bar-bg').style.width = pct + '%';
  });
}

// ── Legend ─────────────────────────────────────────
function buildLegend() {
  const leg = document.getElementById('legend');
  leg.innerHTML = '';
  const colors = ruColors();
  RU_ORDER.forEach(ru => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    const dot = document.createElement('div');
    dot.className = 'legend-dot';
    dot.style.background = colors[ru] || '#aaa';
    const lbl = document.createElement('span');
    lbl.textContent = ru;
    item.appendChild(dot);
    item.appendChild(lbl);
    leg.appendChild(item);
  });
}

// ── Stats ──────────────────────────────────────────
function updateStats(state) {
  const natTotal = STATES.reduce((s, c) => s + (totIdx[c]?.[currentYear]?.cases || 0), 0);
  document.getElementById('st-nat').textContent = natTotal.toLocaleString();
  document.getElementById('st-nat-sub').textContent = 'hospitalisations · ' + currentYear;

  if (!state) {
    document.getElementById('st-state').textContent = '—';
    document.getElementById('st-state-sub').textContent = 'select a state';
    document.getElementById('st-rate').textContent = '—';
    document.getElementById('st-rate-sub').textContent = '—';
    document.getElementById('st-top').textContent = '—';
    document.getElementById('st-top-sub').textContent = '—';
    updateBarWidths();
    return;
  }

  const cases = totIdx[state]?.[currentYear]?.cases || 0;
  const rate  = totIdx[state]?.[currentYear]?.rate  || 0;
  const share = natTotal > 0 ? (cases / natTotal * 100).toFixed(1) : '0';
  document.getElementById('st-state').textContent = cases.toLocaleString();
  document.getElementById('st-state-sub').textContent = share + '% of national';

  document.getElementById('st-rate').textContent = rate.toFixed(0);
  document.getElementById('st-rate-sub').textContent = 'per 100k population';

  const raw = ruIdx[state]?.[currentYear] || {};
  const all = { ...raw, 'Vehicle occupant': voCount(state, currentYear) };
  const top = Object.entries(all).sort((a,b)=>b[1]-a[1])[0];
  if (top) {
    const pct = cases > 0 ? (top[1]/cases*100).toFixed(1) : '0';
    document.getElementById('st-top').textContent = top[0].split(' ')[0];
    document.getElementById('st-top-sub').textContent = top[1].toLocaleString() + ' · ' + pct + '%';
  }

  updateBarWidths();
}

// ── Render ─────────────────────────────────────────
function render(state) {
  const svgEl = document.getElementById('chart-svg');
  const emptyEl = document.getElementById('empty-state');
  const svg = d3.select('#chart-svg');
  svg.selectAll('*').remove();

  if (!state) {
    emptyEl.style.display = 'flex';
    return;
  }
  emptyEl.style.display = 'none';

  const W = svgEl.clientWidth  || 700;
  const H = svgEl.clientHeight || 400;
  const m = { top:32, right:170, bottom:16, left:20 };

  const raw = ruIdx[state]?.[currentYear] || {};
  const vo  = voCount(state, currentYear);
  const stateTot = totIdx[state]?.[currentYear]?.cases || 0;
  const colors = ruColors();
  const sColors = stateColors();

  // Build nodes + links
  const nodes = [
    { id:'state:'+state, name:FULL[state], type:'state', code:state },
    ...RU_ORDER.map(ru => ({ id:'ru:'+ru, name:ru, type:'ru', cat:ru }))
  ];

  const links = RU_ORDER.map(ru => ({
    source: 'state:'+state,
    target: 'ru:'+ru,
    value: Math.max(0, ru === 'Vehicle occupant' ? vo : (raw[ru]||0))
  })).filter(l => l.value > 0);

  if (!links.length) return;

  const sankey = d3.sankey()
    .nodeId(d => d.id)
    .nodeAlign(d3.sankeyLeft)
    .nodeWidth(14)
    .nodePadding(Math.max(8, (H - m.top - m.bottom) / 18))
    .extent([[m.left, m.top], [W - m.right, H - m.bottom]]);

  let g;
  try {
    g = sankey({ nodes: nodes.map(d=>({...d})), links: links.map(d=>({...d})) });
  } catch(e) { return; }

  const defs = svg.append('defs');

  // Drop shadow filter
  const filt = defs.append('filter').attr('id','glow').attr('x','-20%').attr('y','-20%').attr('width','140%').attr('height','140%');
  filt.append('feGaussianBlur').attr('stdDeviation','3').attr('result','blur');
  const feMerge = filt.append('feMerge');
  feMerge.append('feMergeNode').attr('in','blur');
  feMerge.append('feMergeNode').attr('in','SourceGraphic');

  // Gradients per link
  g.links.forEach((l, i) => {
    const grad = defs.append('linearGradient')
      .attr('id','lg-'+i)
      .attr('gradientUnits','userSpaceOnUse')
      .attr('x1', l.source.x1).attr('y1', (l.source.y0+l.source.y1)/2)
      .attr('x2', l.target.x0).attr('y2', (l.target.y0+l.target.y1)/2);
    grad.append('stop').attr('offset','0%').attr('stop-color', sColors[state]).attr('stop-opacity','0.85');
    grad.append('stop').attr('offset','100%').attr('stop-color', colors[l.target.cat]||'#888').attr('stop-opacity','0.85');
  });

  // Column headers
  const isDark = document.documentElement.dataset.theme === 'dark';
  const mutedColor = isDark ? '#6b7590' : '#6e6c84';
  const textColor  = isDark ? '#e4e8f2' : '#1a1a22';
  const text2Color = isDark ? '#8a93aa' : '#5a5870';

  svg.append('text').attr('class','col-head')
    .attr('x', m.left + 2).attr('y', 16)
    .attr('fill', mutedColor)
    .text('STATE');

  svg.append('text').attr('class','col-head')
    .attr('x', W - m.right + 10).attr('y', 16)
    .attr('fill', mutedColor)
    .text('ROAD USER TYPE');

  // Links
  const linkG = svg.append('g');
  const linkSel = linkG.selectAll('path')
    .data(g.links).join('path')
    .attr('class','link-path')
    .attr('stroke', (_,i) => 'url(#lg-'+i+')')
    .attr('stroke-width', d => Math.max(1.5, d.width))
    .attr('d', d3.sankeyLinkHorizontal())
    .style('opacity', 0.35);

  // Nodes
  const nodeG = svg.append('g');
  nodeG.selectAll('rect')
    .data(g.nodes).join('rect')
    .attr('class','node-rect')
    .attr('x', d => d.x0).attr('y', d => d.y0)
    .attr('width', d => d.x1 - d.x0)
    .attr('height', d => Math.max(2, d.y1 - d.y0))
    .attr('fill', d => d.type==='state' ? sColors[d.code] : (colors[d.cat]||'#888'))
    .attr('rx', 3)
    .style('filter', 'url(#glow)')
    .on('mouseover', (e, d) => {
      linkSel
        .style('opacity', l => (l.source.id===d.id||l.target.id===d.id) ? 0.75 : 0.06);
      showNodeTip(e, d, stateTot);
    })
    .on('mousemove', moveTip)
    .on('mouseout', () => { linkSel.style('opacity', 0.35); hideTip(); });

  linkSel
    .on('mouseover', (e, d) => {
      linkSel.style('opacity', l => l===d ? 0.8 : 0.06);
      showLinkTip(e, d, stateTot, state);
    })
    .on('mousemove', moveTip)
    .on('mouseout', () => { linkSel.style('opacity', 0.35); hideTip(); });

  // Labels
  const labG = svg.append('g');
  g.nodes.forEach(n => {
    const mid = (n.y0 + n.y1) / 2;
    const isState = n.type === 'state';
    const x = isState ? n.x1 + 10 : n.x1 + 10;

    labG.append('text')
      .attr('class','node-name')
      .attr('x', x).attr('y', mid - 1)
      .attr('dy','0.35em')
      .attr('text-anchor','start')
      .attr('fill', textColor)
      .text(n.name);

    if ((n.y1 - n.y0) > 18) {
      const val = n.value || 0;
      const pct = stateTot > 0 ? (val/stateTot*100).toFixed(1) : '0';
      labG.append('text')
        .attr('class','node-val')
        .attr('x', x).attr('y', mid + 13)
        .attr('text-anchor','start')
        .attr('fill', text2Color)
        .text(isState ? val.toLocaleString() + ' cases' : val.toLocaleString() + '  ' + pct + '%');
    }
  });
}

// ── Tooltip ────────────────────────────────────────
const tipEl  = document.getElementById('tip');
const tipInner = document.getElementById('tip-inner');

function showLinkTip(e, l, stateTot, state) {
  const pct = stateTot > 0 ? (l.value/stateTot*100).toFixed(1) : '0';
  tipInner.innerHTML = `
    <div class="tip-title">${FULL[state]} → ${l.target.name}</div>
    <div class="tip-row"><span class="tip-k">Cases</span><span class="tip-v">${l.value.toLocaleString()}</span></div>
    <div class="tip-row"><span class="tip-k">Share of state</span><span class="tip-v">${pct}%</span></div>
    <div class="tip-row"><span class="tip-k">Year</span><span class="tip-v">${currentYear}</span></div>
  `;
  tipEl.style.display = 'block';
  moveTip(e);
}

function showNodeTip(e, n, stateTot) {
  const val = n.value || 0;
  const pct = stateTot > 0 ? (val/stateTot*100).toFixed(1) : '0';
  const name = n.type==='state' ? FULL[n.code] : n.name;
  const rate = n.type==='state' ? (totIdx[n.code]?.[currentYear]?.rate||0).toFixed(0) : null;
  tipInner.innerHTML = `
    <div class="tip-title">${name}</div>
    <div class="tip-row"><span class="tip-k">Cases</span><span class="tip-v">${val.toLocaleString()}</span></div>
    ${n.type==='ru' ? `<div class="tip-row"><span class="tip-k">Share of state</span><span class="tip-v">${pct}%</span></div>` : ''}
    ${rate ? `<div class="tip-row"><span class="tip-k">Rate /100k</span><span class="tip-v">${rate}</span></div>` : ''}
    ${n.name==='Vehicle occupant' ? `<div class="tip-note">Derived: total hospitalisations minus the five recorded road-user categories</div>` : ''}
  `;
  tipEl.style.display = 'block';
  moveTip(e);
}

function moveTip(e) {
  const pad=16, tw=tipEl.offsetWidth||220, th=tipEl.offsetHeight||100;
  let x=e.clientX+pad, y=e.clientY+pad;
  if (x+tw+pad > window.innerWidth)  x = e.clientX-tw-pad;
  if (y+th+pad > window.innerHeight) y = e.clientY-th-pad;
  tipEl.style.left = x+'px';
  tipEl.style.top  = y+'px';
}

function hideTip() { tipEl.style.display='none'; }

// ── Resize ─────────────────────────────────────────
window.addEventListener('resize', () => { if (selectedState) render(selectedState); });
