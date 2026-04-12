# Trick-plugin increments: running journal

One entry per increment. Format: what was added, baseline vs post numbers,
notable observations.

Benchmark harness: `tools/benchmark_bot.ts` — seeds 1–5, fixed RNG, one JSON
line per game + summary. Run with `npx vite-node src/lyn_rummy/tools/benchmark_bot.ts --label <tag>`.

---

## Baseline (tricks = direct_play + rb_swap + pair_peel)

*Originally named "swap" — renamed to "rb_swap" in the HAND_STACKS
increment cleanup to make clear it applies only to red/black runs,
not pure runs or sets. See rb_swap.ts for the why-not rationale.*



Captured on branch `trick-plugins` at the first step of the trick-porting
phase. These three tricks were the seed set used to prove the plugin
architecture end-to-end (4 integration points). All further increments
are measured against this row.

```
games: 5   avg_cards_played: 78.0   avg_completion: 96.9%   stuck_turns: 103
tricks: direct_play=223  pair_peel=67  rb_swap=33
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
tricks: hand_stacks=30  direct_play=171  pair_peel=46  rb_swap=28
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

## Increment 2: added SPLIT_FOR_SET

Hand card V finds two same-value, different-suit board cards via the
`can_extract` primitive (end-peel of size-4+ runs, set-peel of 4-sets,
or middle-peel of size-7+ runs). The three cards form a new 3-set on
the board.

```
games: 5   avg_cards_played: 80.6 (+3.0)   avg_completion: 98.3% (+1.5)   stuck_turns: 61 (-43)
tricks: hand_stacks=29  direct_play=187  rb_swap=25  pair_peel=30  split_for_set=38
```

Per-seed completion: 100 / 98.1 / 99.0 / 97.1 / 97.1.

**Big jump.** 3 cards/game improvement and the **stuck-turn rate
nearly halved** (104 → 61). Seed 1 finished all 104 cards. The
fixture suggested this would be a useful trick; the bench
confirmed it dramatically.

**Substitution within compound tricks**: pair_peel dropped 46 → 30
because some former pair-peel positions are now resolved earlier
by split_for_set finding the third card directly. That's not a
regression — the cards still get played, just via a different
chunk-recognition path. Total cards rose despite pair_peel firing
less.

**Confirmation of the island-vs-growth concern**: hand_stacks held
basically steady (30 → 29). split_for_set creates 3-sets too, but
those 3-sets feel less "isolated" because they're built from cards
that were *already* on the board, just regrouped. The shape of the
board doesn't lose any extension surface — it gains a new set.
This is suggestive of a future heuristic we'll want eventually:
"prefer plays that grow board structure over plays that island it."

Live smoke: bot account, game 93 / event 3914.

---

## Increment 3: added PEEL_FOR_RUN

Hand card V finds two extractable board cards at values V-1 and V+1
that form a valid 3-card run (pure or rb) with V. Same family as
SPLIT_FOR_SET — uses `can_extract` against existing board structure
— but the resulting group is a run instead of a set.

```
games: 5   avg_cards_played: 80.2 (-0.4)   avg_completion: 98.7% (+0.4)   stuck_turns: 54 (-7)
tricks: hand_stacks=32  direct_play=178  rb_swap=18  pair_peel=27  split_for_set=30  peel_for_run=17
```

Per-seed completion: 98.1 / 100 / 99.0 / 98.1 / 98.1.

**Mixed signal.** Cards/game dipped 0.4 (noise), but completion %
edged up and stuck-turn rate dropped from 61 to 54. PEEL_FOR_RUN
fired 17 times. Other tricks shifted: split_for_set dropped 38→30,
pair_peel 30→27, rb_swap 25→18, direct_play 187→178. So this trick
is partly substituting for other tricks at moments where multiple
tricks could fire — the bag is reaching the same end state through
different paths.

**No island problem here.** Like SPLIT_FOR_SET, peel_for_run
regroups cards already on the board; doesn't create isolation.

Live smoke: bot account, game 94 / event 3916.

---

## Increment 4: added LOOSE_CARD_PLAY

For each peelable board card, try merging it onto every other stack;
if the resulting board lets a stranded hand card directly extend
some stack, that's a LOOSE_CARD_PLAY. Apply: peel, merge, play.

```
games: 5   avg_cards_played: 81.0 (+0.8)   avg_completion: 99.2% (+0.5)   stuck_turns: 35 (-19)
tricks: hand_stacks=31  direct_play=178  rb_swap=22  pair_peel=20  split_for_set=36  peel_for_run=21  loose_card_play=7
```

Per-seed completion: 100 / 100 / 99.0 / 99.0 / 98.1.

**Big stuck-turn drop** (54 → 35, almost a third). Two seeds completed
all 104 cards; the remaining three came within 1–2 cards of perfect.
LOOSE_CARD_PLAY only fired 7 times across 5 games — small absolute
contribution to plays — but each firing apparently unsticks a
position that other tricks couldn't see, freeing later cards through
a cascade of direct plays.

This is the trick that was suspected to be most-common in real
human play. The benchmark suggests it's not high-frequency for the
bot at this point in the bag, because hand_stacks + direct_play +
split_for_set + peel_for_run already cover most easy cases. LOOSE
fills specific gaps where a board card needs to relocate to expose
a hand card's neighbor.

Live smoke: bot account, game 95 / event 3918 — loose_card_play
played 8H by first peeling 7H from a 4-set onto the heart run.

---

## Pause point — merging trick-plugins back to main

Stopping the porting exercise after seven tricks. Full bench
arc:

| Stage             | cards | completion | stuck |
|-------------------|------:|-----------:|------:|
| baseline (3)      |  78.0 |      96.9% |   103 |
| +hand_stacks      |  77.6 |      96.8% |   104 |
| +split_for_set    |  80.6 |      98.3% |    61 |
| +peel_for_run     |  80.2 |      98.7% |    54 |
| +loose_card_play  |  81.0 |      99.2% |    35 |

Two of five seeds finish 104/104. The bench is close enough to
perfect that the remaining tricks (SPLIT_AND_INJECT, PAIR_DISSOLVE,
SIX_TO_FOUR) are documented in `tricks/README.md` for later rather
than ported now. They cover positions that are individually rare;
diminishing returns on bench-style play count.

Bigger conversation queued instead — see Steve's "BIG DISCUSSION"
prompt for what comes next.
