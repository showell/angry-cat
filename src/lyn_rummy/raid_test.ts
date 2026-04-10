// Tests for raid mechanics: steal, rescue, raid.

import assert from "node:assert/strict";
import { Card, OriginDeck, Suit, value_str } from "./card";
import { CardStackType, get_stack_type } from "./stack_type";
import { compute_threesomes, Threesome } from "./threesomes";
import { make_board, clone_board, steal, rescue, raid, can_steal, Board, Stack } from "./raid";

// Helper for tests: every singleton card currently on the board.
// Use as the `allowed` set for rescue when you want it to consider
// every singleton (e.g., to test the perimeter logic in isolation).
function all_singletons(board: Board): Set<Card> {
    const result = new Set<Card>();
    for (const s of board.stacks) {
        if (s.length === 1) result.add(s[0]);
    }
    return result;
}

// Verify the board satisfies the invariant: every stack is either
// a valid 3+ stack (pure run / set / rb run) or an incomplete stack
// of 1 or 2 cards. Never a bogus 3+ stack.
function assert_no_bogus_stacks(board: Board, where: string): void {
    for (const stack of board.stacks) {
        if (stack.length < 3) continue; // 1 or 2 cards is fine
        const t = get_stack_type(stack);
        const valid = t === CardStackType.PURE_RUN
            || t === CardStackType.SET
            || t === CardStackType.RED_BLACK_RUN;
        if (!valid) {
            throw new Error(
                where + ": found bogus 3+ stack: [" +
                stack.map(cs).join(" ") + "] (type=" + CardStackType[t] + ")",
            );
        }
    }
}

const D1 = OriginDeck.DECK_ONE;
const D2 = OriginDeck.DECK_TWO;

const sl: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
function cs(c: Card): string { return value_str(c.value) + sl[c.suit]; }
function fmt(stack: Stack): string {
    return "[" + stack.map(cs).join(" ") + "]";
}
function fmt_board(board: Board): string {
    return board.stacks.map(fmt).join(" ");
}

function c(label: string): Card {
    return Card.from(label, D1);
}

// Helper: find a specific threesome by its card labels.
function find_threesome(
    threesomes: Map<Card, Threesome[]>,
    labels: string[],
): Threesome {
    const target_set = new Set(labels);
    for (const list of threesomes.values()) {
        for (const t of list) {
            const t_labels = t.cards.map(cs);
            if (t_labels.length === labels.length &&
                t_labels.every((l) => target_set.has(l))) {
                return t;
            }
        }
    }
    throw new Error(`No threesome found for ${labels.join(",")}`);
}

// =====================================================================
// STEAL tests
// =====================================================================

console.log("=== STEAL tests ===\n");

// --- Test 1: steal cards from singletons ---
{
    const cards = ["AC", "AD", "AH"].map(c);
    const board = make_board(cards.map((card) => [card]));
    const threesomes = compute_threesomes(cards);
    const ace_set = find_threesome(threesomes, ["AC", "AD", "AH"]);

    const result = steal(board, ace_set);
    assert(result, "steal should succeed");
    assert_no_bogus_stacks(board, "test 1");
    assert.equal(board.stacks.length, 1, "Should have just one stack after steal");
    assert.deepEqual(result!.family, ace_set.cards, "Family should match the threesome");
    console.log("  Test 1: steal from singletons → " + fmt_board(board) + " ✓");
}

