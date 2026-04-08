// Benchmark: run board improvements on each game snapshot
// individually. Each board is a frozen input — no cumulative
// effects. Measures score gain per board at every scale.

import * as fs from "fs";
import { Card, OriginDeck } from "./card";
import { BoardCard, BoardCardState, CardStack, type BoardLocation } from "./card_stack";
import { Score } from "./score";
import { do_obvious_board_improvements } from "./board_improve";

const D1 = OriginDeck.DECK_ONE;
const loc: BoardLocation = { top: 0, left: 0 };

type Snapshot = {
    turn: number;
    cards_on_board: number;
    stacks: { cards: string[]; type: string }[];
};

function load_board(snap: Snapshot): CardStack[] {
    return snap.stacks.map((sd) => new CardStack(
        sd.cards.map((l) =>
            new BoardCard(Card.from(l.replace("10", "T"), D1), BoardCardState.FIRMLY_ON_BOARD)),
        loc,
    ));
}

const raw = fs.readFileSync("src/lyn_rummy/game_boards.json", "utf-8");
const snapshots: Snapshot[] = JSON.parse(raw);

// Deduplicate by card count.
const seen_counts = new Set<number>();
const unique: Snapshot[] = [];
for (const snap of snapshots) {
    if (!seen_counts.has(snap.cards_on_board)) {
        seen_counts.add(snap.cards_on_board);
        unique.push(snap);
    }
}

console.log(`Board improvement benchmark (${unique.length} boards)\n`);
console.log(
    "Turn".padStart(4) +
    "Cards".padStart(6) +
    "Before".padStart(7) +
    "After".padStart(7) +
    "Gain".padStart(6) +
    "Tricks".padStart(7) +
    "  Time"
);
console.log("-".repeat(50));

let total_gain = 0;
let total_tricks = 0;
let boards_improved = 0;

for (const snap of unique) {
    const board = load_board(snap);
    const before = Score.for_stacks(board);

    const start = performance.now();
    const result = do_obvious_board_improvements(board);
    const ms = performance.now() - start;

    const after = Score.for_stacks(result.board);
    const gain = after - before;

    if (gain > 0) boards_improved++;
    total_gain += gain;
    total_tricks += result.upgrades_applied;

    const gain_str = gain > 0 ? `+${gain}` : "—";
    console.log(
        String(snap.turn).padStart(4) +
        String(snap.cards_on_board).padStart(6) +
        String(before).padStart(7) +
        String(after).padStart(7) +
        gain_str.padStart(6) +
        String(result.upgrades_applied).padStart(7) +
        `  ${ms.toFixed(1)}ms`
    );
}

console.log(`\nSummary:`);
console.log(`  Boards tested: ${unique.length}`);
console.log(`  Boards improved: ${boards_improved}`);
console.log(`  Total score gain: +${total_gain}`);
console.log(`  Total tricks applied: ${total_tricks}`);
