// Run the threesome solver against all 48 orphan puzzles, but
// give it the SAME framing humans get: the puzzle's existing
// board (with valid stacks intact) plus the hand cards as
// singletons. The solver only needs to find a way to play the
// hand cards onto the existing board.

import * as fs from "fs";
import { Card, OriginDeck } from "./card";
import { solve_from_board, leftover_cards } from "./threesome_solver";

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

console.log(`Solving ${puzzles.length} puzzles in HUMAN MODE`);
console.log(`(starting from the existing board, with hand cards as singletons)\n`);
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

for (let i = 0; i < puzzles.length; i++) {
    const p = puzzles[i];

    // Build the initial board: each board entry becomes its own
    // stack (a valid 3+ family); each hand card becomes its own
    // singleton stack. The solver respects existing families and
    // only raids them when it has to.
    const initial_stacks: Card[][] = [];
    for (const stack of p.board) {
        initial_stacks.push(stack.cards.map(parse_card));
    }
    for (const label of p.hand) {
        initial_stacks.push([parse_card(label)]);
    }

    const total_cards = initial_stacks.reduce((sum, s) => sum + s.length, 0);

    const t1 = performance.now();
    const result = solve_from_board(initial_stacks);
    const ms = performance.now() - t1;

    const leftover = leftover_cards(result.board);
    const placed = total_cards - leftover.length;
    const fully_solved = leftover.length === 0 && !result.threw;
    if (fully_solved) total_solved++;
    else total_stuck++;

    const tag = fully_solved ? "✓" : (result.threw ? " THREW" : "");
    console.log(
        String(i + 1).padStart(3) + "  " +
        String(total_cards).padStart(5) + "  " +
        String(p.hand_size).padStart(4) + "  " +
        (String(placed) + "/" + total_cards).padStart(7) + "  " +
        String(leftover.length).padStart(6) + "  " +
        String(result.iterations).padStart(6) + "  " +
        ms.toFixed(0) + "ms " + tag
    );
}

console.log("-".repeat(60));
console.log(`Solved (zero stuck): ${total_solved}/${puzzles.length}`);
console.log(`Stuck: ${total_stuck}`);
