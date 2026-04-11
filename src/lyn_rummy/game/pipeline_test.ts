// End-to-end validation pipeline test.
//
// Tests validate_game_move — the stateless referee function.
// You hand it the board and the proposed move, it gives a ruling.

import * as assert from "assert";
import { Card, CardValue, OriginDeck, Suit } from "../core/card";
import {
    BoardCard, BoardCardState, CardStack, HandCard, HandCardState,
    type JsonCardStack,
} from "../core/card_stack";
import { validate_move } from "./protocol_validation";
import { type BoardBounds } from "./board_geometry";
import { validate_game_move, type RefereeMove } from "./referee";

// --- Helpers ---

const bounds: BoardBounds = {
    max_width: 800,
    max_height: 600,
    margin: 5,
};

function bc(value: CardValue, suit: Suit, deck: OriginDeck = OriginDeck.DECK_ONE): BoardCard {
    return new BoardCard(new Card(value, suit, deck), BoardCardState.FIRMLY_ON_BOARD);
}

function fresh(value: CardValue, suit: Suit, deck: OriginDeck = OriginDeck.DECK_ONE): BoardCard {
    return new BoardCard(new Card(value, suit, deck), BoardCardState.FRESHLY_PLAYED);
}

function hc(value: CardValue, suit: Suit, deck: OriginDeck = OriginDeck.DECK_ONE): HandCard {
    return new HandCard(new Card(value, suit, deck), HandCardState.NORMAL);
}

// Shorthand: validate a move and return the error (or undefined).
function rule(board: CardStack[], move: Omit<RefereeMove, "board_before">) {
    return validate_game_move({ board_before: board, ...move }, bounds);
}

// --- Test: valid game sequence ---

function test_valid_game_sequence() {
    const run = new CardStack([
        bc(CardValue.FIVE, Suit.HEART),
        bc(CardValue.SIX, Suit.HEART),
        bc(CardValue.SEVEN, Suit.HEART),
    ], { top: 10, left: 10 });

    const set = new CardStack([
        bc(CardValue.KING, Suit.CLUB),
        bc(CardValue.KING, Suit.DIAMOND),
        bc(CardValue.KING, Suit.SPADE),
    ], { top: 10, left: 200 });

    let board = [run, set];

    // Move 1: extend the run with 8H from hand.
    const extended_run = new CardStack([
        bc(CardValue.FIVE, Suit.HEART),
        bc(CardValue.SIX, Suit.HEART),
        bc(CardValue.SEVEN, Suit.HEART),
        fresh(CardValue.EIGHT, Suit.HEART),
    ], { top: 10, left: 10 });

    let err = rule(board, {
        stacks_to_remove: [run],
        stacks_to_add: [extended_run],
        hand_cards_played: [hc(CardValue.EIGHT, Suit.HEART)],
    });
    assert.strictEqual(err, undefined, `Move 1: ${err?.message}`);
    board = [extended_run, set];

    // Move 2: extend the set with KH from hand.
    const extended_set = new CardStack([
        bc(CardValue.KING, Suit.CLUB),
        bc(CardValue.KING, Suit.DIAMOND),
        bc(CardValue.KING, Suit.SPADE),
        fresh(CardValue.KING, Suit.HEART),
    ], { top: 10, left: 200 });

    err = rule(board, {
        stacks_to_remove: [set],
        stacks_to_add: [extended_set],
        hand_cards_played: [hc(CardValue.KING, Suit.HEART)],
    });
    assert.strictEqual(err, undefined, `Move 2: ${err?.message}`);
    board = [extended_run, extended_set];

    // Move 3: place a new 3-card run from hand.
    const new_run = new CardStack([
        fresh(CardValue.ACE, Suit.SPADE),
        fresh(CardValue.TWO, Suit.SPADE),
        fresh(CardValue.THREE, Suit.SPADE),
    ], { top: 60, left: 10 });

    err = rule(board, {
        stacks_to_remove: [],
        stacks_to_add: [new_run],
        hand_cards_played: [
            hc(CardValue.ACE, Suit.SPADE),
            hc(CardValue.TWO, Suit.SPADE),
            hc(CardValue.THREE, Suit.SPADE),
        ],
    });
    assert.strictEqual(err, undefined, `Move 3: ${err?.message}`);
    board = [extended_run, extended_set, new_run];

    // Move 4: pure rearrangement — move the set.
    const moved_set = new CardStack(
        extended_set.board_cards,
        { top: 60, left: 200 },
    );

    err = rule(board, {
        stacks_to_remove: [extended_set],
        stacks_to_add: [moved_set],
    });
    assert.strictEqual(err, undefined, `Move 4: ${err?.message}`);
}

