// Stuck scenarios from the two-player game simulation.
//
// For each turn where a player got stuck (played 0 cards), capture
// the board + hand. Then test whether the REARRANGE_PLAY hint
// level can find plays the intermediate player missed.
//
// This is both a regression test (locks in current behavior) and
// a measure of how much the expert hint engine improves play.

import assert from "node:assert/strict";
import * as fs from "fs";
import { Card, CardValue, OriginDeck, Suit, value_str, is_pair_of_dups } from "./card";
import {
    BoardCard, BoardCardState, CardStack, HandCard, HandCardState,
    type BoardLocation,
} from "./card_stack";
import { successor } from "./stack_type";
import { get_test_deck } from "./test_deck";
import {
    get_hint, find_rearrangement_plays, find_playable_hand_cards,
    find_split_for_set_plays, find_split_and_inject_plays,
    find_peel_for_run_plays, find_pair_peel_plays, find_pair_dissolve_plays,
    HintLevel,
} from "./hints";
import { solve as graph_solve, STRATEGY_PREFER_RUNS } from "./reassemble_graph";

const loc: BoardLocation = { top: 0, left: 0 };
const suit_letter: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
function card_str(c: Card): string { return value_str(c.value) + suit_letter[c.suit]; }
function hc_str(hc: HandCard): string { return card_str(hc.card); }

// --- Replay game to capture stuck turns ---

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

function find_hand_sets(hand: HandCard[]): HandCard[][] {
    const by_value = new Map<CardValue, HandCard[]>();
    for (const hc of hand) {
        if (!by_value.has(hc.card.value)) by_value.set(hc.card.value, []);
        by_value.get(hc.card.value)!.push(hc);
    }
    const results: HandCard[][] = [];
    for (const group of by_value.values()) {
        const by_suit = new Map<Suit, HandCard>();
        for (const hc of group) {
            if (!by_suit.has(hc.card.suit)) by_suit.set(hc.card.suit, hc);
        }
        const unique = [...by_suit.values()];
        if (unique.length >= 3) results.push(unique.slice(0, 4));
    }
    return results;
}

function find_hand_runs(hand: HandCard[]): HandCard[][] {
    const results: HandCard[][] = [];
    const by_suit = new Map<Suit, HandCard[]>();
    for (const hc of hand) {
        if (!by_suit.has(hc.card.suit)) by_suit.set(hc.card.suit, []);
        by_suit.get(hc.card.suit)!.push(hc);
    }
    for (const suited of by_suit.values()) {
        suited.sort((a, b) => a.card.value - b.card.value);
        let run: HandCard[] = [suited[0]];
        for (let i = 1; i < suited.length; i++) {
            const prev = run[run.length - 1];
            const curr = suited[i];
            if (curr.card.value === successor(prev.card.value) &&
                !is_pair_of_dups(prev.card, curr.card)) {
                run.push(curr);
            } else if (is_pair_of_dups(prev.card, curr.card)) {
                continue;
            } else {
                if (run.length >= 3) results.push(run);
                run = [curr];
            }
        }
        if (run.length >= 3) results.push(run);
    }
    return results;
}

function try_direct_play(hand: HandCard[], board: CardStack[]): HandCard | undefined {
    for (const hc of hand) {
        const single = CardStack.from_hand_card(hc, loc);
        for (let i = 0; i < board.length; i++) {
            const merged = board[i].left_merge(single) ?? board[i].right_merge(single);
            if (merged) { board[i] = merged; return hc; }
        }
    }
    return undefined;
}

// --- Replay ---

type StuckTurn = {
    turn: number;
    player: number;
    hand: HandCard[];
    board: CardStack[];
    board_card_count: number;
};

const INITIAL_STACKS = [
    ["KS","AS","2S","3S"], ["TD","JD","QD","KD"],
    ["2H","3H","4H"], ["7S","7D","7C"],
    ["AC","AD","AH"], ["2C","3D","4C","5H","6S","7H"],
];

const deck = get_test_deck();
const board: CardStack[] = [];
for (const labels of INITIAL_STACKS) {
    const cards = labels.map((l) => pull_card(deck, l, OriginDeck.DECK_ONE));
    board.push(new CardStack(
        cards.map((c) => new BoardCard(c, BoardCardState.FIRMLY_ON_BOARD)), loc));
}
const hands: [HandCard[], HandCard[]] = [deal(deck, 15), deal(deck, 15)];

const stuck_turns: StuckTurn[] = [];
let consecutive_stuck = 0;

