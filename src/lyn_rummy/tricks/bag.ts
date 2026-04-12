// A "bag of tricks" — an ordered list of plugins with basic query
// helpers. Selection policy lives here (not inside any Trick), so it
// can vary per caller.

import type { HandCard, CardStack } from "../core/card_stack";
import type { Play, Trick } from "./trick";

export class TrickBag {
    constructor(public readonly tricks: readonly Trick[]) {}

    // Return every Play that any trick in the bag can propose for
    // the current state. Order of tricks in the bag is preserved,
    // so callers that want a deterministic "first trick wins" policy
    // can rely on it.
    find_all_plays(hand: HandCard[], board: CardStack[]): Play[] {
        const out: Play[] = [];
        for (const t of this.tricks) {
            for (const p of t.find_plays(hand, board)) {
                out.push(p);
            }
        }
        return out;
    }

    // Return the first Play produced by any trick in registration
    // order. This is the "simplest caller" selection policy.
    first_play(hand: HandCard[], board: CardStack[]): Play | undefined {
        for (const t of this.tricks) {
            const plays = t.find_plays(hand, board);
            if (plays.length > 0) return plays[0];
        }
        return undefined;
    }

    // Return every Play that maximizes hand-cards-placed. Used when
    // the caller wants to prefer compound moves over single-card ones.
    best_plays(hand: HandCard[], board: CardStack[]): Play[] {
        const all = this.find_all_plays(hand, board);
        if (all.length === 0) return [];
        let max = 0;
        for (const p of all) if (p.hand_cards.length > max) max = p.hand_cards.length;
        return all.filter(p => p.hand_cards.length === max);
    }
}
