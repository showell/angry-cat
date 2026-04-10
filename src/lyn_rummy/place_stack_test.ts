import assert from "node:assert/strict";
import { Card, OriginDeck } from "./card";
import { BoardCardState, type JsonCardStack } from "./card_stack";
import {
    type BoardBounds,
    find_open_loc,
    stack_width,
} from "./place_stack";

const D1 = OriginDeck.DECK_ONE;

function cards(...labels: string[]): Card[] {
    return labels.map((label) => Card.from(label, D1));
}

// Build a JsonCardStack at a given top/left for tests. The cards
// are placeholders — the placer only cares about loc + card count.
function stack_at(
    top: number,
    left: number,
    card_count: number,
): JsonCardStack {
    const labels = ["AH", "2H", "3H", "4H", "5H", "6H", "7H", "8H", "9H", "TH", "JH", "QH"];
    const board_cards = cards(...labels.slice(0, card_count)).map((card) => ({
        card,
        state: BoardCardState.FIRMLY_ON_BOARD,
    }));
    return { board_cards, loc: { top, left } };
}

function bounds(over: Partial<BoardBounds>): BoardBounds {
    return {
        max_width: 1200,
        max_height: 540,
        margin: 4,
        step: 10,
        ...over,
    };
}

// stack_width: 1 card = CARD_WIDTH; each additional card adds
// CARD_PITCH (33). 0 cards = 0.
{
    assert.equal(stack_width(0), 0);
    assert.equal(stack_width(1), 27);
    assert.equal(stack_width(2), 27 + 33);
    assert.equal(stack_width(3), 27 + 33 * 2);
    assert.equal(stack_width(12), 27 + 33 * 11);
}

// Empty board: returns {top: 0, left: 0}.
{
    const loc = find_open_loc([], 3, bounds({}));
    assert.equal(loc.top, 0);
    assert.equal(loc.left, 0);
}

// One stack at top-left: the placer must move past it horizontally
// or down. The returned loc must NOT overlap.
{
    const existing = [stack_at(0, 0, 5)];
    const loc = find_open_loc(existing, 3, bounds({}));
    // Recompute the new stack's right/bottom and verify no overlap.
    const new_w = stack_width(3);
    const new_h = 40;
    const new_right = loc.left + new_w;
    const new_bottom = loc.top + new_h;
    const ex_right = 0 + stack_width(5);
    const ex_bottom = 0 + 40;
    const horizontal_clear = new_right <= 0 || loc.left >= ex_right;
    const vertical_clear = new_bottom <= 0 || loc.top >= ex_bottom;
    assert.ok(horizontal_clear || vertical_clear, "must not overlap");
}

// A row of stacks at top: the new stack must drop down below them.
{
    const existing = [
        stack_at(0, 0, 4),
        stack_at(0, 200, 4),
        stack_at(0, 400, 4),
    ];
    const loc = find_open_loc(existing, 3, bounds({}));
    // Anywhere is fine as long as it doesn't overlap any of the
    // three. Smoke-check that the answer is collision-free.
    const new_w = stack_width(3);
    const new_h = 40;
    for (const ex of existing) {
        const ex_w = stack_width(ex.board_cards.length);
        const overlap_x = loc.left < ex.loc.left + ex_w && loc.left + new_w > ex.loc.left;
        const overlap_y = loc.top < ex.loc.top + 40 && loc.top + new_h > ex.loc.top;
        assert.ok(!(overlap_x && overlap_y), "must not overlap row of stacks");
    }
}

// Tightly packed board: should still find SOMEWHERE that fits.
{
    // Six stacks scattered across the board.
    const existing = [
        stack_at(0, 0, 6),
        stack_at(0, 300, 4),
        stack_at(80, 0, 5),
        stack_at(80, 300, 3),
        stack_at(160, 0, 7),
        stack_at(160, 350, 4),
    ];
    const loc = find_open_loc(existing, 3, bounds({}));
    const new_w = stack_width(3);
    const new_h = 40;
    for (const ex of existing) {
        const ex_w = stack_width(ex.board_cards.length);
        const overlap_x =
            loc.left < ex.loc.left + ex_w &&
            loc.left + new_w > ex.loc.left;
        const overlap_y =
            loc.top < ex.loc.top + 40 && loc.top + new_h > ex.loc.top;
        assert.ok(!(overlap_x && overlap_y),
            `loc {${loc.top},${loc.left}} overlaps existing stack`);
    }
}

// No-fit fallback: very small board, big stack. The placer
// returns the bottom-left fallback.
{
    const tight = bounds({ max_width: 50, max_height: 50, margin: 0 });
    const loc = find_open_loc([], 5, tight);
    // A 5-card stack is 27 + 4*33 = 159px wide, won't fit in 50.
    // The fallback returns top = max_height - 40 = 10, left = 0.
    assert.equal(loc.left, 0);
    assert.equal(loc.top, 10);
}

// Margin really separates stacks: with margin=20 and an existing
// stack at the top-left, a new stack of the same width gets
// shifted at least one step further right than with margin=0.
{
    const existing = [stack_at(0, 0, 3)];
    const no_margin = find_open_loc(existing, 3, bounds({ margin: 0 }));
    const big_margin = find_open_loc(existing, 3, bounds({ margin: 20 }));
    // The big-margin run still has to clear the existing stack's
    // right edge plus 20 px on either side. So big_margin's
    // chosen loc must be at least as far from the origin as the
    // no-margin one (and usually further).
    const no_dist = Math.abs(no_margin.left) + Math.abs(no_margin.top);
    const big_dist = Math.abs(big_margin.left) + Math.abs(big_margin.top);
    assert.ok(big_dist >= no_dist,
        `big margin (${big_dist}) should not be closer than no margin (${no_dist})`);
}

console.log("All place_stack tests passed.");
