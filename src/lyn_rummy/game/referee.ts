// Game referee — stateless move and turn validation.
//
// The referee is like an expert in the other room. You show them
// the board and the proposed move, they give a ruling. They don't
// need to remember anything — the board is the state.
//
// Two entry points:
//
//   validate_game_move — rule on a single move during a turn.
//     The board can be messy mid-turn. Four stages:
//       1. Protocol  — is the JSON well-formed?
//       2. Geometry  — do stacks fit without illegal overlap?
//       3. Semantics — are all stacks valid card groups?
//       4. Inventory — are cards conserved?
//
//   validate_turn_complete — rule on whether the turn can end.
//     The board must be clean before we move on to the next
//     player. The referee checks geometry and semantics.
//
// The referee does not enforce turn order, player identity, or
// how many moves per turn. Those are social rules, not physics.
//
// Designed for easy porting to Go — plain loops, no closures,
// simple data flow.

import { Card } from "../core/card";
import { CardStack, type HandCard } from "../core/card_stack";
import { validate_move } from "./protocol_validation";
import { validate_board_geometry, type BoardBounds } from "./board_geometry";
import { CardStackType } from "../core/stack_type";

// --- Types ---

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

// --- Entry point ---

// Returns null if the move is valid, or a RefereeError if rejected.
//
// Checks protocol, geometry, and inventory — but NOT semantics.
// The board can be messy mid-turn (incomplete stacks, splits in
// progress). Semantics are enforced at turn boundaries via
// validate_turn_complete.
export function validate_game_move(
    move: RefereeMove,
    bounds: BoardBounds,
): RefereeError | undefined {

    // Stage 1: Protocol.
    const protocol_error = check_protocol(move);
    if (protocol_error) return protocol_error;

    // Compute the resulting board. This is shared by the
    // remaining stages, so we do it once.
    const board_after = compute_board_after(move);
    if (board_after === undefined) {
        return {
            stage: "inventory",
            message: "stacks_to_remove contains a stack not on the board",
        };
    }

    // Stage 2: Geometry.
    const geometry_error = check_geometry(board_after, bounds);
    if (geometry_error) return geometry_error;

    // Stage 3: Inventory.
    const inventory_error = check_inventory(move, board_after);
    if (inventory_error) return inventory_error;

    return undefined;
}

// --- Turn completion ---
//
// Called when a player wants to end their turn. The board must
// be clean: geometry valid and all stacks semantically correct.
// Mid-turn messiness is fine, but you can't hand off a dirty board.

export function validate_turn_complete(
    board: CardStack[],
    bounds: BoardBounds,
): RefereeError | undefined {

    // Geometry: no overlaps, everything in bounds.
    const geometry_error = check_geometry(board, bounds);
    if (geometry_error) return geometry_error;

    // Semantics: every stack is a valid group.
    const semantics_error = check_semantics(board);
    if (semantics_error) return semantics_error;

    return undefined;
}

// --- Stage 1: Protocol ---
//
// Serialize the move to JSON form and validate the shape.
// Catches type errors, missing fields, out-of-range values.

function check_protocol(move: RefereeMove): RefereeError | undefined {
    const json_remove = [];
    for (const stack of move.stacks_to_remove) {
        json_remove.push(stack.toJSON());
    }

    const json_add = [];
    for (const stack of move.stacks_to_add) {
        json_add.push(stack.toJSON());
    }

    const errors = validate_move({
        stacks_to_remove: json_remove,
        stacks_to_add: json_add,
    });

    if (errors.length > 0) {
        const parts = [];
        for (const e of errors) {
            parts.push(e.path + ": " + e.message);
        }
        return { stage: "protocol", message: parts.join("; ") };
    }

    return undefined;
}

// --- Compute resulting board ---
//
// Remove the stacks_to_remove, add the stacks_to_add.
// Returns undefined if any stack in stacks_to_remove is
// not found on the board.

function compute_board_after(move: RefereeMove): CardStack[] | undefined {
    const remaining: CardStack[] = [];
    const to_remove = [...move.stacks_to_remove];

    for (const board_stack of move.board_before) {
        const match_idx = find_matching_stack(to_remove, board_stack);
        if (match_idx >= 0) {
            to_remove.splice(match_idx, 1);
        } else {
            remaining.push(board_stack);
        }
    }

    // If any stacks_to_remove were not matched, the move is invalid.
    if (to_remove.length > 0) {
        return undefined;
    }

    const board_after: CardStack[] = [];
    for (const stack of remaining) {
        board_after.push(stack);
    }
    for (const stack of move.stacks_to_add) {
        board_after.push(stack);
    }
    return board_after;
}

