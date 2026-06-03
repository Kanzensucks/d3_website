/* =============================================================
   map_classic_v2.js — demographic-aware extension of map_classic.

   Adds a global slice filter (All / Sex / Age / Road user) that
   re-colours the whole map, legend, NT annotation, detail card
   and compare strip. Adds a "who gets hurt" breakdown panel
   inside the detail card with Age / Sex / Road-user tabs.

   COS30045 · Team 99 · Hamish Hooley & Kanzen Ong.
   ============================================================= */

// ============================================================
// 1. Constants & shared state
// ============================================================
const DATA_CSV       = "../data/state_year_per100k.csv";
const DATA_GEO       = "../data/aus_states.geojson";
const DATA_AGE       = "../data/state_year_age.csv";
const DATA_SEX       = "../data/state_year_sex.csv";
const DATA_ROADUSER  = "../data/state_year_roaduser.csv";
const DATA_POP       = "../data/population_clean.csv";

const YEAR_MIN = 2011;
const YEAR_MAX = 2021;
const TRANS_MS = 700;

const MAP_W = 960, MAP_H = 640;

const STATE_CODES = ["NSW", "Vic", "Qld", "SA", "WA", "Tas", "NT", "ACT"];
const FULL_NAME = {
  NSW: "New South Wales", Vic: "Victoria", Qld: "Queensland",
  SA:  "South Australia", WA:  "Western Australia", Tas: "Tasmania",
  NT:  "Northern Territory", ACT: "Australian Capital Territory",
};

// Canonical category orders for the value dropdown and breakdown bars.
const AGE_ORDER  = ["0-7", "8-16", "17-25", "26-39", "40-64", "65-74", "75+"];
const SEX_ORDER  = ["Female", "Male"];
const ROAD_ORDER = ["Pedestrian", "Pedal cyclist", "Motorcyclist", "Bus occupant", "Other or unknown"];

const DIM_LABEL = { all: "All people", sex: "Sex", age: "Age band", roaduser: "Road user" };

const vizState = {
  rows: [], geo: null,
  byYear: new Map(), byState: new Map(), nationalByYear: new Map(),
  // Demographic indexes: year -> state -> category -> cases
  ageIdx: new Map(), sexIdx: new Map(), roadIdx: new Map(),
  // Population: year -> state -> population
  popIdx: new Map(),
  rateExtent: [0, 1], deltaExtent: [-1, 1],
  colorAbs: null, colorDelta: null,
  projection: null, path: null,
  zoom: null,
  currentYear: YEAR_MIN,
  mode: "absolute",
  isPlaying: false, timer: null, speedMs: 1100,
  selectedCode: null,
  compareSet: new Set(),
  // Active slice filter.
  filter: { dim: "all", value: null },
  // Cache for the active slice's national average by year (recomputed when filter changes).
  sliceNationalByYear: new Map(),
  breakdownTab: "age",
};

// ============================================================
// 2. Data load + indexing
// ============================================================
function showError(message) {
  const banner = document.getElementById("error-banner");
  if (!banner) return;
  banner.hidden = false;
  banner.textContent = message;
}

function rowAccessor(d) {
  return {
    year: +d.Year, state: d.state,
    cases: +d.cases, population: +d.population,
    cases_per_100k: +d.cases_per_100k,
  };
}

function loadData() {
  return Promise.all([
    d3.csv(DATA_CSV, rowAccessor),
    d3.json(DATA_GEO),
    d3.csv(DATA_AGE,      d => ({ year: +d.year, state: d.state, age_group: d.age_group,  cases: +d.cases })),
    d3.csv(DATA_SEX,      d => ({ year: +d.year, state: d.state, sex: d.sex,              cases: +d.cases })),
    d3.csv(DATA_ROADUSER, d => ({ year: +d.year, state: d.state, road_user: d.road_user,  cases: +d.cases })),
    d3.csv(DATA_POP,      d => ({ year: +d.year, state: d.state, population: +d.population })),
  ]);
}

function indexData(rows) {
  const byYear = new Map(), byState = new Map();
  for (const r of rows) {
    if (!byYear.has(r.year)) byYear.set(r.year, new Map());
    byYear.get(r.year).set(r.state, r);
    if (!byState.has(r.state)) byState.set(r.state, []);
    byState.get(r.state).push(r);
  }
  for (const a of byState.values()) a.sort((p, q) => p.year - q.year);
  return { byYear, byState };
}

function computeNationalAverages(byYear) {
  const out = new Map();
  for (const [year, m] of byYear) {
    let tc = 0, tp = 0;
    for (const r of m.values()) { tc += r.cases; tp += r.population; }
    out.set(year, (tc / tp) * 100000);
  }
  return out;
}

// Build a year->state->category->cases index from a flat array.
function indexDemographic(rows, catKey) {
  const out = new Map();
  for (const r of rows) {
    if (!out.has(r.year)) out.set(r.year, new Map());
    const ym = out.get(r.year);
    if (!ym.has(r.state)) ym.set(r.state, new Map());
    ym.get(r.state).set(r[catKey], r.cases);
  }
  return out;
}

