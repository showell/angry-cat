// Run fresh random games. When the auto-player gets stuck at
// turn >= 7, dump the stuck position as a puzzle and exit.
//
// Usage: npx vite-node src/lyn_rummy/tools/hunt_puzzle.ts
//
// Env (optional): MAX_GAMES, SEED_INFO (just printed)

import * as fs from "fs";
import { Card, OriginDeck, Suit, value_str, build_full_double_deck } from "../core/card";
import {
    BoardCard, BoardCardState, CardStack, HandCard, HandCardState,
} from "../core/card_stack";
import { join_adjacent_runs } from "../core/board_physics";
import { TrickBag } from "../tricks/bag";
import { direct_play } from "../tricks/direct_play";
import { rb_swap } from "../tricks/rb_swap";
import { pair_peel } from "../tricks/pair_peel";
import { hand_stacks } from "../tricks/hand_stacks";
import { split_for_set } from "../tricks/split_for_set";

const BAG = new TrickBag([hand_stacks, direct_play, rb_swap, pair_peel, split_for_set]);

const MAX_GAMES = parseInt(process.env.MAX_GAMES || "50", 10);
const STUCK_TURN_MIN = 7;
const DUMMY_LOC = { top: 0, left: 0 };

const suit_letter: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
function card_label_with_deck(c: Card): string {
    const deck = c.origin_deck === OriginDeck.DECK_ONE ? "1" : "2";
    return value_str(c.value) + suit_letter[c.suit] + ":" + deck;
}

// --- Deal ---

function pull(deck: Card[], label: string, origin: OriginDeck): Card {
    const t = Card.from(label, origin);
    const idx = deck.findIndex(c =>
        c.value === t.value && c.suit === t.suit && c.origin_deck === t.origin_deck);
    if (idx < 0) throw new Error(`Card ${label} not in deck`);
    return deck.splice(idx, 1)[0];
}

function build_initial_board(deck: Card[]): CardStack[] {
    // Mirror of Dealer.build_initial_board — fixed 6 stacks pulled
    // from the shuffled deck (all D1).
    const sigs = [
        ["KS","AS","2S","3S"],
        ["TD","JD","QD","KD"],
        ["2H","3H","4H"],
        ["7S","7D","7C"],
        ["AC","AD","AH"],
        ["2C","3D","4C","5H","6S","7H"],
    ];
    return sigs.map(labels => {
        const bcs = labels.map(l =>
            new BoardCard(pull(deck, l, OriginDeck.DECK_ONE), BoardCardState.FIRMLY_ON_BOARD));
        return new CardStack(bcs, DUMMY_LOC);
    });
}

function deal(deck: Card[], n: number): HandCard[] {
    const out: HandCard[] = [];
    for (let i = 0; i < n && deck.length > 0; i++) {
        out.push(new HandCard(deck.shift()!, HandCardState.NORMAL));
    }
    return out;
}

// --- Single game ---

type StuckInfo = {
    turn: number;
    player: number;
    hand: Card[];
    board: CardStack[];
    deck_remaining: number;
};

function play_game(): StuckInfo | null {
    const deck = build_full_double_deck();
    const board = build_initial_board(deck);
    const hands: [HandCard[], HandCard[]] = [deal(deck, 15), deal(deck, 15)];

    // Optional: initial cleanup
    {
        const cleaned = join_adjacent_runs(board);
        if (cleaned.changed) {
            board.length = 0;
            for (const s of cleaned.board) board.push(s);
        }
    }

    let turn = 0;
    let consecutive_stuck = 0;
    while (true) {
        turn++;
        if (turn > 200) return null;
        const p = (turn - 1) % 2;
        let played = 0;

        while (hands[p].length > 0) {
            const play = BAG.first_play(hands[p], board);
            if (!play) break;
            const played_cards = play.apply(board);
            if (played_cards.length === 0) break;
            const used = new Set(played_cards);
            hands[p] = hands[p].filter(hc => !used.has(hc));
            played += played_cards.length;
        }

        // End-of-turn cleanup.
        {
            const cleaned = join_adjacent_runs(board);
            if (cleaned.changed) {
                board.length = 0;
                for (const s of cleaned.board) board.push(s);
            }
        }

        // Report the stuck: we want the pre-draw state at turn >= STUCK_TURN_MIN.
        if (played === 0 && turn >= STUCK_TURN_MIN && hands[p].length > 0) {
            return {
                turn, player: p,
                hand: hands[p].map(hc => hc.card),
                board,
                deck_remaining: deck.length,
            };
        }

        // Draw rules.
        if (played === 0) {
            hands[p] = hands[p].concat(deal(deck, 3));
            consecutive_stuck++;
        } else if (hands[p].length === 0) {
            hands[p] = hands[p].concat(deal(deck, 5));
            consecutive_stuck = 0;
        } else {
            consecutive_stuck = 0;
        }

        if (hands[0].length === 0 && hands[1].length === 0) return null;
        if (consecutive_stuck >= 4) return null;
        if (deck.length === 0 && played === 0) return null;
    }
}

// --- Hunt ---

for (let g = 1; g <= MAX_GAMES; g++) {
    const stuck = play_game();
    if (stuck) {
        console.log(`Game ${g}: stuck at T${stuck.turn} P${stuck.player}, deck=${stuck.deck_remaining}, hand=${stuck.hand.length}`);
        const puzzle = {
            saved_at: new Date().toISOString(),
            note: `hunt_puzzle: T${stuck.turn} P${stuck.player}, deck=${stuck.deck_remaining}, ${stuck.board.length} stacks`,
            player: stuck.player,
            hand: stuck.hand.map(card_label_with_deck),
            board: stuck.board.map(s => ({
                cards: s.get_cards().map(card_label_with_deck),
            })),
        };
        const path = `src/lyn_rummy/puzzles/hunt_${Date.now()}.json`;
        fs.writeFileSync(path, JSON.stringify(puzzle, null, 2));
        console.log(`Saved: ${path}`);
        console.log(`Hand: ${puzzle.hand.join(" ")}`);
        console.log(`Board (${puzzle.board.length} stacks):`);
        for (const s of puzzle.board) console.log(`  [${s.cards.join(" ")}]`);
        process.exit(0);
    }
    if (g % 10 === 0) console.log(`(${g}/${MAX_GAMES}) no qualifying stuck yet...`);
}

console.log(`No stuck-at-turn-${STUCK_TURN_MIN}+ found after ${MAX_GAMES} games.`);
