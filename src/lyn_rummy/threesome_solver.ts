// Threesome-centric solver.
//
// Each card precomputes every viable threesome it could belong to.
// On its turn, a lonely card simulates raiding for each of its
// threesomes and picks the one with the best resulting board score.
//
// No grudges, no bonds, no attractiveness — just board score.
//
// Priority: singletons (truly lonely) go before pairs (childless
// relationships). Within a tier, FIFO.

import { Card, Suit, value_str } from "./card";
import { CardStackType, get_stack_type } from "./stack_type";
import { compute_threesomes, Threesome } from "./threesomes";
import {
    Board, Stack, make_board, clone_board, raid,
} from "./raid";

// Score the board: sum the score of every valid stack.
//   pure run: (n-2) * 100
//   set: (n-2) * 60
//   rb run: (n-2) * 50
//   anything else: 0
export function score_board(board: Board): number {
    let total = 0;
    for (const stack of board.stacks) {
        if (stack.length < 3) continue;
        const t = get_stack_type(stack);
        const tv =
            t === CardStackType.PURE_RUN ? 100 :
            t === CardStackType.SET ? 60 :
            t === CardStackType.RED_BLACK_RUN ? 50 : 0;
        total += (stack.length - 2) * tv;
    }
    return total;
}

export type SolveResult = {
    board: Board;
    score: number;
    iterations: number;
    aborted: boolean;
};

export const DEBUG_FLAGS = { enabled: false };

const SUIT_LABELS: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
function dbg_label(c: Card): string {
    const dk = c.origin_deck === 0 ? "1" : "2";
    return value_str(c.value) + SUIT_LABELS[c.suit] + ":" + dk;
}

