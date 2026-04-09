// Geometry helpers for laying out pre-built stacks on the Lyn
// Rummy board. Used by puzzle authoring (and reusable for any
// future tool that needs to place a known set of stacks at known
// pixel positions).
//
// The functions here produce JsonCardStack values whose `loc`
// fields are filled in. They do NOT touch the singletons or the
// rendering code — the result is just data that gets fed into
// start_game() (or POSTed to the server as a setup payload).

import type { Card } from "./card";
import {
    BoardCardState,
    type JsonBoardCard,
    type JsonCardStack,
} from "./card_stack";

// Lay out N stacks one per row, top to bottom, with a small
// per-row horizontal jitter so consecutive stacks don't all start
// at exactly the same x. Mirrors the existing initial_board()
// pattern in game.ts but extended to handle puzzle-sized boards
// (up to ~15 stacks).
//
// Each stack's cards keep their input order — the layout only
// decides where the stack as a whole sits on the board, not how
// the cards inside it are arranged (which is determined by the
// board renderer using CARD_WIDTH).
//
// Reusable: any caller that has a fixed list of stacks can use
// this to assign positions in one call.
export function layout_stacks_as_simple_rows(
    stacks: Card[][],
): JsonCardStack[] {
    const TOP_MARGIN = 20;
    const ROW_SPACING = 48;
    const LEFT_BASE = 40;
    const COL_JITTER = 30;

    return stacks.map((cards, row) => {
        // Stagger the left edge across rows by a small amount so
        // a long vertical column of stacks doesn't look like a
        // perfect grid. Same trick as the original initial_board.
        const col = (row * 3 + 1) % 5;
        const loc = {
            top: TOP_MARGIN + row * ROW_SPACING,
            left: LEFT_BASE + col * COL_JITTER,
        };

        const board_cards: JsonBoardCard[] = cards.map((card) => ({
            card,
            state: BoardCardState.FIRMLY_ON_BOARD,
        }));

        return { board_cards, loc };
    });
}
