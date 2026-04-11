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

import { Card, CardColor, CardValue, Suit, is_pair_of_dups } from "../core/card";
import {
    BoardCard, BoardCardState, CardStack,
    type BoardLocation,
} from "../core/card_stack";
import { CardStackType, get_stack_type, successor } from "../core/stack_type";
import { Score } from "../core/score";
import { can_extract, join_adjacent_runs } from "../hints/hints";

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

// --- Dissolve-set: break a 3-card set, place all 3 on runs ---
//
// A 3-card set scores 60. If all 3 cards can join existing runs
// (pure or rb, via end merge or inject), the set vanishes and the
// runs get longer. Net gain = sum of run extensions - 60.

type Dissolve = {
    stack_index: number;
    score_delta: number;
};

function find_dissolves(stacks: CardStack[]): Dissolve[] {
    const results: Dissolve[] = [];

    for (let si = 0; si < stacks.length; si++) {
        const stack = stacks[si];
        if (stack.get_stack_type() !== CardStackType.SET || stack.size() !== 3) continue;

        const cards = stack.get_cards();

        // For each card, find the best run it could join (pure or rb).
        // Use backtracking to assign each card to a distinct target.
        const card_targets: { ti: number; gain: number }[][] = [];

        for (const card of cards) {
            const single = new CardStack(
                [new BoardCard(card, BoardCardState.FIRMLY_ON_BOARD)], loc);
            const targets: { ti: number; gain: number }[] = [];

            for (let ti = 0; ti < stacks.length; ti++) {
                if (ti === si) continue;
                const target = stacks[ti];
                const merged = target.left_merge(single) ?? target.right_merge(single);
                if (!merged) continue;
                const mt = merged.get_stack_type();
                if (mt !== CardStackType.PURE_RUN && mt !== CardStackType.RED_BLACK_RUN) continue;

                const gain = Score.for_stack(merged) - Score.for_stack(target);
                targets.push({ ti, gain });
            }

            card_targets.push(targets);
        }

        // Backtrack: assign each card to a distinct target run.
        function backtrack(idx: number, used: Set<number>, total_gain: number): number {
            if (idx === cards.length) return total_gain;
            let best = -Infinity;
            for (const t of card_targets[idx]) {
                if (used.has(t.ti)) continue;
                used.add(t.ti);
                best = Math.max(best, backtrack(idx + 1, used, total_gain + t.gain));
                used.delete(t.ti);
            }
            return best;
        }

        const best_gain = backtrack(0, new Set(), 0);
        const delta = best_gain - Score.for_stack(stack); // gain from runs minus loss of set

        if (delta > 0) {
            results.push({ stack_index: si, score_delta: delta });
        }
    }

    results.sort((a, b) => b.score_delta - a.score_delta);
    return results;
}

function apply_dissolve(stacks: CardStack[], d: Dissolve): boolean {
    const stack = stacks[d.stack_index];
    const cards = stack.get_cards();

    // Find the best assignment again and apply it.
    const card_targets: { card: Card; ti: number; gain: number }[][] = [];

    for (const card of cards) {
        const single = new CardStack(
            [new BoardCard(card, BoardCardState.FIRMLY_ON_BOARD)], loc);
        const targets: { card: Card; ti: number; gain: number }[] = [];

        for (let ti = 0; ti < stacks.length; ti++) {
            if (ti === d.stack_index) continue;
            const merged = stacks[ti].left_merge(single) ?? stacks[ti].right_merge(single);
            if (!merged) continue;
            const mt = merged.get_stack_type();
            if (mt !== CardStackType.PURE_RUN && mt !== CardStackType.RED_BLACK_RUN) continue;
            targets.push({ card, ti, gain: Score.for_stack(merged) - Score.for_stack(stacks[ti]) });
        }
        card_targets.push(targets);
    }

    // Find best assignment.
    let best_assignment: { card: Card; ti: number }[] | undefined;
    let best_gain = -Infinity;

    function solve(idx: number, used: Set<number>, chosen: { card: Card; ti: number }[], gain: number): void {
        if (idx === cards.length) {
            if (gain > best_gain) { best_gain = gain; best_assignment = [...chosen]; }
            return;
        }
        for (const t of card_targets[idx]) {
            if (used.has(t.ti)) continue;
            used.add(t.ti);
            chosen.push({ card: t.card, ti: t.ti });
            solve(idx + 1, used, chosen, gain + t.gain);
            chosen.pop();
            used.delete(t.ti);
        }
    }

    solve(0, new Set(), [], 0);
    if (!best_assignment) return false;

    // Remove the set.
    stacks.splice(d.stack_index, 1);

    // Merge each card onto its target (adjust indices since we removed one stack).
    // Sort by target index descending so splicing doesn't shift earlier indices.
    const assignments = best_assignment.map((a) => ({
        ...a,
        ti: a.ti > d.stack_index ? a.ti - 1 : a.ti,
    }));

    for (const a of assignments) {
        const single = new CardStack(
            [new BoardCard(a.card, BoardCardState.FIRMLY_ON_BOARD)], loc);
        const merged = stacks[a.ti].left_merge(single) ?? stacks[a.ti].right_merge(single);
        if (!merged) return false;
        stacks[a.ti] = merged;
    }

    return true;
}