// --- Test 2: steal cards from larger stacks (mid-stack extraction) ---
//
// Board: [10D JD QD KD] [AC AH] [AD]
// Steal the [AC AD AH] threesome.
// After: [10D JD QD KD] [AC AD AH]
//   (AC was pulled from the pair, AH was pulled from the pair too,
//    AD was pulled from its singleton, all three become a new family)
{
    const cards = ["TD", "JD", "QD", "KD", "AC", "AH", "AD"].map(c);
    const board = make_board([
        [cards[0], cards[1], cards[2], cards[3]], // diamond run
        [cards[4], cards[5]],                      // AC AH pair
        [cards[6]],                                 // AD singleton
    ]);
    const threesomes = compute_threesomes(cards);
    const ace_set = find_threesome(threesomes, ["AC", "AD", "AH"]);

    steal(board, ace_set);
    assert_no_bogus_stacks(board, "test 2");

    // Diamond run should still exist intact.
    const diamond_stack = board.stacks.find((s) => s.length === 4);
    assert(diamond_stack, "Diamond run should survive");
    assert.equal(diamond_stack!.length, 4);

    // Ace set should be a 3-card family.
    const ace_stack = board.stacks.find((s) => s.length === 3);
    assert(ace_stack, "Ace set should be a new 3-card stack");
    assert.equal(ace_stack!.length, 3);

    console.log("  Test 2: steal from mixed stacks → " + fmt_board(board) + " ✓");
}

// --- Test 2b: middle extraction splits a run into two pieces ---
//
// Board: [TD JD QD KD AD] — 5-card pure run.
// Steal [JD QD KD] (a valid 3-card pure run).
// Pulls: JD (middle, idx 1) → split into [TD] | [QD KD AD]
//        QD (now at idx 0 of [QD KD AD], end) → shrinks to [KD AD]
//        KD (now at idx 0 of [KD AD], end) → shrinks to [AD]
// Final: [TD] [AD] [JD QD KD]
{
    const cards = ["TD", "JD", "QD", "KD", "AD"].map(c);
    const board = make_board([cards.slice(0, 5)]);
    const threesomes = compute_threesomes(cards);
    const middle_threesome = find_threesome(threesomes, ["JD", "QD", "KD"]);

    steal(board, middle_threesome);
    assert_no_bogus_stacks(board, "test 2b");

    const family = board.stacks.find((s) => s.length === 3)!;
    assert.equal(family.length, 3, "Family is the new 3-card stack");

    const td = board.stacks.find((s) => s.length === 1 && cs(s[0]) === "TD");
    const ad = board.stacks.find((s) => s.length === 1 && cs(s[0]) === "AD");
    assert(td, "TD should be a singleton after the split");
    assert(ad, "AD should be a singleton after the split");
    assert.equal(board.stacks.length, 3, "Should have 3 stacks total");

    console.log("  Test 2b: middle extraction splits stack → " + fmt_board(board) + " ✓");
}

// --- Test 2c: a single mid-extraction leaves two valid pieces ---
//
// Board: [TD JD QD KD AD 2D] — a 6-card pure run with K→A wrap.
// Steal a threesome [QD KD AD] from the middle. After:
//   pull QD (idx 2, middle) → split into [TD JD] | [KD AD 2D]
//   pull KD (now idx 0 of [KD AD 2D], end) → shrinks to [AD 2D]
//   pull AD (now idx 0 of [AD 2D], end) → shrinks to [2D]
// Final: [TD JD] [2D] [QD KD AD]
{
    const cards = ["TD", "JD", "QD", "KD", "AD", "2D"].map(c);
    const board = make_board([cards.slice(0, 6)]);
    const threesomes = compute_threesomes(cards);
    const t = find_threesome(threesomes, ["QD", "KD", "AD"]);

    steal(board, t);
    assert_no_bogus_stacks(board, "test 2c");

    const family = board.stacks.find((s) => s.length === 3)!;
    assert.equal(family.length, 3);
    const pair = board.stacks.find((s) => s.length === 2);
    assert(pair, "Should have a [TD JD] pair");
    assert.equal(cs(pair![0]), "TD");
    assert.equal(cs(pair![1]), "JD");
    const single = board.stacks.find((s) => s.length === 1);
    assert(single, "Should have a [2D] singleton");
    assert.equal(cs(single![0]), "2D");

    console.log("  Test 2c: 6-card run, mid-steal leaves pair + singleton → " + fmt_board(board) + " ✓");
}

