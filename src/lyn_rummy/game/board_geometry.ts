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
    type: "out_of_bounds" | "overlap" | "crowded";
    message: string;
    stack_indices: number[];
};

export enum BoardGeometryStatus {
    CLEANLY_SPACED = "cleanly_spaced",
    CROWDED = "crowded",
    ILLEGAL = "illegal",
}

// Classify the board's geometric state.
export function classify_board_geometry(
    stacks: JsonCardStack[],
    bounds: BoardBounds,
): BoardGeometryStatus {
    const errors = validate_board_geometry(stacks, bounds);
    if (errors.some(e => e.type === "out_of_bounds" || e.type === "overlap")) {
        return BoardGeometryStatus.ILLEGAL;
    }
    if (errors.some(e => e.type === "crowded")) {
        return BoardGeometryStatus.CROWDED;
    }
    return BoardGeometryStatus.CLEANLY_SPACED;
}

// Validate that all stacks fit within bounds and none overlap.
// Returns an empty array if the board is CLEANLY_SPACED.
// "overlap" errors mean stacks actually overlap (ILLEGAL).
// "crowded" errors mean stacks are within margin (CROWDED but playable).
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

    // Check pairwise: actual overlap vs just too close (crowded).
    for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
            if (rects_overlap(rects[i], rects[j])) {
                // Actual overlap — ILLEGAL.
                errors.push({
                    type: "overlap",
                    message: `Stacks ${i} and ${j} overlap`,
                    stack_indices: [i, j],
                });
            } else {
                // Check if they're within margin — CROWDED.
                const padded = pad_rect(rects[i], bounds.margin);
                if (rects_overlap(padded, rects[j])) {
                    errors.push({
                        type: "crowded",
                        message: `Stacks ${i} and ${j} are too close (within ${bounds.margin}px margin)`,
                        stack_indices: [i, j],
                    });
                }
            }
        }
    }

    return errors;
}
