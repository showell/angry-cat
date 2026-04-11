# LynRummy Game Protocol

Data structures for computer-vs-computer play. All JSON shapes
match the TypeScript types in `core/card.ts`, `core/card_stack.ts`,
and `game/game.ts`.

## Cards

A card (`JsonCard`) has three properties:

```json
{"value": 5, "suit": 3, "origin_deck": 0}
```

**Values:** 1=Ace through 13=King.

**Suits:** 0=Club, 1=Diamond, 2=Spade, 3=Heart.
Clubs and Spades are black. Diamonds and Hearts are red.

**Origin deck:** 0 or 1. Double deck — two cards can share value
and suit but differ in origin. Such cards are "duplicates" and
cannot appear together in a set.

**Shorthand:** Two characters — value + suit. Values: A 2 3 4 5
6 7 8 9 T J Q K. Suits: C D S H. Example: `AH` = Ace of Hearts.

## Board cards

A board card (`JsonBoardCard`) wraps a card with a state:

```json
{"card": {"value": 5, "suit": 3, "origin_deck": 0}, "state": 0}
```

**States:** 0=firmly on board, 1=freshly played this turn,
2=freshly played by the previous player. States are a
presentation concern — validators and solvers ignore them.

## Stacks

A stack (`JsonCardStack`) is an ordered list of board cards with
a location:

```json
{
    "board_cards": [
        {"card": {"value": 5, "suit": 3, "origin_deck": 0}, "state": 0},
        {"card": {"value": 6, "suit": 3, "origin_deck": 0}, "state": 0},
        {"card": {"value": 7, "suit": 3, "origin_deck": 1}, "state": 0}
    ],
    "loc": {"top": 100, "left": 200}
}
```

Cards fan out horizontally from the location. The TypeScript class
`CardStack` is deserialized from this via `CardStack.from_json()`.

Valid stack types:

| Type | Rule | Example |
|------|------|---------|
| Pure run | 3+ consecutive, same suit | 5H 6H 7H |
| Red/black run | 3+ consecutive, alternating color | 5H 6S 7D |
| Set | 3-4 same value, different suits, no duplicates | 5H 5D 5S |

Runs wrap: ...Q K A 2 3...

## Board

The board is an array of `JsonCardStack`. All stacks must be
valid and non-overlapping.

```json
{
    "board": [
        {"board_cards": [...], "loc": {"top": 100, "left": 200}},
        {"board_cards": [...], "loc": {"top": 100, "left": 500}}
    ]
}
```

## Hand

An unordered collection of bare `JsonCard` (no state, no location).

```json
{
    "hand": [
        {"value": 1, "suit": 0, "origin_deck": 0},
        {"value": 9, "suit": 2, "origin_deck": 1}
    ]
}
```

## Game state

```json
{
    "board": [
        {"board_cards": [...], "loc": {...}},
        {"board_cards": [...], "loc": {...}}
    ],
    "hands": [
        [{"value": 1, "suit": 0, "origin_deck": 0}, ...],
        [...]
    ],
    "deck_size": 52
}
```

The deck contents are hidden. Players only know its size.

## Move

A move (`JsonBoardEvent`) is a delta: stacks to remove and stacks
to add.

```json
{
    "stacks_to_remove": [
        {"board_cards": [...], "loc": {"top": 100, "left": 200}}
    ],
    "stacks_to_add": [
        {"board_cards": [...], "loc": {"top": 100, "left": 200}},
        {"board_cards": [...], "loc": {"top": 100, "left": 500}}
    ]
}
```

Both fields are arrays of `JsonCardStack`. Stacks to remove are
matched by identity (location + cards). Stacks to add include
their new locations.

Constraints:
- Every card on the board before must still be on the board after
  (no stealing cards to your hand).
- Any new cards must have come from the player's hand.
- The resulting board must be valid.

A player may pass (empty remove + empty add).

Undo is the inverse: swap `stacks_to_remove` and `stacks_to_add`.

## Scoring

Each card in a valid stack scores its type value:

| Type | Points per card |
|------|----------------|
| Pure run | 100 |
| Set | 60 |
| Red/black run | 50 |

Turn score = board score improvement + cards-played bonus.
Emptying your hand: +1000. Ending the game: +500 additional.

## Validation pipeline

A board state is validated in three stages. Each stage runs
independently on the same data:

1. **Protocol validation.** Well-formed JSON matching the
   `JsonCardStack` / `JsonBoardEvent` shapes. Card values 1-13,
   suits 0-3, origin_deck 0-1. Stacks have `board_cards` and
   `loc`. Operates on raw JSON.

2. **Geometry validation.** Every stack fits within the board
   bounds. No two stacks overlap (with margin). Checked before
   card patterns — an overlapping board is rejected immediately.
   Operates on `CardStack`.

3. **Semantic validation.** Every stack is a valid type (pure
   run, red/black run, or set) with 3+ cards. No bogus, no
   incomplete, no duplicate-card sets. Operates on `CardStack`.

After protocol validation, `CardStack.from_json()` deserializes
the wire format. Both geometry and semantic engines accept
`CardStack[]` and share the `CardStackMove` type for replaying
move chains.

## Presentation layer

Stack locations are always present in communicated board states.
Non-overlapping placement is a hard constraint — checked before
game logic, like well-formed syntax.

However, locations have no effect on scoring or strategy. A
solver choosing between two moves evaluates them identically
regardless of where the stacks are placed. The solver computes
locations as a final step to satisfy the non-overlapping
constraint before communicating the result.

When interacting with a human, the computer uses locations for:

1. **Rendering** — showing the board in a readable layout.
2. **Input** — interpreting drag/drop targets.

The key distinction: locations are part of the **protocol**
(always present, always validated) but not part of the
**strategy** (never influence move selection).
