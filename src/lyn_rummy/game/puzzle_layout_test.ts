import assert from "node:assert/strict";
import { Card, OriginDeck } from "../core/card";
import { BoardCardState } from "../core/card_stack";
import { layout_stacks_as_simple_rows } from "./puzzle_layout";

const D1 = OriginDeck.DECK_ONE;

function cards(...labels: string[]): Card[] {
    return labels.map((label) => Card.from(label, D1));
}

// Empty input -> empty output.
{
    assert.equal(layout_stacks_as_simple_rows([], 25).length, 0);
}

// Single stack -> one JsonCardStack with cards in order at the
// top-left of the board.
{
    const stack = cards("3H", "4H", "5H");
    const out = layout_stacks_as_simple_rows([stack], 25);
    assert.equal(out.length, 1);
    assert.equal(out[0].board_cards.length, 3);
    assert.equal(out[0].board_cards[0].card.value, 3);
    assert.equal(out[0].board_cards[2].card.value, 5);
    for (const bc of out[0].board_cards) {
        assert.equal(bc.state, BoardCardState.FIRMLY_ON_BOARD);
    }
    assert.ok(out[0].loc.top >= 0 && out[0].loc.top < 100);
    assert.ok(out[0].loc.left >= 0 && out[0].loc.left < 200);
}

// Multiple short stacks pack onto one row when their total card
// count fits the budget.
{
    const stacks = [
        cards("3H", "4H", "5H"),  // 3 cards
        cards("7C", "7D", "7H"),  // 3 cards
        cards("KS", "AS", "2S"),  // 3 cards
        cards("JD", "QD", "KD"),  // 3 cards
    ];
    // Total = 12 cards, well under 25 budget. All on one row.
    const out = layout_stacks_as_simple_rows(stacks, 25);
    assert.equal(out.length, 4);
    for (let i = 1; i < out.length; i++) {
        assert.equal(out[i].loc.top, out[0].loc.top, "all on row 0");
        assert.ok(out[i].loc.left > out[i - 1].loc.left, "stacks pack rightward");
    }
}

// Card-count budget triggers a row wrap.
{
    const stacks = [
        cards("3H", "4H", "5H", "6H", "7H", "8H", "9H", "TH", "JH", "QH", "KH", "AH", "2H"), // 13 cards
        cards("3C", "4C", "5C", "6C", "7C", "8C", "9C", "TC", "JC", "QC"), // 10 cards
        cards("AS", "2S", "3S"),  // 3 cards
    ];
    // 13 + 10 = 23 cards, fits 25. Adding 3 more = 26, exceeds.
    // So row 0 has stacks 0 and 1, row 1 has stack 2.
    const out = layout_stacks_as_simple_rows(stacks, 25);
    assert.equal(out.length, 3);
    assert.equal(out[0].loc.top, out[1].loc.top);
    assert.ok(out[2].loc.top > out[0].loc.top);
}

// A single stack larger than the budget still gets placed on its
// own row (it doesn't infinitely wrap).
{
    const huge = cards("3H", "4H", "5H", "6H", "7H", "8H", "9H", "TH", "JH", "QH", "KH", "AH", "2H"); // 13
    const stacks = [huge, huge, huge];  // 39 total
    const out = layout_stacks_as_simple_rows(stacks, 10);
    // Budget is 10, each stack is 13. Each stack alone exceeds
    // the budget but still gets its own row. Three rows total.
    assert.equal(out.length, 3);
    assert.ok(out[1].loc.top > out[0].loc.top);
    assert.ok(out[2].loc.top > out[1].loc.top);
    // Each row starts at the same x (LEFT_BASE).
    assert.equal(out[0].loc.left, out[1].loc.left);
    assert.equal(out[0].loc.left, out[2].loc.left);
}

// Wider stacks take more horizontal space, so the gap between
// stack 1's left and stack 0's left is larger when stack 0 has
// more cards. Verifies stack widths really propagate.
{
    const short = layout_stacks_as_simple_rows(
        [cards("3H", "4H", "5H"), cards("7C", "7D", "7H")],
        25,
    );
    const long = layout_stacks_as_simple_rows(
        [
            cards("3H", "4H", "5H", "6H", "7H", "8H", "9H"),
            cards("7C", "7D", "7H"),
        ],
        25,
    );
    const short_gap = short[1].loc.left - short[0].loc.left;
    const long_gap = long[1].loc.left - long[0].loc.left;
    assert.ok(
        long_gap > short_gap,
        "longer first stack should push the second further right",
    );
}

// Stack contents are not mutated.
{
    const stack = cards("3H", "4H", "5H");
    const before = stack.length;
    layout_stacks_as_simple_rows([stack], 25);
    assert.equal(stack.length, before);
}

console.log("All puzzle_layout tests passed.");
