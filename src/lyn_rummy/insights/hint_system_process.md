# Process: Keeping the hint system in sync

The hint system is a cascade: `get_hint` analyses a position, picks the
simplest applicable pattern from `HintLevel`, and returns a `Hint`. A
`Hint` is then consumed by several sites that are easy to drift apart.
This doc names the sites and describes the process that keeps them
honest.

## The four sites

1. **Detector** — `hints/hints.ts`: `get_hint` and its `find_*` helpers.
2. **Executor** — takes a `Hint`, mutates board + hand. Three copies today:
   - `tools/console_player.ts` (auto-player against the live server)
   - `hints/play_game.ts` (offline simulation harness)
   - `game/game.ts` (the UI, wires hint → status bar + player action)
3. **Narrator** — human-readable sentence. Currently the *enum value itself*
   is the sentence (`HintLevel.PAIR_PEEL = "Peel a board card..."`).
4. **Stats/logs** — `tools/analyze_stats.ts` buckets by the enum string;
   `stats.jsonl` is the data.

## Source of truth

The `Hint` discriminated union in `hints.ts` is the contract. Everything
else must derive from it.

```ts
export type Hint =
    | { level: HintLevel.HAND_STACKS; hand_stacks: HandStack[] }
    | { level: HintLevel.DIRECT_PLAY; playable_cards: HandCard[] }
    | ...
```

## Rules

### Rule 1 — Every consumer of `Hint` is exhaustive

Every `switch(hint.level)` must end with:

```ts
default: assert_never(hint);
```

`assert_never` has signature `(x: never) => never`. TypeScript fails to
compile the call if any `HintLevel` is unhandled. This catches:
- New HintLevel added without updating all three executors.
- Executor branch deleted.

### Rule 2 — Skips are explicit

If an executor intentionally doesn't handle a level (e.g. `REARRANGE_PLAY`,
which is STRATEGY.md's level-8 graph-solver fallback not currently wired
into `get_hint`), it must be a labelled `case`, not an early-return
filter before the switch. Otherwise Rule 1's exhaustiveness is bypassed.

```ts
// bad — bypasses exhaustiveness
if (hint.level === HintLevel.REARRANGE_PLAY) break;
switch (hint.level) { ... }

// good — exhaustiveness still enforced
switch (hint.level) {
    case HintLevel.REARRANGE_PLAY:
        break; // deliberately unhandled
    ...
    default: assert_never(hint);
}
```

### Rule 3 — Per-level behavioural test

`tests/hint_coverage.test.ts` iterates `Object.values(HintLevel)` and,
for each level, requires a fixture. The fixture is a saved position that
should trigger that level. The test asserts:
1. `get_hint(fixture.hand, fixture.board).level === level`.
2. Passing that hint to `execute_complex_hint` (or the simple-move
   executor) mutates the board — the played-cards list is non-empty.

The test uses a `switch(level)` with `assert_never` so adding a new
`HintLevel` without a fixture is also a TS compile error.

### Rule 4 — Detector sub-cases need matching executor sub-cases

A single `HintLevel` may admit multiple sub-patterns (PAIR_PEEL handles
set-pair *and* rb-run-pair *and* pure-run-pair). Exhaustiveness on the
enum can't catch "detector has branch X but executor doesn't".

Mitigation: every sub-case the detector recognises must have a fixture
in `hint_coverage.test.ts`. Writing the fixture forces you to run the
executor against that sub-case and observe whether it actually plays.

## What the process catches

- ✅ New HintLevel missing from an executor — TS compile error.
- ✅ Executor branch deleted — TS compile error.
- ✅ Executor accepts a hint but silently returns no-op — test failure
  (empty played list).
- ✅ Detector sub-case with no executor support — test failure, **iff**
  the sub-case has a fixture.

## What the process doesn't catch

- ❌ Narrator string lies about what the executor does — no way to
  assert semantic truth; caught only at play-test time.
- ❌ Detector sub-case with no fixture — invisible until a game
  actually hits it. Mitigate by adding a fixture whenever a sub-case
  is added.
- ❌ Stats bucket drift if somebody stops using the enum value as the
  key — currently low risk because the enum value *is* the string.

## Adding a new hint — checklist

1. Add the value to `HintLevel` enum.
2. Add the variant to the `Hint` discriminated union with its metadata.
3. Implement the detector in `hints.ts`.
4. Implement the executor branch in **all three** of: `console_player.ts`,
   `play_game.ts`, `game.ts`. Exhaustiveness will refuse to compile
   otherwise.
5. Add a fixture to `tests/hint_coverage.test.ts`.
6. Run the test. If the executor returns `[]`, the branch is wrong.
