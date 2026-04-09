import assert from "node:assert/strict";
import { Card, OriginDeck } from "./card";
import { BoardCardState } from "./card_stack";
import { layout_stacks_as_simple_rows } from "./puzzle_layout";

const D1 = OriginDeck.DECK_ONE;

function cards(...labels: string[]): Card[] {
    return labels.map((label) => Card.from(label, D1));
}

// Empty input -> empty output.
{
    const out = layout_stacks_as_simple_rows([]);
    assert.equal(out.length, 0);
}

// Single stack -> one JsonCardStack with the same cards in order
// and a top in the expected starting region.
{
    const stack = cards("3H", "4H", "5H");
    const out = layout_stacks_as_simple_rows([stack]);
    assert.equal(out.length, 1);
    assert.equal(out[0].board_cards.length, 3);
    // Cards preserved in order.
    assert.equal(out[0].board_cards[0].card.value, 3);
    assert.equal(out[0].board_cards[2].card.value, 5);
    // Cards land in FIRMLY_ON_BOARD state.
    for (const bc of out[0].board_cards) {
        assert.equal(bc.state, BoardCardState.FIRMLY_ON_BOARD);
    }
    // First row sits near the top of the board.
    assert.ok(out[0].loc.top >= 0 && out[0].loc.top < 100);
    assert.ok(out[0].loc.left >= 0 && out[0].loc.left < 200);
}

// Many stacks -> rows are vertically separated and tops are
// strictly increasing in input order.
{
    const stacks = [
        cards("3H", "4H", "5H"),
        cards("7C", "7D", "7H"),
        cards("KS", "AS", "2S"),
        cards("JD", "QD", "KD"),
        cards("AH", "2H", "3H"),
    ];
    const out = layout_stacks_as_simple_rows(stacks);
    assert.equal(out.length, 5);
    for (let i = 1; i < out.length; i++) {
        assert.ok(
            out[i].loc.top > out[i - 1].loc.top,
            `row ${i} should be below row ${i - 1}`,
        );
    }
}

// Stack contents are not mutated.
{
    const stack = cards("3H", "4H", "5H");
    const before = stack.length;
    layout_stacks_as_simple_rows([stack]);
    assert.equal(stack.length, before);
}

console.log("All puzzle_layout tests passed.");
