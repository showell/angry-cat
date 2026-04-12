# LynRummy Vision

What we're building, who it's for, and how we know we've succeeded.

## The starting point

LynRummy is a card game that has lived on Steve's family's kitchen
table for decades. It's social. It's strategic but conversational.
Newcomers struggle because the game has more cognitive depth than
mainstream Rummy variants, and the people who play it well have
absorbed that depth over thousands of hours of casual play.

We're building a digital version of LynRummy that respects all of
that, plus does something the kitchen table can't: it teaches.

## What we want

### 1. Faithful to the kitchen-table game

Not just rule-correct — it should *feel* like LynRummy. The UI
philosophy in `UI_DESIGN.md` (drag-and-drop, human owns the layout,
gentle scolding, the Pavlovian ding) is the surface expression of
this. The `tricks/README.md` notes on UI friction for multi-step
moves like SWAP are the same theme: where the digital experience
diverges from the physical, the physical wins.

### 2. A bot built from human tricks, not from search

The plugin system in `tricks/` exists because we want the bot's
moves to be *legible* — describable in the same vocabulary the
player at the table would use ("pair-peel," "substitute," "loose
card play"). We are not chasing a graph solver or an alpha-beta
search that beats experts via brute force. The bot's intelligence
is borrowed from the humans who already know the game; we just
encode it faithfully.

This makes the bot useful in a way pure search wouldn't be: when
it makes a move, the replay can show *which trick* it used, and
that's information a learning player can act on.

### 3. Help beginners become experts

This is the goal that ties everything else together. A new player
shouldn't be presented with all of LynRummy's complexity at once,
nor be left to figure it out alone. The system should be a patient
teacher.

The pieces are already in place; what's needed is to recognize
them as a teaching apparatus and complete the loop:

- The **hint button** in the UI surfaces a trick the player could
  try right now. As the player gets stronger, the hints they need
  shift up the trick ladder.
- The **trick vocabulary** in replay tags labels every move with
  a name. A player watching their own game (or someone else's)
  can see *what* trick happened and *why*. Names that started
  abstract become familiar through repetition.
- The **puzzle-generation loop** captures positions where the bot
  got stuck — these are exactly the positions a learning player
  would benefit from solving. Solving them stretches their
  vocabulary; failing teaches them where their bag is thin.
- The **post-game annotation** field on plays (the `note` column)
  anticipates a future where players record commentary on their
  own moves, share games with friends, and build a personal
  library of teaching positions.
- The progressive-learning demo (`tools/learn_game.ts`) plays the
  same deal three times with successively larger trick bags. That
  pattern — "watch the same position with a beginner's bag, then
  with an expert's" — is a teaching primitive we can surface in
  the UI.

The expert end of the curve is also served. A strong player can
turn off hints, generate puzzles for themselves, study their own
replays for missed tricks, and use the system as a sparring
partner that never tires. The same architecture serves both ends
of the skill spectrum — only the configuration differs.

### 4. Puzzle-generation feedback loop

The bot plays games, gets stuck mid-game, and captures the
position as a puzzle. Steve (or any skilled player) solves the
puzzle. The solution either:

- Demonstrates a trick the bot is missing — port it.
- Demonstrates a trick the bot has but didn't pick — fix the
  cascade or selection logic.
- Confirms an unreachable bridge — file the position as a
  legitimate hard case.

This loop is how the bot stays honest. We don't measure quality
by win rate against itself; we measure by whether it gets stuck
in the same places humans do.

### 5. LynRummy is first-class in Gopher

Not "a generic game with LynRummy bolted on." Gopher knows about
LynRummy specifically: dedicated tables (`lynrummy_plays`),
dedicated endpoints (`POST /gopher/games/{id}/plays`), a referee
that validates LynRummy moves, a replay viewer that renders
LynRummy boards and tags moves with LynRummy tricks. Other game
types are welcome but won't compromise LynRummy's depth.

### 6. Post-game review as a teaching tool

The replay viewer with trick tags isn't just nostalgia. It's a
classroom. A player scrubbing through their game can see the
board state, the move, the trick name, and (eventually) their
own annotation. Replay is where learning actually compounds —
playing the game is exposure, replaying it is practice.

### 7. Multiplayer for real people

Steve, his mother Debbie, and his collaborator Apoorva are
real first-class players, not test data. Live games and async
games both matter. Sharing puzzles between players matters.
The social dimension of the kitchen table is part of what we're
preserving, not an afterthought.

### 8. Trick vocabulary as the lingua franca

A trick name appears in the UI hint, the database column, the
replay tag, the analysis bucket, the journal entry, and in
conversations between players. One concept, threaded through
every layer. When we add a trick, it manifests everywhere
because all the layers speak the same language.

## Things deliberately out of scope

- **Beating expert humans via brute-force search.** The graph
  solver lives in `hints/reassemble_graph.ts` as research code
  but isn't wired into normal play. We're not building DeepRummy.
- **Competitive ratings, tournaments, matchmaking.** The audience
  is friends and family playing for fun and getting better
  together. ELO is not the point.
- **Generalizing to other Rummy variants.** LynRummy has its own
  rules (the dup rule, the rb-run concept, the geometry of
  stacks). The system is specifically about this game.

## How we know we've succeeded

A few markers, in rough order of difficulty:

1. **Steve's mother can sit down and play a game** without
   feeling like she's fighting the interface. (She knows the
   game cold; the test is whether the digital version respects
   that knowledge.)
2. **A new player can use the hint button to learn a new trick**
   and start applying it unprompted within a few games.
3. **The bot's stuck-rate matches the rate at which strong human
   players get stuck** in the same positions. Not better; matched.
4. **A player can replay one of their losses and identify the
   trick they missed**, by name, without help.
5. **Players share puzzles with each other** — "look at this
   position I got stuck on, what would you do?" — using the
   in-system puzzle format.

## For AI agents reading this

When you're tempted to add a feature, ask which of these eight
items it serves. If the answer is "none of them" or "it's just
neat," push back on yourself before pushing back on Steve.

The vocabulary matters as much as the code. A new feature that
introduces names humans wouldn't use at the kitchen table works
against the vision even if it's technically correct.

When in doubt: the kitchen table is the ground truth. The screen
is a substitute, not a replacement.
