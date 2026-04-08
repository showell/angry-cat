import assert from "node:assert/strict";
import { Card, OriginDeck, Suit, value_str } from "./card";
import {
    BoardCard,
    BoardCardState,
    type BoardLocation,
    CardStack,
    HandCard,
    HandCardState,
} from "./card_stack";
import {
    find_playable_hand_cards,
    find_hand_stacks,
    find_loose_cards,
    type HandStack,
    type LooseCard,
} from "./hints";
import { CardStackType } from "./stack_type";

const D1 = OriginDeck.DECK_ONE;
const loc: BoardLocation = { top: 0, left: 0 };

const suit_letter: Record<Suit, string> = {
    [Suit.HEART]: "H",
    [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D",
    [Suit.CLUB]: "C",
};

function card_label(hc: HandCard): string {
    return value_str(hc.card.value) + suit_letter[hc.card.suit];
}

function playable_labels(hand: HandCard[], stacks: CardStack[]): string[] {
    return find_playable_hand_cards(hand, stacks).map(card_label).sort();
}

function board_stack(...labels: string[]): CardStack {
    const board_cards = labels.map(
        (label) =>
            new BoardCard(Card.from(label, D1), BoardCardState.FIRMLY_ON_BOARD),
    );
    return new CardStack(board_cards, loc);
}

function hand_card(label: string): HandCard {
    return new HandCard(Card.from(label, D1), HandCardState.NORMAL);
}

// extend a pure run on the right
{
    const stacks = [board_stack("AH", "2H", "3H")];
    const hand = [hand_card("4H"), hand_card("KS")];
    assert.deepEqual(playable_labels(hand, stacks), ["4H"]);
}

// extend a pure run on the left
{
    const stacks = [board_stack("3H", "4H", "5H")];
    const hand = [hand_card("2H"), hand_card("9D")];
    assert.deepEqual(playable_labels(hand, stacks), ["2H"]);
}

// extend a set
{
    const stacks = [board_stack("7S", "7D", "7C")];
    const hand = [hand_card("7H"), hand_card("8H")];
    assert.deepEqual(playable_labels(hand, stacks), ["7H"]);
}

// no playable cards
{
    const stacks = [board_stack("AH", "2H", "3H")];
    const hand = [hand_card("KS"), hand_card("9D")];
    assert.deepEqual(playable_labels(hand, stacks), []);
}

// empty hand / empty board
{
    assert.deepEqual(playable_labels([], [board_stack("AH", "2H", "3H")]), []);
    assert.deepEqual(playable_labels([hand_card("4H")], []), []);
}

// multiple cards playable across multiple stacks
{
    const stacks = [
        board_stack("AH", "2H", "3H"),
        board_stack("7S", "7D", "7C"),
    ];
    const hand = [hand_card("4H"), hand_card("7H"), hand_card("KS")];
    assert.deepEqual(playable_labels(hand, stacks), ["4H", "7H"]);
}

// === find_hand_stacks tests ===

function stack_labels(hs: HandStack): string[] {
    return hs.cards.map(card_label);
}

// Find a set of three 7s in hand.
{
    const hand = [hand_card("7H"), hand_card("7S"), hand_card("7D"), hand_card("KS")];
    const stacks = find_hand_stacks(hand);
    assert.equal(stacks.length, 1);
    assert.equal(stacks[0].stack_type, CardStackType.SET);
    assert.deepEqual(stack_labels(stacks[0]).sort(), ["7D", "7H", "7S"]);
}

// Find a pure run of 3 hearts.
{
    const hand = [hand_card("3H"), hand_card("4H"), hand_card("5H"), hand_card("KS")];
    const stacks = find_hand_stacks(hand);
    const pure_runs = stacks.filter(s => s.stack_type === CardStackType.PURE_RUN);
    assert.equal(pure_runs.length, 1);
    assert.deepEqual(stack_labels(pure_runs[0]), ["3H", "4H", "5H"]);
}

// Find a red/black alternating run.
{
    const hand = [hand_card("3H"), hand_card("4S"), hand_card("5D"), hand_card("KS")];
    const stacks = find_hand_stacks(hand);
    const rb_runs = stacks.filter(s => s.stack_type === CardStackType.RED_BLACK_RUN);
    assert.equal(rb_runs.length, 1);
    assert.deepEqual(stack_labels(rb_runs[0]), ["3H", "4S", "5D"]);
}

// No valid stacks in hand.
{
    const hand = [hand_card("AH"), hand_card("5S"), hand_card("9D")];
    const stacks = find_hand_stacks(hand);
    assert.equal(stacks.length, 0);
}

// Two cards of same value is not enough for a set.
{
    const hand = [hand_card("7H"), hand_card("7S"), hand_card("KS")];
    const stacks = find_hand_stacks(hand);
    const sets = stacks.filter(s => s.stack_type === CardStackType.SET);
    assert.equal(sets.length, 0);
}

// A longer pure run (4 cards).
{
    const hand = [hand_card("TH"), hand_card("JH"), hand_card("QH"), hand_card("KH")];
    const stacks = find_hand_stacks(hand);
    const pure_runs = stacks.filter(s => s.stack_type === CardStackType.PURE_RUN);
    assert.equal(pure_runs.length, 1);
    assert.equal(pure_runs[0].cards.length, 4);
}

// Set of 4 (all suits).
{
    const hand = [hand_card("5H"), hand_card("5S"), hand_card("5D"), hand_card("5C")];
    const stacks = find_hand_stacks(hand);
    assert.equal(stacks.length, 1);
    assert.equal(stacks[0].stack_type, CardStackType.SET);
    assert.equal(stacks[0].cards.length, 4);
}

// Multiple valid stacks in one hand.
{
    const hand = [
        hand_card("7H"), hand_card("7S"), hand_card("7D"),  // set
        hand_card("AH"), hand_card("2H"), hand_card("3H"),  // pure run
    ];
    const stacks = find_hand_stacks(hand);
    assert(stacks.length >= 2, `expected at least 2 stacks, got ${stacks.length}`);
}

// === find_loose_cards tests ===

function loose_card_label(lc: LooseCard): string {
    return value_str(lc.card.card.value) + suit_letter[lc.card.card.suit];
}

// Steal the 8H from a 4-card run to extend a set of 8s.
// Board: [5H 6H 7H 8H] and [8S 8D 8C]
// The 8H is loose on the right — it can join the set.
{
    const stacks = [
        board_stack("5H", "6H", "7H", "8H"),
        board_stack("8S", "8D", "8C"),
    ];
    const loose = find_loose_cards(stacks);
    const labels = loose.map(loose_card_label);
    assert(labels.includes("8H"), `expected 8H to be loose, got ${labels}`);

    const eight_h = loose.find(lc => loose_card_label(lc) === "8H")!;
    assert.equal(eight_h.end, "right");
    assert.equal(eight_h.target_stacks.length, 1);
}

// Steal the 5H from the left of a 4-card run.
// Board: [5H 6H 7H 8H] and [5S 5D 5C]
{
    const stacks = [
        board_stack("5H", "6H", "7H", "8H"),
        board_stack("5S", "5D", "5C"),
    ];
    const loose = find_loose_cards(stacks);
    const labels = loose.map(loose_card_label);
    assert(labels.includes("5H"), `expected 5H to be loose, got ${labels}`);

    const five_h = loose.find(lc => loose_card_label(lc) === "5H")!;
    assert.equal(five_h.end, "left");
}

// No loose cards on a 3-card stack (minimum size, can't shrink).
{
    const stacks = [
        board_stack("5H", "6H", "7H"),
        board_stack("7S", "7D", "7C"),
    ];
    const loose = find_loose_cards(stacks);
    assert.equal(loose.length, 0);
}

// No loose cards when end card has nowhere to go.
{
    const stacks = [
        board_stack("5H", "6H", "7H", "8H"),
        board_stack("AS", "AD", "AC"),
    ];
    // 8H can't join the set of Aces, and 5H can't either.
    const loose = find_loose_cards(stacks);
    assert.equal(loose.length, 0);
}

// Both ends are loose when both have targets.
// Board: [5H 6H 7H 8H] and [5S 5D 5C] and [8S 8D 8C]
{
    const stacks = [
        board_stack("5H", "6H", "7H", "8H"),
        board_stack("5S", "5D", "5C"),
        board_stack("8S", "8D", "8C"),
    ];
    const loose = find_loose_cards(stacks);
    const labels = loose.map(loose_card_label).sort();
    assert.deepEqual(labels, ["5H", "8H"]);
}

// Loose card from a set (4 of a kind → steal one to extend a run).
// Board: [7H 7S 7D 7C] and [5H 6H]... wait, that's incomplete.
// Better: [7H 7S 7D 7C] and [5S 6S] — also incomplete.
// Need: [7H 7S 7D 7C] and [5H 6H 8H] — 7H could extend... no.
// Use: [7H 7S 7D 7C] and [4H 5H 6H] — 7H from the set extends the run.
{
    const stacks = [
        board_stack("7H", "7S", "7D", "7C"),
        board_stack("4H", "5H", "6H"),
    ];
    const loose = find_loose_cards(stacks);
    const labels = loose.map(loose_card_label);
    assert(labels.includes("7H"), `expected 7H loose from set, got ${labels}`);
}

console.log("All hints tests passed.");
