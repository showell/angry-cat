// DIRECT_PLAY: a hand card extends an existing board stack at one of
// its ends. The simplest possible trick. Everyone knows this one
// before they know anything else.
//
// Pattern: for every hand card H and every board stack S, does H
// merge onto S's left or right end as a valid run/set extension?
// If yes, produce one Play per (H, S, side) tuple.

import { CardStack, HandCard } from "../core/card_stack";
import type { Play, Trick } from "./trick";

export const direct_play: Trick = {
    id: "direct_play",
    description: "Play a hand card onto the end of a stack.",

    find_plays(hand: HandCard[], board: CardStack[]): Play[] {
        const plays: Play[] = [];

        for (const hc of hand) {
            const single = CardStack.from_hand_card(hc, { top: 0, left: 0 });
            for (let i = 0; i < board.length; i++) {
                const stack = board[i];
                const right = stack.right_merge(single);
                if (right) {
                    plays.push(make_play(hc, i, right));
                    continue; // prefer the right-merge if both would work
                }
                const left = stack.left_merge(single);
                if (left) {
                    plays.push(make_play(hc, i, left));
                }
            }
        }

        return plays;
    },
};

function make_play(hc: HandCard, target_idx: number, merged: CardStack): Play {
    // Capture the hand card and the pre-computed merged stack. On
    // apply(), verify the target is still there (no other Play has
    // already mutated the stack) and swap it in.
    return {
        trick: direct_play,
        hand_cards: [hc],
        apply(board: CardStack[]): HandCard[] {
            // Re-check at apply time: the target stack may have been
            // mutated by a prior play in the same turn. If so, try to
            // merge again against whatever stack is at that index.
            const single = CardStack.from_hand_card(hc, { top: 0, left: 0 });
            if (target_idx < board.length) {
                const stack = board[target_idx];
                const remerged = stack.right_merge(single) ?? stack.left_merge(single);
                if (remerged) {
                    board[target_idx] = remerged;
                    return [hc];
                }
            }
            // Fallback: rescan. The cached target may have shifted.
            for (let i = 0; i < board.length; i++) {
                const s = board[i];
                const m = s.right_merge(single) ?? s.left_merge(single);
                if (m) {
                    board[i] = m;
                    return [hc];
                }
            }
            // Pre-computed merge used for caching; unused here but kept
            // to preserve the reference for future serialization work.
            void merged;
            return [];
        },
    };
}
