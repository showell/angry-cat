# Unplayable cards: give up and move on

Humans quickly recognize when a card can't be played and stop
trying to find a home for it. The algorithm should do the same
— identify unplayable cards and focus compute elsewhere.

## Example (from Steve's frustration)

Hand: 9S:2, TS:2, TS:2 (and others)

- **9S:2**: needs a home. What are the options?
  - Join a run: need 8S + TS adjacent (opposite colors in rb, or both spades in pure). TS is in hand — so need 8S or TC/TD or 8D/8H from somewhere.
  - Join a set of 9s: need two 9s of other suits on the board or peelable.
  - Extend an existing run: need a run ending in 8 (opposite color) or 10 (opposite color).

If none of these setups exist, 9S:2 is effectively dead weight.
A human takes 2 seconds to scan and conclude "nope."

## Why this matters for the algorithm

1. **Performance**: don't spend cycles on unplayable cards.
2. **Strategy**: the other cards become the focus. If TS:2 is
   playable and 9S:2 isn't, all moves should start from TS:2.
3. **Fumble direction**: when stuck, the fumble should try to
   create paths for the *playable* cards, not the unplayable ones.

## Detection heuristic

For a hand card `h` with value `v`, color `c`, suit `s`:
- Is there a run on the board (or constructible from board+hand)
  that would accept a card at value `v` with the right color?
- Is there a set of value `v` (existing or constructible from
  peelable same-value cards)?
- Is there a same-suit, same-value card I can SWAP with via
  peel-redirect-replace?

If all answers are no (even across 2-3 hypothetical fumbles),
mark `h` as unplayable this turn and ignore it.

## Human feel

"I gave up on 9S pretty quickly" — the human vocabulary of
"giving up on a card" is itself instructive. The mental state
shifts from "what can I do with this card?" to "how do I make
the best of the rest of my hand?"
