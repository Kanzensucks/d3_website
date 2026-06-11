# Road Crash Injuries in Australia

**COS30045 Data Visualisation — Team 1**
Hamish Hooley (105932360) & Kanzen Ong (103518124) | Swinburne University of Technology | 2026 Semester 1

An interactive data visualisation of hospitalised road crash injuries across Australian states and territories from 2011 to 2021, built with D3.js v7. The project includes three coordinated visualisations: Home (overview), Chart 1 (state-comparison map), Chart 2 (Sankey diagram), Bonus (unit-level swarm), and About page. All pages share one navigation bar and a persistent dark/light theme.

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
| Home | `http://localhost:8000/` | One-minute overview: headline finding, key statistics, national trend chart, links to all charts |
| Chart 1 · Map | `http://localhost:8000/map_classic_v3/` | Interactive state-comparison choropleth with demographic filtering |
| Chart 2 · Sankey | `http://localhost:8000/sankey_v1/` | Sankey flow diagram of each state's hospitalisation burden by road user type |
| Bonus · Swarm | `http://localhost:8000/showcase_v1/showcase.html` | Unit-level visualization: 8,066 dots (1 per 50 people) morphing through 6 animated acts |
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
├── map_classic_v3/             Chart 1 — State comparison choropleth
├── sankey_v1/                  Chart 2 — Sankey diagram
├── showcase_v1/                Bonus — Unit-level swarm visualization
│
├── README.md                   This file
└── Design Book (PDF)           Full documentation with iteration history and usability testing
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

> Vehicle occupant is a derived category: total hospitalisations minus the five recorded road-user groups (motorcyclist, pedal cyclist, pedestrian, bus occupant, other or unknown).

---

### Bonus — Swarm Visualization (`showcase_v1/showcase.html`)

**Open:** `http://localhost:8000/showcase_v1/showcase.html`

This bonus visualization renders all 403,293 hospitalisation events as 8,066 individual dots (one dot ≈ 50 people). The dots morph through six coordinated acts, each revealing a different facet of the data.

**The Six Acts:**

| Act | Layout | What it shows |
|---|---|---|
| 1 | Phyllotaxis swarm | Scale: all dots in concentric spiral |
| 2 | Geographic map | Location: dots clustered by state; NT dominates visually |
| 3 | Disc chart | Trend: dots form circles; y-axis = rate per 100k, x-axis = year |
| 4 | Stacked composition | Demographics: partition by road user type, age, or sex |
| 5 | Road users scatter | Comparison: dots scattered by year and rate, coloured by user type |
| 6 | End card | Summary: elapsed time counter and key takeaway |

**How to use it:**

| Action | What it does |
|---|---|
| Click **Act buttons** (1–6) or press **number keys** | Jump to any act |
| **Arrow keys ← / →** | Step one act at a time |
| **Space** or click **▶ play all** | Auto-play guided cinema mode through all acts |
| **◌ show the excess** (Act 4) | Toggle ghost dots showing excess NT burden |
| **◎ follow a dot** | Track one hospitalization across all acts |
| **Skip to explore** | Jump to free exploration mode (Act 5) |

**Key insights from the swarm:**

- Act 2 immediately shows that the NT cluster is visually dominant despite smaller population
- Act 3 reveals that the NT's high rate persists across the entire 2011–2021 period
- Act 4 shows that the excess is not driven by one demographic; it spans all road user types, ages, and sexes
- The animation of dots morphing between layouts makes structural patterns emotionally legible that static charts cannot

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

- **D3.js v7 + d3-sankey** (CDN) — choropleth, Sankey, and swarm visualizations
- **Canvas 2D API** — high-performance rendering for 8,066 dots at 60 fps
- **Spring physics engine** — underdamped morphing animations
- **Vanilla HTML / CSS / JavaScript** — no framework, no bundler, no preprocessor
- **KNIME Analytics Platform** — data cleaning and CSV export pipeline
- **Python pandas / matplotlib** — exploratory data analysis

The project intentionally has no build step. Every file can be opened and edited directly. CSS variables are defined in `:root` in each chart's own stylesheet and do not affect other charts.

---

## Code structure

**Chart 1 (`map_classic_v3/map.js`)** is organised into 11 numbered sections covering state management, data loading, scales, map rendering, interaction, and controls.

**Chart 2 (`sankey_v1/sankey.js`)** handles Sankey layout, node rendering, flow animation, and interactivity.

**Swarm (`showcase_v1/showcase.js`)** implements:
- D3.js canvas sprite atlas (pre-rendered dot variants)
- Spring physics integrator for morphing animations
- Phyllotaxis spiral, geographic clustering, disc layout, stacked composition
- Cinema mode sequencing with held frames
- Follow-one-dot tracking with trail rendering

Non-trivial code blocks generated with Claude (GenAI) are marked `// GenAI-assisted (Claude)` inline. All generated code was reviewed and verified by the team. See Appendix A of the Design Book for full GenAI disclosure.

---

## Iteration and feedback

The project was developed through three major iterations of Chart 1 (map_classic, map_classic_v2, map_classic_v3) and two iterations of Chart 2 (sankey_v1, sankey_v2). The Swarm visualization was developed in a single iteration.

User testing was conducted with five participants on Chart 1, producing 12 documented feedback items that drove refinements to the interaction model, colour palette, and navigation affordances. See the Design Book for full usability evaluation results.
