import assert from "node:assert/strict";
import { Card, OriginDeck, Suit } from "../core/card";
import { BoardCard, BoardCardState, CardStack, type BoardLocation } from "../core/card_stack";
import { diff_boards, format_diff } from "./board_diff";

const D1 = OriginDeck.DECK_ONE;
const loc: BoardLocation = { top: 0, left: 0 };

function bs(...labels: string[]): CardStack {
    return new CardStack(
        labels.map((l) => new BoardCard(Card.from(l, D1), BoardCardState.FIRMLY_ON_BOARD)), loc);
}

// Identical boards.
{
    const board = [bs("4H", "5H", "6H"), bs("7S", "7D", "7C")];
    const d = diff_boards(board, board);
    assert.equal(d.kept_count, 2);
    assert.equal(d.removed_count, 0);
    assert.equal(d.added_count, 0);
    assert.equal(d.cards_moved, 0);
    console.log("  Case 1: identical boards → 0 moved ✓");
}

// One stack split into two.
{
    const old_board = [bs("4H", "5H", "6H", "7H")];
    const new_board = [bs("4H", "5H", "6H"), bs("7H", "7S", "7D")];
    const d = diff_boards(old_board, new_board);
    assert.equal(d.kept_count, 0);
    assert.equal(d.removed_count, 1);
    assert.equal(d.added_count, 2);
    console.log(`  Case 2: split → ${d.cards_moved} cards moved ✓`);
    console.log(format_diff(d));
}

// One stack unchanged, one replaced.
{
    const old_board = [bs("4H", "5H", "6H"), bs("7S", "7D", "7C")];
    const new_board = [bs("4H", "5H", "6H"), bs("7S", "8S", "9S")];
    const d = diff_boards(old_board, new_board);
    assert.equal(d.kept_count, 1);
    assert.equal(d.removed_count, 1);
    assert.equal(d.added_count, 1);
    assert.equal(d.cards_moved, 6); // 3 removed + 3 added
    console.log(`  Case 3: one kept, one replaced → ${d.cards_moved} moved ✓`);
}

// New board has extra stack (hand card played).
{
    const old_board = [bs("4H", "5H", "6H")];
    const new_board = [bs("4H", "5H", "6H"), bs("7S", "7D", "7C")];
    const d = diff_boards(old_board, new_board);
    assert.equal(d.kept_count, 1);
    assert.equal(d.removed_count, 0);
    assert.equal(d.added_count, 1);
    assert.equal(d.cards_moved, 3);
    console.log(`  Case 4: one added → ${d.cards_moved} moved ✓`);
}

// Duplicate stacks (double deck).
{
    const old_board = [bs("4H", "5H", "6H"), bs("4H", "5H", "6H")];
    const new_board = [bs("4H", "5H", "6H"), bs("4H", "5H", "6H")];
    const d = diff_boards(old_board, new_board);
    assert.equal(d.kept_count, 2);
    assert.equal(d.cards_moved, 0);
    console.log("  Case 5: duplicate stacks matched ✓");
}

// Large rearrangement.
{
    const old_board = [
        bs("AH", "2H", "3H", "4H", "5H"),
        bs("7S", "7D", "7C"),
        bs("TD", "JD", "QD"),
    ];
    const new_board = [
        bs("AH", "2H", "3H"),
        bs("4H", "5H", "6H"),
        bs("7S", "7D", "7C"),
        bs("TD", "JD", "QD", "KD"),
    ];
    const d = diff_boards(old_board, new_board);
    // 7-set and diamonds kept (diamonds changed though — QD vs QD,KD)
    // Actually diamonds changed: old [TD JD QD] ≠ new [TD JD QD KD]
    assert.equal(d.kept_count, 1); // only 7-set
    console.log(`  Case 6: large rearrange → kept ${d.kept_count}, moved ${d.cards_moved} ✓`);
    console.log(format_diff(d));
}

console.log("\nAll board diff tests passed.");
