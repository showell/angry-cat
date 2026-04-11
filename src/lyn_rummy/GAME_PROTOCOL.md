# LynRummy Game Protocol

Data structures and rules for computer play. All JSON shapes
match the TypeScript types in `core/card.ts`, `core/card_stack.ts`,
and `game/game.ts`.

## The computer's roles

The computer plays two distinct roles in LynRummy, one mandatory
and one optional:

**Referee** (mandatory). The computer enforces the physics of
the card table. It validates moves, checks that cards are
conserved, and ensures the board is clean before a turn ends.
The referee is stateless — you show it the board and the
proposed move, it gives a ruling. It does not remember prior
moves. It does not care who is playing or how many players
there are. It does not enforce turn order. It enforces the
rules of the table, not the social rules of the game.

**Advisor** (optional). A more advanced agent that suggests
moves, evaluates strategy, and helps players improve. The
advisor reads the same board state the referee does, but it
thinks about what moves are *good*, not just what moves are
*legal*. The advisor is never mandatory — LynRummy is playable
with just the referee.

The referee is implemented in `game/referee.ts` (TypeScript)
and `lynrummy/lynrummy.go` (Go) as stateless functions:

- `validate_game_move` — rule on a single move during a turn.
  The board can be messy mid-turn. Checks protocol, geometry,
  semantics, and inventory.

- `validate_turn_complete` — rule on whether the turn can end.
  The board must be clean (geometry + semantics) before we
  hand it off to the next player.

**Dealer** (setup only). The dealer sets up the game before
play begins: pulls the initial board stacks from the deck,
shuffles the remaining cards, and deals hands. After dealing,
the dealer's job is done. Implemented in `game/game.ts` as the
`Dealer` class.

**Host** (transport). The host relays events between players
over the network. It authenticates players and knows which
game type to route to which referee, but it does not understand
game rules. Implemented in the Angry Gopher `games` package.

## Dealer setup

The dealer receives a shuffled 104-card double deck and performs
these steps in order:

1. **Pull initial board stacks** from the deck. All cards come
   from deck 1 (`origin_deck: 0`). The stacks are hard-coded:

   | Row | Cards | Stack type |
   |-----|-------|------------|
   | 0 | KS AS 2S 3S | Pure run (wrapping) |
   | 1 | TD JD QD KD | Pure run |
   | 2 | 2H 3H 4H | Pure run |
   | 3 | 7S 7D 7C | Set |
   | 4 | AC AD AH | Set |
   | 5 | 2C 3D 4C 5H 6S 7H | Red/black run |

   Board locations are computed from the row index:
   `col = (row * 3 + 1) % 5`, `top = 20 + row * 60`,
   `left = 40 + col * 30`.

2. **Deal 15 cards** from the front of the remaining deck to
   player 1.

3. **Deal 15 cards** from the front of what's left to player 2.

4. The remaining cards form the draw pile.

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
presentation concern — the referee ignores them.

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

The board is an array of `JsonCardStack`. At turn boundaries,
all stacks must be valid and non-overlapping. Mid-turn, the
board can be temporarily messy — the referee only enforces
cleanliness when the player wants to end their turn.

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

A player may pass (empty remove + empty add).

Undo is the inverse: swap `stacks_to_remove` and `stacks_to_add`.

## Wire transport

Events flow through the Angry Gopher game host. Each event is
a JSON payload posted to `POST /gopher/games/{id}/events` and
retrieved via `GET /gopher/games/{id}/events?after=N`.

**Event types posted to the host:**

The first event is the game setup — the "photo" from the dealer.
It contains the dealt board, both hands, and the remaining deck:

```json
{
    "game_setup": {
        "board": [
            {
                "board_cards": [
                    {"card": {"value": 13, "suit": 2, "origin_deck": 0}, "state": 0},
                    {"card": {"value": 1, "suit": 2, "origin_deck": 0}, "state": 0},
                    {"card": {"value": 2, "suit": 2, "origin_deck": 0}, "state": 0},
                    {"card": {"value": 3, "suit": 2, "origin_deck": 0}, "state": 0}
                ],
                "loc": {"top": 20, "left": 70}
            }
        ],
        "hands": [
            [{"value": 9, "suit": 0, "origin_deck": 0}, ...],
            [{"value": 5, "suit": 1, "origin_deck": 1}, ...]
        ],
        "deck": [{"value": 7, "suit": 2, "origin_deck": 0}, ...]
    }
}
```

Both sides reconstruct the same game from this snapshot. The
dealer runs once on the creating side; the receiving side just
reads the photo. No independent dealer logic needed.

