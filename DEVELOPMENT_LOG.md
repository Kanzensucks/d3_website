# Development Log — Animated Choropleth Map

**Project:** COS30045 Data Visualisation · Team 99 · Hamish Hooley & Kanzen Ong
**Artefact:** Animated time-lapse choropleth of Australian road-crash
hospitalisations per 100,000 people, 2011–2021.
**Tooling:** Plain D3.js v7 (CDN), vanilla HTML/CSS/JS, no build step.
**Assistant:** Built collaboratively with Claude (GenAI). Non-trivial
AI-generated code blocks are tagged in source with `// GenAI-assisted (Claude)`.

This log records the build chronologically: what was decided, what was built,
what broke, and how it was fixed. It doubles as our GenAI-acknowledgement and
process-documentation record.

---

## Session overview (timeline)

| Phase | What happened | Outcome |
|-------|---------------|---------|
| 0 | Located & verified data files | CSV + GeoJSON confirmed |
| 1 | Step 1 skeleton + data load | 88 rows, 8 features verified |
| 2 | Full v1 build (single map) | Choropleth + controls working |
| 3 | Bug: map rendered as one blob | Fixed projection (winding issue) |
| 4 | v2 rebuild for complexity | 3 coordinated views |
| 5 | Bug: race chart bars invisible | Fixed data-binding footgun |
| 6 | Design review | Decided on map-hero + drill-down redesign |
| 7 | Redesign complete | Zoom-to-state + detail card |
| 8 | Archive as map_classic | Self-contained `map_classic.*` snapshot |
| 9 | map_classic_v2 | Demographic slice filter + breakdown panel |

---

## Iteration log (what was requested → what was produced)

This section records, in order, **what Kanzen asked for** (quoted) and **what
was produced** in response. Maintained after every iteration.

### Iteration 1 — Kickoff
- **Said:** Pasted Master Prompt 1 (animated time-lapse choropleth brief), then
  clarified the data location: *"its in C:\\Users\\kanze\\Desktop\\data viz\\projectttt\\data"*
  and *"rescan /data folder again"* when the GeoJSON wasn't found at first.
- **Produced:** Located and verified both data files; confirmed schemas
  (88 CSV rows, 8 GeoJSON features, join on state code).

### Iteration 2 — "sorry restart"
- **Said:** *"sorry restart"* (entered plan mode).
- **Produced:** A step-by-step implementation plan ratifying the brief's 7-step
  build; plan approved.

### Iteration 3 — Step 1
- **Said:** Approved the plan.
- **Produced:** Step 1 skeleton (`map.html`, `map.css`, `map.js`) + data loader.
  Verified 88 rows / 8 features / range [96.4, 336.7], no errors.

### Iteration 4 — "control my web page yourself"
- **Said:** *"why not you control my web page and screenshot it yourself"*
- **Produced:** Set up the live preview server + `.claude/launch.json`; began
  self-verifying via the preview tools (console + DOM inspection).

### Iteration 5 — "do everything to the last step"
- **Said:** *"REQUIREMENT: im alowing you to do everything to the last step.
  dont need to ask every step."*
- **Produced:** Full v1 build — choropleth + legend + slider + Play/Pause +
  tooltip + NT annotation + resize, all wired to a shared `currentYear`.

### Iteration 6 — Blank/blob map
- **Said:** Screenshot showing a 404 (URL typo `map.htm`), then a screenshot of
  the map rendering as one giant yellow blob.
- **Produced:** Diagnosed the GeoJSON ring-winding problem; switched the
  projection to `d3.geoIdentity().reflectY(true)`. Map then drew correctly.

### Iteration 7 — "make this 10/10"
- **Said:** *"this is really basic, interactive wise 1/10, complexitywise ill
  say 1/10, make this 10/10"*
- **Produced:** v2 rebuild into three coordinated views (map + ranked race bars
  + decade trend chart) with mode toggle (rate vs deviation), click-to-pin,
  keyboard controls, speed control, and an upgraded sparkline tooltip.

### Iteration 8 — "the left ... isnt working"
- **Said:** *"the left hospitalisation per 100k isnt working"* (race chart bars
  invisible / unranked).
- **Produced:** Fixed the `refreshRace` data-binding bug (key function mismatch
  emptied the update selection); bars now draw, colour, and rank correctly.

### Iteration 9 — Redesign discussion
- **Said:** *"i dont like the sequencing ... too much graph here ... maybe just
  map only, then when i go and select the state we zoom into the state and then
  data shows around it ... discuss with me."* Then chose: **zoom + detail card**,
  **cut the trend panel and show the selected state vs national average**,
  **time-lapse co-equal**.
- **Produced:** Design discussion + agreed direction; then the map-hero redesign
  with `d3.zoom` click-to-focus and a detail card (selected state vs national
  average). Race + standalone trend panels removed.

### Iteration 10 — "document everything"
- **Said:** *"i also have one more request, i have to document everything that is
  done. so i want you to store step by step since the start of the session till
  now."*
- **Produced:** This `DEVELOPMENT_LOG.md` (chronological phases + GenAI
  acknowledgement).

### Iteration 11 — "note what i said and what is produced"
- **Said:** *"after every iteration note what i said and then what is produced.
  in the development log yeah."*
- **Produced:** Added this "Iteration log" section (retroactive + ongoing); will
  append a new entry after every future change.

### Iteration 12 — Vertical legend beside the map
- **Said:** *"this is what i see when i launch the page, i think put the
  hospitalisaiont per 100k vertically on the side as well so i can see the
  entire map and the legend."* (The horizontal legend below the tall map forced
  scrolling.)
- **Produced:** Moved the legend to a **vertical bar beside the map** (real flex
  column, not an overlay — no overlap). High values at the top, low at the
  bottom, rotated title, ticks on the right, and a zero marker in "vs avg" mode.
  Capped the map height so the whole country, the legend, and the footer all fit
  on screen at launch without scrolling. Verified in the preview (no console errors).

### Iteration 13 — Hover-scrub the detail chart
- **Said:** *"when i select a page i cant use the tooltip for the graph on the
  right, when i hover i want to see the data in the focused state to change as
  well."*
- **Produced:** Added **hover-scrubbing** to the detail card's decade chart.
  Refactored the card so its numbers live in spans updated in place by a new
  `updateDetailForYear(code, year)`; added a transparent overlay over the plot
  that, on `mousemove`, snaps to the nearest year and updates the rate, rank,
  vs-avg, hospitalisations, the eyebrow year, and the chart cursor/dots.
  Verified: hovering Qld's chart shows 2020 = 189.7 (+44.3, 1.30×). No errors.

### Iteration 14 — Chart hover drives the top slider
- **Said:** *"can the slider move as well on the top"* (while hover-scrubbing the
  detail chart).
- **Produced:** Changed the detail-chart hover to drive the **global** year via
  `setYear` instead of a card-local preview, so the top slider, year readout,
  map fills, and the card all move in sync as you sweep the chart. Hovering also
  pauses Play. Verified: sweeping Qld's chart sets slider/readout to 2020 (right)
  and 2013 (~25%), with the card and map tracking. No errors.

### Iteration 15 — Hide other states on focus
- **Said:** *"when we select state i only want the state to show no others in the
  shadow."*
