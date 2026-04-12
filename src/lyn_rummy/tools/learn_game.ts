// Play the same game three times, each time with a bigger bag of
// tricks. Shows how each trick a "human" learns increases their
// play count on the same deal.
//
//   Pass 1: only direct_play
//   Pass 2: direct_play + swap
//   Pass 3: direct_play + swap + pair_peel
//
// Usage: npx vite-node src/lyn_rummy/tools/learn_game.ts

import { Card, OriginDeck, Suit, value_str, build_full_double_deck } from "../core/card";
import {
    BoardCard, BoardCardState, CardStack, HandCard, HandCardState,
} from "../core/card_stack";
import { join_adjacent_runs } from "../hints/hints";
import { TrickBag } from "../tricks/bag";
import { direct_play } from "../tricks/direct_play";
import { swap } from "../tricks/swap";
import { pair_peel } from "../tricks/pair_peel";
import { TurnStatsRecorder } from "../tricks/stats";
import type { Trick } from "../tricks/trick";
import * as fs from "fs";

const DUMMY_LOC = { top: 0, left: 0 };
const suit_letter: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S", [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
const card_label = (c: Card) =>
    value_str(c.value) + suit_letter[c.suit] +
    (c.origin_deck === OriginDeck.DECK_TWO ? "ʹ" : "");

function pull(deck: Card[], label: string, origin: OriginDeck): Card {
    const t = Card.from(label, origin);
    const idx = deck.findIndex(c =>
        c.value === t.value && c.suit === t.suit && c.origin_deck === t.origin_deck);
    return deck.splice(idx, 1)[0];
}

function build_initial_board(deck: Card[]): CardStack[] {
    const sigs = [
        ["KS","AS","2S","3S"], ["TD","JD","QD","KD"],
        ["2H","3H","4H"], ["7S","7D","7C"],
        ["AC","AD","AH"], ["2C","3D","4C","5H","6S","7H"],
    ];
    return sigs.map(labels => {
        const bcs = labels.map(l => new BoardCard(
            pull(deck, l, OriginDeck.DECK_ONE), BoardCardState.FIRMLY_ON_BOARD));
        return new CardStack(bcs, DUMMY_LOC);
    });
}

function deal_hand(deck: Card[], n: number): HandCard[] {
    const out: HandCard[] = [];
    for (let i = 0; i < n && deck.length > 0; i++) {
        out.push(new HandCard(deck.shift()!, HandCardState.NORMAL));
    }
    return out;
}

// Run a single game using `bag`. Deterministic given the same deck +
// stacks + hands. Returns total plays per player and per-turn log.
type GameLog = {
    total_plays: number;
    p0_remaining: number;
    p1_remaining: number;
    moves: { turn: number; player: number; trick_id: string; hand_cards: string[] }[];
};

function play_game(
    bag: TrickBag,
    starter: { deck: Card[]; board: CardStack[]; hands: [HandCard[], HandCard[]] },
    stats?: TurnStatsRecorder,
    stats_game_id?: number,
): GameLog {
    // Copy starting state so each pass is independent.
    const deck = [...starter.deck];
    const board: CardStack[] = starter.board.map(s => s.clone());
    const hands: [HandCard[], HandCard[]] = [
        starter.hands[0].slice(),
        starter.hands[1].slice(),
    ];

    {
        const cleaned = join_adjacent_runs(board);
        if (cleaned.changed) { board.length = 0; for (const s of cleaned.board) board.push(s); }
    }

    const moves: GameLog["moves"] = [];
    let total_plays = 0;
    let consecutive_stuck = 0;

    for (let turn = 1; turn <= 200; turn++) {
        const p = (turn - 1) % 2;
        let turn_played = 0;

        while (hands[p].length > 0) {
            const play = bag.first_play(hands[p], board);
            if (!play) break;
            const played = play.apply(board);
            if (played.length === 0) break;
            const used = new Set(played);
            hands[p] = hands[p].filter(hc => !used.has(hc));
            turn_played += played.length;
            moves.push({
                turn, player: p,
                trick_id: play.trick.id,
                hand_cards: played.map(hc => card_label(hc.card)),
            });
            stats?.record_play(play, played.length);
        }
        stats?.end_turn(stats_game_id ?? 0, p, turn_played === 0);

        {
            const cleaned = join_adjacent_runs(board);
            if (cleaned.changed) { board.length = 0; for (const s of cleaned.board) board.push(s); }
        }

        total_plays += turn_played;

        if (turn_played === 0) {
            hands[p] = hands[p].concat(deal_hand(deck, 3));
            consecutive_stuck++;
        } else if (hands[p].length === 0) {
            hands[p] = hands[p].concat(deal_hand(deck, 5));
            consecutive_stuck = 0;
        } else {
            consecutive_stuck = 0;
        }

        if (hands[0].length === 0 && hands[1].length === 0 && deck.length === 0) break;
        if (consecutive_stuck >= 4) break;
    }

    return {
        total_plays,
        p0_remaining: hands[0].length,
        p1_remaining: hands[1].length,
        moves,
    };
}

// --- Main ---

// Build the shared starting state once so all three passes play
// the exact same game.
const starter_deck = build_full_double_deck();
const starter_board = build_initial_board(starter_deck);
const starter_hands: [HandCard[], HandCard[]] = [
    deal_hand(starter_deck, 15),
    deal_hand(starter_deck, 15),
];
const starter = { deck: starter_deck, board: starter_board, hands: starter_hands };

const passes: { label: string; tricks: Trick[] }[] = [
    { label: "Beginner (DIRECT_PLAY only)",        tricks: [direct_play] },
    { label: "Learned SWAP (DIRECT + SWAP)",       tricks: [direct_play, swap] },
    { label: "Learned PAIR_PEEL (+ PAIR_PEEL)",    tricks: [direct_play, swap, pair_peel] },
];

// Optional: emit JSONL stats when STATS_PATH is set.
const stats_path = process.env.STATS_PATH;
if (stats_path && fs.existsSync(stats_path)) fs.unlinkSync(stats_path);

let pass_game_id = 1;
for (const pass of passes) {
    const bag = new TrickBag(pass.tricks);
    const recorder = stats_path ? new TurnStatsRecorder(stats_path) : undefined;
    const log = play_game(bag, starter, recorder, pass_game_id++);
    const by_trick = new Map<string, number>();
    for (const m of log.moves) by_trick.set(m.trick_id, (by_trick.get(m.trick_id) ?? 0) + 1);
    const breakdown = [...by_trick.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `${id}=${n}`)
        .join("  ");
    console.log(`\n--- ${pass.label} ---`);
    console.log(`Total plays: ${log.total_plays}`);
    console.log(`P0 remaining: ${log.p0_remaining}, P1 remaining: ${log.p1_remaining}`);
    console.log(`By trick: ${breakdown}`);
}
