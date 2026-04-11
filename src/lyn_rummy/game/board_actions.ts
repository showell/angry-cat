// Board actions: the game logic for merging stacks and placing cards.
//
// This is the decision logic — "what merges are possible and what
// is the resulting board change?" — separated from DOM rendering.

import { CardStack, type HandCard, type BoardLocation } from "../core/card_stack";

export type BoardChange = {
    stacks_to_remove: CardStack[];
    stacks_to_add: CardStack[];
    hand_cards_to_release: HandCard[];
};

// --- Core merge ---

// Try to merge `other` onto `stack` from the given side.
function try_merge(
    stack: CardStack,
    other: CardStack,
    side: "left" | "right",
): CardStack | undefined {
    return side === "left"
        ? stack.left_merge(other)
        : stack.right_merge(other);
}

// --- Hand card merges ---

const DUMMY_LOC: BoardLocation = { top: -1, left: -1 };

export function try_hand_merge(
    stack: CardStack,
    hand_card: HandCard,
    side: "left" | "right",
): BoardChange | undefined {
    const hand_stack = CardStack.from_hand_card(hand_card, DUMMY_LOC);
    const merged = try_merge(stack, hand_stack, side);
    if (!merged) return undefined;

    return {
        stacks_to_remove: [stack],
        stacks_to_add: [merged],
        hand_cards_to_release: [hand_card],
    };
}

// --- Board stack merges ---

export function try_stack_merge(
    stack: CardStack,
    other: CardStack,
    side: "left" | "right",
): BoardChange | undefined {
    const merged = try_merge(stack, other, side);
    if (!merged) return undefined;

    return {
        stacks_to_remove: [stack, other],
        stacks_to_add: [merged],
        hand_cards_to_release: [],
    };
}

// --- Place and move ---

export function place_hand_card(
    hand_card: HandCard,
    loc: BoardLocation,
): BoardChange {
    return {
        stacks_to_remove: [],
        stacks_to_add: [CardStack.from_hand_card(hand_card, loc)],
        hand_cards_to_release: [hand_card],
    };
}

export function move_stack(
    stack: CardStack,
    new_loc: BoardLocation,
): BoardChange {
    return {
        stacks_to_remove: [stack],
        stacks_to_add: [new CardStack(stack.board_cards, new_loc)],
        hand_cards_to_release: [],
    };
}

// --- Bulk merge discovery ---

type MergeResult = { side: "left" | "right"; change: BoardChange };

export function find_all_stack_merges(
    target: CardStack,
    all_stacks: CardStack[],
): MergeResult[] {
    const results: MergeResult[] = [];
    for (const other of all_stacks) {
        if (other === target) continue;
        for (const side of ["left", "right"] as const) {
            const change = try_stack_merge(target, other, side);
            if (change) results.push({ side, change });
        }
    }
    return results;
}

export function find_all_hand_merges(
    hand_card: HandCard,
    all_stacks: CardStack[],
): (MergeResult & { stack: CardStack })[] {
    const results: (MergeResult & { stack: CardStack })[] = [];
    for (const stack of all_stacks) {
        for (const side of ["left", "right"] as const) {
            const change = try_hand_merge(stack, hand_card, side);
            if (change) results.push({ side, stack, change });
        }
    }
    return results;
}
