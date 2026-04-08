// Benchmark: run board improvements on each game snapshot
// individually. Each board is a frozen input — no cumulative
// effects. Measures score gain per board at every scale.

import * as fs from "fs";
import { Card, OriginDeck } from "./card";
import { BoardCard, BoardCardState, CardStack, type BoardLocation } from "./card_stack";
import { Score } from "./score";
import {
    do_obvious_board_improvements,
    do_board_improvements_with_swap,
    do_board_improvements_with_split,
} from "./board_improve";

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

type Strategy = {
    name: string;
    fn: (board: CardStack[]) => { board: CardStack[]; score_gained: number; upgrades_applied: number };
};

const strategies: Strategy[] = [
    { name: "base", fn: do_obvious_board_improvements },
    { name: "+swap", fn: do_board_improvements_with_swap },
    { name: "+split", fn: do_board_improvements_with_split },
];

console.log(`Board improvement duel (${unique.length} boards)\n`);

// Header.
const header = "Turn".padStart(4) + "Cards".padStart(6) + "Before".padStart(7) +
    strategies.map((s) => s.name.padStart(8)).join("") + "  best";
console.log(header);
console.log("-".repeat(header.length));

const totals = strategies.map(() => ({ gain: 0, improved: 0, tricks: 0 }));

for (const snap of unique) {
    const board = load_board(snap);
    const before = Score.for_stacks(board);

    const results = strategies.map((s) => {
        const fresh = load_board(snap); // fresh copy each time
        return s.fn(fresh);
    });

    const gains = results.map((r) => Score.for_stacks(r.board) - before);
    const best_gain = Math.max(...gains);

    let row = String(snap.turn).padStart(4) +
        String(snap.cards_on_board).padStart(6) +
        String(before).padStart(7);

    for (let i = 0; i < gains.length; i++) {
        const g = gains[i];
        const marker = g === best_gain && g > 0 ? "*" : " ";
        row += (marker + (g > 0 ? `+${g}` : "—")).padStart(8);
        totals[i].gain += g;
        if (g > 0) totals[i].improved++;
        totals[i].tricks += results[i].upgrades_applied;
    }

    // Show winner when strategies disagree.
    const winners = strategies.filter((_, i) => gains[i] === best_gain && best_gain > 0);
    if (best_gain > 0 && winners.length < strategies.length) {
        row += "  " + winners.map((s) => s.name).join(",");
    }

    console.log(row);
}

console.log(`\nSummary:\n`);
for (let i = 0; i < strategies.length; i++) {
    const t = totals[i];
    console.log(`  ${strategies[i].name.padEnd(8)} gain: +${t.gain}, improved: ${t.improved}/${unique.length}, tricks: ${t.tricks}`);
}
