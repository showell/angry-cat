// Exhaustive arrangement tests.
//
// For small sets of cards, enumerate ALL valid arrangements and
// verify we find every one. This is the correctness foundation.

import assert from "node:assert/strict";
import { Card, OriginDeck, Suit, value_str } from "../core/card";
import { CardStackType } from "../core/stack_type";
import {
    card_label,
    find_all_valid_groups,
    find_all_arrangements,
    grouped_count,
    fmt_arrangement,
} from "./arrangements";

const D1 = OriginDeck.DECK_ONE;
const D2 = OriginDeck.DECK_TWO;

function c(label: string, deck: OriginDeck = D1): Card {
    return Card.from(label, deck);
}

// --- Test cases, scaling up ---

// Case 1: Three cards, one pure run. Only one arrangement.
{
    const cards = [c("4H"), c("5H"), c("6H")];
    const all = find_all_arrangements(cards);
    const non_empty = all.filter((a) => a.length > 0);

    console.log(`Case 1: ${cards.map(card_label).join(" ")} (${cards.length} cards)`);
    console.log(`  Valid groups found: ${find_all_valid_groups(cards).length}`);
    console.log(`  Arrangements with groups: ${non_empty.length}`);
    for (const a of non_empty) console.log("  " + fmt_arrangement(a, cards));

    assert.equal(non_empty.length, 1);
    assert.equal(non_empty[0][0].type, CardStackType.PURE_RUN);
}

// Case 2: Three cards, one set. Only one arrangement.
{
    const cards = [c("7H"), c("7S"), c("7D")];
    const all = find_all_arrangements(cards);
    const non_empty = all.filter((a) => a.length > 0);

    console.log(`\nCase 2: ${cards.map(card_label).join(" ")} (${cards.length} cards)`);
    console.log(`  Arrangements with groups: ${non_empty.length}`);
    for (const a of non_empty) console.log("  " + fmt_arrangement(a, cards));

    assert.equal(non_empty.length, 1);
    assert.equal(non_empty[0][0].type, CardStackType.SET);
}

// Case 3: Four cards that form a set AND contain a pure run.
// [3H 3S 3D] is a set, but also [3H 4H 5H] could be a run
// if 4H and 5H existed. Here they don't, so just one arrangement.
{
    const cards = [c("3H"), c("3S"), c("3D"), c("3C")];
    const all = find_all_arrangements(cards);
    const non_empty = all.filter((a) => a.length > 0);

    console.log(`\nCase 3: ${cards.map(card_label).join(" ")} (${cards.length} cards)`);
    console.log(`  Valid groups: ${find_all_valid_groups(cards).length}`);
    console.log(`  Arrangements with groups: ${non_empty.length}`);
    for (const a of non_empty) console.log("  " + fmt_arrangement(a, cards));

    // 4-card set, plus four 3-card subsets (each missing one suit).
    assert.equal(find_all_valid_groups(cards).length, 5);
}

// Case 4: Six cards — a set that can also be three runs!
// AH AS AD 2H 2S 2D 3H 3S 3D
// Can arrange as:
//   - Three sets: [AH AS AD] [2H 2S 2D] [3H 3S 3D]
//   - Three pure runs: [AH 2H 3H] [AS 2S 3S] [AD 2D 3D]
//   - Various mixes
// THIS is the key non-trivial case.
{
    const cards = [
        c("AH"), c("AS"), c("AD"),
        c("2H"), c("2S"), c("2D"),
        c("3H"), c("3S"), c("3D"),
    ];
    const groups = find_all_valid_groups(cards);
    const all = find_all_arrangements(cards);

    // Only look at arrangements that group ALL 9 cards.
    const full = all.filter((a) => grouped_count(a) === 9);

    console.log(`\nCase 4: ${cards.map(card_label).join(" ")} (${cards.length} cards)`);
    console.log(`  Valid groups: ${groups.length}`);
    console.log(`  Total arrangements: ${all.length}`);
    console.log(`  Full arrangements (all 9 grouped): ${full.length}`);
    for (const a of full) console.log("  " + fmt_arrangement(a, cards));

    // Must find both the 3-sets and 3-runs arrangements.
    const has_all_sets = full.some((a) =>
        a.length === 3 && a.every((g) => g.type === CardStackType.SET));
    const has_all_runs = full.some((a) =>
        a.length === 3 && a.every((g) => g.type === CardStackType.PURE_RUN));

    assert(has_all_sets, "Should find the 3-sets arrangement");
    assert(has_all_runs, "Should find the 3-pure-runs arrangement");
}