function indexPopulation(rows) {
  const out = new Map();
  for (const r of rows) {
    if (!out.has(r.year)) out.set(r.year, new Map());
    out.get(r.year).set(r.state, r.population);
  }
  return out;
}

// ============================================================
// 3. Scales + slice helpers
// ============================================================
// Return the cases count for (state, year) under the current filter, or null
// if the cell is missing.
function sliceCases(state, year, filter = vizState.filter) {
  if (filter.dim === "all") {
    const row = vizState.byYear.get(year)?.get(state);
    return row ? row.cases : null;
  }
  const idx = filter.dim === "sex"  ? vizState.sexIdx
            : filter.dim === "age"  ? vizState.ageIdx
            : /* roaduser */          vizState.roadIdx;
  const v = idx.get(year)?.get(state)?.get(filter.value);
  return v == null ? null : v;
}

// Return rate per 100k of total state population for the active slice.
function sliceRate(state, year, filter = vizState.filter) {
  if (filter.dim === "all") {
    const row = vizState.byYear.get(year)?.get(state);
    return row ? row.cases_per_100k : null;
  }
  const cases = sliceCases(state, year, filter);
  const pop = vizState.popIdx.get(year)?.get(state);
  if (cases == null || !pop) return null;
  return (cases / pop) * 100000;
}

// National average for the active slice, in rate-per-100k terms.
function computeSliceNationalAverages(filter = vizState.filter) {
  const out = new Map();
  for (let yr = YEAR_MIN; yr <= YEAR_MAX; yr++) {
    let tc = 0, tp = 0;
    for (const code of STATE_CODES) {
      const c = sliceCases(code, yr, filter);
      const p = vizState.popIdx.get(yr)?.get(code);
      if (c != null && p) { tc += c; tp += p; }
    }
    out.set(yr, tp > 0 ? (tc / tp) * 100000 : 0);
  }
  return out;
}

function buildColorScalesForFilter() {
  const rates = [];
  const deltas = [];
  for (let yr = YEAR_MIN; yr <= YEAR_MAX; yr++) {
    const natl = vizState.sliceNationalByYear.get(yr);
    for (const code of STATE_CODES) {
      const r = sliceRate(code, yr);
      if (r == null || !isFinite(r)) continue;
      rates.push(r);
      if (natl != null) deltas.push(r - natl);
    }
  }
  const rmin = d3.min(rates) ?? 0;
  const rmax = d3.max(rates) ?? 1;
  vizState.rateExtent = [rmin, rmax];
  vizState.colorAbs = d3.scaleSequential(d3.interpolateYlOrRd).domain([rmin, rmax]);

  const m = Math.max(Math.abs(d3.min(deltas) ?? 0), Math.abs(d3.max(deltas) ?? 0)) || 1;
  vizState.deltaExtent = [-m, m];
  vizState.colorDelta = d3.scaleSequential(t => d3.interpolateRdYlBu(1 - t)).domain([-m, m]);
}

// Planar projection — robust to GeoJSON ring-winding inconsistencies.
function buildProjection(geo, w, h) {
  vizState.projection = d3.geoIdentity().reflectY(true).fitSize([w, h], geo);
  vizState.path = d3.geoPath(vizState.projection);
}

function fillFor(code) {
  const rate = sliceRate(code, vizState.currentYear);
  if (rate == null) return "#eee";
  if (vizState.mode === "delta") {
    const natl = vizState.sliceNationalByYear.get(vizState.currentYear);
    return vizState.colorDelta(rate - natl);
  }
  return vizState.colorAbs(rate);
}

// Rebuild everything that depends on the slice (called when filter changes).
function rebuildScalesForFilter() {
  vizState.sliceNationalByYear = computeSliceNationalAverages();
  buildColorScalesForFilter();
}

