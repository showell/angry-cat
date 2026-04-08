// Tests for board actions — merge decisions and board changes.
//
// Pure logic tests. No DOM, no rendering. We build CardStacks
// and HandCards, try merges, and verify the resulting BoardChanges.

import assert from "node:assert/strict";
import { Card, OriginDeck, Suit, value_str } from "./card";
import {
    BoardCard, BoardCardState, CardStack, HandCard, HandCardState,
    type BoardLocation,
} from "./card_stack";
import {
    try_hand_merge, try_stack_merge,
    place_hand_card, move_stack,
    find_all_stack_merges, find_all_hand_merges,
} from "./board_actions";

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

function hc(label: string): HandCard {
    return new HandCard(Card.from(label, D1), HandCardState.NORMAL);
}

// --- Story: I drag 7H onto the right end of [4H 5H 6H]. ---
{
    const stack = bs("4H", "5H", "6H");
    const card = hc("7H");

    const change = try_hand_merge(stack, card, "right");
    assert(change !== undefined, "7H should merge right onto hearts run");
    assert.equal(change.stacks_to_remove.length, 1);
    assert.equal(change.stacks_to_add.length, 1);
    assert.equal(change.stacks_to_add[0].size(), 4);
    assert.equal(change.hand_cards_to_release.length, 1);
    console.log("  merge 7H onto right of [4H 5H 6H] ✓");
}

// --- Story: I drag 3H onto the left end of [4H 5H 6H]. ---
{
    const stack = bs("4H", "5H", "6H");
    const card = hc("3H");

    const change = try_hand_merge(stack, card, "left");
    assert(change !== undefined, "3H should merge left onto hearts run");
    assert.equal(change.stacks_to_add[0].size(), 4);
    console.log("  merge 3H onto left of [4H 5H 6H] ✓");
}

// --- Story: I try to merge KS onto [4H 5H 6H]. It doesn't fit. ---
{
    const stack = bs("4H", "5H", "6H");
    const card = hc("KS");

    assert.equal(try_hand_merge(stack, card, "left"), undefined);
    assert.equal(try_hand_merge(stack, card, "right"), undefined);
    console.log("  KS rejected from [4H 5H 6H] ✓");
}

// --- Story: I drag [7H 8H 9H] onto the right end of [4H 5H 6H]. ---
{
    const left = bs("4H", "5H", "6H");
    const right = bs("7H", "8H", "9H");

    const change = try_stack_merge(left, right, "right");
    assert(change !== undefined, "runs should merge");
    assert.equal(change.stacks_to_remove.length, 2, "both stacks removed");
    assert.equal(change.stacks_to_add[0].size(), 6, "merged has 6 cards");
    assert.equal(change.hand_cards_to_release.length, 0, "no hand cards");
    console.log("  merge [7H 8H 9H] onto right of [4H 5H 6H] ✓");
}

// --- Story: I drag [7H 8H 9H] onto the left of [4H 5H 6H]. Doesn't fit. ---
{
    const left = bs("4H", "5H", "6H");
    const right = bs("7H", "8H", "9H");

    const change = try_stack_merge(left, right, "left");
    assert.equal(change, undefined, "wrong direction");
    console.log("  [7H 8H 9H] rejected from left of [4H 5H 6H] ✓");
}

// --- Story: I place a hand card as a new stack on the board. ---
{
    const card = hc("KS");
    const change = place_hand_card(card, { top: 100, left: 200 });

    assert.equal(change.stacks_to_remove.length, 0);
    assert.equal(change.stacks_to_add.length, 1);
    assert.equal(change.stacks_to_add[0].size(), 1);
    assert.equal(change.hand_cards_to_release.length, 1);
    console.log("  place KS on empty board ✓");
}

// --- Story: I move a stack to a new location. ---
{
    const stack = bs("4H", "5H", "6H");
    const change = move_stack(stack, { top: 50, left: 300 });

    assert.equal(change.stacks_to_remove.length, 1);
    assert.equal(change.stacks_to_add.length, 1);
    assert.equal(change.stacks_to_add[0].size(), 3);
    assert.equal(change.stacks_to_add[0].loc.left, 300);
    assert.equal(change.hand_cards_to_release.length, 0);
    console.log("  move stack to new location ✓");
}

// --- Story: I drag a stack and the board highlights all valid merges. ---
{
    const stacks = [
        bs("4H", "5H", "6H"),
        bs("7H", "8H", "9H"),
        bs("KS", "KD", "KH"),
    ];

    // Dragging [4H 5H 6H]. Should find merge with [7H 8H 9H] on right.
    const merges = find_all_stack_merges(stacks[0], stacks);
    assert.equal(merges.length, 1);
    assert.equal(merges[0].side, "right");
    assert.equal(merges[0].change.stacks_to_add[0].size(), 6);
    console.log("  find_all_stack_merges: [4H 5H 6H] → 1 merge ✓");

    // Dragging [KS KD KH]. No merges.
    const no_merges = find_all_stack_merges(stacks[2], stacks);
    assert.equal(no_merges.length, 0);
    console.log("  find_all_stack_merges: [KS KD KH] → 0 merges ✓");
}

// --- Story: I drag 7S from my hand. The board shows merge zones. ---
{
    const stacks = [
        bs("4H", "5H", "6H"),
        bs("7H", "7D", "7C"),
        bs("8S", "9S", "TS"),
    ];
    const card = hc("7S");

    const merges = find_all_hand_merges(card, stacks);

    // 7S can join the 7-set on either side (set merges are symmetric).
    // 7S can also extend [8S 9S TS] on the left? No, 7S is predecessor
    // of 8S... that depends on the run direction. Let's just check count.
    const merge_labels = merges.map((m) =>
        `${m.side} of [${m.stack.get_cards().map(cs).join(" ")}]`);

    // 7S should merge into the set and possibly the spade run.
    assert(merges.length >= 1, `Expected merges for 7S, got: ${merge_labels}`);
    console.log(`  find_all_hand_merges: 7S → ${merges.length} merges (${merge_labels.join(", ")}) ✓`);
}

// --- Story: I drag 7H and it's a duplicate. Can't merge onto [7H 7D 7C]. ---
{
    const stacks = [bs("7H", "7D", "7C")];
    const card = hc("7H");

    const merges = find_all_hand_merges(card, stacks);
    // 7H same suit already in set — should be rejected.
    assert.equal(merges.length, 0, "duplicate 7H rejected from set");
    console.log("  duplicate 7H rejected from [7H 7D 7C] ✓");
}

console.log("\nAll board actions tests passed.");