// The main solver. Takes an initial set of cards as singletons and
// runs the threesome-driven loop until no more progress can be made.
export function solve_threesomes(initial_cards: Card[]): SolveResult {
    // Each card starts as its own singleton.
    const initial_stacks: Card[][] = initial_cards.map((c) => [c]);
    const board = make_board(initial_stacks);

    // Precompute threesomes for every card. Lifetime constant.
    const all_threesomes = compute_threesomes(initial_cards);

    // PER-CARD timeout: when card C raids threesome T, T goes into
    // C's personal timeout for the next TIMEOUT_TURNS of C's turns.
    // Other cards have their own independent timeouts.
    //
    // Map structure: card → (threesome → turns remaining for that card).
    const TIMEOUT_TURNS = 3;
    const timeouts = new Map<Card, Map<Threesome, number>>();

    function get_timeout(card: Card, t: Threesome): number {
        return timeouts.get(card)?.get(t) ?? 0;
    }
    function start_timeout(card: Card, t: Threesome): void {
        let m = timeouts.get(card);
        if (!m) { m = new Map(); timeouts.set(card, m); }
        m.set(t, TIMEOUT_TURNS);
    }
    // Decrement all of card's timeouts. Called once per turn that
    // card actually takes.
    function tick_card_timeouts(card: Card): void {
        const m = timeouts.get(card);
        if (!m) return;
        for (const [t, n] of m) {
            if (n > 0) m.set(t, n - 1);
        }
    }

    // Two FIFO queues: singletons first, then pairs. Within each
    // tier, longest-waiting goes first.
    const singleton_queue: Card[] = [...initial_cards];
    const pair_queue: Card[] = [];
    const in_singleton_queue = new Set<Card>(initial_cards);
    const in_pair_queue = new Set<Card>();

    function enqueue(card: Card): void {
        const stack = board.location.get(card);
        if (!stack) return;
        const size = stack.length;
        if (size === 1) {
            if (!in_singleton_queue.has(card)) {
                singleton_queue.push(card);
                in_singleton_queue.add(card);
            }
        } else if (size === 2) {
            // Enqueue once per pair using the first member.
            const first = stack[0];
            if (!in_pair_queue.has(first)) {
                pair_queue.push(first);
                in_pair_queue.add(first);
            }
        }
        // Cards in valid 3+ stacks are not lonely; not enqueued.
    }

    let iterations = 0;
    const MAX_ITERATIONS = 10000;

    while (iterations < MAX_ITERATIONS) {
        iterations++;

        // Pop the next actor: singletons first, then pairs.
        let chosen: Card | undefined;
        let acting_as_pair = false;

        while (singleton_queue.length > 0 && !chosen) {
            const card = singleton_queue.shift()!;
            in_singleton_queue.delete(card);
            const stack = board.location.get(card);
            if (!stack || stack.length !== 1) continue; // stale
            chosen = card;
        }

        if (!chosen) {
            while (pair_queue.length > 0 && !chosen) {
                const card = pair_queue.shift()!;
                in_pair_queue.delete(card);
                const stack = board.location.get(card);
                if (!stack || stack.length !== 2) continue; // stale
                chosen = card;
                acting_as_pair = true;
            }
        }

        if (!chosen) break; // queues empty — we're done

        // This card just got a turn. Tick its personal timeouts.
        tick_card_timeouts(chosen);

        // Find candidate threesomes.
        const my_threesomes = all_threesomes.get(chosen) ?? [];
        const candidates: Threesome[] = [];

        if (acting_as_pair) {
            // A pair pursues threesomes that contain BOTH pair members.
            const pair_stack = board.location.get(chosen)!;
            const partner = pair_stack.find((c) => c !== chosen)!;
            for (const t of my_threesomes) {
                if (t.cards.includes(partner)) candidates.push(t);
            }
            // Fallback: if the pair has no joint threesomes (e.g.,
            // they were stuck together by an earlier raid that
            // didn't quite work out), dissolve the pair and act as
            // a singleton instead. We never quit on a turn.
            if (candidates.length === 0) {
                acting_as_pair = false;
                for (const t of my_threesomes) candidates.push(t);
            }
        } else {
            // A singleton pursues every threesome it can.
            for (const t of my_threesomes) candidates.push(t);
        }

        // Simulate each candidate. First try only the threesomes
        // that aren't in this card's personal timeout. If all of
        // them are in timeout, fall back to the full list — but
        // prefer the ones with the lowest remaining counter (closest
        // to expiring), breaking ties by board score.
        function pick_best_by_score(pool: Threesome[]): Threesome | undefined {
            let best_outcome = -Infinity;
            let best: Threesome | undefined;
            for (const t of pool) {
                const sim = clone_board(board);
                raid(sim, t);
                const outcome = score_board(sim);
                if (outcome > best_outcome) {
                    best_outcome = outcome;
                    best = t;
                }
            }
            return best;
        }

        const chosenCard = chosen;
        const fresh = candidates.filter((t) => get_timeout(chosenCard, t) === 0);
        let best_threesome = pick_best_by_score(fresh);
        if (!best_threesome && candidates.length > 0) {
            // No fresh threesomes — all are in timeout. Pick from
            // the timeout pool, preferring the lowest remaining
            // counter (closest to expiring).
            const min_counter = Math.min(...candidates.map((t) => get_timeout(chosenCard, t)));
            const least_timed_out = candidates.filter((t) => get_timeout(chosenCard, t) === min_counter);
            best_threesome = pick_best_by_score(least_timed_out);
        }

        if (!best_threesome) {
            // No threesomes at all for this card.
            if (DEBUG_FLAGS.enabled) {
                console.log(
                    "iter " + iterations + " " + dbg_label(chosenCard) +
                    " has no threesomes available (candidates=" + candidates.length + ")",
                );
            }
            continue;
        }

        // Apply the chosen raid for real and start its timeout
        // for this card.
        const score_before = score_board(board);
        raid(board, best_threesome);
        const score_after = score_board(board);
        start_timeout(chosenCard, best_threesome);

        if (DEBUG_FLAGS.enabled) {
            console.log(
                "iter " + iterations + " " + dbg_label(chosenCard) +
                (acting_as_pair ? " (pair)" : "") +
                " plays [" + best_threesome.cards.map(dbg_label).join(" ") + "]" +
                "  score " + score_before + "→" + score_after,
            );
        }

        // Re-enqueue any card that's now lonely (in a stack of size < 3).
        for (const stack of board.stacks) {
            if (stack.length < 3) {
                for (const c of stack) enqueue(c);
            }
        }
    }

    return {
        board,
        score: score_board(board),
        iterations,
        aborted: iterations >= MAX_ITERATIONS,
    };
}

// Helper for tests: extract the leftover (unplaced) cards from
// a result board.
export function leftover_cards(board: Board): Card[] {
    const leftover: Card[] = [];
    for (const stack of board.stacks) {
        if (stack.length < 3) {
            for (const c of stack) leftover.push(c);
        }
    }
    return leftover;
}
