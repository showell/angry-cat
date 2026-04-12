# The dup rule is the heart of Lyn Rummy

A "dup" is two cards with the same value and suit but different
origin decks (e.g., 9H:1 and 9H:2). The dup rule says: **two
dups cannot appear in the same set**.

Without this rule, the game would be trivial. Any two cards of
the same value could always join a set. The double deck provides
abundant material; sets of 3 would be easy to form from any hand.

With this rule, dup hands are the fundamental hard case.
Confirmed by Steve: "Dup cards are genuinely difficult problems!
It's the hardest part of the game. It confounds algorithms and
humans alike."

## What this means strategically

- When you hold a dup pair (e.g., 9H:1 and 9H:2), **one of them
  is dead weight this turn**. They compete for the same role.
- Setting aside one and focusing the turn on the other is often
  the right move.
- The "unplayable" heuristic should flag the weaker of a dup pair
  early so compute focuses on the rest of the hand.

## What this means for the game design

- Steve's dup rule is what makes the game have interesting
  decisions. It's the constraint that generates all the
  compound idioms (peel-redirect, split-for-set, etc.) —
  without the rule, you'd just merge whatever you wanted.
- This parallels chess's castling or en passant rules: a small
  irregular constraint that generates enormous depth.

## Implication for my algorithm

Don't try to "solve" dup hands perfectly. Instead:
1. Recognize them explicitly
2. Accept that one card may need to wait
3. Focus effort on playable cards
4. Don't penalize "got stuck with dup" as an algorithm failure —
   it's often the right answer
