// Exhaustive arrangement enumeration for small card sets.
//
// An "arrangement" is a partition of cards into groups where each
// group is a valid stack (set, pure run, or red/black run) of 3+
// cards. Cards not in any group are leftover.
//
// This is a brute-force correctness oracle. It enumerates every
// possible arrangement via bitmask subset enumeration. Only feasible
// for ~20 cards or fewer.

import { Card, Suit, value_str } from "./card";
import { CardStackType, get_stack_type } from "./stack_type";

const suit_letter: Record<Suit, string> = {
    [Suit.HEART]: "H",
    [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D",
    [Suit.CLUB]: "C",
};

export function card_label(c: Card): string {
    return value_str(c.value) + suit_letter[c.suit];
}

export type Group = { cards: Card[]; type: CardStackType };
export type Arrangement = Group[];

function is_valid_stack(cards: Card[]): CardStackType | undefined {
    if (cards.length < 3) return undefined;
    const st = get_stack_type(cards);
    if (st === CardStackType.SET) return st;

    // For runs, sort by value and try the normal order.
    const sorted = [...cards].sort((a, b) => a.value - b.value);
    const sorted_type = get_stack_type(sorted);
    if (sorted_type === CardStackType.PURE_RUN ||
        sorted_type === CardStackType.RED_BLACK_RUN) {
        return sorted_type;
    }

    // Try wrap-around: rotate so K comes first (K A 2 3 ...).
    // If the last card is K and the first is A, rotate.
    if (sorted.length >= 3 && sorted[sorted.length - 1].value === 13 && sorted[0].value === 1) {
        const rotated = [...sorted.slice(-1), ...sorted.slice(0, -1)];
        const rot_type = get_stack_type(rotated);
        if (rot_type === CardStackType.PURE_RUN ||
            rot_type === CardStackType.RED_BLACK_RUN) {
            return rot_type;
        }
    }

    return undefined;
}

function popcount(n: number): number {
    let count = 0;
    while (n) { count += n & 1; n >>= 1; }
    return count;
}

// Find all subsets of 3+ cards that form valid stacks.
export function find_all_valid_groups(cards: Card[]): Group[] {
    const groups: Group[] = [];
    const n = cards.length;

    for (let mask = 0; mask < (1 << n); mask++) {
        if (popcount(mask) < 3) continue;

        const subset: Card[] = [];
        for (let i = 0; i < n; i++) {
            if (mask & (1 << i)) subset.push(cards[i]);
        }

        const type = is_valid_stack(subset);
        if (type !== undefined) {
            groups.push({ cards: subset, type });
        }
    }

    return groups;
}

// Find all arrangements: combinations of non-overlapping valid groups.
export function find_all_arrangements(cards: Card[]): Arrangement[] {
    const valid_groups = find_all_valid_groups(cards);
    const n = cards.length;

    const group_masks: { group: Group; mask: number }[] = valid_groups.map((g) => {
        let mask = 0;
        for (const c of g.cards) {
            mask |= (1 << cards.indexOf(c));
        }
        return { group: g, mask };
    });

    const results: Arrangement[] = [];

    function search(idx: number, used: number, chosen: Group[]): void {
        results.push([...chosen]);

        for (let i = idx; i < group_masks.length; i++) {
            const gm = group_masks[i];
            if (gm.mask & used) continue;
            chosen.push(gm.group);
            search(i + 1, used | gm.mask, chosen);
            chosen.pop();
        }
    }

    search(0, 0, []);
    return results;
}

// Count grouped cards in an arrangement.
export function grouped_count(arr: Arrangement): number {
    let n = 0;
    for (const g of arr) n += g.cards.length;
    return n;
}

// Compute the score of an arrangement using the game's scoring
// formula (flat per-card; mirrors Score.for_stack).
export function arrangement_score(arr: Arrangement): number {
    let score = 0;
    for (const g of arr) {
        if (g.cards.length < 3) continue;
        const type_value =
            g.type === CardStackType.PURE_RUN ? 100 :
            g.type === CardStackType.SET ? 60 :
            g.type === CardStackType.RED_BLACK_RUN ? 50 : 0;
        score += g.cards.length * type_value;
    }
    return score;
}

// Quality metric: more grouped cards first, then higher score.
// Same metric used by the solver.
export function arrangement_quality(arr: Arrangement): number {
    return grouped_count(arr) * 10000 + arrangement_score(arr);
}

// Find the arrangement with the highest quality (most grouped, then score).
export function find_best_arrangement(cards: Card[]): {
    best: Arrangement;
    best_score: number;
    total_arrangements: number;
    total_full: number;
} {
    const all = find_all_arrangements(cards);
    let best: Arrangement = [];
    let best_quality = 0;
    let total_full = 0;

    for (const arr of all) {
        const q = arrangement_quality(arr);
        if (q > best_quality) {
            best_quality = q;
            best = arr;
        }
        if (grouped_count(arr) === cards.length) {
            total_full++;
        }
    }

    return { best, best_score: arrangement_score(best), total_arrangements: all.length, total_full };
}

// Format an arrangement for display.
export function fmt_arrangement(arr: Arrangement, all_cards: Card[]): string {
    if (arr.length === 0) return "(no groups)";

    const parts: string[] = [];
    const used = new Set<Card>();

    for (const g of arr) {
        const sorted = [...g.cards].sort((a, b) => a.value - b.value);
        parts.push(`[${sorted.map(card_label).join(" ")}](${g.type})`);
        for (const c of g.cards) used.add(c);
    }

    const leftover = all_cards.filter((c) => !used.has(c));
    if (leftover.length > 0) {
        parts.push(`left: ${leftover.map(card_label).join(" ")}`);
    }

    return parts.join("  ");
}
