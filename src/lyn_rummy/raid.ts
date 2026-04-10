// Raid mechanics: steal + rescue.
//
// A raid is the action a lonely card takes during its turn. It
// targets a specific threesome (3 cards that form a valid stack)
// and tries to assemble it on the board. The raid has two phases:
//
//   1. STEAL — pull each card of the threesome out of its current
//      stack via steal_one_card. End extraction shrinks the stack;
//      middle extraction splits the stack into two disjoint pieces.
//      The new family is created from the threesome's 3 cards.
//
//   2. RESCUE — extend the new family by absorbing TRUE SINGLETONS
//      (cards in stacks of size 1) that fit on the perimeter.
//      Pairs and 3+ stacks are sacred — never touched.
//
// INVARIANTS (preserved by every phase):
//   - Every stack on the board is either a valid 3+ stack
//     (pure run / set / rb run) or an incomplete stack of 1-2 cards.
//   - No bogus 3+ stacks are ever created.
//   - The family stack returned by steal is always a valid 3-card
//     stack (the threesome was precomputed to be valid).

import { Card, CardColor, Suit, is_pair_of_dups } from "./card";
import { CardStackType, get_stack_type, successor, predecessor } from "./stack_type";
import { Threesome } from "./threesomes";

// A stack is just a list of cards in order. We represent the
// "board" as a list of stacks. Cards can be looked up by their
// containing stack via the index map.
export type Stack = Card[];

export type Board = {
    stacks: Stack[];
    // Index: card → the stack containing it.
    location: Map<Card, Stack>;
};

// Build a board from a list of stacks (each stack is an array of
// cards). Singleton cards each get their own one-card stack.
export function make_board(stacks: Card[][]): Board {
    const board: Board = {
        stacks: stacks.map((s) => s.slice()),
        location: new Map(),
    };
    for (const stack of board.stacks) {
        for (const c of stack) board.location.set(c, stack);
    }
    return board;
}

// Deep clone a board so we can speculate without mutating the original.
export function clone_board(board: Board): Board {
    const stacks = board.stacks.map((s) => s.slice());
    const location = new Map<Card, Stack>();
    for (const stack of stacks) {
        for (const c of stack) location.set(c, stack);
    }
    return { stacks, location };
}

// Pull a single card out of its current stack.
//
// If the card is at an end of the stack, the stack just shrinks.
// If the card is in the middle, the stack splits into two disjoint
// pieces. (For sets, there's no concept of "middle" — order doesn't
// matter — but the same code path works because removing any
// position from a length-N set produces a length-(N-1) set.)
//
// Empty stacks are removed from the board entirely.
function steal_one_card(board: Board, card: Card): void {
    const stack = board.location.get(card);
    if (!stack) return;
    const idx = stack.indexOf(card);
    if (idx < 0) return;

    board.location.delete(card);

    // End extraction (or only-card): stack just shrinks.
    if (idx === 0 || idx === stack.length - 1) {
        stack.splice(idx, 1);
        if (stack.length === 0) {
            const sidx = board.stacks.indexOf(stack);
            if (sidx >= 0) board.stacks.splice(sidx, 1);
        }
        return;
    }

    // Middle extraction: split the stack into two pieces.
    const left = stack.slice(0, idx);
    const right = stack.slice(idx + 1);

    // Replace the original stack with the left piece, and add the
    // right piece as a new stack.
    const sidx = board.stacks.indexOf(stack);
    if (sidx >= 0) board.stacks.splice(sidx, 1);

    if (left.length > 0) {
        board.stacks.push(left);
        for (const c of left) board.location.set(c, left);
    }
    if (right.length > 0) {
        board.stacks.push(right);
        for (const c of right) board.location.set(c, right);
    }
}

// --- STEAL ---
//
// Build the threesome on the board by pulling each missing card
// out of its current stack. The source stacks just shrink. The
// resulting threesome becomes a new stack on the board, in the
// canonical order from the threesome definition.
//
// THE TWIN RULE: a steal is forbidden if any source stack contains
// the twin of any threesome member. This prevents two duplicate
// cards (e.g. KD:1 and KD:2) from oscillating in and out of the
// same family slot. If the rule is violated, steal returns undefined
// and the board is left unchanged.
//
// Returns the newly formed family stack and the list of cards that
// became NEWLY-singleton as a result of the steal (these are the
// cards that rescue may absorb back onto the family). Returns
// undefined if the steal is refused.
export type StealResult = {
    family: Stack;
    perturbed_singletons: Card[];
};

export function steal(board: Board, threesome: Threesome): StealResult | undefined {
    if (!can_steal(board, threesome)) return undefined;

    // Snapshot the set of cards currently in singleton stacks so
    // we can compute what's NEWLY singleton after the steal.
    const singletons_before = new Set<Card>();
    for (const stack of board.stacks) {
        if (stack.length === 1) singletons_before.add(stack[0]);
    }

    // Pull every card in the threesome out of its current stack.
    // steal_one_card handles end vs middle extraction automatically:
    // end → shrink, middle → split.
    for (const card of threesome.cards) {
        steal_one_card(board, card);
    }

    // Create the new family stack in the canonical order.
    const new_stack: Stack = threesome.cards.slice();
    board.stacks.push(new_stack);
    for (const c of new_stack) board.location.set(c, new_stack);

    // Compute newly-singleton cards (perturbed by this steal).
    const perturbed_singletons: Card[] = [];
    for (const stack of board.stacks) {
        if (stack.length === 1 && !singletons_before.has(stack[0])) {
            perturbed_singletons.push(stack[0]);
        }
    }

    return { family: new_stack, perturbed_singletons };
}

