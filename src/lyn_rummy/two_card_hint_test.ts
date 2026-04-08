// Tests for the two-card-from-hand scenario.
//
// In every case:
// - No single hand card can play (no direct play, no rearrangement).
// - Two hand cards together CAN play, by peeling a card from a
//   board stack and forming a new 3-card group with the pair.

import assert from "node:assert/strict";
import { Card, OriginDeck, Suit, value_str } from "./card";
import {
    BoardCard, BoardCardState,
    type BoardLocation, CardStack,
    HandCard, HandCardState,
} from "./card_stack";
import {
    find_rearrangement_plays, find_playable_hand_cards,
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

function assert_no_single_plays(hand: HandCard[], board: CardStack[]): void {
    const direct = find_playable_hand_cards(hand, board);
    assert.equal(direct.length, 0,
        `Expected no direct plays, found: ${direct.map(card_label)}`);

    const rearrange = find_rearrangement_plays(hand, board);
    assert.equal(rearrange.length, 0,
        `Expected no rearrangement plays, found: ${rearrange.map(card_label)}`);
}

// --- Case 1: Peel from 4-card set, form a run ---
//
// Board: [7H 7S 7D 7C]
// Hand: [8H, 9H]
// Neither plays alone (no hearts run on board, set is full). ✓
// Peel 7H → [7S 7D 7C]. Play [7H 8H 9H] as new run. ✓
{
    const board = [board_stack(D1, "7H", "7S", "7D", "7C")];
    const hand = [hand_card("8H"), hand_card("9H")];
    assert_no_single_plays(hand, board);
    console.log("  Case 1: peel 7H from 4-set, play [7H 8H 9H] run");
}

// --- Case 2: Peel from left of long run, form a shorter run ---
//
// Board: [4H 5H 6H 7H 8H]
// Hand: [2H, 3H]
// 2H can't play (run starts at 4H, 2H needs 3H between). ✓
// 3H can't play (3H is predecessor of 4H — direct play!) ✗
// FIX: make the gap bigger.
//
// Board: [6H 7H 8H 9H TH]
// Hand: [3H, 4H]
// 3H can't play (gap: 5H missing). ✓
// 4H can't play (gap: 5H missing). ✓
// Peel 6H → [7H 8H 9H TH]. But [3H 4H 6H] not consecutive. ✗
//
// Need the peeled card to bridge the pair.
// Board: [5H 6H 7H 8H 9H]
// Hand: [3H, 4H]
// 3H can't play (5H starts the run, 3H needs 4H). ✓
// 4H can't play (4H is predecessor of 5H — direct play!) ✗
//
// Board: [5H 6H 7H 8H]
// Hand: [3H, 4H]
// 3H: needs 4H. Not adjacent to 5H. ✓
// 4H: predecessor of 5H — DIRECT PLAY! ✗
//
// The problem: if the hand pair is [XH, (X+1)H] and the board
// has [(X+2)H ...], then (X+1)H is always a direct play.
//
// Solution: the pair needs the peeled card IN THE MIDDLE.
// Hand: [3H, 5H]. Board has 4H peelable.
// Board: [4H 5S 6H 7S] — red/black, 4H is on the end.
// 3H can't play. 5H can't play (5H is hearts, run alternates). ✓
// Peel 4H → [5S 6H 7S]. Play [3H 4H 5H] as hearts run. ✓
// But wait — [5S 6H 7S] — is that a valid 3-card red/black run? Let me check:
// 5S(black) 6H(red) 7S(black), consecutive, alternating. ✓
{
    const board = [board_stack(D1, "4H", "5S", "6H", "7S")];
    const hand = [hand_card("3H"), hand_card("5H", D2)];
    assert_no_single_plays(hand, board);
    console.log("  Case 2: peel 4H from rb run, play [3H 4H 5H] pure run");
}

// --- Case 3: Peel from 4-card set, form a set ---
//
// Board: [7H 8H 9H TH]
// Hand: [7S, 7D]
// 7S can't play (no 7-set on board, no spade run near 7). ✓
// 7D can't play. ✓
// Peel 7H → [8H 9H TH]. Play [7H 7S 7D] as set. ✓
{
    const board = [board_stack(D1, "7H", "8H", "9H", "TH")];
    const hand = [hand_card("7S"), hand_card("7D")];
    assert_no_single_plays(hand, board);
    console.log("  Case 3: peel 7H from run, play [7H 7S 7D] set");
}

// --- Case 4: Peel from right of a long run ---
//
// Board: [3H 4H 5H 6H 7H]
// Hand: [8S, 8D]
// 8S can't play (no spade run ending at 7S). ✓
// 8D can't play. ✓
// But can we peel 7H and make [7H 8S 8D]? No — different values.
// Need: [7H 8S ...] is rb run? 7H(red) 8S(black) ✓ but need 3 cards.
// We have 8S and 8D. [8S 8D] isn't a pair for extending 7H.
//
// Rethink: Hand: [8S, 8D]. We need a peelable 8-something.
// Board: [6H 7H 8H 9H]. Peel 8H → [6H 7H ... ] invalid (only 2)! ✗
// Board: [6H 7H 8H 9H TH]. Peel 8H from middle? Can't peel from middle.
//
// Peel from end: Board: [8C 8H 8S 8D]. Hand: [7H, 9H].
// Wait — 8S and 8D are in hand, not board. Let me redo.
//
// Board: [8H 8S 8D 8C]. Hand: [7H, 9H].
// 7H can't play (no hearts run). ✓
// 9H can't play. ✓
// Peel 8H → [8S 8D 8C]. Play [7H 8H 9H] as run. ✓
{
    const board = [board_stack(D1, "8H", "8S", "8D", "8C")];
    const hand = [hand_card("7H"), hand_card("9H")];
    assert_no_single_plays(hand, board);
    console.log("  Case 4: peel 8H from 4-set, play [7H 8H 9H] run");
}

// --- Case 5: Two stacks, peel enables set ---
//
// Board: [5H 6H 7H 8H], [5S 6S 7S 8S]
// Hand: [7D, 7C]
// 7D can't play (no 7-set on board). ✓
// 7C can't play. ✓
// Peel 7H → [5H 6H ... ] only 2 cards if we peel from middle. Can't.
// Peel 7H from... it's in the middle of the run. Can't peel.
//
// Board: [7H 8H 9H TH], [7S 8S 9S TS]
// Hand: [7D, 7C]
// 7D: no 7-set on board. ✓
// 7C: same. ✓
// Peel 7H → [8H 9H TH]. Peel 7S → [8S 9S TS]. Play [7H 7S 7D 7C] set! ✓
// (Two peels needed. More complex but valid.)
// Actually: even one peel + the pair forms a 3-set.
// Peel 7H → [8H 9H TH]. Play [7H 7D 7C] as 3-set. ✓
{
    const board = [
        board_stack(D1, "7H", "8H", "9H", "TH"),
        board_stack(D1, "7S", "8S", "9S", "TS"),
    ];
    const hand = [hand_card("7D"), hand_card("7C")];
    assert_no_single_plays(hand, board);
    console.log("  Case 5: peel 7H from run, play [7H 7D 7C] set");
}

console.log("\nAll two-card hint scenarios verified (no single plays).");
