// Play a full two-player game as a "smart human" — uses all the
// human-like hint levels (split-for-set, split-and-inject,
// peel-for-run, pair-peel) but NOT the graph solver.
//
// Records board state at every clean point.

import * as fs from "fs";
import { Card, CardValue, OriginDeck, Suit, value_str, is_pair_of_dups } from "./card";
import {
    BoardCard, BoardCardState, CardStack, HandCard, HandCardState,
    type BoardLocation,
} from "./card_stack";
import { get_test_deck } from "./test_deck";
import {
    get_hint, can_extract, join_adjacent_runs,
    HintLevel,
} from "./hints";
import { CardStackType, get_stack_type, predecessor, successor } from "./stack_type";
import { is_pair_of_dups as is_dup } from "./card";
import { do_obvious_board_improvements } from "./board_improve";
import { Score } from "./score";

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

// --- Execute a play on the board ---
// These functions mutate `board` and return the cards played,
// or undefined if the play couldn't execute.

function play_hand_stack(
    hand_stack: HandStack,
    hands_p: HandCard[],
    board: CardStack[],
): HandCard[] {
    const bc = hand_stack.cards.map((hc) =>
        new BoardCard(hc.card, BoardCardState.FRESHLY_PLAYED));
    board.push(new CardStack(bc, loc));
    const used = new Set(hand_stack.cards);
    return hand_stack.cards;
}

function play_direct(hc: HandCard, board: CardStack[]): boolean {
    const single = CardStack.from_hand_card(hc, loc);
    for (let i = 0; i < board.length; i++) {
        const merged = board[i].left_merge(single) ?? board[i].right_merge(single);
        if (merged) { board[i] = merged; return true; }
    }
    return false;
}