// ============================================================
// 4. Map view
// ============================================================
function drawMap() {
  const stage = d3.select("#map-holder");
  stage.selectAll("svg").remove();

  const svg = stage.append("svg")
    .attr("viewBox", `0 0 ${MAP_W} ${MAP_H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "img")
    .attr("aria-label", "Choropleth map of Australia. Click a state to focus it.");

  svg.append("rect")
    .attr("class", "map-bg")
    .attr("width", MAP_W).attr("height", MAP_H)
    .attr("fill", "transparent")
    .on("click", () => resetView());

  const gZoom = svg.append("g").attr("class", "zoom-layer");
  const gStates = gZoom.append("g").attr("class", "states-layer");
  const gAnnot  = gZoom.append("g").attr("class", "annotation-layer");

  gStates.selectAll("path.state")
    .data(vizState.geo.features, d => d.properties.code)
    .join("path")
      .attr("class", "state")
      .attr("d", vizState.path)
      .attr("data-code", d => d.properties.code)
      .attr("fill", d => fillFor(d.properties.code))
      // GenAI-assisted (Claude): animated initial outline draw.
      .each(function () {
        const path = this;
        try {
          const len = path.getTotalLength();
          d3.select(path)
            .attr("stroke-dasharray", `${len} ${len}`)
            .attr("stroke-dashoffset", len)
            .transition().duration(900).delay(100)
            .attr("stroke-dashoffset", 0)
            .on("end", () => d3.select(path).attr("stroke-dasharray", null));
        } catch (e) {}
      })
      .on("click", function (event, d) {
        event.stopPropagation();
        selectState(d.properties.code);
      })
      .on("mouseover.coord", function (event, d) { setHover(d.properties.code); })
      .on("mouseout.coord", function () { setHover(null); });

  vizState.svg = svg;
  vizState.gZoom = gZoom;
  vizState.gStates = gStates;
  vizState.gAnnot = gAnnot;

  // GenAI-assisted (Claude): d3.zoom for programmatic zoom-to-state.
  vizState.zoom = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[0, 0], [MAP_W, MAP_H]])
    .on("zoom", (event) => {
      gZoom.attr("transform", event.transform);
      gStates.selectAll("path.state").attr("stroke-width", 1.1 / event.transform.k);
    });
  vizState.svg.call(vizState.zoom);

  drawNTAnnotation();
}

function refreshMap() {
  vizState.gStates.selectAll("path.state")
    .transition().duration(TRANS_MS)
    .attr("fill", d => fillFor(d.properties.code));
  drawNTAnnotation();
}

function drawNTAnnotation() {
  const g = vizState.gAnnot;
  g.selectAll("*").remove();
  if (vizState.selectedCode) return;

  const nt = vizState.geo.features.find(f => f.properties.code === "NT");
  if (!nt) return;
  const [cx, cy] = vizState.path.centroid(nt);

  const ntRate = sliceRate("NT", vizState.currentYear);
  const natl   = vizState.sliceNationalByYear.get(vizState.currentYear);
  if (ntRate == null || !natl) return;
  const mult = (ntRate / natl).toFixed(2);

  const labelX = Math.min(MAP_W - 250, cx + 175);
  const labelY = Math.max(40, cy - 80);
  const elbowX = cx + 70;

  g.append("polyline")
    .attr("class", "nt-leader")
    .attr("points", `${cx},${cy} ${elbowX},${cy} ${elbowX},${labelY} ${labelX - 8},${labelY}`);
  g.append("circle").attr("class", "nt-leader-dot").attr("cx", cx).attr("cy", cy).attr("r", 3);

  const lines = [
    { text: "Northern Territory", cls: "nt-annotation-text" },
    { text: `${vizState.currentYear} rate: ${ntRate.toFixed(1)} / 100k`, cls: "nt-annotation-sub" },
    { text: `${mult}× the national average`, cls: "nt-annotation-emph" },
  ];
  const longest = lines.reduce((a, b) => (a.text.length >= b.text.length ? a : b)).text;
  const boxW = Math.max(180, longest.length * 6.6 + 20);
  const boxH = lines.length * 16 + 18;

  g.append("rect").attr("class", "nt-annotation-box")
    .attr("x", labelX - 10).attr("y", labelY - 20)
    .attr("rx", 6).attr("ry", 6).attr("width", boxW).attr("height", boxH);
  lines.forEach((ln, i) => {
    g.append("text").attr("class", ln.cls)
      .attr("x", labelX).attr("y", labelY + i * 16).text(ln.text);
  });
}

function setHover(code) {
  if (vizState.selectedCode) return;
  vizState.gStates.selectAll("path.state")
    .classed("is-hovered", function () { return this.dataset.code === code; });
}

// ============================================================
// 5. Focus / zoom
// ============================================================
function zoomToState(code) {
  const feature = vizState.geo.features.find(f => f.properties.code === code);
  const [[x0, y0], [x1, y1]] = vizState.path.bounds(feature);
  const w = x1 - x0, h = y1 - y0;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const k = Math.min(8, 0.7 / Math.max(w / MAP_W, h / MAP_H));
  const tx = MAP_W / 2 - k * cx;
  const ty = MAP_H / 2 - k * cy;
  vizState.svg.transition().duration(750)
    .call(vizState.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
}

function selectState(code) {
  if (vizState.isPlaying) stopPlay();
  vizState.selectedCode = code;
  vizState.compareSet.clear();

  showSingleMap(code);

  vizState.gStates.selectAll("path.state")
    .classed("is-selected", d => d.properties.code === code)
    .classed("is-faded", d => d.properties.code !== code)
    .classed("is-hovered", false);

  drawNTAnnotation();
  document.getElementById("reset-btn").hidden = false;

  const bar = document.getElementById("map-compare-bar");
  bar.hidden = false;
  renderCompareChips(code);
  openDetailCard(code);
}

function resetView() {
  if (!vizState.selectedCode) return;
  vizState.selectedCode = null;
  vizState.compareSet.clear();

  document.getElementById("compare-holder").hidden = true;
  document.getElementById("map-holder").hidden = false;
  vizState.svg.transition().duration(600)
    .call(vizState.zoom.transform, d3.zoomIdentity);

  vizState.gStates.selectAll("path.state")
    .classed("is-selected", false)
    .classed("is-faded", false);

  drawNTAnnotation();
  document.getElementById("reset-btn").hidden = true;
  document.getElementById("map-compare-bar").hidden = true;
  closeDetailCard();
}

function showSingleMap(code) {
  document.getElementById("compare-holder").hidden = true;
  document.getElementById("map-holder").hidden = false;
  zoomToState(code);
}

function showCompareStrip() {
  document.getElementById("map-holder").hidden = true;
  const ch = document.getElementById("compare-holder");
  ch.hidden = false;
  renderCompareStrip();
}

// ============================================================
// 6. Compare strip
// ============================================================
function renderCompareChips(focusCode) {
  const wrap = d3.select("#compare-chips");
  wrap.selectAll("*").remove();
  STATE_CODES.filter(c => c !== focusCode).forEach(code => {
    const on = vizState.compareSet.has(code);
    wrap.append("button")
      .attr("type", "button")
      .attr("class", "compare-chip" + (on ? " is-on" : ""))
      .attr("aria-pressed", on ? "true" : "false")
      .text(code)
      .on("click", () => toggleCompare(focusCode, code));
  });
}

function toggleCompare(focusCode, code) {
  if (vizState.compareSet.has(code)) vizState.compareSet.delete(code);
  else vizState.compareSet.add(code);

  renderCompareChips(focusCode);

  if (vizState.compareSet.size > 0) showCompareStrip();
  else showSingleMap(focusCode);
}

function renderCompareStrip() {
  const host = d3.select("#compare-holder");
  host.selectAll("*").remove();

  const codes = [vizState.selectedCode, ...vizState.compareSet];
  codes.forEach(code => {
    const isFocus = code === vizState.selectedCode;
    const panel = host.append("div")
      .attr("class", "cmp-panel" + (isFocus ? " is-focus" : ""))
      .attr("data-code", code);

    const f = vizState.geo.features.find(x => x.properties.code === code);
    const cw = 200, chh = 200;
    const proj = d3.geoIdentity().reflectY(true).fitSize([cw, chh - 6], f);
    const path = d3.geoPath(proj);
    const svg = panel.append("svg")
      .attr("class", "cmp-shape")
      .attr("viewBox", `0 0 ${cw} ${chh}`)
      .attr("preserveAspectRatio", "xMidYMid meet");
    svg.append("path")
      .attr("d", path(f))
      .attr("fill", fillFor(code))
      .attr("stroke", "#fff").attr("stroke-width", 1);

    panel.append("div").attr("class", "cmp-code").text(FULL_NAME[code]);
    panel.append("div").attr("class", "cmp-rate");
    panel.append("div").attr("class", "cmp-mult");

    if (!isFocus) {
      panel.style("cursor", "pointer")
        .attr("title", "Click to remove")
        .on("click", () => toggleCompare(vizState.selectedCode, code));
    }
  });

  refreshCompareStripValues();
}

function refreshCompareStripValues() {
  const yr = vizState.currentYear;
  const natl = vizState.sliceNationalByYear.get(yr);
  d3.selectAll("#compare-holder .cmp-panel").each(function () {
    const code = this.dataset.code;
    const rate = sliceRate(code, yr);
    const sel = d3.select(this);
    sel.select(".cmp-shape path").transition().duration(TRANS_MS).attr("fill", fillFor(code));
    if (rate == null || !natl) {
      sel.select(".cmp-rate").html(`— <span>/100k</span>`);
      sel.select(".cmp-mult").text("");
      return;
    }
    const mult = rate / natl;
    sel.select(".cmp-rate").html(`${rate.toFixed(1)} <span>/100k</span>`);
    sel.select(".cmp-mult")
      .text(`${mult.toFixed(2)}× avg`)
      .classed("is-up", mult >= 1).classed("is-down", mult < 1);
  });
}

// ============================================================
// 7. Detail card (focused state vs national average)
// ============================================================
function openDetailCard(code) {
  document.getElementById("detail-card").hidden = false;
  document.querySelector(".stage-row").classList.add("has-detail");
  renderDetailCard(code);
}

function closeDetailCard() {
  document.getElementById("detail-card").hidden = true;
  document.querySelector(".stage-row").classList.remove("has-detail");
}

function renderDetailCard(code) {
  const body = document.getElementById("detail-body");
  body.innerHTML = `
    <p class="detail-eyebrow">Focused state · <span id="dc-year"></span></p>
    <h2 class="detail-title">${FULL_NAME[code]}</h2>
    <p class="detail-sub" id="dc-sub">Hospitalised road-crash injuries per 100,000 people</p>

    <div class="detail-stats">
      <div class="stat"><div class="stat-k">Rate</div><div class="stat-v is-accent" id="dc-rate"></div></div>
      <div class="stat"><div class="stat-k">Rank (of 8)</div><div class="stat-v" id="dc-rank"></div></div>
      <div class="stat"><div class="stat-k">vs national avg</div><div class="stat-v" id="dc-delta"></div></div>
      <div class="stat"><div class="stat-k">Hospitalisations</div><div class="stat-v" id="dc-cases"></div></div>
    </div>

    <p class="detail-chart-title">A decade vs the national average · <span class="detail-hint">hover to explore</span></p>
    <div class="detail-chart" id="detail-chart"></div>

    <section class="breakdown">
      <p class="detail-chart-title">Who's getting hurt · <span class="detail-hint">click a bar to filter the map</span></p>
      <div class="bd-tabs" role="tablist">
        <button class="bd-tab" data-bd="age"      role="tab">Age</button>
        <button class="bd-tab" data-bd="sex"      role="tab">Sex</button>
        <button class="bd-tab" data-bd="roaduser" role="tab">Road user</button>
      </div>
      <div id="bd-chart" class="bd-chart"></div>
    </section>
  `;
  document.querySelectorAll(".bd-tab").forEach(t => {
    t.addEventListener("click", () => {
      vizState.breakdownTab = t.dataset.bd;
      document.querySelectorAll(".bd-tab").forEach(x =>
        x.classList.toggle("is-active", x.dataset.bd === vizState.breakdownTab));
      renderBreakdown(code, vizState.currentYear, vizState.breakdownTab);
    });
  });
  document.querySelectorAll(".bd-tab").forEach(x =>
    x.classList.toggle("is-active", x.dataset.bd === vizState.breakdownTab));

  renderDetailChart(code);
  updateDetailForYear(code, vizState.currentYear);
  renderBreakdown(code, vizState.currentYear, vizState.breakdownTab);
}

function updateDetailForYear(code, year) {
  const rate = sliceRate(code, year);
  const natl = vizState.sliceNationalByYear.get(year);
  const cases = sliceCases(code, year);

  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  set("dc-year", year);
  if (rate == null || natl == null) {
    set("dc-rate", "—");
    set("dc-rank", "—");
    set("dc-cases", "—");
    const dEl = document.getElementById("dc-delta");
    if (dEl) { dEl.textContent = "—"; dEl.className = "stat-v"; }
  } else {
    const delta = rate - natl;
    const mult = rate / natl;
    const rank = STATE_CODES
      .map(c => ({ c, v: sliceRate(c, year) ?? -Infinity }))
      .sort((a, b) => d3.descending(a.v, b.v))
      .findIndex(d => d.c === code) + 1;
    set("dc-rate", rate.toFixed(1));
    set("dc-rank", `#${rank}`);
    set("dc-cases", (cases ?? 0).toLocaleString());
    const dEl = document.getElementById("dc-delta");
    if (dEl) {
      dEl.textContent = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} (${mult.toFixed(2)}×)`;
      dEl.className = "stat-v " + (delta >= 0 ? "is-up" : "is-down");
    }
  }

  // Sub-label reflects current slice.
  const sub = document.getElementById("dc-sub");
  if (sub) sub.textContent = sliceCaptionText();

  const dc = vizState.detailChart;
  if (dc && dc.code === code && rate != null && natl != null) {
    const xc = dc.x(year);
    dc.cursor.attr("x1", xc).attr("x2", xc);
    dc.dotState.attr("cx", xc).attr("cy", dc.y(rate));
    dc.dotAvg.attr("cx", xc).attr("cy", dc.y(natl));
  }
}

function renderDetailChart(code) {
  const mount = d3.select("#detail-chart");
  mount.selectAll("*").remove();

  const W = 380, H = 220;
  const margin = { top: 16, right: 16, bottom: 26, left: 36 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const svg = mount.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "img")
    .attr("aria-label", `${FULL_NAME[code]} rate vs national average, 2011 to 2021.`);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  // Build series under the active filter (rate-per-100k each year).
  const stateSeries = [];
  const natlPts = [];
  for (let yr = YEAR_MIN; yr <= YEAR_MAX; yr++) {
    stateSeries.push({ year: yr, value: sliceRate(code, yr) });
    natlPts.push({ year: yr, value: vizState.sliceNationalByYear.get(yr) });
  }

  const x = d3.scaleLinear().domain([YEAR_MIN, YEAR_MAX]).range([0, innerW]);
  const yMax = Math.max(
    d3.max(stateSeries, d => d.value) ?? 1,
    d3.max(natlPts, d => d.value) ?? 1
  ) * 1.1;
  const y = d3.scaleLinear().domain([0, yMax || 1]).range([innerH, 0]).nice();

  g.append("g").attr("class", "dc-grid")
    .call(d3.axisLeft(y).ticks(4).tickSize(-innerW).tickFormat(""));
  g.append("g").attr("class", "dc-axis")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")));
  g.append("g").attr("class", "dc-axis").call(d3.axisLeft(y).ticks(4));

  const validState = stateSeries.filter(d => d.value != null);
  const validNatl  = natlPts.filter(d => d.value != null);

  if (validState.length && validNatl.length) {
    const area = d3.area()
      .defined((d, i) => d.value != null && natlPts[i].value != null)
      .x(d => x(d.year))
      .y0((d, i) => y(natlPts[i].value))
      .y1(d => y(d.value));
    g.append("path").attr("class", "dc-area").attr("d", area(stateSeries));
  }

  const lineState = d3.line().defined(d => d.value != null).x(d => x(d.year)).y(d => y(d.value));
  const lineAvg   = d3.line().defined(d => d.value != null).x(d => x(d.year)).y(d => y(d.value));
  g.append("path").attr("class", "dc-avg-line").attr("d", lineAvg(natlPts));
  g.append("path").attr("class", "dc-state-line").attr("d", lineState(stateSeries));

  const cursor = g.append("line").attr("class", "dc-cursor").attr("y1", 0).attr("y2", innerH);
  const dotAvg = g.append("circle").attr("class", "dc-dot-avg").attr("r", 3.5);
  const dotState = g.append("circle").attr("class", "dc-dot-state").attr("r", 4);

  const leg = g.append("g").attr("class", "dc-legend").attr("transform", "translate(0,-4)");
  leg.append("text").attr("class", "dc-leg-state").attr("x", 0).attr("y", 0).text(code);
  leg.append("text").attr("class", "dc-leg-avg").attr("x", 34).attr("y", 0).text("— National avg");

  vizState.detailChart = { x, y, innerH, cursor, dotState, dotAvg, code };

  g.append("rect")
    .attr("class", "dc-overlay")
    .attr("fill", "transparent")
    .attr("width", innerW).attr("height", innerH)
    .style("cursor", "ew-resize")
    .on("mousemove", function (event) {
      if (vizState.isPlaying) stopPlay();
      const [mx] = d3.pointer(event, this);
      const yr = Math.max(YEAR_MIN, Math.min(YEAR_MAX, Math.round(x.invert(mx))));
      setYear(yr);
    });
}

// ============================================================
// 7b. Breakdown panel (Age / Sex / Road-user composition)
// ============================================================
function categoriesForBd(dim) {
  return dim === "age" ? AGE_ORDER : dim === "sex" ? SEX_ORDER : ROAD_ORDER;
}
function indexForBd(dim) {
  return dim === "age" ? vizState.ageIdx : dim === "sex" ? vizState.sexIdx : vizState.roadIdx;
}
function dimAsFilter(dim) {
  return dim === "age" ? "age" : dim === "sex" ? "sex" : "roaduser";
}

function renderBreakdown(code, year, dim) {
  const mount = d3.select("#bd-chart");
  mount.selectAll("*").remove();

  const cats = categoriesForBd(dim);
  const idx = indexForBd(dim);
  const cell = idx.get(year)?.get(code);
  if (!cell) { mount.append("p").attr("class", "bd-empty").text("No data for this slice."); return; }

  const data = cats.map(c => ({ cat: c, cases: cell.get(c) ?? 0 }));
  const total = d3.sum(data, d => d.cases);
  if (total === 0) { mount.append("p").attr("class", "bd-empty").text("No data for this slice."); return; }

  const W = 380, rowH = 28, padTop = 4, padBottom = 6;
  const labelW = dim === "roaduser" ? 110 : (dim === "age" ? 60 : 60);
  const valW = 62;
  const barX = labelW + 6;
  const barMaxW = W - barX - valW - 8;
  const H = padTop + padBottom + cats.length * rowH;

  const svg = mount.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "img")
    .attr("aria-label", `${FULL_NAME[code]} breakdown by ${DIM_LABEL[dim]} in ${year}.`);

  const max = d3.max(data, d => d.cases) || 1;
  const x = d3.scaleLinear().domain([0, max]).range([0, barMaxW]);

  const rows = svg.selectAll("g.bd-row").data(data).join("g")
    .attr("class", d => "bd-row" + (d.cat === "Other or unknown" ? " is-muted" : ""))
    .attr("transform", (d, i) => `translate(0, ${padTop + i * rowH})`)
    .style("cursor", "pointer")
    .attr("title", `Click to filter the map by ${dim}: ${d => d.cat}`)
    .on("click", (event, d) => setFilter(dimAsFilter(dim), d.cat));

  rows.append("text").attr("class", "bd-label")
    .attr("x", labelW).attr("y", rowH / 2).attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .text(d => d.cat);

  rows.append("rect").attr("class", "bd-bar-bg")
    .attr("x", barX).attr("y", 5)
    .attr("width", barMaxW).attr("height", rowH - 12)
    .attr("rx", 3);

  rows.append("rect").attr("class", "bd-bar")
    .attr("x", barX).attr("y", 5)
    .attr("width", 0).attr("height", rowH - 12)
    .attr("rx", 3)
    .transition().duration(TRANS_MS)
    .attr("width", d => x(d.cases));

  rows.append("text").attr("class", "bd-val")
    .attr("x", W - 4).attr("y", rowH / 2).attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .text(d => `${(100 * d.cases / total).toFixed(0)}%`);
}

// ============================================================
// 8. Legend (vertical)
// ============================================================
function drawLegend() {
  const stage = d3.select("#legend-stage");
  stage.selectAll("svg").remove();

  const W = 92, H = 320;
  const padTop = 18, padBottom = 18;
  const innerH = H - padTop - padBottom;
  const barX = 30, barW = 14;

  const svg = stage.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "img").attr("aria-label", "Colour legend.");

  const isDelta = vizState.mode === "delta";
  const scale = isDelta ? vizState.colorDelta : vizState.colorAbs;
  const [d0, d1] = scale.domain();

  const defs = svg.append("defs");
  const grad = defs.append("linearGradient").attr("id", "legend-grad")
    .attr("x1", "0%").attr("y1", "0%").attr("x2", "0%").attr("y2", "100%");
  const STOPS = 32;
  for (let i = 0; i <= STOPS; i++) {
    const t = i / STOPS;
    grad.append("stop").attr("offset", `${t * 100}%`)
      .attr("stop-color", scale(d1 - t * (d1 - d0)));
  }

  svg.append("rect")
    .attr("x", barX).attr("y", padTop)
    .attr("width", barW).attr("height", innerH)
    .attr("rx", 2).attr("fill", "url(#legend-grad)");

  const yScale = d3.scaleLinear().domain([d0, d1]).range([padTop + innerH, padTop]);
  svg.append("g").attr("class", "legend-axis")
    .attr("transform", `translate(${barX + barW},0)`)
    .call(d3.axisRight(yScale).ticks(6).tickSize(4)
      .tickFormat(d => isDelta ? d3.format("+,.1f")(d) : d3.format(",.1f")(d)));

  svg.append("text").attr("class", "legend-title")
    .attr("transform", `translate(14, ${padTop + innerH / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .text(isDelta ? "Deviation from avg / 100k" : "Per 100,000 people");

  if (isDelta) {
    const yz = yScale(0);
    svg.append("line").attr("class", "legend-zero-marker")
      .attr("x1", barX - 2).attr("x2", barX + barW + 2)
      .attr("y1", yz).attr("y2", yz);
    svg.append("text").attr("x", barX - 4).attr("y", yz)
      .attr("text-anchor", "end").attr("dy", "0.32em")
      .attr("font-size", 9).attr("fill", "#1f2933").text("avg");
  }
}

// ============================================================
// 9. Mutators
// ============================================================
function setYear(y, { fromSlider = false } = {}) {
  const clamped = Math.max(YEAR_MIN, Math.min(YEAR_MAX, y));
  if (clamped === vizState.currentYear) return;
  vizState.currentYear = clamped;

  document.getElementById("year-readout").textContent = String(clamped);
  if (!fromSlider) {
    const sl = document.getElementById("year-slider");
    sl.value = String(clamped);
    sl.setAttribute("aria-valuenow", String(clamped));
  }

  refreshMap();
  if (vizState.selectedCode) {
    updateDetailForYear(vizState.selectedCode, clamped);
    refreshCompareStripValues();
    renderBreakdown(vizState.selectedCode, clamped, vizState.breakdownTab);
  }
}

function setMode(mode) {
  if (mode === vizState.mode) return;
  vizState.mode = mode;
  document.querySelectorAll(".seg-btn").forEach(b => {
    const active = b.dataset.mode === mode;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-checked", active ? "true" : "false");
  });
  refreshMap();
  drawLegend();
  if (vizState.selectedCode) refreshCompareStripValues();
}

function sliceCaptionText() {
  const f = vizState.filter;
  if (f.dim === "all") return "Hospitalised road-crash injuries per 100,000 people — all people";
  const label = f.dim === "sex" ? `sex: ${f.value}`
              : f.dim === "age" ? `age band: ${f.value}`
              : `road user: ${f.value}`;
  return `Hospitalised road-crash injuries per 100,000 (total state pop) — ${label}`;
}

function updateFilterCaption() {
  const cap = document.getElementById("filter-caption");
  if (cap) cap.textContent = sliceCaptionText();
}

function populateDimValues(dim) {
  const wrap = document.getElementById("dim-value-wrap");
  const sel = document.getElementById("dim-value");
  if (dim === "all") {
    wrap.hidden = true;
    sel.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  const cats = dim === "sex" ? SEX_ORDER : dim === "age" ? AGE_ORDER : ROAD_ORDER;
  sel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join("");
}

function setFilter(dim, value) {
  if (dim === "all") {
    vizState.filter = { dim: "all", value: null };
  } else {
    const cats = dim === "sex" ? SEX_ORDER : dim === "age" ? AGE_ORDER : ROAD_ORDER;
    const v = value && cats.includes(value) ? value : cats[0];
    vizState.filter = { dim, value: v };
  }

  // Sync UI controls.
  document.querySelectorAll(".dim-btn").forEach(b => {
    const active = b.dataset.dim === vizState.filter.dim;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-checked", active ? "true" : "false");
  });
  populateDimValues(vizState.filter.dim);
  if (vizState.filter.dim !== "all") {
    document.getElementById("dim-value").value = vizState.filter.value;
  }
  updateFilterCaption();

  // Recompute everything that depends on the slice.
  rebuildScalesForFilter();
  refreshMap();
  drawLegend();
  if (vizState.selectedCode) {
    updateDetailForYear(vizState.selectedCode, vizState.currentYear);
    refreshCompareStripValues();
    // Re-render the trend chart because the y-domain & series change.
    renderDetailChart(vizState.selectedCode);
    updateDetailForYear(vizState.selectedCode, vizState.currentYear);
    renderBreakdown(vizState.selectedCode, vizState.currentYear, vizState.breakdownTab);
  }
}

// ============================================================
// 10. Controls
// ============================================================
function wireSlider() {
  const sl = document.getElementById("year-slider");
  sl.addEventListener("input", (e) => {
    if (vizState.isPlaying) stopPlay();
    setYear(+e.target.value, { fromSlider: true });
    sl.setAttribute("aria-valuenow", e.target.value);
  });
}

function wirePlayPause() {
  document.getElementById("play-btn")
    .addEventListener("click", () => vizState.isPlaying ? stopPlay() : startPlay());
}

function startPlay() {
  if (vizState.isPlaying) return;
  if (vizState.timer) { vizState.timer.stop(); vizState.timer = null; }
  vizState.isPlaying = true;
  const btn = document.getElementById("play-btn");
  btn.setAttribute("aria-pressed", "true");
  btn.querySelector(".play-glyph").textContent = "❚❚";
  btn.querySelector(".play-label").textContent = "Pause";
  if (vizState.currentYear >= YEAR_MAX) setYear(YEAR_MIN);
  vizState.timer = d3.interval(() => {
    const next = vizState.currentYear + 1;
    setYear(next > YEAR_MAX ? YEAR_MIN : next);
  }, vizState.speedMs);
}

function stopPlay() {
  if (!vizState.isPlaying) return;
  vizState.isPlaying = false;
  if (vizState.timer) { vizState.timer.stop(); vizState.timer = null; }
  const btn = document.getElementById("play-btn");
  btn.setAttribute("aria-pressed", "false");
  btn.querySelector(".play-glyph").textContent = "▶";
  btn.querySelector(".play-label").textContent = "Play";
}

function wireSpeed() {
  document.getElementById("speed-select").addEventListener("change", (e) => {
    vizState.speedMs = +e.target.value;
    if (vizState.isPlaying) { stopPlay(); startPlay(); }
  });
}

function wireMode() {
  document.querySelectorAll(".seg-btn").forEach(btn => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });
}

function wireFilterBar() {
  document.querySelectorAll(".dim-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const dim = btn.dataset.dim;
      const cats = dim === "sex" ? SEX_ORDER : dim === "age" ? AGE_ORDER : ROAD_ORDER;
      const value = dim === "all" ? null : cats[0];
      setFilter(dim, value);
    });
  });
  document.getElementById("dim-value").addEventListener("change", (e) => {
    setFilter(vizState.filter.dim, e.target.value);
  });
}

