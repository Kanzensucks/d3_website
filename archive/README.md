# archive/ — process evidence

This folder holds the prototype HTML pages that were built during the
exploration phase of the project but are **not part of the assessed
deliverables**. They are kept as evidence of the design journey (and are
summarised by technique in the project's `RESEARCH.md`).

Each page is self-contained and loads data from the shared root `data/`
folder via `../data/...`.

| File | What it explores |
|------|------------------|
| `sample_compare.html` | Three comparison layouts (mini cards · table · dumbbell) |
| `sample_advanced.html` | Cartogram · map ⇄ bar morph · force beeswarm · hex tile-map |
| `sample_advanced2.html` | Spike map · bump · streamgraph · Marimekko · globe · Dorling |
| `sample_advanced3.html` | Thermal risk field · spacetime gravity well · particle telemetry (dark "mission-control" skin) |
| `sample_advanced4.html` | Isometric stacked-prism "Atlas of Road Trauma" |
| `sample_pictograph.html` | Standalone pictograph grid (hospital icon stacks per state) |
| `sample_pictograph_map.html` | Map + on-select hospital stacks + compare chips (early version) |

The two prototypes that **did** make it into the live site sit at the project
root and are linked from `index.html`:

- `sample_scrolly.html` — Flagship 1 (scrollytelling narrative)
- `sample_productspace.html` — bonus "Trauma Space" force network

To view any archived page, serve the project root with a local static server
and open `/archive/<file>.html`.
