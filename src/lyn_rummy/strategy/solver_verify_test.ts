// Verify the solver against exhaustive ground truth.
//
// For each test case, we:
// 1. Enumerate ALL arrangements (brute force oracle).
// 2. Run the solver.
// 3. Assert the solver's score matches the oracle's best score.
//
// This catches any case where the solver misses the optimal arrangement.

import assert from "node:assert/strict";
import { Card, OriginDeck, Suit } from "../core/card";
import { CardStackType } from "../core/stack_type";
import {
    card_label,
    find_best_arrangement,
    fmt_arrangement,
    arrangement_quality,
} from "./arrangements";
import {
    solve,
    format_solve_result,
    type SolveResult,
} from "../hints/reassemble_graph";

const D1 = OriginDeck.DECK_ONE;
const D2 = OriginDeck.DECK_TWO;

function c(label: string, deck: OriginDeck = D1): Card {
    return Card.from(label, deck);
}

// Quality metric matching the solver and oracle: grouped cards * 10000 + score.
function solver_quality(result: SolveResult, total_cards: number): number {
    const grouped = total_cards - result.ungrouped.length;
    return grouped * 10000 + result.total_score;
}

type TestCase = {
    name: string;
    cards: Card[];
};

const cases: TestCase[] = [
    // --- Trivial (3 cards) ---
    {
        name: "3-card pure run",
        cards: [c("4H"), c("5H"), c("6H")],
    },
    {
        name: "3-card set",
        cards: [c("7H"), c("7S"), c("7D")],
    },
    {
        name: "3-card red/black",
        cards: [c("AH"), c("2S"), c("3H")],
    },
    {
        name: "3 unrelated cards",
        cards: [c("AH"), c("5S"), c("KD")],
    },

    // --- Small (4-6 cards) ---
    {
        name: "4-card set",
        cards: [c("3H"), c("3S"), c("3D"), c("3C")],
    },
    {
        name: "4-card pure run",
        cards: [c("TS"), c("JS"), c("QS"), c("KS")],
    },
    {
        name: "red/black with choice",
        cards: [c("AH"), c("2S"), c("3H"), c("3D")],
    },
    {
        name: "run + leftover",
        cards: [c("4H"), c("5H"), c("6H"), c("KD"), c("2S")],
    },
    {
        name: "two overlapping runs",
        cards: [c("4H"), c("5H"), c("6H"), c("6S"), c("7S"), c("8S")],
    },

    // --- The transformable 9 (sets ↔ runs) ---
    {
        name: "A/2/3 x H/S/D — sets or runs",
        cards: [
            c("AH"), c("AS"), c("AD"),
            c("2H"), c("2S"), c("2D"),
            c("3H"), c("3S"), c("3D"),
        ],
    },
    {
        name: "4/5/6 x H/S/D — sets or runs",
        cards: [
            c("4H"), c("4S"), c("4D"),
            c("5H"), c("5S"), c("5D"),
            c("6H"), c("6S"), c("6D"),
        ],
    },

    // --- 12 cards (4 suits) ---
    {
        name: "A/2/3 x all suits",
        cards: [
            c("AH"), c("AS"), c("AD"), c("AC"),
            c("2H"), c("2S"), c("2D"), c("2C"),
            c("3H"), c("3S"), c("3D"), c("3C"),
        ],
    },
    {
        name: "4/5/6 x all suits",
        cards: [
            c("4H"), c("4S"), c("4D"), c("4C"),
            c("5H"), c("5S"), c("5D"), c("5C"),
            c("6H"), c("6S"), c("6D"), c("6C"),
        ],
    },

    // --- Contested cards ---
    {
        name: "6-card: set steals from run",
        // 7H can be in the set [7H 7S 7D] OR the run [6H 7H 8H].
        // Run scores 100, set scores 60. Optimal picks the run.
        cards: [c("6H"), c("7H"), c("8H"), c("7S"), c("7D")],
    },
    {
        name: "9-card: set vs run tension",
        // 7H is contested: [7H 7S 7D] set vs [6H 7H 8H] run.
        // With extra cards [6S 8S], a spade run [6S 7S 8S] becomes
        // possible — freeing 7S from the set.
        cards: [
            c("6H"), c("7H"), c("8H"),
            c("7S"), c("7D"),
            c("6S"), c("8S"),
            c("9H"), c("TH"),
        ],
    },

    // --- Double deck ---
    {
        name: "double deck: two 7H",
        cards: [
            c("7H", D1), c("7H", D2),
            c("7S"), c("7D"), c("7C"),
        ],
    },
    {
        name: "double deck: parallel runs",
        cards: [
            c("4H", D1), c("5H", D1), c("6H", D1),
            c("4H", D2), c("5H", D2), c("6H", D2),
        ],
    },

    // --- Slightly larger (15 cards) ---
    {
        name: "15 cards: 5 values x 3 suits",
        cards: [
            c("3H"), c("3S"), c("3D"),
            c("4H"), c("4S"), c("4D"),
            c("5H"), c("5S"), c("5D"),
            c("6H"), c("6S"), c("6D"),
            c("7H"), c("7S"), c("7D"),
        ],
    },

    // --- Tricky contested scenarios ---
    {
        name: "card needed by both a run and a set",
        // 5H is in [5H 5S 5D] set AND [4H 5H 6H] run.
        // Optimal: [4H 5H 6H] run (100) > set (60).
        // But 5S+5D are then stranded.
        cards: [c("4H"), c("5H"), c("6H"), c("5S"), c("5D")],
    },
    {
        name: "two sets share a card with two runs",
        // 5H in set [5H 5S 5D] and run [4H 5H 6H].
        // 6H in set [6H 6S 6D] and run [4H 5H 6H].
        // Optimal: two sets (120) beats one run (100) when both
        // sets survive. But [4H 5H 6H] is also a run...
        cards: [
            c("4H"), c("5H"), c("6H"),
            c("5S"), c("5D"),
            c("6S"), c("6D"),
        ],
    },
    {
        name: "greedy trap: long run steals from two sets",
        // [3H 4H 5H 6H 7H] run (300) OR
        // [3H 3S 3D] + [7H 7S 7D] sets (120) + [4H 5H 6H] run (100) = 220.
        // Greedy picks the long run (300), which is correct here.
        cards: [
            c("3H"), c("3S"), c("3D"),
            c("4H"), c("5H"), c("6H"),
            c("7H"), c("7S"), c("7D"),
        ],
    },
    {
        name: "greedy trap: short runs beat one long run",
        // [AH AS AD] set (60) + [2H 3H 4H] run (100) + [2S 3S 4S] run (100) = 260
        // vs [AH 2H 3H 4H] run (200) + [AS 2S 3S 4S] run (200) = 400 leaving AD
        // vs [AH 2H 3H 4H] (200) + [AS 2S 3S] (100) + ...
        // Oracle determines the true best.
        cards: [
            c("AH"), c("AS"), c("AD"),
            c("2H"), c("2S"),
            c("3H"), c("3S"),
            c("4H"), c("4S"),
        ],
    },

    // --- 12 cards double deck ---
    {
        name: "double deck: 6 cards, two parallel 3-runs",
        cards: [
            c("TH", D1), c("JH", D1), c("QH", D1),
            c("TH", D2), c("JH", D2), c("QH", D2),
        ],
    },
    {
        name: "double deck: 12 cards, parallel + sets",
        // Two copies of 4H 5H 6H. Plus 4S 5S 6S.
        // Options: 2 hearts runs + 1 spade run (300)
        //   OR hearts run + 3 sets [4H 4S ...] nope, only 2 suits.
        cards: [
            c("4H", D1), c("5H", D1), c("6H", D1),
            c("4H", D2), c("5H", D2), c("6H", D2),
            c("4S"), c("5S"), c("6S"),
            c("4D"), c("5D"), c("6D"),
        ],
    },

    // --- 16 cards (pushes bitmask to 2^16 = 65K subsets) ---
    {
        name: "16 cards: 4 values x 4 suits",
        cards: [
            c("8H"), c("8S"), c("8D"), c("8C"),
            c("9H"), c("9S"), c("9D"), c("9C"),
            c("TH"), c("TS"), c("TD"), c("TC"),
            c("JH"), c("JS"), c("JD"), c("JC"),
        ],
    },
];

// Run verification.
let pass = 0;
let fail = 0;

for (const tc of cases) {
    const oracle = find_best_arrangement(tc.cards);
    const start = performance.now();
    const result = solve(tc.cards);
    const ms = performance.now() - start;

    const oracle_q = arrangement_quality(oracle.best);
    const solver_q = solver_quality(result, tc.cards.length);
    const ok = solver_q >= oracle_q;

    if (ok) {
        pass++;
        console.log(`PASS  ${tc.name} (${tc.cards.length} cards): solver=${solver_q} oracle=${oracle_q} [${ms.toFixed(1)}ms]`);
    } else {
        fail++;
        console.log(`FAIL  ${tc.name} (${tc.cards.length} cards): solver=${solver_q} oracle=${oracle_q} [${ms.toFixed(1)}ms]`);
        console.log(`  Oracle best: ${fmt_arrangement(oracle.best, tc.cards)}`);
        console.log(`  Solver got:`);
        console.log(format_solve_result(result));
    }
}

console.log(`\n${pass} passed, ${fail} failed out of ${cases.length} cases.`);
assert.equal(fail, 0, `${fail} test cases failed — solver does not match oracle`);
