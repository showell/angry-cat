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
                if (stack.right_merge(single)) {
                    plays.push(new DirectPlayPlay(hc, i));
                    continue; // prefer the right-merge if both would work
                }
                if (stack.left_merge(single)) {
                    plays.push(new DirectPlayPlay(hc, i));
                }
            }
        }

        return plays;
    },
};

// A single DIRECT_PLAY: one hand card onto a known stack index.
// State is explicit: the hand card and the target index. At apply()
// time we re-derive the merge because the board may have shifted.
class DirectPlayPlay implements Play {
    readonly trick = direct_play;
    readonly hand_cards: HandCard[];

    constructor(
        private readonly hand_card: HandCard,
        private readonly target_idx: number,
    ) {
        this.hand_cards = [hand_card];
    }

    apply(board: CardStack[]): HandCard[] {
        const single = CardStack.from_hand_card(
            this.hand_card, { top: 0, left: 0 });

        // Primary: the cached target_idx. Valid unless a prior play in
        // the same turn mutated this slot.
        if (this.target_idx < board.length) {
            const stack = board[this.target_idx];
            const merged = stack.right_merge(single) ?? stack.left_merge(single);
            if (merged) {
                board[this.target_idx] = merged;
                return [this.hand_card];
            }
        }

        // Fallback: rescan. Another play shifted things; find any stack
        // that still accepts this hand card.
        for (let i = 0; i < board.length; i++) {
            const merged = board[i].right_merge(single) ?? board[i].left_merge(single);
            if (merged) {
                board[i] = merged;
                return [this.hand_card];
            }
        }
        return [];
    }
}
