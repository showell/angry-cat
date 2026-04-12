# Stuck position analysis (127 puzzles)

After 23 games (160 turns), the auto-player saved 127 stuck
positions. Breakdown:

## Hand size distribution
- 1 card: 21 puzzles (17%)
- 2-3 cards: 30 puzzles (24%)
- 4-5 cards: 37 puzzles (29%)
- 6-10 cards: 27 puzzles (21%)
- 11+ cards: 7 puzzles (6%)

Small hands dominate. The auto-player handles large hands
relatively well (many options), but gets stuck when options
narrow to 1-5 cards.

## Hard-case signals
- 25 puzzles have a hand with a duplicated value+suit
  (e.g., 9H:1 AND 9H:2). These are intrinsically hard because
  both cards compete for the same spot.
- 31 puzzles have all-same-suit hands. Also restrictive.

## Early-game vs late-game
Several 1-card stuck puzzles have only 6 board stacks (the
initial board). These are genuinely unplayable — the initial
board has no slots that accept a single isolated card.

Example: 9H:1 alone with only the initial 6 stacks. No 9-related
stack exists. No run wants a 9H. Cannot split anything productive
to make a 9H home.

## What this suggests

1. **Stuck is sometimes correct.** Many 1-card stuck puzzles
   truly have no play. The auto-player shouldn't force itself.
2. **Multi-card stuck hands are more productive targets.** If
   you have 5 cards, there's usually SOMETHING to try.
3. **Dup-in-hand is a signal.** When a hand has 9H:1 and 9H:2,
   there's a strong hint that at most one of them is playable
   this turn.
