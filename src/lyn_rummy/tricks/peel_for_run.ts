// PEEL_FOR_RUN: a hand card of value V finds two extractable board
// cards at values V-1 and V+1 such that the three cards form a
// valid 3-card run (pure or rb). The two board cards get peeled off
// their stacks and the new run gets pushed.
//
// Family: same shape as SPLIT_FOR_SET, except we want consecutive
// values instead of same value, and the resulting group is a run
// rather than a set.
//
// Detection skeleton:
//   For each hand card H (value V):
//     Find peelable board cards of value V-1 and V+1 (from different
//       stacks, or same stack at extractable positions).
//     For each cross-product candidate pair, check whether
//       {predecessor, H, successor} forms a valid PURE_RUN or
//       RED_BLACK_RUN via get_stack_type.
//     If yes, that's a Play.
//
// Apply: peel the two board cards (highest stack/card index first to
// avoid shifting), assemble the trio in value order, push as a new
// board stack.

import { Card } from "../core/card";
import { CardStack, HandCard } from "../core/card_stack";
import { CardStackType, get_stack_type, predecessor, successor } from "../core/stack_type";
import { can_extract } from "../core/board_physics";
import type { Play, Trick } from "./trick";
import { extract_card, freshly_played, push_new_stack } from "./helpers";

type Neighbor = {
    stack_idx: number;
    card_idx: number;
    card: Card;
};

export const peel_for_run: Trick = {
    id: "peel_for_run",
    description: "Peel two adjacent-value board cards to form a new run with your hand card.",

    find_plays(hand: HandCard[], board: CardStack[]): Play[] {
        const plays: Play[] = [];
        for (const hc of hand) {
            const v = hc.card.value;
            const prev_v = predecessor(v);
            const next_v = successor(v);

            const prevs = find_peelable_at_value(board, prev_v, hc.card);
            const nexts = find_peelable_at_value(board, next_v, hc.card);
            if (prevs.length === 0 || nexts.length === 0) continue;

            for (const p of prevs) {
                for (const n of nexts) {
                    if (p.stack_idx === n.stack_idx) continue;
                    const trio = [p.card, hc.card, n.card];
                    const t = get_stack_type(trio);
                    if (t !== CardStackType.PURE_RUN &&
                        t !== CardStackType.RED_BLACK_RUN) continue;
                    plays.push(make_play(hc, p, n));
                }
            }
        }
        return plays;
    },
};

function find_peelable_at_value(
    board: CardStack[], value: number, exclude: Card,
): Neighbor[] {
    const out: Neighbor[] = [];
    for (let si = 0; si < board.length; si++) {
        const cards = board[si].get_cards();
        for (let ci = 0; ci < cards.length; ci++) {
            const bc = cards[ci];
            if (bc.value !== value) continue;
            if (bc.equals(exclude)) continue;
            if (!can_extract(board[si], ci)) continue;
            out.push({ stack_idx: si, card_idx: ci, card: bc });
        }
    }
    return out;
}

function make_play(hc: HandCard, prev: Neighbor, next: Neighbor): Play {
    return new PeelForRunPlay(hc, prev.card, next.card);
}

// A single PEEL_FOR_RUN: one hand card + two target board cards
// (value V-1 and V+1, distinct stacks). State is explicit: the
// hand card and the two target-card identities. At apply() we
// relocate each by identity because earlier plays this turn may
// have shifted indices.
class PeelForRunPlay implements Play {
    readonly trick = peel_for_run;
    readonly hand_cards: HandCard[];

    constructor(
        private readonly hand_card: HandCard,
        private readonly target_prev: Card,
        private readonly target_next: Card,
    ) {
        this.hand_cards = [hand_card];
    }

    apply(board: CardStack[]): HandCard[] {
        const here_prev = relocate(board, this.target_prev);
        if (!here_prev) return [];
        const here_next = relocate(board, this.target_next);
        if (!here_next) return [];
        if (here_prev.stack_idx === here_next.stack_idx) return [];

        // Extract higher (stack_idx, card_idx) first so the earlier
        // index stays valid.
        const extractFirstPrev =
            here_prev.stack_idx > here_next.stack_idx ||
            (here_prev.stack_idx === here_next.stack_idx &&
             here_prev.card_idx > here_next.card_idx);

        const firstLoc = extractFirstPrev ? here_prev : here_next;
        const firstTargetCard = extractFirstPrev ? this.target_prev : this.target_next;
        const secondTargetCard = extractFirstPrev ? this.target_next : this.target_prev;

        const ext0 = extract_card(board, firstLoc.stack_idx, firstLoc.card_idx);
        if (!ext0) return [];

        const secondAfter = relocate(board, secondTargetCard);
        if (!secondAfter) return [];
        const ext1 = extract_card(board, secondAfter.stack_idx, secondAfter.card_idx);
        if (!ext1) return [];

        // Assemble in value order so the new stack reads naturally.
        const trio = [freshly_played(this.hand_card), ext0, ext1]
            .sort((a, b) => a.card.value - b.card.value);
        push_new_stack(board, trio);
        // Preserve the reference to target_prev/target_next; used
        // only via the closures above. (No void needed — fields
        // are read.)
        void firstTargetCard;
        return [this.hand_card];
    }
}

function relocate(board: CardStack[], target: Card): Neighbor | null {
    for (let si = 0; si < board.length; si++) {
        const cards = board[si].get_cards();
        for (let ci = 0; ci < cards.length; ci++) {
            const bc = cards[ci];
            if (bc.value === target.value &&
                bc.suit === target.suit &&
                bc.origin_deck === target.origin_deck &&
                can_extract(board[si], ci)) {
                return { stack_idx: si, card_idx: ci, card: bc };
            }
        }
    }
    return null;
}