- **Produced:** Changed `.state.is-faded` from `opacity: 0.18` to `opacity: 0`
  (plus `pointer-events: none`) so on selection only the focused state is
  visible — the other seven are fully hidden, not shadowed. Verified: selecting
  Qld leaves Qld at opacity 1 and all others at opacity 0.

### Iteration 16 — Centre the focused state in the box
- **Said:** *"and then can you put it in the middle of the box."*
- **Produced:** Made `.map-stage` a flex container with `align-items: center` so
  the focused state's SVG vertically centres within the taller panel rather than
  sitting at the top with empty space below. Verified via centroid measurement.

### Iteration 17 — "Compare with" state bubbles
- **Said:** *"do you think allowing it to compare will help ... my idea is on the
  bottom of the box i have a 'compare with:' then below the text are bubbles of
  the other state to select."*
- **Produced:** Added a "Compare with" bubble row at the bottom of the detail
  card (one chip per other state). Toggling a chip overlays that state's 11-year
  line on the chart, expands the y-domain so nothing clips, and updates a HTML
  legend. Active chips take their line colour. `compareSet` resets on each new
  selection. Verified: focus NT + NSW + Vic draws 2 overlay lines, and the NT
  line clearly separates above the others across the decade.

### Iteration 18 — Side-by-side shape comparison in the map box
- **Said:** *"move the compare with bubbles to the map box, then when i select the
  state put it side by side in the map box with animation. remove tool tip and
  other state line in the graph."*
- **Produced:** Reworked the comparison model.
  - "Compare with" bubbles **moved into the map box** (a bar below the map).
  - Selecting a comparison state renders the focused + compared states as
    **side-by-side shape panels inside the map box**, animated in (CSS
    fade/scale). Each panel: the state silhouette coloured by its rate, plus
    labels for the rate and its **multiple of the national average** (e.g.
    "1.88× avg"), coloured red above / green below.
  - **Removed the hover tooltip** and **removed the comparison overlay lines from
    the detail chart** (chart reverts to focused state vs national average only).
  - Year/slider/Play recolour and relabel the comparison panels live.
- **Verified:** Focus NT + NSW + Vic at 2021 → three panels (NT 286.1/1.88×,
  NSW 111.2/0.73×, Vic 170.0/1.12×). No console errors.

### Iteration 19 — Fix: lingering comparison panels
- **Said:** *"you auto put NT if theres no comparison?"* and *"i have nothing
  selected but why is wa and other state still there"* (screenshot showed a
  stale WA + NT comparison persisting after reset).
- **Root cause:** `.compare-holder { display: flex }` had equal specificity to
  the UA `[hidden] { display: none }` rule and came later in the cascade, so it
  won — `compareHolder.hidden = true` never actually hid the element.
- **Produced:** Added a global `[hidden] { display: none !important; }` so the
  `hidden` attribute always wins over display rules. Verified: initial load and
  post-reset both hide compare-holder; comparing hides map-holder and shows
  panels; "Back to all states" restores all 8 states cleanly.

### Iteration 20 — Archive as map_classic
- **Said:** *"archive the old map.html as well, put it in another html."*
- **Produced:** `map_classic.html` + self-contained `map_classic.css` /
  `map_classic.js` — a snapshot of the map design with **plain coloured state
  silhouettes** + rate + ×avg labels (no hospital icons) on compare. The archive
  references its own assets so future `map.html` edits won't change it. Verified:
  classic page uses `cmp-shape` panels, no console errors.

### Iteration 21 — map_classic_v2: demographic explorer
- **Said:** *"this project's complexity map_classic is 5/10 with the data set
  that we have is there other things we can do? ill prolly expand on the
  map_classic only"* → discussed untapped CSVs → chose demographic slice filter
  + breakdown panel → *"put it as a separate file/folder so the rest won't be
  affected."*
