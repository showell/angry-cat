// Semantic replay engine.
//
// Validates a chain of board states for card correctness.
// Locations are completely ignored — this engine only sees
// card values, suits, and origin decks.
//
// Validates that every stack is a valid type (pure run, set,
// or red/black run) with 3+ cards. No BOGUS, no INCOMPLETE.
//
// Usage:
//   const engine = new SemanticReplay(initial_board);
//   engine.apply_move(move);
//   engine.is_valid()

import { Card, type JsonCard } from "../core/card";
import { CardStackType, get_stack_type } from "../core/stack_type";

export type SemanticStack = {
    id: number;
    cards: JsonCard[];
};

export type SemanticMove = {
    stacks_to_remove: number[];
    stacks_to_add: SemanticStack[];
};

export type SemanticError = {
    message: string;
    stack_id: number;
    stack_type: CardStackType;
};

export class SemanticReplay {
    board: SemanticStack[];
    errors: SemanticError[];
    step: number;

    constructor(initial_board: SemanticStack[]) {
        this.board = [...initial_board];
        this.errors = [];
        this.step = 0;
        this.validate("initial board");
    }

    apply_move(move: SemanticMove): void {
        this.step++;

        // Check removed stacks exist.
        const existing_ids = new Set(this.board.map(s => s.id));
        for (const id of move.stacks_to_remove) {
            if (!existing_ids.has(id)) {
                this.errors.push({
                    message: `Step ${this.step}: cannot remove stack ${id} — not on board`,
                    stack_id: id,
                    stack_type: CardStackType.BOGUS,
                });
            }
        }

        // Remove and add.
        const remove_set = new Set(move.stacks_to_remove);
        this.board = [
            ...this.board.filter(s => !remove_set.has(s.id)),
            ...move.stacks_to_add,
        ];

        this.validate(`step ${this.step}`);
    }

    get_board(): SemanticStack[] {
        return this.board;
    }

    is_valid(): boolean {
        return this.errors.length === 0;
    }

    private validate(label: string): void {
        for (const stack of this.board) {
            const cards = stack.cards.map(c => Card.from_json(c));
            const stack_type = get_stack_type(cards);

            if (stack_type === CardStackType.INCOMPLETE ||
                stack_type === CardStackType.BOGUS ||
                stack_type === CardStackType.DUP) {
                this.errors.push({
                    message: `${label}: stack ${stack.id} is ${stack_type}`,
                    stack_id: stack.id,
                    stack_type,
                });
            }
        }
    }
}
