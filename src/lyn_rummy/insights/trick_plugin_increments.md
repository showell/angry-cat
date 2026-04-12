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

## Increment 1: added HAND_STACKS

Registered `hand_stacks` as the first trick in every bag. Detection
looks at the hand for 3+ cards forming a set, pure run, or rb run;
apply() pushes the group to the board as a new stack.

```
games: 5   avg_cards_played: 77.6 (-0.4)   avg_completion: 96.8% (-0.1)   stuck_turns: 104 (+1)
tricks: hand_stacks=30  direct_play=171  pair_peel=46  swap=28
```

Per-seed completion: 93.3 / 98.1 / 98.1 / 96.2 / 98.1.

**Surprise:** adding a trick didn't help; it very slightly hurt. The
delta is in noise territory on 5 games, but it's worth naming the
mechanism we suspect.

**Hypothesis — island vs growth.** HAND_STACKS creates a standalone
stack (e.g. `[TS JS QS]`) when the same three cards piece-wise via
DIRECT_PLAY would grow an existing neighbor (e.g. turning `[9S]`
into `[9S TS JS QS KS]`). The island is more "done" but also more
isolated — it absorbs fewer future cards. Piecewise-direct produces
a longer run that can catch more board/hand cards down the line.

This is our first concrete example of the nuance queued in
`project_trick_composition.md`: tricks that LOOK independent can
have second-order interactions via board shape. Once we start
caring about composition, HAND_STACKS-vs-DIRECT is a candidate
relationship to formalize (e.g., "HAND_STACKS should prefer
playing into existing compatible board stacks first").

For now: leave the trick as-is, note the finding, don't
prematurely optimize. The trick still fires on positions that
have no extension path, which is where it genuinely helps.

---
