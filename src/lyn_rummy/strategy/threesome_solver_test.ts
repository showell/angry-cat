// Run the threesome solver on the canonical 19-card case.

import { Card, OriginDeck, Suit, value_str } from "../core/card";
import { solve_threesomes, leftover_cards } from "./threesome_solver";

const D1 = OriginDeck.DECK_ONE;

const sl: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
function cs(c: Card): string { return value_str(c.value) + sl[c.suit]; }

const ALL_19 = [
    "TD", "JD", "QD", "KD",
    "2H", "3H", "4H",
    "7S", "7D", "7C",
    "AC", "AD", "AH",
    "2C", "3D", "4C", "5H", "6S", "7H",
];

const cards = ALL_19.map((l) => Card.from(l, D1));

console.log("Solving 19-card case with threesome solver...\n");

const t1 = performance.now();
const result = solve_threesomes(cards);
const ms = performance.now() - t1;

console.log(`Iterations: ${result.iterations}`);
console.log(`Time: ${ms.toFixed(1)}ms`);
console.log(`Score: ${result.score}`);
console.log();

console.log("Final board:");
for (const stack of result.board.stacks) {
    if (stack.length >= 3) {
        console.log("  [" + stack.map(cs).join(" ") + "]");
    }
}

const leftover = leftover_cards(result.board);
console.log();
console.log(`Leftover cards: ${leftover.length}`);
if (leftover.length > 0) {
    console.log("  " + leftover.map(cs).join(" "));
}

const placed = cards.length - leftover.length;
console.log();
console.log(`Total cards placed: ${placed}/${cards.length}`);
