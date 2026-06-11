# AUDIT_REPORT.md — Road Trauma AUS (COS30045)

Recon audit, 2026-06-10. **No files were modified.** All paths relative to repo root. Line numbers verified against working tree at time of audit.

> ⚠ Working tree is **not clean**: `sankey_v1/index.html` is modified and `sankey_v1/sankey.css` / `sankey_v1/sankey.js` are untracked (an in-progress refactor extracting the Sankey page's inline `<style>`/`<script>` into files). Line numbers for sankey files refer to the new extracted files. Last commit: `c1c7c7c`.

---

## 1. Repo map

```
projectttt/
├── index.html                      Home (6.9 KB)
├── about.html                      About (4.9 KB)
├── AUDIT_REPORT.md                 (this file)
├── assets/
│   ├── nav.css                     Shared nav bar, scoped --nav-* tokens (3.0 KB)
│   ├── site.css                    Home/About page styles (9.1 KB)
│   ├── theme.js                    Home/About theme toggle (0.8 KB)
│   └── home.js                     Home stat cards + trend chart (5.6 KB)
├── data/                           7 files, see §2
├── map_classic_v3/
│   ├── index.html                  Chart 1 page (11.2 KB)
│   ├── map_classic_v3.css          (31.1 KB, 1125 lines)
│   └── map_classic_v3.js           (59.0 KB, 1545 lines)
├── sankey_v1/
│   ├── index.html                  Chart 2 page (3.5 KB after refactor)
│   ├── sankey.css                  UNTRACKED (10.0 KB)
│   └── sankey.js                   UNTRACKED (15.0 KB)
├── make_pptx.js                    pptx generator — UNTRACKED (15.4 KB)
├── presentation.pptx               UNTRACKED (444.7 KB)
├── DEVELOPMENT_LOG.md  ·  RESEARCH.md  ·  README.md
└── .claude/launch.json (tracked) · .claude/settings.local.json (untracked)
```

### Pages and what they load

| Page | Title | CSS | JS |
|---|---|---|---|
| `index.html` | "How Bad Is Road Trauma in Australia? · COS30045 Team 1" | Google Fonts `<link>`, `assets/nav.css`, `assets/site.css` | d3 v7 CDN, inline theme pre-paint, `assets/theme.js` (defer), `assets/home.js` (defer) |
| `about.html` | "About · Road Trauma in Australia · COS30045 Team 1" | fonts, `nav.css`, `site.css` | inline pre-paint, `theme.js` (defer). **No D3.** |
| `map_classic_v3/index.html` | "A decade of road-crash hospitalisations · 2011–2021" | `../assets/nav.css`, `map_classic_v3.css?v=2`, inline `<style>` layout fix (lines 24–39) | d3 CDN, inline pre-paint, `map_classic_v3.js?v=1`, inline theme-toggle script (lines 198–214). Also 6 `<link rel="preload">` for data (lines 14–19) |
| `sankey_v1/index.html` | "Road Crash Hospitalisations — Australia" | fonts, `../assets/nav.css`, `sankey.css` | d3 CDN, d3-sankey 0.12.3 CDN (unpkg), inline pre-paint, `sankey.js` |

### Legacy versions
Folder names imply `map_classic` v1/v2 and earlier prototypes existed. They did — `archive/` (18 files), `map_classic/`, `map_classic_v2/` were **deliberately purged** in commit `c1c7c7c` ("Restructure into 4-page site") and exist only in git history. The nav links **only** to `map_classic_v3/` and `sankey_v1/`; nothing dangles. `make_pptx.js` still references the purged folders in screenshot placeholders (lines 152, 164).

---

## 2. Data layer

| File | Size | Columns (verbatim header) | Years | Rows (excl. header) |
|---|---|---|---|---|
| `aus_states.geojson` | 179.6 KB | features with `properties: {name, code}` | — | 8 features (MultiPolygon) |
| `national_trend.csv` | 170 B | `"Year","cases"` ← **capital Y** | 2011–2021 | 11 |
| `state_year_per100k.csv` | 2.7 KB | `"Year","state","cases","population","cases_per_100k"` ← **capital Y** | 2011–2021 | 88 |
| `state_year_age.csv` | 13.6 KB | `"year","age_group","state","cases"` | 2011–2021 | 594 |
| `state_year_sex.csv` | 4.3 KB | `"year","sex","state","cases"` | 2011–2021 | 176 |
| `state_year_roaduser.csv` | 12.4 KB | `"year","road_user","state","cases"` | 2011–2021 | 400 |
| `population_clean.csv` | 1.7 KB | `"population","state","year"` | 2011–2021 | 88 |

**Header-case inconsistency:** `Year` (capital) in per100k + national_trend, `year` (lower) everywhere else. The accessors depend on this exactly — `map_classic_v3.js:85` (`year: +d.Year`), `home.js:27` (`+d.Year`), `sankey.js:71` (`+d.Year` for per100k, `+d.year` for roaduser). Regenerating any CSV with different header case silently breaks parsing (all values become `NaN`).

### Where rates per 100k are computed
1. **Precomputed** in `state_year_per100k.csv` column `cases_per_100k` (used directly by the map's "all" slice and by the Sankey sidebar).
2. **Runtime, map page** — `sliceRate()`, `map_classic_v3.js:161-171`:
   ```js
   return (cases / pop) * 100000;
   ```
3. **Runtime, national average (population-weighted)** — `computeNationalAverages()`, `map_classic_v3.js:115-123`, and the slice-aware twin `computeSliceNationalAverages()` at 173–186:
   ```js
   out.set(year, (tc / tp) * 100000);   // Σcases ÷ Σpopulation
   ```
4. Home page computes no rates.

### Road-user categories — verbatim column values
`"Bus occupant"`, `"Motorcyclist"`, `"Other or unknown"`, `"Pedal cyclist"`, `"Pedestrian"`.
**"Vehicle occupant" does NOT exist as a recorded category.** 2021 recorded totals: Motorcyclist 8,755 · Pedal cyclist 8,065 · Pedestrian 2,297 · Other or unknown 578 · Bus occupant 166 (sum 19,861 ≈ half the 39,035 total — the gap is unrecorded vehicle occupants).
However, **the Sankey derives it**: `sankey.js:96-100` `voCount()` returns `Math.max(0, total - known)` and renders a "Vehicle occupant" node/flow with its own legend colour. See §3 for the tension with the home page caveat.

### Hardcoded numbers vs computed (KPI cards)
- Stat card values are **computed at load** — HTML ships `—` placeholders (`index.html:49,54,59`) filled by `home.js:18-24` from the CSVs.
- **Hardcoded fallbacks** exist at `home.js:11-16`: `{ total2021: 39035, pctChange: "+4.7%", topRoadUser: "Motorcyclist", topRoadUserCases: 8755 }` — used only in the `.catch()` (`home.js:47-49`, e.g. `file://` opens). All four match the data (verified: 2021 = 39,035; (39,035−37,292)/37,292 = +4.67% → "+4.7%"; Motorcyclist 8,755 is top).
- Other hardcoded numbers in HTML: `index.html:39` "**over 400,000 Australians** between 2011 and 2021" (data sum = 403,293 ✓) and the trend chart's aria-label `index.html:71` ("about 33,500 in 2011 to 39,035 in 2021, with a dip in 2020" ✓).

---

## 3. Home page (`index.html` + `assets/home.js`)

**Trend chart** — `drawTrend(data)`, `home.js:51-159`. SVG viewBox 560×230. Y-axis domain (`home.js:63-68`):
```js
.domain([
  Math.floor(d3.min(data, d => d.cases) / 1000) * 1000 - 1000,   // 32,000
  Math.ceil(d3.max(data, d => d.cases) / 1000) * 1000,           // 40,000
])
```
Not zero-based (fine for a line chart, but a marker may ask). All colours via `var(--accent)` etc., so theme flips need no redraw.

**COVID dip annotation** — `home.js:129-144`: finds `data.find(d => d.year === 2020)`, draws a small hollow circle at that point plus `text` "COVID dip" 16px below it. End-point dot + value label "39,035" at 147–158.

**Chart 2 teaser card, exact text** (`index.html:102-111`):
> Chart 2 · Where the burden goes
> **Each state's hospitalisations, traced to who gets hurt**
> A Sankey flow diagram of the hospitalisation burden, state by state. Pick any state and watch its cases flow into road-user groups — motorcyclists, cyclists, pedestrians — for any year of the decade. Still in development: more breakdowns are on the way.
> Open the Sankey →

**KPI card 3 caveat, verbatim:**
- Static HTML (`index.html:60`): `Among recorded categories — vehicle occupants are not separately recorded.`
- Replaced after load by `home.js:22-23`: `"8,755 cases — among recorded categories; vehicle occupants are not separately recorded."`

**Does it contradict the data?** No — per §2 the CSV genuinely has no vehicle-occupant category. **But it creates a cross-page tension:** Chart 2 *displays* a "Vehicle occupant" flow (derived by subtraction, `sankey.js:96-100`) which is typically the largest band. A reader who goes Home → Sankey sees a category the home page just said isn't recorded, with no on-page note that it is derived. (The derivation is documented only in `RESEARCH.md:61-63`.)

---

## 4. Map page (Chart 1)

**Focus-state behaviour** — other states are fully hidden, not dimmed. `selectState()`, `map_classic_v3.js:467-470`:
```js
vizState.gStates.selectAll("path.state")
  .classed("is-selected", d => d.properties.code === code)
  .classed("is-faded",    d => d.properties.code !== code)
```
with `map_classic_v3.css:530`:
```css
.state.is-faded    { opacity: 0; pointer-events: none; }
```
Plus `zoomToState()` (js:448–458) zooms via `d3.zoom` transform, and `.map-main.is-focused` (css:387–392) removes the sea background. Reset: `resetView()` js:489–519, also wired to `Escape`.

**Colour scales** — `buildColorScalesForFilter()`, `map_classic_v3.js:199-204`. Domains span **all years** of the active demographic slice (fixed across the time-lapse; rebased only when the slice changes):
```js
vizState.colorAbs = d3.scaleSequential(d3.interpolateYlOrRd).domain([rmin, rmax]);     // "Rate" mode
const m = Math.max(Math.abs(d3.min(deltas) ?? 0), Math.abs(d3.max(deltas) ?? 0)) || 1;
vizState.colorDelta  = d3.scaleSequential(t => d3.interpolateRdYlBu(1 - t)).domain([-m, m]);  // "vs avg", symmetric about 0
```

**Legend** — `drawLegend()` js:1064–1077 picks vertical (`drawLegendVertical`, js:1079–1124: 92×300 viewBox, 14px-wide gradient bar, `axisRight` ~5 ticks, dashed zero marker + "avg" label in delta mode) or horizontal below 760px (`drawLegendHorizontal`, js:1127–1162: 280×28, ~4 ticks). Tick format `+,.0f` (delta) / `,.0f` (rate). Below it a range chip, `updateLegendRangeChip()` js:240–250, e.g. `Scale: 89–286 /100k`. The legend column is `flex: 0 0 80px` (css:470–477).

**Side panel ("Who's getting hurt")** — `renderBreakdown()`, js:912–997. One SVG row per category; bar width is an honest share of the slice total (js:954–956):
```js
// Domain is always [0, 1] — bars are honest proportions, not scaled to max
const xScale = d3.scaleLinear().domain([0, 1]).range([0, barMaxW]);
```
Percentage always visible, raw count fades in on hover; clicking a row calls `setFilter(dim, d.cat)` (js:962–964), making it a global map filter. The dimension shown follows the top slicer; with "All" active it defaults to road-user (js:916). Panel height/overflow (css:692–700):
```css
.detail-card { ... overflow-y: auto; min-height: 0; ... }
```
and on mobile it becomes a fixed bottom sheet (css:1105–1114): `position: fixed; bottom: 68px; ... max-height: 56vh; overflow-y: auto;`. The panel opens via `.stage-row.has-detail { grid-template-columns: 1.6fr 1fr; }` (css:351–353).

**"NT story ↑" pill** — visible only when a non-NT state is focused (js:476–477). Handler, js:1455–1458:
```js
function wireNTPill() {
  const pill = document.getElementById("nt-pill");
  if (pill) pill.addEventListener("click", () => selectState("NT"));
}
```

**Slider / Play** — `wireSlider()` js:1360–1367 (`input` → `setYear(+e.target.value)`); year label binding in `setYear()` js:1172–1177 updates `#year-readout`, the slider value, and `aria-valuenow`. Play loops 2011→2021 via `d3.interval` (js:1374–1397), speed popover Slow/Normal/Fast = 1800/1100/550 ms (js:1399–1410). **Keyboard support: yes** — js:1461–1482: `Space` play/pause, `←`/`→` step (wrapping), `Home`/`End` jump, `Escape` reset; suppressed while focus is in an input.

**Show toggles (All/Sex/Age/Road user)** — `wireFilterBar()` js:1418–1425 → `setFilter()` js:1309–1355. Changes `vizState.filter` (the single global slicer), then: syncs the pills, populates the "Group" popover (defaults to first category), crossfades the caption, shows the caveat ribbon (`ribbon.hidden = (vizState.filter.dim === "all")`, js:1338), **rebuilds both colour-scale domains** (legend pulses via `rebuildScalesForFilter()`, js:223–238), refreshes map, legend, narrative H2, and — if a state is focused — the detail stats, decade chart, compare strip and breakdown. Sliced rates divide sliced cases by **total** state population (the caveat ribbon exists precisely for this).

---

## 5. Sankey page (Chart 2)

**Structure — the left column is always exactly one state node.** Node/link construction, `sankey.js:233-241`:
```js
const nodes = [
  { id:'state:'+state, name:FULL[state], type:'state', code:state },
  ...RU_ORDER.map(ru => ({ id:'ru:'+ru, name:ru, type:'ru', cat:ru }))
];
const links = RU_ORDER.map(ru => ({
  source: 'state:'+state,
  target: 'ru:'+ru,
  value: Math.max(0, ru === 'Vehicle occupant' ? vo : (raw[ru]||0))
})).filter(l => l.value > 0);
```
There is no multi-state or national→state view; selecting a state re-renders the whole diagram (`render(state)` wipes the SVG, `sankey.js:217-220`). Clicking the active state again deselects to the empty state ("select a state to view flow").

**Minimum link/node size — present:** `sankey.js:300` `.attr('stroke-width', d => Math.max(1.5, d.width))` and `:311` `.attr('height', d => Math.max(2, d.y1 - d.y0))`. Zero-value links are filtered out entirely (`:241`). Value labels are suppressed for nodes under 18px (`:317`-ish, `if ((n.y1 - n.y0) > 18)`).

**Tooltip — present.** Fixed-position `div#tip` (`sankey_v1/index.html:91`), `showLinkTip()` `sankey.js:363-373` (cases, share of state, year), `showNodeTip()` `:375-389` (cases, share, rate/100k for the state node), `moveTip()` clamps to the viewport. Links/nodes also get hover dimming of unrelated flows.

**Year slider propagation** — `sankey.js:86-90`:
```js
document.getElementById('yr').addEventListener('input', e => {
  currentYear = +e.target.value;
  document.getElementById('yrnum').textContent = currentYear;
  render(selectedState);
  updateStats(selectedState);
});
```
**Bug (minor):** when no state is selected, `updateStats(null)` early-returns at `sankey.js:181-189` *before* reaching `updateBarWidths()` (`:204`), so the per-state mini-bars under the sidebar buttons go stale when you scrub the year with nothing selected. No keyboard shortcuts beyond the native range input.

**Sidebar stats panel (the clipped bottom stat)** — relevant CSS in `sankey.css`:
```css
.sidebar     { ... overflow: hidden; }            /* :150-156 */
.state-list  { flex: 1; overflow-y: auto; ... }   /* :183-188 */
.stats-strip { border-top: ...; padding: 12px; flex-shrink: 0; ... }  /* :261-265 */
```
The strip (4 stat items) is `flex-shrink: 0` inside a `overflow: hidden` sidebar within a fixed-height page (`html, body { height: 100%; overflow: hidden; }`, `sankey.css:42-45`). The state list scrolls, but the strip itself has **no scroll or shrink path**: on short viewports (the 44px nav + 84px header eat fixed space first) the bottom "Top road user" item is clipped with no scrollbar. At a 700px-tall window it fits with ~12px to spare; anything shorter (or browser zoom >100%) clips. Fix direction for the reviewer: allow the strip to scroll/shrink or reduce nav+header fixed overhead.

---

## 6. Theming & styles

**Mechanism.** Theme = `data-theme="dark|light"` on `<html>`, persisted in localStorage key **`rc-theme`**, pre-painted by an identical inline one-liner in every page's `<head>` *before* stylesheets (no FOUC): `document.documentElement.dataset.theme = localStorage.getItem('rc-theme') || 'dark';`. Three separate toggle implementations, all read/write the same key:
- Home/About: `assets/theme.js` (button `.nav-theme-btn` in the nav).
- Map: inline script `map_classic_v3/index.html:198-214` — flips the attribute **then calls 4 global functions** (`drawLegend`, `refreshMap`, `drawNTAnnotation`, `refreshCompareStripValues`) to repaint D3 bits.
- Sankey: `sankey.js:50-63` — flips, then `if (selectedState) render(selectedState); buildLegend();`.

**Variables that flip.** Each stylesheet defines its own `[data-theme="dark"]` / `[data-theme="light"]` blocks: `map_classic_v3.css:14-60` (`--bg/--panel/--panel2/--ink/--ink-soft/--ink-mute/--rule/--rule2/--accent/--accent2/--accent-soft/--pin/--danger-*/--sea*/--land-edge/--shadow/--header-bg`), `site.css:18-48` (same names, same values, subset), `sankey.css:7-40` (**different names, same values**: `--surface/--surface2/--border/--border2/--text/--text2/--text3/--glow`), `nav.css:8-26` (scoped `--nav-*` so the shared bar can't collide with either naming scheme). Four copies of the palette must be kept in sync by hand.

**Hardcoded colours that bypass the variables** (light-mode risk points):
- `map_classic_v3.js:214` — `if (rate == null) return "#eee";` (no-data state fill; near-invisible on the light `#f4f1ec` bg, glaring on dark)
- `map_classic_v3.js:619` — `.style("background", "#ccc")` (compare bar, no-data)
- `map_classic_v3.css:635` and `:783` — `color: #3ec99a;` ("below average" green, same hex both themes; contrast on `#f4f1ec` is weak)
- `#fff` text on accent in several spots (css:441, 671, 679, 931; `sankey.css` `.state-btn.active .state-abbr`) — fine on both accents, listed for completeness
- `sankey.js:10-35` — entire RU/state palettes are hardcoded per theme (`RU_COLORS_DARK/LIGHT`, `STATE_COLORS_DARK/LIGHT`) and `:280-282` per-theme SVG text colours (`isDark ? '#4a5368' : '#9998a8'` etc.). These **require a re-render on toggle** — handled, but only if a state is selected; the column headers/labels exist only inside `render()` so nothing strands.
- `home.js` — clean; every colour is a `var()` reference.

**Hexes for WCAG contrast check:**

| Role | Dark theme | Light theme |
|---|---|---|
| Background `--bg` | `#080a0f` | `#f4f1ec` |
| Panel `--panel` | `#0f1219` | `#fdfbf8` |
| Red accent `--accent` | `#e8523a` | `#c8391e` |
| Body text `--ink` | `#e4e8f2` | `#1a1a22` |
| Secondary text `--ink-soft` | `#8a93aa` | `#5a5870` |
| Small mono text `--ink-mute` | `#4a5368` | `#9998a8` |

Worth checking: `--ink-mute` on `--panel` in dark (`#4a5368` on `#0f1219` ≈ 3.1:1) is used at 0.58–0.6rem (slider ticks, captions, footer) — below WCAG AA for normal text; and `#9998a8` on `#fdfbf8` light (~2.9:1) likewise.

**Fonts.** Syne (400/600/700/800) + IBM Plex Mono (400/500), all from Google Fonts. Loaded via `<link>` on index/about/sankey pages and via `@import` in `map_classic_v3.css:6` **and** `site.css:10` — so Home/About request the same stylesheet twice (link + import; harmless but redundant), and the map page relies solely on the CSS `@import`.

---

## 7. Consistency & cruft

**Nav diff across the four pages.** Link set, order, labels, and `aria-current` placement are identical and correct on all four. Two structural differences: (a) Home and About include `<span class="nav-spacer"></span>` + `<button class="nav-theme-btn">`; both chart pages omit them (each has its own toggle in its page header — two visible toggle styles exist across the site); (b) hrefs are root-relative on root pages, `../`-prefixed on chart pages — all resolve.

**Footer diff.** Four different footers:
- `index.html:118-127` — full attribution + GenAI sentence.
- `about.html:106-110` — one-liner `Source: BITRE · ABS · CC BY 4.0 · COS30045 Team 1 · ...`.
- `map_classic_v3/index.html:185-194` — different class (`.footer` not `.site-footer`), adds the denominator caveat sentence.
- `sankey_v1/index.html` — **no footer at all** (no source attribution on Chart 2's page).

**Grep results (user-visible cruft):**

| File:line | String |
|---|---|
| `about.html:63` | `Hamish Hooley <span class="id-placeholder">[STUDENT ID]</span>` |
| `about.html:64` | `Kanzen Ong <span class="id-placeholder">[STUDENT ID]</span>` |
| `index.html:108` | "Still in development: more breakdowns are on the way." (deliberate) |
| `README.md:132` | "this chart is still in development…" (deliberate) |
| `make_pptx.js:132,152,164,176,331,351` | `[Screenshot: …]` placeholders (non-site file) |

No "TODO", "WIP", or "lorem" anywhere in site files.

**Console output per page** (checked live at `localhost:8000`): Home ✓ clean, About ✓ clean, Sankey ✓ clean, Map — no errors/warnings but **two debug logs on every load**: `map_classic_v3.js:1516-1517` `console.log("CSV rows:", …)` / `console.log("GeoJSON features:", …)`.

**Unused files / dead references:**
- `make_pptx.js` + `presentation.pptx` — untracked by git, unreferenced by the site; `make_pptx.js:103` still carries the **disproven claim** "NT records hospitalisation rates 1.8 to 3 times the national average — across every year and every demographic slice" (site copy was corrected to "above the national average … up to 2.2×"; actual range 1.31–2.19×). `RESEARCH.md:15-16` keeps "~1.8–3×" but explicitly labelled *"Initial framing"*, which is defensible.
- `RESEARCH.md:147-149` says the `sample_*.html` prototypes "are retained in the repo" — **false since the purge** (git history only). §5 of RESEARCH.md also describes a hub/flagship structure (scrollytelling + "Trauma Space galaxy" bonus) that no longer matches the shipped 4-page site.
- No dead internal links; all 7 data files are referenced (map uses 6, sankey 2, home 2).

---

## 8. Constraints to know before editing

- **Map theme toggle depends on globals.** The inline script in `map_classic_v3/index.html:209-212` calls `drawLegend`/`refreshMap`/`drawNTAnnotation`/`refreshCompareStripValues` as **top-level globals** defined by `map_classic_v3.js`. Wrapping that file in an IIFE/module, or renaming those functions, silently breaks light/dark switching of the D3 layers.
- **Uncommitted Sankey refactor.** The inline CSS/JS was just extracted to `sankey_v1/sankey.css`/`sankey.js` (untracked). The Sankey is **Hamish's active WIP** — if he holds an older inline-version copy, committing/merging needs care; the extracted files are byte-equivalent in behaviour to the previous inline blocks.
- **Four hand-synced palette copies** (`map_classic_v3.css`, `site.css`, `sankey.css`, `nav.css`) with two naming schemes (`--ink/--panel` vs `--text/--surface`). A palette tweak must be applied in all four; `nav.css` is intentionally self-contained (`--nav-*`).
- **CSV header case** (§2): `Year` vs `year` is load-bearing in three accessors.
- **Layout fix lives inline.** The map page's nav-height accommodation and the <760px zero-height-map fix are an inline `<style>` block (`map_classic_v3/index.html:24-39`), not in the .css file. Removing the block reintroduces a footer-pushed-offscreen desktop bug and an invisible-map mobile bug. Both chart pages use full-viewport `overflow: hidden` layouts — any element added above `.main`/`.page` consumes chart space and can re-trigger the Sankey sidebar clipping (§5).
- **Theme persistence contract:** every page must keep (1) the pre-paint one-liner *before* stylesheet links and (2) `localStorage.setItem('rc-theme', …)` in its toggle. Key name `rc-theme` shared by 3 separate toggle scripts.
- **CDN dependencies** (d3, d3-sankey, Google Fonts). Offline/file://: map shows its error banner (`map_classic_v3.js:1538-1544`), home falls back to hardcoded stats, Sankey fails silently to an empty list.
- **Cache-busting query strings** on map assets (`map_classic_v3.css?v=2`, `map_classic_v3.js?v=1`) — bump them if editing those files for users with cached copies.
- Sliced map rates use **total** state population as denominator by design (caveat ribbon `index.html:157-159`, `map_classic_v3.js:1334-1340`); "fixing" this is wrong — no stratified denominators exist in the source.

### `// GenAI-assisted (Claude)` marker locations

| File | Count |
|---|---|
| `map_classic_v3/map_classic_v3.js` | 7 (header + outline-draw, zoom, hint sprite, narrative H2, popover, keyboard) |
| `index.html` | 2 (file header + footer sentence) |
| `about.html` | 2 (file header + declaration card) |
| `assets/home.js`, `assets/nav.css`, `assets/site.css`, `assets/theme.js` | 1 each (file headers) |
| `map_classic_v3/index.html` | 1 (footer sentence only — no file-header marker) |
| `sankey_v1/index.html`, `sankey.css`, `sankey.js` | **0 — no markers at all** |

The Sankey having zero markers is a declaration gap if any of it was AI-assisted — the About page promises markers on all non-trivial AI-generated blocks.

---

## Biggest risks if edited carelessly

The site is three independently-built layouts glued together by a shared nav, a localStorage key, and four hand-duplicated colour palettes — so the fragile parts are the *seams*, not the charts. The most likely careless-edit breakages are: (1) touching the map page's `<head>` or wrapping `map_classic_v3.js` in a module scope, which kills the inline theme-toggle's reliance on global function names and the inline layout-fix `<style>` block that keeps the map visible on mobile and the footer on-screen; (2) editing the Sankey without reconciling the just-extracted, still-uncommitted `sankey.css`/`sankey.js` with Hamish's in-flight inline version — an easy way to silently revert his work; (3) regenerating any data CSV with normalised lowercase headers, which NaNs out three accessors that depend on the `Year`/`year` case split; and (4) "tidying" the palette by editing one stylesheet's token block — the same values live in four files under two naming schemes, and a partial edit produces themes that diverge only on some pages. Content-wise, the corrected NT claim ("above average every year, up to 2.2×") is load-bearing across home/map/README; reintroducing the old "1.8–3×" wording from `make_pptx.js` or RESEARCH.md's initial framing would put the site back in contradiction with its own data.
