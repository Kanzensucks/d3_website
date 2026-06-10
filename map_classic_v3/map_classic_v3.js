/* =============================================================
   map_classic_v3.js — editorial redesign (T1–T18).

   Thesis: "The NT's road-crash hospitalisation rate runs above
   the national average every year across 2011–2021, up to 2.2×
   in the worst years."

   Changes vs v2:
     T1  Single slicer (no detail-card tabs)
     T2  Compare propagates to decade chart + breakdown bars + stats
     T3  Live narrative H2 driven by data
     T5  Opens at 2021
     T6  NT affordance pulse + hint tooltip (sessionStorage gated)
     T9  Filter caption crossfade
     T10 Legend pulse + range chip on domain rebase
     T11 Caveat ribbon when stratifying
     T12 Persistent NT ref line on non-NT state charts
     T13 "NT story ↑" pill on non-NT focus
   (T4/T7/T8/T14/T15/T16/T17/T18 are CSS/HTML only)

   COS30045 · Team 1 · Hamish Hooley & Kanzen Ong.
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
  NSW: "New South Wales", Vic: "Victoria",       Qld: "Queensland",
  SA:  "South Australia", WA:  "Western Australia", Tas: "Tasmania",
  NT:  "Northern Territory", ACT: "Australian Capital Territory",
};

const AGE_ORDER  = ["0-7", "8-16", "17-25", "26-39", "40-64", "65-74", "75+"];
const SEX_ORDER  = ["Female", "Male"];
const ROAD_ORDER = ["Pedestrian", "Pedal cyclist", "Motorcyclist", "Bus occupant", "Other or unknown"];

const DIM_LABEL = {
  all: "All people", sex: "sex", age: "age band", roaduser: "road-user role"
};

// T5: default year = YEAR_MAX (2021 — strongest NT thesis year)
const vizState = {
  rows: [], geo: null,
  byYear: new Map(), byState: new Map(), nationalByYear: new Map(),
  ageIdx: new Map(), sexIdx: new Map(), roadIdx: new Map(),
  popIdx: new Map(),
  rateExtent: [0, 1], deltaExtent: [-1, 1],
  colorAbs: null, colorDelta: null,
  projection: null, path: null,
  zoom: null,
  currentYear: YEAR_MAX,          // T5
  mode: "absolute",
  isPlaying: false, timer: null, speedMs: 1100,
  selectedCode: null,
  compareSet: new Set(),
  filter: { dim: "all", value: null },
  sliceNationalByYear: new Map(),
  detailChart: null,
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
function sliceCases(state, year, filter) {
  filter = filter || vizState.filter;
  if (filter.dim === "all") {
    const row = vizState.byYear.get(year)?.get(state);
    return row ? row.cases : null;
  }
  const idx = filter.dim === "sex"  ? vizState.sexIdx
            : filter.dim === "age"  ? vizState.ageIdx
            :                         vizState.roadIdx;
  const v = idx.get(year)?.get(state)?.get(filter.value);
  return v == null ? null : v;
}

function sliceRate(state, year, filter) {
  filter = filter || vizState.filter;
  if (filter.dim === "all") {
    const row = vizState.byYear.get(year)?.get(state);
    return row ? row.cases_per_100k : null;
  }
  const cases = sliceCases(state, year, filter);
  const pop   = vizState.popIdx.get(year)?.get(state);
  if (cases == null || !pop) return null;
  return (cases / pop) * 100000;
}

function computeSliceNationalAverages(filter) {
  filter = filter || vizState.filter;
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
  const rates = [], deltas = [];
  for (let yr = YEAR_MIN; yr <= YEAR_MAX; yr++) {
    const natl = vizState.sliceNationalByYear.get(yr);
    for (const code of STATE_CODES) {
      const r = sliceRate(code, yr);
      if (r == null || !isFinite(r)) continue;
      rates.push(r);
      if (natl != null) deltas.push(r - natl);
    }
  }
  const rmin = d3.min(rates) ?? 0, rmax = d3.max(rates) ?? 1;
  vizState.rateExtent = [rmin, rmax];
  vizState.colorAbs = d3.scaleSequential(d3.interpolateYlOrRd).domain([rmin, rmax]);
  const m = Math.max(Math.abs(d3.min(deltas) ?? 0), Math.abs(d3.max(deltas) ?? 0)) || 1;
  vizState.deltaExtent = [-m, m];
  vizState.colorDelta  = d3.scaleSequential(t => d3.interpolateRdYlBu(1 - t)).domain([-m, m]);
}

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

// T10: pulse legend border when domain rebases + update range chip
function rebuildScalesForFilter() {
  vizState.sliceNationalByYear = computeSliceNationalAverages();
  buildColorScalesForFilter();

  // T10: visual cue that the scale domain changed
  const legendEl = document.getElementById("legend-stage");
  if (legendEl) {
    legendEl.classList.remove("is-rebasing");
    void legendEl.offsetWidth; // reflow to restart animation
    legendEl.classList.add("is-rebasing");
    setTimeout(() => legendEl.classList.remove("is-rebasing"), 700);
  }

  // T10: update range chip
  updateLegendRangeChip();
}

function updateLegendRangeChip() {
  const chip = document.getElementById("legend-range-chip");
  if (!chip) return;
  const isDelta = vizState.mode === "delta";
  const [d0, d1] = isDelta ? vizState.deltaExtent : vizState.rateExtent;
  if (isDelta) {
    chip.textContent = `Scale: ${d3.format("+.0f")(d0)}–${d3.format("+.0f")(d1)} /100k`;
  } else {
    chip.textContent = `Scale: ${d0.toFixed(0)}–${d1.toFixed(0)} /100k`;
  }
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

  // Transparent — sea-blue now comes from .map-main background (CSS)
  svg.append("rect")
    .attr("class", "map-bg")
    .attr("width", MAP_W).attr("height", MAP_H)
    .attr("fill", "transparent")
    .on("click", () => { resetView(); hideMapTooltip(); });

  const gZoom   = svg.append("g").attr("class", "zoom-layer");
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
        try {
          const len = this.getTotalLength();
          d3.select(this)
            .attr("stroke-dasharray", `${len} ${len}`)
            .attr("stroke-dashoffset", len)
            .transition().duration(900).delay(100)
            .attr("stroke-dashoffset", 0)
            .on("end", () => d3.select(this).attr("stroke-dasharray", null));
        } catch (e) {}
      })
      .on("click", function (event, d) {
        event.stopPropagation();
        dismissHint();
        hideMapTooltip();
        selectState(d.properties.code);
      })
      .on("mouseover.coord", function (event, d) {
        setHover(d.properties.code);
        showMapTooltip(event, d.properties.code);
      })
      .on("mousemove.tooltip", function (event, d) {
        showMapTooltip(event, d.properties.code);
      })
      .on("mouseout.coord", function () {
        setHover(null);
        hideMapTooltip();
      });

  vizState.svg    = svg;
  vizState.gZoom  = gZoom;
  vizState.gStates = gStates;
  vizState.gAnnot  = gAnnot;

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

  // T6: affordance pulse + hint tooltip on first visit
  showHintIfNeeded();
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

  g.append("polyline").attr("class", "nt-leader")
    .attr("points", `${cx},${cy} ${elbowX},${cy} ${elbowX},${labelY} ${labelX - 8},${labelY}`);
  g.append("circle").attr("class", "nt-leader-dot").attr("cx", cx).attr("cy", cy).attr("r", 3);

  const lines = [
    { text: "Northern Territory", cls: "nt-annotation-text" },
    { text: `${vizState.currentYear} rate: ${ntRate.toFixed(1)} / 100k`, cls: "nt-annotation-sub" },
    { text: `${mult}× the national average`, cls: "nt-annotation-emph" },
  ];
  const longest = lines.reduce((a, b) => a.text.length >= b.text.length ? a : b).text;
  const boxW = Math.max(180, longest.length * 6.6 + 20);
  const boxH = lines.length * 16 + 18;
  g.append("rect").attr("class", "nt-annotation-box")
    .attr("x", labelX - 10).attr("y", labelY - 20)
    .attr("rx", 6).attr("ry", 6).attr("width", boxW).attr("height", boxH);
  lines.forEach((ln, i) =>
    g.append("text").attr("class", ln.cls)
      .attr("x", labelX).attr("y", labelY + i * 16).text(ln.text));
}

function setHover(code) {
  if (vizState.selectedCode) return;
  vizState.gStates.selectAll("path.state")
    .classed("is-hovered", function () { return this.dataset.code === code; });
}

// ============================================================
// T25. Affordance: NT hint sprite + hover tooltip chip
// ============================================================
// GenAI-assisted (Claude): sprite bounce + cursor-follow tooltip.
function showHintIfNeeded() {
  if (sessionStorage.getItem("hinted")) return;

  const ntFeature = vizState.geo.features.find(f => f.properties.code === "NT");
  if (!ntFeature) return;
  const [cx, cy] = vizState.path.centroid(ntFeature);
  // Convert SVG coords to % of holder for responsive positioning
  const pctX = Math.min(((cx / MAP_W) * 100) + 4, 65);
  const pctY = Math.max(((cy / MAP_H) * 100) - 22, 3);

  const mapHolder = document.getElementById("map-holder");
  const sprite = document.createElement("div");
  sprite.id = "nt-hint-sprite";
  sprite.className = "nt-hint-sprite";
  sprite.innerHTML = `<span class="nt-hint-icon">👆</span><span class="nt-hint-label">Click NT to explore</span>`;
  sprite.style.left = `${pctX}%`;
  sprite.style.top  = `${pctY}%`;
  mapHolder.appendChild(sprite);

  const timerRef = setTimeout(dismissHint, 1500);
  vizState._hintTimer = timerRef;
}

function dismissHint() {
  if (sessionStorage.getItem("hinted")) return;
  sessionStorage.setItem("hinted", "1");
  if (vizState._hintTimer) { clearTimeout(vizState._hintTimer); vizState._hintTimer = null; }
  const sprite = document.getElementById("nt-hint-sprite");
  if (sprite) { sprite.style.opacity = "0"; setTimeout(() => sprite.remove(), 420); }
}

// T25: hover tooltip chip that follows cursor over the map
function showMapTooltip(event, code) {
  if (vizState.selectedCode) return; // don't show while a state is focused
  const rate = sliceRate(code, vizState.currentYear);
  const tip  = document.getElementById("map-tooltip");
  if (!tip || rate == null) return;
  tip.innerHTML = `<strong>${FULL_NAME[code]}</strong><span class="tip-rate">${rate.toFixed(1)}<small style="font-size:0.7em;font-weight:400"> /100k</small></span><span class="tip-hint">click to focus →</span>`;
  // Position relative to map-holder
  const holder = document.getElementById("map-holder");
  const rect   = holder.getBoundingClientRect();
  let left = event.clientX - rect.left + 14;
  let top  = event.clientY - rect.top  - 10;
  // Keep within bounds
  if (left + 200 > rect.width)  left = event.clientX - rect.left - 190;
  if (top  + 80  > rect.height) top  = event.clientY - rect.top  - 75;
  tip.style.left  = `${left}px`;
  tip.style.top   = `${top}px`;
  tip.hidden = false;
}

function hideMapTooltip() {
  const tip = document.getElementById("map-tooltip");
  if (tip) tip.hidden = true;
}

// ============================================================
// 5. Focus / zoom
// ============================================================
// GenAI-assisted (Claude): zoom the main map to frame a feature's bounds.
function zoomToState(code) {
  const feature = vizState.geo.features.find(f => f.properties.code === code);
  const [[x0, y0], [x1, y1]] = vizState.path.bounds(feature);
  const w = x1 - x0, h = y1 - y0;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const k  = Math.min(8, 0.7 / Math.max(w / MAP_W, h / MAP_H));
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
    .classed("is-faded",    d => d.properties.code !== code)
    .classed("is-hovered",  false);

  drawNTAnnotation();
  document.getElementById("reset-btn").hidden = false;

  // T13: show NT pill when a non-NT state is focused
  const ntPill = document.getElementById("nt-pill");
  if (ntPill) ntPill.hidden = (code === "NT");

  // T25: hide "click to focus" hint once focused
  const hintEl = document.getElementById("caption-hint");
  if (hintEl) hintEl.hidden = true;

  document.getElementById("map-compare-bar").hidden = false;
  renderCompareChips(code);
  openDetailCard(code);
  updateNarrativeH2();
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
    .classed("is-faded",    false);

  drawNTAnnotation();
  document.getElementById("reset-btn").hidden = true;
  document.getElementById("map-compare-bar").hidden = true;
  // Restore sea-blue on reset
  document.querySelector(".map-main")?.classList.remove("is-focused");

  // T13: hide NT pill on reset
  const ntPill = document.getElementById("nt-pill");
  if (ntPill) ntPill.hidden = true;

  // T25: restore "click to focus" hint
  const hintEl = document.getElementById("caption-hint");
  if (hintEl) hintEl.hidden = false;

  closeDetailCard();
  updateNarrativeH2();
}

function showSingleMap(code) {
  document.getElementById("compare-holder").hidden = true;
  document.getElementById("map-holder").hidden = false;
  // Remove sea-blue in single-state focus — state floats on white
  document.querySelector(".map-main")?.classList.add("is-focused");
  zoomToState(code);
}

function showCompareStrip() {
  document.getElementById("map-holder").hidden = true;
  document.getElementById("compare-holder").hidden = false;
  // No blue in compare mode either — consistent with single-state focus
  document.querySelector(".map-main")?.classList.add("is-focused");
  renderCompareStrip();
}

// ============================================================
// 6. Compare strip (side-by-side shapes)
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

  // T2: re-render decade chart to add/remove compare lines
  if (vizState.selectedCode) {
    renderDetailChart(vizState.selectedCode);
    updateDetailForYear(vizState.selectedCode, vizState.currentYear);
    renderBreakdown(vizState.selectedCode, vizState.currentYear);
  }
  updateNarrativeH2();
}

// Rate-bar compare strip — fills the map area height, no dead space
function renderCompareStrip() {
  const host = d3.select("#compare-holder");
  host.selectAll("*").remove();

  const codes = [vizState.selectedCode, ...vizState.compareSet];

  codes.forEach(code => {
    const isFocus = code === vizState.selectedCode;
    const panel   = host.append("div")
      .attr("class", "cmp-panel" + (isFocus ? " is-focus" : ""))
      .attr("data-code", code);

    panel.append("div").attr("class", "cmp-code").text(FULL_NAME[code]);

    // Bar row: coloured rate bar + rate number
    const barRow = panel.append("div").attr("class", "cmp-bar-row");
    barRow.append("div").attr("class", "cmp-bar-track")
      .append("div").attr("class", "cmp-bar").style("width", "0%");
    barRow.append("div").attr("class", "cmp-rate");

    panel.append("div").attr("class", "cmp-mult");

    if (!isFocus) {
      panel.attr("title", "Click to remove")
        .on("click", () => toggleCompare(vizState.selectedCode, code));
    }
  });

  refreshCompareStripValues();
}

function refreshCompareStripValues() {
  const yr    = vizState.currentYear;
  const natl  = vizState.sliceNationalByYear.get(yr);
  const codes = [vizState.selectedCode, ...vizState.compareSet];

  // Max rate among all compared states — bar widths are relative to this
  const rates = codes.map(c => sliceRate(c, yr) ?? 0);
  const maxRate = Math.max(...rates, 1);

  d3.selectAll("#compare-holder .cmp-panel").each(function () {
    const code = this.dataset.code;
    const rate = sliceRate(code, yr);
    const sel  = d3.select(this);

    if (rate == null || !natl) {
      sel.select(".cmp-bar").style("width", "0%").style("background", "#ccc");
      sel.select(".cmp-rate").html(`— <span>/100k</span>`);
      sel.select(".cmp-mult").text("");
      return;
    }

    const pct  = (rate / maxRate * 100).toFixed(1);
    const mult = rate / natl;
    sel.select(".cmp-bar")
      .style("width", `${pct}%`)
      .style("background", fillFor(code));
    sel.select(".cmp-rate").html(`${rate.toFixed(1)} <span>/100k</span>`);
    sel.select(".cmp-mult")
      .text(`${mult.toFixed(2)}× avg`)
      .classed("is-up", mult >= 1).classed("is-down", mult < 1);
  });
}

// ============================================================
// 7. Detail card
// ============================================================
function updateDetailScrollFade() {
  const dc = document.getElementById("detail-card");
  if (!dc || dc.hidden) return;
  const overflow = dc.scrollHeight > dc.clientHeight + 4;
  const atBottom = dc.scrollTop + dc.clientHeight >= dc.scrollHeight - 4;
  dc.classList.toggle("has-overflow", overflow && !atBottom);
}

function openDetailCard(code) {
  const dc = document.getElementById("detail-card");
  dc.hidden = false;
  document.querySelector(".stage-row").classList.add("has-detail");
  renderDetailCard(code);
}

function closeDetailCard() {
  document.getElementById("detail-card").hidden = true;
  document.querySelector(".stage-row").classList.remove("has-detail");
}

function renderDetailCard(code) {
  const body = document.getElementById("detail-body");
  // T1: no breakdown tabs — breakdown is a derived view of the top slicer
  body.innerHTML = `
    <p class="detail-eyebrow">Focused state · <span id="dc-year"></span></p>
    <h2 class="detail-title">${FULL_NAME[code]}</h2>
    <p class="detail-sub" id="dc-sub"></p>

    <div class="detail-stats">
      <div class="stat"><div class="stat-k">Rate</div><div class="stat-v is-accent" id="dc-rate"></div><span class="stat-compare-chip" id="dc-rate-chip"></span></div>
      <div class="stat"><div class="stat-k">Rank (of 8)</div><div class="stat-v" id="dc-rank"></div><span class="stat-compare-chip" id="dc-rank-chip"></span></div>
      <div class="stat"><div class="stat-k">vs national avg</div><div class="stat-v" id="dc-delta"></div><span class="stat-compare-chip" id="dc-delta-chip"></span></div>
      <div class="stat"><div class="stat-k">Hospitalisations</div><div class="stat-v" id="dc-cases"></div><span class="stat-compare-chip" id="dc-cases-chip"></span></div>
    </div>

    <p class="detail-chart-title">A decade vs the national average · <span class="detail-hint">hover to explore</span></p>
    <div class="detail-chart" id="detail-chart"></div>

    <p class="breakdown-title" id="bd-title">Who's getting hurt</p>
    <div class="bd-chart" id="bd-chart"></div>
    <div class="scroll-fade" aria-hidden="true"></div>
  `;

  renderDetailChart(code);
  updateDetailForYear(code, vizState.currentYear);
  renderBreakdown(code, vizState.currentYear);
  updateDetailScrollFade();
}

function updateDetailForYear(code, year) {
  const rate  = sliceRate(code, year);
  const natl  = vizState.sliceNationalByYear.get(year);
  const cases = sliceCases(code, year);

  const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

  setText("dc-year", year);
  // Update sub-label to reflect active slice
  const sub = document.getElementById("dc-sub");
  if (sub) sub.textContent = sliceCaptionText();

  if (rate == null || natl == null) {
    setText("dc-rate", "—"); setText("dc-rank", "—"); setText("dc-cases", "—");
    const dEl = document.getElementById("dc-delta");
    if (dEl) { dEl.textContent = "—"; dEl.className = "stat-v"; }
  } else {
    const delta = rate - natl;
    const mult  = rate / natl;
    const rank  = STATE_CODES
      .map(c => ({ c, v: sliceRate(c, year) ?? -Infinity }))
      .sort((a, b) => d3.descending(a.v, b.v))
      .findIndex(d => d.c === code) + 1;

    setText("dc-rate", rate.toFixed(1));
    setText("dc-rank", `#${rank}`);
    setText("dc-cases", (cases ?? 0).toLocaleString());
    const dEl = document.getElementById("dc-delta");
    if (dEl) {
      dEl.textContent = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} (${mult.toFixed(2)}×)`;
      dEl.className   = "stat-v " + (delta >= 0 ? "is-up" : "is-down");
    }
  }

  // T2: stat compare chips — show Δ vs first compare state if any
  const firstCompare = vizState.compareSet.size > 0 ? [...vizState.compareSet][0] : null;
  if (firstCompare) {
    const cRate  = sliceRate(firstCompare, year);
    const cNatl  = vizState.sliceNationalByYear.get(year);
    const cCases = sliceCases(firstCompare, year);
    const cRank  = STATE_CODES
      .map(c => ({ c, v: sliceRate(c, year) ?? -Infinity }))
      .sort((a, b) => d3.descending(a.v, b.v))
      .findIndex(d => d.c === firstCompare) + 1;

    const setText2 = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    if (cRate != null && rate != null) {
      const d = cRate - rate;
      setText2("dc-rate-chip",  `${firstCompare}: ${cRate.toFixed(1)} (${d >= 0 ? "+" : ""}${d.toFixed(1)})`);
    }
    if (cRank) setText2("dc-rank-chip",  `${firstCompare}: #${cRank}`);
    if (cRate != null && cNatl != null) {
      const cd = cRate - cNatl;
      setText2("dc-delta-chip", `${firstCompare}: ${cd >= 0 ? "+" : ""}${cd.toFixed(1)}`);
    }
    if (cCases != null) setText2("dc-cases-chip", `${firstCompare}: ${cCases.toLocaleString()}`);
  } else {
    ["dc-rate-chip", "dc-rank-chip", "dc-delta-chip", "dc-cases-chip"].forEach(id => setText(id, ""));
  }

  // Update detail chart cursor
  const dc = vizState.detailChart;
  if (dc && dc.code === code && rate != null && natl != null) {
    const xc = dc.x(year);
    dc.cursor.attr("x1", xc).attr("x2", xc);
    dc.dotState.attr("cx", xc).attr("cy", dc.y(rate));
    dc.dotAvg.attr("cx", xc).attr("cy", dc.y(natl));
  }
}

// ============================================================
// T2/T12: Decade line chart with compare lines + NT ref
// ============================================================
function renderDetailChart(code) {
  const mount = d3.select("#detail-chart");
  mount.selectAll("*").remove();

  const W = 380, H = 160;
  const margin = { top: 10, right: 38, bottom: 26, left: 36 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const svg = mount.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "img")
    .attr("aria-label", `${FULL_NAME[code]} rate vs national average 2011–2021.`);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  // Build series for the active filter
  const stateSeries = [];
  const natlPts     = [];
  for (let yr = YEAR_MIN; yr <= YEAR_MAX; yr++) {
    stateSeries.push({ year: yr, value: sliceRate(code, yr) });
    natlPts.push({ year: yr, value: vizState.sliceNationalByYear.get(yr) });
  }

  // T2: compare state series
  const compareSeries = {};
  for (const cc of vizState.compareSet) {
    compareSeries[cc] = [];
    for (let yr = YEAR_MIN; yr <= YEAR_MAX; yr++) {
      compareSeries[cc].push({ year: yr, value: sliceRate(cc, yr) });
    }
  }

  // T12: NT reference series (only when code !== "NT")
  let ntSeries = null;
  if (code !== "NT") {
    ntSeries = [];
    for (let yr = YEAR_MIN; yr <= YEAR_MAX; yr++) {
      ntSeries.push({ year: yr, value: sliceRate("NT", yr) });
    }
  }

  const x = d3.scaleLinear().domain([YEAR_MIN, YEAR_MAX]).range([0, innerW]);

  // y-domain: include state, natl, compare states, NT ref
  const allValues = [
    ...stateSeries.map(d => d.value),
    ...natlPts.map(d => d.value),
    ...Object.values(compareSeries).flat().map(d => d.value),
    ...(ntSeries ? ntSeries.map(d => d.value) : []),
  ].filter(v => v != null && isFinite(v));
  const yMax = (d3.max(allValues) ?? 1) * 1.12;
  const y = d3.scaleLinear().domain([0, yMax]).range([innerH, 0]).nice();

  g.append("g").attr("class", "dc-grid")
    .call(d3.axisLeft(y).ticks(4).tickSize(-innerW).tickFormat(""));
  g.append("g").attr("class", "dc-axis")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")));
  g.append("g").attr("class", "dc-axis").call(d3.axisLeft(y).ticks(4));

  // Area fill between state line and national avg
  const validState = stateSeries.filter(d => d.value != null);
  const validNatl  = natlPts.filter(d => d.value != null);
  if (validState.length && validNatl.length) {
    const area = d3.area()
      .defined((d, i) => d.value != null && natlPts[i]?.value != null)
      .x(d => x(d.year))
      .y0((d, i) => y(natlPts[i].value))
      .y1(d => y(d.value));
    g.append("path").attr("class", "dc-area").attr("d", area(stateSeries));
  }

  // T12: NT reference line (faint, behind everything)
  if (ntSeries) {
    const ntLine = d3.line().defined(d => d.value != null).x(d => x(d.year)).y(d => y(d.value));
    g.append("path").attr("class", "dc-nt-ref").attr("d", ntLine(ntSeries));
    const lastNT = ntSeries[ntSeries.length - 1];
    if (lastNT.value != null) {
      g.append("text").attr("class", "dc-nt-label")
        .attr("x", innerW + 3).attr("y", y(lastNT.value))
        .attr("dy", "0.32em").text("NT");
    }
  }

  // National average line
  const lineAvg = d3.line().defined(d => d.value != null).x(d => x(d.year)).y(d => y(d.value));
  g.append("path").attr("class", "dc-avg-line").attr("d", lineAvg(natlPts));

  // T2: compare state lines (dashed, ink-soft)
  for (const [cc, series] of Object.entries(compareSeries)) {
    const ln = d3.line().defined(d => d.value != null).x(d => x(d.year)).y(d => y(d.value));
    g.append("path").attr("class", "dc-compare-line").attr("data-compare", cc).attr("d", ln(series));
  }

  // Focused state line (on top)
  const lineState = d3.line().defined(d => d.value != null).x(d => x(d.year)).y(d => y(d.value));
  g.append("path").attr("class", "dc-state-line").attr("d", lineState(stateSeries));

  // Cursor + dots
  const cursor   = g.append("line").attr("class", "dc-cursor").attr("y1", 0).attr("y2", innerH);
  const dotAvg   = g.append("circle").attr("class", "dc-dot-avg").attr("r", 3.5);
  const dotState = g.append("circle").attr("class", "dc-dot-state").attr("r", 4);

  // End-of-line labels with de-collision (min 13px gap)
  const endLbls = [];
  const lastState = stateSeries[stateSeries.length - 1];
  if (lastState?.value != null) endLbls.push({ origY: y(lastState.value), cls: "dc-leg-state", txt: code });
  const lastNatl = natlPts[natlPts.length - 1];
  if (lastNatl?.value != null) endLbls.push({ origY: y(lastNatl.value), cls: "dc-leg-avg", txt: "Avg" });
  for (const [cc, series] of Object.entries(compareSeries)) {
    const lc = series[series.length - 1];
    if (lc?.value != null) endLbls.push({ origY: y(lc.value), cls: "dc-leg-compare", txt: cc });
  }
  endLbls.sort((a, b) => a.origY - b.origY);
  endLbls.forEach((d) => { d.nudgedY = d.origY; });
  const minGap = 13;
  for (let i = 1; i < endLbls.length; i++) {
    if (endLbls[i].nudgedY < endLbls[i - 1].nudgedY + minGap)
      endLbls[i].nudgedY = endLbls[i - 1].nudgedY + minGap;
  }
  const labelX = innerW + 4;
  endLbls.forEach(d => {
    if (Math.abs(d.nudgedY - d.origY) > 2) {
      g.append("line").attr("class", d.cls)
        .attr("x1", innerW + 1).attr("y1", d.origY)
        .attr("x2", innerW + 1).attr("y2", d.nudgedY)
        .attr("stroke-width", "1").attr("stroke-dasharray", "1 2")
        .attr("fill", "none").attr("opacity", "0.55");
    }
    g.append("text").attr("class", d.cls)
      .attr("x", labelX).attr("y", d.nudgedY)
      .attr("dy", "0.32em").attr("font-size", "9.5px").text(d.txt);
  });

  vizState.detailChart = { x, y, innerH, cursor, dotState, dotAvg, code };

  // Hover scrub drives the global year
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
// T1/T2: Breakdown bars — derived from top slicer, no tabs
// ============================================================
function categoriesForDim(dim) {
  return dim === "age" ? AGE_ORDER : dim === "sex" ? SEX_ORDER : ROAD_ORDER;
}
function indexForDim(dim) {
  return dim === "age" ? vizState.ageIdx : dim === "sex" ? vizState.sexIdx : vizState.roadIdx;
}

// T1: dim derived from vizState.filter. T2: compareCode for paired bars.
// T23: fixed layout — label | bar | pct (always visible) | count (hover-only)
function renderBreakdown(code, year, compareCode) {
  const mount = d3.select("#bd-chart");
  mount.selectAll("*").remove();

  const dim = vizState.filter.dim === "all" ? "roaduser" : vizState.filter.dim;

  const titleEl = document.getElementById("bd-title");
  if (titleEl) {
    const dimHuman = dim === "roaduser" ? "Road user" : dim === "age" ? "Age band" : "Sex";
    titleEl.textContent = `Who's getting hurt · ${dimHuman}`;
  }

  const cats = categoriesForDim(dim);
  const idx  = indexForDim(dim);
  const cell = idx.get(year)?.get(code);
  if (!cell) { mount.append("p").attr("class", "bd-empty").text("No data available."); return; }

  const data  = cats.map(c => ({ cat: c, cases: cell.get(c) ?? 0 }));
  const total = d3.sum(data, d => d.cases);
  if (total === 0) { mount.append("p").attr("class", "bd-empty").text("No data available."); return; }

  // compareCode param kept for API compat but breakdown is focused-state only

  // T23: fixed column layout — value ALWAYS outside bar area
  const W       = 390;
  const labelW  = 104;
  const pctW    = 38;   // always-visible percentage column
  const countW  = 72;   // hover-only count column
  const rowH    = 22;
  const padTop  = 2, padBottom = 2;
  const barX    = labelW + 4;
  const barMaxW = W - barX - pctW - countW - 6;
  const pctX    = barX + barMaxW + 6;
  const countX  = pctX + pctW + 2;
  const H       = padTop + padBottom + cats.length * rowH;

  const svg = mount.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "img")
    .attr("aria-label", `${FULL_NAME[code]} breakdown by ${dim}, ${year}.`);

  // Domain is always [0, 1] — bars are honest proportions, not scaled to max
  // (so 53% never looks "full" and 4% looks appropriately tiny)
  const xScale = d3.scaleLinear().domain([0, 1]).range([0, barMaxW]);

  const rows = svg.selectAll("g.bd-row").data(data).join("g")
    .attr("class", d => "bd-row" + (d.cat === "Other or unknown" ? " is-muted" : ""))
    .attr("transform", (d, i) => `translate(0, ${padTop + i * rowH})`)
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      setFilter(dim === "roaduser" ? "roaduser" : dim, d.cat);
    });

  // T23: full-width background rect for row hover tint
  rows.append("rect").attr("class", "bd-row-bg")
    .attr("x", 0).attr("y", 0)
    .attr("width", W).attr("height", rowH).attr("rx", 3);

  rows.append("text").attr("class", "bd-label")
    .attr("x", labelW).attr("y", rowH / 2).attr("dy", "0.35em")
    .attr("text-anchor", "end").text(d => d.cat);

  // No track background — clean bars on white, ghost boxes removed

  const activeVal = vizState.filter.dim !== "all" ? vizState.filter.value : null;
  rows.append("rect")
    .attr("class", d => "bd-bar" + (d.cat === activeVal ? " is-active" : ""))
    .attr("x", barX).attr("y", 7)
    .attr("height", rowH - 15).attr("rx", 3)
    .attr("width", d => xScale(d.cases / total));

  // Compare bars removed — breakdown is focused-state only (cleaner read)

  // T23: percentage — ALWAYS visible, RIGHT of bar area (never overlaps)
  rows.append("text").attr("class", "bd-val")
    .attr("x", pctX + pctW - 2).attr("y", rowH / 2).attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .text(d => `${(100 * d.cases / total).toFixed(0)}%`);

  // T23: raw count — hover-only, to the right of pct
  rows.append("text").attr("class", "bd-count")
    .attr("x", countX).attr("y", rowH / 2).attr("dy", "0.35em")
    .attr("text-anchor", "start")
    .text(d => `(${d.cases.toLocaleString()})`);
}

// ============================================================
// T3: Live narrative H2
// ============================================================
// GenAI-assisted (Claude): data-driven sentence generation.
function updateNarrativeH2() {
  const el = document.getElementById("narrative-h2");
  if (!el) return;

  const yr   = vizState.currentYear;
  const f    = vizState.filter;
  const code = vizState.selectedCode;

  const ntRate = sliceRate("NT", yr);
  const natl   = vizState.sliceNationalByYear.get(yr);

  const filterPart = f.dim === "all"      ? ""
    : f.dim === "sex"      ? ` among ${f.value.toLowerCase()}s`
    : f.dim === "age"      ? ` in age group ${f.value}`
    : ` among ${f.value.toLowerCase()}s`;

  let text = "";

  if (!code) {
    if (ntRate != null && natl != null) {
      const mult = ntRate / natl;
      text = `In ${yr}${filterPart}, the NT's rate was ${ntRate.toFixed(1)}/100k — ${mult.toFixed(2)}× the national average`;
    } else {
      text = `Hospitalised road-crash injuries per 100,000 people — ${yr}`;
    }
  } else if (code === "NT") {
    if (ntRate != null && natl != null) {
      const mult = ntRate / natl;
      text = `In ${yr}${filterPart}, the NT's rate was ${ntRate.toFixed(1)}/100k — ${mult.toFixed(2)}× the national average`;
    } else {
      text = `Northern Territory — ${yr}`;
    }
  } else {
    const stateRate = sliceRate(code, yr);
    const rank = STATE_CODES
      .map(c => ({ c, v: sliceRate(c, yr) ?? -Infinity }))
      .sort((a, b) => d3.descending(a.v, b.v))
      .findIndex(d => d.c === code) + 1;
    if (stateRate != null) {
      text = `In ${yr}${filterPart}, ${FULL_NAME[code]}'s rate was ${stateRate.toFixed(1)}/100k — #${rank} of 8 states`;
    } else {
      text = `${FULL_NAME[code]} — ${yr}`;
    }
  }

  // Append compare context (first compare state)
  if (vizState.compareSet.size > 0) {
    const cc = [...vizState.compareSet][0];
    const ccRate = sliceRate(cc, yr);
    if (ccRate != null && natl != null) {
      const ccMult = ccRate / natl;
      text += ` · ${cc}: ${ccMult.toFixed(2)}× avg`;
    }
  }

  el.textContent = text;
}

// ============================================================
// 8. Legend (vertical / horizontal for mobile)
// ============================================================
function drawLegend() {
  const stage = d3.select("#legend-stage");
  stage.selectAll("svg").remove();

  const isMobile = window.innerWidth < 760;

  if (isMobile) {
    drawLegendHorizontal(stage);
  } else {
    drawLegendVertical(stage);
  }

  updateLegendRangeChip();
}

function drawLegendVertical(stage) {
  const W = 92, H = 300;
  const padTop = 14, padBottom = 14;
  const innerH = H - padTop - padBottom;
  const barX = 30, barW = 14;

  const svg = stage.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "img").attr("aria-label", "Colour legend.");

  const isDelta = vizState.mode === "delta";
  const scale   = isDelta ? vizState.colorDelta : vizState.colorAbs;
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
    .call(d3.axisRight(yScale).ticks(5).tickSize(3)
      .tickFormat(d => isDelta ? d3.format("+,.0f")(d) : d3.format(",.0f")(d)));

  if (isDelta) {
    const yz = yScale(0);
    svg.append("line").attr("class", "legend-zero-marker")
      .attr("x1", barX - 2).attr("x2", barX + barW + 2)
      .attr("y1", yz).attr("y2", yz);
    svg.append("text").attr("x", barX - 4).attr("y", yz)
      .attr("text-anchor", "end").attr("dy", "0.32em")
      .attr("font-size", 9).attr("class", "dc-nt-label").text("avg");
  }
}

// T14: horizontal legend for mobile
function drawLegendHorizontal(stage) {
  const W = 280, H = 28;
  const padL = 4, padR = 4;
  const innerW = W - padL - padR;
  const barY = 4, barH = 12;

  const svg = stage.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "img").attr("aria-label", "Colour legend.");

  const isDelta = vizState.mode === "delta";
  const scale   = isDelta ? vizState.colorDelta : vizState.colorAbs;
  const [d0, d1] = scale.domain();

  const defs = svg.append("defs");
  const grad = defs.append("linearGradient").attr("id", "legend-grad-h")
    .attr("x1", "0%").attr("y1", "0%").attr("x2", "100%").attr("y2", "0%");
  const STOPS = 32;
  for (let i = 0; i <= STOPS; i++) {
    const t = i / STOPS;
    grad.append("stop").attr("offset", `${t * 100}%`)
      .attr("stop-color", scale(d0 + t * (d1 - d0)));
  }

  svg.append("rect")
    .attr("x", padL).attr("y", barY)
    .attr("width", innerW).attr("height", barH)
    .attr("rx", 2).attr("fill", "url(#legend-grad-h)");

  const xScale = d3.scaleLinear().domain([d0, d1]).range([padL, padL + innerW]);
  svg.append("g").attr("class", "legend-axis")
    .attr("transform", `translate(0,${barY + barH})`)
    .call(d3.axisBottom(xScale).ticks(4).tickSize(3)
      .tickFormat(d => isDelta ? d3.format("+,.0f")(d) : d3.format(",.0f")(d)));
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
  updateNarrativeH2();

  if (vizState.selectedCode) {
    updateDetailForYear(vizState.selectedCode, clamped);
    refreshCompareStripValues();
    renderBreakdown(vizState.selectedCode, clamped, [...vizState.compareSet][0] || null);
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

// T22: human-readable format — no "sex:" prefix, just the value
function sliceCaptionText() {
  const f = vizState.filter;
  if (f.dim === "all") return "Rate per 100,000 of total state population — all people";
  const label = f.dim === "sex"      ? f.value
              : f.dim === "age"      ? `age band ${f.value}`
              : f.value.toLowerCase() + (f.value.toLowerCase().endsWith("s") ? "" : "s");
  return `Rate per 100,000 of total state population — ${label}`;
}

// T22: crossfade on the caption text span; also show/hide the hint
function updateFilterCaption() {
  const textEl = document.getElementById("filter-caption-text");
  const hintEl = document.getElementById("caption-hint");
  const row    = document.getElementById("filter-caption");
  if (!textEl || !row) return;
  const newText = sliceCaptionText();
  if (textEl.textContent === newText) return;
  row.style.opacity = "0";
  setTimeout(() => {
    textEl.textContent = newText;
    // T25: hide "click to focus" once a state is selected
    if (hintEl) hintEl.hidden = !!vizState.selectedCode;
    row.style.opacity = "1";
  }, 260);
}

// T21: shared popover-select component (replaces native <select>)
// GenAI-assisted (Claude): popover accessibility + outside-click wiring.
function popoverSelect(btnId, popoverId, labelId, items, currentValue, onPick) {
  const btn     = document.getElementById(btnId);
  const popover = document.getElementById(popoverId);
  const label   = document.getElementById(labelId);
  if (!btn || !popover) return;

  const rebuild = (active) => {
    popover.innerHTML = "";
    items.forEach(item => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "popover-item" + (item.value === active ? " is-active" : "");
      el.setAttribute("role", "option");
      el.setAttribute("aria-selected", item.value === active ? "true" : "false");
      el.textContent = item.label || item.value;
      el.addEventListener("click", () => {
        if (label) label.textContent = item.label || item.value;
        popover.hidden = true;
        btn.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
        rebuild(item.value);
        onPick(item.value);
      });
      popover.appendChild(el);
    });
  };

  rebuild(currentValue);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Close sibling popovers before toggling this one
    document.querySelectorAll(".popover-menu").forEach(p => {
      if (p !== popover && !p.hidden) {
        p.hidden = true;
        const tb = p.closest(".popover-wrap")?.querySelector(".popover-trigger");
        if (tb) { tb.classList.remove("is-open"); tb.setAttribute("aria-expanded", "false"); }
      }
    });
    const open = !popover.hidden;
    popover.hidden = open;
    btn.classList.toggle("is-open", !open);
    btn.setAttribute("aria-expanded", open ? "false" : "true");
  });

  document.addEventListener("click", () => {
    popover.hidden = true;
    btn.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !popover.hidden) {
      popover.hidden = true;
      btn.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
    }
  });

  return { rebuild };
}

function populateDimValues(dim) {
  const wrap = document.getElementById("dim-value-wrap");
  if (dim === "all") { wrap.hidden = true; return; }
  wrap.hidden = false;
  const cats = dim === "sex" ? SEX_ORDER : dim === "age" ? AGE_ORDER : ROAD_ORDER;
  const current = vizState.filter.value || cats[0];
  const label = document.getElementById("dim-value-label");
  if (label) label.textContent = current;
  // rebuild the popover items for the new dimension
  const popover = document.getElementById("dim-value-popover");
  if (!popover) return;
  popover.innerHTML = "";
  cats.forEach(cat => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "popover-item" + (cat === current ? " is-active" : "");
    el.textContent = cat;
    el.addEventListener("click", () => {
      const lbl = document.getElementById("dim-value-label");
      if (lbl) lbl.textContent = cat;
      popover.hidden = true;
      const btn = document.getElementById("dim-value-btn");
      if (btn) { btn.classList.remove("is-open"); btn.setAttribute("aria-expanded","false"); }
      // update all items' active state
      popover.querySelectorAll(".popover-item").forEach(b =>
        b.classList.toggle("is-active", b.textContent === cat));
      setFilter(vizState.filter.dim, cat);
    });
    popover.appendChild(el);
  });
}

function setFilter(dim, value) {
  if (dim === "all") {
    vizState.filter = { dim: "all", value: null };
  } else {
    const cats = dim === "sex" ? SEX_ORDER : dim === "age" ? AGE_ORDER : ROAD_ORDER;
    const v = value && cats.includes(value) ? value : cats[0];
    vizState.filter = { dim, value: v };
  }

  // Sync dimension pills
  document.querySelectorAll(".dim-btn").forEach(b => {
    const active = b.dataset.dim === vizState.filter.dim;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-checked", active ? "true" : "false");
  });
  populateDimValues(vizState.filter.dim);
  // T21: sync the popover trigger label
  if (vizState.filter.dim !== "all") {
    const lbl = document.getElementById("dim-value-label");
    if (lbl) lbl.textContent = vizState.filter.value || "";
  }

  // T9: crossfade caption
  updateFilterCaption();

  // T11: show/hide caveat ribbon
  const ribbon  = document.getElementById("caveat-ribbon");
  const caveatDim = document.getElementById("caveat-dim");
  if (ribbon) {
    ribbon.hidden = (vizState.filter.dim === "all");
    if (caveatDim) caveatDim.textContent = DIM_LABEL[vizState.filter.dim] || "dimension";
  }

  // Recompute scales (T10 pulse fires inside rebuildScalesForFilter)
  rebuildScalesForFilter();
  refreshMap();
  drawLegend();
  updateNarrativeH2();

  if (vizState.selectedCode) {
    updateDetailForYear(vizState.selectedCode, vizState.currentYear);
    refreshCompareStripValues();
    renderDetailChart(vizState.selectedCode);
    updateDetailForYear(vizState.selectedCode, vizState.currentYear);
    renderBreakdown(vizState.selectedCode, vizState.currentYear, [...vizState.compareSet][0] || null);
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
  // T21: speed is now a popover — wire it here
  const speedItems = [
    { value: "1800", label: "Slow" },
    { value: "1100", label: "Normal" },
    { value: "550",  label: "Fast" },
  ];
  popoverSelect("speed-btn", "speed-popover", "speed-label", speedItems, "1100", (val) => {
    vizState.speedMs = +val;
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
      const dim  = btn.dataset.dim;
      const cats = dim === "sex" ? SEX_ORDER : dim === "age" ? AGE_ORDER : ROAD_ORDER;
      setFilter(dim, dim === "all" ? null : cats[0]);
    });
  });
  // Wire the dim-value trigger to open/close its popover
  const dvBtn = document.getElementById("dim-value-btn");
  const dvPop = document.getElementById("dim-value-popover");
  if (dvBtn && dvPop) {
    dvBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Close sibling popovers
      document.querySelectorAll(".popover-menu").forEach(p => {
        if (p !== dvPop && !p.hidden) {
          p.hidden = true;
          const tb = p.closest(".popover-wrap")?.querySelector(".popover-trigger");
          if (tb) { tb.classList.remove("is-open"); tb.setAttribute("aria-expanded", "false"); }
        }
      });
      const open = !dvPop.hidden;
      dvPop.hidden = open;
      dvBtn.classList.toggle("is-open", !open);
      dvBtn.setAttribute("aria-expanded", open ? "false" : "true");
    });
    // Close on outside click
    document.addEventListener("click", () => {
      dvPop.hidden = true;
      dvBtn.classList.remove("is-open");
      dvBtn.setAttribute("aria-expanded", "false");
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { dvPop.hidden = true; dvBtn.classList.remove("is-open"); }
    });
  }
}

function wireResetButton() {
  document.getElementById("reset-btn").addEventListener("click", () => resetView());
  document.getElementById("detail-close").addEventListener("click", () => resetView());
}

// T13: NT pill click handler
function wireNTPill() {
  const pill = document.getElementById("nt-pill");
  if (pill) pill.addEventListener("click", () => selectState("NT"));
}

// GenAI-assisted (Claude): keyboard controls.
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
      drawLegend(); // T14: re-draws horizontal/vertical based on new width
    });
  });
}

loadData()
  .then(([rows, geo, ageRows, sexRows, roadRows, popRows]) => {
    vizState.rows = rows;
    vizState.geo  = geo;
    const { byYear, byState } = indexData(rows);
    vizState.byYear   = byYear;
    vizState.byState  = byState;
    vizState.nationalByYear = computeNationalAverages(byYear);

    vizState.ageIdx  = indexDemographic(ageRows,  "age_group");
    vizState.sexIdx  = indexDemographic(sexRows,  "sex");
    vizState.roadIdx = indexDemographic(roadRows, "road_user");
    vizState.popIdx  = indexPopulation(popRows);

    // Initial slice = "all" → matches map_classic exactly; opens at YEAR_MAX (T5)
    rebuildScalesForFilter();
    buildProjection(geo, MAP_W, MAP_H);

    drawMap();
    drawLegend();
    updateFilterCaption();
    updateNarrativeH2(); // T3: set initial narrative

    wireFilterBar();
    wireSlider();
    wirePlayPause();
    wireSpeed();
    wireMode();
    wireResetButton();
    wireNTPill();       // T13
    wireKeyboard();
    handleResize();
    document.getElementById("detail-card")
      .addEventListener("scroll", updateDetailScrollFade);
  })
  .catch(err => {
    console.error("Data load failed:", err);
    showError(
      "Couldn't load the data. If you opened this file directly, run it via " +
      "a local web server (e.g. `python -m http.server`) and reload."
    );
  });