// --- Test 2d: end extraction on a long run shrinks it cleanly ---
//
// Board: [TD JD QD KD AD]. Steal [QD KD AD] (the last three).
// Pulls: QD (idx 2, middle) → split [TD JD] | [KD AD]
//        KD (idx 0 of [KD AD], end) → shrink to [AD]
//        AD (idx 0 of [AD], end) → shrink to []
// Wait — that's the same as 2c almost. Let me do a true end-only test:
//
// Board: [TD JD QD KD AD]. Steal [KD AD 2D]? No, 2D not on board.
// Steal threesome where ALL cards are at the END: [9D TD JD]?
// 9D not on board. There's no all-end threesome here.
//
// Use: [TD JD QD] threesome — these are positions 0, 1, 2.
//   pull TD (idx 0, end) → shrink to [JD QD KD AD]
//   pull JD (idx 0, end) → shrink to [QD KD AD]
//   pull QD (idx 0, end) → shrink to [KD AD]
// Final: [KD AD] [TD JD QD]
{
    const cards = ["TD", "JD", "QD", "KD", "AD"].map(c);
    const board = make_board([cards.slice(0, 5)]);
    const threesomes = compute_threesomes(cards);
    const t = find_threesome(threesomes, ["TD", "JD", "QD"]);

    steal(board, t);
    assert_no_bogus_stacks(board, "test 2d");

    assert.equal(board.stacks.length, 2);
    const family = board.stacks.find((s) => s.length === 3)!;
    assert.equal(cs(family[0]), "TD");
    assert.equal(cs(family[1]), "JD");
    assert.equal(cs(family[2]), "QD");
    const remaining = board.stacks.find((s) => s.length === 2)!;
    assert.equal(cs(remaining[0]), "KD");
    assert.equal(cs(remaining[1]), "AD");

    console.log("  Test 2d: end-only steal shrinks cleanly → " + fmt_board(board) + " ✓");
}

// --- Test 2e: steal from a set just shrinks the set ---
//
// Board: [7H 7S 7D 7C] (4-set). Steal [7S 7D 7C] (a valid 3-set).
// After: [7H] [7S 7D 7C].
{
    const cards = ["7H", "7S", "7D", "7C"].map(c);
    const board = make_board([cards.slice(0, 4)]);
    const threesomes = compute_threesomes(cards);
    const t = find_threesome(threesomes, ["7S", "7D", "7C"]);

    steal(board, t);
    assert_no_bogus_stacks(board, "test 2e");

    assert.equal(board.stacks.length, 2);
    const single = board.stacks.find((s) => s.length === 1)!;
    assert.equal(cs(single[0]), "7H");

    console.log("  Test 2e: steal from set leaves singleton → " + fmt_board(board) + " ✓");
}

// --- Test 3: steal that breaks a stack ---
//
// Board: [AC AD AH 2H] (a "stack" that doesn't form a valid arrangement
// but contains all 3 aces). Steal [AC AD AH].
// After: [2H] [AC AD AH]
{
    const cards = ["AC", "AD", "AH", "2H"].map(c);
    const board = make_board([cards.slice(0, 4)]);
    const threesomes = compute_threesomes(cards);
    const ace_set = find_threesome(threesomes, ["AC", "AD", "AH"]);

    steal(board, ace_set);
    assert_no_bogus_stacks(board, "test 3");

    assert.equal(board.stacks.length, 2);
    const remaining = board.stacks.find((s) => s.length === 1);
    assert(remaining);
    assert.equal(cs(remaining![0]), "2H");

    console.log("  Test 3: steal that breaks a stack → " + fmt_board(board) + " ✓");
}

// =====================================================================
// RESCUE tests
// =====================================================================

console.log("\n=== RESCUE tests ===\n");

