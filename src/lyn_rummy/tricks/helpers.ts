// Small helpers used across multiple tricks. Keep this file tiny —
// things that are specific to one trick belong in that trick's module.

import { Card } from "../core/card";
import {
    BoardCard,
    BoardCardState,
    CardStack,
    HandCard,
    HandCardState,
} from "../core/card_stack";
import { CardStackType } from "../core/stack_type";

export const DUMMY_LOC = { top: 0, left: 0 };

// Wrap a raw board Card in a singleton CardStack so it can be used
// with left_merge / right_merge. Useful when routing a kicked or
// extracted card back onto the board.
export function single_stack_from_card(card: Card): CardStack {
    return CardStack.from_hand_card(
        new HandCard(card, HandCardState.NORMAL),
        DUMMY_LOC,
    );
}

// Extract a card from a stack. Supports end-peel (size >= 4), set-peel
// (size >= 4 set), and middle-peel (run where both halves are >= 3).
// Mutates `board` in place. Returns the extracted BoardCard or
// undefined if extraction isn't legal at that position.
export function extract_card(
    board: CardStack[], stack_idx: number, card_idx: number,
): BoardCard | undefined {
    const stack = board[stack_idx];
    const cards = stack.board_cards;
    const size = cards.length;
    const st = stack.stack_type;

    if (card_idx === 0 && size >= 4) {
        board[stack_idx] = new CardStack(cards.slice(1), stack.loc);
        return cards[0];
    }
    if (card_idx === size - 1 && size >= 4) {
        board[stack_idx] = new CardStack(cards.slice(0, -1), stack.loc);
        return cards[size - 1];
    }
    if (st === CardStackType.SET && size >= 4) {
        const remaining = cards.filter((_, i) => i !== card_idx);
        board[stack_idx] = new CardStack(remaining, stack.loc);
        return cards[card_idx];
    }
    if ((st === CardStackType.PURE_RUN || st === CardStackType.RED_BLACK_RUN) &&
        card_idx >= 3 && (size - card_idx - 1) >= 3) {
        const left = new CardStack(cards.slice(0, card_idx), stack.loc);
        const right = new CardStack(cards.slice(card_idx + 1), DUMMY_LOC);
        board[stack_idx] = left;
        board.push(right);
        return cards[card_idx];
    }
    return undefined;
}

// Does the stack at `stack_idx` still contain the same card at
// `card_idx` (by value, suit, deck)? Used before a deferred extract
// to guard against the stack shifting under us.
export function stack_still_has_card(
    board: CardStack[], stack_idx: number, card_idx: number, card: Card,
): boolean {
    if (stack_idx < 0 || stack_idx >= board.length) return false;
    const cards = board[stack_idx].board_cards;
    if (card_idx < 0 || card_idx >= cards.length) return false;
    const bc = cards[card_idx];
    return bc.card.value === card.value
        && bc.card.suit === card.suit
        && bc.card.origin_deck === card.origin_deck;
}

// Create a freshly-played BoardCard from a hand card.
export function freshly_played(hc: HandCard): BoardCard {
    return new BoardCard(hc.card, BoardCardState.FRESHLY_PLAYED);
}

// Replace one card in a stack at a specific position; preserves the
// stack's location. Used by rb_swap and any future trick that does
// the human "substitute" gesture (slide one card in, push another
// out of the same seat). Naming this verb so it isn't hidden inside
// an inline .map() expression.
export function substitute_in_stack(
    stack: CardStack, position: number, new_card: BoardCard,
): CardStack {
    const new_cards = stack.board_cards.map(
        (b, i) => i === position ? new_card : b);
    return new CardStack(new_cards, stack.loc);
}

// Append a brand-new stack to the board. Several tricks "form a new
// group" (set or run) at the end of their apply(); this gives that
// verb a name so the call site reads as the trick's intent rather
// than as plumbing.
export function push_new_stack(board: CardStack[], board_cards: BoardCard[]): void {
    board.push(new CardStack(board_cards, DUMMY_LOC));
}