function play_loose(play: LooseCardPlay, hand: HandCard[], board: CardStack[]): HandCard | undefined {
    const hc = play.playable_cards[0];
    // Apply the board rearrangement.
    board.length = 0;
    for (const s of play.resulting_board) board.push(s);
    // Now merge the hand card.
    const single = CardStack.from_hand_card(hc, loc);
    for (let i = 0; i < board.length; i++) {
        const merged = board[i].left_merge(single) ?? board[i].right_merge(single);
        if (merged) { board[i] = merged; return hc; }
    }
    return undefined;
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

// --- Execution of human-like plays ---
//
// Each function modifies `board` in place and returns success/failure.
// The detection functions already confirmed the play is valid;
// these just do the mechanical board manipulation.

// Extract a card from a stack, splitting if needed. Returns the
// extracted BoardCard and modifies board in place.
function extract_card(board: CardStack[], stack_idx: number, card_idx: number): BoardCard | undefined {
    const stack = board[stack_idx];
    const cards = stack.board_cards;
    const size = cards.length;
    const st = stack.get_stack_type();

    // End peel.
    if (card_idx === 0 && size >= 4) {
        board[stack_idx] = new CardStack(cards.slice(1), loc);
        return cards[0];
    }
    if (card_idx === size - 1 && size >= 4) {
        board[stack_idx] = new CardStack(cards.slice(0, -1), loc);
        return cards[size - 1];
    }

    // Set: remove any card from a 4-card set.
    if (st === CardStackType.SET && size >= 4) {
        const remaining = cards.filter((_, i) => i !== card_idx);
        board[stack_idx] = new CardStack(remaining, loc);
        return cards[card_idx];
    }

    // Middle split: replace the stack with two halves.
    if (card_idx >= 3 && (size - card_idx - 1) >= 3) {
        const left = new CardStack(cards.slice(0, card_idx), loc);
        const right = new CardStack(cards.slice(card_idx + 1), loc);
        board[stack_idx] = left;
        board.push(right);
        return cards[card_idx];
    }

    return undefined;
}

// Split for set: find same-value peelable cards, extract 2, form
// a 3-card set with the hand card.
function execute_split_for_set(hc: HandCard, hand: HandCard[], board: CardStack[]): boolean {
    const v = hc.card.value;
    const hc_suit = hc.card.suit;
    const extracted: BoardCard[] = [];

    // Collect extractable same-value cards with distinct suits.
    const candidates: { si: number; ci: number; suit: Suit }[] = [];
    for (let si = 0; si < board.length; si++) {
        const cards = board[si].get_cards();
        for (let ci = 0; ci < cards.length; ci++) {
            if (cards[ci].value === v && cards[ci].suit !== hc_suit &&
                !is_dup(cards[ci], hc.card) && can_extract(board[si], ci)) {
                candidates.push({ si, ci, suit: cards[ci].suit });
            }
        }
    }

    // Pick 2 with distinct suits.
    const suits_used = new Set([hc_suit]);
    const to_extract: { si: number; ci: number }[] = [];
    for (const c of candidates) {
        if (!suits_used.has(c.suit)) {
            suits_used.add(c.suit);
            to_extract.push({ si: c.si, ci: c.ci });
            if (to_extract.length >= 2) break;
        }
    }
    if (to_extract.length < 2) return false;

    // Extract in reverse order of stack index to avoid index shifts.
    to_extract.sort((a, b) => b.si - a.si || b.ci - a.ci);
    for (const { si, ci } of to_extract) {
        const bc = extract_card(board, si, ci);
        if (bc) extracted.push(bc);
    }

    if (extracted.length < 2) return false;

    // Form the new set.
    const set_cards = [
        new BoardCard(hc.card, BoardCardState.FRESHLY_PLAYED),
        ...extracted,
    ];
    board.push(new CardStack(set_cards, loc));
    return true;
}

// Split and inject: split a run, hand card joins one half.
function execute_split_and_inject(hc: HandCard, board: CardStack[]): boolean {
    for (let si = 0; si < board.length; si++) {
        const stack = board[si];
        const st = stack.get_stack_type();
        if (st !== CardStackType.PURE_RUN && st !== CardStackType.RED_BLACK_RUN) continue;

        const cards = stack.board_cards;
        const size = cards.length;

        for (let split = 2; split <= size - 2; split++) {
            const left = new CardStack(cards.slice(0, split), loc);
            const right = new CardStack(cards.slice(split), loc);
            if (left.problematic() || right.problematic()) continue;

            const single = CardStack.from_hand_card(hc, loc);

            // Hand card extends right on the left.
            if (!left.incomplete()) {
                const extended = right.left_merge(single);
                if (extended && !extended.incomplete() && !extended.problematic()) {
                    board[si] = left;
                    board.push(extended);
                    return true;
                }
            }

            // Hand card extends left on the right.
            if (!right.incomplete()) {
                const extended = left.right_merge(single);
                if (extended && !extended.incomplete() && !extended.problematic()) {
                    board[si] = extended;
                    board.push(right);
                    return true;
                }
            }
        }
    }
    return false;
}

// Peel for run: find two peelable board cards adjacent to hand card, form a run.
function execute_peel_for_run(hc: HandCard, board: CardStack[]): boolean {
    const v = hc.card.value;
    const prev = predecessor(v);
    const next = v + 1; // successor

    // Find peelable neighbors.
    type Candidate = { si: number; ci: number; card: Card };
    const neighbors: Candidate[] = [];

    for (let si = 0; si < board.length; si++) {
        const cards = board[si].get_cards();
        for (let ci = 0; ci < cards.length; ci++) {
            const bc = cards[ci];
            if (is_dup(bc, hc.card)) continue;
            if (bc.value === predecessor(v) || bc.value === successor(v)) {
                if (can_extract(board[si], ci)) {
                    neighbors.push({ si, ci, card: bc });
                }
            }
        }
    }

    // Try pairs that form a valid 3-card run with the hand card.
    for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
            if (neighbors[i].si === neighbors[j].si) continue;

            const triple = [neighbors[i].card, hc.card, neighbors[j].card]
                .sort((a, b) => a.value - b.value);
            const st = get_stack_type(triple);
            if (st !== CardStackType.PURE_RUN && st !== CardStackType.RED_BLACK_RUN) continue;

            // Extract both (higher index first to avoid shifts).
            const extracts = [neighbors[i], neighbors[j]].sort((a, b) => b.si - a.si || b.ci - a.ci);
            const extracted: BoardCard[] = [];
            for (const ex of extracts) {
                const bc = extract_card(board, ex.si, ex.ci);
                if (bc) extracted.push(bc);
            }
            if (extracted.length < 2) continue;

            // Form the new run.
            const run_cards = [
                new BoardCard(hc.card, BoardCardState.FRESHLY_PLAYED),
                ...extracted,
            ].sort((a, b) => a.card.value - b.card.value);
            const new_stack = new CardStack(run_cards, loc);
            if (!new_stack.incomplete() && !new_stack.problematic()) {
                board.push(new_stack);
                return true;
            }
        }
    }
    return false;
}