// Case 5: Same as case 4 but with clubs too — 12 cards.
// Now there are 4-card sets possible AND 4 pure runs.
{
    const cards = [
        c("AH"), c("AS"), c("AD"), c("AC"),
        c("2H"), c("2S"), c("2D"), c("2C"),
        c("3H"), c("3S"), c("3D"), c("3C"),
    ];
    const groups = find_all_valid_groups(cards);
    const all = find_all_arrangements(cards);
    const full = all.filter((a) => grouped_count(a) === 12);

    console.log(`\nCase 5: 12 cards (A/2/3 x all suits)`);
    console.log(`  Valid groups: ${groups.length}`);
    console.log(`  Total arrangements: ${all.length}`);
    console.log(`  Full arrangements (all 12 grouped): ${full.length}`);
    for (const a of full) console.log("  " + fmt_arrangement(a, cards));

    const has_4_runs = full.some((a) =>
        a.length === 4 && a.every((g) => g.type === CardStackType.PURE_RUN));
    const has_3_sets_of_4 = full.some((a) =>
        a.length === 3 && a.every((g) => g.type === CardStackType.SET && g.cards.length === 4));

    assert(has_4_runs, "Should find 4 pure runs");
    assert(has_3_sets_of_4, "Should find 3 sets of 4");
}

// Case 6: Red/black run territory.
// AH 2S 3H — a valid red/black run.
// AH 2S 3D — also red/black (red, black, red).
{
    const cards = [c("AH"), c("2S"), c("3H"), c("3D")];
    const groups = find_all_valid_groups(cards);
    const all = find_all_arrangements(cards);
    const non_empty = all.filter((a) => a.length > 0);

    console.log(`\nCase 6: ${cards.map(card_label).join(" ")} (${cards.length} cards)`);
    console.log(`  Valid groups: ${groups.length}`);
    for (const g of groups) {
        const sorted = [...g.cards].sort((a, b) => a.value - b.value);
        console.log(`    [${sorted.map(card_label).join(" ")}] (${g.type})`);
    }
    console.log(`  Arrangements with groups: ${non_empty.length}`);
    for (const a of non_empty) console.log("  " + fmt_arrangement(a, cards));

    // Two valid groups: [AH 2S 3H] and [AH 2S 3D], both red/black.
    // But they overlap on AH and 2S, so only one at a time.
    assert.equal(non_empty.length, 2);
}

// Case 7: The transformable 9 — sets that become runs, with
// red/black options too.
// 4H 4S 4D  5H 5S 5D  6H 6S 6D
// Sets: [4H 4S 4D] [5H 5S 5D] [6H 6S 6D]
// Pure runs: [4H 5H 6H] [4S 5S 6S] [4D 5D 6D]
// Red/black: [4H 5S 6H] [4H 5S 6D] [4D 5S 6H] [4D 5S 6D] etc.
{
    const cards = [
        c("4H"), c("4S"), c("4D"),
        c("5H"), c("5S"), c("5D"),
        c("6H"), c("6S"), c("6D"),
    ];
    const groups = find_all_valid_groups(cards);
    const all = find_all_arrangements(cards);
    const full = all.filter((a) => grouped_count(a) === 9);

    console.log(`\nCase 7: 4/5/6 x H/S/D (${cards.length} cards)`);
    console.log(`  Valid groups: ${groups.length}`);
    console.log(`  Total arrangements: ${all.length}`);
    console.log(`  Full arrangements (all 9 grouped): ${full.length}`);
    for (const a of full) console.log("  " + fmt_arrangement(a, cards));

    const has_3_sets = full.some((a) =>
        a.length === 3 && a.every((g) => g.type === CardStackType.SET));
    const has_3_pure_runs = full.some((a) =>
        a.length === 3 && a.every((g) => g.type === CardStackType.PURE_RUN));
    const has_rb = full.some((a) =>
        a.some((g) => g.type === CardStackType.RED_BLACK_RUN));

    assert(has_3_sets, "Should find 3 sets");
    assert(has_3_pure_runs, "Should find 3 pure runs");
    assert(has_rb, "Should find arrangements with red/black runs");
}

