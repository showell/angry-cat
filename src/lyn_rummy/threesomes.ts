// Precompute all valid threesomes (3-card patterns) for a board.
//
// A threesome is a deck-agnostic 3-card pattern. Two physical
// triples like [KD:1 AD:1 2D:1] and [KD:2 AD:1 2D:1] are the
// SAME pattern — we represent the pattern only once. The `cards`
// field uses sample physical instances, but the algorithm should
// substitute the actor's own instance into its slot at play time.
//
// Why deck-agnostic?
//   - Twin sharing is automatic: TH:1 and TH:2 see the same patterns
//     (any pattern containing the (TEN, HEART) slot).
//   - Retirement counters apply per-pattern, so we don't waste
//     30 plays on each deck-permutation of the same arrangement.
//   - Humans don't track deck identity either.

import { Card } from "./card";
import { CardStackType, get_stack_type } from "./stack_type";

export type Threesome = {
    cards: Card[];        // sample instances in valid stack order
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

// Build a stable key for a card's slot identity (deck-free).
function slot_key(c: Card): string { return c.value + ":" + c.suit; }

// Build a key for a threesome's pattern: an ordered tuple of slot
// keys. Two physical triples with the same pattern key are the
// same threesome conceptually.
function pattern_key(cards: Card[]): string {
    return cards.map(slot_key).join("|");
}

// Compute every viable threesome for the board, deduplicated by
// pattern. Returns:
//   - A flat list of distinct patterns (each represented by a
//     Threesome object using sample physical instances)
//   - A map from each card to the patterns whose slots include it
//
// Twins (e.g., TH:1 and TH:2) get the SAME Threesome objects in
// their lists, and retirement counters apply per pattern.
export function compute_threesomes(
    board_cards: Card[],
): Map<Card, Threesome[]> {
    // Step 1: collect one sample card per distinct (value, suit) slot.
    const samples = new Map<string, Card>();
    for (const c of board_cards) {
        const k = slot_key(c);
        if (!samples.has(k)) samples.set(k, c);
    }
    const distinct = [...samples.values()];

    // Step 2: enumerate triples of distinct slots and find valid
    // orderings. Each successful ordering becomes one pattern object.
    const patterns_by_key = new Map<string, Threesome>();
    const n = distinct.length;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            for (let k = j + 1; k < n; k++) {
                const found = find_valid_ordering(distinct[i], distinct[j], distinct[k]);
                if (!found) continue;
                const key = pattern_key(found.cards);
                if (patterns_by_key.has(key)) continue; // dedupe
                patterns_by_key.set(key, {
                    cards: found.cards,
                    type: found.type,
                });
            }
        }
    }

    // Step 3: per-card index. Each card C is in every pattern that
    // has a slot matching C's (value, suit) — including patterns
    // whose sample card is C's twin.
    const result = new Map<Card, Threesome[]>();
    for (const c of board_cards) result.set(c, []);
    for (const pattern of patterns_by_key.values()) {
        for (const c of board_cards) {
            for (const slot of pattern.cards) {
                if (slot.value === c.value && slot.suit === c.suit) {
                    result.get(c)!.push(pattern);
                    break;
                }
            }
        }
    }

    return result;
}
