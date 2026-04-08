# Lyn Rummy: Phases of the Game

Lyn Rummy uses a double deck (104 cards). Each player starts with 15 cards and tries to play them all onto a shared board of sets and runs.

## Early Game (0–20 cards on board)

The board is small, so there are few places to play. The challenge is **getting cards down at all**. You need 3+ cards in your hand that form a valid group (set or run) to start a new stack, or you need a card that extends one of the few stacks on the board.

This is where player skill matters most. A beginner gets stuck and draws repeatedly. An intermediate player spots the obvious sets and runs in their hand. An expert recognizes that playing a set now might block a higher-scoring run later — but at this stage, getting *anything* on the board is more important than optimizing score.

For the computer, this phase is easy to solve optimally because the board has few cards and few possible arrangements. Our solver handles boards up to ~23 cards with all four strategies finding the same answer.

## Mid Game (20–60 cards on board)

Cards flow freely now. Most turns, you can play at least one card because the board has enough stacks to match something in your hand. The question shifts from "can I play?" to "how should I play?"

This is where **board rearrangement** becomes valuable. An intermediate player peels a card from one stack to make room on another. An expert dissolves entire sets to redistribute cards into higher-scoring runs.

For the computer, this is where strategy differences emerge. Our benchmarks show that a "prefer runs" strategy (try pure run connections first) starts outscoring alternatives at around 27 cards, because pure runs score 100 points per card beyond 2 versus 60 for sets. The branching decisions made here compound — a good early choice cascades into more options later.

## Late Game (60–100 cards on board)

Almost everything is on the board. The remaining hand cards are the awkward ones — duplicates from the second deck, cards that don't fit anywhere without rearranging. Success depends on finding creative rearrangements to slot in those last few cards.

For the computer, this is computationally cheap (the board is large but mostly locked — our edge-killing cascade resolves most of it in under 1ms). The "prefer runs" strategy dominates here, scoring 8,400 on the final 100-card board versus 5,400–7,280 for other strategies. Long pure runs (6–10 cards) are the highest-scoring structures in the game, and they only appear when you commit to building them early.

## Summary

| Phase | Board size | Human challenge | Computer challenge |
|-------|-----------|----------------|-------------------|
| Early | 0–20 cards | Getting cards down at all | Trivial (few arrangements) |
| Mid | 20–60 cards | Choosing how to play, rearranging | Strategy matters (branching decisions) |
| Late | 60–100 cards | Fitting awkward last cards | Mostly resolved by cascade |

The paradox: the phase where humans struggle most (early game) is easiest for the computer, and the phase where strategic decisions matter most (mid game) is where algorithm choice has the biggest impact on score.

## Hint Engine

The hint engine uses a cascade of increasingly sophisticated strategies. Each level is tried in order; the first match wins.

1. **HAND_STACKS** — 3+ cards in hand form a complete set or run.
2. **DIRECT_PLAY** — a hand card extends an existing board stack.
3. **LOOSE_CARD_PLAY** — peel one board card, enabling a hand card to play.
4. **SPLIT_FOR_SET** — extract same-value cards from board stacks to form a set with the hand card.
5. **SPLIT_AND_INJECT** — split a run and inject the hand card at the split point.
6. **PEEL_FOR_RUN** — peel two board cards that, with the hand card, form a new run.
7. **PAIR_PEEL** — a pair of hand cards + one peeled board card = new group.
8. **REARRANGE_PLAY** — full graph solver (catches everything else).
9. **NO_MOVES** — draw cards.

Before the peel-based checks (levels 4–7), the engine runs a **board cleanup** pass that joins adjacent runs. This creates longer stacks with more peel points, which unlocks plays that wouldn't exist on a fragmented board.

Levels 1–7 are all cheap O(hand × board) scans. Level 8 (graph solver) is the expensive fallback. In simulation, levels 1–7 plus board cleanup achieve a **perfect game** (104/104 cards placed) without needing the graph solver.

## Duplicate Cards

The hardest part of the game is placing the second-deck copy of a card whose twin is already on the board. When the board has `[3C 3D 3S]` as a 3-card set, the second 3C can't join (suit already present). It needs a run home, or the board must be restructured to create one.

In our simulation, 78% of truly stuck cards are duplicates blocked by their twin. The human-like heuristics (split, inject, peel) handle most of these by extracting cards from long runs to form alternative groups.
