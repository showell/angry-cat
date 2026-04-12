// Play a full two-player game as a "smart human" — uses all the
// human-like hint levels (split-for-set, split-and-inject,
// peel-for-run, pair-peel) but NOT the graph solver.
//
// Records board state at every clean point.

import * as fs from "fs";
import { Card, CardValue, OriginDeck, Suit, value_str, is_pair_of_dups } from "../core/card";
import {
    BoardCard, BoardCardState, CardStack, HandCard, HandCardState,
    type BoardLocation,
} from "../core/card_stack";
import { get_test_deck } from "../core/test_deck";
import {
    get_hint, can_extract, join_adjacent_runs,
    HintLevel, assert_never,
    type HandStack, type LooseCardPlay, find_rearrangement_plays,
} from "./hints";
import { execute_complex_hint } from "./execute_complex";
import { CardStackType, get_stack_type, predecessor, successor } from "../core/stack_type";
import { is_pair_of_dups as is_dup } from "../core/card";
import { do_obvious_board_improvements } from "../strategy/board_improve";
import { Score } from "../core/score";

const loc: BoardLocation = { top: 0, left: 0 };
const suit_letter: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
// For JSON serialization — includes deck tag.
function card_data(c: Card): string {
    const deck = c.origin_deck === OriginDeck.DECK_ONE ? "1" : "2";
    return value_str(c.value) + suit_letter[c.suit] + ":" + deck;
}
// For human-readable console output — no deck tag.
function card_str(c: Card): string {
    return value_str(c.value) + suit_letter[c.suit];
}
function hc_str(hc: HandCard): string { return card_str(hc.card); }

// --- Deck helpers ---

function pull_card(deck: Card[], label: string, origin: OriginDeck): Card {
    const target = Card.from(label, origin);
    const idx = deck.findIndex((c) =>
        c.value === target.value && c.suit === target.suit && c.origin_deck === target.origin_deck);
    if (idx < 0) throw new Error(`Card ${label}:${origin} not in deck`);
    return deck.splice(idx, 1)[0];
}

function deal(deck: Card[], n: number): HandCard[] {
    const cards: HandCard[] = [];
    for (let i = 0; i < n && deck.length > 0; i++) {
        cards.push(new HandCard(deck.shift()!, HandCardState.NORMAL));
    }
    return cards;
}

// --- Snapshot ---

type BoardSnapshot = {
    turn: number;
    player: number;
    moment: string;
    cards_on_board: number;
    stacks: { cards: string[]; type: string }[];
    all_board_cards: string[];
    hand_sizes: [number, number];
    deck_remaining: number;
};

function is_clean(board: CardStack[]): boolean {
    for (const s of board) {
        if (s.incomplete() || s.problematic()) return false;
    }
    return true;
}

function snap(
    turn: number, player: number, moment: string,
    board: CardStack[], hands: [HandCard[], HandCard[]], deck_size: number,
): BoardSnapshot {
    const all: string[] = [];
    const stacks = board.map((s) => {
        const cards = s.get_cards().map(card_data);
        for (const c of cards) all.push(c);
        return { cards, type: s.get_stack_type() };
    });
    return {
        turn, player, moment,
        cards_on_board: all.length, stacks, all_board_cards: all,
        hand_sizes: [hands[0].length, hands[1].length],
        deck_remaining: deck_size,
    };
}

function maybe_record(
    snapshots: BoardSnapshot[], turn: number, player: number,
    moment: string, board: CardStack[], hands: [HandCard[], HandCard[]], deck_size: number,
): void {
    if (board.length > 0 && is_clean(board)) {
        snapshots.push(snap(turn, player, moment, board, hands, deck_size));
    }
}


// --- Setup ---

const deck = get_test_deck();

const INITIAL_STACKS = [
    ["KS","AS","2S","3S"], ["TD","JD","QD","KD"],
    ["2H","3H","4H"], ["7S","7D","7C"],
    ["AC","AD","AH"], ["2C","3D","4C","5H","6S","7H"],
];

const board: CardStack[] = [];
for (const labels of INITIAL_STACKS) {
    const cards = labels.map((l) => pull_card(deck, l, OriginDeck.DECK_ONE));
    board.push(new CardStack(
        cards.map((c) => new BoardCard(c, BoardCardState.FIRMLY_ON_BOARD)), loc));
}

const hands: [HandCard[], HandCard[]] = [deal(deck, 15), deal(deck, 15)];

console.log(`Setup: board ${board.length} stacks (${board.reduce((s, st) => s + st.size(), 0)} cards), deck ${deck.length}`);
console.log(`  P0: ${hands[0].map(hc_str).join(" ")}`);
console.log(`  P1: ${hands[1].map(hc_str).join(" ")}`);

// --- Play ---

const snapshots: BoardSnapshot[] = [];
let consecutive_stuck = 0;

maybe_record(snapshots, 0, -1, "initial", board, hands, deck.length);

