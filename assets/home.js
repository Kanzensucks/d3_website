// GenAI-assisted (Claude)
// home.js — fills the three stat cards and draws the national trend
// line chart on the home page. All colours come from CSS variables,
// so the light/dark toggle needs no redraw.

(function () {
  const fmt = d3.format(",");

  // Fallbacks (current values from data/, June 2026) so the cards never
  // show "—" or NaN if the CSVs fail to load (e.g. opened via file://).
  const FALLBACK = {
    total2021: 39035,
    pctChange: "+4.7%",
    topRoadUser: "Motorcyclist",
    topRoadUserCases: 8755,
  };

  function setStats(total, pct, ru, ruCases) {
    document.getElementById("stat-total").textContent = fmt(total);
    document.getElementById("stat-change").textContent = pct;
    document.getElementById("stat-roaduser").textContent = ru;
    document.getElementById("stat-roaduser-sub").textContent =
      fmt(ruCases) + " cases — among recorded categories; vehicle occupants are not separately recorded (Chart 2 derives them by subtraction).";
  }

  Promise.all([
    d3.csv("data/national_trend.csv", d => ({ year: +d.Year, cases: +d.cases })),
    d3.csv("data/state_year_roaduser.csv", d => ({ year: +d.year, roadUser: d.road_user, cases: +d.cases })),
  ])
    .then(([trend, roadUser]) => {
      trend.sort((a, b) => a.year - b.year);
      const last = trend[trend.length - 1];
      const prev = trend[trend.length - 2];
      const pct = ((last.cases - prev.cases) / prev.cases) * 100;
      const pctLabel = (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";

      const lastYearTotals = d3.rollup(
        roadUser.filter(d => d.year === last.year),
        v => d3.sum(v, d => d.cases),
        d => d.roadUser
      );
      const top = d3.greatest(lastYearTotals, ([, cases]) => cases);

      setStats(last.cases, pctLabel, top[0], top[1]);
      drawTrend(trend);
    })
    .catch(() => {
      setStats(FALLBACK.total2021, FALLBACK.pctChange, FALLBACK.topRoadUser, FALLBACK.topRoadUserCases);
    });

  function drawTrend(data) {
    const W = 560, H = 230;
    const m = { top: 14, right: 70, bottom: 26, left: 46 };

    const svg = d3.select("#trend-chart").append("svg")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const x = d3.scaleLinear()
      .domain(d3.extent(data, d => d.year))
      .range([m.left, W - m.right]);

    const y = d3.scaleLinear()
      .domain([
        Math.floor(d3.min(data, d => d.cases) / 1000) * 1000 - 1000,
        Math.ceil(d3.max(data, d => d.cases) / 1000) * 1000,
      ])
      .range([H - m.bottom, m.top]);

    // gridlines
    svg.append("g")
      .selectAll("line")
      .data(y.ticks(4))
      .join("line")
      .attr("x1", m.left).attr("x2", W - m.right)
      .attr("y1", d => y(d)).attr("y2", d => y(d))
      .attr("stroke", "var(--rule)")
      .attr("stroke-dasharray", "3 4");

    // axes (text only, no domain lines — keeps the panel clean)
    svg.append("g")
      .selectAll("text")
      .data(x.ticks(6).filter(Number.isInteger))
      .join("text")
      .attr("x", d => x(d)).attr("y", H - 8)
      .attr("text-anchor", "middle")
      .attr("font-family", "'IBM Plex Mono', monospace")
      .attr("font-size", 9.5)
      .attr("fill", "var(--ink-mute)")
      .text(d => d);

    svg.append("g")
      .selectAll("text")
      .data(y.ticks(4))
      .join("text")
      .attr("x", m.left - 6).attr("y", d => y(d) + 3)
      .attr("text-anchor", "end")
      .attr("font-family", "'IBM Plex Mono', monospace")
      .attr("font-size", 9)
      .attr("fill", "var(--ink-mute)")
      .text(d => d3.format(".2s")(d).replace("G", "B"));

    // gradient area under the line
    const grad = svg.append("defs").append("linearGradient")
      .attr("id", "trend-grad")
      .attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 1);
    grad.append("stop").attr("offset", "0%").attr("stop-color", "var(--accent)").attr("stop-opacity", 0.22);
    grad.append("stop").attr("offset", "100%").attr("stop-color", "var(--accent)").attr("stop-opacity", 0);

    svg.append("path")
      .datum(data)
      .attr("fill", "url(#trend-grad)")
      .attr("d", d3.area()
        .x(d => x(d.year))
        .y0(H - m.bottom)
        .y1(d => y(d.cases)));

    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "var(--accent)")
      .attr("stroke-width", 2)
      .attr("stroke-linejoin", "round")
      .attr("d", d3.line()
        .x(d => x(d.year))
        .y(d => y(d.cases)));

    // 2020 COVID dip annotation
    const dip = data.find(d => d.year === 2020);
    if (dip) {
      svg.append("circle")
        .attr("cx", x(dip.year)).attr("cy", y(dip.cases))
        .attr("r", 3)
        .attr("fill", "var(--bg)")
        .attr("stroke", "var(--ink-soft)")
        .attr("stroke-width", 1.5);
      svg.append("text")
        .attr("x", x(dip.year)).attr("y", y(dip.cases) + 16)
        .attr("text-anchor", "middle")
        .attr("font-family", "'IBM Plex Mono', monospace")
        .attr("font-size", 8.5)
        .attr("fill", "var(--ink-mute)")
        .text("COVID dip");
    }

    // end point + label
    const last = data[data.length - 1];
    svg.append("circle")
      .attr("cx", x(last.year)).attr("cy", y(last.cases))
      .attr("r", 3.5)
      .attr("fill", "var(--accent)");
    svg.append("text")
      .attr("x", x(last.year) + 8).attr("y", y(last.cases) + 3)
      .attr("font-family", "'IBM Plex Mono', monospace")
      .attr("font-size", 10.5)
      .attr("font-weight", 500)
      .attr("fill", "var(--accent)")
      .text(fmt(last.cases));
  }
})();
