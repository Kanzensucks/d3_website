# Research Notes — Australian Road-Trauma Visualisation

**Project:** COS30045 Data Visualisation · Team 1 · Hamish Hooley & Kanzen Ong
**Companion docs:** `DEVELOPMENT_LOG.md` (chronological build log) · `index.html` (deliverable hub)

This document records the **research and design thinking** behind the project —
the thesis, the data analysis, the visualisation techniques we evaluated, the
references we studied, the decisions we made, and the limitations we acknowledge.
(The build history, iteration-by-iteration, lives in `DEVELOPMENT_LOG.md`.)

---

## 1. Thesis (and how it evolved)

**Initial framing:** *The Northern Territory's road-crash hospitalisation rate
runs ~1.8–3× the national average across the whole decade (2011–2021).*

**Refined framing:** the NT is the **sharpest case of a broader pattern** —
**remote/regional Australia carries a far heavier road-trauma burden than the
metropolitan states.** "NT vs the rest" is the symptom; "regional vs city" is the
structural story (consistent with established Australian road-safety findings:
higher speeds on rural roads, longer emergency response times, more single-vehicle
crashes).

**Honest scope limit:** our dataset is **state/territory level**, so it can only
*proxy* regionality (states mix metro + regional populations). The clean signal is
NT (and to a lesser extent other remote jurisdictions); a within-state
**remoteness-area** dataset (e.g. AIHW/BITRE by Major City → Very Remote) would
demonstrate "regional vs city" directly. We flag this as future work rather than
over-claiming.

---

## 2. Data analysis

### Files used
| File | Shape | Notes |
|------|-------|-------|
| `state_year_per100k.csv` | 8 states × 11 years | The spine: cases, population, rate /100k. Header uses capital `Year`. |
| `state_year_sex.csv` | year × sex × state | **Sums to total** ✅ |
| `state_year_age.csv` | year × age_group × state | Complete age bands ✅ |
| `state_year_roaduser.csv` | year × road_user × state | **Incomplete** — omits car occupants (sums to ~half the total) ⚠️ |
| `national_trend.csv` | year × cases | National totals (33.5k → 39k) |
| `population_clean.csv` | population × state × year | Used for rate normalisation |

### Key findings
- **Magnitude / the headline:** NT is the highest-rate jurisdiction **every year**;
  in 2021 its rate (~286/100k) was ~1.9× the national average and ~2.6× NSW.
- **Sex:** a stark, clean **~2:1 male-to-female** split in hospitalisations, in
  every state and every year (this breakdown sums exactly to the total, so it is
  the most reliable secondary finding).
- **Composition / mechanism:** cities skew toward **cyclists and pedestrians**
  (e.g. NSW cyclists ≈ 23% of its trauma), while remote NT skews toward **vehicle
  occupants** — consistent with rural-road, high-speed driving risk.
- **National trend:** total hospitalisations rose ~16% across the decade.

### Data engineering decisions
- **Population-weighted national average** (Σcases ÷ Σpopulation × 100,000), not
  the arithmetic mean of state rates — the latter over-weights tiny jurisdictions.
- **Fixed colour domain** across all years so colours are comparable year to year.
- **Derived "Vehicle occupant" category** for the road-user breakdown
  (`total − Σ known categories`) so stacked views sum correctly to the state rate.
  *To disclose as a method assumption in the report.*
- **Rates, not counts, for any stacked/3D view** — because NT's small population
  makes its raw counts tiny; encoding height/size by counts would visually
  *reverse* the thesis.

---

## 3. Visualisation techniques explored

We prototyped widely (see the `sample_*.html` files) and assessed each on two
axes a marker cares about: **thesis communication** and **technical sophistication
/ encoding fit**.

| Technique | What it is | Verdict |
|-----------|-----------|---------|
| **Animated choropleth** | Map, fixed colour domain, year time-lapse | **Core thesis piece** — appropriate encoding, clear |
| **Zoom drill-down + detail card** | Click a state → zoom + decade-vs-average chart | Strong; adds depth without clutter |
| **Side-by-side compare** | Shapes coloured by rate + ×avg labels | Good, honest comparison (no size distortion) |
| **Encoding toggle (rate ↔ vs-avg)** | Sequential ↔ diverging-at-zero | Sharpens the "above/below average" reading |
| **Ranked bar race** | Bars re-sort by year | Useful but redundant with choropleth; cut |
| **Trend lines / bump chart** | Decade lines / rank ribbons | Bump proves "NT #1 every year" elegantly |
| **Cartogram (non-contig. / Dorling)** | Size ∝ rate | On-thesis size metaphor done honestly |
| **Map ↔ bar morph** | States fly into a sorted bar chart | High "wow", strong transition work |
| **Beeswarm (Gapminder-style)** | Bubbles on a rate axis, NT as outlier | Good outlier reveal |
| **Hex tile-map** | Equal tiles, removes WA area bias | Clean, data-journalism style |
| **Spike / 3D prism map** | Extruded height = rate | Dramatic; must use rate not counts |
| **Streamgraph / Marimekko** | Flow / pop×rate area | More data-art; magnitude nuance |
| **Thermal risk field** | `d3-contour` IDW surface, infrared palette | Striking "satellite" look, pure D3 |
| **Spacetime gravity well** | Canvas mesh deformed by rate | Poetic; sophistication-forward |
| **Isometric stacked prism "Atlas"** | 3D-ish columns stacked by category, time | Most multi-dimensional (Atlas analogue) |
| **Force network "Trauma Space"** | States linked by composition similarity | Best **sophistication** showpiece |
| **Scrollytelling** | Sticky map + scroll-driven narrative | Best **thesis communication** format |

