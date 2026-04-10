// Greedy polite-steal report.
//
// For every puzzle, repeat the following step until nothing
// qualifies:
//
//   1. Iterate through all candidate triples.
//   2. Dismiss any triple whose assembly would damage the
//      existing board (the polite-steal rule: no source stack
//      may end up in an invalid state).
//   3. For each surviving triple, simulate its commit on a clone
//      and compute the resulting board score delta.
//   4. Commit the triple with the highest delta.
//
// A "win" is one such commit. Reported per puzzle: total wins,
// unplayed cards placed, and final board score.
//
// This is exploration scaffolding — it doesn't touch the
// production solver.

import * as fs from "fs";
import { Card, OriginDeck, Suit, value_str } from "./card";
import { CardStackType, get_stack_type } from "./stack_type";
import { compute_threesomes, Threesome } from "./threesomes";

function parse_card(label: string): Card {
    const parts = label.replace("10", "T").split(":");
    const deck = parts.length > 1 && parts[1] === "2"
        ? OriginDeck.DECK_TWO : OriginDeck.DECK_ONE;
    return Card.from(parts[0], deck);
}

const SUIT_LABELS: Record<Suit, string> = {
    [Suit.CLUB]: "C",
    [Suit.DIAMOND]: "D",
    [Suit.SPADE]: "S",
    [Suit.HEART]: "H",
};

