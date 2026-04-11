// Run the threesome solver against all 48 orphan puzzles.

import * as fs from "fs";
import { Card, OriginDeck } from "../core/card";
import { solve_threesomes, leftover_cards } from "./threesome_solver";

function parse_card(label: string): Card {
    const parts = label.replace("10", "T").split(":");
    const deck = parts.length > 1 && parts[1] === "2"
        ? OriginDeck.DECK_TWO : OriginDeck.DECK_ONE;
    return Card.from(parts[0], deck);
}

type Puzzle = {
    total_cards: number;
    board_stacks: number;
    hand_size: number;
    board: { cards: string[]; type: string; score: number }[];
    hand: string[];
    expert_score: number;
};

const puzzles: Puzzle[] = JSON.parse(
    fs.readFileSync("src/lyn_rummy/orphan_puzzles.json", "utf-8"),
);

console.log(`Running threesome solver against ${puzzles.length} puzzles\n`);
console.log(
    "#".padStart(3) + "  " +
    "Cards".padStart(5) + "  " +
    "Hand".padStart(4) + "  " +
    "Placed".padStart(7) + "  " +
    "Stuck".padStart(6) + "  " +
    "Iters".padStart(6) + "  " +
    "Time"
);
console.log("-".repeat(60));

let total_solved = 0;
let total_stuck = 0;
let total_partial = 0;

for (let i = 0; i < puzzles.length; i++) {
    const p = puzzles[i];
    const cards: Card[] = [];
    for (const stack of p.board) {
        for (const label of stack.cards) cards.push(parse_card(label));
    }
    for (const label of p.hand) cards.push(parse_card(label));

    const t1 = performance.now();
    const result = solve_threesomes(cards);
    const ms = performance.now() - t1;

    const leftover = leftover_cards(result.board);
    const placed = cards.length - leftover.length;
    const fully_solved = leftover.length === 0;
    if (fully_solved) total_solved++;
    else if (placed > cards.length - p.hand.length) total_partial++;
    else total_stuck++;

    const tag = fully_solved ? "✓" : "";
    console.log(
        String(i + 1).padStart(3) + "  " +
        String(cards.length).padStart(5) + "  " +
        String(p.hand_size).padStart(4) + "  " +
        (String(placed) + "/" + cards.length).padStart(7) + "  " +
        String(leftover.length).padStart(6) + "  " +
        String(result.iterations).padStart(6) + "  " +
        ms.toFixed(0) + "ms " + tag
    );
}

console.log("-".repeat(60));
console.log(`Solved (zero stuck): ${total_solved}/${puzzles.length}`);
console.log(`Partial (better than starting orphans): ${total_partial}`);
console.log(`No improvement: ${total_stuck}`);