// Extended loop with dissolve.
export function do_board_improvements_with_dissolve(board: CardStack[]): ImprovementResult {
    return improve_with_tricks(board, { use_swap: true, use_dissolve: true });
}

// --- Six-to-four: merge two 3-sets of the same value ---
//
// Two 3-card sets of the same value share at least 2 suits (pigeonhole).
// The shared suits are dups. If both dups can join runs, merge the
// remaining 4 distinct-suit cards into one 4-set.
// Score: lose 2×60=120 (two 3-sets), gain 120 (4-set) + run extensions.
// Net gain = run extensions only. Always positive if dups find homes.

import { is_pair_of_dups } from "../core/card";

type SixToFour = {
    set_index_a: number;
    set_index_b: number;
    score_delta: number;
};

function find_six_to_fours(stacks: CardStack[]): SixToFour[] {
    const results: SixToFour[] = [];

    // Find all pairs of 3-card sets with the same value.
    const sets_by_value = new Map<number, { index: number; stack: CardStack }[]>();
    for (let i = 0; i < stacks.length; i++) {
        const s = stacks[i];
        if (s.get_stack_type() !== CardStackType.SET || s.size() !== 3) continue;
        const val = s.get_cards()[0].value;
        if (!sets_by_value.has(val)) sets_by_value.set(val, []);
        sets_by_value.get(val)!.push({ index: i, stack: s });
    }

    for (const group of sets_by_value.values()) {
        if (group.length < 2) continue;

        for (let gi = 0; gi < group.length; gi++) {
            for (let gj = gi + 1; gj < group.length; gj++) {
                const a = group[gi];
                const b = group[gj];
                const a_cards = a.stack.get_cards();
                const b_cards = b.stack.get_cards();

                // Find distinct suits across both sets.
                const all_suits = new Map<Suit, Card[]>();
                for (const c of a_cards) {
                    if (!all_suits.has(c.suit)) all_suits.set(c.suit, []);
                    all_suits.get(c.suit)!.push(c);
                }
                for (const c of b_cards) {
                    if (!all_suits.has(c.suit)) all_suits.set(c.suit, []);
                    all_suits.get(c.suit)!.push(c);
                }

                // Need 4 distinct suits to form a 4-set.
                if (all_suits.size < 4) continue;

                // Identify dups: suits with 2 cards.
                const dup_cards: Card[] = [];
                const keep_cards: Card[] = [];
                for (const [suit, cards] of all_suits) {
                    if (cards.length === 2) {
                        dup_cards.push(cards[1]); // keep cards[0], dup is cards[1]
                        keep_cards.push(cards[0]);
                    } else {
                        keep_cards.push(cards[0]);
                    }
                }

                // We should have exactly 2 dups and 4 keepers.
                if (dup_cards.length !== 2 || keep_cards.length !== 4) continue;

                // Can both dups join a run (pure or rb)?
                let total_run_gain = 0;
                let all_placed = true;

                const used_targets = new Set<number>();
                for (const dup of dup_cards) {
                    const single = new CardStack(
                        [new BoardCard(dup, BoardCardState.FIRMLY_ON_BOARD)], loc);
                    let best_gain = 0;
                    let best_ti = -1;

                    for (let ti = 0; ti < stacks.length; ti++) {
                        if (ti === a.index || ti === b.index) continue;
                        if (used_targets.has(ti)) continue;

                        const merged = stacks[ti].left_merge(single) ?? stacks[ti].right_merge(single);
                        if (!merged) continue;
                        const mt = merged.get_stack_type();
                        if (mt !== CardStackType.PURE_RUN && mt !== CardStackType.RED_BLACK_RUN) continue;

                        const gain = Score.for_stack(merged) - Score.for_stack(stacks[ti]);
                        if (gain > best_gain) { best_gain = gain; best_ti = ti; }
                    }

                    if (best_ti < 0) { all_placed = false; break; }
                    used_targets.add(best_ti);
                    total_run_gain += best_gain;
                }

                if (!all_placed) continue;

                // Score delta: old = 60 + 60 = 120. New = 120 (4-set) + run gains.
                // Delta = run gains only.
                const delta = total_run_gain;
                if (delta > 0) {
                    results.push({ set_index_a: a.index, set_index_b: b.index, score_delta: delta });
                }
            }
        }
    }

    results.sort((a, b) => b.score_delta - a.score_delta);
    return results;
}

