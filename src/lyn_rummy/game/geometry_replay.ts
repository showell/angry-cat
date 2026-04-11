// Geometry replay engine.
//
// Validates a chain of board states for geometric correctness.
// Cards are opaque — this engine only sees stack sizes and
// locations. Operates on CardStack, not JSON.

import { CardStack } from "../core/card_stack";
import {
    validate_board_geometry,
    type BoardBounds,
    type GeometryError,
} from "./board_geometry";

export type CardStackMove = {
    stacks_to_remove: CardStack[];
    stacks_to_add: CardStack[];
};

export class GeometryReplay {
    bounds: BoardBounds;
    board: CardStack[];
    errors: GeometryError[];
    step: number;

    constructor(bounds: BoardBounds, initial_board: CardStack[]) {
        this.bounds = bounds;
        this.board = [...initial_board];
        this.errors = [];
        this.step = 0;
        this.validate("initial board");
    }

    apply_move(move: CardStackMove): void {
        this.step++;

        const remaining = this.board.filter(
            s => !move.stacks_to_remove.some(r => r.equals(s))
        );

        if (remaining.length + move.stacks_to_remove.length !== this.board.length) {
            this.errors.push({
                type: "out_of_bounds",
                message: `Step ${this.step}: some stacks_to_remove not found on board`,
                stack_indices: [],
            });
        }

        this.board = [...remaining, ...move.stacks_to_add];
        this.validate(`step ${this.step}`);
    }

    get_board(): CardStack[] {
        return this.board;
    }

    is_valid(): boolean {
        return this.errors.length === 0;
    }

    private validate(label: string): void {
        const json_stacks = this.board.map(s => s.toJSON());
        const geo_errors = validate_board_geometry(json_stacks, this.bounds);
        for (const err of geo_errors) {
            this.errors.push({
                ...err,
                message: `${label}: ${err.message}`,
            });
        }
    }
}
