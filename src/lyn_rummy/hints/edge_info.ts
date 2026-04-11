// Edge info: for each directional edge A→B, precompute the
// specific cards that could extend the path in each direction.
//
// An edge A→B means successor(A.value) === B.value.
// From B, the next card has value successor(B.value) and must
// match the kind constraint:
//   pr: same suit as B
//   rb: opposite color from B (2 possible suits)
//   set: same value as A, suit not in {A.suit, B.suit}
//
// From A (looking backward), the previous card has value
// predecessor(A.value) and must match:
//   pr: same suit as A
//   rb: opposite color from A (2 possible suits)
//   set: same value as A, suit not in {A.suit, B.suit}
//
// Each extension is at most 2 specific suit+value combinations
// (one per deck). We store just the suit+value specs, and the
// caller checks whether those cards exist on the board.

import { Card, CardColor, CardValue, Suit, value_str } from "../core/card";
import { successor, predecessor } from "../core/stack_type";

export type CardSpec = {
    value: CardValue;
    suit: Suit;
};

export type EdgeExtensions = {
    // Cards that could extend the path AFTER B (forward).
    forward: CardSpec[];
    // Cards that could extend the path BEFORE A (backward).
    backward: CardSpec[];
};

const RED_SUITS: Suit[] = [Suit.HEART, Suit.DIAMOND];
const BLACK_SUITS: Suit[] = [Suit.SPADE, Suit.CLUB];
const ALL_SUITS: Suit[] = [Suit.HEART, Suit.SPADE, Suit.DIAMOND, Suit.CLUB];

function suits_of_color(color: CardColor): Suit[] {
    return color === CardColor.RED ? RED_SUITS : BLACK_SUITS;
}

function opposite_color(color: CardColor): CardColor {
    return color === CardColor.RED ? CardColor.BLACK : CardColor.RED;
}

export type EdgeKindTag = "pr" | "rb" | "set";

export function compute_extensions(
    a: Card,
    b: Card,
    kind: EdgeKindTag,
): EdgeExtensions {
    if (kind === "pr") {
        // Pure run: same suit, consecutive values.
        return {
            forward: [{ value: successor(b.value), suit: b.suit }],
            backward: [{ value: predecessor(a.value), suit: a.suit }],
        };
    }

    if (kind === "rb") {
        // Red/black: opposite color, consecutive values.
        const fwd_suits = suits_of_color(opposite_color(b.color));
        const bwd_suits = suits_of_color(opposite_color(a.color));
        return {
            forward: fwd_suits.map((s) => ({ value: successor(b.value), suit: s })),
            backward: bwd_suits.map((s) => ({ value: predecessor(a.value), suit: s })),
        };
    }

    // Set: same value, any suit not already used.
    const used = new Set([a.suit, b.suit]);
    const available = ALL_SUITS.filter((s) => !used.has(s));
    const specs = available.map((s) => ({ value: a.value, suit: s }));
    return {
        forward: specs,
        backward: specs, // sets are symmetric
    };
}

// Check which of the extension specs actually exist among
// a set of available cards. Returns the matching cards.
export function find_matching_cards(
    specs: CardSpec[],
    available: Map<string, Card[]>, // key = "value:suit"
): Card[] {
    const result: Card[] = [];
    for (const spec of specs) {
        const key = `${spec.value}:${spec.suit}`;
        const matches = available.get(key);
        if (matches) {
            for (const c of matches) result.push(c);
        }
    }
    return result;
}

// Build a lookup index: "value:suit" → Card[] for fast matching.
export function build_card_lookup(cards: Card[]): Map<string, Card[]> {
    const lookup = new Map<string, Card[]>();
    for (const c of cards) {
        const key = `${c.value}:${c.suit}`;
        if (!lookup.has(key)) lookup.set(key, []);
        lookup.get(key)!.push(c);
    }
    return lookup;
}

// Compute max chain length for a directional edge using extensions.
// Walks forward from B and backward from A, counting how many
// cards exist at each step.
export function chain_length(
    a: Card,
    b: Card,
    kind: EdgeKindTag,
    lookup: Map<string, Card[]>,
): number {
    // Sets: count ALL cards of this value (both decks, all suits).
    // A set can hold at most 4, but the pool of candidates is up
    // to 8 in a double deck. The path length represents the pool
    // size — how many cards compete for slots in this group.
    if (kind === "set") {
        let count = 0;
        for (const suit of ALL_SUITS) {
            const key = `${a.value}:${suit}`;
            const matches = lookup.get(key);
            if (matches) count += matches.length;
        }
        return count;
    }

    // Runs (pr or rb): walk forward from b, backward from a.
    // Track visited cards by identity (not just value) since
    // D1 and D2 copies are different cards. A pure run can
    // include both: AH:D1 2H:D1 ... KH:D1 AH:D2 2H:D2 ...
    function card_id(c: Card): string {
        return `${c.value}:${c.suit}:${c.origin_deck}`;
    }

    const visited = new Set<string>();
    visited.add(card_id(a));
    visited.add(card_id(b));
    let length = 2;

    // Walk forward.
    let current = b;
    let prev = a;
    while (true) {
        const ext = compute_extensions(prev, current, kind);
        const matches = find_matching_cards(ext.forward, lookup);
        // Pick the first match we haven't visited.
        let next: Card | undefined;
        for (const m of matches) {
            if (!visited.has(card_id(m))) { next = m; break; }
        }
        if (!next) break;
        visited.add(card_id(next));
        prev = current;
        current = next;
        length++;
    }

    // Walk backward.
    current = a;
    prev = b;
    while (true) {
        const ext = compute_extensions(current, prev, kind);
        const matches = find_matching_cards(ext.backward, lookup);
        let next: Card | undefined;
        for (const m of matches) {
            if (!visited.has(card_id(m))) { next = m; break; }
        }
        if (!next) break;
        visited.add(card_id(next));
        prev = current;
        current = next;
        length++;
    }

    return length;
}
