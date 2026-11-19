# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Hagai17/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Hagai17/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar. It reads a sealed snapshot of the DefiLlama protocol universe (758 protocols, fetched 2026-11-14) and ranks every protocol that records no token yet — 198 of them, the snapshot's 40-protocol watchlist included in full — by the value a launch would imply, with a concrete farm plan for each.

The pricing is the market's own: each candidate is valued at the median market-cap/TVL multiple that token-bearing protocols in its own category actually trade at, adjusted for 7-day TVL momentum, for how long it has run with no token, and for chain breadth. Candidates follow the watchlist's own rule at every size: no token recorded, and not a wrapped, staked or bridged product of a token that already trades. Protocols that already have a token are set aside in their own view at the market's prices, never ranked by the model.

The dashboard is a static page with no network: a sortable, filterable board, a detail view per protocol with the implied value broken down step by step, and the farm plan with what each step costs and how long it takes.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

`main.ts` (Node 22, standard library only) writes `out/board.json`, `out/data.js`, the dashboard under `out/dashboard/`, the screenshots under `out/screenshots/`, and `out/dossier.json`. Open `out/dashboard/index.html` in a browser to use the radar.

---
<sub>Entered on [make.fun](https://make.fun/?ref=8pf8m8ra&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
