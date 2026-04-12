// Pure physics utilities for LynRummy boards. No notion of tricks,
// hints, or strategy — these describe what is legal to do with
// stacks of cards, independent of any algorithm that uses them.

import { CardStack } from "./card_stack";
import { CardStackType } from "./stack_type";

// Can this card be extracted from its stack without breaking it?
// Returns true if the card is on an end of a 4+ run, or if splitting
// the run at this position leaves two valid halves (3+ each), or if
// this is any card in a 4+ set.
//
// Three legal cases:
//   1. End of a 4+ run — peel left or right, remaining 3+ run is valid.
//   2. Middle of a 7+ run — removing leaves 3+ on each side.
//   3. Any card in a 4-card set — remaining 3-card set is valid.
export function can_extract(stack: CardStack, card_index: number): boolean {
    const cards = stack.board_cards;
    const size = cards.length;
    const st = stack.get_stack_type();

    if (st === CardStackType.SET) {
        return size >= 4;
    }

    if (st !== CardStackType.PURE_RUN && st !== CardStackType.RED_BLACK_RUN) {
        return false;
    }

    // End peel.
    if (size >= 4 && (card_index === 0 || card_index === size - 1)) {
        return true;
    }

    // Middle peel: both halves must be 3+.
    if (card_index >= 3 && (size - card_index - 1) >= 3) {
        return true;
    }

    return false;
}

// Join any pair of stacks whose cards merge into one valid stack.
// Iterates until no more joins are possible. Returns the consolidated
// board and whether anything actually changed.
export function join_adjacent_runs(
    board_stacks: CardStack[],
): { board: CardStack[]; changed: boolean } {
    const stacks = [...board_stacks];
    let changed = false;

    let progress = true;
    while (progress) {
        progress = false;
        for (let i = 0; i < stacks.length && !progress; i++) {
            for (let j = i + 1; j < stacks.length && !progress; j++) {
                const merged = stacks[i].right_merge(stacks[j])
                            ?? stacks[j].right_merge(stacks[i]);
                if (merged) {
                    stacks[i] = merged;
                    stacks.splice(j, 1);
                    changed = true;
                    progress = true;
                }
            }
        }
    }

    return { board: stacks, changed };
}
