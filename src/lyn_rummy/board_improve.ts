// Board score improvements using the trick vocabulary.
//
// Board-only tricks (no hand cards):
//   join-runs: merge adjacent runs, eliminates a -2 penalty.
//   promote-card-to-run: loose card moves from set/rb to pure run.
//   promote-card-to-set: loose card moves from rb to set.
//
// The main loop applies tricks until no more gains are possible.
// Each trick may enable others: a promote may create adjacent runs
// that can be joined, and a join may create a longer run with new
// promote opportunities.

import { Card, CardColor } from "./card";
import {
    BoardCard, BoardCardState, CardStack,
    type BoardLocation,
} from "./card_stack";
import { CardStackType, get_stack_type } from "./stack_type";
import { Score } from "./score";
import { can_extract, join_adjacent_runs } from "./hints";

const loc: BoardLocation = { top: 0, left: 0 };

// --- Promote: move a loose card to a higher-scoring stack ---

type Promote = {
    card: Card;
    source_index: number;
    target_index: number;
    card_index: number;
    score_delta: number;
};

function extract_card(
    stack: CardStack,
    card_index: number,
): { card: BoardCard; remaining: CardStack } | undefined {
    const cards = stack.board_cards;
    const size = cards.length;
    const st = stack.get_stack_type();

    // End peel.
    if (card_index === 0 && size >= 4) {
        return { card: cards[0], remaining: new CardStack(cards.slice(1), loc) };
    }
    if (card_index === size - 1 && size >= 4) {
        return { card: cards[size - 1], remaining: new CardStack(cards.slice(0, -1), loc) };
    }

    // Set: remove any card from a 4-card set.
    if (st === CardStackType.SET && size >= 4) {
        return {
            card: cards[card_index],
            remaining: new CardStack(cards.filter((_, i) => i !== card_index), loc),
        };
    }

    return undefined;
}

function find_promotes(board: CardStack[]): Promote[] {
    const promotes: Promote[] = [];

    for (let si = 0; si < board.length; si++) {
        const source = board[si];
        const cards = source.get_cards();

        for (let ci = 0; ci < cards.length; ci++) {
            if (!can_extract(source, ci)) continue;

            const card = cards[ci];
            const single = new CardStack(
                [new BoardCard(card, BoardCardState.FIRMLY_ON_BOARD)], loc);

            for (let ti = 0; ti < board.length; ti++) {
                if (ti === si) continue;

                const merged = board[ti].left_merge(single) ?? board[ti].right_merge(single);
                if (!merged) continue;

                const extracted = extract_card(source, ci);
                if (!extracted) continue;

                const old_score = Score.for_stack(source) + Score.for_stack(board[ti]);
                const new_score = Score.for_stack(extracted.remaining) + Score.for_stack(merged);
                const delta = new_score - old_score;

                if (delta > 0) {
                    promotes.push({ card, source_index: si, target_index: ti, card_index: ci, score_delta: delta });
                }
            }
        }
    }

    promotes.sort((a, b) => b.score_delta - a.score_delta);
    return promotes;
}

function apply_promote(stacks: CardStack[], p: Promote): boolean {
    const extracted = extract_card(stacks[p.source_index], p.card_index);
    if (!extracted) return false;

    const single = new CardStack(
        [new BoardCard(p.card, BoardCardState.FIRMLY_ON_BOARD)], loc);
    const merged = stacks[p.target_index].left_merge(single)
                ?? stacks[p.target_index].right_merge(single);
    if (!merged) return false;

    stacks[p.source_index] = extracted.remaining;
    stacks[p.target_index] = merged;
    return true;
}

// --- Board swap: same-color substitution in rb runs ---
//
// If an rb run has a card (e.g. 4D) and the board has the
// same-color counterpart (4H) elsewhere, swap them if the
// new arrangement scores better. The swap frees 4D to promote
// to a diamond pure run that 4H couldn't reach.

type BoardSwap = {
    rb_stack_index: number;
    rb_card_index: number;
    other_stack_index: number;
    other_card_index: number;
    score_delta: number;
};

