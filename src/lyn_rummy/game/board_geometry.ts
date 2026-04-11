// Board geometry validation.
//
// Checks that all stacks fit within bounds and none overlap.
// This is a protocol-level constraint — checked before game
// logic, like well-formed syntax.

import type { JsonCardStack, BoardLocation } from "../core/card_stack";
import { CARD_WIDTH } from "../core/card_stack";

const CARD_HEIGHT = 40;
const CARD_PITCH = CARD_WIDTH + 6;

export type BoardBounds = {
    max_width: number;
    max_height: number;
    margin: number; // minimum gap between stacks
};

export function stack_width(card_count: number): number {
    if (card_count <= 0) return 0;
    return CARD_WIDTH + (card_count - 1) * CARD_PITCH;
}

export const STACK_HEIGHT = CARD_HEIGHT;

type Rect = {
    left: number;
    top: number;
    right: number;
    bottom: number;
};

function stack_rect(stack: JsonCardStack): Rect {
    const left = stack.loc.left;
    const top = stack.loc.top;
    return {
        left,
        top,
        right: left + stack_width(stack.board_cards.length),
        bottom: top + CARD_HEIGHT,
    };
}

function rects_overlap(a: Rect, b: Rect): boolean {
    return (
        a.left < b.right &&
        a.right > b.left &&
        a.top < b.bottom &&
        a.bottom > b.top
    );
}

function pad_rect(r: Rect, margin: number): Rect {
    return {
        left: r.left - margin,
        top: r.top - margin,
        right: r.right + margin,
        bottom: r.bottom + margin,
    };
}

export type GeometryError = {
    type: "out_of_bounds" | "overlap";
    message: string;
    stack_indices: number[];
};

// Validate that all stacks fit within bounds and none overlap.
// Returns an empty array if the board is geometrically valid.
export function validate_board_geometry(
    stacks: JsonCardStack[],
    bounds: BoardBounds,
): GeometryError[] {
    const errors: GeometryError[] = [];
    const rects = stacks.map(stack_rect);

    // Check bounds.
    for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (r.left < 0 || r.top < 0 ||
            r.right > bounds.max_width ||
            r.bottom > bounds.max_height) {
            errors.push({
                type: "out_of_bounds",
                message: `Stack ${i} extends outside the board` +
                    ` (rect: ${r.left},${r.top} → ${r.right},${r.bottom}` +
                    `, bounds: ${bounds.max_width}x${bounds.max_height})`,
                stack_indices: [i],
            });
        }
    }

    // Check pairwise overlap (with margin).
    for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
            const a = pad_rect(rects[i], bounds.margin);
            if (rects_overlap(a, rects[j])) {
                errors.push({
                    type: "overlap",
                    message: `Stacks ${i} and ${j} overlap`,
                    stack_indices: [i, j],
                });
            }
        }
    }

    return errors;
}
