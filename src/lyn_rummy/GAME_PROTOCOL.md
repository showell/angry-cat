# LynRummy Game Protocol

Data structures for computer-vs-computer play.

## Cards

A card has three properties:

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

## Stacks

A stack is an ordered list of cards. Valid stack types:

| Type | Rule | Example |
|------|------|---------|
| Pure run | 3+ consecutive, same suit | 5H 6H 7H |
| Red/black run | 3+ consecutive, alternating color | 5H 6S 7D |
| Set | 3-4 same value, different suits, no duplicates | 5H 5D 5S |

Runs wrap: ...Q K A 2 3...

A stack in JSON is simply an array of cards:

```json
[
    {"value": 5, "suit": 3, "origin_deck": 0},
    {"value": 6, "suit": 3, "origin_deck": 0},
    {"value": 7, "suit": 3, "origin_deck": 1}
]
```

## Board

The board is an array of stacks. All stacks must be valid.

```json
{
    "board": [
        [{"value": 5, "suit": 3, "origin_deck": 0}, ...],
        [{"value": 5, "suit": 1, "origin_deck": 0}, ...]
    ]
}
```

## Hand

An unordered collection of cards the player holds.

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
    "board": [[...], [...]],
    "hands": [
        [...],
        [...]
    ],
    "deck_size": 52
}
```

The deck contents are hidden. Players only know its size.

## Move

A move is a transition: cards leave the hand, the board changes,
and the board remains valid.

```json
{
    "cards_played": [
        {"value": 8, "suit": 3, "origin_deck": 0}
    ],
    "resulting_board": [
        [{"value": 5, "suit": 3, "origin_deck": 0}, ...],
        [...]
    ]
}
```

`cards_played` lists the cards that left the hand.
`resulting_board` is the complete new board state.

The player may rearrange existing board stacks freely as part of
the move — splitting stacks, merging stacks, moving cards between
stacks — as long as the resulting board is valid. The only
constraint is that every card that was on the board before the
move must still be on the board after (no stealing cards to your
hand), and every card in `cards_played` must have come from the
hand.

A player may also pass (play zero cards) if they cannot or choose
not to play.

## Scoring

Each card in a valid stack scores its type value:

| Type | Points per card |
|------|----------------|
| Pure run | 100 |
| Set | 60 |
| Red/black run | 50 |

Turn score = board score improvement + cards-played bonus.
Emptying your hand: +1000. Ending the game: +500 additional.

## Validity

The board is valid when every stack is a valid type with 3+
cards. This must hold after every move.

## Presentation layer

Everything above describes the game logic layer. Location is a
separate concern.

Each stack occupies a position on a 2D board when displayed to
a human. Cards within a stack fan out horizontally. Stack
locations have no effect on scoring, validity, or strategy.
Solvers and agents ignore them entirely.

The computer computes locations in exactly two scenarios:

1. **Rendering for a human** — after deciding a move, the
   computer assigns non-overlapping positions to all stacks
   so the human can see the board.

2. **Accepting human input** — when a human drags a card, the
   computer uses positions to determine which stack is the
   drop target.

In computer-vs-computer play, locations do not exist. The
presentation layer is a post-processing step applied only when
a human is involved.
