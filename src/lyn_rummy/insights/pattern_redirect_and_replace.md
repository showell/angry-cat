# Pattern: Redirect and Replace

A hand card fills the spot vacated by a board card that has a better home elsewhere.

## Example (from Steve's puzzle solve, game 23)

- **Hand**: 7D:2 (and 7 others)
- **Board**:
  - Red/black run: `[2C 3D 4C 5H 6S 7H]` (ends with 7H, a red card)
  - Set: `[7S 7D 7C]` (3-card set waiting for 4th suit)
- **Move**:
  1. Peel 7H from the end of the run → run becomes `[2C 3D 4C 5H 6S]` (still valid)
  2. Merge 7H into the 7s set → `[7S 7D 7C 7H]` (4-card set)
  3. Play 7D:2 from hand onto the run → `[2C 3D 4C 5H 6S 7D:2]` (still alternating)

## Why humans see it instantly

The mental shortcut: "7D wants to be where 7H is. 7H wants to be in the 7s set."
Both needs are satisfied in one compound move.

## Why the current algorithm misses it

The `SWAP` hint in Angry Cat looks at **interior** swaps — cards surrounded
by same-color neighbors in an rb run. It doesn't consider **end-of-run peels**
even when the peeled card has a clear home.

## The missing algorithm

For each hand card `h` (value `v`, suit `s`):
1. Find board runs that end (left or right) with a card of value `v`
   and opposite color to `h`
2. Check if peeling that card leaves a valid 3+ card run
3. Check if the peeled card can join an existing set (same value,
   suit not already present, set size < 4)
4. If all three check, emit a compound move: peel + merge + play

## Related patterns

- **Three-way redirect**: hand card A replaces board card B, which goes
  to set C. B's old position used to cascade — maybe the card adjacent
  to B now pairs with a different hand card too.
- **End-of-run peel for pair**: end-card could pair with a hand card
  of opposite color (one value different) to form the start of a new run.

## Three-step idioms

Humans think in chunks of three. A coherent plan is usually three
moves that accomplish one goal. Each step alone is useless; the
sequence creates value.

1. **Peel, redirect, replace** (this pattern): peel an end-of-run
   card, send it to a set, play a same-value hand card in the
   vacated spot.

2. **Split, extract, place**: split a stack to free a card, combine
   that card with two hand cards to form a new group.

3. **Merge, split, re-merge**: merge two runs into one, split the
   result differently to free a problematic card, re-merge the halves
   in a new configuration. This is the "reassemble" pattern.

4. **Dissolve, pair, play**: dissolve a 4-card set into a 3-card set
   + 1 loose card, the loose card makes a pair with a hand card,
   play a third card to form a new group.

The algorithm should test three-step sequences as atomic units —
enumerate end-of-run peels, ask "where does this card want to go?",
ask "what hand card can fill this spot?" All in one pass, not a
sequential search.