function apply_six_to_four(stacks: CardStack[], stf: SixToFour): boolean {
    const a = stacks[stf.set_index_a];
    const b = stacks[stf.set_index_b];
    const a_cards = a.get_cards();
    const b_cards = b.get_cards();

    // Rebuild: find dups and keepers.
    const all_suits = new Map<Suit, Card[]>();
    for (const c of a_cards) {
        if (!all_suits.has(c.suit)) all_suits.set(c.suit, []);
        all_suits.get(c.suit)!.push(c);
    }
    for (const c of b_cards) {
        if (!all_suits.has(c.suit)) all_suits.set(c.suit, []);
        all_suits.get(c.suit)!.push(c);
    }

    const dup_cards: Card[] = [];
    const keep_cards: Card[] = [];
    for (const [suit, cards] of all_suits) {
        if (cards.length === 2) {
            keep_cards.push(cards[0]);
            dup_cards.push(cards[1]);
        } else {
            keep_cards.push(cards[0]);
        }
    }

    // Place dups on runs.
    const used_targets = new Set<number>();
    const placements: { dup: Card; ti: number }[] = [];

    for (const dup of dup_cards) {
        const single = new CardStack(
            [new BoardCard(dup, BoardCardState.FIRMLY_ON_BOARD)], loc);
        let best_ti = -1;
        let best_gain = 0;

        for (let ti = 0; ti < stacks.length; ti++) {
            if (ti === stf.set_index_a || ti === stf.set_index_b) continue;
            if (used_targets.has(ti)) continue;

            const merged = stacks[ti].left_merge(single) ?? stacks[ti].right_merge(single);
            if (!merged) continue;
            const mt = merged.get_stack_type();
            if (mt !== CardStackType.PURE_RUN && mt !== CardStackType.RED_BLACK_RUN) continue;

            const gain = Score.for_stack(merged) - Score.for_stack(stacks[ti]);
            if (gain > best_gain) { best_gain = gain; best_ti = ti; }
        }

        if (best_ti < 0) return false;
        used_targets.add(best_ti);
        placements.push({ dup, ti: best_ti });
    }

    // Build the 4-set from keepers.
    const four_set = new CardStack(
        keep_cards.map((c) => new BoardCard(c, BoardCardState.FIRMLY_ON_BOARD)), loc);

    // Remove the two old sets (higher index first).
    const to_remove = [stf.set_index_a, stf.set_index_b].sort((a, b) => b - a);
    for (const idx of to_remove) stacks.splice(idx, 1);

    // Add the 4-set.
    stacks.push(four_set);

    // Place dups (adjust indices for removed stacks).
    for (const p of placements) {
        let ti = p.ti;
        for (const removed of to_remove) {
            if (ti > removed) ti--;
        }
        const single = new CardStack(
            [new BoardCard(p.dup, BoardCardState.FIRMLY_ON_BOARD)], loc);
        const merged = stacks[ti].left_merge(single) ?? stacks[ti].right_merge(single);
        if (!merged) return false;
        stacks[ti] = merged;
    }

    return true;
}

export function do_board_improvements_with_six_to_four(board: CardStack[]): ImprovementResult {
    return improve_with_tricks(board, { use_swap: true, use_dissolve: true, use_six_to_four: true });
}

// --- Main loop: join + promote until stable ---

// --- Consecutive-sets dissolve: turn sets into runs ---
//
// Find 3+ 3-card sets with consecutive values. Dissolve them all
// and try to form ONLY RUNS from the freed cards (no sets — that
// would cycle back). Leftovers try to join existing board stacks.

