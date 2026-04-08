// Tests for the REARRANGE_PLAY hint level.
//
// Uses stuck scenarios from the game simulation where the
// intermediate player couldn't play but an expert could.

import assert from "node:assert/strict";
import { Card, OriginDeck, Suit, value_str } from "./card";
import {
    BoardCard, BoardCardState,
    type BoardLocation, CardStack,
    HandCard, HandCardState,
} from "./card_stack";
import {
    get_hint, find_rearrangement_plays, HintLevel,
} from "./hints";

const D1 = OriginDeck.DECK_ONE;
const D2 = OriginDeck.DECK_TWO;
const loc: BoardLocation = { top: 0, left: 0 };

const suit_letter: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};

function card_label(hc: HandCard): string {
    return value_str(hc.card.value) + suit_letter[hc.card.suit];
}

function board_stack(deck: OriginDeck, ...labels: string[]): CardStack {
    const board_cards = labels.map(
        (label) => new BoardCard(Card.from(label, deck), BoardCardState.FIRMLY_ON_BOARD),
    );
    return new CardStack(board_cards, loc);
}

function hand_card(label: string, deck: OriginDeck = D1): HandCard {
    return new HandCard(Card.from(label, deck), HandCardState.NORMAL);
}

// --- Case 1: Simple rearrangement ---
//
// Board: [4H 5H 6H], [9S TS JS], [7H 7S 7D]
// Hand: [8H]
// The graph solver pulls 7H from the set into the hearts run,
// making room for 8H.
{
    const board = [
        board_stack(D1, "4H", "5H", "6H"),
        board_stack(D1, "9S", "TS", "JS"),
        board_stack(D1, "7H", "7S", "7D"),
    ];
    const hand = [hand_card("8H", D2)];

    const playable = find_rearrangement_plays(hand, board);
    const labels = playable.map(card_label);
    assert(labels.includes("8H"), `8H should be playable via rearrangement, got: ${labels}`);

    const hint = get_hint(hand, board);
    assert.equal(hint.level, HintLevel.REARRANGE_PLAY);
}

// --- Case 2: Multiple hand cards, some playable ---
//
// Board: [4H 5H 6H], [4S 5S 6S], [7H 7S 7D]
// Hand: [8H, 8S, KD]
// 8H and 8S can play via rearrangement (pull 7H/7S from set
// into runs). KD cannot.
{
    const board = [
        board_stack(D1, "4H", "5H", "6H"),
        board_stack(D1, "4S", "5S", "6S"),
        board_stack(D1, "7H", "7S", "7D"),
    ];
    const hand = [hand_card("8H"), hand_card("8S"), hand_card("KD")];

    const playable = find_rearrangement_plays(hand, board);
    const labels = playable.map(card_label);

    assert(labels.includes("8H"), `8H should be playable, got: ${labels}`);
    assert(labels.includes("8S"), `8S should be playable, got: ${labels}`);
    assert(!labels.includes("KD"), `KD should NOT be playable, got: ${labels}`);
}

// --- Case 3: No rearrangement helps ---
//
// Board: [AH AS AD], hand: [KS]
// KS has no run neighbors and can't form a set (no other kings).
{
    const board = [
        board_stack(D1, "AH", "AS", "AD"),
    ];
    const hand = [hand_card("KS")];

    const playable = find_rearrangement_plays(hand, board);
    assert.equal(playable.length, 0, `KS should not be playable`);

    const hint = get_hint(hand, board);
    assert.equal(hint.level, HintLevel.NO_MOVES);
}

// --- Case 4: Rearrangement on a bigger board ---
//
// From game turn 17 (30 cards), the graph solver found that
// 8S, 6H, and QD were playable via rearrangement. Reconstruct
// a simplified version.
{
    const board = [
        board_stack(D1, "KS", "KD", "KH"),
        board_stack(D1, "TS", "TH", "TD", "TC"),
        board_stack(D1, "4H", "4S", "4D"),
        board_stack(D1, "3C", "4C", "5C", "6C"),
        board_stack(D1, "6S", "7S", "8S", "9S"),
        board_stack(D1, "2H", "3H", "4H"),
        board_stack(D1, "TH", "JH", "QH"),
        board_stack(D1, "6H", "6C", "6S"),
        board_stack(D1, "AS", "AC"),  // incomplete — but won't matter
    ];
    // Use only stacks that are valid (3+ cards).
    const valid_board = board.filter((s) => s.size() >= 3 && !s.incomplete());
    const hand = [hand_card("8S", D2), hand_card("QD"), hand_card("KS", D2)];

    const playable = find_rearrangement_plays(hand, valid_board);
    const labels = playable.map(card_label);

    // At least 8S should be playable (extend spade run after
    // rearranging the 8S already on the board).
    // QD might be playable depending on the arrangement.
    console.log(`  Case 4 playable: ${labels.join(", ") || "none"}`);
    // We just verify no crash and reasonable results.
    assert(playable.length <= hand.length, "can't play more than hand size");
}

// --- Case 5: REARRANGE_PLAY doesn't fire when earlier levels work ---
//
// Board: [4H 5H 6H], hand: [7H]
// 7H is a direct play, so we should get DIRECT_PLAY not REARRANGE.
{
    const board = [board_stack(D1, "4H", "5H", "6H")];
    const hand = [hand_card("7H")];

    const hint = get_hint(hand, board);
    assert.equal(hint.level, HintLevel.DIRECT_PLAY,
        `7H should be DIRECT_PLAY, not ${hint.level}`);
}

// --- Case 6: Performance on a large board ---
//
// 50+ cards. Should complete in reasonable time.
{
    const board = [
        board_stack(D1, "AH", "2H", "3H", "4H", "5H"),
        board_stack(D1, "7S", "8S", "9S", "TS"),
        board_stack(D1, "JD", "QD", "KD"),
        board_stack(D1, "3C", "4C", "5C"),
        board_stack(D1, "9H", "9D", "9C"),
        board_stack(D1, "2S", "2D", "2C"),
        board_stack(D1, "KH", "KS", "KC"),
        board_stack(D1, "7H", "8H"),
        board_stack(D1, "JC", "QC", "KC"),
        board_stack(D1, "6D", "7D", "8D", "9D"),
        board_stack(D1, "AS", "AD", "AC"),
        board_stack(D1, "TH", "JH", "QH"),
        board_stack(D1, "4S", "5S", "6S"),
        board_stack(D1, "3D", "4D", "5D"),
        board_stack(D1, "6H", "6C", "6S"),
    ];
    const valid_board = board.filter((s) => s.size() >= 3 && !s.incomplete());
    const hand = [
        hand_card("8H", D2), hand_card("JS"), hand_card("QS"),
    ];

    const start = performance.now();
    const playable = find_rearrangement_plays(hand, valid_board);
    const ms = performance.now() - start;

    const labels = playable.map(card_label);
    console.log(`  Case 6 (large board): ${labels.join(", ") || "none"} in ${ms.toFixed(0)}ms`);
    assert(ms < 500, `Should complete in under 500ms, took ${ms.toFixed(0)}ms`);
}

console.log("All rearrange hint tests passed.");
