// HAND_STACKS: the hand already contains 3+ cards that form a complete
// set or run — push the whole group onto the board as a new stack.
//
// Cheapest possible trick. No board interaction during detection; the
// board only receives the resulting stack. Cannot shadow or be shadowed
// by other tricks.
//
// Enumeration: try every subset of 3+ hand cards and check whether it
// forms a valid set or run. Hands have at most ~15 cards so O(2^n)
// subsets would blow up, but we narrow by first grouping cards by
// value (candidate sets) and by suit+value-chain (candidate runs). In
// practice this finds at most a handful of candidate groups per hand.

import { Card, CardValue, Suit } from "../core/card";
import { CardStack, HandCard } from "../core/card_stack";
import { CardStackType, get_stack_type } from "../core/stack_type";
import type { Play, Trick } from "./trick";
import { DUMMY_LOC, freshly_played } from "./helpers";

export const hand_stacks: Trick = {
    id: "hand_stacks",
    description: "You already have 3+ cards in your hand that form a set or run!",

    find_plays(hand: HandCard[], _board: CardStack[]): Play[] {
        const plays: Play[] = [];
        const groups = find_candidate_groups(hand);
        for (const group of groups) {
            plays.push(make_play(group));
        }
        return plays;
    },
};

// Return every size-3+ subset of `hand` whose cards form a valid
// set or run. Deduplicates — if a set of 4 is valid we don't also
// emit the 3-subsets of it.
function find_candidate_groups(hand: HandCard[]): HandCard[][] {
    const out: HandCard[][] = [];

    // Sets: group by value, need 3+ distinct suits with no dup pairs.
    const by_value = new Map<CardValue, HandCard[]>();
    for (const hc of hand) {
        if (!by_value.has(hc.card.value)) by_value.set(hc.card.value, []);
        by_value.get(hc.card.value)!.push(hc);
    }
    for (const [, cards] of by_value) {
        if (cards.length < 3) continue;
        const set = pick_valid_set(cards);
        if (set) out.push(set);
    }

    // Runs: for each suit, gather cards and look for consecutive sequences.
    const by_suit = new Map<Suit, HandCard[]>();
    for (const hc of hand) {
        if (!by_suit.has(hc.card.suit)) by_suit.set(hc.card.suit, []);
        by_suit.get(hc.card.suit)!.push(hc);
    }
    for (const [, cards] of by_suit) {
        for (const run of longest_pure_runs(cards)) {
            if (run.length >= 3) out.push(run);
        }
    }

    // Rb runs: consider all cards, look for consecutive alternating-color
    // sequences. Since rb runs are less common in hand, take a simple pass.
    for (const run of find_rb_runs(hand)) {
        if (run.length >= 3) out.push(run);
    }

    return out;
}

// Pick a valid set of 3+ from same-value hand cards (distinct suits, no dups).
function pick_valid_set(cards: HandCard[]): HandCard[] | null {
    const seen_suits = new Set<Suit>();
    const chosen: HandCard[] = [];
    for (const hc of cards) {
        if (seen_suits.has(hc.card.suit)) continue; // dup of a card already in the set
        seen_suits.add(hc.card.suit);
        chosen.push(hc);
    }
    if (chosen.length < 3) return null;
    // Double-check validity via get_stack_type.
    if (get_stack_type(chosen.map(c => c.card)) === CardStackType.SET) {
        return chosen;
    }
    return null;
}

// Find maximal consecutive-value runs within a same-suit card list.
function longest_pure_runs(cards: HandCard[]): HandCard[][] {
    if (cards.length === 0) return [];
    // Deduplicate (two copies from different decks count as one for
    // pure-run purposes — can't use both).
    const by_value = new Map<CardValue, HandCard>();
    for (const hc of cards) {
        if (!by_value.has(hc.card.value)) by_value.set(hc.card.value, hc);
    }
    const sorted = [...by_value.values()].sort((a, b) => a.card.value - b.card.value);

    const runs: HandCard[][] = [];
    let current: HandCard[] = [];
    for (const hc of sorted) {
        if (current.length === 0 || hc.card.value === current[current.length - 1].card.value + 1) {
            current.push(hc);
        } else {
            if (current.length >= 3 && is_valid_group(current)) runs.push(current);
            current = [hc];
        }
    }
    if (current.length >= 3 && is_valid_group(current)) runs.push(current);
    return runs;
}

// Find rb runs: sort unique-value cards by value, keep consecutive
// runs whose colors alternate.
function find_rb_runs(hand: HandCard[]): HandCard[][] {
    const by_value = new Map<CardValue, HandCard>();
    for (const hc of hand) {
        if (!by_value.has(hc.card.value)) by_value.set(hc.card.value, hc);
    }
    const sorted = [...by_value.values()].sort((a, b) => a.card.value - b.card.value);

    const runs: HandCard[][] = [];
    let current: HandCard[] = [];
    for (const hc of sorted) {
        const last = current[current.length - 1];
        const ok = current.length === 0 ||
            (hc.card.value === last.card.value + 1 && hc.card.color !== last.card.color);
        if (ok) {
            current.push(hc);
        } else {
            if (current.length >= 3 && is_valid_group(current)) runs.push(current);
            current = [hc];
        }
    }
    if (current.length >= 3 && is_valid_group(current)) runs.push(current);
    return runs;
}

function is_valid_group(hcs: HandCard[]): boolean {
    const t = get_stack_type(hcs.map(c => c.card));
    return t === CardStackType.SET
        || t === CardStackType.PURE_RUN
        || t === CardStackType.RED_BLACK_RUN;
}

function make_play(group: HandCard[]): Play {
    return {
        trick: hand_stacks,
        hand_cards: group,
        apply(board: CardStack[]): HandCard[] {
            // Re-verify at apply time: the hand may have been modified
            // by an earlier play in the same turn. Here we're permissive
            // — the caller is expected to not compose plays that share
            // hand cards, but this guard is cheap.
            if (!is_valid_group(group)) return [];
            const bcs = group.map(freshly_played);
            board.push(new CardStack(bcs, DUMMY_LOC));
            return group;
        },
    };
}

// Suppress unused-import lint in case of refactor churn.
void Card;
