// Precompute all valid threesomes (3-card stacks) for a board.
//
// For each card C, find every set of {C, X, Y} that forms a valid
// stack in some ordering. The set of viable threesomes is fixed for
// the whole simulation — they don't depend on what's currently
// happening on the board, only on which cards exist.
//
// A "threesome" is a 3-card valid stack. We represent it as the
// three cards in canonical order:
//   - Sets: sorted by suit
//   - Pure runs: sorted by value (with K→A→2 wrap handled below)
//   - Red/black runs: sorted by value (with wrap)

import { Card } from "./card";
import { CardStackType, get_stack_type } from "./stack_type";

export type Threesome = {
    cards: Card[];        // in valid stack order
    type: CardStackType;
};

// Try every ordering of 3 cards and return the first valid stack
// found, or undefined if none works.
function find_valid_ordering(
    a: Card, b: Card, c: Card,
): { cards: Card[]; type: CardStackType } | undefined {
    const orderings = [
        [a, b, c], [a, c, b],
        [b, a, c], [b, c, a],
        [c, a, b], [c, b, a],
    ];
    for (const ordering of orderings) {
        const t = get_stack_type(ordering);
        if (t === CardStackType.PURE_RUN ||
            t === CardStackType.RED_BLACK_RUN ||
            t === CardStackType.SET) {
            return { cards: ordering, type: t };
        }
    }
    return undefined;
}

// Compute every viable threesome for every card on the board.
// Returns a map from each card to its list of threesomes.
// Each threesome includes the original card.
export function compute_threesomes(
    board_cards: Card[],
): Map<Card, Threesome[]> {
    const result = new Map<Card, Threesome[]>();
    for (const c of board_cards) result.set(c, []);

    // Iterate every triple. Use index-based loops to avoid duplicates.
    const n = board_cards.length;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            for (let k = j + 1; k < n; k++) {
                const a = board_cards[i];
                const b = board_cards[j];
                const c = board_cards[k];
                const found = find_valid_ordering(a, b, c);
                if (!found) continue;

                const threesome: Threesome = {
                    cards: found.cards,
                    type: found.type,
                };
                // Each card in the triple gets a reference to the
                // same threesome object — they're all in it.
                result.get(a)!.push(threesome);
                result.get(b)!.push(threesome);
                result.get(c)!.push(threesome);
            }
        }
    }

    return result;
}