// --- Test: protocol rejects malformed JSON ---

function test_protocol_rejects_bad_json() {
    const bad_stack: JsonCardStack = {
        board_cards: [{
            card: { value: 5, suit: 99 as any, origin_deck: 0 },
            state: BoardCardState.FRESHLY_PLAYED,
        }],
        loc: { top: 60, left: 10 },
    };
    const errors = validate_move({
        stacks_to_remove: [],
        stacks_to_add: [bad_stack],
    });
    assert.ok(errors.length > 0, "Should reject bad suit");
    assert.ok(errors[0].message.includes("suit"));
}

// --- Test: geometry rejects overlap ---

function test_geometry_rejects_overlap() {
    const stack1 = new CardStack([
        bc(CardValue.ACE, Suit.HEART),
        bc(CardValue.TWO, Suit.HEART),
        bc(CardValue.THREE, Suit.HEART),
    ], { top: 10, left: 10 });

    const overlapping = new CardStack([
        fresh(CardValue.SEVEN, Suit.CLUB),
        fresh(CardValue.SEVEN, Suit.DIAMOND),
        fresh(CardValue.SEVEN, Suit.SPADE),
    ], { top: 10, left: 10 });

    const err = rule([stack1], {
        stacks_to_remove: [],
        stacks_to_add: [overlapping],
        hand_cards_played: [
            hc(CardValue.SEVEN, Suit.CLUB),
            hc(CardValue.SEVEN, Suit.DIAMOND),
            hc(CardValue.SEVEN, Suit.SPADE),
        ],
    });
    assert.ok(err !== undefined);
    assert.strictEqual(err!.stage, "geometry");
}

// --- Test: geometry rejects out of bounds ---

function test_geometry_rejects_out_of_bounds() {
    const off_board = new CardStack([
        fresh(CardValue.ACE, Suit.HEART),
        fresh(CardValue.TWO, Suit.HEART),
        fresh(CardValue.THREE, Suit.HEART),
    ], { top: 10, left: 900 });

    const err = rule([], {
        stacks_to_remove: [],
        stacks_to_add: [off_board],
        hand_cards_played: [
            hc(CardValue.ACE, Suit.HEART),
            hc(CardValue.TWO, Suit.HEART),
            hc(CardValue.THREE, Suit.HEART),
        ],
    });
    assert.ok(err !== undefined);
    assert.strictEqual(err!.stage, "geometry");
}

// --- Test: semantics rejects bogus ---

function test_semantics_rejects_bogus() {
    const bogus = new CardStack([
        fresh(CardValue.ACE, Suit.HEART),
        fresh(CardValue.FIVE, Suit.CLUB),
        fresh(CardValue.KING, Suit.DIAMOND),
    ], { top: 10, left: 10 });

    const err = rule([], {
        stacks_to_remove: [],
        stacks_to_add: [bogus],
        hand_cards_played: [
            hc(CardValue.ACE, Suit.HEART),
            hc(CardValue.FIVE, Suit.CLUB),
            hc(CardValue.KING, Suit.DIAMOND),
        ],
    });
    assert.ok(err !== undefined);
    assert.strictEqual(err!.stage, "semantics");
}

// --- Test: semantics rejects incomplete ---

function test_semantics_rejects_incomplete() {
    const incomplete = new CardStack([
        fresh(CardValue.ACE, Suit.HEART),
        fresh(CardValue.TWO, Suit.HEART),
    ], { top: 10, left: 10 });

    const err = rule([], {
        stacks_to_remove: [],
        stacks_to_add: [incomplete],
        hand_cards_played: [
            hc(CardValue.ACE, Suit.HEART),
            hc(CardValue.TWO, Suit.HEART),
        ],
    });
    assert.ok(err !== undefined);
    assert.strictEqual(err!.stage, "semantics");
}

// --- Test: semantics rejects dup set ---

