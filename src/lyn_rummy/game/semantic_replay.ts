// Semantic replay engine.
//
// Validates a chain of board states for card correctness.
// Locations are completely ignored — this engine only sees
// card values, suits, and origin decks.
// Operates on CardStack, not JSON.

import { CardStack } from "../core/card_stack";
import { CardStackType } from "../core/stack_type";
import type { CardStackMove } from "./geometry_replay";

export type SemanticError = {
    message: string;
    stack_type: CardStackType;
};

export class SemanticReplay {
    board: CardStack[];
    errors: SemanticError[];
    step: number;

    constructor(initial_board: CardStack[]) {
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
                message: `Step ${this.step}: some stacks_to_remove not found on board`,
                stack_type: CardStackType.BOGUS,
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
        for (const stack of this.board) {
            const st = stack.stack_type;

            if (st === CardStackType.INCOMPLETE ||
                st === CardStackType.BOGUS ||
                st === CardStackType.DUP) {
                this.errors.push({
                    message: `${label}: stack "${stack.str()}" at (${stack.loc.left},${stack.loc.top}) is ${st}`,
                    stack_type: st,
                });
            }
        }
    }
}
