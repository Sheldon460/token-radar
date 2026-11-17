# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Sheldon460/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Sheldon460/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks 178 pre-token protocols by implied launch value, priced from
the snapshot itself. Model **radar-2**: implied = TVL × category multiple ×
growth × maturity, where the category multiple is the median mcap/TVL of the
live-token protocols in the same category (winsorized 0.05–1.50; the global
median 0.25× when a category has fewer than 3 live comparables). The board
covers all 40 watchlist protocols plus 138 early rows below the $50M floor.
Every row carries a six-step farm plan with cost and time, derived from the
protocol's own record. The dashboard is a dark, zero-network static page:
sortable board, per-protocol detail with the full model breakdown and the
category's comparable distribution (p25 / median / p75), category filter,
live-token comparables, and a model sandbox for exploration.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/kit/input/snapshot.json
```

Node 22 or later, standard library only. The sealed snapshot comes from the
bounty kit (`input/snapshot.json`); the program reads it, writes the ranked
`board.json` and the dashboard's `data.js` to `out/`, copies `dashboard/` and
`screenshots/` there, and writes `out/dossier.json`. Run it twice and the
outputs are byte-identical.

Open the dashboard with any static server over `out/`:

```sh
cd out && python3 -m http.server 8902
# open http://127.0.0.1:8902/dashboard/index.html
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=rxp0nfcx&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