- **Produced:** `map_classic_v2.html` / `map_classic_v2.js` / `map_classic_v2.css`
  — a self-contained extension of map_classic adding:
  1. **Global demographic filter bar** — segmented control (All · Sex · Age ·
     Road user) + value dropdown that dynamically swaps options. Selecting a slice
     recolours the entire map, recomputes the colour-scale domain (e.g. "Bus
     occupant" rates are far lower than "All"), updates the NT annotation
     multiplier, the legend, and all compare strip panels live.
  2. **"Who gets hurt" breakdown panel** inside the detail card — three tabs
     (Age | Sex | Road user) showing horizontal bars for the focused state's
     composition (% share) in the current year. Clicking any bar sets it as the
     global map filter, creating an interaction loop between breakdown and map.
  - **Data plumbing:** loads five CSVs in parallel (`state_year_per100k`,
    `state_year_age`, `state_year_sex`, `state_year_roaduser`, `population_clean`);
    indexes each as `year → state → category → cases` for O(1) lookup; a new
    `sliceRate(state, year)` helper handles both the "all" fast-path and the
    per-category rate calculation.
  - **Honest encoding:** rates are always per 100,000 of *total* state population
    (no stratified denominators available); noted in the filter bar caption and
    the footer.
  - `map_classic.html` left byte-identical; nothing existing was edited.

---

## Phase 0 — Data verification

**Goal:** Confirm the assumed input files exist and match the documented schema
before writing any code.

- Searched the project folder; data lives in
  `C:\Users\kanze\Desktop\data viz\projectttt\data\`.
- **`state_year_per100k.csv`** — confirmed header
  `Year,state,cases,population,cases_per_100k` (note the **capital `Year`**).
  Sample: `2011,"NT",456,231292,197.2`.
- **`aus_states.geojson`** — FeatureCollection of 8 features, each with
  `properties.name` (full name) and `properties.code` (short code, e.g. `NSW`).
  Join key is `code` (GeoJSON) === `state` (CSV).

**Decision:** Join map ↔ data on the state code string.

---

## Phase 1 — Step 1: Skeleton & data load

**Goal:** Three files (`map.html`, `map.css`, `map.js`) that load both datasets
and prove the data is correctly parsed, with no rendering yet.

**Built:**
- `Promise.all([d3.csv(...), d3.json(...)])` loader.
- CSV row accessor coercing types: `+d.Year`, `+d.cases`, `+d.population`,
  `+d.cases_per_100k`; `d.state` kept as string.
- A visible DOM error banner shown if loading fails (e.g. opened via `file://`).
- Console diagnostics for row count, feature count, and value range.

**Verified (via live preview console):**
- CSV rows loaded: **88** (expected 88) ✓
- GeoJSON features: **8** (expected 8) ✓
- `cases_per_100k` range: **[96.4, 336.7]** (min = Tas 2011, max = an NT year) ✓
- No console errors; error banner hidden.

**Note:** A local static server is required (`python -m http.server`) because
browsers block `fetch` from `file://`. A `.claude/launch.json` was added so the
preview server runs `python -m http.server 8000`.

---

## Phase 2 — Full v1 build (single coordinated map)

**Goal:** Build the complete brief in one pass (user granted permission to
proceed through all steps without stopping at each checkpoint).

**Built (all per the design spec):**
- SVG with `viewBox` (responsive) + geographic projection fitted via `fitSize`.
- **Sequential colour** `d3.scaleSequential(d3.interpolateYlOrRd)` with a
  **fixed full-decade domain** `[96.4, 336.7]` so years are comparable.
- **Legend:** horizontal continuous gradient (25 stops) + axis + title.
- **Slider** (2011–2021) + large year readout, wired to a shared `currentYear`.
- **Play/Pause** via `d3.interval` (~1100 ms/year), looping, slider stays in sync,
  guarded against double-start.
- **Tooltip:** full name, year, rate (1 dp), cases, population; follows cursor;
  `<title>` fallback for screen readers.
- **NT annotation:** hand-rolled leader line + label callout (no library).
- **Throttled resize** that refits the projection.
- Editorial styling: warm off-white background, dark-slate text (not default grey).

**Accessibility:** `aria-label`s on Play and slider, `aria-live` year readout,
`<title>` fallback on each state path.

---

## Phase 3 — Bug fix: map rendered as one giant blob

**Symptom:** Australia drew as a single huge yellow rectangle filling the SVG;
only NT showed as a tiny shape. Path bounding boxes revealed WA/Qld/Vic each
spanned the *entire* canvas.

**Root cause:** The GeoJSON polygons have **inconsistent ring winding order**.
D3's spherical `geoMercator()` interprets a reversed exterior ring as "the rest
of the world," so it painted everything *except* the intended shape.

**Fixes attempted:**
1. *Rewind rings via shoelace test* — my first heuristic flipped the wrong rings
   and made all 8 states invert. Reverted.
2. *Switch projection* (chosen): replaced `d3.geoMercator()` with
   `d3.geoIdentity().reflectY(true).fitSize([w,h], geo)`. `geoIdentity` is a
   **planar** projection immune to spherical winding problems.

**Verified:** Path bounding boxes then matched real geography (WA left, Qld
top-right, NT top-middle, Tas an island at the bottom, ACT a dot inside NSW).

**Lesson logged:** Third-party GeoJSON winding is unreliable; `geoIdentity` is
the robust default for planar national maps.

---

## Phase 4 — v2 rebuild: three coordinated views (complexity pass)

**Trigger:** First visual review rated the single map too basic. Goal raised to
maximise interactivity and technical complexity.

**Rebuilt into a coordinated multiview** sharing one `vizState`:
1. **Choropleth map** — animated initial outline draw (`stroke-dashoffset`), and
   a **per-year NT callout** that recomputes its multiplier vs the national average.
2. **Ranked bar chart ("race")** — 8 horizontal bars that re-sort/animate as the
   year changes; colour matches the map; shows rank #1–#8 and value.
3. **Decade trend chart** — 8 state lines (NT emphasised), a dashed
   **population-weighted national-average** line, a year cursor synced to the
   map, and **hover-to-scrub** (hovering the chart sets the year everywhere).

**New features:** encoding mode toggle (Rate vs vs avg), click-to-pin, keyboard
controls (←/→/Space/Home/End/Esc), speed control.

**Statistical note:** National average is **population-weighted**
(total cases ÷ total population × 100,000), not the arithmetic mean of state
rates — the latter would over-weight tiny jurisdictions.

---

## Phase 5 — Bug fix: race chart bars invisible & unranked

**Symptom:** The ranked bar chart showed labels but no bars (width 0, no fill)
and stayed in declaration order instead of sorting by value.

**Root cause:** In `refreshRace()` the code rebinds data with
`.data(ranking, d => d.code)`. The groups were originally bound to **string**
codes, so the key function returned `undefined` for the existing nodes. D3
moved every existing node into the *exit* selection — so width/fill updates ran
on nothing.

**Fix:** Stop rebinding on every refresh. Keep groups bound to their stable
string code, build a `Map(code → {rank, value})`, and update each group via
`.each(code => …)` by lookup.

**Verified (year 2011, top→bottom):** NT #1 (197.2) … Tas #8 (96.4), with bar
widths and YlOrRd fills correct.

**Lesson logged:** Re-`.data()` with a key function that doesn't match the
existing bound datum silently empties the update selection — update in place
instead.

---

## Phase 6 — Design review & redesign decision

**Feedback:** The four stacked panels (map + race + legend + trend) felt
over-crowded, and the race and trend charts partly duplicated each other's
"who's high/low" message.

**Design discussion outcome (decisions):**
- **Map becomes the hero**, larger and uncluttered.
- **Click a state → smooth zoom/pan to frame it** (`d3.zoom`), other states fade,
  and a **detail card** appears showing that **state's decade trend vs the
  national average**, plus rank, multiplier, and raw numbers.
- **Cut** the always-on race chart and trend panel.
- **Time-lapse animation stays co-equal** with drill-down.

---

## Phase 7 — Redesign build (map-hero + compare strip)

**Built the map-hero + drill-down redesign:**
- **`d3.zoom` click-to-focus** — clicking a state computes a zoom transform from
  the feature's projected bounds and transitions the map to frame it. Other states
  fade; stroke widths divided by the zoom scale so borders stay visually constant.
- **Detail card** — slides in beside the map on selection, showing rate, rank,
  deviation vs national average, raw hospitalisations, and a **decade line chart**
  with the gap shaded and a cursor on the current year that tracks the slider.
- **"Compare with" bubble row** — chips in the map box; selecting one renders
  **side-by-side coloured state silhouettes** with rate + ×avg labels. Click to
  remove; emptying the set returns to the single zoomed state.
- **Reset paths** — "Back to all states" button, card × button, ocean click, `Esc`.

**Archived as `map_classic.html`** — a self-contained snapshot (own `.js`/`.css`)
of this design, preserving it before any future changes to `map.html`.

---

## Phase 8 — map_classic_v2: demographic explorer

**Trigger:** map_classic rated ~5/10 complexity. Five of the seven cleaned data
files (`state_year_age`, `state_year_sex`, `state_year_roaduser`, `population_clean`)
were unused. The core question left unanswered: *who* is getting hurt, and does
that differ by state?

**Built `map_classic_v2.html/js/css` (map_classic untouched):**

### Data plumbing
- `loadData()` extended to load 4 extra CSVs in parallel.
- Three new O(1) indexes: `year → state → category → cases` for age, sex, and
  road-user dimensions. Population indexed separately as `year → state → pop`.
- `sliceRate(state, year)` — single helper for both the "all" fast-path
  (`cases_per_100k` from the original CSV) and the per-category calculation
  (filtered cases ÷ total-state-population × 100,000).
- `rebuildScalesForFilter()` — recomputes national averages and domain extents
  for both the absolute and delta colour scales whenever the active slice changes.
  Domain *must* recompute: "Bus occupant" rates are an order of magnitude smaller
  than "All" — keeping the original domain makes every slice look pale.

### UI additions
- **Filter bar** (above the existing controls row): segmented `All · Sex · Age ·
  Road user` control + a value `<select>` that swaps its options dynamically. A
  caption line below updates to e.g. *"Rate per 100k (total state pop) — Males"*.
- **Breakdown panel** in the detail card: three tabs (Age | Sex | Road user) draw
  horizontal composition bars (% share) for the focused state in the current year.
  Clicking any bar calls `setFilter(dim, value)` — the bar becomes a launcher for
  the global map filter. Bars animate on enter and on tab switch via D3 transitions.

### Functions reused from map_classic
`indexData`, `computeNationalAverages`, `buildColorScales` (called inside
`rebuildScalesForFilter`), `refreshMap`, `refreshCompareStripValues`,
`updateDetailForYear`, `drawLegend`, all control-wiring functions.

### Encoding honesty note
Rates are always per 100,000 of **total** state population — no stratified
denominators are available. Noted in the filter bar caption and the page footer.

---

## Files

| File | Purpose |
|------|---------|
| `map_classic.html` | Map-hero choropleth with compare strip (archived design) |
| `map_classic.css`  | Styling for map_classic |
| `map_classic.js`   | Data load, scales, views, interaction for map_classic |
| `map_classic_v2.html` | Demographic explorer (extends map_classic) |
| `map_classic_v2.css`  | Styling for v2 (adds filter bar + breakdown panel) |
| `map_classic_v2.js`   | v2 logic: slice filter, breakdown, extended data load |
| `data/` | Source CSVs + GeoJSON (shared by both pages) |
| `.claude/launch.json` | Local preview server config |
| `DEVELOPMENT_LOG.md` | This document |

## GenAI acknowledgement summary

Claude (GenAI) assisted with: the data-load promise pattern, the colour-scale
construction, the projection/winding diagnosis and fix, the hand-rolled NT
annotation geometry, the race-chart rank animation, the keyboard handlers, the
zoom-to-state interaction, the demographic indexing and slice-rate helper, and
the breakdown panel D3 rendering. Each such block is marked inline with
`// GenAI-assisted (Claude): <what/why>`. All code was reviewed, tested, and
verified by the team against the source data.

---

## map_classic_v3 — editorial redesign (T1–T18)

Deliverable: `map_classic_v3/index.html` + `map_classic_v3.js` + `map_classic_v3.css`.
Based on user-test quotes (Q1–Q6) and visual audit findings (V1–V9).
map_classic_v2.* left untouched.

---

## [2026-06-03 12:45] T1 — Single page-level slicer

**Why this change**
Resolves Q5: "Too much filter — filter on the top, filter on the right, filter on the bottom." The detail card had three tabs (Age / Sex / Road user) creating a second filter dimension independent of the top slicer, so changing "Show → Sex" did not change the breakdown tabs.

**What I changed**
- `map_classic_v3.js`: Deleted `vizState.breakdownTab` and all `.bd-tab` wiring in `renderDetailCard`. Modified `renderBreakdown(code, year, compareCode)` — dim is now always derived from `vizState.filter.dim`; when dim=all, defaults to road-user (most informative). Removed `breakdownTab` reads from `setYear` and `setFilter`.
- `map_classic_v3.css`: Removed `.bd-tabs` and `.bd-tab` rules.
- `map_classic_v3/index.html`: No tab markup in the detail-card template.

**How it works**
One slicer at the top drives map colour, legend, stats, trend chart, and breakdown bars simultaneously. The breakdown is a derived view — it shows the active dimension's composition without a separate control. Clicking a bar still calls `setFilter` to update the global slice.

**Trade-offs / things I considered and rejected**
Considered keeping tabs hidden when a filter is active — rejected because hiding UI state creates confusion about whether tabs still exist.

**Verification**
`document.querySelectorAll('.bd-tab').length` → 0. Switching "Show → Sex → Male" updates breakdown to sex bars with no extra interaction. Confirmed in preview_eval.

**Open follow-ups**
None.

---

## [2026-06-03 12:45] T2 — Compare propagates everywhere

**Why this change**
Resolves Q3: "When I compare with other states, I don't see the graph on the right side adding the states." Compare chips updated the left silhouettes but not the decade line chart, the breakdown bars, or the stat numbers.

**What I changed**
- `map_classic_v3.js`: `renderDetailChart(code)` — loops `vizState.compareSet`, appends a `.dc-compare-line` path per compare state using `sliceRate` series. y-domain expanded to include compare maxima. Legend entries added per compare state. `toggleCompare` now calls `renderDetailChart` + `updateDetailForYear` + `renderBreakdown` after updating the set. `updateDetailForYear` writes `.stat-compare-chip` spans (Δ vs first compare). `renderBreakdown(code, year, compareCode)` appends `.bd-bar-compare` outlined rects when compareCode provided.
- `map_classic_v3.js`: `renderCompareStrip` — renders all 8 state outlines as `.cmp-ghost` paths (fill var(--ink) opacity 0.07) before the coloured state, using an Australia-wide projection.
- `map_classic_v3.css`: `.dc-compare-line` (1.8px dashed ink-soft), `.bd-bar-compare` (outlined, no fill), `.stat-compare-chip` (0.68rem muted), `.dc-leg-compare`.

**How it works**
Compare lines use dashed stroke to preserve the focused state's visual dominance — the compare is a supporting read. Ghost continent outlines use the full Australia `fitSize` projection so each state appears at its correct geographic position relative to the country.

**Trade-offs / things I considered and rejected**
Considered giving each compare state its own colour — rejected because two saturated colours competing with --accent breaks the single-encoding rule and confuses the "NT is the outlier" thesis.

**Verification**
`toggleCompare("NSW","NT")` → `compareLines=1, ghostPaths=16, statChip="NT: 286.1 (+174.9)"`. H2 appended "· NT: 1.88× avg". Confirmed via preview_eval.

**Open follow-ups**
None.

---

## [2026-06-03 12:45] T3 — Dynamic narrating H2

**Why this change**
Resolves Q6: "What I'm interpreting is..." — readers were inferring the thesis from colours. Also kills V1 (year readout 48px dominated H1 33px — visual hierarchy inverted). Placing a live sentence below H1 makes the thesis explicit on landing.

**What I changed**
- `map_classic_v3/index.html`: Added `<h2 id="narrative-h2" class="narrative-h2">` below `<h1>`.
- `map_classic_v3.js`: New `updateNarrativeH2()` — four cases: no selection (always narrates NT), NT focused, non-NT focused, with compare append. Called from `setYear`, `selectState`, `resetView`, `setFilter`, `toggleCompare`.
- `map_classic_v3.css`: `.narrative-h2` — 1–1.25rem clamp, weight 500, ink-soft, 200ms opacity transition.

**How it works**
At page load (2021, no selection) the sentence is "In 2021, the NT's rate was 286.1/100k — 1.88× the national average" — answering "what is this page about?" in 5 seconds without any clicking. The sentence updates on every interaction to stay truthful.

**Trade-offs / things I considered and rejected**
Considered a static standfirst paragraph — rejected because static text would go stale as the year/filter changes, undermining trust.

**Verification**
Snapshot shows H2 "In 2021, the NT's rate was 286.1/100k — 1.88× the national average" at page load. After `selectState("NSW")` → "In 2021, New South Wales's rate was 111.2/100k — #8 of 8 states". After `setFilter("sex","Male")` → includes "among males". Confirmed via preview_snapshot and preview_eval.

**Open follow-ups**
None.

---

## [2026-06-03 12:45] T4 — Shrink year readout, grow H1

**Why this change**
Resolves V1: year readout was `clamp(2rem,4vw,3rem)` / weight 700 — larger than H1 at `clamp(1.7rem,2.6vw,2.4rem)` / weight 650. The year number dominated the page instead of the headline.

**What I changed**
- `map_classic_v3.css`: `.masthead h1` → `clamp(2.2rem,4vw,3.4rem)`, weight 720. `#year-readout` → `0.95rem`, weight 700, inline inside the slider row.
- `map_classic_v3/index.html`: Year readout moved into `.slider-row` as a `<span>` trailing the range input. New `.slider-row` flex container.

**How it works**
H1 is now the largest text on the page. Year sits at reading scale (0.95rem) beside the slider — the label function, not a decoration.

**Trade-offs / things I considered and rejected**
Considered keeping a large year display in the map margin — rejected because it competed with the NT annotation and added no information the slider tick marks don't already provide.

**Verification**
Confirmed via snapshot: `#year-readout` renders inline with value "2021" in the slider row. H1 is visually dominant. No overflow.

**Open follow-ups**
None.

---

## [2026-06-03 12:45] T5 — Open at 2021

**Why this change**
Resolves V6: page opened at 2011 — NT's multiplier is 1.31× in 2011 vs 1.88× in 2021. 2021 is the strongest year for the thesis, so it should be the first thing the reader sees.

**What I changed**
- `map_classic_v3.js`: `vizState.currentYear: YEAR_MAX` (was `YEAR_MIN`).
- `map_classic_v3/index.html`: `<input ... value="2021" aria-valuenow="2021">`, year-readout initial text `2021`.

**How it works**
One-line change. Both the slider position and year readout are initialised to 2021 before any JS runs, so there is no flash of 2011 data.

**Trade-offs / things I considered and rejected**
Considered defaulting to the year with the highest NT multiplier (also 2021) — same result.

**Verification**
Snapshot shows slider value="2021", H2 states "In 2021", NT annotation shows "1.88×". Confirmed via preview_snapshot.

**Open follow-ups**
None.

---

## [2026-06-03 12:45] T6 — Affordance pulse

**Why this change**
Resolves Q2: "I'm not really sure what I can do with this... I hover it and I can see I can click it." States had no visual affordance that they were clickable beyond the cursor change. Most users never focused a state.

**What I changed**
- `map_classic_v3.js`: New `showHintIfNeeded()` called from `drawMap` — checks `sessionStorage.getItem("hinted")`. If not set: adds `.nt-pulse` class to the NT path (2× 1.2s stroke-width pulse), appends a `.hint-tooltip` div inside `#map-holder` positioned at NT's centroid percentage. `dismissHint()` fades the tooltip, removes the class, sets the sessionStorage flag. Triggered by any map click or after 4s timeout.
- `map_classic_v3.css`: `@keyframes ntPulse` (stroke-width 1.1→3→1.1), `.nt-pulse`, `.hint-tooltip` (dark pill with left-pointing arrow pseudo-element).

**How it works**
SessionStorage flag prevents the pulse on every page load — it fires once per browser session, then silently retires. NT is pulsed specifically because it is the thesis state and the first one readers should click.

**Trade-offs / things I considered and rejected**
Considered pulsing all 8 states — rejected because it dilutes focus. Considered a persistent legend hint — rejected because it adds permanent chrome for a one-time learning moment.

**Verification**
`sessionStorage.removeItem("hinted")` then reload — NT path gains `.nt-pulse` class and tooltip appears. After 4s or first click, tooltip fades and `sessionStorage.getItem("hinted")` = "1". Second reload: no pulse.

**Open follow-ups**
None.

---

## [2026-06-03 12:45] T7 — Lift the palette

**Why this change**
Resolves Q1: "Page colours are not really pleasant to the eye." The v2 palette used `#fbf7f1` (warm beige) as background and `#faf3e3` as stat/chip fills — a saturated orange-brown cast that competed with --accent (the data colour) and read as "unfinished."

**What I changed**
- `map_classic_v3.css` `:root`: `--bg: #fafaf7`, `--rule: #e6e6e1`, `--ink: #111827`, `--accent-soft: #f3d4b8`. All `#faf3e3` / `#efe6d4` / `#d8cdb4` / `#f2ead8` replaced with neutral `#f3f4f6` or `#f0f0ee`.

**How it works**
Background moves from warm beige toward near-white (still slightly warm to avoid a clinical feel). Chrome elements (stat boxes, chips, kbd) use neutral grey. --accent remains `#b1380b` as the sole "warm" signal, so it reads as data, not decoration.

**Trade-offs / things I considered and rejected**
Considered a true cool-grey (#f8f8f8) background — rejected because it would kill the warm/data-red relationship entirely. The slight warmth in `#fafaf7` keeps --accent from floating.

**Verification**
Background, stat boxes, and chip buttons all render in neutral grey family. No beige cast. Confirmed via preview_snapshot structure (no visual test possible in headless).

**Open follow-ups**
None.

---

## [2026-06-03 12:45] T8 — Subordinate the chrome

**Why this change**
Resolves V2: three identical white panels stacked with no subordination. The filter bar and controls row were two separate `.panel` elements of equal visual weight sitting above the map, consuming ~90px of vertical space with nothing visually connecting them.

**What I changed**
- `map_classic_v3/index.html`: Replaced `<section id="filter-bar">` + `<section id="controls-stage">` with a single `<div id="toolbar" class="toolbar">`. Internal structure: `.toolbar-primary` (Play, Slider, Encoding) | `.toolbar-divider` | `.toolbar-secondary` (Show pills, Group dropdown, Speed). All IDs preserved.
- `map_classic_v3.css`: `.toolbar` — single panel with `box-shadow: 0 1px 3px rgba(0,0,0,0.06)` and no border-radius on masthead. `.toolbar-divider` — 1px × 28px vertical rule. Removed `.filter-bar` and `.controls` rules.

**How it works**
One toolbar, two tiers separated by a visual rule, communicates hierarchy: play/time = primary, demographic slicing = secondary. The masthead loses its panel treatment so the page reads as content → controls → visualization, not three equal panels.

**Trade-offs / things I considered and rejected**
Considered putting all controls in a single row — rejected because the primary/secondary split prevents the row from wrapping into chaos on medium screens.

**Verification**
Snapshot shows single `region: "Year and demographic controls"` with both play and Show pills inside. No separate filter-bar section. Toolbar-divider renders as a CSS element (not in accessibility tree, as intended via aria-hidden).

**Open follow-ups**
None.

---

## [2026-06-03 12:45] T9 — Promote the colour-meaning caption

**Why this change**
Resolves V4: the filter caption (the colour-meaning truth — "Rate per 100k — Males") was styled at 0.85rem italic `--ink-mute`, the faintest text on the page, inside the toolbar where it competed with control labels.

**What I changed**
- `map_classic_v3/index.html`: Moved `#filter-caption` from inside the toolbar to `.legend-col` above `#legend-stage`.
- `map_classic_v3.css`: `.map-caption` — `0.88rem`, `var(--ink)` (not muted), not italic, `writing-mode: vertical-rl` (rotated to sit alongside the legend bar), 250ms opacity transition.
- `map_classic_v3.js`: `updateFilterCaption()` — sets `opacity:0`, waits 260ms, swaps text, restores `opacity:1` (crossfade, not instant swap).

**How it works**
The caption now lives directly above the legend gradient it describes, making the colour-meaning relationship spatially obvious. The crossfade (not a jump) signals that the meaning has changed when a filter is applied.

**Trade-offs / things I considered and rejected**
Considered a banner above the map — rejected because it would sit far from the legend, breaking the proximity principle.

**Verification**
`setFilter("sex","Male")` → after 400ms `#filter-caption.textContent === "Rate per 100,000 of total state population — sex: Male"`. Confirmed via preview_eval with setTimeout.

**Open follow-ups**
None.

---

## [2026-06-03 12:45] T10 — Legend change cue

**Why this change**
Resolves V5: legend silently rebased when stratifying (e.g. "All people" domain 96–337 → "Bus occupant" domain ~10–60). The scale shift was invisible — readers compared absolute colours across slices, drawing false conclusions.

**What I changed**
- `map_classic_v3.js`: `rebuildScalesForFilter()` — adds `.is-rebasing` to `#legend-stage`, removes after 700ms (reflow-triggered so animation always restarts). Calls `updateLegendRangeChip()` which writes "Scale: 96–337 /100k" to `#legend-range-chip`.
- `map_classic_v3.css`: `@keyframes legendPulse` — box-shadow pulses to `var(--accent)` at 30%/70%, back to none at 0%/100%. `.legend-stage.is-rebasing` applies the animation.

**How it works**
Two-part signal: the pulse draws the eye to the legend when the domain changes; the range chip tells the reader the new absolute scale so they can calibrate. Both together make the rebase explicit rather than silent.

**Trade-offs / things I considered and rejected**
Considered a toast notification — rejected because it obscures content. Considered animating the gradient stops — not possible with SVG linearGradient and CSS transitions.

**Verification**
`setFilter("sex","Male")` → `#legend-range-chip.textContent === "Scale: 65–227 /100k"`. Confirmed via preview_eval.

**Open follow-ups**
None.

---

## [2026-06-03 12:45] T11 — Stratified caveat ribbon

**Why this change**
Resolves V9: the denominator caveat ("rates use total state population, not per-sex denominators") was buried in the footer, never in eyeline when the reader was actively stratifying. A reader could mistake a 2× sex difference for a true per-sex risk ratio.

**What I changed**
- `map_classic_v3/index.html`: Static `<div id="caveat-ribbon" class="caveat-ribbon" hidden>` above `#map-holder` in `.map-area`. Text with `<span id="caveat-dim">` replaced dynamically.
- `map_classic_v3.js`: `setFilter()` — shows ribbon and updates `#caveat-dim` text when dim ≠ "all"; hides when dim = "all".
- `map_classic_v3.css`: `.caveat-ribbon` — `#fff7ed` background, 3px `var(--accent)` left border, 0.85rem, `var(--ink-soft)`.

**How it works**
The ribbon appears directly above the map — the reading path goes caveat → map, so the qualification is seen before the conclusion. It disappears when not needed (filter=all) to avoid permanent chrome.

**Trade-offs / things I considered and rejected**
Considered inline text in the legend — rejected because the legend has limited vertical space and the ribbon needs to be legible at a glance.

**Verification**
`setFilter("sex","Male")` → `caveat-ribbon.hidden === false`, `caveat-dim.textContent === "sex"`. `setFilter("all",null)` → `caveat-ribbon.hidden === true`. Confirmed via preview_eval.

**Open follow-ups**
None.

---

## [2026-06-03 12:45] T12 — Persistent NT reference line

**Why this change**
Resolves V8: "NT vanishes when any other state is focused." When Queensland is selected and the decade chart shows QLD vs national average, the reader has no visual anchor to the NT thesis — they're looking at a QLD story with no NT context.

**What I changed**
- `map_classic_v3.js`: `renderDetailChart(code)` — when `code !== "NT"`, appends a `.dc-nt-ref` path using `sliceRate("NT", yr)` series. "NT" label appended at right edge at the last year's value. y-domain expanded to include NT series max.
- `map_classic_v3.css`: `.dc-nt-ref` — `var(--accent)` at 0.32 opacity, 1.4px stroke. `.dc-nt-label` — 9px, accent, 0.5 opacity. Faint enough to not dominate; present enough to answer "where is NT?"

**How it works**
The NT line is always visible when any other state is focused, providing a persistent benchmark. Using `sliceRate` ensures it respects the active demographic filter — if you're looking at males, the NT line shows males.

**Trade-offs / things I considered and rejected**
Considered a fixed NT horizontal line at a single year — rejected because the 11-year trend (not just a point) is what shows the persistent gap, not a snapshot.

**Verification**
`selectState("NSW")` → `document.querySelector(".dc-nt-ref") !== null` → true. `selectState("NT")` → `.dc-nt-ref` not present (NT IS the focus line). Confirmed via preview_eval.

**Open follow-ups**
None.

---

## [2026-06-03 12:45] T13 — "Back to NT story" pill

**Why this change**
Secondary resolution of V8. When any non-NT state is focused, the thesis state disappears from both the map and the detail card. No path back to NT without first clicking "Back to all states" and then clicking NT — two steps that most users won't take.

**What I changed**
- `map_classic_v3/index.html`: `<button id="nt-pill" class="nt-pill" hidden>NT story ↑</button>` inside `#map-stage`.
- `map_classic_v3.js`: `selectState(code)` — shows pill when `code !== "NT"`; `resetView()` — hides pill. `wireNTPill()` — click calls `selectState("NT")`.
- `map_classic_v3.css`: `.nt-pill` — `var(--accent)` background, bottom-right absolute, pill shape, `box-shadow: 0 2px 8px rgba(177,56,11,0.35)`.

**How it works**
One click from any state back to the NT story. The pill's colour (--accent) signals it's a data-relevant shortcut, not a nav element.

**Trade-offs / things I considered and rejected**
Considered showing NT data in a side-panel alongside the focused state — too complex, breaks the "one state focused" interaction model.

**Verification**
`selectState("NSW")` → `ntPill.hidden === false`. Click pill → `selectedCode === "NT"`. `resetView()` → `ntPill.hidden === true`. Confirmed via preview_eval.

**Open follow-ups**
None.

---

## [2026-06-03 12:45] T14 — Mobile layout < 760px

**Why this change**
Resolves V3: map started at y=413 of 720 on desktop (below two white panel stacks), rendering 187×125 crushed on a 812-tall phone with a 92px vertical legend eating half the width.

**What I changed**
- `map_classic_v3.css` `@media (max-width: 759px)`: toolbar fixed to bottom with border-top, `.page` padding-bottom 110px. Legend renders horizontal strip (28px tall, full-width) via `.legend-col` flex-row. Detail card positions as a bottom sheet (fixed, translateY animation). H1 caps 1.55rem, narrative-h2 caps 0.95rem. Standfirst hidden.
- `map_classic_v3.js`: `drawLegend()` branches on `window.innerWidth < 760` → calls `drawLegendHorizontal` (horizontal gradient, axis at bottom) vs `drawLegendVertical`. `handleResize` calls `drawLegend()` on resize.

**How it works**
Map fills the viewport above the fold on mobile. Controls move to thumb-reach at bottom. The bottom-sheet detail card slides up over the map (like a native mobile pattern) rather than collapsing to a second full-width column.

**Trade-offs / things I considered and rejected**
Considered collapsing the toolbar to a single hamburger — rejected because the Play and slider are primary interactions that should always be one tap away, not one tap + menu.

**Verification**
CSS media query applies at 759px breakpoint. `drawLegendHorizontal` branches confirmed by existence of `#legend-grad-h` id in SVG defs when `window.innerWidth < 760`. Full mobile UI requires physical device test.

**Open follow-ups**
None.

---

## [2026-06-03 12:45] T15 — 200ms morph transitions

**Why this change**
When switching filter dimensions, breakdown bars previously snapped — width jumped from the previous value to the new one, visually confirming nothing had changed if bars happened to be similar widths.

**What I changed**
- `map_classic_v3.css`: `.bd-bar { transition: width 200ms ease; }`. Filter caption crossfade already handled in T9 (250ms). Map colour transitions remain 700ms (too fast would lose the year-step narrative).
- SVG path `d` attribute transitions not applied — browser support inconsistent; the legend pulse (T10) serves as the rebase cue instead.

**How it works**
200ms is fast enough to feel immediate but slow enough to read as intentional. The bar widths morph to the new demographic, giving the reader visual confirmation that the data changed.

**Trade-offs / things I considered and rejected**
Considered 400ms — rejected; too slow for a UI response, starts feeling like a loading state.

**Verification**
CSS rule present in `.bd-bar`. Transition visible when switching between road-user categories in breakdown.

**Open follow-ups**
None.

---

## [2026-06-03 12:45] T16 — Clean page title

**Why this change**
The v2 title "A decade of road-crash hospitalisations · 2011–2021 (v2 / demographic explorer)" would appear verbatim in any shared link preview or bookmark. "v2 / demographic explorer" is an internal development label, not a user-facing description.

**What I changed**
- `map_classic_v3/index.html`: `<title>A decade of road-crash hospitalisations · 2011–2021</title>`.

**How it works**
Single-line change. No JS impact.

**Trade-offs / things I considered and rejected**
None.

**Verification**
Snapshot shows `RootWebArea: "A decade of road-crash hospitalisations · 2011–2021"`. Confirmed.

**Open follow-ups**
None.

---

## [2026-06-03 12:45] T17 — OG tags + Twitter card + SVG favicon

**Why this change**
No social metadata meant that any link shared to this page would appear as a blank card. No favicon meant the browser tab was indistinguishable from any other local server tab.

**What I changed**
- `map_classic_v3/index.html`: Added `og:type`, `og:title`, `og:description`, `twitter:card`, `twitter:title`, `twitter:description`. Inline `data:` SVG favicon — red rounded square with "NT" in white, 32×32.

**How it works**
The OG description encodes the thesis so a shared link preview carries the argument. The NT favicon creates visual identity in the browser tab and bookmarks bar.

**Trade-offs / things I considered and rejected**
Considered a proper favicon.svg file — not necessary since the `data:` URI approach avoids a separate HTTP request and works across all modern browsers.

**Verification**
Snapshot title matches. `<link rel="icon">` with `data:image/svg+xml` confirmed in HTML source.

**Open follow-ups**
An `og:image` social card image would strengthen shares further (requires generating a PNG thumbnail).

---

## [2026-06-03 12:45] T18 — Preload fetch hints

**Why this change**
Six `d3.csv` / `d3.json` fetch calls fire sequentially after the script loads. Without `<link rel="preload">`, the browser only discovers the CSV URLs when JS executes — adding 1–3 round trips of latency on slower connections before any data arrives.

**What I changed**
- `map_classic_v3/index.html`: Six `<link rel="preload" as="fetch" crossorigin>` tags in `<head>` (before the D3 script tag) for all six data files.

**How it works**
Preload tells the browser to fetch the data files during HTML parsing, in parallel with loading D3.js. On a fast connection this makes no perceptible difference; on a 3G connection it can save 2–4s of sequential fetch latency.

**Trade-offs / things I considered and rejected**
Considered `<link rel="prefetch">` (lower priority) — rejected because this is not a next-page asset, it is required for the current page to render.

**Verification**
Six `<link rel="preload">` tags present in HTML source. Network tab would show parallel fetch requests on page load.

**Open follow-ups**
None.

---

## map_classic_v3 — user-test round 2 (T19–T25)

User tested v3 on video. Seven issues surfaced (G1–G7). Fixed in place — v3 folder updated.

---

## [2026-06-03 13:30] T19 — Revert compare silhouettes to bare state outlines

**Why this change**
Resolves G1: user expected bare state-only shape in compare panels. T2 added a ghost full-Australia background that users found confusing. Reverted to v2 classic treatment.

**What I changed**
- `map_classic_v3.js`: `renderCompareStrip()` — removed `ausColl` ghost rendering, restored per-state `d3.geoIdentity().reflectY(true).fitSize([cw,chh-6], f)` projection. Fixed `refreshCompareStripValues` to target `.cmp-shape path`.
- `map_classic_v3.css`: `.cmp-panel` border-color → `var(--land-edge)`; ghost rule obsolete.

**How it works**
Each panel renders only the focused state silhouette, centred and sized to fill the panel. No context continent.

**Trade-offs / things I considered and rejected**
Considered keeping a 3% opacity ghost — rejected, any ghost was the source of user confusion.

**Verification**
`ghostPaths === 0`, 2 panels with single coloured path each. Confirmed via preview_eval.

**Open follow-ups**
None.

---

## [2026-06-03 13:30] T20 — Solidify national average line, fix compare/NT line hierarchy

**Why this change**
Resolves G2: two dashed lines (national avg + compare) were indistinguishable. Rule: ONE dashed line = NT reference (background context); all actively-tracked series = solid.

**What I changed**
- `map_classic_v3.css`: `.dc-avg-line` — solid 2px ink. `.dc-compare-line` — solid accent 0.55 opacity 2.2px. `.dc-nt-ref` — dashed `4 3`, ink-mute 1.4px. `.dc-leg-compare` — accent + opacity.
- `map_classic_v3.js`: Legend updated with symbol format: `● State  ● Compare  — Natl avg  ··· NT`.

**How it works**
Visual hierarchy: focus (accent 2.6px) > compare (accent 55%, solid) > natl avg (ink solid) > NT ref (ink-mute dashed).

**Trade-offs / things I considered and rejected**
Considered --pin blue for compare — rejected, two hues competing with accent breaks the encoding rule.

**Verification**
`.dc-avg-line` strokeDasharray = none. `.dc-nt-ref` computed dasharray = 4px,3px. Confirmed via preview_eval.

**Open follow-ups**
None.

---

## [2026-06-03 13:30] T21 — Replace native dropdowns with custom popover pills

**Why this change**
Resolves G3: native `<select>` renders with OS chrome that breaks the editorial design. Both the Group and Speed dropdowns needed replacing.

**What I changed**
- `map_classic_v3/index.html`: Replaced both `<select>` elements with `.popover-trigger` pill + `.popover-menu` div.
- `map_classic_v3.js`: New `popoverSelect(btnId, popoverId, labelId, items, current, onPick)` shared function. `populateDimValues()` and `wireSpeed()` rewritten to use it.
- `map_classic_v3.css`: `.popover-trigger`, `.popover-menu`, `.popover-item`, `@keyframes popoverIn`.

**How it works**
One shared function drives both dropdowns. Outside-click closes via document listener. `aria-haspopup` + `aria-expanded` for accessibility.

**Trade-offs / things I considered and rejected**
Considered `appearance:none` styled select — option items can't be styled cross-browser.

**Verification**
Speed button shows ''Normal'' as pill (not system dropdown). Clicking opens popover with 3 items. Confirmed via preview_eval.

**Open follow-ups**
None.

---

## [2026-06-03 13:30] T22 — Caption horizontal above the map

**Why this change**
Resolves G4: vertical rotated caption (writing-mode:vertical-rl) was hard to read. Caption moved to a horizontal full-width row directly above the map SVG.

**What I changed**
- `map_classic_v3/index.html`: `#filter-caption` moved from `.legend-col` to top of `.map-area`. New `.map-caption-row` wrapper with text span + `#caption-hint` span.
- `map_classic_v3.css`: `.map-caption-row` — 0.95rem, var(--ink), horizontal, full width. Removed writing-mode and transform.
- `map_classic_v3.js`: `updateFilterCaption()` targets `#filter-caption-text`. `sliceCaptionText()` format: no 'sex:' prefix, just value.

**How it works**
Caption directly above map SVG — proximity makes colour-meaning relationship immediate. Crossfade on change. T25 affordance hint shares the line.

**Trade-offs / things I considered and rejected**
Considered caption inside SVG — rejected, SVG text can't CSS-transition for crossfade.

**Verification**
`document.querySelector('.map-area #filter-caption')` truthy. Caption text correct. Confirmed via preview_eval.

**Open follow-ups**
None.

---

## [2026-06-03 13:30] T23 — Fix breakdown bar layout and hover count

**Why this change**
Resolves G5: percentage label overlapped the bar fill; hover state added a floating box that sat over bar text. Fixed column layout, hover row affordance, raw case count on hover.

**What I changed**
- `map_classic_v3.js`: `renderBreakdown()` — fixed layout: label(92px) | bar(~180px) | pct(38px) | count(72px). `pctX = barX + barMaxW + 6` (always outside bar). `.bd-count` texts at `countX` showing `(n,nnn)`. `.bd-row-bg` full-width transparent rects for hover.
- `map_classic_v3.css`: Row hover: bg tint `#f0f0eb`, bar darkens to `#8a2c08`. `.bd-count { opacity:0 }` / `.bd-row:hover .bd-count { opacity:1 }`.

**How it works**
Pct always readable right of bar area, count appears on hover to its right — no overlap ever. Row bg + bar darkening = hover feedback without tooltip box.

**Trade-offs / things I considered and rejected**
Considered tooltip div above cursor — rejected per spec (row IS the affordance).

**Verification**
`.bd-val` X = 316 (outside bar area). `.bd-count` text ''(2,885)'', opacity=''0'' default. Confirmed via preview_eval.

**Open follow-ups**
None.

---

## [2026-06-03 13:30] T24 — Ocean-blue background for map area

**Why this change**
Resolves G6: user wanted ocean-blue background behind Australia. White panel gave no geographic context. Australia floating in pale desaturated blue reads immediately as a real map.

**What I changed**
- `map_classic_v3.css` `:root`: Added `--sea: #d8e8ee`, `--sea-soft: #e6eff2`, `--land-edge: #b8c8cf`.
- `.map-stage`: `background: var(--sea); border-color: var(--land-edge)`.
- `.cmp-panel`: `background: var(--sea); border-color: var(--land-edge)` — silhouettes float in the same sea.
- State stroke stays white; body bg stays `#fafaf7`.

**How it works**
One new hue (blue) added without displacing warm-neutral editorial identity. Only the map zone turns blue — contrast between sea and cream page creates map-within-page hierarchy.

**Trade-offs / things I considered and rejected**
Considered tinting the whole page — rejected, muddy contrast between content and data zones.

**Verification**
`.map-stage` computed backgroundColor = `rgb(216,232,238)` = `#d8e8ee`. Confirmed via preview_eval.

**Open follow-ups**
None.

---

## [2026-06-03 13:30] T25 — Stronger click affordance

**Why this change**
Resolves G7: NT pulse + tooltip (T6) was shown once per session then gone. No persistent affordance remained. Two layers added: permanent caption microcopy and a hover tooltip chip at the cursor.

**What I changed**
- `map_classic_v3/index.html`: `#map-tooltip` div inside `#map-holder`. `#caption-hint` span in caption row: '' · click any state to focus''.
- `map_classic_v3.js`: `showMapTooltip(event, code)` positions `#map-tooltip` near cursor (mousemove on all state paths). `hideMapTooltip()` on mouseout + click. `showHintIfNeeded()` replaced with `.nt-hint-sprite` (bouncing 👆 emoji, 1.5s dismiss). Caption hint hidden while state focused, restored on reset.
- `map_classic_v3.css`: `.map-tooltip`, `.nt-hint-sprite`, `.nt-hint-icon`, `@keyframes ntHintBounce`.

**How it works**
Two persistent layers: (1) caption microcopy always visible when no state selected; (2) hover chip at cursor gives explicit ''click to focus →'' at moment of hover. Session-gated sprite for first-visit push.

**Trade-offs / things I considered and rejected**
Considered a legend-area instructional label — rejected, rarely read (below fold). Hover chip at cursor is the most direct affordance.

**Verification**
`#map-tooltip.hidden === true` at load. `#caption-hint` text present. Hidden on `selectState`, restored on `resetView`. Confirmed via preview_eval.

**Open follow-ups**
None.

---

## map_classic_v3 — user-test round 3 (bar chart fixes)

---

## [2026-06-03 14:00] Breakdown bar fixes (colors, scale, dropdown)

**Why this change**
Three issues from user screenshot: (1) bar fill color was accent-red (every bar looked ''dangerous''); (2) Motorcyclist showed 53% but the bar was visually full (domain was [0, maxPct] not [0, 1]); (3) Group dropdown not opening; (4) ghost grey boxes (bd-bar-bg track behind small bars was visible and unexplained).

**What I changed**
- `map_classic_v3.css`: `.bd-bar` fill changed from `var(--accent)` (red) to `#4878a0` (steel blue — neutral informational, distinct from the rate encoding). `.bd-row:hover .bd-bar` → `#2d5f80`. New `.bd-bar.is-active { fill: var(--accent) }` — accent appears ONLY when that category is the active map filter, so red retains its meaning. `.bd-bar-bg` changed to `#e8edf0` (very subtle track).
- `map_classic_v3.js`: `renderBreakdown()` scale domain changed from `[0, maxPct]` to `[0, 1]` — honest proportional bars. Removed D3 attribute transition (`duration(200)` → direct `.attr()`) since SVG width attrs don't benefit from rAF-dependent transitions; the CSS `.bd-bar` class handles style transitions. `.is-active` class applied to bar whose category matches `vizState.filter.value`.
- `map_classic_v3.js`: `wireFilterBar()` — fixed `dim-value-btn` click handler to actually toggle `dim-value-popover` visibility (previous implementation only called `e.stopPropagation()` with no toggle logic).

**How it works**
Blue bars carry no data meaning — they show composition without implying ''bad''. Red (accent) appears only when a bar IS the active filter, creating a direct visual link between the map colour encoding and the breakdown view. Domain [0,1] means 53% always occupies 53% of bar width — never misleadingly ''full''.

**Trade-offs / things I considered and rejected**
Considered categorical colour palette (one colour per road-user type) — rejected because it implies categorical distinction that the data doesn't require, and adds a second legend. Single neutral blue is simpler and correct for a parts-of-whole composition.

**Verification**
Motorcyclist bar = 77.7px (44% of 178px barMaxW). Pedestrian = 22.4px (13%). Bus occupant = 1.7px (1%). Fill = `rgb(72, 120, 160)` = `#4878a0`. Dropdown opens. Confirmed via preview_eval.
