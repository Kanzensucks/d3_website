# Road Crash Injuries in Australia

**COS30045 Data Visualisation — Team 1**
Hamish Hooley & Kanzen Ong | Swinburne University of Technology | 2026 Semester 1

An interactive data visualisation of hospitalised road crash injuries across Australian states and territories from 2011 to 2021, built with plain D3.js v7. The project is a four-page website — Home, Chart 1 (state-comparison map), Chart 2 (Sankey), and About — sharing one navigation bar and a persistent dark/light theme.

---

## What this project shows

The Northern Territory records hospitalisation rates above the national average in every year of the dataset — up to 2.2× in the worst years. This project makes that finding immediately visible and lets users interrogate it by state, year, sex, age band, and road-user type.

---

## Getting started

This project has no build step and no dependencies to install. All you need is a local web server to serve the files (browsers block local `fetch()` calls for security reasons).

**Option 1 — Python (recommended, no install needed on most machines)**
```bash
cd path/to/projectttt
python -m http.server 8000
```

**Option 2 — Node.js**
```bash
npx serve .
```

Then open your browser and navigate to the URL shown in the terminal (usually `http://localhost:8000`).

---

## Pages

| Page | URL | What it is |
|---|---|---|
| Home | `http://localhost:8000/` | One-minute overview: headline finding, key statistics, national trend chart, links to both charts |
| Chart 1 · Map | `http://localhost:8000/map_classic_v3/` | Interactive state-comparison choropleth (primary deliverable) |
| Chart 2 · Sankey | `http://localhost:8000/sankey_v1/` | Sankey flow diagram of each state's hospitalisation burden (in progress) |
| About | `http://localhost:8000/about.html` | Team, technology, data sources, GenAI declaration, licence |

Every page shares the same navigation bar, and the light/dark theme toggle persists across pages via `localStorage`.

---

## Project structure

```
projectttt/
│
├── index.html                  Home page — overview, stats, trend chart, links to charts
├── about.html                  About page — team, tech, data sources, GenAI declaration
│
├── assets/                     Shared site assets
│   ├── nav.css                 Navigation bar styles (linked by all four pages)
│   ├── site.css                Home/About page styles (same design tokens as the charts)
│   ├── theme.js                Light/dark toggle with cross-page persistence
│   └── home.js                 Home-page stat cards + national trend chart
│
├── data/                       Shared data files (charts reference ../data/)
│   ├── aus_states.geojson      GeoJSON boundaries for 8 states/territories
│   ├── state_year_per100k.csv  Hospitalisation rate per 100,000 by state and year
│   ├── state_year_age.csv      Cases broken down by age group
│   ├── state_year_sex.csv      Cases broken down by sex
│   ├── state_year_roaduser.csv Cases broken down by road user type
│   ├── population_clean.csv    ABS estimated resident population by state and year
│   └── national_trend.csv      National total hospitalisation count by year
│
├── map_classic_v3/             Chart 1 — State comparison choropleth (main deliverable)
├── sankey_v1/                  Chart 2 — Sankey diagram (in progress)
│
├── DEVELOPMENT_LOG.md          Full iteration diary — every design decision logged
├── RESEARCH.md                 Research notes, technique evaluations, references
└── README.md                   This file
```

> Earlier iterations (`map_classic/`, `map_classic_v2/`) and the experimental prototypes
> (`archive/`) were removed in a cleanup; they remain available in the git history, and the
> iteration story is documented in `DEVELOPMENT_LOG.md` and the Design Book.

---

## The charts

### Chart 1 — State Comparison Choropleth (`map_classic_v3/`)

**Open:** `http://localhost:8000/map_classic_v3/`

This is the primary deliverable. It presents a choropleth map of Australia coloured by hospitalisation rate per 100,000 people, with full demographic slicing and state comparison.

**How to use it:**

| Action | What it does |
|---|---|
| Press **Space** or click **Play** | Animates the map through 2011–2021 |
| Drag the **year slider** | Jump to any specific year |
| Click any **state** on the map | Zooms in and opens a detail panel for that state |
| Detail panel → **Compare with** chips | Add other states to compare side by side as rate bars |
| **← All states** button or **Escape** | Returns to the full map view |
| **Show** pills (All / Sex / Age / Road user) | Switches the demographic slice driving the entire map |
| **Group** dropdown | Selects the specific value within the active dimension (e.g. Male, 17–25, Motorcyclist) |
| **Encoding** toggle (Rate / vs avg) | Switches between absolute rate and deviation from national average |
| Hover any state | Shows a tooltip with the state name, current rate, and click prompt |
| Click a breakdown bar | Sets that demographic category as the global map filter |
| **← / →** arrow keys | Step one year at a time |
| **Home / End** keys | Jump to 2011 or 2021 |