function find_consecutive_set_clusters(
    stacks: CardStack[],
): { indices: number[]; cards: Card[] }[] {
    // Collect all 3-card sets indexed by value.
    const sets_by_value = new Map<number, { index: number; cards: Card[] }>();
    for (let i = 0; i < stacks.length; i++) {
        const s = stacks[i];
        if (s.get_stack_type() !== CardStackType.SET || s.size() !== 3) continue;
        const val = s.get_cards()[0].value;
        // If we already have a set for this value, skip (six-to-four handles that).
        if (!sets_by_value.has(val)) {
            sets_by_value.set(val, { index: i, cards: [...s.get_cards()] });
        }
    }

    // Find runs of 3+ consecutive values.
    const values = [...sets_by_value.keys()].sort((a, b) => a - b);
    const clusters: { indices: number[]; cards: Card[] }[] = [];

    let run_start = 0;
    for (let i = 1; i <= values.length; i++) {
        const consecutive = i < values.length && values[i] === successor(values[i - 1] as CardValue);
        if (!consecutive) {
            const run_len = i - run_start;
            if (run_len >= 3) {
                const indices: number[] = [];
                const cards: Card[] = [];
                for (let j = run_start; j < i; j++) {
                    const entry = sets_by_value.get(values[j])!;
                    indices.push(entry.index);
                    cards.push(...entry.cards);
                }
                clusters.push({ indices, cards });
            }
            run_start = i;
        }
    }

    return clusters;
}

function try_consecutive_sets_to_runs(stacks: CardStack[]): {
    changed: boolean;
    score_delta: number;
} {
    const clusters = find_consecutive_set_clusters(stacks);
    if (clusters.length === 0) return { changed: false, score_delta: 0 };

    for (const cluster of clusters) {
        const old_score = cluster.indices.reduce(
            (s, i) => s + Score.for_stack(stacks[i]), 0);

        // Group the freed cards by suit to form pure runs.
        const by_suit = new Map<Suit, Card[]>();
        for (const c of cluster.cards) {
            if (!by_suit.has(c.suit)) by_suit.set(c.suit, []);
            by_suit.get(c.suit)!.push(c);
        }

        // Build pure runs from each suit group.
        const new_stacks: CardStack[] = [];
        const placed = new Set<Card>();

        for (const [_suit, suited] of by_suit) {
            suited.sort((a, b) => a.value - b.value);
            // Find consecutive chains of 3+.
            const chains: Card[][] = [];
            let chain: Card[] = [suited[0]];
            for (let i = 1; i < suited.length; i++) {
                if (suited[i].value === successor(chain[chain.length - 1].value as CardValue)) {
                    chain.push(suited[i]);
                } else {
                    chains.push(chain);
                    chain = [suited[i]];
                }
            }
            chains.push(chain);

            // Check K→A wrap: can the last chain (ending at K)
            // join the first chain (starting at A)?
            if (chains.length >= 2) {
                const last = chains[chains.length - 1];
                const first = chains[0];
                if (last[last.length - 1].value === 13 && first[0].value === 1) {
                    // Merge last + first into one wrap chain.
                    const wrapped = [...last, ...first];
                    chains[0] = wrapped;
                    chains.pop();
                }
            }

            for (const ch of chains) {
                if (ch.length >= 3) {
                    new_stacks.push(new CardStack(
                        ch.map((c) => new BoardCard(c, BoardCardState.FIRMLY_ON_BOARD)), loc));
                    for (const c of ch) placed.add(c);
                }
            }
        }

        // Leftover cards: try rb runs.
        const leftovers = cluster.cards.filter((c) => !placed.has(c));
        if (leftovers.length >= 3) {
            leftovers.sort((a, b) => a.value - b.value);
            // Try to form rb runs from leftovers.
            const used = new Set<Card>();
            for (let start = 0; start < leftovers.length; start++) {
                if (used.has(leftovers[start])) continue;
                const run: Card[] = [leftovers[start]];
                let last = leftovers[start];
                for (let j = start + 1; j < leftovers.length; j++) {
                    if (used.has(leftovers[j])) continue;
                    if (leftovers[j].value === successor(last.value as CardValue) &&
                        leftovers[j].color !== last.color) {
                        run.push(leftovers[j]);
                        last = leftovers[j];
                    }
                }
                if (run.length >= 3) {
                    const st = get_stack_type(run);
                    if (st === CardStackType.RED_BLACK_RUN) {
                        new_stacks.push(new CardStack(
                            run.map((c) => new BoardCard(c, BoardCardState.FIRMLY_ON_BOARD)), loc));
                        for (const c of run) { placed.add(c); used.add(c); }
                    }
                }
            }
        }

        // Remaining leftovers try to join existing board stacks.
        const still_left = cluster.cards.filter((c) => !placed.has(c));
        let leftover_gain = 0;
        const leftover_targets: { card: Card; ti: number }[] = [];
        const used_targets = new Set<number>();

        for (const c of still_left) {
            const single = new CardStack(
                [new BoardCard(c, BoardCardState.FIRMLY_ON_BOARD)], loc);
            for (let ti = 0; ti < stacks.length; ti++) {
                if (cluster.indices.includes(ti)) continue;
                if (used_targets.has(ti)) continue;
                const merged = stacks[ti].left_merge(single) ?? stacks[ti].right_merge(single);
                if (!merged) continue;
                const gain = Score.for_stack(merged) - Score.for_stack(stacks[ti]);
                if (gain > 0) {
                    leftover_gain += gain;
                    leftover_targets.push({ card: c, ti });
                    used_targets.add(ti);
                    placed.add(c);
                    break;
                }
            }
        }

        const orphans = cluster.cards.filter((c) => !placed.has(c));
        // If we have orphans, this attempt fails — can't leave singles.
        // But we allow orphans that can form a set (falling back to sets
        // only if we can't do better). Actually, to break cycles, just
        // reject if orphans exist.
        if (orphans.length > 0) continue;

        const new_score = new_stacks.reduce((s, st) => s + Score.for_stack(st), 0) + leftover_gain;
        const delta = new_score - old_score;

        if (delta > 0) {
            // Apply: remove old sets (highest index first), add new stacks.
            const sorted_indices = [...cluster.indices].sort((a, b) => b - a);
            for (const idx of sorted_indices) stacks.splice(idx, 1);
            for (const s of new_stacks) stacks.push(s);
            // Apply leftover placements (adjust indices).
            for (const lt of leftover_targets) {
                let ti = lt.ti;
                for (const removed of sorted_indices) {
                    if (ti > removed) ti--;
                }
                const single = new CardStack(
                    [new BoardCard(lt.card, BoardCardState.FIRMLY_ON_BOARD)], loc);
                const merged = stacks[ti].left_merge(single) ?? stacks[ti].right_merge(single);
                if (merged) stacks[ti] = merged;
            }
            return { changed: true, score_delta: delta };
        }
    }

    return { changed: false, score_delta: 0 };
}