// --- Test 4: rescue a 3-set into a 4-set with a loose card ---
{
    const cards = ["7H", "7S", "7D", "7C"].map(c);
    const board = make_board([
        [cards[0], cards[1], cards[2]], // [7H 7S 7D] valid set
        [cards[3]],                      // 7C loose
    ]);
    const family = board.stacks[0];

    const added = rescue(board, family, new Set([cards[3]]));
    assert_no_bogus_stacks(board, "test 4");

    assert.equal(added, 1);
    assert.equal(family.length, 4);
    assert.equal(board.stacks.length, 1);
    console.log("  Test 4: rescue 3-set to 4-set → " + fmt_board(board) + " ✓");
}

// --- Test 5: rescue does NOT take cards from valid 3+ stacks ---
{
    const cards = ["7H", "7S", "7D", "7C", "8C", "9C"].map(c);
    const board = make_board([
        [cards[0], cards[1], cards[2]], // [7H 7S 7D] valid set
        [cards[3], cards[4], cards[5]], // [7C 8C 9C] valid pure run
    ]);
    const set_family = board.stacks[0];

    const added = rescue(board, set_family, all_singletons(board));
    assert_no_bogus_stacks(board, "test 5");

    // 7C is in a valid 3-stack — sacred. Should not be taken.
    assert.equal(added, 0);
    assert.equal(set_family.length, 3);
    assert.equal(board.stacks.length, 2);
    console.log("  Test 5: rescue leaves valid stacks alone → " + fmt_board(board) + " ✓");
}

// --- Test 5b: rescue does NOT take cards from pairs ---
//
// 7C sits in a pair [7C 8C], not a singleton. Even though 7C
// would extend the [7H 7S 7D] set into a 4-set, rescue should
// leave the pair alone.
{
    const cards = ["7H", "7S", "7D", "7C", "8C"].map(c);
    const board = make_board([
        [cards[0], cards[1], cards[2]], // [7H 7S 7D] valid set
        [cards[3], cards[4]],           // [7C 8C] pair (not a singleton)
    ]);
    const set_family = board.stacks[0];

    const added = rescue(board, set_family, all_singletons(board));
    assert_no_bogus_stacks(board, "test 5b");

    assert.equal(added, 0, "rescue should not break up pairs");
    assert.equal(set_family.length, 3);
    assert.equal(board.stacks.length, 2);
    console.log("  Test 5b: rescue leaves pairs alone → " + fmt_board(board) + " ✓");
}

// --- Test 6: rescue extends a pure run on both ends ---
{
    const cards = ["TD", "JD", "QD", "KD", "9D"].map(c);
    const board = make_board([
        [cards[0], cards[1], cards[2]], // [10D JD QD] valid pure run
        [cards[3]],                      // KD loose (extends right)
        [cards[4]],                      // 9D loose (extends left)
    ]);
    const family = board.stacks[0];

    const added = rescue(board, family, all_singletons(board));
    assert_no_bogus_stacks(board, "test 6");

    assert.equal(added, 2);
    assert.equal(family.length, 5);
    assert.equal(cs(family[0]), "9D");
    assert.equal(cs(family[4]), "KD");
    console.log("  Test 6: rescue extends pure run on both ends → " + fmt(family) + " ✓");
}

// --- Test 7: rescue extends a pure run with K→A wrap ---
{
    const cards = ["TD", "JD", "QD", "KD", "AD", "2D"].map(c);
    const board = make_board([
        [cards[0], cards[1], cards[2], cards[3]], // [10D JD QD KD]
        [cards[4]],                                // AD loose
        [cards[5]],                                // 2D loose
    ]);
    const family = board.stacks[0];

    const added = rescue(board, family, all_singletons(board));
    assert_no_bogus_stacks(board, "test 7");

    // Should extend forward through KD→AD→2D wrap.
    assert.equal(added, 2);
    assert.equal(family.length, 6);
    assert.equal(cs(family[5]), "2D");
    console.log("  Test 7: rescue handles K→A wrap → " + fmt(family) + " ✓");
}