// Check whether a threesome can be stolen without violating the
// twin rule. The rule: no source stack of any threesome card may
// contain the twin of any threesome member.
export function can_steal(board: Board, threesome: Threesome): boolean {
    const member_set = new Set(threesome.cards);
    for (const card of threesome.cards) {
        const stack = board.location.get(card);
        if (!stack) continue;
        for (const other of stack) {
            if (member_set.has(other)) continue; // already in threesome
            for (const member of threesome.cards) {
                if (is_pair_of_dups(other, member)) {
                    return false;
                }
            }
        }
    }
    return true;
}

// --- RESCUE ---
//
// Extend a valid family by absorbing TRUE SINGLETONS that fit on
// the perimeter. We only take from size-1 stacks. Pairs and 3+
// stacks are sacred — never touched.
//
// The rescue keeps looping as long as it finds more singleton matches.

// What are the cards that could potentially extend this stack?
// For runs: predecessor of leftmost, successor of rightmost.
// For sets: any other card with the same value.
function find_extender_specs(stack: Stack): ExtenderSpec[] {
    const type = get_stack_type(stack);
    const specs: ExtenderSpec[] = [];

    if (type === CardStackType.SET) {
        // A set of value V wants any card with value V (different suit).
        const value = stack[0].value;
        const used_suits = new Set<Suit>(stack.map((c) => c.suit));
        for (const suit of [Suit.CLUB, Suit.DIAMOND, Suit.SPADE, Suit.HEART]) {
            if (used_suits.has(suit)) continue;
            specs.push({ kind: "set_match", value, suit });
        }
        return specs;
    }

    if (type === CardStackType.PURE_RUN) {
        const left = stack[0];
        const right = stack[stack.length - 1];
        // Predecessor of leftmost (same suit).
        specs.push({ kind: "pure_pred", value: predecessor(left.value), suit: left.suit });
        // Successor of rightmost (same suit).
        specs.push({ kind: "pure_succ", value: successor(right.value), suit: right.suit });
        return specs;
    }

    if (type === CardStackType.RED_BLACK_RUN) {
        const left = stack[0];
        const right = stack[stack.length - 1];
        const opp_left: CardColor = left.color === CardColor.RED ? CardColor.BLACK : CardColor.RED;
        const opp_right: CardColor = right.color === CardColor.RED ? CardColor.BLACK : CardColor.RED;
        // Predecessor of leftmost (opposite color, same value-1).
        // The predecessor needs opposite color from leftmost; either
        // suit of that color works.
        for (const s of suits_of_color(opp_left)) {
            specs.push({ kind: "rb_pred", value: predecessor(left.value), suit: s });
        }
        for (const s of suits_of_color(opp_right)) {
            specs.push({ kind: "rb_succ", value: successor(right.value), suit: s });
        }
        return specs;
    }

    return specs;
}

type ExtenderSpec = {
    kind: "set_match" | "pure_pred" | "pure_succ" | "rb_pred" | "rb_succ";
    value: number;
    suit: Suit;
};

function suits_of_color(color: CardColor): Suit[] {
    return color === CardColor.RED
        ? [Suit.HEART, Suit.DIAMOND]
        : [Suit.CLUB, Suit.SPADE];
}

// Find a true singleton on the board that matches the spec AND
// is in the `allowed` set. Only allowed singletons (typically the
// ones perturbed by our own steal) are eligible for rescue.
function find_singleton_match(
    board: Board, spec: ExtenderSpec, allowed: Set<Card>,
): Card | undefined {
    for (const stack of board.stacks) {
        if (stack.length !== 1) continue;
        const c = stack[0];
        if (!allowed.has(c)) continue;
        if (c.value === spec.value && c.suit === spec.suit) {
            return c;
        }
    }
    return undefined;
}

// Insert an extender card into the family stack at the right position.
// For sets, append. For runs, prepend (predecessor) or append (successor).
function place_extender(stack: Stack, card: Card, spec: ExtenderSpec): void {
    if (spec.kind === "set_match") {
        stack.push(card);
    } else if (spec.kind === "pure_pred" || spec.kind === "rb_pred") {
        stack.unshift(card);
    } else {
        stack.push(card);
    }
}

// Rescue a family by absorbing singletons on its perimeter. Only
// considers cards in the `allowed` set — typically the singletons
// that our own steal just produced. We don't rescue cards that
// were already lonely from prior moves; they get their own turn.
//
// Returns the number of cards added.
export function rescue(
    board: Board, family: Stack, allowed: Set<Card>,
): number {
    let added = 0;
    let progress = true;
    while (progress) {
        progress = false;
        const specs = find_extender_specs(family);
        for (const spec of specs) {
            const match = find_singleton_match(board, spec, allowed);
            if (match) {
                steal_one_card(board, match);
                place_extender(family, match, spec);
                board.location.set(match, family);
                added++;
                progress = true;
                break; // restart with updated specs
            }
        }
    }
    return added;
}

// --- RAID ---
//
// The full raid: steal the threesome, then rescue any singletons
// that our own steal just produced. Returns the new family stack,
// or undefined if the steal was refused (e.g. by the twin rule).
//
// Note: rescue is restricted to the singletons WE just perturbed.
// Pre-existing lonely cards are off limits — they get their own turn.
export function raid(board: Board, threesome: Threesome): Stack | undefined {
    const result = steal(board, threesome);
    if (!result) return undefined;
    const allowed = new Set(result.perturbed_singletons);
    rescue(board, result.family, allowed);
    return result.family;
}