export type ImprovementResult = {
    board: CardStack[];
    score_gained: number;
    upgrades_applied: number;
};

// Base loop: join + promote + swap + dissolve + six-to-four + consecutive-sets.
export function do_obvious_board_improvements(board: CardStack[]): ImprovementResult {
    return improve_with_tricks(board, { use_swap: true, use_dissolve: true, use_six_to_four: true, use_consecutive_sets: true });
}

// Extended loop: join + promote + board-swap.
export function do_board_improvements_with_swap(board: CardStack[]): ImprovementResult {
    return improve_with_tricks(board, { use_swap: true });
}

function improve_with_tricks(
    board: CardStack[],
    options: { use_swap?: boolean; use_split_promote?: boolean; use_dissolve?: boolean; use_six_to_four?: boolean; use_consecutive_sets?: boolean },
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

        // Trick 4: dissolve-set (optional).
        if (options.use_dissolve) {
            const dissolves = find_dissolves(stacks);
            if (dissolves.length > 0 && apply_dissolve(stacks, dissolves[0])) {
                total_gained += dissolves[0].score_delta;
                total_applied++;
                progress = true;
                continue;
            }
        }

        // Trick 5: six-to-four (optional).
        if (options.use_six_to_four) {
            const stfs = find_six_to_fours(stacks);
            if (stfs.length > 0 && apply_six_to_four(stacks, stfs[0])) {
                total_gained += stfs[0].score_delta;
                total_applied++;
                progress = true;
                continue;
            }
        }

        // Trick 6: consecutive-sets to runs (optional).
        if (options.use_consecutive_sets) {
            const result = try_consecutive_sets_to_runs(stacks);
            if (result.changed) {
                total_gained += result.score_delta;
                total_applied++;
                progress = true;
                continue;
            }
        }

        // Trick 7: split-promote (optional).
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