function wireResetButton() {
  document.getElementById("reset-btn").addEventListener("click", () => resetView());
  document.getElementById("detail-close").addEventListener("click", () => resetView());
}

// GenAI-assisted (Claude): keyboard parity.
function wireKeyboard() {
  window.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea") return;
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      vizState.isPlaying ? stopPlay() : startPlay();
    } else if (e.key === "ArrowRight") {
      if (vizState.isPlaying) stopPlay();
      const n = vizState.currentYear + 1; setYear(n > YEAR_MAX ? YEAR_MIN : n);
    } else if (e.key === "ArrowLeft") {
      if (vizState.isPlaying) stopPlay();
      const p = vizState.currentYear - 1; setYear(p < YEAR_MIN ? YEAR_MAX : p);
    } else if (e.key === "Home") {
      if (vizState.isPlaying) stopPlay(); setYear(YEAR_MIN);
    } else if (e.key === "End") {
      if (vizState.isPlaying) stopPlay(); setYear(YEAR_MAX);
    } else if (e.key === "Escape") {
      resetView();
    }
  });
}

// ============================================================
// 11. Resize + bootstrap
// ============================================================
function handleResize() {
  let scheduled = false;
  window.addEventListener("resize", () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      buildProjection(vizState.geo, MAP_W, MAP_H);
      vizState.gStates.selectAll("path.state").attr("d", vizState.path);
      drawNTAnnotation();
    });
  });
}

