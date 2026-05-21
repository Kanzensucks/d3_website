/* =============================================================
   map.js — Coordinated multiview of Australian road-crash
   hospitalisations 2011–2021.

   COS30045 · Team 99 · Hamish Hooley & Kanzen Ong.

   Story: the Northern Territory's rate runs 1.8–3× the
   national average across the whole decade.

   Architecture: three views (choropleth, race bars, trend lines)
   subscribe to one shared state (`vizState`). Every mutation
   (year, mode, pin, hover) flows through small helpers that
   re-render only what needs to change.

   Sections in this file:
     1.  Constants & shared state
     2.  Data loading + indexing
     3.  Scales (colour + projection + axes)
     4.  View: Map        (drawMap, refreshMap, drawNTAnnotation)
     5.  View: Race bars  (drawRace, refreshRace)
     6.  View: Trend      (drawTrend, refreshTrendCursor)
     7.  Legend           (drawLegend)
     8.  Interaction      (setYear, setMode, togglePin, ...)
     9.  Controls         (slider, play, speed, mode, keyboard)
     10. Tooltip
     11. Resize + bootstrap
   ============================================================= */

// ============================================================
// 1. Constants & shared state
// ============================================================
const DATA_CSV = "data/state_year_per100k.csv";
const DATA_GEO = "data/aus_states.geojson";
const YEAR_MIN = 2011;
const YEAR_MAX = 2021;
const TRANS_MS = 700;

// SVG drawing-coordinate sizes (viewBox space — actual rendered size
// scales with the container width).
const MAP_W   = 720, MAP_H   = 540;
const RACE_W  = 520, RACE_H  = 540;
const TREND_W = 1180, TREND_H = 320;
const LEGEND_W = 1180, LEGEND_H = 70;

const STATE_CODES = ["NSW", "Vic", "Qld", "SA", "WA", "Tas", "NT", "ACT"];
const FULL_NAME = {
  NSW: "New South Wales", Vic: "Victoria", Qld: "Queensland",
  SA:  "South Australia", WA:  "Western Australia", Tas: "Tasmania",
  NT:  "Northern Territory", ACT: "Australian Capital Territory",
};

const vizState = {
  rows: [],
  geo: null,
  byYear: new Map(),       // year → Map(code → row)
  byState: new Map(),      // code → array of rows sorted by year
  nationalByYear: new Map(),  // year → population-weighted national rate
  rateExtent: [0, 1],      // [min, max] of absolute rate (all years)
  deltaExtent: [-1, 1],    // [min, max] of (rate - national_avg)

  colorAbs: null,
  colorDelta: null,

  projection: null,
  path: null,

  currentYear: YEAR_MIN,
  mode: "absolute",        // "absolute" | "delta"
  isPlaying: false,
  timer: null,
  speedMs: 1100,
  pinned: new Set(),       // codes
  hoveredCode: null,
};

// ============================================================
// 2. Data loading + indexing
// ============================================================
function showError(message) {
  const banner = document.getElementById("error-banner");
  if (!banner) return;
  banner.hidden = false;
  banner.textContent = message;
}

function rowAccessor(d) {
  return {
    year: +d.Year,             // NOTE capital Y in source header
    state: d.state,
    cases: +d.cases,
    population: +d.population,
    cases_per_100k: +d.cases_per_100k,
  };
}

function loadData() {
  return Promise.all([
    d3.csv(DATA_CSV, rowAccessor),
    d3.json(DATA_GEO),
  ]);
}

function indexData(rows) {
  const byYear = new Map();
  const byState = new Map();
  for (const r of rows) {
    if (!byYear.has(r.year)) byYear.set(r.year, new Map());
    byYear.get(r.year).set(r.state, r);
    if (!byState.has(r.state)) byState.set(r.state, []);
    byState.get(r.state).push(r);
  }
  // Sort each state's series chronologically for line-path generation.
  for (const arr of byState.values()) arr.sort((a, b) => a.year - b.year);
  return { byYear, byState };
}