for (let turn = 1; turn <= 200; turn++) {
    const p = (turn - 1) % 2;
    let played = 0;

    let progress = true;
    while (progress && hands[p].length > 0) {
        progress = false;

        for (const group of [...find_hand_sets(hands[p]), ...find_hand_runs(hands[p])]) {
            const bc = group.map((hc) => new BoardCard(hc.card, BoardCardState.FRESHLY_PLAYED));
            board.push(new CardStack(bc, loc));
            const used = new Set(group);
            hands[p] = hands[p].filter((hc) => !used.has(hc));
            played += group.length;
            progress = true;
            break;
        }
        if (progress) continue;

        const hc = try_direct_play(hands[p], board);
        if (hc) {
            hands[p] = hands[p].filter((h) => h !== hc);
            played++;
            progress = true;
        }
    }

    if (played === 0 && hands[p].length > 0) {
        // Stuck! Capture state before drawing.
        const board_cards = board.reduce((s, st) => s + st.size(), 0);
        stuck_turns.push({
            turn, player: p,
            hand: [...hands[p]],
            board: board.map((s) => s.clone()),
            board_card_count: board_cards,
        });
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

// --- Analyze stuck turns ---

console.log(`Stuck turns captured: ${stuck_turns.length}\n`);

let total_hand_cards = 0;
let total_rearrange_plays = 0;

console.log(
    "Turn".padStart(4) + " P" +
    "Board".padStart(6) +
    "Hand".padStart(5) +
    "  Expert finds" +
    "  Stuck cards"
);
console.log("-".repeat(75));

for (const st of stuck_turns) {
    const hand = st.hand;

    // Confirm intermediate player truly can't play (no hand stacks,
    // no direct plays).
    const sets = find_hand_sets(hand);
    const runs = find_hand_runs(hand);
    const direct = find_playable_hand_cards(hand, st.board);
    assert.equal(sets.length, 0, `Turn ${st.turn}: should have no hand sets`);
    assert.equal(runs.length, 0, `Turn ${st.turn}: should have no hand runs`);
    assert.equal(direct.length, 0, `Turn ${st.turn}: should have no direct plays`);

    // Ask all expert-level engines.
    const split_plays = find_split_for_set_plays(hand, st.board);
    const inject_plays = find_split_and_inject_plays(hand, st.board);
    const peel_run_plays = find_peel_for_run_plays(hand, st.board);
    const pair_plays = find_pair_peel_plays(hand, st.board);
    const pair_dissolve = find_pair_dissolve_plays(hand, st.board);
    const rearrange_plays = find_rearrangement_plays(hand, st.board);
    const rearrange_hand_cards = rearrange_plays.map((p) => p.hand_card);
    const all_expert = new Set([...split_plays, ...inject_plays, ...peel_run_plays, ...pair_plays, ...pair_dissolve, ...rearrange_hand_cards]);
    const expert_plays = [...all_expert];
    const expert_labels = expert_plays.map(hc_str);
    const stuck_labels = hand
        .filter((hc) => !all_expert.has(hc))
        .map(hc_str);

    total_hand_cards += hand.length;
    total_rearrange_plays += expert_plays.length;

    console.log(
        String(st.turn).padStart(4) + ` ${st.player}` +
        String(st.board_card_count).padStart(6) +
        String(hand.length).padStart(5) +
        `  ${expert_labels.join(", ") || "(none)"}`.padEnd(30) +
        `  ${stuck_labels.join(", ")}`
    );
}

console.log(`\n--- Summary ---`);
console.log(`Stuck turns: ${stuck_turns.length}`);
console.log(`Total hand cards at stuck turns: ${total_hand_cards}`);
console.log(`Expert could play: ${total_rearrange_plays}`);
console.log(`Truly stuck: ${total_hand_cards - total_rearrange_plays}`);
console.log(`Expert play rate: ${(100 * total_rearrange_plays / total_hand_cards).toFixed(0)}%`);

// --- Deep dive on Turn 40 ---
{
    const t40 = stuck_turns.find((st) => st.turn === 40)!;
    console.log(`\n=== Turn 40 Deep Dive ===`);
    console.log(`  Player: ${t40.player}`);
    console.log(`  Board: ${t40.board_card_count} cards, ${t40.board.length} stacks`);
    console.log(`  Hand (${t40.hand.length}): ${t40.hand.map(hc_str).join(", ")}`);

    console.log(`\n  Board stacks:`);
    for (let i = 0; i < t40.board.length; i++) {
        const s = t40.board[i];
        const cards = s.get_cards().map(card_str).join(" ");
        console.log(`    [${i}] [${cards}] (${s.get_stack_type()})`);
    }

    console.log(`\n  Per-card analysis:`);
    for (const hc of t40.hand) {
        const label = hc_str(hc);

        // Check each level.
        const direct = find_playable_hand_cards([hc], t40.board);
        const split_set = find_split_for_set_plays([hc], t40.board);
        // Pair peel needs the full hand context (looks for pairs).
        const pair_peel = find_pair_peel_plays(t40.hand, t40.board);
        const in_pair_peel = pair_peel.some((pp) => pp === hc);
        const rearrange = find_rearrangement_plays([hc], t40.board).map((p) => p.hand_card);

        const status = direct.length > 0 ? "DIRECT" :
                       split_set.length > 0 ? "SPLIT_SET" :
                       in_pair_peel ? "PAIR_PEEL" :
                       rearrange.length > 0 ? "REARRANGE" : "STUCK";
        console.log(`    ${label.padEnd(4)} → ${status}`);

        if (status === "REARRANGE") {
            // Show what the solver found.
            const board_cards: Card[] = [];
            for (const s of t40.board) {
                for (const c of s.get_cards()) board_cards.push(c);
            }
            const pool = [...board_cards, hc.card];
            const solution = graph_solve(pool, STRATEGY_PREFER_RUNS);

            // Find which group contains the hand card.
            for (const g of solution.groups) {
                if (g.cards.some((c) => c === hc.card)) {
                    console.log(`          joins: [${g.cards.map(card_str).join(" ")}] (${g.type})`);
                    break;
                }
            }
        }
    }
}

// Lock in the current counts as a regression test.
console.log(`\nRegression check:`);
assert.equal(stuck_turns.length, 22, "expected 22 stuck turns");
assert.equal(total_rearrange_plays, 166,
    "expected 166 expert plays (split + inject + peel_run + pair + rearrange)");
console.log(`  Stuck turns: ${stuck_turns.length} ✓`);
console.log(`  Expert plays: ${total_rearrange_plays} ✓`);

console.log("\nAll stuck tests passed.");