function test_semantics_rejects_dup_set() {
    const dup_set = new CardStack([
        fresh(CardValue.SEVEN, Suit.HEART),
        fresh(CardValue.SEVEN, Suit.HEART),
        fresh(CardValue.SEVEN, Suit.CLUB),
    ], { top: 10, left: 10 });

    const err = rule([], {
        stacks_to_remove: [],
        stacks_to_add: [dup_set],
        hand_cards_played: [
            hc(CardValue.SEVEN, Suit.HEART),
            hc(CardValue.SEVEN, Suit.HEART),
            hc(CardValue.SEVEN, Suit.CLUB),
        ],
    });
    assert.ok(err !== undefined);
    assert.strictEqual(err!.stage, "semantics");
}

// --- Test: valid split ---

function test_split_through_pipeline() {
    const long_run = new CardStack([
        bc(CardValue.THREE, Suit.DIAMOND),
        bc(CardValue.FOUR, Suit.DIAMOND),
        bc(CardValue.FIVE, Suit.DIAMOND),
        bc(CardValue.SIX, Suit.DIAMOND),
        bc(CardValue.SEVEN, Suit.DIAMOND),
        bc(CardValue.EIGHT, Suit.DIAMOND),
    ], { top: 10, left: 10 });

    const left = new CardStack([
        bc(CardValue.THREE, Suit.DIAMOND),
        bc(CardValue.FOUR, Suit.DIAMOND),
        bc(CardValue.FIVE, Suit.DIAMOND),
    ], { top: 10, left: 10 });

    const right = new CardStack([
        bc(CardValue.SIX, Suit.DIAMOND),
        bc(CardValue.SEVEN, Suit.DIAMOND),
        bc(CardValue.EIGHT, Suit.DIAMOND),
    ], { top: 10, left: 200 });

    const err = rule([long_run], {
        stacks_to_remove: [long_run],
        stacks_to_add: [left, right],
    });
    assert.strictEqual(err, undefined, `Split: ${err?.message}`);
}

// --- Test: stages are independent ---

function test_stages_are_independent() {
    const valid_run = new CardStack([
        bc(CardValue.ACE, Suit.CLUB),
        bc(CardValue.TWO, Suit.CLUB),
        bc(CardValue.THREE, Suit.CLUB),
    ], { top: 10, left: 10 });

    const bogus = new CardStack([
        bc(CardValue.ACE, Suit.CLUB),
        fresh(CardValue.FIVE, Suit.DIAMOND),
        fresh(CardValue.KING, Suit.HEART),
    ], { top: 10, left: 10 });

    const err = rule([valid_run], {
        stacks_to_remove: [valid_run],
        stacks_to_add: [bogus],
        hand_cards_played: [
            hc(CardValue.FIVE, Suit.DIAMOND),
            hc(CardValue.KING, Suit.HEART),
        ],
    });
    assert.ok(err !== undefined);
    assert.strictEqual(err!.stage, "semantics",
        `Should fail at semantics, not ${err!.stage}`);
}

// --- Inventory tests ---

function test_inventory_rejects_card_from_nowhere() {
    const run = new CardStack([
        fresh(CardValue.ACE, Suit.HEART),
        fresh(CardValue.TWO, Suit.HEART),
        fresh(CardValue.THREE, Suit.HEART),
    ], { top: 10, left: 10 });

    const err = rule([], {
        stacks_to_remove: [],
        stacks_to_add: [run],
        hand_cards_played: [
            hc(CardValue.ACE, Suit.HEART),
            hc(CardValue.TWO, Suit.HEART),
        ],
    });
    assert.ok(err !== undefined);
    assert.strictEqual(err!.stage, "inventory");
    assert.ok(err!.message.includes("no source"));
}

function test_inventory_rejects_unplaced_hand_card() {
    const run = new CardStack([
        fresh(CardValue.ACE, Suit.HEART),
        fresh(CardValue.TWO, Suit.HEART),
        fresh(CardValue.THREE, Suit.HEART),
    ], { top: 10, left: 10 });

    const err = rule([], {
        stacks_to_remove: [],
        stacks_to_add: [run],
        hand_cards_played: [
            hc(CardValue.ACE, Suit.HEART),
            hc(CardValue.TWO, Suit.HEART),
            hc(CardValue.THREE, Suit.HEART),
            hc(CardValue.FOUR, Suit.HEART),
        ],
    });
    assert.ok(err !== undefined);
    assert.strictEqual(err!.stage, "inventory");
    assert.ok(err!.message.includes("not placed"));
}