// --- Test 8: rescue an rb run on both ends ---
{
    const cards = ["3H", "4C", "5H", "2C", "6S"].map(c);
    const board = make_board([
        [cards[0], cards[1], cards[2]], // [3H 4C 5H] valid rb
        [cards[3]],                      // 2C loose (extends left)
        [cards[4]],                      // 6S loose (extends right)
    ]);
    const family = board.stacks[0];

    const added = rescue(board, family, all_singletons(board));
    assert_no_bogus_stacks(board, "test 8");

    assert.equal(added, 2);
    assert.equal(family.length, 5);
    assert.equal(cs(family[0]), "2C");
    assert.equal(cs(family[4]), "6S");
    console.log("  Test 8: rescue extends rb run on both ends → " + fmt(family) + " ✓");
}

// =====================================================================
// TWIN RULE tests
// =====================================================================
//
// A steal is forbidden if any source stack contains a twin of any
// threesome member. Prevents two duplicate cards (e.g. KD:1 and
// KD:2) from oscillating in and out of the same family slot.

console.log("\n=== TWIN RULE tests ===\n");

// --- Test T1: cannot steal from a stack containing the raider's twin ---
//
// Board: [KD:1 AD:1 2D:1 3D:1] (4-card pure run)
//        [KD:2] (singleton — KD:2 is KD:1's twin)
// Threesome: [KD:2 AD:1 2D:1] (a wrap pure run for KD:2)
// To form this, KD:2 would need to steal AD and 2D from a stack
// that contains KD:1, its own twin. Forbidden.
{
    const kd1 = Card.from("KD", D1);
    const ad1 = Card.from("AD", D1);
    const d2 = Card.from("2D", D1);
    const d3 = Card.from("3D", D1);
    const kd2 = Card.from("KD", D2);

    const board = make_board([
        [kd1, ad1, d2, d3],  // [KD:1 AD:1 2D:1 3D:1]
        [kd2],               // [KD:2] singleton
    ]);

    // Manually instantiate the pattern [KD:2 AD:1 2D:1]:
    // the KD slot is filled by KD:2 (the chosen card), the others
    // are filled by their only available physical instances.
    const wrap_for_kd2: import("./threesomes").Threesome = {
        cards: [kd2, ad1, d2],
        type: CardStackType.PURE_RUN,
    };

    // can_steal should refuse: AD's source stack [KD:1 AD 2D 3D]
    // contains KD:1, which is a twin of KD:2 (a threesome member).
    assert.equal(can_steal(board, wrap_for_kd2), false,
        "can_steal should refuse — KD:1 (twin of KD:2) is in the source stack");

    // steal should also refuse and return undefined.
    const result = steal(board, wrap_for_kd2);
    assert.equal(result, undefined, "steal should refuse and return undefined");

    // Board should be unchanged.
    assert.equal(board.stacks.length, 2);
    assert.equal(board.stacks[0].length, 4);
    assert.equal(board.stacks[1].length, 1);

    console.log("  Test T1: steal refuses when source contains a twin → " + fmt_board(board) + " ✓");
}

// --- Test T2: stealing from a stack that does NOT contain a twin works ---
//
// Same setup but the play is the canonical pattern [KD:1 AD:1 2D:1]
// (the threesome instance using KD:1, not KD:2). KD:1 is in the
// source stack, but as a member of the threesome itself — and KD:2
// is in a different stack, not in any source.
{
    const kd1 = Card.from("KD", D1);
    const ad1 = Card.from("AD", D1);
    const d2 = Card.from("2D", D1);
    const d3 = Card.from("3D", D1);
    const kd2 = Card.from("KD", D2);

    const board = make_board([
        [kd1, ad1, d2, d3],
        [kd2],
    ]);

    const wrap_for_kd1: import("./threesomes").Threesome = {
        cards: [kd1, ad1, d2],
        type: CardStackType.PURE_RUN,
    };

    assert.equal(can_steal(board, wrap_for_kd1), true);
    const result = steal(board, wrap_for_kd1);
    assert(result, "steal should succeed");
    console.log("  Test T2: steal allowed when no twin in source → " + fmt_board(board) + " ✓");
}

