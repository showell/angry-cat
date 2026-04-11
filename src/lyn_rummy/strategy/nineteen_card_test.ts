// 19-card test case: a board that humans solve perfectly but
// the expert algorithm currently orphans 2 cards.
//
// Cards: 10D JD QD KD 2H 3H 4H 7S 7D 7C AC AD AH 2C 3D 4C 5H 6S 7H
//
// Human solution (all 19 placed, score 620):
//   [10D JD QD KD] (pr) = 200
//   [2H 3H 4H] (pr) = 100
//   [7S 7D 7C] (set) = 60
//   [AC AD AH] (set) = 60
//   [2C 3D 4C 5H 6S 7H] (rb) = 200
//
// Expert currently orphans AC and 6S because it greedily grabs
// AD for the diamond run and 7H for the 7-set, breaking the
// rb chain that would have connected all remaining cards.

import assert from "node:assert/strict";
import { Card, OriginDeck, Suit, value_str } from "../core/card";
import {
    BoardCard, BoardCardState, CardStack, HandCard, HandCardState,
    type BoardLocation,
} from "../core/card_stack";
import { get_hint, HintLevel } from "../hints/hints";
import { solve, STRATEGY_PREFER_RUNS } from "../hints/reassemble_graph";

const D1 = OriginDeck.DECK_ONE;
const loc: BoardLocation = { top: 0, left: 0 };
const sl: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
function cs(c: Card): string { return value_str(c.value) + sl[c.suit]; }

function bs(...labels: string[]): CardStack {
    return new CardStack(
        labels.map((l) => new BoardCard(Card.from(l, D1), BoardCardState.FIRMLY_ON_BOARD)), loc);
}

const ALL_19 = [
    "TD", "JD", "QD", "KD",
    "2H", "3H", "4H",
    "7S", "7D", "7C",
    "AC", "AD", "AH",
    "2C", "3D", "4C", "5H", "6S", "7H",
];

// --- Test 1: Human can play 7H onto the board with 18 cards ---
//
// Board has 18 of the 19 cards (all except 7H) arranged as:
//   [10D JD QD KD] [2H 3H 4H] [7S 7D 7C] [AC AD AH] [2C 3D 4C 5H 6S]
// Hand has 7H. The hint engine should find a way to play it.
{
    const board = [
        bs("TD", "JD", "QD", "KD"),
        bs("2H", "3H", "4H"),
        bs("7S", "7D", "7C"),
        bs("AC", "AD", "AH"),
        bs("2C", "3D", "4C", "5H", "6S"),
    ];
    const hand = [new HandCard(Card.from("7H", D1), HandCardState.NORMAL)];

    const hint = get_hint(hand, board);

    assert.notEqual(hint.level, HintLevel.NO_MOVES,
        "Human should find a way to play 7H");

    console.log("  Human plays 7H: " + hint.level + " ✓");
}

// --- Test 2: Expert algorithm on all 19 scattered cards ---
//
// The expert must place all 19 cards with zero orphans.
// Previously it greedily extended the diamond run with AD and
// grabbed 7H for the 7-set, breaking the rb chain. Fixed by
// preferring solutions that place more cards over higher scores.
{
    const cards = ALL_19.map((l) => Card.from(l, D1));

    const result = solve(cards, STRATEGY_PREFER_RUNS);

    const placed = cards.length - result.ungrouped.length;

    console.log("  Expert: score=" + result.total_score +
        " placed=" + placed + "/" + cards.length +
        " ungrouped=" + result.ungrouped.map(cs).join(","));

    assert.equal(result.ungrouped.length, 0,
        "Expert should place all 19 cards with zero orphans");

    console.log("  Expert places all " + cards.length + " cards ✓");
}

console.log("\nAll 19-card tests passed.");
