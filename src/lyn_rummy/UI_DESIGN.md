# LynRummy UI Design Philosophy

A guide for anyone designing a computer interface for a card game
that humans already love playing in person.

## The real game comes first

LynRummy existed at kitchen tables before it existed on screens.
Players sit around a shared board, pick up physical cards, slide
them into position, rearrange stacks, and chat while they play.
The pace is conversational. Nobody is in a hurry. The strategy
runs deep, but the social experience is what keeps people at the
table.

Any computer version of this game must respect that origin. The
screen is a substitute for the table, not a replacement. If the
computer version feels clinical or transactional, it has failed —
even if the game logic is perfect.

## Drag and drop is table stakes

Humans who play card games in person develop muscle memory for
picking up cards and placing them. They feel the weight, they
see the fan, they nudge stacks into neat rows. Drag and drop
is the bare minimum to honor that experience.

A click-based interface ("select card, select target") is
technically equivalent but emotionally inferior. It turns a
physical act into an abstract one. Drag and drop lets the human
feel like they're moving cards, not issuing commands.

The drag behavior should be direct: the card follows the pointer.
When released, it lands where you put it. No animation to a
"correct" position. No snapping to a grid. The human is in
control of where things go, just like on a real table.

## The board belongs to the humans

On a real table, players arrange stacks however they want. Some
prefer tidy rows. Some cluster related stacks. Some leave gaps
for future plays. The computer should not rearrange the board
unless asked.

This means:
- Merges happen where the human drops the card, not at some
  computed "optimal" position.
- Splits place the new stack near the original — the human can
  reposition it afterward.
- The computer never auto-compacts or auto-arranges.

The one exception: the computer enforces that stacks don't
overlap, because overlapping cards are unplayable — you can't
see or interact with what's underneath. This mirrors real life:
if you drop a card on top of another stack, someone at the table
will say "hey, move that."

## Three levels of board tidiness

The board has a geometric status independent of card validity:

- **CLEANLY_SPACED** — every stack has breathing room around it.
  Cards are easy to see and interact with. This is the goal.

- **CROWDED** — stacks are close together but not overlapping.
  Playable but uncomfortable. Like a real table that's getting
  full — you can still play, but you might accidentally bump
  something.

- **ILLEGAL** — stacks actually overlap or extend off the board.
  Can't play in this state. The computer rejects this immediately.

The computer allows CROWDED (humans can tidy up at their own
pace) but rejects ILLEGAL. This mirrors the social dynamic at a
real table: mild crowding is tolerated, but overlapping cards
get called out.

## Feedback: Pavlov's ding

Humans respond to positive reinforcement far more than negative.
The primary feedback mechanism is a pleasant ding sound — a short,
warm tone that fires when the human does something good:

- **Successful merge** (card extends a valid stack) → ding
- **Clean board achieved** → ding + green celebration text
- **Board tidied from CROWDED to CLEANLY_SPACED** → ding +
  "Nice and tidy!"

The ding is the Pavlov's bell. The human learns, unconsciously,
that certain actions produce the pleasant sound. Over time they
seek out the ding — making better plays, keeping the board neat,
completing stacks — without being told to.

## Gentle scolding

Negative feedback is brief, red, and informational — not angry.
The status bar shows a short message when the human makes a
mistake:

- Dropping a card outside the board → "Put it on the board!"
- Overlapping cards (without merging) → card snaps back + scold
- Board getting crowded → blue info text (not even a scold)

The tone matters. "DON'T TOUCH THE CARDS UNLESS YOU ARE GONNA
PUT THEM ON THE BOARD!" reads differently than "Cards go on the
board." Both are scolding, but the first has personality. In a
game between friends, scolding is teasing, not punishment.

Machine scolding is far gentler than human scolding. At a real
table, your opponent will give you a look. The computer just
shows red text for a moment and moves on. This is a feature:
the computer is infinitely patient.

## The chat connection

LynRummy is a talking game. Players discuss strategy, negotiate,
and trash-talk while they play. In the physical version, this is
natural conversation. In the computer version, the game is
embedded inside a chat system (Angry Cat / Angry Gopher).

This is not a coincidence. The game was designed to be played
alongside conversation, not instead of it. A future version might
interleave game moves with chat messages in the same topic — so
the game log reads like a conversation with cards.

## For AI agents designing similar games

If you're building a computer card game:

1. **Start with the physical experience.** Play the game with
   real cards first. Notice what feels good. The screen version
   should preserve those feelings.

2. **Drag and drop is not optional.** Click-to-select is for
   spreadsheets.

3. **Let humans own the layout.** Auto-arrange is patronizing.
   Humans have spatial memory and preferences. Respect them.

4. **Reward more than you scold.** A 4:1 ratio of dings to
   scolds feels right. The human should want to keep playing,
   not dread making a mistake.

5. **Geometry before semantics.** Check that the board looks
   right (no overlaps, cards visible) before checking that the
   cards are right (valid stacks). If the board looks wrong,
   nothing else matters.

6. **The board state is communicated, not just computed.** Every
   message between players includes stack locations, not just
   card values. Both sides must agree on what the board looks
   like, not just what the cards say. This is the protocol —
   the shared reality of the table.
