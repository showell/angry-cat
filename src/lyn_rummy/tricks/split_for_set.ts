// SPLIT_FOR_SET: a hand card of value V finds two same-value, different-
// suit board cards that can be extracted, and the three together form
// a new 3-set on the board.
//
// Pattern (hand card value V, suit X):
//   Scan the board for value-V cards whose suit ≠ X and which satisfy
//   can_extract (end-peel, set-peel, or middle-peel). Pick two with
//   distinct suits ≠ X. The three cards form a new SET.
//
// Why "split": the typical extraction is from runs, which means peeling
// from the end of a 4+ run or splitting a long run at a value-V pivot.
// Sets contribute too — a 4-set of Vs can give up one of its members.
//
// What it does NOT do:
//   - Extend an existing 3-set on the board (that's DIRECT_PLAY).
//   - Steal a card to extend an existing run (that's PEEL_FOR_RUN).
//   - Use 2 hand cards (those are PAIR_PEEL / PAIR_DISSOLVE).
// SPLIT_FOR_SET is "I have one V, I take two more V's off the board,
// and now there's a brand-new V-set."

import { Card, Suit } from "../core/card";
import { CardStack, HandCard } from "../core/card_stack";
import { CardStackType, get_stack_type } from "../core/stack_type";
import { can_extract } from "../core/board_physics";
import type { Play, Trick } from "./trick";
import { DUMMY_LOC, extract_card, freshly_played } from "./helpers";

type ExtractCandidate = {
    stack_idx: number;
    card_idx: number;
    suit: Suit;
    card: Card;
};

export const split_for_set: Trick = {
    id: "split_for_set",
    description: "Take two same-value cards out of the board and form a new set with your hand card.",

    find_plays(hand: HandCard[], board: CardStack[]): Play[] {
        const plays: Play[] = [];
        for (const hc of hand) {
            const candidates = find_extractable_same_value(hc.card, board);
            if (candidates.length < 2) continue;
            const pair = pick_two_distinct_suits(candidates, hc.card.suit);
            if (!pair) continue;
            // Sanity check: the resulting trio is a valid SET.
            const trio = [hc.card, pair[0].card, pair[1].card];
            if (get_stack_type(trio) !== CardStackType.SET) continue;
            plays.push(make_play(hc, pair[0], pair[1]));
        }
        return plays;
    },
};

function find_extractable_same_value(card: Card, board: CardStack[]): ExtractCandidate[] {
    const out: ExtractCandidate[] = [];
    for (let si = 0; si < board.length; si++) {
        const cards = board[si].get_cards();
        for (let ci = 0; ci < cards.length; ci++) {
            const bc = cards[ci];
            if (bc.value !== card.value) continue;
            if (bc.suit === card.suit) continue;
            if (!can_extract(board[si], ci)) continue;
            out.push({ stack_idx: si, card_idx: ci, suit: bc.suit, card: bc });
        }
    }
    return out;
}

// Pick the first two candidates with distinct suits that aren't the
// hand-card's suit. Prefer different stacks so extraction order is
// straightforward. Returns null if no valid pair exists.
function pick_two_distinct_suits(
    cands: ExtractCandidate[], hand_suit: Suit,
): [ExtractCandidate, ExtractCandidate] | null {
    for (let i = 0; i < cands.length; i++) {
        for (let j = i + 1; j < cands.length; j++) {
            if (cands[i].suit === cands[j].suit) continue;
            if (cands[i].suit === hand_suit) continue;
            if (cands[j].suit === hand_suit) continue;
            return [cands[i], cands[j]];
        }
    }
    return null;
}

function make_play(hc: HandCard, a: ExtractCandidate, b: ExtractCandidate): Play {
    return {
        trick: split_for_set,
        hand_cards: [hc],
        apply(board: CardStack[]): HandCard[] {
            // Re-verify both candidates are still where we left them.
            // Apply-time mutations from earlier plays this turn could
            // shift indices. Rather than tracking that, we re-locate
            // the cards by identity at apply time.
            const cand_a = relocate(board, a.card);
            if (!cand_a) return [];
            const ext_a = extract_card(board, cand_a.stack_idx, cand_a.card_idx);
            if (!ext_a) return [];
            const cand_b = relocate(board, b.card);
            if (!cand_b) {
                // We already extracted A. The board state is now mid-mutation.
                // Best-effort: bail; a future cascade pass can re-evaluate.
                return [];
            }
            const ext_b = extract_card(board, cand_b.stack_idx, cand_b.card_idx);
            if (!ext_b) return [];

            const new_set = new CardStack(
                [freshly_played(hc), ext_a, ext_b],
                DUMMY_LOC,
            );
            board.push(new_set);
            return [hc];
        },
    };
}

function relocate(board: CardStack[], target: Card): { stack_idx: number; card_idx: number } | null {
    for (let si = 0; si < board.length; si++) {
        const cards = board[si].get_cards();
        for (let ci = 0; ci < cards.length; ci++) {
            const bc = cards[ci];
            if (bc.value === target.value &&
                bc.suit === target.suit &&
                bc.origin_deck === target.origin_deck &&
                can_extract(board[si], ci)) {
                return { stack_idx: si, card_idx: ci };
            }
        }
    }
    return null;
}
