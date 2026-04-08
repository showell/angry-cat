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
import { find_playable_hand_cards, find_hand_stacks, type HandStack } from "./hints";
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

console.log("All hints tests passed.");
