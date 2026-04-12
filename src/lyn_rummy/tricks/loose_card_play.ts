// LOOSE_CARD_PLAY: move one board card from its stack onto another
// stack, then play a hand card that the new arrangement accepts.
//
// Pattern:
//   For each peelable board card B (size-4 run end, 4-set member, or
//   middle-of-7+ run pivot), try merging B onto every other stack S2.
//   If the merge is valid and creates/maintains a legal stack, check
//   whether any hand card H now directly extends the resulting board.
//   If yes, that's a LOOSE_CARD_PLAY: peel B, merge B onto S2, play H.
//
// This is the "shuffle one tile to make room" gesture humans do all
// the time at the kitchen table. Common, productive, often the only
// way to play a card whose neighbor isn't currently exposed.
//
// Detection cost: O(peelable × stacks × hand_cards). Boards usually
// have ~10 stacks with 1–3 peelable cards each, so per turn that's
// dozens of combinations — cheap.

import { Card } from "../core/card";
import { CardStack, HandCard } from "../core/card_stack";
import { can_extract } from "../core/board_physics";
import type { Play, Trick } from "./trick";
import { extract_card, freshly_played, single_stack_from_card } from "./helpers";

type LooseMove = {
    src_idx: number;          // stack to peel from
    src_card_idx: number;     //   peel position
    src_card: Card;           //   the card itself (for re-locate at apply)
    dest_idx: number;         // stack to merge onto
    dest_card: Card;          //   anchor identity (for re-locate)
    hand_card: HandCard;      // hand card that becomes playable after the move
};

export const loose_card_play: Trick = {
    id: "loose_card_play",
    description: "Move one board card to a new home, then play a hand card on the resulting board.",

    find_plays(hand: HandCard[], board: CardStack[]): Play[] {
        const plays: Play[] = [];

        // Hand cards that aren't directly playable on the current board.
        // (No need to "loose-move" for cards that can already play.)
        const stranded = hand.filter(hc => !card_extends_any_stack(hc.card, board));
        if (stranded.length === 0) return plays;

        // Try every peelable card.
        for (let src = 0; src < board.length; src++) {
            const cards = board[src].get_cards();
            for (let ci = 0; ci < cards.length; ci++) {
                if (!can_extract(board[src], ci)) continue;
                const peeled = cards[ci];

                // Try merging onto every other stack.
                for (let dest = 0; dest < board.length; dest++) {
                    if (dest === src) continue;
                    const dest_stack = board[dest];
                    const dest_anchor = dest_stack.get_cards()[0];
                    const single = single_stack_from_card(peeled);
                    const merged = dest_stack.left_merge(single)
                                ?? dest_stack.right_merge(single);
                    if (!merged) continue;
                    if (merged.problematic() || merged.incomplete()) continue;

                    // Build the would-be board.
                    const sim = simulate_move(board, src, ci, dest, merged);
                    if (!sim) continue;

                    // Any stranded hand card now playable?
                    for (const hc of stranded) {
                        if (!card_extends_any_stack(hc.card, sim)) continue;
                        plays.push(make_play({
                            src_idx: src,
                            src_card_idx: ci,
                            src_card: peeled,
                            dest_idx: dest,
                            dest_card: dest_anchor,
                            hand_card: hc,
                        }));
                    }
                }
            }
        }

        return plays;
    },
};

// Does this single card extend any board stack as a direct play?
function card_extends_any_stack(card: Card, board: CardStack[]): boolean {
    const single = single_stack_from_card(card);
    for (const s of board) {
        if (s.left_merge(single) || s.right_merge(single)) return true;
    }
    return false;
}

// Compute the board after peeling (src, ci) and replacing dest with
// merged. Returns null if the peel would yield a bogus residual.
function simulate_move(
    board: CardStack[], src: number, ci: number, dest: number, merged: CardStack,
): CardStack[] | null {
    const sim_src = peel_into_residual(board[src], ci);
    if (sim_src === undefined) return null;
    const out = board.slice();
    if (sim_src === null) {
        // Peel left the source empty (shouldn't happen for can_extract'd
        // peels since 4-card stacks become 3-card; defensive).
        out.splice(src, 1);
        out[src > dest ? dest : dest - 1] = merged;
    } else {
        out[src] = sim_src;
        out[dest] = merged;
    }
    return out;
}