**Reading the map:**
- Colour scale: yellow (lower) to dark red (higher) — the NT is almost always the darkest state
- When stratifying by a demographic dimension (e.g. Males only), an orange caveat ribbon appears above the map reminding you that rates still use total state population as the denominator, not a stratified one
- The legend pulses and updates its scale range whenever the domain changes between demographic slices

---

### Chart 2 — Sankey Diagram (`sankey_v1/`)

**Open:** `http://localhost:8000/sankey_v1/`

Shows where each state's hospitalisation burden goes: select a state from the sidebar and its cases flow into road-user groups (motorcyclist, pedal cyclist, pedestrian, bus occupant, other). The sidebar also shows the national total, the state's share of it, and its per-100k rate for the selected year.

**How to use it:**

| Action | What it does |
|---|---|
| Click a **state** in the sidebar | Renders that state's flow into road-user groups |
| Drag the **year slider** | Updates the flows for the selected year |
| Hover any node or flow | Shows exact case counts |
| **☀ / 🌙** button | Toggles light/dark theme |

> Note: this chart is still in development. Additional breakdown dimensions (age group, sex) and further features are planned.

---

## Data sources

| Dataset | Source | Coverage |
|---|---|---|
| Hospitalised road crash injuries | Bureau of Infrastructure and Transport Research Economics (BITRE) | 2011–2021 |
| State and territory population | Australian Bureau of Statistics (ABS) | 2011–2021 |

BITRE data: https://www.bitre.gov.au/publications/ongoing/hospitalised-injury
ABS population: https://www.abs.gov.au/statistics/people/population/national-state-and-territory-population

**Licence:** Source data is published under Creative Commons Attribution 4.0 International (CC BY 4.0).

**Key limitation:** Rates in this project are always calculated as cases per 100,000 of *total* state population. Stratified denominators (e.g. per 100,000 males) are not available in the source data. The caveat ribbon in the chart flags this when a demographic filter is active.

---

## Technology

- **D3.js v7 + d3-sankey** (CDN) — all charts and interactions
- **Vanilla HTML / CSS / JavaScript** — no framework, no bundler, no preprocessor
- **KNIME Analytics Platform** — data cleaning and CSV export pipeline
- **Python matplotlib** — exploratory data analysis

The project intentionally has no build step. Every file can be opened and edited directly. CSS variables are defined in `:root` in each chart's own stylesheet and do not affect other charts.

---

## Code structure (map_classic_v3)

The main JS file (`map_classic_v3.js`) is organised into numbered sections:

| Section | Function |
|---|---|
| 1. Constants & state | `vizState` object holds all shared state |
| 2. Data load + indexing | `loadData()`, `indexData()`, `indexDemographic()` |
| 3. Scales + slice helpers | `sliceRate()`, `rebuildScalesForFilter()` |
| 4. Map view | `drawMap()`, `refreshMap()`, `drawNTAnnotation()` |
| 5. Focus / zoom | `selectState()`, `resetView()`, `zoomToState()` |
| 6. Compare strip | `renderCompareStrip()`, `refreshCompareStripValues()` |
| 7. Detail card | `renderDetailCard()`, `updateDetailForYear()`, `renderDetailChart()` |
| 8. Breakdown bars | `renderBreakdown()` |
| 9. Mutators | `setYear()`, `setMode()`, `setFilter()` |
| 10. Controls | `wireSlider()`, `wirePlayPause()`, `wireFilterBar()` |
| 11. Bootstrap | `loadData().then(...)` |

Non-trivial code blocks generated with Claude (GenAI) are marked `// GenAI-assisted (Claude)` inline. All generated code was reviewed and verified against the source data by the team.

---

## Development history

See `DEVELOPMENT_LOG.md` for a complete record of every design decision, user-test quote, before/after change, and the rationale behind it. The log covers 25 logged iterations across three major versions.