**Encoding lesson learned:** the flashiest chart is not always the best. A
force-directed network looks advanced but primarily encodes *similarity*, not
*magnitude*, and with only 8 nodes cannot prove "remote vs city" clustering — so
it complements, rather than replaces, the choropleth. Picking the right encoding
for the message is itself a graded skill.

---

## 4. Design references studied

We looked at how leading practitioners present *per-capita, geographic,
over-time, one-region-stands-out* stories. We studied their **techniques and
conventions** and built original implementations on our own data (no code or
content was copied).

- **Our World in Data** — gold standard for "rate by region with a year slider";
  informed our clean fixed-domain legend and entity highlighting.
- **Gapminder (Hans Rosling)** — animated bubbles revealing an outlier over time;
  inspired the beeswarm / galaxy time animation.
- **NYT The Upshot & Reuters Graphics** — scrollytelling choropleths where the map
  reacts to the narrative; the model for our `sample_scrolly.html`.
- **The Pudding** — visual-essay structure (text + chart as one argument).
- **Observable / Mike Bostock's D3 notebooks** — technique reference for spike
  maps, cartograms, contours, bar-chart transitions.
- **"Data Sketches" (Nadieh Bremer & Shirley Wu)** — bar for bespoke, high-craft
  D3 aesthetics.
- **Atlas of Economic Complexity (Harvard Growth Lab)** — the "product space" 3D
  network; inspired our "Trauma Space" force network and the stacked-prism idea
  (place × time × category × magnitude).
- **AIHW, BITRE, ABS** — domain conventions for road-safety reporting and the
  source of remoteness-classified data we'd add for the regional-vs-city extension.

---

## 5. Final design decisions

The brief calls for **two flagship visualisations**, so we deliberately keep the
assessed set to **two**, deeply polished, with the network as an unassessed bonus
(depth over breadth — and showing we can choose the right tool rather than ship a
gallery of experiments):

1. **Flagship 1 — Scrollytelling narrative.** The lead deliverable: it fuses the
   written argument with the visual, guiding the reader through the thesis beat by
   beat (national picture → 2021 → vs-average → NT zoom → NT vs cities → divide).
2. **Flagship 2 — Interactive choropleth + compare.** The exploratory tool:
   time-lapse, vs-average encoding, zoom drill-down, coordinated detail chart,
   side-by-side comparison. Appropriate encoding and technically rich.
3. **Bonus (not assessed as a flagship) — Trauma Space galaxy.** Kept as a
   clearly-labelled showcase of technique; it encodes *similarity*, not magnitude,
   so it complements rather than carries the thesis.
4. **`index.html` hub** presents the two flagships prominently with the thesis and
   key stats, links the bonus separately, and carries the method note. The
   `sample_*.html` prototypes are retained in the repo as **process evidence**
   (referenced in this document) but are not surfaced as deliverables.
5. **Pure D3 v7, no frameworks/build step** throughout (per the brief). A true-3D
   three.js version was considered for the network but rejected to stay in-brief.
6. **Projection:** `d3.geoIdentity().reflectY(true)` (planar) rather than spherical
   Mercator, because the source GeoJSON has inconsistent ring winding that breaks
   spherical fills; for the one spherical view (globe sample) we rewind inverted
   sub-polygons via `d3.geoArea`.

---

## 6. Limitations & future work

- **State-level proxy for regionality.** Add a **remoteness-area** dataset
  (Major City → Very Remote) from AIHW/BITRE to demonstrate "regional vs city"
  directly instead of via NT as a stand-in.
- **Small-population volatility.** NT/ACT/Tas rates are noisier; a rolling average
  or uncertainty band would acknowledge this.
- **Road-user completeness.** The derived "Vehicle occupant" category is an
  inference; ideally use a complete road-user breakdown.

---

## 7. GenAI acknowledgement

Built collaboratively with **Claude (GenAI)**. Non-trivial AI-generated code
blocks are tagged in source with `// GenAI-assisted (Claude): <what/why>`. Claude
assisted with the data-loading pattern, scale/projection setup and the
winding-order diagnosis/fix, the coordinated interactions (zoom, hover-scrub,
compare), the advanced sample techniques, and these notes. All data analysis,
design decisions and outputs were reviewed and verified by the team against the
source data.
