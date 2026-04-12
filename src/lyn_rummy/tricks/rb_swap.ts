// RB_SWAP ("substitute trick"): kick a same-value, same-color, different-
// suit card out of an rb (red/black alternating) run and slot the hand
// card into its seat. The kicked card must find a home on a pure run
// or a not-yet-full set.
//
// Pattern (hand card value V, color C):
//   rb run contains another card at value V, color C, different suit
//   AND the kicked card can land on some OTHER stack (pure run or
//   set of size < 4 of that value).
//
// Why RB specifically, and not pure runs or sets:
//
//   Pure run: substitute would have to be same value + same color +
//   different suit. But pure runs are single-suit. Inserting a card
//   of a different suit makes the stack non-pure, and its colors all
//   match (all red or all black) so it isn't rb either — a bogus
//   stack. If the hand card is the SAME suit (other deck), swapping
//   just trades one deck-tagged card for the other; net zero.
//
//   Set: a set has all distinct suits by rule. There is no "same
//   value same color different suit" slot to target — suits are
//   already maximally distinct. The set's own extraction primitive
//   (peel from size >= 4) covers what kicking-from-a-set means in
//   practice, and shows up inside SPLIT_FOR_SET / PEEL_FOR_RUN /
//   PAIR_DISSOLVE rather than as its own swap trick.
//
// At a real card table the substitute is a single two-handed gesture:
// slide the hand card in, catch the kicked card popping out, flick
// it to its new home. In the UI it's several operations.

import { Card } from "../core/card";
import {
    BoardCard,
    BoardCardState,
    CardStack,
    HandCard,
} from "../core/card_stack";
import { CardStackType, get_stack_type } from "../core/stack_type";
import type { Play, Trick } from "./trick";
import { DUMMY_LOC, single_stack_from_card } from "./helpers";

export const rb_swap: Trick = {
    id: "rb_swap",
    description: "Substitute your card for a same-color one in an rb run; the kicked card goes to a set or pure run.",

    find_plays(hand: HandCard[], board: CardStack[]): Play[] {
        const plays: Play[] = [];

        for (const hc of hand) {
            for (let si = 0; si < board.length; si++) {
                const stack = board[si];
                if (stack.stack_type !== CardStackType.RED_BLACK_RUN) continue;
                const cards = stack.get_cards();

                for (let ci = 0; ci < cards.length; ci++) {
                    const bc = cards[ci];
                    if (bc.value !== hc.card.value) continue;
                    if (bc.color !== hc.card.color) continue;
                    if (bc.suit === hc.card.suit) continue;

                    // The rb run must stay rb after the substitution.
                    const swapped = cards.map((c, i) => i === ci ? hc.card : c);
                    if (get_stack_type(swapped) !== CardStackType.RED_BLACK_RUN) continue;

                    // The kicked card needs a home somewhere else.
                    const kicked = bc;
                    const home_idx = find_kicked_home(board, si, kicked);
                    if (home_idx < 0) continue;

                    plays.push(make_play(hc, si, ci, kicked, home_idx));
                }
            }
        }

        return plays;
    },
};

function make_play(
    hc: HandCard,
    run_idx: number,
    run_pos: number,
    kicked: Card,
    home_idx: number,
): Play {
    return {
        trick: rb_swap,
        hand_cards: [hc],
        apply(board: CardStack[]): HandCard[] {
            // Re-verify everything at apply time. If the board shifted,
            // the indices we captured may no longer be valid.
            if (run_idx >= board.length || home_idx >= board.length) return [];
            const stack = board[run_idx];
            if (stack.stack_type !== CardStackType.RED_BLACK_RUN) return [];
            const cards = stack.get_cards();
            if (run_pos >= cards.length) return [];
            const current = cards[run_pos];
            if (current.value !== kicked.value || current.suit !== kicked.suit ||
                current.origin_deck !== kicked.origin_deck) return [];

            // Substitute in the run.
            const new_run_cards = stack.board_cards.map((b, i) =>
                i === run_pos ? new BoardCard(hc.card, BoardCardState.FRESHLY_PLAYED) : b);
            board[run_idx] = new CardStack(new_run_cards, stack.loc);

            // Home the kicked card.
            place_kicked(board, home_idx, kicked);
            return [hc];
        },
    };
}

// Find an index for the kicked card: a same-value set with <4 cards
// missing this suit, or a pure run that accepts the card at an end.
function find_kicked_home(board: CardStack[], skip: number, kicked: Card): number {
    for (let j = 0; j < board.length; j++) {
        if (j === skip) continue;
        const target = board[j];
        const tst = target.stack_type;
        if (tst === CardStackType.SET && target.board_cards.length < 4) {
            const suits = target.board_cards.map(b => b.card.suit);
            if (target.board_cards[0].card.value === kicked.value &&
                !suits.includes(kicked.suit)) {
                return j;
            }
        }
        if (tst === CardStackType.PURE_RUN) {
            const single = single_stack_from_card(kicked);
            if (target.left_merge(single) || target.right_merge(single)) {
                return j;
            }
        }
    }
    return -1;
}

function place_kicked(board: CardStack[], dest_idx: number, kicked: Card): void {
    const dest = board[dest_idx];
    if (dest.stack_type === CardStackType.SET) {
        board[dest_idx] = new CardStack(
            [...dest.board_cards, new BoardCard(kicked, BoardCardState.FIRMLY_ON_BOARD)],
            dest.loc,
        );
    } else {
        const single = single_stack_from_card(kicked);
        const merged = dest.left_merge(single) ?? dest.right_merge(single);
        if (merged) board[dest_idx] = merged;
    }
}