// Population-weighted national average per year. Total cases / total
// population × 100,000 is the principled "national rate" — not the
// arithmetic mean of state rates (which over-weights small jurisdictions).
function computeNationalAverages(byYear) {
  const out = new Map();
  for (const [year, m] of byYear) {
    let tc = 0, tp = 0;
    for (const r of m.values()) { tc += r.cases; tp += r.population; }
    out.set(year, (tc / tp) * 100000);
  }
  return out;
}

// ============================================================
// 3. Scales
// ============================================================
function buildColorScales(rows, nationalByYear) {
  // Absolute mode: fixed across all years so panels are comparable.
  const [rmin, rmax] = d3.extent(rows, r => r.cases_per_100k);
  vizState.rateExtent = [rmin, rmax];
  vizState.colorAbs = d3.scaleSequential(d3.interpolateYlOrRd).domain([rmin, rmax]);

  // Delta mode: diverging, symmetric around 0 so colour midpoint = baseline.
  const deltas = rows.map(r => r.cases_per_100k - nationalByYear.get(r.year));
  const m = Math.max(Math.abs(d3.min(deltas)), Math.abs(d3.max(deltas)));
  vizState.deltaExtent = [-m, m];
  // RdYlBu reversed: blue (below) → light → red (above).
  vizState.colorDelta = d3.scaleSequential(t => d3.interpolateRdYlBu(1 - t))
    .domain([-m, m]);
}

// Planar projection (geoIdentity) — robust to GeoJSON ring-winding
// inconsistencies that would otherwise break a spherical Mercator on
// this dataset. Visually equivalent to Mercator at this zoom level.
function buildProjection(geo, w, h) {
  vizState.projection = d3.geoIdentity().reflectY(true).fitSize([w, h], geo);
  vizState.path = d3.geoPath(vizState.projection);
}

// One unified "fill for state in current year" so map and race chart agree.
function fillFor(code) {
  const row = vizState.byYear.get(vizState.currentYear)?.get(code);
  if (!row) return "#eee";
  if (vizState.mode === "delta") {
    const delta = row.cases_per_100k - vizState.nationalByYear.get(vizState.currentYear);
    return vizState.colorDelta(delta);
  }
  return vizState.colorAbs(row.cases_per_100k);
}

function valueFor(code) {
  const row = vizState.byYear.get(vizState.currentYear)?.get(code);
  if (!row) return 0;
  if (vizState.mode === "delta") {
    return row.cases_per_100k - vizState.nationalByYear.get(vizState.currentYear);
  }
  return row.cases_per_100k;
}

