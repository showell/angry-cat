// Stack viability scoring.
//
// Given a target card we're trying to place and a stack, this
// function returns a number on a 0-100 scale describing how
// useful the stack looks as an opportunity for the target.
// 100 is the ideal — every penalty subtracts.
//
// Top-of-the-scale shortcut: if the target card can simply
// MERGE into the stack (slot onto either end and form a still-
// valid 3+ stack of the same type), the stack is 100% viable
// for that target and we return 100 immediately without
// running any penalties.
//
// We will tune this iteratively. The penalty list deliberately
// starts empty; as we discover useful heuristics we add them
// one at a time and watch what happens to our case studies.

import { Card, is_pair_of_dups } from "../core/card";
import { CardStackType, get_stack_type, value_distance } from "../core/stack_type";

// Could `c` legally share a run (pure or red/black) with `target`?
//
//   - Distance 0 is never viable (two cards with the same value
//     can't both live in a run).
//   - Same suit at any non-zero distance is always viable
//     (the pure-run case).
//   - Cross-suit only works for runs whose colors alternate.
//     A card at distance D from target is in the right slot iff
//     its color is opposite when D is odd, and same when D is even.
//     The two checks combine: D's parity must match the
//     same-color-ness of the two cards.
function is_run_viable_partner(target: Card, c: Card): boolean {
    if (c.value === target.value) return false;
    if (c.suit === target.suit) return true;
    const d = value_distance(target.value, c.value);
    const same_color = c.color === target.color;
    return (d % 2 === 0) === same_color;
}

// Can the target card slot onto either end of `stack` and form a
// valid 3+ stack of the same type? Sets accept new members at
// either end (order doesn't matter for sets); runs only accept a
// new card if it extends the leftmost predecessor or rightmost
// successor (including the K→A wrap).
//
// A stack of size 0 or 1 can never be merged into by a single
// card, because the result would be at most 2 cards — not yet a
// valid family.
export function can_merge(target: Card, stack: Card[]): boolean {
    if (stack.length < 2) return false;
    const valid =
        (t: CardStackType) =>
            t === CardStackType.PURE_RUN ||
            t === CardStackType.SET ||
            t === CardStackType.RED_BLACK_RUN;
    if (valid(get_stack_type([...stack, target]))) return true;
    if (valid(get_stack_type([target, ...stack]))) return true;
    return false;
}

export function stack_viability(target: Card, stack: Card[]): number {
    if (can_merge(target, stack)) return 100;

    let score = 100;

    // Dup penalty: the stack already contains the target's exact
    // (value, suit). Its slot in this stack is "taken" by the
    // twin, so the stack can't help us home our target. -30.
    for (const c of stack) {
        if (is_pair_of_dups(c, target)) {
            score -= 30;
            break;
        }
    }

    // Type-based distance penalties.
    const t = get_stack_type(stack);
    if (t === CardStackType.SET) {
        // Sets all share a single value. Cube the distance from
        // the target to that value — far-away sets fall off fast.
        const set_value = stack[0].value;
        const d = value_distance(target.value, set_value);
        score -= d * d * d;
    } else if (
        t === CardStackType.PURE_RUN ||
        t === CardStackType.RED_BLACK_RUN
    ) {
        // For runs, find the nearest card and square its distance.
        // Proximity weighs more than color: even a card that fails
        // the run-partner color/parity check still contributes,
        // just with its distance bumped up by 1. So a wrong-color
        // card sitting one value away (effective dist 2) loses to
        // a perfectly-viable card at distance 5, but beats a viable
        // card at distance 6.
        //
        // The old "no viable partners → -75" cliff is gone — under
        // the new rule every run stack scores something based on
        // its closest card.
        let nearest = Infinity;
        for (const c of stack) {
            if (c.value === target.value) continue;
            const d = value_distance(target.value, c.value);
            const eff = is_run_viable_partner(target, c) ? d : d + 1;
            if (eff < nearest) nearest = eff;
        }
        score -= nearest * nearest;
    }

    return score;
}
