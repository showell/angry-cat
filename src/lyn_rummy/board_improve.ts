// Board score improvements: find and apply obvious upgrades.
//
// An "obvious upgrade" is a single peelable card that can move
// from a lower-scoring stack type to a higher-scoring one.
// Pure run (100) > set (60) > red/black run (50).

import { Card, Suit, value_str } from "./card";
import {
    BoardCard, BoardCardState, CardStack,
    type BoardLocation,
} from "./card_stack";
import { CardStackType } from "./stack_type";
import { Score } from "./score";
import { can_extract } from "./hints";

const loc: BoardLocation = { top: 0, left: 0 };

export type Upgrade = {
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

    // Middle split: both halves 3+.
    if (card_index >= 3 && (size - card_index - 1) >= 3) {
        // Can't return a single remaining stack for a middle split.
        // Skip for now — middle splits produce two stacks.
        return undefined;
    }

    return undefined;
}

// Find all single-card upgrades on the board.
export function find_upgrades(board: CardStack[]): Upgrade[] {
    const upgrades: Upgrade[] = [];

    for (let si = 0; si < board.length; si++) {
        const source = board[si];
        if (!can_extract(source, 0) && !can_extract(source, source.size() - 1)) {
            // Quick skip: if neither end is peelable, skip.
            // (4-card sets are handled below.)
            if (source.get_stack_type() !== CardStackType.SET || source.size() < 4) {
                continue;
            }
        }

        for (let ci = 0; ci < source.get_cards().length; ci++) {
            if (!can_extract(source, ci)) continue;

            const card = source.get_cards()[ci];
            const single_bc = new BoardCard(card, BoardCardState.FIRMLY_ON_BOARD);
            const single = new CardStack([single_bc], loc);

            for (let ti = 0; ti < board.length; ti++) {
                if (ti === si) continue;
                const target = board[ti];

                const merged = target.left_merge(single) ?? target.right_merge(single);
                if (!merged) continue;

                // Compute score delta.
                const extracted = extract_card(source, ci);
                if (!extracted) continue;

                const old_score = Score.for_stack(source) + Score.for_stack(target);
                const new_score = Score.for_stack(extracted.remaining) + Score.for_stack(merged);
                const delta = new_score - old_score;

                if (delta > 0) {
                    upgrades.push({
                        card,
                        source_index: si,
                        target_index: ti,
                        card_index: ci,
                        score_delta: delta,
                    });
                }
            }
        }
    }

    upgrades.sort((a, b) => b.score_delta - a.score_delta);
    return upgrades;
}

// Apply the best upgrade repeatedly until no more exist.
// Returns the improved board and total score gained.
export function do_obvious_board_improvements(
    board: CardStack[],
): { board: CardStack[]; score_gained: number; upgrades_applied: number } {
    const stacks = [...board];
    let total_gained = 0;
    let total_applied = 0;

    let progress = true;
    while (progress) {
        progress = false;
        const upgrades = find_upgrades(stacks);
        if (upgrades.length === 0) break;

        // Apply the best upgrade.
        const best = upgrades[0];
        const source = stacks[best.source_index];
        const extracted = extract_card(source, best.card_index);
        if (!extracted) break;

        const single = new CardStack(
            [new BoardCard(best.card, BoardCardState.FIRMLY_ON_BOARD)], loc);
        const target = stacks[best.target_index];
        const merged = target.left_merge(single) ?? target.right_merge(single);
        if (!merged) break;

        stacks[best.source_index] = extracted.remaining;
        stacks[best.target_index] = merged;

        total_gained += best.score_delta;
        total_applied++;
        progress = true;
    }

    return { board: stacks, score_gained: total_gained, upgrades_applied: total_applied };
}
