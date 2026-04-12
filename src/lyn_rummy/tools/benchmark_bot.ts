// One-command, reproducible benchmark of the plugin bot.
//
// Plays N games with fixed seeds using whatever tricks are currently
// registered in the local TrickBag, then prints one JSON line per
// game plus an aggregate summary line. Designed to be diffed across
// commits as new tricks get added.
//
// Usage:
//   npx vite-node src/lyn_rummy/tools/benchmark_bot.ts
//   npx vite-node src/lyn_rummy/tools/benchmark_bot.ts --seeds 1,2,3,4,5 --label "before-loose"
//
// Output format: one JSON object per game + one "summary" object at
// the end, each on its own line. Pipe to jq for further analysis.

import { Card, OriginDeck, build_full_double_deck, seeded_rand } from "../core/card";
import {
    BoardCard, BoardCardState, CardStack, HandCard, HandCardState,
} from "../core/card_stack";
import { join_adjacent_runs } from "../core/board_physics";
import { TrickBag } from "../tricks/bag";
import { direct_play } from "../tricks/direct_play";
import { rb_swap } from "../tricks/rb_swap";
import { pair_peel } from "../tricks/pair_peel";
import { hand_stacks } from "../tricks/hand_stacks";

// The registered bag for this benchmark. Update as tricks get ported.
const BAG = new TrickBag([hand_stacks, direct_play, rb_swap, pair_peel]);

// --- CLI ---

function parse_args(): { seeds: number[]; label: string } {
    const args = process.argv.slice(2);
    let seeds = [1, 2, 3, 4, 5];
    let label = "";
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--seeds" && args[i + 1]) {
            seeds = args[++i].split(",").map(s => parseInt(s.trim()));
        }
        if (args[i] === "--label" && args[i + 1]) {
            label = args[++i];
        }
    }
    return { seeds, label };
}

const { seeds, label } = parse_args();

// --- Setup helpers (mirror hunt_puzzle / learn_game) ---

function pull(deck: Card[], labelS: string, origin: OriginDeck): Card {
    const t = Card.from(labelS, origin);
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
    return sigs.map(ls =>
        new CardStack(
            ls.map(l => new BoardCard(
                pull(deck, l, OriginDeck.DECK_ONE), BoardCardState.FIRMLY_ON_BOARD)),
            { top: 0, left: 0 },
        ));
}

function deal(deck: Card[], n: number): HandCard[] {
    const out: HandCard[] = [];
    for (let i = 0; i < n && deck.length > 0; i++) {
        out.push(new HandCard(deck.shift()!, HandCardState.NORMAL));
    }
    return out;
}

// --- Single game ---

type GameResult = {
    seed: number;
    cards_played: number;
    p0_remaining: number;
    p1_remaining: number;
    turns: number;
    stuck_turns: number;
    tricks: Record<string, number>;
    completion_pct: number; // cards on board / 104
};

function play_one_game(seed: number): GameResult {
    const deck = build_full_double_deck(seeded_rand(seed));
    const board = build_initial_board(deck);
    const hands: [HandCard[], HandCard[]] = [deal(deck, 15), deal(deck, 15)];

    {
        const cleaned = join_adjacent_runs(board);
        if (cleaned.changed) { board.length = 0; for (const s of cleaned.board) board.push(s); }
    }

    let turn = 0;
    let consecutive_stuck = 0;
    let stuck_turns = 0;
    let total_played = 0;
    const tricks: Record<string, number> = {};

    while (turn < 200) {
        turn++;
        const p = (turn - 1) % 2;
        let turn_played = 0;

        while (hands[p].length > 0) {
            const play = BAG.first_play(hands[p], board);
            if (!play) break;
            const played = play.apply(board);
            if (played.length === 0) break;
            const used = new Set(played);
            hands[p] = hands[p].filter(hc => !used.has(hc));
            turn_played += played.length;
            tricks[play.trick.id] = (tricks[play.trick.id] ?? 0) + 1;
        }

        {
            const cleaned = join_adjacent_runs(board);
            if (cleaned.changed) { board.length = 0; for (const s of cleaned.board) board.push(s); }
        }

        total_played += turn_played;

        if (turn_played === 0) {
            hands[p] = hands[p].concat(deal(deck, 3));
            consecutive_stuck++;
            stuck_turns++;
        } else if (hands[p].length === 0) {
            hands[p] = hands[p].concat(deal(deck, 5));
            consecutive_stuck = 0;
        } else {
            consecutive_stuck = 0;
        }

        if (hands[0].length === 0 && hands[1].length === 0 && deck.length === 0) break;
        if (consecutive_stuck >= 4) break;
    }

    const cards_on_board = board.reduce((n, s) => n + s.size(), 0);

    return {
        seed,
        cards_played: total_played,
        p0_remaining: hands[0].length,
        p1_remaining: hands[1].length,
        turns: turn,
        stuck_turns,
        tricks,
        completion_pct: Math.round((cards_on_board / 104) * 1000) / 10,
    };
}

// --- Run all seeds ---

const results: GameResult[] = [];
for (const s of seeds) {
    const r = play_one_game(s);
    console.log(JSON.stringify({ type: "game", label, ...r }));
    results.push(r);
}

// Aggregate summary.
const avg_cards = results.reduce((n, r) => n + r.cards_played, 0) / results.length;
const avg_completion = results.reduce((n, r) => n + r.completion_pct, 0) / results.length;
const total_stuck = results.reduce((n, r) => n + r.stuck_turns, 0);
const trick_totals: Record<string, number> = {};
for (const r of results) {
    for (const [k, v] of Object.entries(r.tricks)) {
        trick_totals[k] = (trick_totals[k] ?? 0) + v;
    }
}

console.log(JSON.stringify({
    type: "summary",
    label,
    games: results.length,
    avg_cards_played: Math.round(avg_cards * 10) / 10,
    avg_completion_pct: Math.round(avg_completion * 10) / 10,
    total_stuck_turns: total_stuck,
    tricks: trick_totals,
    tricks_in_bag: BAG.tricks.map(t => t.id),
}));
