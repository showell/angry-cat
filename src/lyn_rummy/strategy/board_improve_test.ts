// Tests for obvious board improvements.

import assert from "node:assert/strict";
import { Card, OriginDeck, Suit, value_str } from "../core/card";
import { BoardCard, BoardCardState, CardStack, type BoardLocation } from "../core/card_stack";
import { Score } from "../core/score";
import { find_upgrades, do_obvious_board_improvements } from "./board_improve";

const D1 = OriginDeck.DECK_ONE;
const loc: BoardLocation = { top: 0, left: 0 };
const sl: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
function cs(c: Card): string { return value_str(c.value) + sl[c.suit]; }

function bs(...labels: string[]): CardStack {
    return new CardStack(
        labels.map((l) => new BoardCard(Card.from(l, D1), BoardCardState.FIRMLY_ON_BOARD)), loc);
}

// Story: 6S is in a 4-card set but could extend a spade run.
// Set [6H 6S 6D 6C] (120) + run [4S 5S] (incomplete, 0).
// After: set [6H 6D 6C] (60) + run [4S 5S 6S] (100). Delta = +40.
{
    const board = [bs("6H", "6S", "6D", "6C"), bs("4S", "5S")];
    const upgrades = find_upgrades(board);

    assert.equal(upgrades.length, 1);
    assert.equal(cs(upgrades[0].card), "6S");
    assert.equal(upgrades[0].score_delta, 40);
    console.log("  set → pure run: 6S upgrade found (+40) ✓");
}

// Story: 7H is in an rb run but could join a hearts pure run.
// rb [6S 7H 8S 9H] (100) + pure [4H 5H 6H] (100).
// After peel 7H: rb [6S ... ] — wait, peeling 7H from middle
// of a 4-card rb run. Position 1 in [6S 7H 8S 9H]. That's
// not an end peel (need 4+ and at end). Let me use end peel:
// rb [5S 6H 7S 8H] — peel 8H from right → rb [5S 6H 7S] (50).
// pure [6H 7H] (incomplete). Hmm, need a valid target.
//
// Simpler: rb [6S 7H 8C 9D] peel 6S? No, 6S is wrong.
// Let me just use a clear case.
// Board: [7H 7S 7D 7C] (set) + [5H 6H] (incomplete).
// Peel 7H → [7S 7D 7C] (set 60) + merge → [5H 6H 7H] (pure 100).
// Old: 120 + 0 = 120. New: 60 + 100 = 160. Delta = +40.
{
    const board = [bs("7H", "7S", "7D", "7C"), bs("5H", "6H")];
    const upgrades = find_upgrades(board);

    assert(upgrades.length >= 1);
    assert.equal(cs(upgrades[0].card), "7H");
    assert.equal(upgrades[0].score_delta, 40);
    console.log("  set → pure run: 7H completes hearts run (+40) ✓");
}

// Story: no upgrades possible. Board is all pure runs.
{
    const board = [bs("4H", "5H", "6H"), bs("TS", "JS", "QS")];
    const upgrades = find_upgrades(board);
    assert.equal(upgrades.length, 0);
    console.log("  all pure runs: no upgrades ✓");
}

// Story: rb run card could join a pure run.
// [5S 6H 7S 8H] (rb, 100) + [3H 4H] (incomplete).
// Peel 6H from position 1? Not an end. Can't peel from middle
// of a 4-card run.
// [4D 5H 6S 7H 8D] (rb, 150) + [3H] — no, 1 card isn't a stack.
//
// End peel: [5D 6S 7H 8C] (rb, 100). Peel 5D from left →
// [6S 7H 8C] (rb, 50). Target [3D 4D] (incomplete).
// Merge: [3D 4D 5D] (pure, 100). Delta: (50+100) - (100+0) = +50.
{
    const board = [bs("5D", "6S", "7H", "8C"), bs("3D", "4D")];
    const upgrades = find_upgrades(board);
    assert(upgrades.length >= 1);
    assert.equal(cs(upgrades[0].card), "5D");
    assert.equal(upgrades[0].score_delta, 50);
    console.log("  rb run → pure run: 5D upgrade (+50) ✓");
}

// Story: do_obvious_board_improvements applies multiple upgrades.
{
    const board = [
        bs("6H", "6S", "6D", "6C"),  // 4-set (120)
        bs("4S", "5S"),               // incomplete (0)
        bs("4H", "5H"),               // incomplete (0)
    ];
    // 6S → [4S 5S 6S] (+40). Then 6H can't peel — set is now
    // only 3 cards. So only 1 upgrade fires.
    const old_score = Score.for_stacks(board);
    const result = do_obvious_board_improvements(board);
    const new_score = Score.for_stacks(result.board);

    assert.equal(result.upgrades_applied, 1);
    assert.equal(result.score_gained, 40);
    assert.equal(new_score, old_score + 40);
    console.log(`  chained upgrades: 1 applied, +${result.score_gained} ✓`);
}

// Story: upgrade doesn't fire when delta would be negative.
// Moving a card from a 3-set to a pure run would destroy the set.
// [7H 7S 7D] (set, 60) + [5H 6H] (incomplete).
// Peeling 7H → [7S 7D] (incomplete, 0). Merge [5H 6H 7H] (pure, 100).
// Delta: (0 + 100) - (60 + 0) = +40. Actually that IS positive.
// But can_extract requires 4+ for sets. A 3-set can't be peeled.
{
    const board = [bs("7H", "7S", "7D"), bs("5H", "6H")];
    const upgrades = find_upgrades(board);
    assert.equal(upgrades.length, 0, "can't peel from 3-card set");
    console.log("  3-card set: no peel allowed ✓");
}

// Story: join enables promote. Two short spade runs that join
// into one long run, then a card promotes from a set onto it.
// Board: [4S 5S 6S] + [7S 8S 9S] + [6H 6S:D2 6D 6C] (4-set).
// Step 1 (join): [4S 5S 6S 7S 8S 9S] (6-card pure run).
// Step 2 (promote): 6S:D2 peels from set → but wait, [4S..9S]
// already has 6S. That won't work.
//
// Better: [4S 5S 6S] + [7S 8S 9S] + [TS TD TC TH] (4-set).
// Step 1 (join): [4S 5S 6S 7S 8S 9S].
// Step 2 (promote): TS from set joins run → [4S 5S 6S 7S 8S 9S TS].
// Old: run(4*100) + run(4*100) + set(2*60) = 400+400+120 = NO.
// Stacks are 3 each: run(1*100)+run(1*100)+set(2*60)=100+100+120=320.
// After join: run(4*100)=400, set stays 120, total=520. Delta=+100.
// After promote: run(5*100)+set(1*60)=500+60=560. Delta=+40.
{
    const board = [bs("4S", "5S", "6S"), bs("7S", "8S", "9S"), bs("TS", "TD", "TC", "TH")];
    const old_score = Score.for_stacks(board);
    const result = do_obvious_board_improvements(board);
    const new_score = Score.for_stacks(result.board);

    assert(result.upgrades_applied >= 2, `Expected join+promote, got ${result.upgrades_applied}`);
    assert(new_score > old_score, `Score should improve: ${old_score} → ${new_score}`);

    // Check the joined+promoted run exists.
    const long_run = result.board.find((s) => s.size() >= 7 && s.get_stack_type() === "pure run");
    assert(long_run !== undefined, "Should have a 7-card pure spade run");
    console.log(`  join→promote chain: ${old_score} → ${new_score} (+${new_score - old_score}), ${result.upgrades_applied} tricks ✓`);
}

console.log("\nAll board improvement tests passed.");
