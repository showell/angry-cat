// Hard test cases captured from the simulation. These are scenarios
// where the hint engine got stuck but a human might find a move.

import assert from "node:assert/strict";
import { Card, OriginDeck, Suit, value_str } from "../core/card";
import {
    BoardCard,
    BoardCardState,
    type BoardLocation,
    CardStack,
    HandCard,
    HandCardState,
} from "../core/card_stack";
import { get_hint, HintLevel, find_playable_hand_cards } from "./hints";

const D1 = OriginDeck.DECK_ONE;
const D2 = OriginDeck.DECK_TWO;
const loc: BoardLocation = { top: 0, left: 0 };

const suit_letter: Record<Suit, string> = {
    [Suit.HEART]: "H",
    [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D",
    [Suit.CLUB]: "C",
};

function board_stack(deck: OriginDeck, ...labels: string[]): CardStack {
    const board_cards = labels.map(
        (label) =>
            new BoardCard(Card.from(label, deck), BoardCardState.FIRMLY_ON_BOARD),
    );
    return new CardStack(board_cards, loc);
}

function hand_card(label: string, deck: OriginDeck = D1): HandCard {
    return new HandCard(Card.from(label, deck), HandCardState.NORMAL);
}

function card_label(hc: HandCard): string {
    return value_str(hc.card.value) + suit_letter[hc.card.suit];
}

// --- Case 1: 3S should join the set [3H 3D 3C] ---
//
// From the final state of the simulation. The hint engine said
// "no moves" but 3S can directly extend the set of 3s since
// spade is not in the set.
{
    const board = [
        board_stack(D1, "3H", "3D", "3C"),
    ];
    const hand = [hand_card("3S")];

    const playable = find_playable_hand_cards(hand, board);
    const labels = playable.map(card_label);

    // 3S should be directly playable onto the set of 3s.
    assert(
        labels.includes("3S"),
        `3S should be playable on [3H 3D 3C], got: ${labels}`,
    );
}

// --- Case 2: Full end-of-game scenario ---
//
// Hand: 7D, 8C, 3H, 3S
// The 3S should at minimum be playable (extends the 3-set).
// The 3H might be playable if we can break up the existing 3H
// from the set (it's a duplicate from deck 2).
{
    const board = [
        board_stack(D1, "KC", "KS", "KD"),
        board_stack(D1, "TS", "TH", "TD"),
        board_stack(D1, "2D", "3S", "4H", "5S", "6H", "7C", "8D", "9S"),
        board_stack(D1, "4C", "4S", "4D", "4H"),
        board_stack(D1, "5S", "6S", "7S"),
        board_stack(D1, "TS", "JS", "QS"),
        board_stack(D1, "JH", "QH", "KH", "AH"),
        board_stack(D1, "6D", "6C", "6S", "6H"),
        board_stack(D1, "AS", "AC", "AH"),
        board_stack(D1, "5C", "5D", "5H"),
        board_stack(D1, "3H", "3D", "3C"),
        board_stack(D1, "7C", "8H", "9C", "TH", "JC", "QD"),
        board_stack(D1, "JC", "QH", "KC", "AD", "2S"),
        board_stack(D1, "8D", "9S", "TD", "JS", "QD", "KS", "AD", "2C", "3D", "4S", "5D"),
        board_stack(D1, "4C", "5H", "6C", "7H", "8C"),
        board_stack(D1, "7H", "8S", "9D", "TC", "JH", "QC"),
        board_stack(D1, "JD", "QC", "KH", "AC"),
        board_stack(D1, "7D", "8S", "9H", "TC", "JD", "QS", "KD", "AS", "2H", "3C"),
        board_stack(D1, "9C", "9D", "9H"),
        board_stack(D1, "2S", "2H", "2D", "2C"),
        board_stack(D1, "4D", "5C", "6D", "7S", "8H"),
    ];
    const hand = [
        hand_card("7D", D2),
        hand_card("8C", D2),
        hand_card("3H", D2),
        hand_card("3S", D2),
    ];

    const hint = get_hint(hand, board);

    // At minimum, 3S should be playable (extends [3H 3D 3C] to 4-set).
    // If the hint engine finds this, it's level 2 (DIRECT_PLAY).
    assert.notEqual(
        hint.level, HintLevel.NO_MOVES,
        `Expected at least one move with hand [7D, 8C, 3H, 3S] but got NO_MOVES`,
    );

    if (hint.level === HintLevel.DIRECT_PLAY) {
        const labels = hint.playable_cards.map(card_label);
        assert(labels.includes("3S"), `3S should be in playable cards, got: ${labels}`);
    }
}

// --- Case 3: Set dissolution ---
//
// The set [7H 7S 7D] can be dissolved by sending each card to the
// end of a matching run. This frees up board space and (in this case)
// allows 8H from the hand to play onto the extended hearts run.
//
// Board: [4H 5H 6H], [4S 5S 6S], [4D 5D 6D], [7H 7S 7D]
// Hand: [8H]
// After dissolution: [4H 5H 6H 7H], [4S 5S 6S 7S], [4D 5D 6D 7D]
// Then 8H plays on the hearts run.
{
    const board = [
        board_stack(D1, "4H", "5H", "6H"),
        board_stack(D1, "4S", "5S", "6S"),
        board_stack(D1, "4D", "5D", "6D"),
        board_stack(D1, "7H", "7S", "7D"),
    ];
    const hand = [hand_card("8H", D2)];

    const hint = get_hint(hand, board);

    assert.notEqual(
        hint.level, HintLevel.NO_MOVES,
        `Expected a move after dissolving [7H 7S 7D], got NO_MOVES`,
    );

    if (hint.level === HintLevel.DIRECT_PLAY) {
        // Shouldn't be direct — 8H has no direct target.
        assert.fail("8H should not be directly playable before dissolution");
    }

    if (hint.level === HintLevel.LOOSE_CARD_PLAY) {
        const labels = hint.plays[0].playable_cards.map(card_label);
        assert(labels.includes("8H"), `8H should be playable after dissolution, got: ${labels}`);
    }
}

// --- Case 4: Set dissolution with 4-card set ---
//
// Same idea but the set has 4 cards. All 4 must find homes.
// Board: [4H 5H 6H], [4S 5S 6S], [4D 5D 6D], [4C 5C 6C], [7H 7S 7D 7C]
// Hand: [8C]
{
    const board = [
        board_stack(D1, "4H", "5H", "6H"),
        board_stack(D1, "4S", "5S", "6S"),
        board_stack(D1, "4D", "5D", "6D"),
        board_stack(D1, "4C", "5C", "6C"),
        board_stack(D1, "7H", "7S", "7D", "7C"),
    ];
    const hand = [hand_card("8C", D2)];

    const hint = get_hint(hand, board);

    assert.notEqual(
        hint.level, HintLevel.NO_MOVES,
        `Expected a move after dissolving [7H 7S 7D 7C], got NO_MOVES`,
    );
}

// --- Case 5: Set dissolution where only one run accepts a 7 ---
//
// [7H 7S 7D] but only one run accepts a 7. The heuristic engine
// can't dissolve the set (7S and 7D have nowhere to go). This
// would require the graph solver (currently disabled in hints).
{
    const board = [
        board_stack(D1, "4H", "5H", "6H"),  // can extend to 7H 8H
        board_stack(D1, "9S", "TS", "JS"),   // doesn't want a 7
        board_stack(D1, "7H", "7S", "7D"),
    ];
    const hand = [hand_card("8H", D2)];

    const hint = get_hint(hand, board);

    assert.equal(
        hint.level, HintLevel.NO_MOVES,
        `Heuristic engine can't solve this without graph solver`,
    );
}

console.log("All hard hints tests passed.");
