// Tests for dissolving consecutive sets into runs.
//
// Three sets with consecutive values (e.g. 6s, 7s, 8s) can
// potentially be rearranged into pure runs or rb runs that
// score higher.

import assert from "node:assert/strict";
import { Card, OriginDeck, Suit, value_str } from "./card";
import { BoardCard, BoardCardState, CardStack, type BoardLocation } from "./card_stack";
import { Score } from "./score";
import { do_obvious_board_improvements } from "./board_improve";

const D1 = OriginDeck.DECK_ONE;
const D2 = OriginDeck.DECK_TWO;
const loc: BoardLocation = { top: 0, left: 0 };
const sl: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
function cs(c: Card): string { return value_str(c.value) + sl[c.suit]; }

function bs(deck: OriginDeck, ...labels: string[]): CardStack {
    return new CardStack(
        labels.map((l) => new BoardCard(Card.from(l, deck), BoardCardState.FIRMLY_ON_BOARD)), loc);
}

// Story: Three consecutive 3-card sets with the same 3 suits.
// [6H 6S 6D] [7H 7S 7D] [8H 8S 8D]
// Sets score: 3 × 60 = 180.
// Pure runs: [6H 7H 8H] [6S 7S 8S] [6D 7D 8D] = 3 × 100 = 300.
// Gain: +120.
{
    const board = [
        bs(D1, "6H", "6S", "6D"),
        bs(D1, "7H", "7S", "7D"),
        bs(D1, "8H", "8S", "8D"),
    ];
    const before = Score.for_stacks(board);
    assert.equal(before, 180);

    const result = do_obvious_board_improvements(board);
    const after = Score.for_stacks(result.board);

    console.log(`  Case 1: 3 sets → 3 pure runs: ${before} → ${after} (+${after - before})`);
    assert(after >= 300, `Expected at least 300, got ${after}`);
    console.log("  ✓");
}

// Story: Three consecutive sets, mixed suits — can make some
// pure runs but not all. [6H 6S 6D] [7H 7S 7C] [8H 8S 8D]
// Pure runs: [6H 7H 8H] ✓, [6S 7S 8S] ✓
// 6D and 8D share suit but 7C doesn't. So [6D 7C 8D] is rb
// (red black red). Score: 2×100 + 50 = 250 vs 180 = +70.
{
    const board = [
        bs(D1, "6H", "6S", "6D"),
        bs(D1, "7H", "7S", "7C"),
        bs(D1, "8H", "8S", "8D"),
    ];
    const before = Score.for_stacks(board);
    const result = do_obvious_board_improvements(board);
    const after = Score.for_stacks(result.board);

    console.log(`  Case 2: 3 sets mixed suits: ${before} → ${after} (+${after - before})`);
    assert(after > before, "Should improve");
    console.log("  ✓");
}

// Story: Three consecutive sets alongside existing pure runs.
// The dissolved cards should extend the existing runs.
{
    const board = [
        bs(D1, "3H", "4H", "5H"),   // hearts run
        bs(D1, "3S", "4S", "5S"),   // spades run
        bs(D1, "6H", "6S", "6D"),   // } consecutive
        bs(D1, "7H", "7S", "7D"),   // } sets
        bs(D1, "8H", "8S", "8D"),   // }
    ];
    const before = Score.for_stacks(board);
    const result = do_obvious_board_improvements(board);
    const after = Score.for_stacks(result.board);

    console.log(`  Case 3: sets next to runs: ${before} → ${after} (+${after - before})`);
    // Should form [3H..8H] and [3S..8S] plus something for the D cards.
    assert(after > before, "Should improve significantly");
    console.log("  ✓");
}

// Story: Two consecutive sets (not three) — should still try.
{
    const board = [
        bs(D1, "6H", "6S", "6D"),
        bs(D1, "7H", "7S", "7D"),
    ];
    const before = Score.for_stacks(board);
    const result = do_obvious_board_improvements(board);
    const after = Score.for_stacks(result.board);

    console.log(`  Case 4: only 2 consecutive sets: ${before} → ${after} (+${after - before})`);
    // 6 cards, can't form 3-card runs without a third value.
    // Should stay as sets.
    console.log("  ✓");
}

// Story: Non-consecutive sets — trick doesn't apply.
{
    const board = [
        bs(D1, "3H", "3S", "3D"),
        bs(D1, "7H", "7S", "7D"),
        bs(D1, "KH", "KS", "KD"),
    ];
    const before = Score.for_stacks(board);
    const result = do_obvious_board_improvements(board);
    const after = Score.for_stacks(result.board);

    assert.equal(after, before, "Non-consecutive sets shouldn't change");
    console.log("  Case 5: non-consecutive sets unchanged ✓");
}

console.log("\nAll consecutive sets tests passed.");
