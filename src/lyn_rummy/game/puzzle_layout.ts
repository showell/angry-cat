// Geometry helpers for laying out pre-built stacks on the Lyn
// Rummy board. Used by puzzle authoring (and reusable for any
// future tool that needs to place a known set of stacks at known
// pixel positions).
//
// The functions here produce JsonCardStack values whose `loc`
// fields are filled in. They do NOT touch the singletons or the
// rendering code — the result is just data that gets fed into
// start_game() (or POSTed to the server as a setup payload).

import type { Card } from "../core/card";
import {
    BoardCardState,
    CARD_WIDTH,
    type JsonBoardCard,
    type JsonCardStack,
} from "../core/card_stack";

// Lay out a list of stacks in horizontal rows. Stacks pack
// left to right with a constant 3.5-card gap of whitespace
// between them. A row wraps to the next when adding the next
// stack would exceed `max_cards_per_row` cards in the current
// row. Stacks keep their input order — the layout only decides
// where the stack as a whole sits on the board, not how the
// cards inside it are arranged (which is determined by the
// board renderer using CARD_WIDTH).
//
// Stacks within a row do NOT need to be column-aligned with
// stacks in other rows. A short stack and a long stack can sit
// side by side; the next row starts wherever it starts.
//
// `max_cards_per_row` is required so the caller has to think
// about screen width. 25 is a reasonable default for landscape
// laptops.
//
// Reusable: any caller that has a fixed list of stacks can use
// this to assign positions in one call.
export function layout_stacks_as_simple_rows(
    stacks: Card[][],
    max_cards_per_row: number,
): JsonCardStack[] {
    const TOP_MARGIN = 20;
    const ROW_SPACING = 76;
    const LEFT_BASE = 20;
    // Cards in a stack cascade horizontally with a 33 px pitch
    // (CARD_WIDTH + 6). The user wants ~3.5 cards of breathing
    // room between adjacent stacks in a row.
    const CARD_PITCH = CARD_WIDTH + 6;
    const GAP_PX = Math.round(3.5 * CARD_PITCH);

    function stack_width(card_count: number): number {
        if (card_count <= 0) return 0;
        return CARD_WIDTH + (card_count - 1) * CARD_PITCH;
    }

    const result: JsonCardStack[] = [];
    let row = 0;
    let cards_in_row = 0;
    let left_in_row = LEFT_BASE;

    for (const cards of stacks) {
        // Wrap to a new row if this stack would push the row's
        // total card count over the budget. A stack always
        // starts a row by itself if no stacks are placed yet on
        // the current row, even if it alone exceeds the budget.
        if (
            cards_in_row > 0 &&
            cards_in_row + cards.length > max_cards_per_row
        ) {
            row++;
            cards_in_row = 0;
            left_in_row = LEFT_BASE;
        }

        const board_cards: JsonBoardCard[] = cards.map((card) => ({
            card,
            state: BoardCardState.FIRMLY_ON_BOARD,
        }));
        const loc = {
            top: TOP_MARGIN + row * ROW_SPACING,
            left: left_in_row,
        };
        result.push({ board_cards, loc });

        left_in_row += stack_width(cards.length) + GAP_PX;
        cards_in_row += cards.length;
    }

    return result;
}
