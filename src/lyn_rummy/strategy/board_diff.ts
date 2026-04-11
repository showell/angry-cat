// Board diff: compare two board arrangements to measure how
// similar they are. A stack is "kept" if it appears identically
// in both boards (same cards, same order). The fewer changes,
// the easier it is for a human to reverse-engineer the
// rearrangement.

import { Card, Suit, value_str } from "../core/card";
import { CardStack } from "../core/card_stack";

const suit_letter: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};

function card_str(c: Card): string {
    return value_str(c.value) + suit_letter[c.suit];
}

function stack_key(stack: CardStack): string {
    return stack.get_cards().map(card_str).join(",");
}

export type BoardDiff = {
    // Stacks that appear in both boards (identical).
    kept: CardStack[];
    // Stacks only in the old board (removed or rearranged).
    removed: CardStack[];
    // Stacks only in the new board (added or rearranged).
    added: CardStack[];
    // Summary metrics.
    kept_count: number;
    removed_count: number;
    added_count: number;
    // Total cards moved = cards in removed + added stacks.
    // (Cards in kept stacks didn't move.)
    cards_moved: number;
};

export function diff_boards(
    old_board: CardStack[],
    new_board: CardStack[],
): BoardDiff {
    const old_keys = new Map<string, CardStack[]>();
    for (const s of old_board) {
        const key = stack_key(s);
        if (!old_keys.has(key)) old_keys.set(key, []);
        old_keys.get(key)!.push(s);
    }

    const new_keys = new Map<string, CardStack[]>();
    for (const s of new_board) {
        const key = stack_key(s);
        if (!new_keys.has(key)) new_keys.set(key, []);
        new_keys.get(key)!.push(s);
    }

    const kept: CardStack[] = [];
    const old_consumed = new Map<string, number>(); // how many of each key matched
    const new_consumed = new Map<string, number>();

    // Match identical stacks.
    for (const [key, old_stacks] of old_keys) {
        const new_stacks = new_keys.get(key);
        if (!new_stacks) continue;
        const match_count = Math.min(old_stacks.length, new_stacks.length);
        for (let i = 0; i < match_count; i++) {
            kept.push(old_stacks[i]);
        }
        old_consumed.set(key, match_count);
        new_consumed.set(key, match_count);
    }

    // Removed: old stacks not matched.
    const removed: CardStack[] = [];
    for (const [key, stacks] of old_keys) {
        const consumed = old_consumed.get(key) ?? 0;
        for (let i = consumed; i < stacks.length; i++) {
            removed.push(stacks[i]);
        }
    }

    // Added: new stacks not matched.
    const added: CardStack[] = [];
    for (const [key, stacks] of new_keys) {
        const consumed = new_consumed.get(key) ?? 0;
        for (let i = consumed; i < stacks.length; i++) {
            added.push(stacks[i]);
        }
    }

    let cards_moved = 0;
    for (const s of removed) cards_moved += s.size();
    for (const s of added) cards_moved += s.size();

    return {
        kept, removed, added,
        kept_count: kept.length,
        removed_count: removed.length,
        added_count: added.length,
        cards_moved,
    };
}

export function format_diff(d: BoardDiff): string {
    const lines: string[] = [];
    lines.push(`Kept: ${d.kept_count} stacks, Removed: ${d.removed_count}, Added: ${d.added_count}, Cards moved: ${d.cards_moved}`);

    if (d.removed.length > 0) {
        lines.push("  Removed:");
        for (const s of d.removed) {
            lines.push(`    - [${s.get_cards().map(card_str).join(" ")}] (${s.get_stack_type()})`);
        }
    }
    if (d.added.length > 0) {
        lines.push("  Added:");
        for (const s of d.added) {
            lines.push(`    + [${s.get_cards().map(card_str).join(" ")}] (${s.get_stack_type()})`);
        }
    }
    return lines.join("\n");
}
