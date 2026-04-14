// PAIR_PEEL: two hand cards form a pair (set-pair or run-pair) and a
// peelable board card completes the triplet.
//
// Three pair shapes:
//   - Set pair: same value, different suit. Needs a third suit.
//   - Pure-run pair: same suit, consecutive values. Needs predecessor
//     or successor in the same suit.
//   - Rb-run pair: opposite colors, consecutive values. Needs predecessor
//     or successor in the opposite color (two possible suits).

import { Card, CardColor, Suit } from "../core/card";
import {
    BoardCard,
    BoardCardState,
    CardStack,
    HandCard,
} from "../core/card_stack";
import { predecessor, successor } from "../core/stack_type";
import { can_extract } from "../core/board_physics";
import type { Play, Trick } from "./trick";
import { DUMMY_LOC, extract_card, freshly_played } from "./helpers";

type PairNeed = { value: number; suits: Suit[] };

export const pair_peel: Trick = {
    id: "pair_peel",
    description: "Peel a board card to complete a pair in your hand.",

    find_plays(hand: HandCard[], board: CardStack[]): Play[] {
        const plays: Play[] = [];

        for (let i = 0; i < hand.length; i++) {
            for (let j = i + 1; j < hand.length; j++) {
                const hca = hand[i], hcb = hand[j];
                if (hca.card.equals(hcb.card)) continue;

                for (const need of pair_needs(hca.card, hcb.card)) {
                    for (let si = 0; si < board.length; si++) {
                        const cards = board[si].get_cards();
                        for (let ci = 0; ci < cards.length; ci++) {
                            const bc = cards[ci];
                            if (bc.value !== need.value) continue;
                            if (!need.suits.includes(bc.suit)) continue;
                            if (!can_extract(board[si], ci)) continue;

                            plays.push(make_play(hca, hcb, si, ci, bc));
                        }
                    }
                }
            }
        }

        return plays;
    },
};

function make_play(
    hca: HandCard,
    hcb: HandCard,
    stack_idx: number,
    card_idx: number,
    peel_target: Card,
): Play {
    return new PairPeelPlay(hca, hcb, stack_idx, card_idx, peel_target);
}

// A single PAIR_PEEL: two hand cards + one peel target (by
// identity). State is explicit: both hand cards, the peel target's
// cached (stack, position), and the target's Card identity for
// re-verification at apply time.
class PairPeelPlay implements Play {
    readonly trick = pair_peel;
    readonly hand_cards: HandCard[];

    constructor(
        private readonly hca: HandCard,
        private readonly hcb: HandCard,
        private readonly stack_idx: number,
        private readonly card_idx: number,
        private readonly peel_target: Card,
    ) {
        this.hand_cards = [hca, hcb];
    }

    apply(board: CardStack[]): HandCard[] {
        if (this.stack_idx >= board.length) return [];
        const cards = board[this.stack_idx].board_cards;
        if (this.card_idx >= cards.length) return [];
        const bc = cards[this.card_idx];
        if (bc.card.value !== this.peel_target.value ||
            bc.card.suit !== this.peel_target.suit ||
            bc.card.origin_deck !== this.peel_target.origin_deck) return [];
        if (!can_extract(board[this.stack_idx], this.card_idx)) return [];

        const extracted = extract_card(board, this.stack_idx, this.card_idx);
        if (!extracted) return [];

        const group = [
            freshly_played(this.hca),
            freshly_played(this.hcb),
            extracted,
        ].sort((x, y) => x.card.value - y.card.value);
        const new_stack = new CardStack(group, DUMMY_LOC);

        // Belt-and-braces: detector should guarantee validity.
        if (new_stack.problematic() || new_stack.incomplete()) return [];

        board.push(new_stack);
        return [this.hca, this.hcb];
    }
}

// "What card would complete this pair?" Returns zero or more needs.
function pair_needs(a: Card, b: Card): PairNeed[] {
    // Set pair.
    if (a.value === b.value && a.suit !== b.suit) {
        const suits = [Suit.HEART, Suit.SPADE, Suit.DIAMOND, Suit.CLUB]
            .filter(s => s !== a.suit && s !== b.suit);
        return [{ value: a.value, suits }];
    }

    // Run pair needs consecutive values.
    const lo = a.value < b.value ? a : b;
    const hi = a.value < b.value ? b : a;
    if (hi.value !== successor(lo.value)) return [];

    if (a.suit === b.suit) {
        // Pure-run pair.
        return [
            { value: predecessor(lo.value), suits: [lo.suit] },
            { value: successor(hi.value),   suits: [hi.suit] },
        ];
    }
    if (a.color !== b.color) {
        // Rb-run pair.
        const opp_lo = lo.color === CardColor.RED ? [Suit.SPADE, Suit.CLUB] : [Suit.HEART, Suit.DIAMOND];
        const opp_hi = hi.color === CardColor.RED ? [Suit.SPADE, Suit.CLUB] : [Suit.HEART, Suit.DIAMOND];
        return [
            { value: predecessor(lo.value), suits: opp_lo },
            { value: successor(hi.value),   suits: opp_hi },
        ];
    }
    return [];
}

// Suppress unused-import lint if BoardCard/BoardCardState drift:
void BoardCard; void BoardCardState;