function find_matching_stack(stacks: CardStack[], target: CardStack): number {
    for (let i = 0; i < stacks.length; i++) {
        if (stacks[i].equals(target)) {
            return i;
        }
    }
    return -1;
}

// --- Stage 2: Geometry ---
//
// Check that all stacks on the resulting board fit within bounds
// and don't overlap each other.

function check_geometry(
    board_after: CardStack[],
    bounds: BoardBounds,
): RefereeError | undefined {
    const json_stacks = [];
    for (const stack of board_after) {
        json_stacks.push(stack.toJSON());
    }

    const errors = validate_board_geometry(json_stacks, bounds);
    if (errors.length > 0) {
        return { stage: "geometry", message: errors[0].message };
    }

    return undefined;
}

// --- Stage 3: Semantics ---
//
// Every stack on the resulting board must be a valid card group:
// SET, PURE_RUN, or RED_BLACK_RUN. Reject INCOMPLETE, BOGUS, DUP.

function check_semantics(board_after: CardStack[]): RefereeError | undefined {
    for (const stack of board_after) {
        const stack_type = stack.stack_type;

        if (stack_type === CardStackType.INCOMPLETE ||
            stack_type === CardStackType.BOGUS ||
            stack_type === CardStackType.DUP) {
            return {
                stage: "semantics",
                message: "stack \"" + stack.str() + "\" is " + stack_type,
            };
        }
    }

    return undefined;
}

// --- Stage 4: Inventory ---
//
// Cards are conserved. Every card that appears on the resulting
// board must have a source: either it was already on the board
// (via stacks_to_remove) or it came from the player's hand.
//
// Also checks: no duplicate cards on the resulting board, and
// every declared hand card was actually placed.

function check_inventory(
    move: RefereeMove,
    board_after: CardStack[],
): RefereeError | undefined {

    // Build a pool of available cards: cards from removed stacks
    // plus cards from hand.
    const pool: Card[] = [];

    for (const stack of move.stacks_to_remove) {
        for (const board_card of stack.board_cards) {
            pool.push(board_card.card);
        }
    }

    const hand_cards: Card[] = [];
    if (move.hand_cards_played) {
        for (const hand_card of move.hand_cards_played) {
            hand_cards.push(hand_card.card);
            pool.push(hand_card.card);
        }
    }

    // Every card in stacks_to_add must consume one card from
    // the pool. If we can't find a match, the card appeared
    // from nowhere.
    for (const stack of move.stacks_to_add) {
        for (const board_card of stack.board_cards) {
            const idx = find_card_in_pool(pool, board_card.card);
            if (idx < 0) {
                return {
                    stage: "inventory",
                    message: "card " + board_card.card.str() + " appeared on the board with no source",
                };
            }
            pool.splice(idx, 1);
        }
    }

    // Any hand card still in the pool was declared played but
    // never placed on the board.
    for (const card of hand_cards) {
        if (find_card_in_pool(pool, card) >= 0) {
            return {
                stage: "inventory",
                message: "hand card " + card.str() + " was declared played but not placed on the board",
            };
        }
    }

    // No duplicate cards on the resulting board.
    const all_board_cards = collect_board_cards(board_after);
    const dup = find_first_duplicate(all_board_cards);
    if (dup !== undefined) {
        return {
            stage: "inventory",
            message: "duplicate card on board: " + dup.str(),
        };
    }

    return undefined;
}

// --- Helpers ---

function find_card_in_pool(pool: Card[], target: Card): number {
    for (let i = 0; i < pool.length; i++) {
        if (pool[i].equals(target)) {
            return i;
        }
    }
    return -1;
}

function collect_board_cards(board: CardStack[]): Card[] {
    const cards: Card[] = [];
    for (const stack of board) {
        for (const board_card of stack.board_cards) {
            cards.push(board_card.card);
        }
    }
    return cards;
}

function find_first_duplicate(cards: Card[]): Card | undefined {
    for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
            if (cards[i].equals(cards[j])) {
                return cards[i];
            }
        }
    }
    return undefined;
}
