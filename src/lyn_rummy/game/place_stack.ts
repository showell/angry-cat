// Collision-free placement of a new stack on the Lyn Rummy board.
//
// When forging a move that produces a NEW stack (e.g. peeling
// a card off a long run, or splitting a stack), we need a top/left
// position for the new stack such that it doesn't overlap any
// stack already on the board.
//
// This module is the canonical home for that math. It's a pure
// function — no DOM, no globals — so authoring tools, future
// move-forging code, and tests can all consume it the same way.
//
// Geometry assumptions (mirroring game.ts):
//   * Each card is CARD_WIDTH (27) px wide and CARD_HEIGHT (40)
//     px tall.
//   * Within a stack, consecutive cards cascade horizontally
//     with a small gap, so a stack of N cards spans approximately
//     CARD_WIDTH + (N-1) * CARD_PITCH px wide.
//   * A stack is always one row of cards tall regardless of
//     length.

import type { BoardLocation, JsonCardStack } from "../core/card_stack";
import { CARD_WIDTH } from "../core/card_stack";

const CARD_HEIGHT = 40;
const CARD_PITCH = CARD_WIDTH + 6;

// The visible region of the board the placer is allowed to use.
// All four fields are required (no defaults) so the caller has
// to make explicit decisions about board size and breathing room.
//
//   max_width  / max_height — usable area in pixels
//   margin                  — extra padding around each stack to
//                             keep them from kissing edge-to-edge
//   step                    — granularity of the candidate sweep;
//                             smaller means tighter packing but
//                             more iterations. 10 is a sensible
//                             default the caller can pick.
export type BoardBounds = {
    max_width: number;
    max_height: number;
    margin: number;
    step: number;
};

export function stack_width(card_count: number): number {
    if (card_count <= 0) return 0;
    return CARD_WIDTH + (card_count - 1) * CARD_PITCH;
}

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

// Find a top/left position for a new stack of `card_count` cards
// such that its bounding box (with `margin` padding around it)
// does not overlap any existing stack on the board.
//
// Sweeps a uniform grid of candidate positions from the top-left
// corner downward and returns the first hit. The grid step is
// configurable via bounds.step.
//
// If no position fits within the bounds, returns the bottom-left
// corner of the bounds as a fallback so the caller always gets a
// usable BoardLocation. (Callers that care can detect the failure
// by re-checking the result against existing stacks.)
export function find_open_loc(
    existing: JsonCardStack[],
    card_count: number,
    bounds: BoardBounds,
): BoardLocation {
    const new_w = stack_width(card_count);
    const new_h = CARD_HEIGHT;
    const margin = bounds.margin;
    const step = bounds.step;

    const existing_rects = existing.map(stack_rect);

    for (
        let top = 0;
        top + new_h <= bounds.max_height;
        top += step
    ) {
        for (
            let left = 0;
            left + new_w <= bounds.max_width;
            left += step
        ) {
            // Pad the candidate by `margin` on every side so two
            // stacks don't end up touching at exactly the boundary.
            const candidate: Rect = {
                left: left - margin,
                top: top - margin,
                right: left + new_w + margin,
                bottom: top + new_h + margin,
            };
            let collides = false;
            for (const r of existing_rects) {
                if (rects_overlap(candidate, r)) {
                    collides = true;
                    break;
                }
            }
            if (!collides) {
                return { top, left };
            }
        }
    }

    // No spot found within bounds. Return a fallback (bottom-left
    // corner) so the caller still has SOMETHING usable.
    return {
        top: Math.max(0, bounds.max_height - new_h),
        left: 0,
    };
}