function test_inventory_allows_rearrangement() {
    const run = new CardStack([
        bc(CardValue.ACE, Suit.CLUB),
        bc(CardValue.TWO, Suit.CLUB),
        bc(CardValue.THREE, Suit.CLUB),
        bc(CardValue.FOUR, Suit.CLUB),
        bc(CardValue.FIVE, Suit.CLUB),
        bc(CardValue.SIX, Suit.CLUB),
    ], { top: 10, left: 10 });

    const left = new CardStack([
        bc(CardValue.ACE, Suit.CLUB),
        bc(CardValue.TWO, Suit.CLUB),
        bc(CardValue.THREE, Suit.CLUB),
    ], { top: 10, left: 10 });

    const right = new CardStack([
        bc(CardValue.FOUR, Suit.CLUB),
        bc(CardValue.FIVE, Suit.CLUB),
        bc(CardValue.SIX, Suit.CLUB),
    ], { top: 10, left: 200 });

    const err = rule([run], {
        stacks_to_remove: [run],
        stacks_to_add: [left, right],
    });
    assert.strictEqual(err, undefined, `Rearrangement: ${err?.message}`);
}

function test_inventory_rejects_board_duplicate() {
    const run = new CardStack([
        bc(CardValue.ACE, Suit.HEART),
        bc(CardValue.TWO, Suit.HEART),
        bc(CardValue.THREE, Suit.HEART),
    ], { top: 10, left: 10 });

    const set_with_dup = new CardStack([
        fresh(CardValue.ACE, Suit.HEART),
        fresh(CardValue.ACE, Suit.CLUB),
        fresh(CardValue.ACE, Suit.DIAMOND),
    ], { top: 60, left: 10 });

    const err = rule([run], {
        stacks_to_remove: [],
        stacks_to_add: [set_with_dup],
        hand_cards_played: [
            hc(CardValue.ACE, Suit.HEART),
            hc(CardValue.ACE, Suit.CLUB),
            hc(CardValue.ACE, Suit.DIAMOND),
        ],
    });
    assert.ok(err !== undefined);
    assert.strictEqual(err!.stage, "inventory");
    assert.ok(err!.message.includes("duplicate"));
}

function test_inventory_rejects_new_cards_without_hand() {
    const run = new CardStack([
        fresh(CardValue.ACE, Suit.HEART),
        fresh(CardValue.TWO, Suit.HEART),
        fresh(CardValue.THREE, Suit.HEART),
    ], { top: 10, left: 10 });

    const err = rule([], {
        stacks_to_remove: [],
        stacks_to_add: [run],
    });
    assert.ok(err !== undefined);
    assert.strictEqual(err!.stage, "inventory");
}

function test_inventory_rejects_missing_remove() {
    // stacks_to_remove references a stack not on the board.
    const phantom = new CardStack([
        bc(CardValue.ACE, Suit.HEART),
        bc(CardValue.TWO, Suit.HEART),
        bc(CardValue.THREE, Suit.HEART),
    ], { top: 10, left: 10 });

    const err = rule([], {
        stacks_to_remove: [phantom],
        stacks_to_add: [],
    });
    assert.ok(err !== undefined);
    assert.strictEqual(err!.stage, "inventory");
    assert.ok(err!.message.includes("not found"));
}

// --- Run all ---

test_valid_game_sequence();
test_protocol_rejects_bad_json();
test_geometry_rejects_overlap();
test_geometry_rejects_out_of_bounds();
test_semantics_rejects_bogus();
test_semantics_rejects_incomplete();
test_semantics_rejects_dup_set();
test_split_through_pipeline();
test_stages_are_independent();
test_inventory_rejects_card_from_nowhere();
test_inventory_rejects_unplaced_hand_card();
test_inventory_allows_rearrangement();
test_inventory_rejects_board_duplicate();
test_inventory_rejects_new_cards_without_hand();
test_inventory_rejects_missing_remove();

console.log("pipeline: all tests passed");