function find_board_swaps(stacks: CardStack[]): BoardSwap[] {
    const results: BoardSwap[] = [];

    for (let ri = 0; ri < stacks.length; ri++) {
        const rb_stack = stacks[ri];
        if (rb_stack.get_stack_type() !== CardStackType.RED_BLACK_RUN) continue;

        const rb_cards = rb_stack.get_cards();
        for (let rci = 0; rci < rb_cards.length; rci++) {
            const rb_card = rb_cards[rci];

            // Look for a same-color, same-value, different-suit card
            // elsewhere that is extractable.
            for (let oi = 0; oi < stacks.length; oi++) {
                if (oi === ri) continue;
                const other_stack = stacks[oi];
                const other_cards = other_stack.get_cards();

                for (let oci = 0; oci < other_cards.length; oci++) {
                    const oc = other_cards[oci];
                    if (oc.value !== rb_card.value) continue;
                    if (oc.color !== rb_card.color) continue;
                    if (oc.suit === rb_card.suit) continue;
                    if (!can_extract(other_stack, oci)) continue;

                    // Simulate the swap: put oc into the rb run at rci,
                    // extract oc from its stack, put rb_card into oc's
                    // former stack.
                    const swapped_rb = rb_cards.map((c, i) => i === rci ? oc : c);
                    if (get_stack_type(swapped_rb) !== CardStackType.RED_BLACK_RUN) continue;

                    // The extracted card (rb_card) needs to find a home
                    // on a pure run or set — otherwise the swap is pointless.
                    const rb_single = new CardStack(
                        [new BoardCard(rb_card, BoardCardState.FIRMLY_ON_BOARD)], loc);

                    let rb_card_home_score = 0;
                    let rb_card_home_index = -1;
                    for (let ti = 0; ti < stacks.length; ti++) {
                        if (ti === ri || ti === oi) continue;
                        const merged = stacks[ti].left_merge(rb_single)
                                    ?? stacks[ti].right_merge(rb_single);
                        if (!merged) continue;
                        const mt = merged.get_stack_type();
                        if (mt !== CardStackType.PURE_RUN && mt !== CardStackType.SET) continue;
                        const gain = Score.for_stack(merged) - Score.for_stack(stacks[ti]);
                        if (gain > rb_card_home_score) {
                            rb_card_home_score = gain;
                            rb_card_home_index = ti;
                        }
                    }

                    if (rb_card_home_index < 0) continue;

                    // Score the swap: rb run stays the same score (same length).
                    // oc's source loses a card. rb_card joins its new home.
                    const extracted = extract_card(other_stack, oci);
                    if (!extracted) continue;

                    const old_score = Score.for_stack(other_stack) + Score.for_stack(stacks[rb_card_home_index]);
                    const new_other_score = Score.for_stack(extracted.remaining);

                    const merged_home = stacks[rb_card_home_index].left_merge(rb_single)
                                     ?? stacks[rb_card_home_index].right_merge(rb_single);
                    if (!merged_home) continue;
                    const new_home_score = Score.for_stack(merged_home);

                    const delta = (new_other_score + new_home_score) - old_score;
                    if (delta > 0) {
                        results.push({
                            rb_stack_index: ri,
                            rb_card_index: rci,
                            other_stack_index: oi,
                            other_card_index: oci,
                            score_delta: delta,
                        });
                    }
                }
            }
        }
    }

    results.sort((a, b) => b.score_delta - a.score_delta);
    return results;
}

function apply_board_swap(stacks: CardStack[], swap: BoardSwap): boolean {
    const rb_stack = stacks[swap.rb_stack_index];
    const rb_cards = rb_stack.board_cards;
    const rb_card = rb_cards[swap.rb_card_index];

    const other_stack = stacks[swap.other_stack_index];
    const other_card = other_stack.get_cards()[swap.other_card_index];

    // Extract other_card from its stack.
    const extracted = extract_card(other_stack, swap.other_card_index);
    if (!extracted) return false;

    // Put other_card into the rb run, replacing rb_card.
    const new_rb_cards = rb_cards.map((bc, i) =>
        i === swap.rb_card_index
            ? new BoardCard(other_card, BoardCardState.FIRMLY_ON_BOARD)
            : bc);
    stacks[swap.rb_stack_index] = new CardStack(new_rb_cards, loc);
    stacks[swap.other_stack_index] = extracted.remaining;

    // Put rb_card onto its new home (find best pure run or set).
    const rb_single = new CardStack(
        [new BoardCard(rb_card.card, BoardCardState.FIRMLY_ON_BOARD)], loc);
    for (let ti = 0; ti < stacks.length; ti++) {
        if (ti === swap.rb_stack_index || ti === swap.other_stack_index) continue;
        const merged = stacks[ti].left_merge(rb_single) ?? stacks[ti].right_merge(rb_single);
        if (!merged) continue;
        const mt = merged.get_stack_type();
        if (mt === CardStackType.PURE_RUN || mt === CardStackType.SET) {
            stacks[ti] = merged;
            return true;
        }
    }
    return false;
}

