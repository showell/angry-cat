// Swap tests: same-color substitution in red/black runs.
//
// In an rb run, any position only cares about COLOR, not suit.
// So 4D (red) in an rb run can be replaced by 4H (red) from
// the hand — if 4D has somewhere else to go.

import assert from "node:assert/strict";
import { Card, OriginDeck, Suit, value_str } from "../core/card";
import {
    BoardCard, BoardCardState, CardStack, HandCard, HandCardState,
    type BoardLocation,
} from "../core/card_stack";
import { find_playable_hand_cards, find_swap_plays, get_hint, HintLevel } from "../hints/hints";

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
function hc(label: string, deck: OriginDeck = D1): HandCard {
    return new HandCard(Card.from(label, deck), HandCardState.NORMAL);
}

// --- Case 1: Kick 4D to a pure diamond run ---
//
// Hand: 4H
// Board:
//   [3S 4D 5C] — rb run (black, red, black). 4D holds the red spot.
//   [2D 3D]    — incomplete diamond run, wants 4D on the right.
//
// 4H can't play directly:
//   - [3S 4D 5C]: 4H is red like 4D, but the run already has a 4.
//     Actually [3S 4H 5C] would also be valid rb (black red black).
//     But the 4 position is occupied by 4D.
//   - [2D 3D]: 4H is hearts, not diamonds. Can't extend.
//
// Swap: kick 4D from the rb run → joins [2D 3D 4D] (pure diamond run).
// 4H takes 4D's place → [3S 4H 5C] (still valid rb: black red black).
{
    const board = [
        bs(D1, "3S", "4D", "5C"),
        bs(D1, "2D", "3D"),
    ];
    const hand = [hc("4H")];

    // Confirm 4H has no direct play.
    const direct = find_playable_hand_cards(hand, board);
    assert.equal(direct.length, 0,
        "4H should NOT have a direct play — " + direct.map(h => cs(h.card)));

    const swaps = find_swap_plays(hand, board);
    assert.equal(swaps.length, 1, "should find 1 swap");
    assert.equal(cs(swaps[0].card), "4H");

    const hint = get_hint(hand, board);
    assert.equal(hint.level, HintLevel.SWAP);
    console.log("  Case 1: swap 4D→diamond run, 4H takes rb spot ✓");
}

// --- Case 2: Kick 4D to a set ---
//
// Hand: 4H
// Board:
//   [3S 4D 5C]    — rb run (black, red, black).
//   [4H 4C 4S]    — set of 4s (has H, C, S — missing D).
//
// 4H can't play directly:
//   - [3S 4D 5C]: position occupied.
//   - [4H 4C 4S]: heart already present!
//
// Swap: kick 4D from rb run → joins set [4H 4C 4S 4D] (4-set, valid).
// 4H takes 4D's place → [3S 4H 5C] (valid rb).
//
// Note: 4H can't join the set because heart is already there.
// And 4D can't stay on the rb run because we want its spot.
// But 4D CAN join the set because diamond is missing. That's the
// asymmetry that makes swap valuable for dups.
{
    const board = [
        bs(D1, "3S", "4D", "5C"),
        bs(D1, "4H", "4C", "4S"),
    ];
    const hand = [hc("4H", D2)];

    // Confirm 4H:D2 has no direct play.
    const direct = find_playable_hand_cards(hand, board);
    assert.equal(direct.length, 0,
        "4H:D2 should NOT have a direct play — " + direct.map(h => cs(h.card)));

    const swaps = find_swap_plays(hand, board);
    assert.equal(swaps.length, 1, "should find 1 swap");
    assert.equal(cs(swaps[0].card), "4H");

    const hint = get_hint(hand, board);
    assert.equal(hint.level, HintLevel.SWAP);
    console.log("  Case 2: swap 4D→4-set, 4H:D2 takes rb spot ✓");
}

// --- Case 3: No swap possible — kicked card has nowhere to go ---
{
    const board = [
        bs(D1, "3S", "4D", "5C"),  // rb run
        // No diamond run or set with room for 4D.
    ];
    const hand = [hc("4H")];

    const swaps = find_swap_plays(hand, board);
    assert.equal(swaps.length, 0, "no swap — 4D has no home");
    console.log("  Case 3: no swap when kicked card has no home ✓");
}

// --- Case 4: No swap — hand card is wrong color ---
{
    const board = [
        bs(D1, "3S", "4D", "5C"),  // rb run, 4D is red
        bs(D1, "2D", "3D"),         // diamond run wants 4D
    ];
    const hand = [hc("4S")]; // 4S is BLACK, 4D is RED — different color!

    const swaps = find_swap_plays(hand, board);
    assert.equal(swaps.length, 0, "no swap — different colors");
    console.log("  Case 4: no swap when colors don't match ✓");
}

console.log("\nAll swap tests passed.");
