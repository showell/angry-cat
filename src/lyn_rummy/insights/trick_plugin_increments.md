# Trick-plugin increments: running journal

One entry per increment. Format: what was added, baseline vs post numbers,
notable observations.

Benchmark harness: `tools/benchmark_bot.ts` — seeds 1–5, fixed RNG, one JSON
line per game + summary. Run with `npx vite-node src/lyn_rummy/tools/benchmark_bot.ts --label <tag>`.

---

## Baseline (tricks = direct_play + swap + pair_peel)

Captured on branch `trick-plugins` at the first step of the trick-porting
phase. These three tricks were the seed set used to prove the plugin
architecture end-to-end (4 integration points). All further increments
are measured against this row.

```
games: 5   avg_cards_played: 78.0   avg_completion: 96.9%   stuck_turns: 103
tricks: direct_play=223  pair_peel=67  swap=33
```

Per-seed completion: 98.1 / 100 / 97.1 / 94.2 / 95.2 (seed 2 finished all
104 cards, the rest stranded 3–6 cards).

---
