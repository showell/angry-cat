# LynRummy Game Protocol

Data structures and JSON representations for computer-vs-computer
play. An agent reading this document should be able to understand
the game state, make valid moves, and communicate with another
agent.

## Overview

LynRummy is a two-player card game played with a double deck
(104 cards). Players take turns drawing cards from the deck and
placing them onto a shared board. The board consists of "stacks"
— groups of 3+ cards that form valid patterns. The goal is to
empty your hand. You score points for cards placed, board
improvements, and bonuses for emptying your hand.

## Cards

A card has three properties:

```json
{
    "value": 1,
    "suit": 0,
    "origin_deck": 0
}
```

**Values:** 1=Ace through 13=King.

**Suits:** 0=Club, 1=Diamond, 2=Spade, 3=Heart.
Clubs and Spades are black. Diamonds and Hearts are red.

**Origin deck:** 0 or 1. Since we use a double deck, two cards
can have the same value and suit but come from different decks.
Two such cards are "duplicates" — they look identical but are
tracked separately. Duplicates cannot appear in the same set.

### Card shorthand

For logging and debugging, cards use a two-character notation:
value letter + suit letter. Values: A 2 3 4 5 6 7 8 9 T J Q K.
Suits: C D S H. Example: `AH` = Ace of Hearts, `TD` = Ten of
Diamonds.

## Stacks

A stack is an ordered group of cards on the board. Each stack
has a type determined by its cards:

| Type | Rule | Example | Score per card |
|------|------|---------|---------------|
| `pure run` | 3+ consecutive same-suit cards | 5H 6H 7H | 100 |
| `red/black alternating` | 3+ consecutive alternating-color cards | 5H 6S 7D | 50 |
| `set` | 3-4 cards of same value, different suits, no duplicates | 5H 5D 5S | 60 |
| `incomplete` | Fewer than 3 cards (valid temporarily during a turn) | 5H 6H | 0 |
| `bogus` | Invalid pattern (must not exist at end of turn) | 5H 7H 8H | 0 |

Runs wrap: ...Q K A 2 3... (King connects to Ace).

A stack in JSON:

```json
{
    "board_cards": [
        {"card": {"value": 5, "suit": 3, "origin_deck": 0}, "state": 1},
        {"card": {"value": 6, "suit": 3, "origin_deck": 0}, "state": 0},
        {"card": {"value": 7, "suit": 3, "origin_deck": 1}, "state": 0}
    ],
    "loc": {"top": 100, "left": 200}
}
```

**Board card states:** 0=firmly on board (from a prior turn),
1=freshly played (placed this turn), 2=freshly played by the
previous player (visual indicator only).

The `loc` (board location in pixels) matters for the UI but not
for game logic. Agents can ignore it.

## Game state

The full game state at any point:

```json
{
    "board": [
        {"board_cards": [...], "loc": {...}},
        {"board_cards": [...], "loc": {...}}
    ],
    "hands": {
        "player1": [
            {"card": {"value": 1, "suit": 0, "origin_deck": 0}, "state": 0}
        ],
        "player2": [...]
    },
    "deck_remaining": 52,
    "current_player": "player1",
    "turn_phase": "play",
    "scores": {"player1": 0, "player2": 0}
}
```

**Hand card states:** 0=normal, 1=freshly drawn (drawn this
turn), 2=back from board (was on board but returned to hand
during rearrangement).

**Turn phases:**
- `draw` — player must draw a card from the deck
- `play` — player places cards and/or rearranges the board
- `end_turn` — player's turn is complete

## Moves

A move is a JSON event that transitions the game state. There
are a small number of move types:

### Draw

```json
{"type": "draw"}
```

The player draws the top card from the deck. The card is added
to their hand with state `freshly_drawn`.

### Place card

```json
{
    "type": "place",
    "hand_index": 2,
    "target_stack": 0,
    "position": "right"
}
```

Take the card at `hand_index` from your hand and place it on the
right (or left) end of `target_stack` on the board. The stack must
remain valid after placement.

### New stack

```json
{
    "type": "new_stack",
    "hand_indices": [0, 3, 5]
}
```

Take 3+ cards from your hand and create a new stack on the board.
The resulting stack must be a valid type (run or set).

### Split stack

```json
{
    "type": "split",
    "stack_index": 2,
    "at_position": 3
}
```

Split a board stack into two stacks at the given position. Both
resulting stacks must be valid (3+ cards each) by end of turn.
Splits are often combined with placements to rearrange the board.

### Move card between stacks

```json
{
    "type": "move",
    "from_stack": 0,
    "from_position": "right",
    "to_stack": 3,
    "to_position": "left"
}
```

Take a card from one end of a stack and place it on another. Both
stacks must be valid by end of turn.

### End turn

```json
{"type": "end_turn"}
```

Ends the current player's turn. At this point:
- All board stacks must be valid (3+ cards, valid type)
- No `bogus` or `incomplete` stacks allowed
- Score is calculated from board improvements + cards played

## Scoring

Each card in a valid 3+ stack scores its type value:
- Pure run: 100 per card
- Set: 60 per card
- Red/black alternating run: 50 per card

Turn score = (board score after − board score before)
           + cards-played bonus
           + empty-hand bonus (1000 if you emptied your hand)
           + victory bonus (500 additional if this ends the game)

## Board validity

The board is "clean" when every stack has 3+ cards and a valid
type. During a turn, the board may temporarily have incomplete
or bogus stacks as the player rearranges. But at `end_turn`, the
board must be clean.

This is the key constraint: you can rearrange freely during your
turn, but you must leave the board in a valid state.

## Solitaire mode

In solitaire mode, there is one player. The deck starts with a
pre-arranged sequence (a puzzle). The goal is to place all cards
from the deck onto the board, maximizing score. There is no
opponent and no hand limit.
