// Pretty-print the threesome solver's iteration log for one puzzle.
//
// We call solve_from_board (the single source of truth for the
// algorithm) and then post-process its `steps` field to print a
// human-friendly trace, hiding stacks that never change throughout
// the run.
//
// Usage:
//   npx tsx src/lyn_rummy/cycle_viewer.ts <puzzle_index>

import * as fs from "fs";
import { Card, OriginDeck, Suit, value_str } from "../core/card";
import { solve_from_board } from "../strategy/threesome_solver";

function parse_card(label: string): Card {
    const parts = label.replace("10", "T").split(":");
    const deck = parts.length > 1 && parts[1] === "2"
        ? OriginDeck.DECK_TWO : OriginDeck.DECK_ONE;
    return Card.from(parts[0], deck);
}

const sl: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
function cs(c: Card): string {
    const dk = c.origin_deck === OriginDeck.DECK_ONE ? "1" : "2";
    return value_str(c.value) + sl[c.suit] + ":" + dk;
}
function fmt_stack(s: Card[]): string {
    return "[" + s.map(cs).join(" ") + "]";
}

// Canonical key for a stack: the cards in their actual order.
// (Order matters for runs.)
function stack_key(s: Card[]): string {
    return s.map(cs).join(",");
}

// Canonical key for a whole board: sorted stack keys joined.
function board_key(stacks: Card[][]): string {
    return stacks.map(stack_key).sort().join("|");
}

// --- Main ---

const puzzle_idx = parseInt(process.argv[2] || "4");
const puzzles = JSON.parse(fs.readFileSync("src/lyn_rummy/orphan_puzzles.json", "utf-8"));
const puzzle = puzzles[puzzle_idx - 1];
if (!puzzle) {
    console.error("No puzzle with index " + puzzle_idx);
    process.exit(1);
}

console.log(`Puzzle ${puzzle_idx}: ${puzzle.total_cards} cards, ${puzzle.hand_size} hand`);
console.log();

const initial_stacks: Card[][] = [];
for (const s of puzzle.board) initial_stacks.push(s.cards.map(parse_card));
for (const l of puzzle.hand) initial_stacks.push([parse_card(l)]);

const result = solve_from_board(initial_stacks);

// --- Identify boring stacks ---
//
// A stack key is "boring" if it appears in the initial board AND
// every iteration's snapshot. The eye doesn't need to see it.
const all_snapshots = [initial_stacks, ...result.steps.map((s) => s.stacks_after)];
const initial_keys = new Set(initial_stacks.map(stack_key));
const boring_keys = new Set<string>();
for (const k of initial_keys) {
    if (all_snapshots.every((snap) => snap.some((s) => stack_key(s) === k))) {
        boring_keys.add(k);
    }
}

function show_interesting(stacks: Card[][]): void {
    const interesting = stacks
        .filter((s) => !boring_keys.has(stack_key(s)))
        .sort((a, b) => b.length - a.length);
    for (const s of interesting) {
        console.log("    " + fmt_stack(s));
    }
}

// --- Initial board ---

console.log(`=== INITIAL BOARD (${boring_keys.size} unchanging stacks hidden) ===`);
show_interesting(initial_stacks);
const initial_score = result.steps.length > 0 ? result.steps[0].score_before : 0;
console.log("Score: " + initial_score);
console.log();

// --- Per-iteration trace ---

for (const step of result.steps) {
    const tag = step.acting_as_pair ? " (pair)" : "";
    console.log(
        `iter ${step.iter}: ${cs(step.chosen)}${tag} plays ${fmt_stack(step.threesome.cards)}  ` +
        `${step.score_before}→${step.score_after}`,
    );
    show_interesting(step.stacks_after);
}

// --- Cycle stats and final summary ---

const visit_count = new Map<string, number>();
visit_count.set(board_key(initial_stacks), 1);
for (const step of result.steps) {
    const key = board_key(step.stacks_after);
    visit_count.set(key, (visit_count.get(key) ?? 0) + 1);
}
const top = [...visit_count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

console.log();
if (result.threw) {
    console.log(`Stopped: ${result.error_message}`);
} else {
    console.log(`Stopped: queue empty`);
}
console.log(`Iterations: ${result.iterations}`);
console.log(`Unique states visited: ${visit_count.size}`);
console.log(`Top revisited states: ${top.map(([_, n]) => n).join(", ")}`);
console.log(`Final score: ${result.score}`);

let total_cards = 0;
let leftover = 0;
for (const s of result.board.stacks) {
    total_cards += s.length;
    if (s.length < 3) leftover += s.length;
}
console.log(`Cards placed: ${total_cards - leftover}/${total_cards}`);