Subsequent events are game events wrapped in an `EventRow`:

```json
{
    "json_game_event": {
        "type": 2,
        "player_action": {
            "board_event": {
                "stacks_to_remove": [...],
                "stacks_to_add": [...]
            },
            "hand_cards_to_release": [
                {"card": {"value": 5, "suit": 3, "origin_deck": 1}, "state": 0}
            ]
        }
    },
    "addr": "2"
}
```

**Game event types** (`json_game_event.type`):

| Value | Name | Description |
|-------|------|-------------|
| 0 | ADVANCE_TURN | Turn passes to next player |
| 1 | MAYBE_COMPLETE_TURN | Player requests turn completion |
| 2 | PLAYER_ACTION | A move (the common case) |
| 3 | UNDO | Undo the last move |

**The `addr` field** identifies who sent the event. It must
match the sender's user ID as a string. The receiving client
uses `addr` to distinguish own events from opponent events —
events where `addr === selfAddr` are skipped.

**Event filtering**: The host stores `user_id` on each event.
The polling client skips events where `user_id` matches itself
(transport-level filter). Then the game engine skips events
where `addr` matches itself (application-level filter). Both
filters must pass for an event to be processed.

## Stack identity matching

When processing a move, `stacks_to_remove` must match stacks
on the board exactly. Matching uses card identity (value, suit,
origin_deck in order) and location. Key details:

- **Locations must be exact.** The UI produces float coordinates
  (e.g., `{"left": 287.1166687011719, "top": 7.8166656494140625}`).
  Integer approximations will fail the match.
- **Board card state is ignored** for matching. The `equals`
  method compares card strings and locations, not states. However,
  the state must still be present in the JSON.

## Turns

A turn consists of zero or more moves by a single player. The
player can make multiple moves — merges, splits, rearrangements,
hand card placements — in any order. The referee validates each
move individually but does not restrict how many moves a player
makes.

The turn ends when the player requests it. At that point the
referee checks the full board:

- All stacks must be valid card groups (semantics).
- No overlapping stacks (geometry).

If the board is not clean, the turn cannot end. The player must
fix the board first.

After the turn ends, the referee manages the transition:

- Cards age (freshly played → played by last player → firmly
  on board).
- The next player begins.

The referee does not enforce which player moves the cards. In a
game with humans, any human can physically move the cards. In a
game with agents, the agent submits moves. The referee only
cares that the moves are legal and the board is clean at the end.

## Referee validation

The referee validates a move in four stages, run in order:

1. **Protocol.** Well-formed JSON matching the `JsonCardStack` /
   `JsonBoardEvent` shapes. Card values 1-13, suits 0-3,
   origin_deck 0-1. Stacks have `board_cards` and `loc`.
   Operates on raw JSON before deserialization.

2. **Geometry.** Every stack on the resulting board fits within
   the board bounds. No two stacks overlap. Operates on
   `CardStack`.

3. **Semantics.** Every stack on the resulting board is a valid
   type (pure run, red/black run, or set) with 3+ cards. No
   bogus, no incomplete, no duplicate-card sets. Operates on
   `CardStack`.

4. **Inventory.** Cards are conserved. Every card that appears
   on the resulting board must have a source — either it was
   already on the board (in a removed stack) or it came from
   the player's hand. No card can be created from nothing. No
   card can appear twice on the board. Hand cards declared as
   played must actually appear on the board.

After protocol validation, `CardStack.from_json()` deserializes
the wire format. Stages 2-4 all operate on the resulting board,
computed once from the move delta.

## Scoring

Each card in a valid stack scores its type value:

| Type | Points per card |
|------|----------------|
| Pure run | 100 |
| Set | 60 |
| Red/black run | 50 |

Turn score = board score improvement + cards-played bonus.
Emptying your hand: +1000. Ending the game: +500 additional.

## Presentation layer

Stack locations are always present in communicated board states.
Non-overlapping placement is a hard constraint — checked by the
referee before game logic, like well-formed syntax.

However, locations have no effect on scoring or strategy. An
advisor choosing between two moves evaluates them identically
regardless of where the stacks are placed. The advisor computes
locations as a final step to satisfy the non-overlapping
constraint before communicating the result.

When interacting with a human, the computer uses locations for:

1. **Rendering** — showing the board in a readable layout.
2. **Input** — interpreting drag/drop targets.

The key distinction: locations are part of the **protocol**
(always present, always validated by the referee) but not part
of the **strategy** (never influence move selection by the
advisor).