function pretty_card(c: Card): string {
    return value_str(c.value) + SUIT_LABELS[c.suit as Suit];
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

// --- Minimal Board / Stack types ---
//
// We do NOT import from raid.ts because this script wants to
// stay completely standalone. The behaviors here are duplicated
// from raid.ts deliberately (steal_one_card especially).
type Stack = Card[];
type Board = {
    stacks: Stack[];
    location: Map<Card, Stack>;
};

function make_board(initial_stacks: Card[][]): Board {
    const board: Board = {
        stacks: initial_stacks.map((s) => s.slice()),
        location: new Map(),
    };
    for (const stack of board.stacks) {
        for (const c of stack) board.location.set(c, stack);
    }
    return board;
}

function clone_board(b: Board): Board {
    const stacks = b.stacks.map((s) => s.slice());
    const location = new Map<Card, Stack>();
    for (const stack of stacks) for (const c of stack) location.set(c, stack);
    return { stacks, location };
}

// Pull a single card out of its current stack. End extraction
// shrinks the stack; middle extraction splits the stack into two
// pieces. Duplicates the behavior of raid.ts:steal_one_card.
function steal_one_card(board: Board, card: Card): void {
    const stack = board.location.get(card);
    if (!stack) return;
    const idx = stack.indexOf(card);
    if (idx < 0) return;
    board.location.delete(card);

    if (idx === 0 || idx === stack.length - 1) {
        stack.splice(idx, 1);
        if (stack.length === 0) {
            const sidx = board.stacks.indexOf(stack);
            if (sidx >= 0) board.stacks.splice(sidx, 1);
        }
        return;
    }

    // Middle extraction: split into two pieces.
    const left = stack.slice(0, idx);
    const right = stack.slice(idx + 1);
    const sidx = board.stacks.indexOf(stack);
    if (sidx >= 0) board.stacks.splice(sidx, 1);
    if (left.length > 0) {
        board.stacks.push(left);
        for (const c of left) board.location.set(c, left);
    }
    if (right.length > 0) {
        board.stacks.push(right);
        for (const c of right) board.location.set(c, right);
    }
}

// --- Polite-steal rule ---
//
// "Polite" means: would removing this card from its current
// stack damage a valid 3+ stack into something invalid? If yes,
// not polite. Singletons and pairs are always polite to raid
// (they're not valid families to begin with). Sets of size >= 4
// are polite at any position because removing any one card
// leaves a valid (size-1)-set. Runs of size >= 4 are polite at
// the ends. Runs are polite at a middle position only if BOTH
// resulting pieces would be valid 3+ runs.
function can_politely_steal(stack: Stack, card: Card): boolean {
    const len = stack.length;
    if (len <= 2) return true; // singletons and pairs are fair game
    const t = get_stack_type(stack);
    if (t === CardStackType.INCOMPLETE) return true; // already invalid
    const idx = stack.indexOf(card);
    if (idx < 0) return false;

    if (t === CardStackType.SET) {
        return len >= 4;
    }
    // Runs (pure or red-black)
    if (idx === 0 || idx === len - 1) {
        return len >= 4; // end extraction: result is (len-1) >= 3
    }
    // Middle extraction: split into two pieces, both must be 3+.
    const left_len = idx;
    const right_len = len - idx - 1;
    return left_len >= 3 && right_len >= 3;
}

// --- Triple assembly attempt ---
//
// Mimics the human approach: for each slot, first try to grab a
// matching card from the hand / orphan pile (a card currently
// sitting in a stack of size < 3). Only if no such card exists
// for that slot do we fall back to peeling from a valid 3+ stack,
// and that peel must be polite (no source stack ruined).
//
// We simulate the steals on a clone so that two slots drawing
// from the same source stack see consistent state.
function try_assemble(
    board: Board, triple: Threesome, all_cards: Card[],
): Card[] | undefined {
    const sim = clone_board(board);
    const chosen: Card[] = [];
    const chosen_set = new Set<Card>();

    for (const slot of triple.cards) {
        let pick: Card | undefined;

        // First try the hand / orphan pile.
        for (const c of all_cards) {
            if (chosen_set.has(c)) continue;
            if (c.value !== slot.value || c.suit !== slot.suit) continue;
            const stack = sim.location.get(c);
            if (!stack) continue;
            if (stack.length < 3) { pick = c; break; }
        }

        // Fallback: politely peel from a valid 3+ stack.
        if (!pick) {
            for (const c of all_cards) {
                if (chosen_set.has(c)) continue;
                if (c.value !== slot.value || c.suit !== slot.suit) continue;
                const stack = sim.location.get(c);
                if (!stack) continue;
                if (can_politely_steal(stack, c)) { pick = c; break; }
            }
        }

        if (!pick) return undefined;
        chosen.push(pick);
        chosen_set.add(pick);
        steal_one_card(sim, pick);
    }
    return chosen;
}

// Apply a successful triple commit to the real board: steal
// each chosen card, then push the triple as a new stack.
function commit_triple(board: Board, chosen: Card[]): void {
    for (const c of chosen) steal_one_card(board, c);
    const new_stack = chosen.slice();
    board.stacks.push(new_stack);
    for (const c of new_stack) board.location.set(c, new_stack);
}

// Score the board: pure run = n*100, set = n*60, rb run = n*50,
// anything else = 0. Flat per-card scoring (mirrors the production
// Score.for_stack and threesome_solver.score_board).
function score_board(b: Board): number {
    let total = 0;
    for (const stack of b.stacks) {
        if (stack.length < 3) continue;
        const t = get_stack_type(stack);
        const tv =
            t === CardStackType.PURE_RUN ? 100 :
            t === CardStackType.SET ? 60 :
            t === CardStackType.RED_BLACK_RUN ? 50 : 0;
        total += stack.length * tv;
    }
    return total;
}

// Simulate committing the chosen cards as a triple on a clone
// of the board, and return (score_after - score_before).
function commit_delta(board: Board, chosen: Card[]): number {
    const sim = clone_board(board);
    const before = score_board(sim);
    commit_triple(sim, chosen);
    const after = score_board(sim);
    return after - before;
}

// --- Candidate filters ---
//
// A pattern is "already realized" if there's any current 3+ stack
// on the board that contains a physical card for every one of
// the pattern's three slots. Such a pattern is done — skip it.
function pattern_already_realized(board: Board, pattern: Threesome): boolean {
    for (const stack of board.stacks) {
        if (stack.length < 3) continue;
        let all_in = true;
        for (const slot of pattern.cards) {
            const found = stack.some((c) =>
                c.value === slot.value && c.suit === slot.suit);
            if (!found) { all_in = false; break; }
        }
        if (all_in) return true;
    }
    return false;
}

// A pattern is a candidate only if at least one of its slots is
// currently held by a card sitting in a stack of size < 3 (i.e.
// an "unplayed" card).
function pattern_has_unplayed_slot(
    board: Board, pattern: Threesome, all_cards: Card[],
): boolean {
    for (const slot of pattern.cards) {
        for (const c of all_cards) {
            if (c.value !== slot.value || c.suit !== slot.suit) continue;
            const stack = board.location.get(c);
            if (stack && stack.length < 3) return true;
        }
    }
    return false;
}

// --- Per-puzzle greedy loop ---

type PassResult = {
    wins: number;
    placed: number;
    total_unplayed: number;
    start_score: number;
    final_score: number;
};

function run_one_puzzle(p: Puzzle): PassResult {
    const all_cards: Card[] = [];
    const initial_stacks: Card[][] = [];
    for (const stack of p.board) {
        const cards = stack.cards.map(parse_card);
        for (const c of cards) all_cards.push(c);
        initial_stacks.push(cards);
    }
    for (const label of p.hand) {
        const c = parse_card(label);
        all_cards.push(c);
        initial_stacks.push([c]);
    }

    const board = make_board(initial_stacks);
    const all_threesomes = compute_threesomes(all_cards);

    // Deduped pattern universe (deck-agnostic). Fixed for the
    // whole puzzle — the candidate filters re-evaluate per round.
    const all_patterns = [...new Set<Threesome>(
        [...all_threesomes.values()].flat(),
    )];

    const count_unplayed = (b: Board) =>
        b.stacks.filter((s) => s.length < 3)
            .reduce((sum, s) => sum + s.length, 0);
    const total_unplayed = count_unplayed(board);
    const start_score = score_board(board);

    // Greedy loop: each round, find every polite assembly, score
    // its delta, commit the best one. Stop when nothing qualifies.
    let wins = 0;
    while (true) {
        let best: { triple: Threesome; chosen: Card[]; delta: number } | undefined;
        for (const t of all_patterns) {
            if (!pattern_has_unplayed_slot(board, t, all_cards)) continue;
            if (pattern_already_realized(board, t)) continue;
            const chosen = try_assemble(board, t, all_cards);
            if (!chosen) continue;
            const delta = commit_delta(board, chosen);
            if (!best || delta > best.delta) {
                best = { triple: t, chosen, delta };
            }
        }
        if (!best) break;
        commit_triple(board, best.chosen);
        wins++;
    }

    const placed = total_unplayed - count_unplayed(board);
    return {
        wins,
        placed,
        total_unplayed,
        start_score,
        final_score: score_board(board),
    };
}

// --- Drive all 48 puzzles ---

console.log(`Greedy polite-steal report on ${puzzles.length} puzzles\n`);
console.log("  #  Cards  Hand  Wins  Placed/Unplayed  StartScore  FinalScore  Fully");
console.log("-".repeat(72));

let total_wins = 0;
let total_placed = 0;
let total_unplayed_all = 0;
let total_score_gain = 0;
let fully_solved = 0;
let any_progress = 0;

for (let i = 0; i < puzzles.length; i++) {
    const p = puzzles[i];
    const r = run_one_puzzle(p);
    total_wins += r.wins;
    total_placed += r.placed;
    total_unplayed_all += r.total_unplayed;
    total_score_gain += r.final_score - r.start_score;
    const fully = r.placed === r.total_unplayed && r.total_unplayed > 0;
    if (fully) fully_solved++;
    if (r.placed > 0) any_progress++;
    console.log(
        String(i + 1).padStart(3) + "  " +
        String(p.total_cards).padStart(5) + "  " +
        String(p.hand_size).padStart(4) + "  " +
        String(r.wins).padStart(4) + "  " +
        (String(r.placed) + "/" + r.total_unplayed).padStart(15) + "  " +
        String(r.start_score).padStart(10) + "  " +
        String(r.final_score).padStart(10) + "  " +
        (fully ? "✓" : "")
    );
}

console.log("-".repeat(72));
console.log(`Total triples landed:              ${total_wins}`);
console.log(`Total unplayed cards placed:       ${total_placed}/${total_unplayed_all}`);
console.log(`Total score gained:                +${total_score_gain}`);
console.log(`Puzzles fully solved:              ${fully_solved}/${puzzles.length}`);
console.log(`Puzzles with any progress:         ${any_progress}/${puzzles.length}`);
