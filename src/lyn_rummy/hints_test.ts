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
import { find_playable_hand_cards } from "./hints";

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

console.log("All hints tests passed.");
