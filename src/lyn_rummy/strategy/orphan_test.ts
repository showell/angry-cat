// Tests for orphan detection — both slow (per-stack) and fast
// (holistic index) approaches must agree on every case.

import assert from "node:assert/strict";
import { Card, OriginDeck, Suit, value_str } from "../core/card";
import {
    BoardCard, BoardCardState,
    type BoardLocation, CardStack,
    HandCard, HandCardState,
} from "../core/card_stack";
import {
    find_orphan_stacks_slow,
    find_orphan_stacks,
} from "./orphan";

const D1 = OriginDeck.DECK_ONE;
const D2 = OriginDeck.DECK_TWO;
const loc: BoardLocation = { top: 0, left: 0 };

const suit_letter: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};

function card_label(c: Card): string {
    return value_str(c.value) + suit_letter[c.suit];
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

// Run both approaches, assert they agree, return result.
function check_orphans(board: CardStack[], hand: HandCard[]): number[] {
    const slow = find_orphan_stacks_slow(board, hand);
    const fast = find_orphan_stacks(board, hand);
    assert.deepEqual(fast, slow,
        `Fast and slow disagree: fast=${fast}, slow=${slow}`);
    return fast;
}

// --- Test cases ---

// Case 1: Isolated set, no neighbors anywhere.
{
    const board = [board_stack(D1, "KH", "KS", "KD")];
    const hand = [hand_card("3C")];
    assert.deepEqual(check_orphans(board, hand), [0]);
    console.log("  Case 1: [KH KS KD] is orphan with hand [3C] ✓");
}

// Case 2: Set is NOT orphan — hand has KC.
{
    const board = [board_stack(D1, "KH", "KS", "KD")];
    const hand = [hand_card("KC")];
    assert.deepEqual(check_orphans(board, hand), []);
    console.log("  Case 2: [KH KS KD] not orphan with hand [KC] ✓");
}

// Case 3: Set is NOT orphan — another stack has QH.
{
    const board = [
        board_stack(D1, "KH", "KS", "KD"),
        board_stack(D1, "QH", "JH", "TH"),
    ];
    assert.deepEqual(check_orphans(board, []), []);
    console.log("  Case 3: [KH KS KD] not orphan with [QH JH TH] on board ✓");
}

// Case 4: Run is orphan — no external neighbors.
{
    const board = [board_stack(D1, "7H", "8H", "9H")];
    const hand = [hand_card("2S")];
    assert.deepEqual(check_orphans(board, hand), [0]);
    console.log("  Case 4: [7H 8H 9H] is orphan with hand [2S] ✓");
}

// Case 5: Run is NOT orphan — hand has 6H.
{
    const board = [board_stack(D1, "7H", "8H", "9H")];
    const hand = [hand_card("6H")];
    assert.deepEqual(check_orphans(board, hand), []);
    console.log("  Case 5: [7H 8H 9H] not orphan with hand [6H] ✓");
}

// Case 6: Run is NOT orphan — red/black neighbor 6S.
{
    const board = [board_stack(D1, "7H", "8H", "9H")];
    const hand = [hand_card("6S")];
    assert.deepEqual(check_orphans(board, hand), []);
    console.log("  Case 6: [7H 8H 9H] not orphan — 6S is rb neighbor ✓");
}

// Case 7: Run is NOT orphan — set neighbor 7S.
{
    const board = [board_stack(D1, "7H", "8H", "9H")];
    const hand = [hand_card("7S")];
    assert.deepEqual(check_orphans(board, hand), []);
    console.log("  Case 7: [7H 8H 9H] not orphan — 7S is set neighbor ✓");
}

// Case 8: Two stacks, one orphan.
{
    const board = [
        board_stack(D1, "KH", "KS", "KD"),
        board_stack(D1, "4H", "5H", "6H"),
    ];
    const hand = [hand_card("7H")];
    assert.deepEqual(check_orphans(board, hand), [0]);
    console.log("  Case 8: kings orphan, hearts run not ✓");
}

// Case 9: K→A wrap means NOT orphan.
{
    const board = [
        board_stack(D1, "KH", "KS", "KD"),
        board_stack(D1, "AH", "2H", "3H"),
    ];
    assert.deepEqual(check_orphans(board, []), []);
    console.log("  Case 9: [KH KS KD] not orphan — AH wraps ✓");
}

// Case 10: Three isolated stacks, all orphans.
{
    const board = [
        board_stack(D1, "KH", "KS", "KD"),
        board_stack(D1, "3C", "3D", "3S"),
        board_stack(D1, "7H", "8H", "9H"),
    ];
    assert.deepEqual(check_orphans(board, []), [0, 1, 2]);
    console.log("  Case 10: all three isolated stacks are orphans ✓");
}

// Case 11: Large board, mix of orphans and non-orphans.
// Must be careful: rb neighbors cross suits!
// 9H(red) → TS(black) is a rb neighbor. So tens stack is NOT orphan
// if 9H is on the board.
{
    const board = [
        board_stack(D1, "KH", "KS", "KD"),          // orphan: no Q or A neighbors
        board_stack(D1, "4H", "5H", "6H"),           // not orphan: 7H in stack 2
        board_stack(D1, "7H", "8H", "9H"),           // not orphan: 6H in stack 1, also TS via rb
        board_stack(D1, "TS", "TD", "TC"),            // NOT orphan: 9H(red)→TS(black) rb
        board_stack(D1, "2C", "2D", "2S"),            // not orphan: 3C/3D/3S? No. AC? No. But...
    ];
    // 2C: neighbors are AC(pr), 3C(pr), 1D/1S(rb)=AD/AS, and other 2s(set).
    // None present. 2D: neighbors AD(pr), 3D(pr), etc. None present.
    // 2S: neighbors AS(pr), 3S(pr), etc. None present.
    // So twos ARE orphan.
    const orphans = check_orphans(board, []);
    assert(!orphans.includes(1), "hearts 4-6 not orphan");
    assert(!orphans.includes(2), "hearts 7-9 not orphan");
    assert(!orphans.includes(3), "tens not orphan — rb neighbor 9H");
    assert(orphans.includes(0), "kings orphan");
    assert(orphans.includes(4), "twos orphan");
    console.log("  Case 11: large board — 2 orphans, 3 not ✓");
}

// Case 12: Double deck — dup card still has non-dup neighbors.
{
    const board = [board_stack(D1, "7H", "8H", "9H")];
    const hand = [hand_card("7H", D2)];
    // 7H(D2) is a dup of 7H(D1), so 7H↔7H is not a valid neighbor.
    // But 7H(D2) IS a pure-run neighbor of 8H (same suit, consecutive).
    // So the stack is NOT an orphan.
    assert.deepEqual(check_orphans(board, hand), []);
    console.log("  Case 12: 7H(D2) neighbors 8H — stack NOT orphan ✓");
}

// Case 12b: Dup where the ONLY relationship is the dup.
{
    const board = [board_stack(D1, "7H", "7S", "7D")];
    const hand = [hand_card("7H", D2)];
    // 7H(D2) is dup of 7H(D1) — not a neighbor.
    // 7H(D2) vs 7S: same value, different suit — set neighbor!
    // So the stack is NOT an orphan.
    assert.deepEqual(check_orphans(board, hand), []);
    console.log("  Case 12b: 7H(D2) set-neighbors 7S — stack NOT orphan ✓");
}

// Case 12c: True dup isolation.
{
    const board = [board_stack(D1, "KH", "KS", "KD")];
    const hand = [hand_card("KH", D2)];
    // KH(D2) is dup of KH(D1) — not a neighbor.
    // KH(D2) vs KS: same value, different suit — set neighbor!
    // NOT orphan.
    assert.deepEqual(check_orphans(board, hand), []);
    console.log("  Case 12c: KH(D2) set-neighbors KS — NOT orphan ✓");
}

// --- Performance: large board ---
{
    const board: CardStack[] = [];
    // 20 stacks of 3-5 cards each, all isolated from each other.
    const suits = [Suit.HEART, Suit.SPADE, Suit.DIAMOND, Suit.CLUB];
    // Create sets at values 1,4,7,10 (widely spaced, no run neighbors).
    for (const v of [1, 4, 7, 10]) {
        const cards = suits.slice(0, 3).map((s) =>
            new BoardCard(new Card(v as any, s, D1), BoardCardState.FIRMLY_ON_BOARD),
        );
        board.push(new CardStack(cards, loc));
    }
    // And some runs in isolated ranges.
    board.push(board_stack(D1, "KH", "QH", "JH"));
    board.push(board_stack(D1, "KS", "QS", "JS"));

    const hand = [hand_card("2C"), hand_card("5D"), hand_card("8S")];

    const start_slow = performance.now();
    const slow = find_orphan_stacks_slow(board, hand);
    const ms_slow = performance.now() - start_slow;

    const start_fast = performance.now();
    const fast = find_orphan_stacks(board, hand);
    const ms_fast = performance.now() - start_fast;

    assert.deepEqual(fast, slow);

    // Check some orphans have external neighbors via hand cards.
    // 2C: neighbor of AC (value 1, club... wait, AC is in a set at value 1.
    // 1H 1S 1D is the set. 2C neighbors: 1C (not present), 3C (not present).
    // Actually value 1 = ACE. AC is not in the set (set has AH AS AD).
    // 2C: predecessor is AC. AC not on board. Successor is 3C. Not on board.
    // Set: other 2s? Not on board. 2C has no neighbors. So the stacks
    // it could interact with are... none.

    console.log(`  Case 13 (perf): slow=${ms_slow.toFixed(2)}ms, fast=${ms_fast.toFixed(2)}ms, orphans=${fast.length}/${board.length} ✓`);
}

console.log("\nAll orphan tests passed.");
