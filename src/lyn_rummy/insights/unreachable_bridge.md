# Pattern: The Unreachable Bridge

Sometimes you can fumble your way most of the way to playing a
card, but the final connecting piece doesn't exist anywhere
(board or hand). That's when to give up on the card, not dig
deeper.

## Example (Steve's Sunday puzzle, game 84)

Hand: QH:1, 3C:1, JS:2
Board: initial 6 stacks.

Steve played Q♥ and J♠ into a new run [J♠ Q♥ K♠] (seeded by
peeling K♠ from the initial spades run), then extended it with
A♥ from the aces. So far so good — 2 hand cards played.

For 3♣, he fumbled:
- Created [A♣ 2♥ 3♣] (valid rb run, with 3♣ played)
- Split the bottom rb run to free 5♥
- Ended up with [6♠ 7♥] needing an 8♣ or 8♠ to complete

**No 8♣ or 8♠ was available** — neither in hand nor peelable
from the board. The bridge was unreachable.

The only way to "resolve" [6♠ 7♥] was to add 5♥, but that
would undo the [3♥ 4♥ 5♥] run he'd also built. Circular —
net zero cards played, board reshuffled.

## The lesson

Some cards are genuinely unplayable in the current position.
The smart move is to recognize the unreachable bridge early
and give up on the card rather than keep fumbling.

## Algorithm implication

When fumbling, check: does the card I'm trying to play have
ANY path to completion? If the final connecting piece doesn't
exist anywhere (board + hand) in any suit+color configuration
that matches what the run/set needs, the card is truly stuck.

Don't spend more compute on it. Move on to the next card.

## The "wish" framing

Steve describes this as "which card do I wish was on the
board?" It's a useful diagnostic:
1. Imagine the final move that would complete your play
2. Identify the card you'd need
3. Search board + hand for any instance of that card
4. If absent, you've found an unreachable bridge — stop

This is a human-scale reasoning shortcut. Instead of searching
forward (what moves can I make?), search backward (what do I
wish I had?). The absence of the wished-for card is a firm
"give up" signal.