for (let turn = 1; turn <= 200; turn++) {
    const p = (turn - 1) % 2;
    let played = 0;

    // Board cleanup before looking for plays.
    {
        const cleaned = join_adjacent_runs(board);
        if (cleaned.changed) {
            board.length = 0;
            for (const s of cleaned.board) board.push(s);
        }
    }

    // Play loop: ask get_hint for the best move, execute it, repeat.
    while (hands[p].length > 0) {
        const hint = get_hint(hands[p], board);

        if (hint.level === HintLevel.NO_MOVES ||
            hint.level === HintLevel.REARRANGE_PLAY) {
            // Human doesn't use the graph solver. Stop.
            break;
        }

        // Single executor for every level (was duplicated with play_game's
        // own copies; see insights/hint_system_process.md).
        const played_cards = execute_complex_hint(hint, board);
        if (played_cards.length === 0) break;

        const used = new Set(played_cards);
        hands[p] = hands[p].filter((hc) => !used.has(hc));
        played += played_cards.length;

        maybe_record(snapshots, turn, p, hint.level, board, hands, deck.length);
    }

    // End-of-turn score optimization.
    {
        const improved = do_obvious_board_improvements(board);
        if (improved.upgrades_applied > 0) {
            board.length = 0;
            for (const s of improved.board) board.push(s);
        }
    }

    maybe_record(snapshots, turn, p, "end", board, hands, deck.length);

    if (turn <= 10) {
        console.log(`  Turn ${turn} P${p}: played ${played}, hand ${hands[p].length}, board ${board.reduce((s, st) => s + st.size(), 0)}`);
        if (played === 0) console.log(`    Stuck: ${hands[p].map(hc_str).join(" ")}`);
    }

    // Draw.
    if (played === 0) {
        hands[p] = hands[p].concat(deal(deck, 3));
        consecutive_stuck++;
    } else if (hands[p].length === 0) {
        hands[p] = hands[p].concat(deal(deck, 5));
        consecutive_stuck = 0;
    } else {
        consecutive_stuck = 0;
    }

    if (hands[0].length === 0 && hands[1].length === 0) break;
    if (consecutive_stuck >= 4) break;
}

// Final score optimization: now that all cards are placed, optimize
// the board arrangement without worrying about future plays.
{
    const before = Score.for_stacks(board);
    const improved = do_obvious_board_improvements(board);
    if (improved.upgrades_applied > 0) {
        board.length = 0;
        for (const s of improved.board) board.push(s);
        const after = Score.for_stacks(board);
        console.log(`\nFinal optimization: ${improved.upgrades_applied} upgrades, score ${before} → ${after} (+${after - before})`);
    }
}

// --- Summary ---

const on_board = board.reduce((s, st) => s + st.size(), 0);
console.log(`\nGame over: ${on_board} on board, P0 hand ${hands[0].length}, P1 hand ${hands[1].length}, deck ${deck.length}`);
console.log(`Snapshots: ${snapshots.length}`);

let prev = -1;
for (const s of snapshots) {
    if (s.cards_on_board !== prev) {
        prev = s.cards_on_board;
        const bar = "█".repeat(Math.ceil(s.cards_on_board / 3));
        console.log(`  T${String(s.turn).padStart(2)} P${s.player} ${s.moment.padEnd(12)} ${String(s.cards_on_board).padStart(3)} cards ${bar}`);
    }
}

// Final stuck card analysis.
for (let p = 0; p < 2; p++) {
    if (hands[p].length === 0) continue;
    console.log(`\n  P${p} stuck cards:`);
    for (const hc of hands[p]) {
        const c = hc.card;
        const dk = c.origin_deck === OriginDeck.DECK_ONE ? "D1" : "D2";

        // Is the dup on the board?
        let dup_on_board = false;
        for (const stack of board) {
            for (const bc of stack.get_cards()) {
                if (is_pair_of_dups(c, bc)) { dup_on_board = true; break; }
            }
            if (dup_on_board) break;
        }

        // What does rearrange say?
        const rearrange = find_rearrangement_plays([hc], board);

        console.log(`    ${card_str(c)}:${dk} — dup on board: ${dup_on_board}, rearrange: ${rearrange.length > 0 ? "YES" : "no"}`);
    }
}

// Show board organized by type.
console.log(`\n  Final board (${board.length} stacks):`);
const pr = board.filter(s => s.get_stack_type() === CardStackType.PURE_RUN)
    .sort((a,b) => a.get_cards()[0].suit - b.get_cards()[0].suit);
const rb = board.filter(s => s.get_stack_type() === CardStackType.RED_BLACK_RUN);
const sets = board.filter(s => s.get_stack_type() === CardStackType.SET)
    .sort((a,b) => a.get_cards()[0].value - b.get_cards()[0].value);
const other = board.filter(s => {
    const t = s.get_stack_type();
    return t !== CardStackType.PURE_RUN && t !== CardStackType.RED_BLACK_RUN && t !== CardStackType.SET;
});
if (pr.length) { console.log("    Pure runs:"); for (const s of pr) console.log(`      [${s.get_cards().map(card_str).join(" ")}]`); }
if (rb.length) { console.log("    Red/black:"); for (const s of rb) console.log(`      [${s.get_cards().map(card_str).join(" ")}]`); }
if (sets.length) { console.log("    Sets:"); for (const s of sets) console.log(`      [${s.get_cards().map(card_str).join(" ")}]`); }
if (other.length) { console.log("    Other:"); for (const s of other) console.log(`      [${s.get_cards().map(card_str).join(" ")}] (${s.get_stack_type()})`); }

fs.writeFileSync("src/lyn_rummy/game_boards.json", JSON.stringify(snapshots, null, 2));
console.log(`\nWritten ${snapshots.length} snapshots to game_boards.json`);