// ============================================================
// 4. View: Map
// ============================================================
function drawMap() {
  const stage = d3.select("#map-stage");
  stage.selectAll("svg").remove();

  const svg = stage.append("svg")
    .attr("viewBox", `0 0 ${MAP_W} ${MAP_H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "img")
    .attr("aria-label",
      "Choropleth map of Australia showing hospitalised road-crash injuries " +
      "per 100,000 people for the selected year.");

  const gStates = svg.append("g").attr("class", "states-layer");
  const gAnnot  = svg.append("g").attr("class", "annotation-layer");

  gStates.selectAll("path.state")
    .data(vizState.geo.features, d => d.properties.code)
    .join("path")
      .attr("class", "state")
      .attr("d", vizState.path)
      .attr("data-code", d => d.properties.code)
      .attr("fill", d => fillFor(d.properties.code))
      // GenAI-assisted (Claude): animated initial outline draw.
      // Use stroke-dasharray to "draw on" each state's perimeter.
      .each(function () {
        const path = this;
        try {
          const len = path.getTotalLength();
          d3.select(path)
            .attr("stroke-dasharray", `${len} ${len}`)
            .attr("stroke-dashoffset", len)
            .transition().duration(900).delay(120)
            .attr("stroke-dashoffset", 0)
            .on("end", () => d3.select(path).attr("stroke-dasharray", null));
        } catch (e) { /* getTotalLength can fail for empty paths */ }
      })
      .append("title")
        .text(d => `${FULL_NAME[d.properties.code]} — ${vizState.currentYear}`);

  vizState.gStates = gStates;
  vizState.gAnnot  = gAnnot;

  drawNTAnnotation();

  // Click + hover handlers (delegated to each path)
  gStates.selectAll("path.state")
    .on("click", function (event, d) {
      togglePin(d.properties.code);
    })
    .on("mouseover.coord", function (event, d) {
      setHover(d.properties.code);
    })
    .on("mouseout.coord", function () {
      setHover(null);
    });
}

function refreshMap() {
  vizState.gStates.selectAll("path.state")
    .transition().duration(TRANS_MS)
    .attr("fill", d => fillFor(d.properties.code));
  vizState.gStates.selectAll("path.state > title")
    .text(d => `${FULL_NAME[d.properties.code]} — ${vizState.currentYear}`);
  drawNTAnnotation();
  applyPinDimMap();
}

// NT annotation that recomputes its multiplier for the current year.
function drawNTAnnotation() {
  const nt = vizState.geo.features.find(f => f.properties.code === "NT");
  if (!nt) return;
  const [cx, cy] = vizState.path.centroid(nt);

  const ntRow = vizState.byYear.get(vizState.currentYear).get("NT");
  const natl  = vizState.nationalByYear.get(vizState.currentYear);
  const mult  = (ntRow.cases_per_100k / natl).toFixed(2);

  const g = vizState.gAnnot;
  g.selectAll("*").remove();

  // Label sits to the right of NT in the Coral Sea / Cape York void.
  const labelX = Math.min(MAP_W - 230, cx + 170);
  const labelY = Math.max(40, cy - 70);

  const elbowX = cx + 70;
  g.append("polyline")
    .attr("class", "nt-leader")
    .attr("points", `${cx},${cy} ${elbowX},${cy} ${elbowX},${labelY} ${labelX - 8},${labelY}`);
  g.append("circle")
    .attr("class", "nt-leader-dot")
    .attr("cx", cx).attr("cy", cy).attr("r", 3);

  const lines = [
    { text: "Northern Territory", cls: "nt-annotation-text" },
    { text: `${vizState.currentYear} rate: ${ntRow.cases_per_100k.toFixed(1)} / 100k`, cls: "nt-annotation-sub" },
    { text: `${mult}× the national average`, cls: "nt-annotation-emph" },
  ];

  const longest = lines.reduce((a, b) => (a.text.length >= b.text.length ? a : b)).text;
  const boxW = Math.max(170, longest.length * 6.4 + 20);
  const boxH = lines.length * 16 + 18;

  g.append("rect")
    .attr("class", "nt-annotation-box")
    .attr("x", labelX - 10)
    .attr("y", labelY - 20)
    .attr("rx", 6).attr("ry", 6)
    .attr("width", boxW)
    .attr("height", boxH);

  lines.forEach((ln, i) => {
    g.append("text")
      .attr("class", ln.cls)
      .attr("x", labelX)
      .attr("y", labelY + i * 16)
      .text(ln.text);
  });
}

function applyPinDimMap() {
  const anyPinned = vizState.pinned.size > 0;
  vizState.gStates.selectAll("path.state")
    .classed("is-pinned", d => vizState.pinned.has(d.properties.code))
    .classed("is-dim", d => anyPinned && !vizState.pinned.has(d.properties.code));
}

// ============================================================
// 5. View: Race bars
// ============================================================
function drawRace() {
  const stage = d3.select("#race-stage");
  stage.selectAll("*").remove();

  const header = stage.append("div").attr("class", "race-header");
  header.append("span").attr("class", "race-title").attr("id", "race-title-text").text("Ranked by rate");
  header.append("span").attr("class", "race-subtitle").attr("id", "race-subtitle-text").text("higher is worse");

  const margin = { top: 12, right: 80, bottom: 28, left: 56 };
  const innerW = RACE_W - margin.left - margin.right;
  const innerH = RACE_H - margin.top - margin.bottom;

  const svg = stage.append("svg")
    .attr("viewBox", `0 0 ${RACE_W} ${RACE_H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "img")
    .attr("aria-label", "Bars ranked by hospitalisation rate for the selected year.");

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  // Background lane per state — gives a "track" feel as bars swap ranks.
  const y = d3.scaleBand().range([0, innerH]).padding(0.18)
    .domain(STATE_CODES.slice());  // initial order; updated each refresh
  const x = d3.scaleLinear().range([0, innerW]);

  // Static x-axis bottom; refresh updates the domain.
  const xAxis = g.append("g")
    .attr("class", "race-axis")
    .attr("transform", `translate(0,${innerH})`);

  // Group per state — joined by code so we can animate y-position swaps.
  const groups = g.selectAll("g.race-group")
    .data(STATE_CODES, d => d)
    .join("g")
      .attr("class", "race-group")
      .attr("data-code", d => d)
      .attr("transform", d => `translate(0,${y(d)})`);

  groups.append("rect")
    .attr("class", "race-bar-bg")
    .attr("x", 0).attr("y", 0)
    .attr("rx", 3).attr("ry", 3)
    .attr("width", innerW)
    .attr("height", y.bandwidth());

  groups.append("rect")
    .attr("class", "race-bar")
    .attr("x", 0).attr("y", 0)
    .attr("rx", 3).attr("ry", 3)
    .attr("width", 0)
    .attr("height", y.bandwidth());

  groups.append("text")
    .attr("class", "race-label-state")
    .attr("x", -10).attr("y", y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .text(d => d);

  groups.append("text")
    .attr("class", "race-label-value")
    .attr("x", 0).attr("y", y.bandwidth() / 2)
    .attr("dy", "0.35em");

  groups.append("text")
    .attr("class", "race-rank")
    .attr("x", -40).attr("y", y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "end");

  // Coordination: hover + click on a row syncs other views.
  groups
    .on("mouseover.coord", (e, code) => setHover(code))
    .on("mouseout.coord",  () => setHover(null))
    .on("click", (e, code) => togglePin(code));

  // Stash references.
  vizState.race = { svg, g, x, y, xAxis, innerW, innerH, margin };

  refreshRace(false);  // initial paint without transition
}

function refreshRace(animate = true) {
  const { g, x, y, xAxis } = vizState.race;

  // Build a code→rank map so the existing string-keyed groups can look up
  // their current rank without rebinding data (rebinding with a different
  // key function silently empties the update selection — easy footgun).
  const ranking = STATE_CODES
    .map(code => ({ code, value: valueFor(code) }))
    .sort((a, b) => d3.descending(a.value, b.value));
  const rankByCode = new Map(ranking.map((r, i) => [r.code, { rank: i, value: r.value }]));

  // y domain reflects the new rank order so y(code) yields the new position.
  y.domain(ranking.map(d => d.code));

  if (vizState.mode === "delta") {
    const [dlo, dhi] = vizState.deltaExtent;
    x.domain([dlo, dhi]);
  } else {
    x.domain([0, vizState.rateExtent[1]]);
  }

  xAxis.call(d3.axisBottom(x).ticks(5).tickSize(4).tickFormat(d => d3.format(",.0f")(d)));

  d3.select("#race-title-text").text(vizState.mode === "delta"
    ? "Deviation from national avg"
    : "Hospitalisations per 100,000");
  d3.select("#race-subtitle-text").text(vizState.mode === "delta"
    ? "red = above avg, blue = below"
    : "higher is worse");

  const t = animate ? d3.transition().duration(TRANS_MS) : null;
  const anyPinned = vizState.pinned.size > 0;

  // Operate on the existing string-bound groups; no .data() rebind.
  const sel = g.selectAll("g.race-group")
    .classed("is-pinned", code => vizState.pinned.has(code))
    .classed("is-dim", code => anyPinned && !vizState.pinned.has(code));

  (animate ? sel.transition(t) : sel)
    .attr("transform", code => `translate(0,${y(code)})`);

  sel.each(function (code) {
    const { rank, value: v } = rankByCode.get(code);
    const gp = d3.select(this);

    let xStart, w;
    if (vizState.mode === "delta") {
      const zero = x(0);
      const vx = x(v);
      xStart = Math.min(zero, vx);
      w = Math.abs(vx - zero);
    } else {
      xStart = 0;
      w = x(v);
    }
    const fillVal = fillFor(code);

    const bar = gp.select("rect.race-bar");
    (animate ? bar.transition(t) : bar)
      .attr("x", xStart)
      .attr("width", Math.max(0, w))
      .attr("fill", fillVal);

    gp.select("text.race-label-value")
      .attr("x", xStart + w + 6)
      .text(vizState.mode === "delta"
        ? d3.format("+,.1f")(v)
        : d3.format(",.1f")(v));

    gp.select("text.race-rank").text(`#${rank + 1}`);
  });
}

// ============================================================
// 6. View: Trend chart
// ============================================================
function drawTrend() {
  const stage = d3.select("#trend-stage");
  // Keep the header element from the HTML; remove only old SVGs.
  stage.selectAll("svg").remove();

  const margin = { top: 12, right: 92, bottom: 30, left: 44 };
  const innerW = TREND_W - margin.left - margin.right;
  const innerH = TREND_H - margin.top - margin.bottom;

  const svg = stage.append("svg")
    .attr("viewBox", `0 0 ${TREND_W} ${TREND_H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "img")
    .attr("aria-label", "Trend lines: rate per 100,000 for each state across 2011-2021.");

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([YEAR_MIN, YEAR_MAX]).range([0, innerW]);
  const y = d3.scaleLinear().domain([0, vizState.rateExtent[1] * 1.05]).range([innerH, 0]).nice();

  // Grid
  g.append("g")
    .attr("class", "trend-grid")
    .call(d3.axisLeft(y).tickSize(-innerW).tickFormat("").ticks(5));

  // Axes
  g.append("g")
    .attr("class", "trend-axis")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(YEAR_MAX - YEAR_MIN));
  g.append("g")
    .attr("class", "trend-axis")
    .call(d3.axisLeft(y).ticks(5));

  // Year-cursor band (background) + line.
  const cursorBand = g.append("rect")
    .attr("class", "trend-cursor-band")
    .attr("y", 0).attr("height", innerH)
    .attr("width", innerW / (YEAR_MAX - YEAR_MIN))
    .attr("x", x(vizState.currentYear) - (innerW / (YEAR_MAX - YEAR_MIN)) / 2);

  const cursorLine = g.append("line")
    .attr("class", "trend-cursor")
    .attr("x1", x(vizState.currentYear))
    .attr("x2", x(vizState.currentYear))
    .attr("y1", 0).attr("y2", innerH);

  // National average line
  const lineGen = d3.line().x(d => x(d.year)).y(d => y(d.value));
  const natlPts = Array.from(vizState.nationalByYear, ([year, value]) => ({ year, value }))
    .sort((a, b) => a.year - b.year);

  g.append("path")
    .attr("class", "trend-avg-line")
    .attr("d", lineGen(natlPts));

  g.append("text")
    .attr("class", "trend-avg-label")
    .attr("x", innerW + 6)
    .attr("y", y(natlPts[natlPts.length - 1].value))
    .attr("dy", "0.35em")
    .text("National avg");

  // State lines
  const stateLineGen = d3.line().x(d => x(d.year)).y(d => y(d.cases_per_100k));
  STATE_CODES.forEach(code => {
    const arr = vizState.byState.get(code);
    g.append("path")
      .attr("class", `trend-line ${code === "NT" ? "is-nt" : ""}`)
      .attr("data-code", code)
      .attr("d", stateLineGen(arr));

    // End-of-line label
    const last = arr[arr.length - 1];
    g.append("text")
      .attr("class", `trend-endlabel ${code === "NT" ? "is-nt" : ""}`)
      .attr("data-code", code)
      .attr("x", innerW + 6)
      .attr("y", y(last.cases_per_100k))
      .attr("dy", "0.35em")
      .text(code);
  });

  // Year dot for NT — always-on emphasis.
  const ntArr = vizState.byState.get("NT");
  const ntDot = g.append("circle")
    .attr("class", "trend-dot")
    .attr("r", 4)
    .attr("cx", x(vizState.currentYear))
    .attr("cy", y(ntArr.find(r => r.year === vizState.currentYear).cases_per_100k));

  // Hover overlay: scrubs the year across all views.
  const overlay = g.append("rect")
    .attr("fill", "transparent")
    .attr("width", innerW).attr("height", innerH)
    .style("cursor", "ew-resize")
    .on("mousemove", function (event) {
      const [mx] = d3.pointer(event, this);
      const yr = Math.round(x.invert(mx));
      const clamped = Math.max(YEAR_MIN, Math.min(YEAR_MAX, yr));
      if (vizState.isPlaying) stopPlay();
      setYear(clamped, { fromTrend: true });
    });

  // De-emphasise lines when something is pinned, by reapplying classes.
  vizState.trend = {
    svg, g, x, y, innerW, innerH, cursorLine, cursorBand, ntDot, lineGen, stateLineGen
  };

  refreshTrendCursor();
  applyPinDimTrend();
}

function refreshTrendCursor() {
  const { x, y, cursorLine, cursorBand, ntDot, innerW } = vizState.trend;
  const bandW = innerW / (YEAR_MAX - YEAR_MIN);
  const xc = x(vizState.currentYear);

  cursorLine
    .transition().duration(180)
    .attr("x1", xc).attr("x2", xc);
  cursorBand
    .transition().duration(180)
    .attr("x", xc - bandW / 2);

  const ntRow = vizState.byState.get("NT").find(r => r.year === vizState.currentYear);
  ntDot
    .transition().duration(180)
    .attr("cx", xc)
    .attr("cy", y(ntRow.cases_per_100k));
}

function applyPinDimTrend() {
  const anyPinned = vizState.pinned.size > 0;
  vizState.trend.g.selectAll("path.trend-line")
    .classed("is-pinned", function () {
      return vizState.pinned.has(this.dataset.code);
    })
    .classed("is-dim", function () {
      const code = this.dataset.code;
      // NT stays prominent; other un-pinned lines dim.
      if (!anyPinned) return false;
      return !vizState.pinned.has(code) && code !== "NT";
    });
  vizState.trend.g.selectAll("text.trend-endlabel")
    .classed("is-pinned", function () { return vizState.pinned.has(this.dataset.code); });
}

// ============================================================
// 7. Legend
// ============================================================
function drawLegend() {
  const stage = d3.select("#legend-stage");
  stage.selectAll("svg").remove();

  const W = LEGEND_W, H = LEGEND_H;
  const margin = { top: 26, right: 24, bottom: 24, left: 24 };
  const innerW = W - margin.left - margin.right;

  const svg = stage.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "img")
    .attr("aria-label", "Colour legend.");

  const defs = svg.append("defs");
  const grad = defs.append("linearGradient")
    .attr("id", "legend-grad")
    .attr("x1", "0%").attr("x2", "100%");

  const isDelta = vizState.mode === "delta";
  const scale = isDelta ? vizState.colorDelta : vizState.colorAbs;
  const [d0, d1] = scale.domain();

  const STOPS = 32;
  grad.selectAll("stop").remove();
  for (let i = 0; i <= STOPS; i++) {
    const t = i / STOPS;
    grad.append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", scale(d0 + t * (d1 - d0)));
  }

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("text").attr("class", "legend-title").attr("x", 0).attr("y", -10)
    .text(isDelta
      ? "Deviation from national average (cases per 100,000)"
      : "Hospitalisations per 100,000 people");

  g.append("rect")
    .attr("width", innerW).attr("height", 12).attr("rx", 2)
    .attr("fill", "url(#legend-grad)");

  // Zero marker for the diverging scale.
  if (isDelta) {
    const xPos = innerW * ((0 - d0) / (d1 - d0));
    g.append("line")
      .attr("class", "legend-zero-marker")
      .attr("x1", xPos).attr("x2", xPos)
      .attr("y1", -2).attr("y2", 14);
    g.append("text")
      .attr("x", xPos).attr("y", -4).attr("text-anchor", "middle")
      .attr("font-size", 10).attr("fill", "#1f2933")
      .text("avg");
  }

  const xScale = d3.scaleLinear().domain([d0, d1]).range([0, innerW]);
  g.append("g")
    .attr("class", "legend-axis")
    .attr("transform", "translate(0,12)")
    .call(d3.axisBottom(xScale).ticks(8).tickSize(4)
      .tickFormat(d => isDelta ? d3.format("+,.0f")(d) : d3.format(",.0f")(d)));
}

// ============================================================
// 8. Interaction (shared mutators)
// ============================================================
function setYear(y, { fromSlider = false, fromTrend = false } = {}) {
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
  refreshRace();
  refreshTrendCursor();
}

function setMode(mode) {
  if (mode === vizState.mode) return;
  vizState.mode = mode;
  document.querySelectorAll(".seg-btn").forEach(b => {
    const active = b.dataset.mode === mode;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-checked", active ? "true" : "false");
  });
  // Map fills, race bars, legend all re-render. Trend stays absolute scale.
  refreshMap();
  refreshRace();
  drawLegend();
}

function togglePin(code) {
  if (vizState.pinned.has(code)) vizState.pinned.delete(code);
  else vizState.pinned.add(code);
  applyPinDimMap();
  applyPinDimTrend();
  // Race chart dim/pin handled in refreshRace.
  refreshRace(false);
}

function setHover(code) {
  vizState.hoveredCode = code;
  // Light-touch: just toggle a class on the hovered map path.
  d3.selectAll("path.state").classed("is-hovered", function () {
    return this.dataset.code === code;
  });
  d3.selectAll("g.race-group").classed("is-hovered", function () {
    return this.dataset.code === code;
  });
}

// ============================================================
// 9. Controls
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
    if (vizState.isPlaying) {
      stopPlay();
      startPlay();
    }
  });
}

function wireMode() {
  document.querySelectorAll(".seg-btn").forEach(btn => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });
}

// GenAI-assisted (Claude): keyboard handlers. Arrows step the year and
// Space toggles play/pause. Avoids stealing keys when the user is typing
// in a focused input/select.
function wireKeyboard() {
  window.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea") return;

    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      vizState.isPlaying ? stopPlay() : startPlay();
    } else if (e.key === "ArrowRight") {
      if (vizState.isPlaying) stopPlay();
      const next = vizState.currentYear + 1;
      setYear(next > YEAR_MAX ? YEAR_MIN : next);
    } else if (e.key === "ArrowLeft") {
      if (vizState.isPlaying) stopPlay();
      const prev = vizState.currentYear - 1;
      setYear(prev < YEAR_MIN ? YEAR_MAX : prev);
    } else if (e.key === "Home") {
      if (vizState.isPlaying) stopPlay();
      setYear(YEAR_MIN);
    } else if (e.key === "End") {
      if (vizState.isPlaying) stopPlay();
      setYear(YEAR_MAX);
    } else if (e.key === "Escape") {
      // Clear pins.
      if (vizState.pinned.size) {
        vizState.pinned.clear();
        applyPinDimMap();
        applyPinDimTrend();
        refreshRace(false);
      }
    }
  });
}

// ============================================================
// 10. Tooltip
// ============================================================
function wireTooltip() {
  const tip = document.getElementById("tooltip");

  d3.selectAll("path.state")
    .on("mouseover.tt", function (event, d) { showTooltip(tip, d.properties.code, event); })
    .on("mousemove.tt", function (event) { positionTooltip(tip, event); })
    .on("mouseout.tt",  function () { hideTooltip(tip); });

  d3.selectAll("g.race-group")
    .on("mouseover.tt", function (event, code) { showTooltip(tip, code, event); })
    .on("mousemove.tt", function (event) { positionTooltip(tip, event); })
    .on("mouseout.tt",  function () { hideTooltip(tip); });
}

function showTooltip(tip, code, event) {
  const row = vizState.byYear.get(vizState.currentYear).get(code);
  const natl = vizState.nationalByYear.get(vizState.currentYear);
  const name = FULL_NAME[code] || code;
  if (!row) {
    tip.innerHTML = `<div class="tt-title">${name}</div><div class="tt-row"><span class="k">No data</span></div>`;
  } else {
    const rate = row.cases_per_100k;
    const delta = rate - natl;
    const mult = rate / natl;
    const deltaClass = delta >= 0 ? "above" : "below";
    const sparkSvg = renderSparkline(code, 220, 36);
    tip.innerHTML =
      `<div class="tt-title">${name} · ${vizState.currentYear}</div>` +
      `<div class="tt-row"><span class="k">Per 100,000</span><span>${rate.toFixed(1)}</span></div>` +
      `<div class="tt-row"><span class="k">Hospitalisations</span><span>${row.cases.toLocaleString()}</span></div>` +
      `<div class="tt-row"><span class="k">Population</span><span>${row.population.toLocaleString()}</span></div>` +
      `<div class="tt-delta">` +
        `<div class="tt-row"><span class="k">vs national avg</span><span>${delta >= 0 ? "+" : ""}${delta.toFixed(1)} (${mult.toFixed(2)}×)</span></div>` +
      `</div>` +
      `<div class="tt-spark">${sparkSvg}</div>` +
      `<div class="tt-pin-hint">${vizState.pinned.has(code) ? "Click to unpin" : "Click to pin"}</div>`;
  }
  tip.hidden = false;
  positionTooltip(tip, event);
}

// GenAI-assisted (Claude): inline sparkline as raw SVG markup. Avoids
// re-creating d3 selections inside the tooltip on every mousemove.
function renderSparkline(code, w, h) {
  const arr = vizState.byState.get(code);
  if (!arr || !arr.length) return "";
  const x = d3.scaleLinear().domain([YEAR_MIN, YEAR_MAX]).range([2, w - 2]);
  const yExtent = [
    Math.min(d3.min(arr, d => d.cases_per_100k), vizState.rateExtent[0]) * 0.95,
    Math.max(d3.max(arr, d => d.cases_per_100k), vizState.rateExtent[0]) * 1.05,
  ];
  const y = d3.scaleLinear().domain(yExtent).range([h - 4, 4]);
  const line = d3.line().x(d => x(d.year)).y(d => y(d.cases_per_100k))(arr);
  const cur = arr.find(r => r.year === vizState.currentYear);
  const cx = x(vizState.currentYear);
  const cy = cur ? y(cur.cases_per_100k) : 0;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <path d="${line}" fill="none" stroke="#f0c8a0" stroke-width="1.5" />
    <line x1="${cx}" x2="${cx}" y1="0" y2="${h}" stroke="rgba(255,255,255,0.25)" />
    <circle cx="${cx}" cy="${cy}" r="3" fill="#ffb86b" />
  </svg>`;
}

function positionTooltip(tip, event) {
  const pad = 14;
  const tw = tip.offsetWidth || 220;
  const th = tip.offsetHeight || 120;
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + tw + pad > window.innerWidth)  x = event.clientX - tw - pad;
  if (y + th + pad > window.innerHeight) y = event.clientY - th - pad;
  tip.style.left = `${x}px`;
  tip.style.top  = `${y}px`;
}

function hideTooltip(tip) { tip.hidden = true; }

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
  .then(([rows, geo]) => {
    vizState.rows = rows;
    vizState.geo  = geo;
    const { byYear, byState } = indexData(rows);
    vizState.byYear = byYear;
    vizState.byState = byState;
    vizState.nationalByYear = computeNationalAverages(byYear);

    console.log("CSV rows:", rows.length, "(expected 88)");
    console.log("GeoJSON features:", geo.features.length, "(expected 8)");
    console.log("National avg by year:",
      Array.from(vizState.nationalByYear, ([y, v]) => `${y}=${v.toFixed(1)}`).join("  "));

    buildColorScales(rows, vizState.nationalByYear);
    buildProjection(geo, MAP_W, MAP_H);

    drawMap();
    drawRace();
    drawTrend();
    drawLegend();

    wireSlider();
    wirePlayPause();
    wireSpeed();
    wireMode();
    wireKeyboard();
    wireTooltip();
    handleResize();
  })
  .catch(err => {
    console.error("Data load failed:", err);
    showError(
      "Couldn't load the data. If you opened this file directly, run it via " +
      "a local web server (e.g. `python -m http.server`) and reload."
    );
  });