// --- Split-promote: split a long rb run to expose a promotable card ---
//
// A 6+ rb run can be split into two 3+ halves. The end card of
// one half might then promote to a pure run. The split costs
// points (-2 penalty for the extra stack), but the promote gains
// more if the card joins a pure run.

type SplitPromote = {
    stack_index: number;
    split_point: number;
    promote_side: "left" | "right"; // which half loses the card
    promote_target_index: number;
    score_delta: number;
};

function find_split_promotes(stacks: CardStack[]): SplitPromote[] {
    const results: SplitPromote[] = [];

    for (let si = 0; si < stacks.length; si++) {
        const stack = stacks[si];
        const st = stack.get_stack_type();
        if (st !== CardStackType.RED_BLACK_RUN) continue;

        const cards = stack.board_cards;
        if (cards.length < 6) continue; // both halves need 3+

        for (let split = 3; split <= cards.length - 3; split++) {
            const left = new CardStack(cards.slice(0, split), loc);
            const right = new CardStack(cards.slice(split), loc);
            if (left.problematic() || right.problematic()) continue;
            if (left.incomplete() || right.incomplete()) continue;

            const split_cost = Score.for_stack(left) + Score.for_stack(right) - Score.for_stack(stack);

            // Try promoting the right end of left half.
            if (left.size() >= 4) {
                const end_card = cards[split - 1];
                const single = new CardStack(
                    [new BoardCard(end_card.card, BoardCardState.FIRMLY_ON_BOARD)], loc);
                const left_remaining = new CardStack(cards.slice(0, split - 1), loc);

                if (!left_remaining.incomplete() && !left_remaining.problematic()) {
                    for (let ti = 0; ti < stacks.length; ti++) {
                        if (ti === si) continue;
                        const merged = stacks[ti].left_merge(single) ?? stacks[ti].right_merge(single);
                        if (!merged || merged.get_stack_type() !== CardStackType.PURE_RUN) continue;

                        const promote_gain = Score.for_stack(left_remaining) + Score.for_stack(right) +
                            Score.for_stack(merged) - Score.for_stack(stack) - Score.for_stack(stacks[ti]);
                        if (promote_gain > 0) {
                            results.push({
                                stack_index: si, split_point: split,
                                promote_side: "left", promote_target_index: ti,
                                score_delta: promote_gain,
                            });
                        }
                    }
                }
            }

            // Try promoting the left end of right half.
            if (right.size() >= 4) {
                const end_card = cards[split];
                const single = new CardStack(
                    [new BoardCard(end_card.card, BoardCardState.FIRMLY_ON_BOARD)], loc);
                const right_remaining = new CardStack(cards.slice(split + 1), loc);

                if (!right_remaining.incomplete() && !right_remaining.problematic()) {
                    for (let ti = 0; ti < stacks.length; ti++) {
                        if (ti === si) continue;
                        const merged = stacks[ti].left_merge(single) ?? stacks[ti].right_merge(single);
                        if (!merged || merged.get_stack_type() !== CardStackType.PURE_RUN) continue;

                        const promote_gain = Score.for_stack(left) + Score.for_stack(right_remaining) +
                            Score.for_stack(merged) - Score.for_stack(stack) - Score.for_stack(stacks[ti]);
                        if (promote_gain > 0) {
                            results.push({
                                stack_index: si, split_point: split,
                                promote_side: "right", promote_target_index: ti,
                                score_delta: promote_gain,
                            });
                        }
                    }
                }
            }
        }
    }

    results.sort((a, b) => b.score_delta - a.score_delta);
    return results;
}

