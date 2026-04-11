// Game referee — validates moves for machine-to-machine play.
//
// The referee enforces the physics of the card table:
//   1. Protocol  — is the JSON well-formed?
//   2. Geometry  — do stacks fit without illegal overlap?
//   3. Semantics — are all stacks valid card groups?
//   4. Inventory — are cards conserved? No creation or duplication.
//
// The referee is advisory, not restrictive. It does not enforce
// turn order, player identity, or how many moves per turn.
// LynRummy turns are complex (multiple moves, 1-4 players,
// or solitaire), so those social rules are a separate concern.

import { Card } from "../core/card";
import { CardStack, type HandCard } from "../core/card_stack";
import { validate_move } from "./protocol_validation";
import { GeometryReplay, type CardStackMove } from "./geometry_replay";
import { SemanticReplay } from "./semantic_replay";
import { type BoardBounds } from "./board_geometry";

export type RefereeError = {
    stage: "protocol" | "geometry" | "semantics" | "inventory";
    message: string;
};

// A move that includes hand card context.
// hand_cards_played is optional — pure board rearrangements
// don't involve the hand.
export type RefereeMove = CardStackMove & {
    hand_cards_played?: HandCard[];
};

export class GameReferee {
    private geo: GeometryReplay;
    private sem: SemanticReplay;
    private board_cards: Card[];  // flat list of all cards on the board
    move_count: number;

    constructor(bounds: BoardBounds, initial_board: CardStack[]) {
        this.geo = new GeometryReplay(bounds, initial_board);
        this.sem = new SemanticReplay(initial_board);
        this.board_cards = flatten_board(initial_board);
        this.move_count = 0;
    }

    // Returns undefined if valid, or a RefereeError if any stage rejects.
    apply_move(move: RefereeMove): RefereeError | undefined {
        this.move_count++;

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

        // Stage 2: Geometry — stacks fit on the board.
        this.geo.apply_move(move);
        if (!this.geo.is_valid()) {
            const latest = this.geo.errors[this.geo.errors.length - 1];
            return { stage: "geometry", message: latest.message };
        }

        // Stage 3: Semantics — all stacks are valid card groups.
        this.sem.apply_move(move);
        if (!this.sem.is_valid()) {
            const latest = this.sem.errors[this.sem.errors.length - 1];
            return { stage: "semantics", message: latest.message };
        }

        // Stage 4: Inventory — cards are conserved.
        const inv_error = this.check_inventory(move);
        if (inv_error !== undefined) {
            return inv_error;
        }

        return undefined;
    }

    get_board(): CardStack[] {
        // Both replay engines track the board; they should agree.
        return this.geo.get_board();
    }

    private check_inventory(move: RefereeMove): RefereeError | undefined {
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

        // Cards from hand that are being played.
        const from_hand: Card[] = [];
        if (move.hand_cards_played) {
            for (const hc of move.hand_cards_played) {
                from_hand.push(hc.card);
            }
        }

        // Every added card must come from either removed stacks
        // or the hand. Use a pool: start with removed + hand,
        // then consume one-by-one for each added card.
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

        // Any hand cards left in the pool means they were declared
        // as played but never placed on the board.
        for (const card of from_hand) {
            const still_in_pool = pool.findIndex(c => c.equals(card));
            if (still_in_pool >= 0) {
                return {
                    stage: "inventory",
                    message: `hand card ${card.str()} was declared played but not placed on the board`,
                };
            }
        }

        // Update the board card inventory.
        this.board_cards = flatten_board(this.get_board());

        // Check for duplicates on the board.
        const dup = find_duplicate(this.board_cards);
        if (dup !== undefined) {
            return {
                stage: "inventory",
                message: `duplicate card on board: ${dup.str()}`,
            };
        }

        return undefined;
    }
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