loadData()
  .then(([rows, geo, ageRows, sexRows, roadRows, popRows]) => {
    vizState.rows = rows;
    vizState.geo  = geo;
    const { byYear, byState } = indexData(rows);
    vizState.byYear = byYear;
    vizState.byState = byState;
    vizState.nationalByYear = computeNationalAverages(byYear);

    vizState.ageIdx  = indexDemographic(ageRows,  "age_group");
    vizState.sexIdx  = indexDemographic(sexRows,  "sex");
    vizState.roadIdx = indexDemographic(roadRows, "road_user");
    vizState.popIdx  = indexPopulation(popRows);

    console.log("CSV rows:", rows.length, "(expected 88)");
    console.log("GeoJSON features:", geo.features.length, "(expected 8)");
    console.log("Age rows:", ageRows.length, "| Sex rows:", sexRows.length, "| Road-user rows:", roadRows.length);

    // Initial slice = "all" → matches map_classic exactly.
    rebuildScalesForFilter();
    buildProjection(geo, MAP_W, MAP_H);

    drawMap();
    drawLegend();
    updateFilterCaption();

    wireFilterBar();
    wireSlider();
    wirePlayPause();
    wireSpeed();
    wireMode();
    wireResetButton();
    wireKeyboard();
    handleResize();
  })
  .catch(err => {
    console.error("Data load failed:", err);
    showError(
      "Couldn't load the data. If you opened this file directly, run it via " +
      "a local web server (e.g. `python -m http.server`) and reload."
    );
  });