function apply_split_promote(stacks: CardStack[], sp: SplitPromote): boolean {
    const stack = stacks[sp.stack_index];
    const cards = stack.board_cards;

    const left = new CardStack(cards.slice(0, sp.split_point), loc);
    const right = new CardStack(cards.slice(sp.split_point), loc);

    if (sp.promote_side === "left") {
        const end_card = cards[sp.split_point - 1];
        const single = new CardStack(
            [new BoardCard(end_card.card, BoardCardState.FIRMLY_ON_BOARD)], loc);
        const left_remaining = new CardStack(cards.slice(0, sp.split_point - 1), loc);

        const merged = stacks[sp.promote_target_index].left_merge(single)
                    ?? stacks[sp.promote_target_index].right_merge(single);
        if (!merged) return false;

        stacks[sp.stack_index] = left_remaining;
        stacks.push(right);
        stacks[sp.promote_target_index] = merged;
    } else {
        const end_card = cards[sp.split_point];
        const single = new CardStack(
            [new BoardCard(end_card.card, BoardCardState.FIRMLY_ON_BOARD)], loc);
        const right_remaining = new CardStack(cards.slice(sp.split_point + 1), loc);

        const merged = stacks[sp.promote_target_index].left_merge(single)
                    ?? stacks[sp.promote_target_index].right_merge(single);
        if (!merged) return false;

        stacks[sp.stack_index] = left;
        stacks.push(right_remaining);
        stacks[sp.promote_target_index] = merged;
    }

    return true;
}

// Extended loop: join + promote + split-promote.
export function do_board_improvements_with_split(board: CardStack[]): ImprovementResult {
    return improve_with_tricks(board, { use_swap: false, use_split_promote: true });
}

// --- Main loop: join + promote until stable ---

export type ImprovementResult = {
    board: CardStack[];
    score_gained: number;
    upgrades_applied: number;
};

// Base loop: join + promote.
export function do_obvious_board_improvements(board: CardStack[]): ImprovementResult {
    return improve_with_tricks(board, { use_swap: false });
}

// Extended loop: join + promote + board-swap.
export function do_board_improvements_with_swap(board: CardStack[]): ImprovementResult {
    return improve_with_tricks(board, { use_swap: true });
}

function improve_with_tricks(
    board: CardStack[],
    options: { use_swap?: boolean; use_split_promote?: boolean },
): ImprovementResult {
    const stacks = [...board];
    let total_gained = 0;
    let total_applied = 0;

    let progress = true;
    while (progress) {
        progress = false;

        // Trick 1: join-runs.
        {
            const before = Score.for_stacks(stacks);
            const joined = join_adjacent_runs(stacks);
            if (joined.changed) {
                stacks.length = 0;
                for (const s of joined.board) stacks.push(s);
                const after = Score.for_stacks(stacks);
                total_gained += after - before;
                total_applied++;
                progress = true;
                continue;
            }
        }

        // Trick 2: promote (to run or set).
        {
            const promotes = find_promotes(stacks);
            if (promotes.length > 0 && apply_promote(stacks, promotes[0])) {
                total_gained += promotes[0].score_delta;
                total_applied++;
                progress = true;
                continue;
            }
        }

        // Trick 3: board-swap (optional).
        if (options.use_swap) {
            const swaps = find_board_swaps(stacks);
            if (swaps.length > 0 && apply_board_swap(stacks, swaps[0])) {
                total_gained += swaps[0].score_delta;
                total_applied++;
                progress = true;
                continue;
            }
        }

        // Trick 4: split-promote (optional).
        if (options.use_split_promote) {
            const sps = find_split_promotes(stacks);
            if (sps.length > 0 && apply_split_promote(stacks, sps[0])) {
                total_gained += sps[0].score_delta;
                total_applied++;
                progress = true;
                continue;
            }
        }
    }

    return { board: stacks, score_gained: total_gained, upgrades_applied: total_applied };
}

// Expose find_upgrades for backward compatibility with tests.
export const find_upgrades = find_promotes;