// =====================================================================
// RAID tests (steal + rescue)
// =====================================================================

console.log("\n=== RAID tests ===\n");

// --- Test 9: full raid scenario ---
//
// Board: [10D JD QD KD AD] [AC AH] [2H] [3H] [4H]
// Raid the [AC AD AH] ace set.
// After steal: [10D JD QD KD] [AC AD AH] [2H] [3H] [4H]
// After rescue: ace set has no extenders (no other aces, no 2-anything sacred).
// Then we'd separately raid for the 2H 3H 4H run.
// For this test, just check the ace set raid.
{
    const cards = ["TD", "JD", "QD", "KD", "AD", "AC", "AH", "2H", "3H", "4H"].map(c);
    const board = make_board([
        cards.slice(0, 5),    // [10D JD QD KD AD]
        [cards[5], cards[6]], // [AC AH]
        [cards[7]],           // 2H
        [cards[8]],           // 3H
        [cards[9]],           // 4H
    ]);
    const threesomes = compute_threesomes(cards);
    const ace_set = find_threesome(threesomes, ["AC", "AD", "AH"]);

    const family = raid(board, ace_set);
    assert_no_bogus_stacks(board, "test 9");

    assert.equal(family.length, 3, "Ace family should be exactly 3 (no extenders)");
    // Diamond run should now be 4 cards (lost AD).
    const diamond_stack = board.stacks.find((s) =>
        s.length === 4 && s.some((card) => cs(card) === "TD"),
    );
    assert(diamond_stack, "Diamond run should still exist as 4 cards");
    console.log("  Test 9: raid ace set → " + fmt_board(board) + " ✓");
}

// --- Test 10: raid does NOT absorb pre-existing singletons ---
//
// Board: [AC] [AD] [AH] [2H] [3H] [4H] — all six are singletons.
// Raid the [2H 3H 4H] threesome. After steal: [2H 3H 4H] formed.
// AH would naturally extend the run on the left (predecessor of 2H),
// but AH was a pre-existing singleton, not one we just perturbed.
// Rescue should leave AH alone. The family stays at 3 cards.
{
    const cards = ["AC", "AD", "AH", "2H", "3H", "4H"].map(c);
    const board = make_board(cards.map((card) => [card]));
    const threesomes = compute_threesomes(cards);
    const heart_run = find_threesome(threesomes, ["2H", "3H", "4H"]);

    const family = raid(board, heart_run);
    assert_no_bogus_stacks(board, "test 10");

    assert.equal(family!.length, 3, "Family should stay 3 cards (AH not perturbed)");
    // AH should still be a lonely singleton.
    const ah_stack = board.stacks.find((s) => s.length === 1 && cs(s[0]) === "AH");
    assert(ah_stack, "AH should still be a singleton");
    console.log("  Test 10: rescue leaves pre-existing singletons alone → " + fmt(family!) + " ✓");
}

// =====================================================================
// Clone test
// =====================================================================

console.log("\n=== Clone tests ===\n");

// --- Test 11: clone produces an independent board ---
{
    const cards = ["AC", "AD", "AH"].map(c);
    const board = make_board(cards.map((card) => [card]));
    const clone = clone_board(board);
    const threesomes = compute_threesomes(cards);
    const ace_set = find_threesome(threesomes, ["AC", "AD", "AH"]);

    raid(clone, ace_set);

    // Original should be unchanged.
    assert.equal(board.stacks.length, 3, "Original board should be unchanged");
    assert.equal(clone.stacks.length, 1, "Clone should have the new family");
    console.log("  Test 11: clone is independent ✓");
}

console.log("\nAll raid tests passed.");