// Case 8: 12 cards, 4 suits. Maximum flexibility.
{
    const cards = [
        c("4H"), c("4S"), c("4D"), c("4C"),
        c("5H"), c("5S"), c("5D"), c("5C"),
        c("6H"), c("6S"), c("6D"), c("6C"),
    ];
    const groups = find_all_valid_groups(cards);
    const all = find_all_arrangements(cards);
    const full = all.filter((a) => grouped_count(a) === 12);

    console.log(`\nCase 8: 4/5/6 x all suits (${cards.length} cards)`);
    console.log(`  Valid groups: ${groups.length}`);
    console.log(`  Total arrangements: ${all.length}`);
    console.log(`  Full arrangements (all 12 grouped): ${full.length}`);

    // Too many to print all — just show a few interesting ones.
    const sets_only = full.filter((a) => a.every((g) => g.type === CardStackType.SET));
    const runs_only = full.filter((a) => a.every((g) => g.type === CardStackType.PURE_RUN));
    const mixed = full.filter((a) => {
        const types = new Set(a.map((g) => g.type));
        return types.size > 1;
    });

    console.log(`    All-sets: ${sets_only.length}`);
    console.log(`    All-pure-runs: ${runs_only.length}`);
    console.log(`    Mixed: ${mixed.length}`);

    if (sets_only.length > 0) console.log(`    Example sets: ${fmt_arrangement(sets_only[0], cards)}`);
    if (runs_only.length > 0) console.log(`    Example runs: ${fmt_arrangement(runs_only[0], cards)}`);
    if (mixed.length > 0) console.log(`    Example mixed: ${fmt_arrangement(mixed[0], cards)}`);

    assert(sets_only.length > 0, "Should find all-sets arrangements");
    assert(runs_only.length > 0, "Should find all-pure-runs arrangements");
}

// Case 9: Double deck — two copies of same card.
// This tests that we handle duplicates correctly.
{
    const cards = [
        c("7H", D1), c("7H", D2),
        c("7S"), c("7D"), c("7C"),
    ];
    const groups = find_all_valid_groups(cards);
    const all = find_all_arrangements(cards);
    const non_empty = all.filter((a) => a.length > 0);

    console.log(`\nCase 9: Two 7H + 7S 7D 7C (${cards.length} cards, double deck)`);
    console.log(`  Valid groups: ${groups.length}`);
    console.log(`  Arrangements with groups: ${non_empty.length}`);
    for (const a of non_empty) console.log("  " + fmt_arrangement(a, cards));

    // Two 7H cards can't be in the same set. So we get:
    // [7H(D1) 7S 7D 7C], [7H(D2) 7S 7D 7C] (4-card sets)
    // [7H(D1) 7S 7D], [7H(D1) 7S 7C], etc. (3-card sets)
    // [7H(D2) 7S 7D], etc.
    // But no set can have both 7H cards.
    const has_both_7h = groups.some((g) =>
        g.cards.filter((c) => c.value === 7 && c.suit === Suit.HEART).length === 2);
    assert(!has_both_7h, "No group should contain both 7H cards");
}

console.log("\nAll arrangement tests passed.");
