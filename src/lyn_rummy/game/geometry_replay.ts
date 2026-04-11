// Geometry replay engine.
//
// Validates a chain of board states for geometric correctness.
// Cards are opaque — this engine only sees stack sizes and
// locations. Card suits and values are not examined.
//
// Usage:
//   const engine = new GeometryReplay(bounds, initial_board);
//   // engine validates initial_board on construction
//   engine.apply_move(move);  // validates after each move
//   engine.errors()           // accumulated errors (empty = valid)

import type { BoardLocation } from "../core/card_stack";
import {
    validate_board_geometry,
    stack_width,
    STACK_HEIGHT,
    type BoardBounds,
    type GeometryError,
} from "./board_geometry";

// A stack for geometry purposes — we only care about size and location.
export type GeoStack = {
    id: number;         // stable identifier for matching remove/add
    card_count: number;
    loc: BoardLocation;
};

// A move removes some stacks and adds new ones.
export type GeoMove = {
    stacks_to_remove: number[]; // ids of stacks to remove
    stacks_to_add: GeoStack[];  // new stacks (with locations)
};

export class GeometryReplay {
    bounds: BoardBounds;
    board: GeoStack[];
    errors: GeometryError[];
    step: number; // 0 = initial, increments per move

    constructor(bounds: BoardBounds, initial_board: GeoStack[]) {
        this.bounds = bounds;
        this.board = [...initial_board];
        this.errors = [];
        this.step = 0;
        this.validate(`initial board`);
    }

    apply_move(move: GeoMove): void {
        this.step++;

        // Remove stacks.
        const remove_set = new Set(move.stacks_to_remove);
        const remaining = this.board.filter(s => !remove_set.has(s.id));

        // Check that all removed stacks actually existed.
        const existing_ids = new Set(this.board.map(s => s.id));
        for (const id of move.stacks_to_remove) {
            if (!existing_ids.has(id)) {
                this.errors.push({
                    type: "out_of_bounds", // reusing error type
                    message: `Step ${this.step}: cannot remove stack ${id} — not on board`,
                    stack_indices: [],
                });
            }
        }

        // Check for duplicate IDs in added stacks.
        const new_ids = new Set<number>();
        const all_ids = new Set(remaining.map(s => s.id));
        for (const s of move.stacks_to_add) {
            if (all_ids.has(s.id) || new_ids.has(s.id)) {
                this.errors.push({
                    type: "overlap",
                    message: `Step ${this.step}: duplicate stack id ${s.id}`,
                    stack_indices: [],
                });
            }
            new_ids.add(s.id);
            all_ids.add(s.id);
        }

        // Build new board.
        this.board = [...remaining, ...move.stacks_to_add];

        this.validate(`step ${this.step}`);
    }

    get_board(): GeoStack[] {
        return this.board;
    }

    is_valid(): boolean {
        return this.errors.length === 0;
    }

    private validate(label: string): void {
        // Convert GeoStacks to the format validate_board_geometry expects.
        const json_stacks = this.board.map(s => ({
            board_cards: new Array(s.card_count).fill({
                card: { value: 1, suit: 0, origin_deck: 0 },
                state: 0,
            }),
            loc: s.loc,
        }));

        const geo_errors = validate_board_geometry(json_stacks, this.bounds);
        for (const err of geo_errors) {
            this.errors.push({
                ...err,
                message: `${label}: ${err.message}`,
            });
        }
    }
}
