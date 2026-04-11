// Game referee — stateless move validation.
//
// The referee is like an expert in the other room. You show them
// the board and the proposed move, they give you a ruling. They
// don't need to remember anything — the board is the state.
//
// Four validation stages:
//   1. Protocol  — is the JSON well-formed?
//   2. Geometry  — do stacks fit without illegal overlap?
//   3. Semantics — are all stacks valid card groups?
//   4. Inventory — are cards conserved? No creation or duplication.
//
// The referee is advisory, not restrictive. It does not enforce
// turn order, player identity, or how many moves per turn.

import { Card } from "../core/card";
import { CardStack, type HandCard } from "../core/card_stack";
import { validate_move } from "./protocol_validation";
import {
    validate_board_geometry,
    type BoardBounds,
} from "./board_geometry";
import { CardStackType } from "../core/stack_type";

export type RefereeError = {
    stage: "protocol" | "geometry" | "semantics" | "inventory";
    message: string;
};

export type RefereeMove = {
    board_before: CardStack[];
    stacks_to_remove: CardStack[];
    stacks_to_add: CardStack[];
    hand_cards_played?: HandCard[];
};

// The one entry point. Returns undefined if valid, or a
// RefereeError explaining which stage rejected and why.
export function validate_game_move(
    move: RefereeMove,
    bounds: BoardBounds,
): RefereeError | undefined {
    // Stage 1: Protocol — validate the JSON shape.
    const json_move = {
        stacks_to_remove: move.stacks_to_remove.map(s => s.toJSON()),
        stacks_to_add: move.stacks_to_add.map(s => s.toJSON()),
    };
    const protocol_errors = validate_move(json_move);
    if (protocol_errors.length > 0) {
        const detail = protocol_errors.map(e => `${e.path}: ${e.message}`).join("; ");
        return { stage: "protocol", message: detail };
    }

    // Compute the resulting board.
    const remaining = move.board_before.filter(
        s => !move.stacks_to_remove.some(r => r.equals(s)),
    );
    if (remaining.length + move.stacks_to_remove.length !== move.board_before.length) {
        return {
            stage: "inventory",
            message: "some stacks_to_remove not found on board",
        };
    }
    const board_after = [...remaining, ...move.stacks_to_add];

    // Stage 2: Geometry — stacks fit on the board.
    const geo_errors = validate_board_geometry(
        board_after.map(s => s.toJSON()),
        bounds,
    );
    if (geo_errors.length > 0) {
        return { stage: "geometry", message: geo_errors[0].message };
    }

    // Stage 3: Semantics — all stacks are valid card groups.
    for (const stack of board_after) {
        const st = stack.stack_type;
        if (st === CardStackType.INCOMPLETE ||
            st === CardStackType.BOGUS ||
            st === CardStackType.DUP) {
            return {
                stage: "semantics",
                message: `stack "${stack.str()}" is ${st}`,
            };
        }
    }

    // Stage 4: Inventory — cards are conserved.
    return check_inventory(move, board_after);
}

function check_inventory(
    move: RefereeMove,
    board_after: CardStack[],
): RefereeError | undefined {
    // Collect cards leaving the board.
    const removed_cards: Card[] = [];
    for (const stack of move.stacks_to_remove) {
        for (const bc of stack.board_cards) {
            removed_cards.push(bc.card);
        }
    }

    // Collect cards entering the board.
    const added_cards: Card[] = [];
    for (const stack of move.stacks_to_add) {
        for (const bc of stack.board_cards) {
            added_cards.push(bc.card);
        }
    }

    // Cards from hand.
    const from_hand: Card[] = [];
    if (move.hand_cards_played) {
        for (const hc of move.hand_cards_played) {
            from_hand.push(hc.card);
        }
    }

    // Every added card must come from either removed stacks
    // or the hand.
    const pool = [...removed_cards, ...from_hand];

    for (const card of added_cards) {
        const idx = pool.findIndex(c => c.equals(card));
        if (idx < 0) {
            return {
                stage: "inventory",
                message: `card ${card.str()} appeared on the board with no source`,
            };
        }
        pool.splice(idx, 1);
    }

    // Hand cards declared but never placed.
    for (const card of from_hand) {
        const still_in_pool = pool.findIndex(c => c.equals(card));
        if (still_in_pool >= 0) {
            return {
                stage: "inventory",
                message: `hand card ${card.str()} was declared played but not placed on the board`,
            };
        }
    }

    // No duplicate cards on the resulting board.
    const all_cards = flatten_board(board_after);
    const dup = find_duplicate(all_cards);
    if (dup !== undefined) {
        return {
            stage: "inventory",
            message: `duplicate card on board: ${dup.str()}`,
        };
    }

    return undefined;
}

function flatten_board(board: CardStack[]): Card[] {
    const cards: Card[] = [];
    for (const stack of board) {
        for (const bc of stack.board_cards) {
            cards.push(bc.card);
        }
    }
    return cards;
}

function find_duplicate(cards: Card[]): Card | undefined {
    for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
            if (cards[i].equals(cards[j])) {
                return cards[i];
            }
        }
    }
    return undefined;
}
