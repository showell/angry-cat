# LynRummy Tricks

A guide to the trick-plugin system — how humans think about LynRummy,
where the current UI falls short, and how the algorithm borrows the
human vocabulary instead of inventing its own.

## What a trick is, from the human side

A **trick** is a chunk of recognition. When an experienced player looks
at their hand and the board, they don't compute every legal move; they
see a pattern and the move flows from it. "I have a pair. There's a
peelable third. Done." That whole sentence is one glance for a human
who's played for thirty years.

Tricks are pre-verbal. The player doesn't think "this is PAIR_PEEL"
before executing it. The name is something we apply later to talk
about what they did. On the kitchen table, nobody says the name at
all — they just move cards.

Importantly, tricks are **cheap to apply** and **cheap to reject**.
Humans can scan a 60-card board in half a second and decide whether
a trick fires. That's what makes the whole system feel fluid instead
of computational.

## The bag of tricks

A good player has roughly 8–12 tricks in active use. New players
start with one (DIRECT_PLAY: "this card extends that stack"). As
they watch and play more games, they accumulate tricks. None of them
is optional — a player missing even a single common trick will miss
moves that others catch.

Here's the thing that's easy to get wrong: **the bag has no order.**
A player with ten tricks doesn't cycle through them in a priority
queue. They look at their hand and board, and *whichever trick their
eye catches first* is the one that fires. Sometimes that's the
biggest-reward trick. Sometimes it's the one they used last turn
and muscle memory is still warm. Sometimes it's whichever one
happens to be nearest to where their finger already is.

The one exception is DIRECT_PLAY. That's so reflexive it functions
as the zero-cost default — if a card can just be dropped onto a
stack, the human drops it without thinking about any fancier trick.

## Random application, non-random outcomes

This is the point that took us a while to nail down: **humans apply
tricks for reasons that often have nothing to do with the game.**

Examples from real play:
- The 6♦ goes on the rb run because the rb run was under the player's
  finger, not because extending an rb run is better than extending
  the 6-set.
- The Q♠ gets peeled from the top-left of the board because it's the
  first card the player's scan encountered, not because top-left is
  strategically significant.
- A split gets done in 3 UI clicks in a specific order because that
  order felt natural to the hand, not because the algorithm would
  prefer it.

These choices are *random from the game's perspective*. They have
no consequences for the algorithm and should not be encoded. An
algorithm that tried to reproduce "use the trick nearest your
finger" would be imitating human limitation, not human strength.

The algorithm should apply whichever trick fires first in its own
ordering — whatever that happens to be — and not try to be smart
about ordering. If the cascade is set up so ordering doesn't matter,
you've done it right.

## Where the current UI lets us down

A trick lives in the human's head as one mental gesture. At a real
card table it's usually one *physical* gesture too — slide the card
in, push the old one out, in a single motion.

Our UI doesn't have that abstraction. A SWAP on the screen today
takes 4–7 discrete split/merge operations, because the UI sees
stacks as atomic units and the only way to rearrange them is to
split the source, isolate the pieces, route the kicked card, slot
in the new card, and recombine. Each of those is a click-and-drag.

The cost is not just ergonomic. It hides the *trick* inside a
sequence of book-keeping clicks. Two players playing the same move
might execute different click sequences — same trick, different
choreography. From the game's perspective they did the same thing.

This is the gap the trick plugin system is meant to close, *eventually*,
on the UI side: each known trick becomes a first-class user
gesture. Click A♥, drop it on A♦ in the rb run, and the UI handles
the substitute-and-stash as one atomic operation. That's a real-table
gesture in a digital frame.

Until the UI catches up, the trick system at least captures the
semantics server-side (via the `lynrummy_plays` table) so replay
viewers can show what the player *did* even when the UI made them
type it out in 7 clicks.

## How the algorithm steals human tricks

The algorithm doesn't invent its own abstractions. Every trick the
bot knows is stolen directly from human play. This is deliberate
for several reasons:

1. **Coverage.** Across its small circle of players, LynRummy has
   absorbed thousands of hours at kitchen tables. The tricks those
   players have evolved cover ~99% of playable positions. A machine
   starting from first principles would spend a long time
   rediscovering what's already documented in the vocabulary of
   the game.

2. **Readability.** When the bot plays a PAIR_PEEL, a human watching
   the replay knows exactly what happened. If the bot invented some
   novel heuristic, the replay would need footnotes.

3. **Extensibility.** When a new trick gets discovered — someone
   spots a clever move at the kitchen table — porting it into the
   bot is adding one module. No re-architecture.

4. **Failure diagnosability.** If the bot gets stuck and a human
   playing the same position would too, we've hit the legitimate
   edge of the tricks. If the bot gets stuck but a human wouldn't,
   there's a trick we haven't encoded. Either way the signal is
   clear.

## What the plugin interface looks like

Each trick is a module that exports a `Trick` object with three
members:

- `id: string` — stable machine id (e.g. `"pair_peel"`).
- `description: string` — generic human-readable sentence.
- `find_plays(hand, board): Play[]` — enumerate every applicable
  move on the current state.

A `Play` knows the hand cards it would place and has an `apply()`
method that mutates a board to reflect the move. That's it. No
orchestration inside the trick. Selection, ordering, and any
cascade policy is a caller concern.

The caller — hint UI, auto-player, or anything else — gathers plays
from the bag and picks one. The bag is an ordered list with no
semantic priority (except DIRECT_PLAY's implicit reflex status).

## The 99% goal

Tricks aren't a brute-force search. They're a *vocabulary*. Each
trick is a local recognition: "I can do this in this position." When
enough tricks are in the bag, most positions yield to one of them.
The remaining positions — the genuinely hard ones — are where
optional expert extensions like graph-solver rearrangement earn
their keep.

We don't need tricks to cover every board. We need them to cover
the ones that come up in normal play — the ones a patient human
plays through without strain. When an auto-player reaches the same
positions a human would struggle with, we've matched human skill.
That's the bar.

## Writing a new trick

When you add a trick:

1. **Start from the human version.** Play games, watch when a human
   does something the bot doesn't. Name the trick with the word the
   kitchen-table player would use.
2. **Keep the module small.** If the trick's detection logic fills
   100 lines, it's probably two tricks pretending to be one.
3. **Don't depend on other tricks.** Each trick is locally complete —
   it should find its plays even if the player could also use some
   other trick. Downstream callers handle any conflicts.
4. **Add a fixture.** `tricks/coverage_test.ts` requires one. The
   fixture documents what the trick accomplishes in a position
   concrete enough that a reader gets it immediately.
5. **Mind the bag.** Register the trick where orchestration happens:
   `game/game.ts`, `tools/auto_player.ts`, `tools/benchmark_bot.ts`.
   Tricks the bag doesn't know about may as well not exist.

## For AI agents reading this

Tricks are a design pattern with three commitments:

1. **Cognitive units drive the architecture.** A trick is sized to
   what a player recognizes as one move, not what the UI or the
   executor happens to decompose that into.
2. **Plugins over cascades.** The bag has no priority; ordering is
   engineering artifact. Build new tricks as equal citizens.
3. **Steal from humans.** The vocabulary is already out there. Don't
   invent rival abstractions; borrow, name accurately, encode
   faithfully.

When tempted to invent something clever, check first: would a human
describe this move in one short sentence at the kitchen table? If
yes, that sentence names a trick. If not, you may be solving the
wrong problem.
