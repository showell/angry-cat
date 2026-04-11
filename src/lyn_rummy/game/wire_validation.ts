// Wire event validation.
//
// Called when receiving a board event from another player over
// the wire. Simulates what Board.process_event would do (remove
// + add), then checks the resulting board for geometry violations.
//
// Returns an array of error strings. Empty = valid.

import { CardStack } from "../core/card_stack";
import { validate_board_geometry, type BoardBounds } from "./board_geometry";

export const DEFAULT_BOARD_BOUNDS: BoardBounds = {
    max_width: 800,
    max_height: 600,
    margin: 5,
};

export function validate_wire_event(
    board_before: CardStack[],
    stacks_to_remove: CardStack[],
    stacks_to_add: CardStack[],
    bounds: BoardBounds = DEFAULT_BOARD_BOUNDS,
): string[] {
    // Simulate the remove + add.
    const remaining = board_before.filter(
        s => !stacks_to_remove.some(r => r.equals(s))
    );
    const resulting_board = [...remaining, ...stacks_to_add];

    // Validate geometry of the resulting board.
    const json_stacks = resulting_board.map(s => s.toJSON());
    const geo_errors = validate_board_geometry(json_stacks, bounds);

    return geo_errors.map(e => e.message);
}
