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
    Board, Stack, make_board, clone_board, raid, can_steal,
} from "./raid";

// Score the board: sum the score of every valid stack.
//   pure run: n * 100
//   set: n * 60
//   rb run: n * 50
//   anything else: 0
//
// Mirrors Score.for_stack in score.ts. Flat per-card scoring so
// splits don't change the score (cooperative-friendly).
export function score_board(board: Board): number {
    let total = 0;
    for (const stack of board.stacks) {
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

// One row in the structured iteration log produced by the solver.
// Useful for after-the-fact analysis (cycle detection, viewers).
export type SolveStep = {
    iter: number;
    chosen: Card;
    acting_as_pair: boolean;
    threesome: Threesome;
    pattern_key: string;
    score_before: number;
    score_after: number;
    // Snapshot of all stacks AFTER this iteration's raid.
    // Each stack is shown by its cards in their final order.
    stacks_after: Card[][];
};

export type SolveResult = {
    board: Board;
    score: number;
    iterations: number;
    aborted: boolean;
    // Step-by-step log. Always populated; consumers can ignore it.
    steps: SolveStep[];
    // True if the solver threw an "all threesomes retired" exception.
    threw: boolean;
    // Error message if threw is true.
    error_message?: string;
    // If threw, this is the step index whose raid is the most recent
    // cause of homelessness for the failing card. Used for backtracking.
    blame_step_index?: number;
    // The card that ran out of options.
    failing_card?: Card;
};

// A blacklist entry: forbid choosing a particular pattern at a
// particular step index in the run. Used by the backtracking
// wrapper to retry the same starting state with different choices.
export type BlacklistEntry = {
    step_index: number;     // 0-based step number in the forward run
    pattern_key: string;
};

export function pattern_key_for(t: Threesome): string {
    return t.cards.map((c) => c.value + ":" + c.suit).join("|");
}

export const DEBUG_FLAGS = { enabled: false };

const SUIT_LABELS: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
function dbg_label(c: Card): string {
    const dk = c.origin_deck === 0 ? "1" : "2";
    return value_str(c.value) + SUIT_LABELS[c.suit] + ":" + dk;
}

// Solve a fresh pile of cards: every card starts as a singleton.
export function solve_threesomes(initial_cards: Card[]): SolveResult {
    const initial_stacks: Card[][] = initial_cards.map((c) => [c]);
    return solve_from_board(initial_stacks);
}

// Solve from an existing board state: caller provides pre-formed
// stacks (some may already be valid 3+ stacks; some may be loose
// singletons or pairs). The solver runs its raid loop on this board.
//
// This is the "puzzle mode" entry point — it lets the solver work
// on the same level playing field as a human player who sees a
// mostly-complete board with a few stragglers in hand.
//
// `blacklist` is an optional set of (step_index, pattern_key) pairs
// that the solver must avoid. Used by the backtracking wrapper.
export function solve_from_board(
    stacks: Card[][],
    blacklist?: BlacklistEntry[],
): SolveResult {
    const board = make_board(stacks);

    // Collect every card on the board for the threesome universe.
    const all_cards: Card[] = [];
    for (const s of stacks) for (const c of s) all_cards.push(c);

    // Precompute threesomes for every card. Lifetime constant.
    // Twins share their lists — see compute_threesomes.
    const all_threesomes = compute_threesomes(all_cards);

    // Per-pattern global play count. After MAX_PLAYS plays, the
    // pattern is permanently retired. Keyed by a stable string of
    // (value, suit) slots so different instantiations of the same
    // pattern share a counter.
    const MAX_PLAYS = 30;
    const play_count = new Map<string, number>();
    function pattern_key_of(t: Threesome): string {
        return t.cards.map((c) => c.value + ":" + c.suit).join("|");
    }
    function get_plays(t: Threesome): number {
        return play_count.get(pattern_key_of(t)) ?? 0;
    }
    function bump_plays_by_key(key: string): void {
        play_count.set(key, (play_count.get(key) ?? 0) + 1);
    }
    function is_retired(t: Threesome): boolean {
        return get_plays(t) >= MAX_PLAYS;
    }

    // Two FIFO queues: singletons first, then pairs. Within each
    // tier, longest-waiting goes first. Only LONELY cards (in
    // incomplete stacks) start in the queues; cards already in
    // valid 3+ families are not initially lonely.
    const singleton_queue: Card[] = [];
    const pair_queue: Card[] = [];
    const in_singleton_queue = new Set<Card>();
    const in_pair_queue = new Set<Card>();

    for (const stack of board.stacks) {
        if (stack.length === 1) {
            singleton_queue.push(stack[0]);
            in_singleton_queue.add(stack[0]);
        } else if (stack.length === 2) {
            pair_queue.push(stack[0]);
            in_pair_queue.add(stack[0]);
        }
    }

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
    const steps: SolveStep[] = [];
    let threw = false;
    let error_message: string | undefined;

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

        // Find candidate threesomes. Constraints:
        //   - The pattern must have a slot matching chosen's
        //     (value, suit) — chosen will fill that slot at play time
        //   - The twin rule must allow the steal
        //   - The pattern must not be retired
        // For pairs, both pair members' slots must appear in the pattern.
        const my_threesomes = all_threesomes.get(chosen) ?? [];
        const candidates: Threesome[] = [];

        function pattern_has_slot(t: Threesome, c: Card): boolean {
            for (const slot of t.cards) {
                if (slot.value === c.value && slot.suit === c.suit) return true;
            }
            return false;
        }

        // Build a Threesome with the chosen card substituted into
        // its slot (and the partner too, for pair turns). The
        // pattern's other slots keep their sample cards.
        function instantiate(t: Threesome, players: Card[]): Threesome {
            const cards = t.cards.map((slot) => {
                for (const p of players) {
                    if (slot.value === p.value && slot.suit === p.suit) return p;
                }
                return slot;
            });
            return { cards, type: t.type };
        }

        if (acting_as_pair) {
            const pair_stack = board.location.get(chosen)!;
            const partner = pair_stack.find((c) => c !== chosen)!;
            for (const t of my_threesomes) {
                if (pattern_has_slot(t, chosen) && pattern_has_slot(t, partner)
                    && !is_retired(t)) {
                    const inst = instantiate(t, [chosen, partner]);
                    if (can_steal(board, inst)) candidates.push(inst);
                }
            }
            // Fallback: if the pair has no feasible joint threesomes,
            // dissolve the pair and act as a singleton instead.
            if (candidates.length === 0) {
                acting_as_pair = false;
                for (const t of my_threesomes) {
                    if (pattern_has_slot(t, chosen) && !is_retired(t)) {
                        const inst = instantiate(t, [chosen]);
                        if (can_steal(board, inst)) candidates.push(inst);
                    }
                }
            }
        } else {
            for (const t of my_threesomes) {
                if (pattern_has_slot(t, chosen) && !is_retired(t)) {
                    const inst = instantiate(t, [chosen]);
                    if (can_steal(board, inst)) candidates.push(inst);
                }
            }
        }

        // If nothing remains, the chosen card is fundamentally stuck.
        if (candidates.length === 0) {
            threw = true;
            error_message =
                "Card " + dbg_label(chosen) +
                " has no feasible non-retired threesomes (" +
                my_threesomes.length + " total)";
            break;
        }

        // Pick the candidate that yields the best board score.
        let best_threesome: Threesome | undefined;
        let best_outcome = -Infinity;
        for (const t of candidates) {
            const sim = clone_board(board);
            raid(sim, t);
            const outcome = score_board(sim);
            if (outcome > best_outcome) {
                best_outcome = outcome;
                best_threesome = t;
            }
        }
        if (!best_threesome) {
            threw = true;
            error_message = "Unexpected: no best threesome chosen for " + dbg_label(chosen);
            break;
        }

        // Apply the raid and bump the play count.
        const score_before = score_board(board);
        raid(board, best_threesome);
        const score_after = score_board(board);
        // bump_plays uses the underlying pattern for retirement.
        // We need to find the original pattern (the candidates were
        // instantiated copies). The pattern can be located via the
        // shared "type" + slot signature. For simplicity, we bump
        // by signature: key by ordered slot tuples.
        const pattern_key = best_threesome.cards
            .map((c) => c.value + ":" + c.suit).join("|");
        bump_plays_by_key(pattern_key);

        // Append a step record. Snapshot the board's stacks (their
        // contents in their current order) so analysis tools can
        // see exactly what was on the board after this iteration.
        steps.push({
            iter: iterations,
            chosen,
            acting_as_pair,
            threesome: best_threesome,
            pattern_key,
            score_before,
            score_after,
            stacks_after: board.stacks.map((s) => s.slice()),
        });

        if (DEBUG_FLAGS.enabled) {
            console.log(
                "iter " + iterations + " " + dbg_label(chosen) +
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
        steps,
        threw,
        error_message,
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
