// Orphan detection for board stacks.
//
// A board stack is an orphan when every card in the stack has no
// valid neighbor outside the stack, considering all hand cards and
// all board cards.
//
// Two approaches are implemented:
// 1. Per-stack check — simple nested loops, early exit. This is
//    the production implementation. At Lyn Rummy scale (≤104 cards),
//    it benchmarks 2-5x faster than the indexed approach because
//    Map/Set construction overhead dominates.
// 2. Holistic sweep — builds a neighbor index once, then checks
//    all stacks against it. Correct but slower at this scale.
//    Kept for cross-validation in tests.

import { Card, is_pair_of_dups } from "./card";
import { CardStack, type HandCard } from "./card_stack";
import { successor, predecessor } from "./stack_type";

// --- Neighbor check (shared by both approaches) ---

export function is_valid_neighbor(a: Card, b: Card): boolean {
    if (is_pair_of_dups(a, b)) return false;

    // Set: same value, different suit.
    if (a.value === b.value && a.suit !== b.suit) return true;

    // Pure run: same suit, consecutive.
    if (a.suit === b.suit &&
        (b.value === successor(a.value) || b.value === predecessor(a.value))) return true;

    // Red/black: opposite color, consecutive.
    if (a.color !== b.color &&
        (b.value === successor(a.value) || b.value === predecessor(a.value))) return true;

    return false;
}

// --- Slow oracle: per-stack check ---

export function is_orphan_stack_slow(
    stack: CardStack,
    all_hand_cards: Card[],
    all_board_cards: Card[],
): boolean {
    const stack_cards = stack.get_cards();
    const stack_card_set = new Set(stack_cards);

    for (const sc of stack_cards) {
        for (const other of all_hand_cards) {
            if (is_valid_neighbor(sc, other)) return false;
        }
        for (const other of all_board_cards) {
            if (stack_card_set.has(other)) continue;
            if (is_valid_neighbor(sc, other)) return false;
        }
    }

    return true;
}

export function find_orphan_stacks_slow(
    board: CardStack[],
    hand: HandCard[],
): number[] {
    const all_hand_cards = hand.map((hc) => hc.card);
    const all_board_cards: Card[] = [];
    for (const s of board) {
        for (const c of s.get_cards()) all_board_cards.push(c);
    }

    const orphans: number[] = [];
    for (let i = 0; i < board.length; i++) {
        if (is_orphan_stack_slow(board[i], all_hand_cards, all_board_cards)) {
            orphans.push(i);
        }
    }
    return orphans;
}

// --- Fast holistic approach ---
//
// Build a neighbor index once for ALL cards (hand + board). The
// index maps each card to the set of all its valid neighbors.
// Then for each stack, check if any card has a neighbor outside
// the stack.
//
// The index uses three lookup tables:
//   by_suit_value: "suit:value" → Card[]  (pure run neighbors)
//   by_color_value: "color:value" → Card[] (red/black neighbors)
//   by_value: value → Card[]              (set neighbors)
//
// For a card C, its neighbors are:
//   pure run: by_suit_value[C.suit : successor(C.value)]
//             by_suit_value[C.suit : predecessor(C.value)]
//   red/black: by_color_value[opposite_color : successor(C.value)]
//              by_color_value[opposite_color : predecessor(C.value)]
//   set: by_value[C.value] (excluding same suit)

type NeighborIndex = {
    by_suit_value: Map<string, Card[]>;
    by_color_value: Map<string, Card[]>;
    by_value: Map<number, Card[]>;
};

function build_neighbor_index(cards: Card[]): NeighborIndex {
    const by_suit_value = new Map<string, Card[]>();
    const by_color_value = new Map<string, Card[]>();
    const by_value = new Map<number, Card[]>();

    for (const c of cards) {
        const sv = `${c.suit}:${c.value}`;
        if (!by_suit_value.has(sv)) by_suit_value.set(sv, []);
        by_suit_value.get(sv)!.push(c);

        const cv = `${c.color}:${c.value}`;
        if (!by_color_value.has(cv)) by_color_value.set(cv, []);
        by_color_value.get(cv)!.push(c);

        if (!by_value.has(c.value)) by_value.set(c.value, []);
        by_value.get(c.value)!.push(c);
    }

    return { by_suit_value, by_color_value, by_value };
}

function has_external_neighbor(
    card: Card,
    stack_cards: Set<Card>,
    index: NeighborIndex,
): boolean {
    const prev = predecessor(card.value);
    const next = successor(card.value);
    const opp_color = card.color === 0 ? 1 : 0; // BLACK=0, RED=1

    // Pure run: same suit, ±1 value.
    for (const key of [`${card.suit}:${prev}`, `${card.suit}:${next}`]) {
        for (const other of index.by_suit_value.get(key) ?? []) {
            if (!stack_cards.has(other) && !is_pair_of_dups(card, other)) return true;
        }
    }

    // Red/black: opposite color, ±1 value.
    for (const key of [`${opp_color}:${prev}`, `${opp_color}:${next}`]) {
        for (const other of index.by_color_value.get(key) ?? []) {
            if (!stack_cards.has(other) && !is_pair_of_dups(card, other)) return true;
        }
    }

    // Set: same value, different suit.
    for (const other of index.by_value.get(card.value) ?? []) {
        if (!stack_cards.has(other) && other.suit !== card.suit && !is_pair_of_dups(card, other)) {
            return true;
        }
    }

    return false;
}

export function find_orphan_stacks(
    board: CardStack[],
    hand: HandCard[],
): number[] {
    // Collect ALL cards into one pool for the index.
    const all_cards: Card[] = [];
    for (const s of board) {
        for (const c of s.get_cards()) all_cards.push(c);
    }
    for (const hc of hand) {
        all_cards.push(hc.card);
    }

    const index = build_neighbor_index(all_cards);

    const orphans: number[] = [];
    for (let i = 0; i < board.length; i++) {
        const stack_cards = new Set(board[i].get_cards());
        let is_orphan = true;
        for (const c of stack_cards) {
            if (has_external_neighbor(c, stack_cards, index)) {
                is_orphan = false;
                break;
            }
        }
        if (is_orphan) orphans.push(i);
    }

    return orphans;
}