// Pair peel: find a hand pair + one peelable board card = new group.
function execute_pair_peel(playable: HandCard[], hand: HandCard[], board: CardStack[]): HandCard[] {
    // Enumerate hand pairs from the playable set.
    for (let i = 0; i < playable.length; i++) {
        for (let j = i + 1; j < playable.length; j++) {
            const a = playable[i].card;
            const b = playable[j].card;
            if (is_dup(a, b)) continue;

            // Set pair: same value different suit.
            if (a.value === b.value && a.suit !== b.suit) {
                const needed_suits = [Suit.HEART, Suit.SPADE, Suit.DIAMOND, Suit.CLUB]
                    .filter((s) => s !== a.suit && s !== b.suit);
                for (let si = 0; si < board.length; si++) {
                    const cards = board[si].get_cards();
                    for (let ci = 0; ci < cards.length; ci++) {
                        const bc = cards[ci];
                        if (bc.value === a.value && needed_suits.includes(bc.suit) &&
                            can_extract(board[si], ci)) {
                            const extracted = extract_card(board, si, ci);
                            if (extracted) {
                                board.push(new CardStack([
                                    new BoardCard(a, BoardCardState.FRESHLY_PLAYED),
                                    new BoardCard(b, BoardCardState.FRESHLY_PLAYED),
                                    extracted,
                                ], loc));
                                return [playable[i], playable[j]];
                            }
                        }
                    }
                }
            }

            // Run pair: same suit, consecutive.
            if (a.suit === b.suit) {
                const lo = a.value < b.value ? a : b;
                const hi = a.value < b.value ? b : a;
                if (hi.value !== successor(lo.value)) continue;

                // Need predecessor of lo or successor of hi.
                const needed = [
                    { value: predecessor(lo.value), suit: lo.suit },
                    { value: successor(hi.value), suit: hi.suit },
                ];
                for (const need of needed) {
                    for (let si = 0; si < board.length; si++) {
                        const cards = board[si].get_cards();
                        for (let ci = 0; ci < cards.length; ci++) {
                            const bc = cards[ci];
                            if (bc.value === need.value && bc.suit === need.suit &&
                                can_extract(board[si], ci)) {
                                const extracted = extract_card(board, si, ci);
                                if (extracted) {
                                    const run = [
                                        new BoardCard(a, BoardCardState.FRESHLY_PLAYED),
                                        new BoardCard(b, BoardCardState.FRESHLY_PLAYED),
                                        extracted,
                                    ].sort((x, y) => x.card.value - y.card.value);
                                    board.push(new CardStack(run, loc));
                                    return [playable[i], playable[j]];
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    return [];
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

        let executed = false;

        switch (hint.level) {
            case HintLevel.HAND_STACKS: {
                const group = hint.hand_stacks[0];
                play_hand_stack(group, hands[p], board);
                const used = new Set(group.cards);
                hands[p] = hands[p].filter((hc) => !used.has(hc));
                played += group.cards.length;
                executed = true;
                break;
            }

            case HintLevel.DIRECT_PLAY: {
                const hc = hint.playable_cards[0];
                play_direct(hc, board);
                hands[p] = hands[p].filter((h) => h !== hc);
                played++;
                executed = true;
                break;
            }

            case HintLevel.SWAP:
            case HintLevel.SPLIT_FOR_SET: {
                const hc = hint.playable_cards[0];
                if (execute_split_for_set(hc, hands[p], board)) {
                    hands[p] = hands[p].filter((h) => h !== hc);
                    played++;
                    executed = true;
                }
                break;
            }

            case HintLevel.LOOSE_CARD_PLAY: {
                const hc = play_loose(hint.plays[0], hands[p], board);
                if (hc) {
                    hands[p] = hands[p].filter((h) => h !== hc);
                    played++;
                    executed = true;
                }
                break;
            }

            case HintLevel.SPLIT_AND_INJECT: {
                const hc = hint.playable_cards[0];
                if (execute_split_and_inject(hc, board)) {
                    hands[p] = hands[p].filter((h) => h !== hc);
                    played++;
                    executed = true;
                }
                break;
            }

            case HintLevel.PEEL_FOR_RUN: {
                const hc = hint.playable_cards[0];
                if (execute_peel_for_run(hc, board)) {
                    hands[p] = hands[p].filter((h) => h !== hc);
                    played++;
                    executed = true;
                }
                break;
            }

            case HintLevel.PAIR_PEEL:
            case HintLevel.PAIR_DISSOLVE:
            case HintLevel.SIX_TO_FOUR: {
                const played_cards = execute_pair_peel(hint.playable_cards, hands[p], board);
                if (played_cards.length > 0) {
                    const used = new Set(played_cards);
                    hands[p] = hands[p].filter((h) => !used.has(h));
                    played += played_cards.length;
                    executed = true;
                }
                break;
            }
        }

        if (!executed) break;

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
