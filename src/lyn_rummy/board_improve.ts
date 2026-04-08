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

import { Card } from "./card";
import {
    BoardCard, BoardCardState, CardStack,
    type BoardLocation,
} from "./card_stack";
import { CardStackType } from "./stack_type";
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

// --- Main loop: join + promote until stable ---

export function do_obvious_board_improvements(
    board: CardStack[],
): { board: CardStack[]; score_gained: number; upgrades_applied: number } {
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
    }

    return { board: stacks, score_gained: total_gained, upgrades_applied: total_applied };
}

// Expose find_upgrades for backward compatibility with tests.
export const find_upgrades = find_promotes;