// Return the source stack after peeling card_idx, or null/undefined if
// peeling produces something invalid. Mirrors what extract_card does
// to the source side without touching the original board.
function peel_into_residual(stack: CardStack, card_idx: number): CardStack | null | undefined {
    const cards = stack.board_cards;
    const size = cards.length;
    const st = stack.stack_type;

    if (card_idx === 0 && size >= 4) {
        return new CardStack(cards.slice(1), stack.loc);
    }
    if (card_idx === size - 1 && size >= 4) {
        return new CardStack(cards.slice(0, -1), stack.loc);
    }
    // Set: any card from 4-set.
    if (size >= 4 && stack.stack_type === stack.stack_type /* always true */) {
        if (st !== undefined) {
            // Set check inline — keep dependency-free here.
        }
    }
    // Middle-peel of run.
    if (card_idx >= 3 && (size - card_idx - 1) >= 3) {
        // Splits in two; the source side becomes the LEFT half. The
        // RIGHT half goes to the end of the board, but we don't care
        // about it for direct-play detection (it can't accept the
        // hand card here unless the simulation is more elaborate).
        return new CardStack(cards.slice(0, card_idx), stack.loc);
    }
    // Set 4-peel: any position works for size-4 sets.
    if (size >= 4) {
        const remaining = cards.filter((_, i) => i !== card_idx);
        return new CardStack(remaining, stack.loc);
    }
    return undefined;
}

function make_play(m: LooseMove): Play {
    return {
        trick: loose_card_play,
        hand_cards: [m.hand_card],
        apply(board: CardStack[]): HandCard[] {
            // Re-locate by identity at apply time.
            const src_now = relocate(board, m.src_card);
            if (!src_now) return [];
            const dest_now = relocate_stack(board, m.dest_card);
            if (dest_now < 0 || dest_now === src_now.stack_idx) return [];

            // Peel the source card.
            const peeled = extract_card(board, src_now.stack_idx, src_now.card_idx);
            if (!peeled) return [];

            // Merge onto the dest stack.
            const dest_stack = board[dest_now];
            const single = single_stack_from_card(peeled.card);
            const merged = dest_stack.left_merge(single) ?? dest_stack.right_merge(single);
            if (!merged) return [];
            if (merged.problematic() || merged.incomplete()) return [];
            board[dest_now] = merged;

            // Now the hand card should extend some stack. Find and apply.
            const hand_single = single_stack_from_card(m.hand_card.card);
            for (let i = 0; i < board.length; i++) {
                const ext = board[i].right_merge(hand_single)
                         ?? board[i].left_merge(hand_single);
                if (ext) {
                    // Replace cards at the join position with FRESHLY_PLAYED
                    // marking — best-effort visual cue.
                    board[i] = ext;
                    // Mark the hand card as freshly played by replacing its
                    // BoardCard instance.
                    mark_freshly_played(board, i, m.hand_card);
                    return [m.hand_card];
                }
            }
            return [];
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

function relocate_stack(board: CardStack[], anchor: Card): number {
    for (let si = 0; si < board.length; si++) {
        const first = board[si].get_cards()[0];
        if (first.value === anchor.value &&
            first.suit === anchor.suit &&
            first.origin_deck === anchor.origin_deck) {
            return si;
        }
    }
    return -1;
}

// Replace the BoardCard at the matching position in board[stack_idx]
// with a FRESHLY_PLAYED version of hand_card. Best-effort visual cue.
function mark_freshly_played(board: CardStack[], stack_idx: number, hc: HandCard): void {
    const stack = board[stack_idx];
    const new_cards = stack.board_cards.map(b =>
        (b.card.value === hc.card.value &&
         b.card.suit === hc.card.suit &&
         b.card.origin_deck === hc.card.origin_deck)
            ? freshly_played(hc) : b);
    board[stack_idx] = new CardStack(new_cards, stack.loc);
}
